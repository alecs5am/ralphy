// Postiz publish path (#501) — zero-network unit tests.
//
// HTTP is injected (the connector's fetchImpl / ExecutorContext.fetchImpl
// seam); POSTIZ_API_KEY + POSTIZ_BASE_URL are set per test (the connector
// reads them inside its own sanctioned file). Covers: per-platform payload
// mapping, integration-account binding, schedule passthrough (--at + the
// calendar-slot in-port), partial-failure semantics (one fails → per-target
// statuses, all fail → throws), the readiness gate (refusal + logged --force
// bypass), and the APPEND-only unit.json publish provenance.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import {
  parseTargets,
  formatHashtags,
  captionForTarget,
  settingsForTarget,
  bindIntegrations,
  buildPostEntry,
} from "../../cli/lib/publish/mapping";
import {
  publishUnit,
  checkPublishReadiness,
  appendPublishRecords,
  unitDirFor,
  readUnitManifest,
} from "../../cli/lib/publish/publish";
import type { UnitManifest } from "../../cli/lib/schemas/unit";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "publish-fixture-501";
const SLUG = "hero-cut";
const WS = "default";

const CAPTION = {
  platform: {
    tiktok: "POV: the unit publishes itself",
    reels: "One unit, four platforms. The publish node does the last mile.",
    shorts: "Publish once, post everywhere",
  },
  hashtags: ["#fyp", "contentfarm", "#viral", "#howto", "#ai", "#extra"],
  language: "English",
};

const INTEGRATIONS = [
  { id: "int-yt-1", identifier: "youtube", name: "Main channel" },
  { id: "int-tt-1", identifier: "tiktok", name: "Main tiktok" },
  { id: "int-ig-1", identifier: "instagram-standalone", name: "IG" },
  { id: "int-x-1", identifier: "x", name: "X account" },
  { id: "int-dead", identifier: "tiktok", disabled: true },
];

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-publish-501");
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

/** Seed the registry + a unit dir (manifest + dummy media files). */
function seedUnit(manifest: Partial<UnitManifest> = {}): string {
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Pub", workspace: "default" } } }),
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
    caption: CAPTION,
    ...manifest,
  };
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(full, null, 2));
  for (const m of full.media as string[]) fs.writeFileSync(path.join(unitDir, m), "media-bytes");
  return unitDir;
}

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

/** Mock Postiz API: integrations + upload + posts (posts fail for failIds). */
function mockPostiz(opts: { failIds?: string[] } = {}) {
  const failIds = new Set(opts.failIds ?? []);
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url.includes("/integrations")) return json(INTEGRATIONS);
    if (url.includes("/upload")) return json({ id: "media-1", path: "/uploads/media-1.mp4" });
    if (url.includes("/posts")) {
      const intId = body?.posts?.[0]?.integration?.id as string;
      if (failIds.has(intId)) return new Response("boom", { status: 500 });
      return json([{ id: `post-${intId}` }]);
    }
    throw new Error(`unrouted ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const manifestFixture = (over: Partial<UnitManifest> = {}): UnitManifest =>
  ({
    slug: SLUG,
    format: "video",
    media: ["final.mp4"],
    created: new Date().toISOString(),
    title: "Hero cut",
    blurb: "A demo unit.",
    caption: CAPTION,
    ...over,
  }) as UnitManifest;

// ─── mapping ─────────────────────────────────────────────────────────────────

describe("payload mapping per platform", () => {
  const m = manifestFixture();

  test("parseTargets validates + dedups", () => {
    expect(parseTargets("tiktok, youtube,tiktok")).toEqual(["tiktok", "youtube"]);
    expect(() => parseTargets("myspace")).toThrow(/not a publish target/);
  });

  test("formatHashtags enforces # and caps", () => {
    expect(formatHashtags(["#a", "b"], 2)).toBe("#a #b");
    expect(formatHashtags(undefined)).toBe("");
  });

  test("youtube: reels body as content + shorts title in settings", () => {
    expect(captionForTarget("youtube", m)).toBe(CAPTION.platform.reels);
    expect(settingsForTarget("youtube", m)).toEqual({ title: CAPTION.platform.shorts });
  });

  test("tiktok: hook + capped inline tags", () => {
    const c = captionForTarget("tiktok", m);
    expect(c).toStartWith(CAPTION.platform.tiktok);
    expect(c).toContain("#fyp #contentfarm #viral #howto #ai");
    expect(c).not.toContain("#extra");
  });

  test("instagram: full reels caption + full tag set", () => {
    const c = captionForTarget("instagram", m);
    expect(c).toContain(CAPTION.platform.reels);
    expect(c).toContain("#extra");
  });

  test("x: hook + at most 3 tags", () => {
    const c = captionForTarget("x", m);
    expect(c).toBe(`${CAPTION.platform.tiktok} #fyp #contentfarm #viral`);
  });

  test("no caption falls back to title/blurb copy", () => {
    const bare = manifestFixture({ caption: undefined });
    expect(captionForTarget("tiktok", bare)).toBe("Hero cut — A demo unit.");
    expect(settingsForTarget("youtube", bare)).toEqual({ title: "Hero cut" });
  });

  test("buildPostEntry attaches media refs + settings", () => {
    const entry = buildPostEntry("youtube", "int-yt-1", m, [{ id: "media-1", path: "/uploads/m.mp4" }]);
    expect(entry.integration.id).toBe("int-yt-1");
    expect(entry.value[0]!.image).toEqual([{ id: "media-1", path: "/uploads/m.mp4" }]);
    expect(entry.settings).toEqual({ title: CAPTION.platform.shorts });
  });
});

