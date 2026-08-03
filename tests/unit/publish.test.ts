// Postiz publish path (#501) — zero-network unit tests.
//
// HTTP is injected (the connector's fetchImpl / ExecutorContext.fetchImpl
// seam); the explicit credential test source and POSTIZ_BASE_URL are set per
// test. Covers: per-platform payload
// mapping, integration-account binding, schedule passthrough (--at + the
// calendar-slot in-port), partial-failure semantics (one fails → per-target
// statuses, all fail → throws), the readiness gate (refusal + logged --force
// bypass), and the APPEND-only unit.json publish provenance.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir, workspaceDir, workspaceUnitsDir } from "../../cli/lib/paths";
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
import { postizIntegrations } from "../../cli/lib/providers/postiz";
import * as postizProvider from "../../cli/lib/providers/postiz";
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
  { id: "int-tg-1", identifier: "telegram", name: "Telegram channel" },
  { id: "int-dead", identifier: "tiktok", disabled: true },
];

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-publish-501");
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

function seedWorkspaceUnit(manifest: Partial<UnitManifest> = {}): string {
  const unitDir = path.join(workspaceUnitsDir(WS), SLUG);
  fs.mkdirSync(unitDir, { recursive: true });
  const full = {
    slug: SLUG,
    format: "post",
    media: [],
    created: new Date().toISOString(),
    title: "Workspace post",
    text: {
      body: "Ralphy turns your coding agent into a content farm.\n\n#buildinpublic",
      destinations: ["x", "telegram"],
    },
    ...manifest,
  };
  fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(full, null, 2));
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
    expect(settingsForTarget("youtube", m, "youtube")).toEqual({
      __type: "youtube",
      title: CAPTION.platform.shorts,
      type: "public",
      selfDeclaredMadeForKids: "no",
      tags: CAPTION.hashtags.map((tag) => ({ value: tag.replace(/^#/, ""), label: tag.replace(/^#/, "") })),
    });
  });

  test("tiktok: hook + capped inline tags", () => {
    const c = captionForTarget("tiktok", m);
    expect(c).toStartWith(CAPTION.platform.tiktok);
    expect(c).toContain("#fyp #contentfarm #viral #howto #ai");
    expect(c).not.toContain("#extra");
  });

  test("tiktok: direct-post settings satisfy the Postiz provider schema", () => {
    expect(settingsForTarget("tiktok", m, "tiktok", { madeWithAi: true })).toEqual({
      __type: "tiktok",
      title: CAPTION.platform.shorts,
      privacy_level: "PUBLIC_TO_EVERYONE",
      duet: false,
      stitch: false,
      comment: true,
      autoAddMusic: "no",
      brand_content_toggle: false,
      brand_organic_toggle: false,
      video_made_with_ai: true,
      content_posting_method: "DIRECT_POST",
    });
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

  test("telegram uses the text Unit body and provider settings", () => {
    const text = "A complete Telegram post\n\n#ralphy";
    const post = manifestFixture({
      format: "post",
      text: { body: "post.md", destinations: ["telegram"] },
    });
    expect(captionForTarget("telegram", post, text)).toBe(text);
    expect(settingsForTarget("telegram", post, "telegram")).toEqual({ __type: "telegram" });
  });

  test("no caption falls back to title/blurb copy", () => {
    const bare = manifestFixture({ caption: undefined });
    expect(captionForTarget("tiktok", bare)).toBe("Hero cut — A demo unit.");
    expect(settingsForTarget("youtube", bare, "youtube")).toMatchObject({
      __type: "youtube",
      title: "Hero cut",
      type: "public",
    });
  });

  test("buildPostEntry attaches media refs + settings", () => {
    const entry = buildPostEntry("youtube", "int-yt-1", m, [{ id: "media-1", path: "/uploads/m.mp4" }]);
    expect(entry.integration.id).toBe("int-yt-1");
    expect(entry.value[0]!.image).toEqual([{ id: "media-1", path: "/uploads/m.mp4" }]);
    expect(entry.settings).toMatchObject({ __type: "youtube", title: CAPTION.platform.shorts });
  });

  test("X thread body maps to ordered Postiz value items", () => {
    const thread = manifestFixture({
      format: "thread",
      text: { body: "thread.json", destinations: ["x"] },
    });
    const entry = buildPostEntry(
      "x",
      "int-x-1",
      thread,
      [],
      "x",
      JSON.stringify(["First post", "Second post"]),
    );
    expect(entry.value.map((value) => value.content)).toEqual(["First post", "Second post"]);
    expect(entry.value.map((value) => value.image)).toEqual([[], []]);
    expect(entry.settings).toMatchObject({ __type: "x", who_can_reply_post: "everyone" });
  });
});

describe("workspace Postiz config", () => {
  test("Postiz Cloud root uses the explicitly resolved test credential", async () => {
    delete process.env.POSTIZ_API_URL;
    delete process.env.POSTIZ_BASE_URL;
    let call: { url: string; authorization: string | null } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      call = {
        url,
        authorization: new Headers(init?.headers).get("authorization"),
      };
      return json([]);
    }) as typeof fetch;

    await postizIntegrations(fetchImpl, WS);
    expect(call).toEqual({
      url: "https://api.postiz.com/public/v1/integrations",
      authorization: "test-key",
    });
  });

  test("lists posts in an explicit UTC date range", async () => {
    const listPosts = (postizProvider as Record<string, unknown>).postizListPosts;
    expect(typeof listPosts).toBe("function");
    if (typeof listPosts !== "function") return;
    let requestedUrl = "";
    const fetchImpl = (async (url: string) => {
      requestedUrl = url;
      return json({ posts: [{ id: "post-1", releaseURL: "https://t.me/channel/1" }] });
    }) as typeof fetch;
    const posts = await listPosts(
      "2026-07-13T00:00:00.000Z",
      "2026-07-16T00:00:00.000Z",
      fetchImpl,
      WS,
    );
    expect(requestedUrl).toContain("posts?startDate=2026-07-13T00%3A00%3A00.000Z&endDate=2026-07-16T00%3A00%3A00.000Z");
    expect(posts).toEqual([{ id: "post-1", releaseURL: "https://t.me/channel/1" }]);
  });

  test("deletes one Postiz post by id", async () => {
    const deletePost = (postizProvider as Record<string, unknown>).postizDeletePost;
    expect(typeof deletePost).toBe("function");
    if (typeof deletePost !== "function") return;
    let request: { url: string; method?: string } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      request = { url, method: init?.method };
      return json({ id: "post-1" });
    }) as typeof fetch;
    expect(await deletePost("post-1", fetchImpl, WS)).toEqual({ id: "post-1" });
    expect(request).toMatchObject({ url: "http://localhost:4200/api/public/v1/posts/post-1", method: "DELETE" });
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

  test("no schedule → type now, status submitted until Postiz confirms delivery", async () => {
    seedUnit();
    const { fetchImpl, calls } = mockPostiz();
    const now = new Date("2026-07-13T17:59:00.000Z");
    const res = await publishUnit({
      projectId: PROJECT,
      slug: SLUG,
      targets: ["x"],
      fetchImpl,
      now: () => now,
    });
    expect(res.type).toBe("now");
    expect(res.results[0]).toMatchObject({ target: "x", status: "submitted", postId: "post-int-x-1" });
    expect(calls.filter((c) => c.url.includes("/posts"))[0]!.body).toMatchObject({
      type: "now",
      date: now.toISOString(),
    });
  });

  test("workspace text Unit publishes to X and Telegram", async () => {
    const unitDir = seedWorkspaceUnit();
    const { fetchImpl, calls } = mockPostiz();
    const res = await publishUnit({
      workspaceId: WS,
      slug: SLUG,
      targets: ["x", "telegram"],
      fetchImpl,
    });
    expect(res.workspace).toBe(WS);
    expect(res.project).toBeNull();
    expect(res.results.map((result) => result.status)).toEqual(["submitted", "submitted"]);
    const posts = calls.filter((call) => call.url.includes("/posts"));
    expect(posts.map((call) => (call.body as any).posts[0].value[0].content)).toEqual([
      "Ralphy turns your coding agent into a content farm.\n\n#buildinpublic",
      "Ralphy turns your coding agent into a content farm.\n\n#buildinpublic",
    ]);
    expect(posts.map((call) => (call.body as any).posts[0].settings.__type)).toEqual(["x", "telegram"]);
    expect((await readUnitManifest(unitDir))?.publish).toHaveLength(2);
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
    expect(byTarget.tiktok!.status).toBe("submitted");
    // Both attempts — the failure included — land in the provenance.
    const manifest = await readUnitManifest(unitDir);
    expect(manifest!.publish!.map((p) => p.status).sort()).toEqual(["failed", "submitted"]);
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
  test("CLI calls immediate Postiz acceptance submitted, not published", () => {
    const source = fs.readFileSync(path.join(REPO, "cli", "commands", "publish.ts"), "utf8");
    expect(source).toContain('result.type === "schedule" ? "Scheduled" : "Submitted"');
  });

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
