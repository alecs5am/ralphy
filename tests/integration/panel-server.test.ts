import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDb, insertJob, closeDb } from "../../cli/lib/jobs/db.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { newDomainId } from "../../cli/lib/store/ids.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { upsertNiche } from "../../cli/lib/store/trend-niches.js";
import { nicheSettings } from "../../cli/lib/trends/niche.js";
import { detectTrendWorkspace, panelHandler, startPanelServer, TaskCache, type CliRunner } from "../../cli/lib/panel/server.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HOST = { host: "127.0.0.1:4777" };

let tmp: TmpRoot;
let envSnapshot: NodeJS.ProcessEnv;
let workspaceId: string;
let projectId: string;
let calls: string[][];
let jobIds: Record<"running" | "failed" | "pending" | "old", number>;

const YT_ONE = "https://www.youtube.com/shorts/aaaaaaaaaaa";
const YT_TWO = "https://www.youtube.com/shorts/bbbbbbbbbbb";

const reportJson = {
  whatToCopy: {
    items: [
      { url: YT_ONE, creator: "@psychA", followers: 4000, platform: "youtube", views: 900000, multiplier: 12, label: "breakout", verdict: "copy", ageDays: 2, format: "pov", subNiche: "anxiety", scorecard: { reasons: ["A1 strong lift: 12x creator median", "note: x"] } },
      { url: YT_TWO, creator: "@psychB", platform: "youtube", views: 100, scorecard: { reasons: [] } },
      { url: "https://www.tiktok.com/@c/video/3", title: "Report supplied title", creator: "@c", platform: "tiktok" },
    ],
  },
  entryFormats: { rows: [{ axis: "format", label: "pov", n: 10, creators: 6, hitRate: 0.6, lift: 2.7, verdict: "over" }] },
  niche: { subNiches: ["anxiety"] },
  notes: ["n1", "n2", "n3", "n4", "n5"],
};

function fakeCli(overrides: Partial<Record<string, unknown>> = {}): CliRunner {
  return async (args) => {
    calls.push(args);
    const verb = args.slice(3, 5).join(" ");
    if (verb === "niche report") return overrides.report ?? reportJson;
    if (args[3] === "top") return overrides.top ?? { videos: [{ id: "x", url: YT_ONE, views: 5 }], notes: [] };
    if (args[3] === "signals") return overrides.signals ?? { signals: [] };
    throw new Error(`unexpected cli call: ${args.join(" ")}`);
  };
}

function seedCorpus(workspace: string) {
  const db = openDomainDb();
  const now = Date.now();
  const creatorId = newDomainId("tcreator");
  db.prepare(`INSERT INTO trend_creators (id, workspace_id, platform, platform_creator_id, discovered_via, created_at, updated_at)
    VALUES (?, ?, 'youtube', 'UCfixture', 'seed', ?, ?)`).run(creatorId, workspace, now, now);
  const insert = db.prepare(`INSERT INTO trend_videos (id, workspace_id, platform, platform_video_id, creator_id, format_key, url, title, language, discovered_via, discovered_at, latest_as_of, created_at, updated_at)
    VALUES (?, ?, 'youtube', ?, ?, 'short', ?, ?, 'en', 'seed', ?, ?, ?, ?)`);
  insert.run(newDomainId("tvideo"), workspace, "aaaaaaaaaaa", creatorId, YT_ONE, "Why anxiety spikes at night", now, Date.UTC(2026, 9, 20), now, now);
  insert.run(newDomainId("tvideo"), workspace, "bbbbbbbbbbb", creatorId, YT_TWO, "Narcissist signs", now, Date.UTC(2026, 9, 25), now, now);
}

function seedJobs() {
  const db = openDb();
  const argv = (...rest: string[]) => ({ argv: ["ralphy", ...rest] });
  const now = Date.now();
  const set = (id: number, status: string, startedAt: number | null, endedAt: number | null, error: string | null = null) =>
    db.prepare("UPDATE jobs SET status = ?, started_at = ?, ended_at = ?, error_message = ? WHERE id = ?").run(status, startedAt, endedAt, error, id);
  const running = insertJob({ kind: "generate.image", command: argv("generate", "image", "--slot", "hero", "--prompt", "a hero"), project_id: projectId });
  const failed = insertJob({ kind: "generate.image", command: argv("generate", "image", "--slot", "broken"), project_id: projectId });
  const pending = insertJob({ kind: "generate.image", command: argv("generate", "image", "--slot", "later") });
  const old = insertJob({ kind: "generate.image", command: argv("generate", "image", "--slot", "ancient") });
  set(running, "running", now - 5 * 60_000, null);
  set(failed, "failed", now - 2 * HOUR + 1_000, now - HOUR, "provider timed out");
  set(old, "completed", now - 3 * DAY - HOUR, now - 3 * DAY);
  jobIds = { running, failed, pending, old };
}