describe("integration-account binding", () => {
  test("auto-matches identifier (prefix + twitter alias), skips disabled", () => {
    const bound = bindIntegrations(["youtube", "instagram", "x"], INTEGRATIONS);
    expect(bound).toEqual({ youtube: "int-yt-1", instagram: "int-ig-1", x: "int-x-1" });
    const viaTwitter = bindIntegrations(["x"], [{ id: "tw-9", identifier: "twitter" }]);
    expect(viaTwitter.x).toBe("tw-9");
  });

  test("explicit --account map wins over auto-match", () => {
    const bound = bindIntegrations(["tiktok"], INTEGRATIONS, { tiktok: "int-custom" });
    expect(bound.tiktok).toBe("int-custom");
  });

  test("unbound target throws (never a silent skip)", () => {
    expect(() => bindIntegrations(["tiktok"], [{ id: "a", identifier: "youtube" }])).toThrow(
      /no Postiz integration bound.*tiktok/,
    );
  });
});

// ─── publishUnit (orchestrator) ──────────────────────────────────────────────

describe("publishUnit", () => {
  test("schedule passthrough: --at → type schedule + date on every post", async () => {
    seedUnit();
    const { fetchImpl, calls } = mockPostiz();
    const at = "2026-07-13T09:00:00.000Z";
    const res = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["tiktok", "youtube"],
      scheduleAt: at,
      fetchImpl,
    });
    expect(res.type).toBe("schedule");
    expect(res.results.map((r) => r.status)).toEqual(["scheduled", "scheduled"]);
    const postCalls = calls.filter((c) => c.url.includes("/posts"));
    expect(postCalls.length).toBe(2);
    for (const c of postCalls) {
      expect((c.body as { type: string }).type).toBe("schedule");
      expect((c.body as { date: string }).date).toBe(at);
    }
    // Media uploaded once, referenced by both targets.
    expect(calls.filter((c) => c.url.includes("/upload")).length).toBe(1);
  });

  test("no schedule → type now, status published, post ids captured", async () => {
    seedUnit();
    const { fetchImpl, calls } = mockPostiz();
    const res = await publishUnit({ projectId: PROJECT, slug: SLUG, targets: ["x"], fetchImpl });
    expect(res.type).toBe("now");
    expect(res.results[0]).toMatchObject({ target: "x", status: "published", postId: "post-int-x-1" });
    expect(calls.filter((c) => c.url.includes("/posts"))[0]!.body).toMatchObject({ type: "now" });
  });

  test("partial failure: failed target carried in results, not thrown", async () => {
    const unitDir = seedUnit();
    const { fetchImpl } = mockPostiz({ failIds: ["int-yt-1"] });
    const res = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["youtube", "tiktok"],
      fetchImpl,
    });
    expect(res.allFailed).toBe(false);
    const byTarget = Object.fromEntries(res.results.map((r) => [r.target, r]));
    expect(byTarget.youtube!.status).toBe("failed");
    expect(byTarget.youtube!.error).toContain("500");
    expect(byTarget.tiktok!.status).toBe("published");
    // Both attempts — the failure included — land in the provenance.
    const manifest = await readUnitManifest(unitDir);
    expect(manifest!.publish!.map((p) => p.status).sort()).toEqual(["failed", "published"]);
  });

  test("all targets failing sets allFailed (callers escalate)", async () => {
    seedUnit();
    const { fetchImpl } = mockPostiz({ failIds: ["int-yt-1", "int-tt-1"] });
    const res = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["youtube", "tiktok"],
      fetchImpl,
    });
    expect(res.allFailed).toBe(true);
  });
});

