// `ralphy publish --revise` — zero-network unit tests.
//
// Postiz exposes no post-edit endpoint, so a revise is delete-then-recreate
// at the ledger's recorded schedule time. Covers: the happy path (delete →
// create with the SAME date + ledger append + `revisedFrom` provenance), the
// no-prior-record refusal, the already-live refusal (scheduleAt in the past),
// and the delete-404 tolerance (an earlier revise's create failed after its
// delete — the retry must recreate instead of aborting).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { workspaceUnitsDir } from "../../cli/lib/paths";
import { revisePublishUnit, readUnitManifest } from "../../cli/lib/publish/publish";
import { appendPublishLedger, readPublishLedger, publishIdempotencyKey } from "../../cli/lib/publish/ledger";

const WS = "revise-ws";
const SLUG = "wire-fixture";
const FUTURE = "2099-01-01T13:00:00.000Z";
const PAST = "2001-01-01T13:00:00.000Z";

const INTEGRATIONS = [{ id: "int-ig-1", identifier: "instagram-standalone", name: "IG" }];

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-publish-revise");
  for (const k of ["POSTIZ_API_KEY", "POSTIZ_API_URL", "POSTIZ_BASE_URL"]) savedEnv[k] = process.env[k];
  process.env.POSTIZ_API_KEY = "test-key";
  process.env.POSTIZ_BASE_URL = "http://localhost:4200";
  delete process.env.POSTIZ_API_URL;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

function seedWorkspaceUnit(): string {
  const unitDir = path.join(workspaceUnitsDir(WS), SLUG);
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(
    path.join(unitDir, "unit.json"),
    JSON.stringify({
      slug: SLUG,
      format: "carousel",
      media: ["slide-01.png"],
      created: new Date().toISOString(),
      title: "Wire fixture",
      caption: {
        platform: {
          tiktok: "hook line",
          reels: "REVISED seo caption body with the backlink alecs5am.com/ralphy",
          shorts: "Wire fixture title",
        },
        hashtags: ["#ai", "#tech"],
        language: "English",
      },
    }),
  );
  fs.writeFileSync(path.join(unitDir, "slide-01.png"), "png-bytes");
  return unitDir;
}

function seedLedger(scheduleAt: string | null, postId = "post-old-1"): void {
  appendPublishLedger(WS, {
    key: publishIdempotencyKey({ workspace: WS, projectId: `workspace:${WS}`, slug: SLUG, target: "instagram" }),
    project: `workspace:${WS}`,
    slug: SLUG,
    target: "instagram",
    postId,
    scheduleAt,
    status: "scheduled",
  });
}

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

/** Mock Postiz API recording calls; `deleteStatus` shapes the DELETE reply. */
function mockPostiz(opts: { deleteStatus?: number; failCreate?: boolean } = {}) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.includes("/integrations")) return json(INTEGRATIONS);
    if (url.includes("/upload")) return json({ id: "media-1", path: "/uploads/media-1.png" });
    if (method === "DELETE" && url.includes("/posts/")) {
      const status = opts.deleteStatus ?? 200;
      return status === 200 ? json({ id: "post-old-1" }) : new Response("not found", { status });
    }
    if (method === "POST" && url.includes("/posts")) {
      if (opts.failCreate) return new Response("boom", { status: 500 });
      return json([{ id: "post-new-1" }]);
    }
    throw new Error(`unrouted ${method} ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("revisePublishUnit", () => {
  test("deletes the old post and recreates at the SAME schedule time", async () => {
    const unitDir = seedWorkspaceUnit();
    seedLedger(FUTURE);
    const { fetchImpl, calls } = mockPostiz();

    const result = await revisePublishUnit({
      workspaceId: WS,
      slug: SLUG,
      targets: ["instagram"],
      fetchImpl,
    });

    const row = result.results[0]!;
    expect(row.status).toBe("scheduled");
    expect(row.postId).toBe("post-new-1");
    expect(row.scheduleAt).toBe(FUTURE);
    expect(row.revisedFrom).toBe("post-old-1");

    const del = calls.find((c) => c.method === "DELETE");
    expect(del?.url).toContain("/posts/post-old-1");
    const create = calls.find((c) => c.method === "POST" && c.url.includes("/posts"));
    expect(create?.body).toMatchObject({ type: "schedule", date: FUTURE });
    // Delete fires BEFORE create (fail-closed: never a double-post).
    expect(calls.indexOf(del!)).toBeLessThan(calls.indexOf(create!));

    // Ledger: a NEW row with the new postId; the old row is untouched.
    const rows = readPublishLedger(WS).filter((r) => r.target === "instagram");
    expect(rows.length).toBe(2);
    expect(rows[1]!.postId).toBe("post-new-1");
    expect(rows[1]!.scheduleAt).toBe(FUTURE);

    // Provenance: append-only record carrying revisedFrom.
    const manifest = await readUnitManifest(unitDir);
    const rec = manifest!.publish![0]!;
    expect(rec.status).toBe("scheduled");
    expect(rec.revisedFrom).toBe("post-old-1");
  });

  test("refuses a target with no prior publish record", async () => {
    seedWorkspaceUnit();
    const { fetchImpl, calls } = mockPostiz();

    const result = await revisePublishUnit({ workspaceId: WS, slug: SLUG, targets: ["instagram"], fetchImpl });

    expect(result.allFailed).toBe(true);
    expect(result.results[0]!.error).toContain("no prior scheduled publish");
    // Nothing was deleted or created.
    expect(calls.some((c) => c.method === "DELETE" || (c.method === "POST" && c.url.includes("/posts")))).toBe(false);
  });

  test("refuses a post that is already live (scheduleAt in the past)", async () => {
    seedWorkspaceUnit();
    seedLedger(PAST);
    const { fetchImpl, calls } = mockPostiz();

    const result = await revisePublishUnit({ workspaceId: WS, slug: SLUG, targets: ["instagram"], fetchImpl });

    expect(result.allFailed).toBe(true);
    expect(result.results[0]!.error).toContain("already live");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("tolerates delete 404 (already deleted) and still recreates", async () => {
    seedWorkspaceUnit();
    seedLedger(FUTURE);
    const { fetchImpl } = mockPostiz({ deleteStatus: 404 });

    const result = await revisePublishUnit({ workspaceId: WS, slug: SLUG, targets: ["instagram"], fetchImpl });

    expect(result.results[0]!.status).toBe("scheduled");
    expect(result.results[0]!.postId).toBe("post-new-1");
  });

  test("a failed create lands as a failed row with revisedFrom (retryable)", async () => {
    seedWorkspaceUnit();
    seedLedger(FUTURE);
    const { fetchImpl } = mockPostiz({ failCreate: true });

    const result = await revisePublishUnit({ workspaceId: WS, slug: SLUG, targets: ["instagram"], fetchImpl });

    expect(result.allFailed).toBe(true);
    const row = result.results[0]!;
    expect(row.status).toBe("failed");
    expect(row.revisedFrom).toBe("post-old-1");
    // No new blocking ledger row was appended for the failed create.
    const rows = readPublishLedger(WS).filter((r) => r.target === "instagram");
    expect(rows.length).toBe(1);
  });
});