async function getJson(handler: (request: Request) => Promise<Response>, path: string, init: RequestInit = {}) {
  const response = await handler(new Request(`http://127.0.0.1:4777${path}`, { headers: HOST, ...init }));
  return { response, body: (await response.json()) as any };
}

beforeEach(() => {
  envSnapshot = { ...process.env };
  tmp = makeTmpRoot("ralphy-panel");
  closeDb();
  calls = [];
  workspaceId = createWorkspace({ slug: "ws-slug", name: "Corpus" }).id;
  projectId = createProject({ workspaceId, slug: "project-slug", name: "Project" }).id;
  upsertNiche({
    workspaceId, slug: "psychology", topic: "Psychology", languages: ["en"], platforms: ["youtube"], parentNiche: null,
    taxonomy: { subNiches: [{ slug: "anxiety", label: "Anxiety", terms: ["anxi*"] }], lexicon: {} } as never,
    settings: nicheSettings({}), seedSource: "file",
  });
  seedCorpus(workspaceId);
  seedJobs();
});

afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
  for (const key of Object.keys(process.env)) if (!(key in envSnapshot)) delete process.env[key];
  Object.assign(process.env, envSnapshot);
});

function build(runCli: CliRunner = fakeCli(), cache = new TaskCache()) {
  return { cache, handler: panelHandler({ dataRoot: tmp.dir, version: "9.9.9", trend: { id: workspaceId, slug: "ws-slug" }, runCli, cache }) };
}

