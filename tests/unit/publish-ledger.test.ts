// Publish exactly-once idempotency ledger (#531) — zero-network unit tests.
//
// HTTP is injected (the connector's fetchImpl seam); the mock counts /posts
// calls so a re-fire is observable. Covers: key-derivation stability (same
// inputs → same key, NOT timestamp-dependent), double-publish blocked, the
// crash-between-accept-and-record path (append the ledger by hand → re-run
// skips), partial multi-target retry (2/3 recorded → retry publishes only the
// 3rd), and cadence-time stability on re-run (recorded scheduleAt reused).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { publishUnit } from "../../cli/lib/publish/publish";
import {
  publishIdempotencyKey,
  readPublishLedger,
  appendPublishLedger,
  findLedgerEntry,
} from "../../cli/lib/publish/ledger";
import type { UnitManifest } from "../../cli/lib/schemas/unit";

const PROJECT = "publish-fixture-531";
const SLUG = "hero-cut";
const WS = "default";

const INTEGRATIONS = [
  { id: "int-yt-1", identifier: "youtube" },
  { id: "int-tt-1", identifier: "tiktok" },
  { id: "int-ig-1", identifier: "instagram-standalone" },
  { id: "int-x-1", identifier: "x" },
];

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-publish-531");
  for (const k of ["POSTIZ_API_KEY", "POSTIZ_BASE_URL"]) savedEnv[k] = process.env[k];
  process.env.POSTIZ_API_KEY = "test-key";
  process.env.POSTIZ_BASE_URL = "http://localhost:4200";
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

function seedUnit(manifest: Partial<UnitManifest> = {}): string {
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Pub", workspace: WS } } }),
  );
  const unitDir = path.join(projectDir(PROJECT), "units", SLUG);
  fs.mkdirSync(unitDir, { recursive: true });
  const full = {
    slug: SLUG,
    format: "video",
    media: ["final.mp4"],
    created: new Date().toISOString(),
    title: "Hero cut",
    blurb: "A demo unit.",
    ...manifest,
  };
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(full, null, 2));
  for (const m of full.media as string[]) fs.writeFileSync(path.join(unitDir, m), "media-bytes");
  return unitDir;
}

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

/** Mock Postiz; `postCount` counts POST /posts fires so a skip is observable. */
function mockPostiz(opts: { failIds?: string[] } = {}) {
  const failIds = new Set(opts.failIds ?? []);
  let postCount = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (url.includes("/integrations")) return json(INTEGRATIONS);
    if (url.includes("/upload")) return json({ id: "media-1", path: "/uploads/media-1.mp4" });
    if (url.includes("/posts")) {
      postCount++;
      const intId = body?.posts?.[0]?.integration?.id as string;
      if (failIds.has(intId)) return new Response("boom", { status: 500 });
      return json([{ id: `post-${intId}` }]);
    }
    throw new Error(`unrouted ${url}`);
  }) as typeof fetch;
  return { fetchImpl, posts: () => postCount };
}

// ─── key derivation ───────────────────────────────────────────────────────────

describe("publishIdempotencyKey", () => {
  test("same inputs → same key (stable, NOT timestamp/run-id dependent)", () => {
    const a = publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "tiktok" });
    const b = publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "tiktok" });
    expect(a).toBe(b);
    expect(a).toBe(`${WS}|${PROJECT}/${SLUG}|tiktok|default`);
  });

  test("slot (calendar entryId) discriminates; absence → 'default'", () => {
    const withSlot = publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "x", slot: "entry-42" });
    const noSlot = publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "x" });
    expect(withSlot).toBe(`${WS}|${PROJECT}/${SLUG}|x|entry-42`);
    expect(withSlot).not.toBe(noSlot);
  });

  test("key contains no digits from a clock — re-deriving after a delay is identical", async () => {
    const k1 = publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "youtube" });
    await new Promise((r) => setTimeout(r, 5));
    const k2 = publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "youtube" });
    expect(k1).toBe(k2);
  });
});

// ─── double-publish blocked ─────────────────────────────────────────────────

describe("exactly-once", () => {
  test("second publish of the same (unit, target) is idempotent-skipped — platform not re-fired", async () => {
    seedUnit();
    const m1 = mockPostiz();
    const first = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["tiktok"], fetchImpl: m1.fetchImpl });
    expect(first.results[0]!.status).toBe("published");
    expect(m1.posts()).toBe(1);

    const m2 = mockPostiz();
    const second = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["tiktok"], fetchImpl: m2.fetchImpl });
    expect(second.results[0]!.status).toBe("idempotent-skip");
    expect(second.results[0]!.postId).toBe("post-int-tt-1");
    expect(second.allFailed).toBe(false);
    // The platform was NOT called on the re-run.
    expect(m2.posts()).toBe(0);

    // Ledger holds exactly one entry for the (key, target).
    expect(readPublishLedger(WS).filter((e) => e.target === "tiktok").length).toBe(1);
  });

  test("the skip is recorded in the unit's publish provenance (append-only)", async () => {
    const unitDir = seedUnit();
    await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["x"], fetchImpl: mockPostiz().fetchImpl });
    await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["x"], fetchImpl: mockPostiz().fetchImpl });
    const manifest = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    const statuses = manifest.publish.map((p: { status: string }) => p.status);
    expect(statuses).toEqual(["published", "idempotent-skip"]);
  });
});

