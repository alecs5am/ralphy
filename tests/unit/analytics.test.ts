// Analytics feedback loop (#507) — zero-network unit tests.
//
// HTTP is injected (the connectors' fetchImpl seam); the postmortem LLM pass
// is injected via `llmImpl` (mocked callLLM — never the real one). Covers:
// snapshot schema, the APPEND-only analytics.jsonl contract (never rewrites),
// the YouTube statistics mapping + missing-key structured error, the Postiz
// analytics label mapping + graceful degradation, pull routing (youtube →
// youtube-analytics connector, others → postiz, youtube→postiz fallback),
// the due-offset logic, the postmortem evidence rule (a finding citing no
// known unit id is DROPPED), the versioned findings file, and the
// workspace-tier proposed/ memory staging (nothing global, nothing active).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import {
  AnalyticsSnapshotSchema,
  type AnalyticsSnapshot,
} from "../../cli/lib/schemas/analytics";
import {
  analyticsPath,
  readSnapshots,
  appendSnapshots,
  parseOffset,
  dueOffsets,
  listUnitSlugs,
  pullUnitAnalytics,
  pullProjectAnalytics,
  DEFAULT_PULL_OFFSETS,
} from "../../cli/lib/analytics/pull";
import {
  parseFindings,
  runAnalyticsPostmortem,
  versionedFindingsPath,
  NoAnalyticsError,
  type LLMImpl,
} from "../../cli/lib/analytics/postmortem";
import {
  youtubeAnalyticsAvailable,
  youtubeVideoStatistics,
} from "../../cli/lib/providers/youtube-analytics";
import {
  postizPostAnalytics,
  mapPostizAnalyticsRows,
  postizMetrics,
} from "../../cli/lib/providers/postiz";
import { TerminalProviderError } from "../../cli/lib/providers/shared";
import { listEntries } from "../../cli/lib/memory/store";

const PROJECT = "analytics-fixture-507";
const SLUG = "hero-cut";
const ENV_KEYS = ["YOUTUBE_API_KEY", "POSTIZ_API_KEY", "POSTIZ_BASE_URL"] as const;

let tmp: TmpRoot;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-analytics-507");
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tmp.cleanup();
});

const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

function seedUnit(
  slug: string,
  publish: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): string {
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "A", workspace: "default" } } }),
  );
  const unitDir = path.join(projectDir(PROJECT), "units", slug);
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(
    path.join(unitDir, "unit.json"),
    JSON.stringify({
      slug,
      format: "video",
      media: ["final.mp4"],
      created: iso(NOW - 10 * DAY),
      title: "Hero cut",
      publish,
      ...extra,
    }),
  );
  return unitDir;
}

const ytPublishRecord = (over: Record<string, unknown> = {}) => ({
  target: "youtube",
  integrationId: "int-yt-1",
  postId: "dQw4w9WgXcQ",
  status: "published",
  scheduleAt: null,
  at: iso(NOW - 8 * DAY),
  backend: "postiz",
  ...over,
});

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