describe("panelHandler · transport rules", () => {
  test("GET / serves the page as html", async () => {
    const { handler } = build();
    const response = await handler(new Request("http://127.0.0.1:4777/", { headers: HOST }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Ralphy panel");
  });

  test("refuses a non-loopback Host header", async () => {
    const { handler } = build();
    for (const host of ["evil.example.com", "evil.example.com:4777", "127.0.0.1.evil.com"]) {
      const response = await handler(new Request("http://127.0.0.1:4777/api/health", { headers: { host } }));
      expect(response.status).toBe(403);
    }
  });

  test("accepts localhost and [::1] hosts", async () => {
    const { handler } = build();
    for (const host of ["localhost:4777", "[::1]:4777", "127.0.0.1"]) {
      const response = await handler(new Request("http://127.0.0.1:4777/api/health", { headers: { host } }));
      expect(response.status).toBe(200);
    }
  });

  test("is read-only: POST is 405", async () => {
    const { handler } = build();
    const { response } = await getJson(handler, "/api/health", { method: "POST" });
    expect(response.status).toBe(405);
  });

  test("/api/health identifies the panel and its root", async () => {
    const { body, response } = await getJson(build().handler, "/api/health");
    expect(response.status).toBe(200);
    expect(body).toEqual({ app: "ralphy-panel", version: "9.9.9", root: tmp.dir });
  });

  test("unknown paths are 404", async () => {
    const { response } = await getJson(build().handler, "/api/nope");
    expect(response.status).toBe(404);
  });
});

describe("panelHandler · activity and overview", () => {
  test("groups jobs into running, failed, pending, older", async () => {
    const { body } = await getJson(build().handler, "/api/activity");
    expect(body.running.map((job: any) => job.id)).toEqual([jobIds.running]);
    expect(body.failed.map((job: any) => job.id)).toEqual([jobIds.failed]);
    expect(body.pending.count).toBe(1);
    expect(body.pending.next.map((job: any) => job.id)).toEqual([jobIds.pending]);
    expect(body.older.map((job: any) => job.id)).toEqual([jobIds.old]);
    // The 3-day-old completed job is not in the 24 h windows.
    expect(body.done.map((job: any) => job.id)).not.toContain(jobIds.old);
    expect(body.failed.map((job: any) => job.id)).not.toContain(jobIds.old);
    expect(body.windowHours).toBe(24);
  });

  test("labels jobs with their project and a readable title", async () => {
    const { body } = await getJson(build().handler, "/api/activity");
    expect(body.running[0].project).toBe("ws-slug/project-slug");
    expect(body.running[0].label).toBe("Generate image · hero");
    expect(body.pending.next[0].project).toBeNull();
    expect(body.failed[0]).toMatchObject({ error: "provider timed out", status: "failed" });
    expect(body.failed[0].runtimeMs).toBe(HOUR - 1_000);
  });

  test("falls back to the raw project id when it matches no project", async () => {
    const orphan = insertJob({ kind: "generate.image", command: { argv: ["ralphy", "generate", "image", "--slot", "orphan"] }, project_id: "prj_unknown" });
    const { body } = await getJson(build().handler, "/api/activity");
    expect(body.pending.count).toBe(2);
    expect(body.pending.next.find((job: any) => job.id === orphan).project).toBe("prj_unknown");
  });

  test("/api/overview lists the niche and the corpus data age", async () => {
    const { body } = await getJson(build().handler, "/api/overview");
    expect(body.root).toBe(tmp.dir);
    expect(body.trend.workspace).toEqual({ id: workspaceId, slug: "ws-slug" });
    expect(body.trend.niches).toHaveLength(1);
    expect(body.trend.niches[0]).toMatchObject({ slug: "psychology", topic: "Psychology", kept: 0, subNiches: 1 });
    expect(body.trend.dataAsOf).toBe(new Date(Date.UTC(2026, 9, 25)).toISOString());
  });

  test("/api/overview without a trend workspace reports trend: null and trends views 404", async () => {
    const handler = panelHandler({ dataRoot: tmp.dir, version: "1", trend: null, runCli: fakeCli() });
    expect((await getJson(handler, "/api/overview")).body).toEqual({ root: tmp.dir, trend: null });
    expect((await getJson(handler, "/api/trends/picks?niche=psychology")).response.status).toBe(404);
  });
});

describe("panelHandler · trend views", () => {
  test("picks answers 202 first, then 200 with titles joined from the corpus by url", async () => {
    const { handler, cache } = build();
    const first = await getJson(handler, "/api/trends/picks?niche=psychology");
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({ computing: true, message: "Building the niche report" });
    await cache.idle();
    const second = await getJson(handler, "/api/trends/picks?niche=psychology");
    expect(second.response.status).toBe(200);
    expect(Object.keys(second.body).sort()).toEqual(["computedAt", "items", "notes"]);
    const [one, two, three] = second.body.items;
    expect(one).toMatchObject({ url: YT_ONE, title: "Why anxiety spikes at night", lang: "en", reasons: ["strong lift: 12x creator median"], format: "pov" });
    expect(two).toMatchObject({ url: YT_TWO, title: "Narcissist signs" });
    expect(three.url).toBe("https://www.tiktok.com/@c/video/3");
    expect(second.body.notes).toEqual(["n1", "n2", "n3", "n4"]);
  });

  test("runs the niche report scoped to the corpus workspace", async () => {
    const { handler, cache } = build();
    await getJson(handler, "/api/trends/picks?niche=psychology");
    await cache.idle();
    expect(calls).toEqual([["--workspace", workspaceId, "trends", "niche", "report", "psychology"]]);
  });

  test("formats reuses the report computed for picks (one CLI call for both)", async () => {
    const { handler, cache } = build();
    await getJson(handler, "/api/trends/picks?niche=psychology");
    await cache.idle();
    const formats = await getJson(handler, "/api/trends/formats?niche=psychology");
    expect(formats.response.status).toBe(200);
    expect(Object.keys(formats.body).sort()).toEqual(["computedAt", "formats", "hooks", "notes", "subNiches"]);
    expect(formats.body.formats[0]).toMatchObject({ label: "pov", lift: 2.7 });
    expect(formats.body.subNiches).toEqual(["anxiety"]);
    expect(calls).toHaveLength(1);
  });

  test("a failing CLI run surfaces as one 502 with message and hint", async () => {
    const runCli: CliRunner = async () => { throw Object.assign(new Error("corpus locked"), { hint: "retry in a minute" }); };
    const { handler, cache } = build(runCli);
    expect((await getJson(handler, "/api/trends/picks?niche=psychology")).response.status).toBe(202);
    await cache.idle();
    const failed = await getJson(handler, "/api/trends/picks?niche=psychology");
    expect(failed.response.status).toBe(502);
    expect(failed.body.error).toEqual({ message: "corpus locked", hint: "retry in a minute" });
  });

  test("top passes only whitelisted filters", async () => {
    const { handler, cache } = build();
    await getJson(handler, "/api/trends/top?niche=psychology&since=7d&by=views&platform=youtube&label=breakout");
    await cache.idle();
    expect(calls[0]).toEqual([
      "--workspace", workspaceId, "trends", "top", "--niche", "psychology", "--since", "7d", "--by", "views", "--limit", "50",
      "--platform", "youtube", "--label", "breakout",
    ]);
  });

  test("top falls back to defaults for injected or unknown values", async () => {
    const { handler, cache } = build();
    await getJson(handler, "/api/trends/top?niche=psychology&since=1y;rm&by=$(id)&platform=myspace&label=x");
    await cache.idle();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["--workspace", workspaceId, "trends", "top", "--niche", "psychology", "--since", "30d", "--by", "outlier", "--limit", "50"]);
  });

  test("top returns normalized items once computed", async () => {
    const { handler, cache } = build();
    await getJson(handler, "/api/trends/top?niche=psychology");
    await cache.idle();
    const { response, body } = await getJson(handler, "/api/trends/top?niche=psychology");
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ url: YT_ONE, views: 5, thumb: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg" });
  });

  test("rising runs signals for the niche", async () => {
    const { handler, cache } = build(fakeCli({ signals: { signals: [{ type: "breakout", url: YT_ONE, creator: "@a", platform: "youtube", evidence: { multiplier: 9 } }], notes: ["careful"] } }));
    await getJson(handler, "/api/trends/rising?niche=psychology");
    await cache.idle();
    expect(calls[0]).toEqual(["--workspace", workspaceId, "trends", "signals", "--niche", "psychology", "--limit", "15"]);
    const { response, body } = await getJson(handler, "/api/trends/rising?niche=psychology");
    expect(response.status).toBe(200);
    expect(body.groups[0].items[0]).toMatchObject({ url: YT_ONE, title: "Why anxiety spikes at night", multiplier: 9 });
    expect(body.notes).toEqual(["careful"]);
  });

  test("fresh=1 recomputes and answers 202", async () => {
    const { handler, cache } = build();
    await getJson(handler, "/api/trends/picks?niche=psychology");
    await cache.idle();
    const refreshed = await getJson(handler, "/api/trends/picks?niche=psychology&fresh=1");
    expect(refreshed.response.status).toBe(202);
    await cache.idle();
    expect(calls).toHaveLength(2);
  });

  test("unknown or malformed niche is 404 and never reaches the CLI", async () => {
    const { handler } = build();
    for (const niche of ["missing", "Bad%20Slug", "a;b", ""]) {
      const { response } = await getJson(handler, `/api/trends/picks?niche=${niche}`);
      expect(response.status).toBe(404);
    }
    expect((await getJson(handler, "/api/trends/picks")).response.status).toBe(404);
    expect((await getJson(handler, "/api/trends/bogus?niche=psychology")).response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});

describe("detectTrendWorkspace", () => {
  test("finds the first workspace with niches, or the named one", () => {
    createWorkspace({ slug: "empty", name: "Empty" });
    expect(detectTrendWorkspace()).toEqual({ id: workspaceId, slug: "ws-slug" });
    expect(detectTrendWorkspace("ws-slug")).toEqual({ id: workspaceId, slug: "ws-slug" });
    expect(detectTrendWorkspace("nope")).toBeNull();
  });
});

describe("startPanelServer", () => {
  test("serves on an ephemeral loopback port and warms the first niche", async () => {
    const server = startPanelServer({ dataRoot: tmp.dir, port: 0, version: "9.9.9", runCli: fakeCli() });
    try {
      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
      expect(server.trendWorkspace).toEqual({ id: workspaceId, slug: "ws-slug" });
      const health = await (await fetch(`${server.url}api/health`)).json();
      expect(health).toEqual({ app: "ralphy-panel", version: "9.9.9", root: tmp.dir });
      // The warm-up request has computed the picks by the time they are polled.
      let status = 0;
      for (let attempt = 0; attempt < 50 && status !== 200; attempt++) {
        status = (await fetch(`${server.url}api/trends/picks?niche=psychology`)).status;
        if (status !== 200) await Bun.sleep(20);
      }
      expect(status).toBe(200);
      expect(calls).toHaveLength(1);
    } finally {
      server.stop();
    }
  });
});