// ─── crash-between-accept-and-record ─────────────────────────────────────────

describe("crash between platform-accept and manifest-record", () => {
  test("a ledger entry (belt) makes the re-run skip even if the manifest never got the record", async () => {
    seedUnit();
    // Simulate: Postiz accepted the post, the ledger belt landed, then the
    // process died before appendPublishRecords. Only the ledger has the record.
    appendPublishLedger(WS, {
      key: publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "instagram" }),
      project: PROJECT,
      slug: SLUG,
      target: "instagram",
      postId: "post-int-ig-1",
      scheduleAt: null,
      status: "published",
    });
    const m = mockPostiz();
    const res = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["instagram"], fetchImpl: m.fetchImpl });
    expect(res.results[0]!.status).toBe("idempotent-skip");
    expect(res.results[0]!.postId).toBe("post-int-ig-1");
    expect(m.posts()).toBe(0);
  });

  test("a prior FAILED ledger entry does NOT block a retry", async () => {
    seedUnit();
    appendPublishLedger(WS, {
      key: publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "tiktok" }),
      project: PROJECT,
      slug: SLUG,
      target: "tiktok",
      postId: null,
      scheduleAt: null,
      status: "failed",
    });
    const m = mockPostiz();
    const res = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["tiktok"], fetchImpl: m.fetchImpl });
    expect(res.results[0]!.status).toBe("published");
    expect(m.posts()).toBe(1);
    expect(findLedgerEntry(WS, publishIdempotencyKey({ workspace: WS, projectId: PROJECT, slug: SLUG, target: "tiktok" }), "tiktok")!.status).toBe("published");
  });
});

// ─── partial multi-target retry ──────────────────────────────────────────────

describe("partial multi-target retry", () => {
  test("2/3 succeed then a retry publishes ONLY the missing (failed) target", async () => {
    seedUnit();
    // First run: youtube fails, tiktok + x succeed → 2/3 recorded.
    const m1 = mockPostiz({ failIds: ["int-yt-1"] });
    const first = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["youtube", "tiktok", "x"],
      fetchImpl: m1.fetchImpl,
    });
    const byTarget1 = Object.fromEntries(first.results.map((r) => [r.target, r.status]));
    expect(byTarget1).toEqual({ youtube: "failed", tiktok: "published", x: "published" });
    // Only the two successes are in the ledger (a failure never blocks).
    expect(readPublishLedger(WS).filter((e) => e.status !== "failed").map((e) => e.target).sort()).toEqual(["tiktok", "x"]);

    // Retry the full target set; youtube now succeeds. The 2 already-done skip.
    const m2 = mockPostiz();
    const second = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["youtube", "tiktok", "x"],
      fetchImpl: m2.fetchImpl,
    });
    const byTarget2 = Object.fromEntries(second.results.map((r) => [r.target, r.status]));
    expect(byTarget2).toEqual({ youtube: "published", tiktok: "idempotent-skip", x: "idempotent-skip" });
    // Only ONE platform call on the retry — youtube.
    expect(m2.posts()).toBe(1);
  });
});

// ─── cadence-time stability on re-run (#525 interplay) ───────────────────────

describe("cadence-time stability", () => {
  test("a re-run of an already-scheduled post reuses the recorded scheduleAt, not a resample", async () => {
    seedUnit();
    const at = "2026-07-20T10:00:00.000Z";
    const first = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["youtube"],
      scheduleAt: at,
      slot: "entry-cadence",
      fetchImpl: mockPostiz().fetchImpl,
    });
    expect(first.results[0]!.status).toBe("scheduled");
    expect(first.results[0]!.scheduleAt).toBe(at);

    // Re-run with a DIFFERENT sampled schedule time (as #525 would resample):
    // the idempotent-skip must preserve the ORIGINAL recorded time.
    const resampled = "2026-07-20T13:37:00.000Z";
    const second = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["youtube"],
      scheduleAt: resampled,
      slot: "entry-cadence",
      fetchImpl: mockPostiz().fetchImpl,
    });
    expect(second.results[0]!.status).toBe("idempotent-skip");
    expect(second.results[0]!.scheduleAt).toBe(at);
    expect(second.results[0]!.scheduleAt).not.toBe(resampled);
  });
});