// ─── provenance append ───────────────────────────────────────────────────────

describe("unit.json publish provenance", () => {
  test("appends across runs — prior records never rewritten", async () => {
    const unitDir = seedUnit();
    const rec = (postId: string) => ({
      target: "tiktok",
      integrationId: "int-tt-1",
      postId,
      status: "published" as const,
      scheduleAt: null,
      at: new Date().toISOString(),
      backend: "postiz",
    });
    await appendPublishRecords(unitDir, [rec("p-1")]);
    const after1 = await readUnitManifest(unitDir);
    await appendPublishRecords(unitDir, [rec("p-2")]);
    const after2 = await readUnitManifest(unitDir);
    expect(after2!.publish!.length).toBe(2);
    // The first record survives byte-identical.
    expect(after2!.publish![0]).toEqual(after1!.publish![0]!);
    expect(after2!.publish!.map((p) => p.postId)).toEqual(["p-1", "p-2"]);
  });
});

// ─── readiness gate ──────────────────────────────────────────────────────────

describe("readiness gate (L0 trust floor)", () => {
  test("a project with no eval state does not pass", () => {
    seedUnit();
    const r = checkPublishReadiness(PROJECT);
    expect(r.pass).toBe(false);
    expect(r.verdict).not.toBe("ship");
  });

  test("CLI refuses with E_PUBLISH_NOT_READY (exit 5) without --force", () => {
    seedUnit();
    const out = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "publish", PROJECT, SLUG, "--targets", "tiktok"],
      { encoding: "utf8", env: { ...process.env, POSTIZ_API_KEY: "", POSTIZ_BASE_URL: "" } },
    );
    expect(out.status).toBe(5);
    expect(out.stderr).toContain("E_PUBLISH_NOT_READY");
  });

  test("CLI --force logs the bypass to user-prompts.jsonl", () => {
    seedUnit();
    // Postiz env unset → the run stops at E_ENV_KEY_MISSING, but only AFTER
    // the gate bypass was logged — which is exactly what we assert.
    const out = spawnSync(
      "bun",
      [
        "run", CLI, "--cwd", tmp.dir, "--json",
        "publish", PROJECT, SLUG, "--targets", "tiktok",
        "--force", "user accepted the risk for the demo",
      ],
      { encoding: "utf8", env: { ...process.env, POSTIZ_API_KEY: "", POSTIZ_BASE_URL: "" } },
    );
    expect(out.status).not.toBe(5); // the gate no longer refuses
    const log = fs.readFileSync(path.join(projectDir(PROJECT), "logs", "user-prompts.jsonl"), "utf8");
    const rows = log.trim().split("\n").map((l) => JSON.parse(l));
    const bypass = rows.find((r) => r.stage === "publish-force");
    expect(bypass).toBeDefined();
    expect(bypass.text).toBe("user accepted the risk for the demo");
    expect(bypass.note).toContain(`unit=${SLUG}`);
  });
});