/** Mock both connector backends behind one fetch. */
function mockFetch(opts: { ytItems?: unknown[]; postizRows?: unknown; postizStatus?: number } = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    if (url.includes("googleapis.com")) return json({ items: opts.ytItems ?? [] });
    if (url.includes("/analytics/post/")) {
      if (opts.postizStatus) return new Response("nope", { status: opts.postizStatus });
      return json(opts.postizRows ?? []);
    }
    throw new Error(`unrouted ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const YT_STATS_ITEM = { id: "dQw4w9WgXcQ", statistics: { viewCount: "4200", likeCount: "310", commentCount: "12" } };
const POSTIZ_ROWS = [
  { label: "Likes", data: [{ total: "150", date: "2026-07-01" }, { total: "175", date: "2026-07-02" }], percentageChange: 16.7 },
  { label: "Comments", data: [{ total: "9", date: "2026-07-02" }], percentageChange: 0 },
  { label: "Shares", data: [{ total: "33", date: "2026-07-02" }], percentageChange: 2 },
  { label: "Video Views", data: [{ total: "8800", date: "2026-07-02" }], percentageChange: 5 },
  { label: "Mystery Metric", data: [{ total: "1", date: "2026-07-02" }], percentageChange: 0 },
];

// ─── schema ──────────────────────────────────────────────────────────────────

describe("analytics snapshot schema", () => {
  test("valid snapshot parses; retention points tolerate extra keys", () => {
    const snap = AnalyticsSnapshotSchema.parse({
      at: iso(NOW),
      target: "youtube",
      postId: "abc",
      source: "youtube-analytics",
      metrics: {
        views: 100,
        retentionCurve: [{ pct: 0, watchRatio: 1, audienceWatchRatio: 0.98 }],
        platformSpecific: "kept",
      },
    });
    expect(snap.metrics.views).toBe(100);
    expect((snap.metrics as Record<string, unknown>).platformSpecific).toBe("kept");
  });

  test("unknown source is rejected", () => {
    expect(() =>
      AnalyticsSnapshotSchema.parse({
        at: iso(NOW),
        target: "youtube",
        postId: "abc",
        source: "made-up",
        metrics: {},
      }),
    ).toThrow();
  });
});

// ─── append-only store ───────────────────────────────────────────────────────

describe("analytics.jsonl append-only store", () => {
  test("append never rewrites — prior lines survive byte-for-byte", async () => {
    const unitDir = seedUnit(SLUG, []);
    const snap = (at: string): AnalyticsSnapshot => ({
      at,
      target: "youtube",
      postId: "abc",
      source: "youtube-analytics",
      metrics: { views: 1 },
    });
    await appendSnapshots(unitDir, [snap(iso(NOW - DAY))]);
    const firstContent = fs.readFileSync(analyticsPath(unitDir), "utf8");
    await appendSnapshots(unitDir, [snap(iso(NOW))]);
    const secondContent = fs.readFileSync(analyticsPath(unitDir), "utf8");
    expect(secondContent.startsWith(firstContent)).toBe(true);
    expect(readSnapshots(unitDir)).toHaveLength(2);
  });

  test("read tolerates malformed lines", async () => {
    const unitDir = seedUnit(SLUG, []);
    fs.writeFileSync(analyticsPath(unitDir), "not json\n{\"half\": true}\n");
    expect(readSnapshots(unitDir)).toEqual([]);
  });
});

// ─── youtube connector ───────────────────────────────────────────────────────

describe("youtube-analytics connector", () => {
  test("statistics map to numbers (views/likes/comments)", async () => {
    process.env.YOUTUBE_API_KEY = "yt-key";
    const { fetchImpl, calls } = mockFetch({ ytItems: [YT_STATS_ITEM] });
    const stats = await youtubeVideoStatistics("dQw4w9WgXcQ", fetchImpl);
    expect(stats).toEqual({ views: 4200, likes: 310, comments: 12 });
    expect(calls[0]).toContain("part=statistics");
    expect(calls[0]).toContain("id=dQw4w9WgXcQ");
  });

  test("no item for the id → null (not a throw)", async () => {
    process.env.YOUTUBE_API_KEY = "yt-key";
    const { fetchImpl } = mockFetch({ ytItems: [] });
    expect(await youtubeVideoStatistics("nope", fetchImpl)).toBeNull();
  });

  test("missing key → structured TerminalProviderError naming YOUTUBE_API_KEY", async () => {
    expect(youtubeAnalyticsAvailable()).toBe(false);
    await expect(youtubeVideoStatistics("abc", mockFetch().fetchImpl)).rejects.toThrow(
      /YOUTUBE_API_KEY/,
    );
    await expect(youtubeVideoStatistics("abc", mockFetch().fetchImpl)).rejects.toBeInstanceOf(
      TerminalProviderError,
    );
  });
});

// ─── postiz metrics passthrough ──────────────────────────────────────────────

describe("postiz analytics passthrough", () => {
  beforeEach(() => {
    process.env.POSTIZ_API_KEY = "pz-key";
    process.env.POSTIZ_BASE_URL = "http://localhost:4200";
  });

  test("label rows map to snapshot metrics (last data point wins)", () => {
    expect(mapPostizAnalyticsRows(POSTIZ_ROWS)).toEqual({
      likes: 175,
      comments: 9,
      shares: 33,
      views: 8800,
    });
  });

  test("postizPostAnalytics hits analytics/post/{id}?date=N", async () => {
    const { fetchImpl, calls } = mockFetch({ postizRows: POSTIZ_ROWS });
    const rows = await postizPostAnalytics("post-1", 30, fetchImpl);
    expect(rows).toHaveLength(5);
    expect(calls[0]).toContain("/api/public/v1/analytics/post/post-1?date=30");
  });

  test("endpoint failure degrades to { ok: false, note } — never throws", async () => {
    const { fetchImpl } = mockFetch({ postizStatus: 404 });
    const r = await postizMetrics("post-1", 7, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.note).toContain("post-1");
  });
});

// ─── pull routing ────────────────────────────────────────────────────────────

describe("pullUnitAnalytics routing", () => {
  test("youtube target → youtube connector; others → postiz; snapshots appended", async () => {
    process.env.YOUTUBE_API_KEY = "yt-key";
    process.env.POSTIZ_API_KEY = "pz-key";
    process.env.POSTIZ_BASE_URL = "http://localhost:4200";
    const unitDir = seedUnit(SLUG, [
      ytPublishRecord(),
      ytPublishRecord({ target: "tiktok", integrationId: "int-tt-1", postId: "post-tt-1" }),
      ytPublishRecord({ target: "x", postId: null }), // no postId → never pulls
      ytPublishRecord({ target: "instagram", postId: "post-ig-1", status: "failed" }), // failed → never pulls
    ]);
    const { fetchImpl } = mockFetch({ ytItems: [YT_STATS_ITEM], postizRows: POSTIZ_ROWS });
    const r = await pullUnitAnalytics({ projectId: PROJECT, slug: SLUG, fetchImpl, now: NOW });

    expect(r.records).toHaveLength(2);
    expect(r.records[0]).toMatchObject({
      target: "youtube",
      status: "fetched",
      source: "youtube-analytics",
      metrics: { views: 4200, likes: 310, comments: 12 },
    });
    expect(r.records[1]).toMatchObject({ target: "tiktok", status: "fetched", source: "postiz" });
    expect(r.appended).toBe(2);
    const snaps = readSnapshots(unitDir);
    expect(snaps).toHaveLength(2);
    expect(snaps.map((s) => s.source).sort()).toEqual(["postiz", "youtube-analytics"]);
  });

  test("youtube postId unknown to the data api falls back to postiz", async () => {
    process.env.YOUTUBE_API_KEY = "yt-key";
    process.env.POSTIZ_API_KEY = "pz-key";
    process.env.POSTIZ_BASE_URL = "http://localhost:4200";
    seedUnit(SLUG, [ytPublishRecord({ postId: "postiz-internal-id" })]);
    const { fetchImpl } = mockFetch({ ytItems: [], postizRows: POSTIZ_ROWS });
    const r = await pullUnitAnalytics({ projectId: PROJECT, slug: SLUG, fetchImpl, now: NOW });
    expect(r.records[0]).toMatchObject({ status: "fetched", source: "postiz" });
    expect(r.records[0]!.note).toContain("not found via data api");
  });

  test("no connector configured → skipped rows with notes, nothing appended", async () => {
    const unitDir = seedUnit(SLUG, [ytPublishRecord(), ytPublishRecord({ target: "tiktok", postId: "post-tt-1" })]);
    const r = await pullUnitAnalytics({ projectId: PROJECT, slug: SLUG, fetchImpl: mockFetch().fetchImpl, now: NOW });
    expect(r.records.every((rec) => rec.status === "skipped")).toBe(true);
    expect(r.records[0]!.note).toContain("YOUTUBE_API_KEY not set");
    expect(r.records[0]!.note).toContain("postiz not configured");
    expect(r.appended).toBe(0);
    expect(fs.existsSync(analyticsPath(unitDir))).toBe(false);
  });

  test("--target filter restricts records; project pull rolls up units", async () => {
    process.env.POSTIZ_API_KEY = "pz-key";
    process.env.POSTIZ_BASE_URL = "http://localhost:4200";
    seedUnit(SLUG, [ytPublishRecord(), ytPublishRecord({ target: "tiktok", postId: "post-tt-1" })]);
    const { fetchImpl } = mockFetch({ postizRows: POSTIZ_ROWS });
    const r = await pullProjectAnalytics({ projectId: PROJECT, target: "tiktok", fetchImpl, now: NOW });
    expect(listUnitSlugs(PROJECT)).toEqual([SLUG]);
    expect(r.units[0]!.records).toHaveLength(1);
    expect(r.units[0]!.records[0]!.target).toBe("tiktok");
    expect(r.fetched).toBe(1);
  });
});

// ─── due-offset logic ────────────────────────────────────────────────────────

describe("due-offset logic", () => {
  test("parseOffset units", () => {
    expect(parseOffset("+1d")).toBe(DAY);
    expect(parseOffset("12h")).toBe(12 * 3_600_000);
    expect(parseOffset("+30m")).toBe(30 * 60_000);
    expect(parseOffset("+2w")).toBe(2 * 7 * DAY);
    expect(() => parseOffset("tomorrow")).toThrow(/invalid analytics offset/);
  });

  const record = { target: "youtube", postId: "abc", at: iso(NOW - 8 * DAY) };
  const snapAt = (ms: number): AnalyticsSnapshot => ({
    at: iso(ms),
    target: "youtube",
    postId: "abc",
    source: "youtube-analytics",
    metrics: {},
  });

  test("no snapshots → every elapsed offset is due", () => {
    expect(dueOffsets(record, DEFAULT_PULL_OFFSETS, [], NOW)).toEqual(["+1d", "+7d"]);
  });

  test("offset not yet elapsed is not due", () => {
    const fresh = { ...record, at: iso(NOW - 2 * 3_600_000) };
    expect(dueOffsets(fresh, DEFAULT_PULL_OFFSETS, [], NOW)).toEqual([]);
  });

  test("snapshot between +1d and +7d serves +1d only", () => {
    const snaps = [snapAt(NOW - 5 * DAY)]; // taken 3d after publish
    expect(dueOffsets(record, DEFAULT_PULL_OFFSETS, snaps, NOW)).toEqual(["+7d"]);
  });

  test("snapshot after +7d serves both offsets", () => {
    const snaps = [snapAt(NOW - 0.5 * DAY)]; // taken 7.5d after publish
    expect(dueOffsets(record, DEFAULT_PULL_OFFSETS, snaps, NOW)).toEqual([]);
  });

  test("pull with offsets skips not-due records", async () => {
    process.env.POSTIZ_API_KEY = "pz-key";
    process.env.POSTIZ_BASE_URL = "http://localhost:4200";
    // Published 2h ago: neither +1d nor +7d has elapsed.
    seedUnit(SLUG, [ytPublishRecord({ target: "tiktok", postId: "post-tt-1", at: iso(NOW - 2 * 3_600_000) })]);
    const { fetchImpl, calls } = mockFetch({ postizRows: POSTIZ_ROWS });
    const r = await pullUnitAnalytics({
      projectId: PROJECT,
      slug: SLUG,
      offsets: DEFAULT_PULL_OFFSETS,
      fetchImpl,
      now: NOW,
    });
    expect(r.records[0]).toMatchObject({ status: "skipped" });
    expect(r.records[0]!.note).toContain("not due");
    expect(calls).toHaveLength(0);
  });
});

// ─── performance postmortem ──────────────────────────────────────────────────

const FINDINGS_RESPONSE = {
  findings: [
    {
      slug: "pov-hook-outperforms",
      finding: "POV hooks retain: hero-cut pulled 13x the views of b-roll-cut at +7d.",
      evidence: { units: ["hero-cut", "b-roll-cut"], metrics: "hero-cut 4200 vs b-roll-cut 310 views at +7d" },
      recommendation: "Default the next batch's hooks to the POV register.",
      type: "client",
    },
    {
      slug: "vibes-only",
      finding: "Audiences love authenticity.",
      evidence: { units: [], metrics: "" },
    },
    {
      slug: "fabricated-evidence",
      finding: "Some other unit did great.",
      evidence: { units: ["unit-that-does-not-exist"], metrics: "n/a" },
    },
  ],
};

function mockLLM(response: unknown = FINDINGS_RESPONSE): { llm: LLMImpl; calls: number } {
  const state = { calls: 0 };
  const llm: LLMImpl = async () => {
    state.calls += 1;
    return { text: JSON.stringify(response), raw: {}, provider: "mock", model: "mock", latencyMs: 1 };
  };
  return { llm, get calls() { return state.calls; } } as { llm: LLMImpl; calls: number };
}

async function seedAnalyzedUnits(): Promise<void> {
  const heroDir = seedUnit(SLUG, [ytPublishRecord()], {
    caption: { platform: { tiktok: "POV: it publishes itself", reels: "r", shorts: "s" }, hashtags: [], language: "English" },
  });
  const bRollDir = path.join(projectDir(PROJECT), "units", "b-roll-cut");
  fs.mkdirSync(bRollDir, { recursive: true });
  fs.writeFileSync(
    path.join(bRollDir, "unit.json"),
    JSON.stringify({ slug: "b-roll-cut", format: "video", media: ["b.mp4"], created: iso(NOW - 10 * DAY) }),
  );
  const snap = (postId: string, views: number): AnalyticsSnapshot => ({
    at: iso(NOW - DAY),
    target: "youtube",
    postId,
    source: "youtube-analytics",
    metrics: { views },
  });
  await appendSnapshots(heroDir, [snap("dQw4w9WgXcQ", 4200)]);
  await appendSnapshots(bRollDir, [snap("other-vid", 310)]);
}

describe("analytics postmortem", () => {
  test("parseFindings drops evidence-less and fabricated-evidence findings", () => {
    const { findings, dropped } = parseFindings(JSON.stringify(FINDINGS_RESPONSE), ["hero-cut", "b-roll-cut"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.slug).toBe("pov-hook-outperforms");
    expect(findings[0]!.evidence.units).toEqual(["hero-cut", "b-roll-cut"]);
    expect(dropped).toBe(2);
  });

  test("writes versioned findings file + stages WORKSPACE proposed/ entries only", async () => {
    await seedAnalyzedUnits();
    const r = await runAnalyticsPostmortem({ projectId: PROJECT, llmImpl: mockLLM().llm });

    expect(r.units.sort()).toEqual(["b-roll-cut", "hero-cut"]);
    expect(r.findings).toHaveLength(1);
    expect(r.dropped).toBe(2);
    expect(r.findingsPath).toContain("analytics-findings.json");
    const onDisk = JSON.parse(fs.readFileSync(r.findingsPath!, "utf8"));
    expect(onDisk.findings).toHaveLength(1);

    // Memory staging: workspace proposed/ only — nothing active, nothing global.
    const wsProposed = await listEntries({ tier: "workspace", ws: "default" }, "proposed");
    expect(wsProposed.map((e) => e.slug)).toEqual(["pov-hook-outperforms"]);
    expect(wsProposed[0]!.body).toContain("4200");
    expect(await listEntries({ tier: "workspace", ws: "default" }, "active")).toEqual([]);
    expect(await listEntries({ tier: "global" }, "proposed")).toEqual([]);
    expect(await listEntries({ tier: "global" }, "active")).toEqual([]);
  });

  test("re-run versions the findings file (.v2), never overwrites", async () => {
    await seedAnalyzedUnits();
    const first = await runAnalyticsPostmortem({ projectId: PROJECT, llmImpl: mockLLM().llm });
    const before = fs.readFileSync(first.findingsPath!, "utf8");
    const second = await runAnalyticsPostmortem({ projectId: PROJECT, llmImpl: mockLLM().llm });
    expect(second.findingsPath).toContain("analytics-findings.v2.json");
    expect(fs.readFileSync(first.findingsPath!, "utf8")).toBe(before);
    const pmDir = path.dirname(first.findingsPath!);
    expect(versionedFindingsPath(pmDir)).toContain("analytics-findings.v3.json");
  });

  test("--dry-run stages nothing and writes nothing", async () => {
    await seedAnalyzedUnits();
    const r = await runAnalyticsPostmortem({ projectId: PROJECT, dryRun: true, llmImpl: mockLLM().llm });
    expect(r.findings).toHaveLength(1);
    expect(r.findingsPath).toBeNull();
    expect(r.staged).toEqual([]);
    expect(await listEntries({ tier: "workspace", ws: "default" }, "proposed")).toEqual([]);
    expect(fs.existsSync(path.join(projectDir(PROJECT), "postmortem"))).toBe(false);
  });

  test("no snapshots anywhere → NoAnalyticsError (coded not-found)", async () => {
    seedUnit(SLUG, [ytPublishRecord()]);
    await expect(runAnalyticsPostmortem({ projectId: PROJECT, llmImpl: mockLLM().llm })).rejects.toBeInstanceOf(
      NoAnalyticsError,
    );
  });
});
