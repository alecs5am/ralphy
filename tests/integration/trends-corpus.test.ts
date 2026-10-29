import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { SCHEMA_VERSION } from "../../cli/lib/store/schema.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { exportWorkspacePackage, importWorkspacePackage } from "../../cli/lib/store/portable.js";
import {
  dueCreators,
  findTrendVideo,
  linkTrendDigest,
  queryTrendTop,
  recentTrendRuns,
  upsertWatchlist,
  writeIngestBatch,
} from "../../cli/lib/store/trends.js";
import { ingest, refresh, type IngestOptions, type TrendDeps } from "../../cli/lib/trends/ingest.js";
import { trendCohortProvider } from "../../cli/lib/trends/cohort-provider.js";
import { buildOutcomeReport, DEFAULT_REPORT_OPTIONS } from "../../cli/lib/analytics/report.js";
import { DAY_MS, HOUR_MS } from "../../cli/lib/trends/math.js";
import type { XhrCapturer } from "../../cli/lib/trends/sources/tiktok.js";
import type { YtdlpRunner } from "../../cli/lib/trends/sources/ytdlp.js";
import { statusReport } from "../../cli/commands/trends.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "trends");
const exploreBody = fs.readFileSync(path.join(FIXTURES, "tiktok-explore-item-list.json"), "utf8");
const listingLines = fs.readFileSync(path.join(FIXTURES, "tiktok-listing.jsonl"), "utf8").split("\n").filter((line) => line.startsWith("{"));
const ALPHA = "MS4wLjABAAAAfixtureCreatorAlphaSecUid0123456789abcdefghij";
const BRAVO = "MS4wLjABAAAAfixtureCreatorBravoSecUid0123456789abcdefghij";

let tmp: TmpRoot;
let workspaceId: string;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-trends");
  workspaceId = createWorkspace({ slug: "corpus", name: "Corpus" }).id;
});
afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
});

/**
 * A listing per creator: the 40 newest daily posts before `now`. A post's id
 * derives from its UTC day, so a later listing shows the same videos plus the
 * days that passed. One breakout three days before the first ingest.
 */
const BREAKOUT_DAY = Math.floor(Date.UTC(2026, 9, 25, 12) / DAY_MS);
function listingFor(secUid: string, now: number): string {
  const prefix = secUid === ALPHA ? "771" : "772";
  const template = JSON.parse(listingLines[0]!) as Record<string, unknown>;
  const today = Math.floor(now / DAY_MS);
  return Array.from({ length: 40 }, (_, index) => {
    const day = today - index - 1;
    return JSON.stringify({
      ...template,
      id: `${prefix}${String(day).padStart(8, "0")}`,
      channel_id: secUid,
      timestamp: Math.floor((day * DAY_MS + 12 * HOUR_MS) / 1000),
      view_count: day === BREAKOUT_DAY ? 90_000 : 1_000 + (day % 7) * 60,
    });
  }).join("\n");
}

function fakes(clock: { now: number }, behavior: { blockAll?: boolean; failCreator?: string } = {}) {
  const calls: string[][] = [];
  const ytdlp: YtdlpRunner = async (args) => {
    calls.push(args);
    const target = args.at(-1)!;
    if (behavior.blockAll) return { code: 1, stdout: "", stderr: "ERROR: [tiktok:user] Sign in to confirm you're not a bot", ms: 1, timedOut: false };
    const secUid = target.replace(/^tiktokuser:/, "");
    if (secUid === behavior.failCreator) return { code: 1, stdout: "", stderr: "ERROR: [tiktok:user] x: Unable to extract secondary user ID", ms: 1, timedOut: false };
    return { code: 0, stdout: listingFor(secUid, clock.now), stderr: "", ms: 1, timedOut: false };
  };
  const capture: XhrCapturer = async () => ({ bodies: [exploreBody], pageBlock: null, region: "US", ms: 1 });
  const deps: TrendDeps = { ytdlp, capture, now: () => clock.now };
  return { deps, calls };
}

const baseOptions = (overrides: Partial<IngestOptions> = {}): IngestOptions => ({
  workspaceId,
  source: "tiktok-explore",
  seeds: ["Technology"],
  niche: "tech-tips",
  perCreator: 60,
  maxCreators: 50,
  concurrency: 1,
  discoveryDepth: 5,
  budget: 100,
  paid: { enabled: false, dailyCapUsd: null },
  ...overrides,
});
const post = { llm: false, llmLimit: 0, refit: false };

const count = (sql: string, ...values: string[]) =>
  (openDomainDb().query<{ n: number }, string[]>(sql).get(...values)?.n ?? 0);

describe("migration 11", () => {
  test("installs the trend tables with append-only snapshot history", () => {
    const db = openDomainDb();
    expect(SCHEMA_VERSION).toBe(12);
    const tables = db.query<{ name: string; sql: string }, []>("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name GLOB 'trend_*'").all();
    expect(tables.map((table) => table.name).sort()).toEqual([
      "trend_baselines", "trend_cohort_baselines", "trend_cohort_labels", "trend_creator_snapshots",
      "trend_creators", "trend_metric_snapshots", "trend_niche_members", "trend_niches", "trend_video_digests", "trend_videos", "trend_watchlists",
    ]);
    expect(tables.find((table) => table.name === "trend_metric_snapshots")!.sql).toMatch(/WITHOUT ROWID/);
    const now = Date.now();
    const batch = writeIngestBatch({
      workspaceId, runId: null, now,
      creators: [{ platform: "tiktok", platformCreatorId: ALPHA, discoveredVia: "manual" }],
      videos: [{ creatorPlatformId: ALPHA, platform: "tiktok", platformVideoId: "1234567", url: "https://www.tiktok.com/@a/video/1234567", postedAt: now - DAY_MS, discoveredVia: "listing", inListing: true, snapshot: { asOf: now, source: "ytdlp-tiktok-user", views: 10 } }],
    });
    expect(batch).toMatchObject({ creatorsCreated: 1, videosCreated: 1, snapshotsInserted: 1 });
    expect(() => db.exec("UPDATE trend_metric_snapshots SET views = 11")).toThrow(/append-only/);
    expect(() => db.exec("DELETE FROM trend_metric_snapshots")).toThrow(/append-only/);
    const other = createWorkspace({ slug: "other", name: "Other" });
    const creatorId = db.query<{ id: string }, []>("SELECT id FROM trend_creators").get()!.id;
    expect(() => db.prepare(
      `INSERT INTO trend_videos (id, workspace_id, platform, platform_video_id, creator_id, format_key, url, discovered_via, discovered_at, created_at, updated_at)
       VALUES ('tvideo_x', ?, 'tiktok', '999', ?, 'tiktok-video', 'u', 'x', 1, 1, 1)`,
    ).run(other.id, creatorId)).toThrow(/share its Workspace/);
  });
});

describe("ingest", () => {
  test("is idempotent: a second pass in the same buckets adds no entities or snapshot rows", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    const first = await ingest(baseOptions(), deps, post);
    const discover = first.passes.find((pass) => pass.kind === "trend.discover")!;
    const list = first.passes.find((pass) => pass.kind === "trend.list")!;
    expect(discover.counts).toMatchObject({ creatorsCreated: 2, videosCreated: 3, snapshotsInserted: 3 });
    expect(list.counts).toMatchObject({ creatorsListed: 2, videosCreated: 80, snapshotsInserted: 80 });
    const totalSnapshots = count("SELECT COUNT(*) AS n FROM trend_metric_snapshots");
    const totalVideos = count("SELECT COUNT(*) AS n FROM trend_videos");

    clock.now += HOUR_MS;
    const second = await ingest(baseOptions(), deps, post);
    expect(second.passes.find((pass) => pass.kind === "trend.discover")!.counts).toMatchObject({ creatorsCreated: 0, videosCreated: 0, snapshotsInserted: 0, snapshotsSkipped: 3 });
    // Already-listed creators are not re-listed by ingest; refresh owns that.
    expect(second.passes.some((pass) => pass.kind === "trend.list")).toBe(false);
    const again = await refresh({
      workspaceId, dueOnly: false, discover: false, platforms: ["tiktok"], perCreator: 60, maxCreators: 50,
      maxNewCreators: 10, concurrency: 1, budget: 100, discoveryDepth: 5, paid: { enabled: false, dailyCapUsd: null },
    }, deps, post);
    const snapshotPass = again.passes.find((pass) => pass.kind === "trend.snapshot")!;
    expect(snapshotPass.counts).toMatchObject({ creatorsListed: 2, videosCreated: 0, snapshotsInserted: 0, snapshotsSkipped: 80 });
    expect(count("SELECT COUNT(*) AS n FROM trend_metric_snapshots")).toBe(totalSnapshots);
    expect(count("SELECT COUNT(*) AS n FROM trend_videos")).toBe(totalVideos);
    // Runs record every pass.
    const kinds = new Set(recentTrendRuns({ workspaceId, limit: 50 }).map((run) => run.kind));
    expect([...kinds].sort()).toEqual(["trend.discover", "trend.label", "trend.list", "trend.score", "trend.snapshot"]);
  });

  test("scores against creator listings and ranks the breakout first", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    await ingest(baseOptions(), fakes(clock).deps, post);
    const top = queryTrendTop({ workspaceId, since: clock.now - 30 * DAY_MS, by: "outlier", limit: 5 });
    // The Explore survivor (820k views) is judged against its creator's listing baseline.
    expect(top[0]).toMatchObject({ platformVideoId: "7700000000000000201", discoveredVia: "explore-category:Technology", inListing: false });
    expect(top[0]!.score.label).toBe("breakout");
    const listed = top.find((row) => row.latest.views === 90_000)!;
    expect(listed.inListing).toBe(true);
    expect(listed.score.label).toBe("breakout");
    expect(listed.score.multiplier!).toBeGreaterThan(10);
    expect(listed.latest.viewsPrecision).toBe("exact");
    expect(top.every((row) => !row.score.flags.includes("thin"))).toBe(true);
  });

  test("a discovery-only video whose creator listing failed is never scored", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    await ingest(baseOptions(), fakes(clock, { failCreator: BRAVO }).deps, post);
    const bravo = findTrendVideo({ workspaceId, ref: "7700000000000000202" })!;
    expect(bravo.inListing).toBe(false);
    expect(bravo.score).toMatchObject({ multiplier: null, label: null, flags: ["no-listing"] });
    const failures = openDomainDb().query<{ listing_failures: number; last_list_error: string }, [string]>(
      "SELECT listing_failures, last_list_error FROM trend_creators WHERE platform_creator_id = ?",
    ).get(BRAVO)!;
    expect(failures.listing_failures).toBe(1);
    expect(failures.last_list_error).toMatch(/creator/);
  });

  test("a bot check trips the breaker, stops the source, and holds it during the cooldown", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const blocked = fakes(clock, { blockAll: true });
    const first = await ingest(baseOptions(), blocked.deps, post);
    const list = first.passes.find((pass) => pass.kind === "trend.list")!;
    expect(list.breaker).toMatchObject({ state: "tripped", reason: "bot-check" });
    expect(blocked.calls).toHaveLength(1);
    // Not the creators' fault: no failure is recorded against them.
    expect(count("SELECT COUNT(*) AS n FROM trend_creators WHERE listing_failures > 0")).toBe(0);

    clock.now += 10 * 60 * 1000;
    const retry = await ingest(baseOptions(), blocked.deps, post);
    expect(retry.skipped.join("\n")).toMatch(/ytdlp-tiktok-user: breaker tripped/);
    expect(blocked.calls).toHaveLength(1);
    const status = statusReport(workspaceId, clock.now);
    expect(status.breakers.find((breaker) => breaker.source === "ytdlp-tiktok-user")).toMatchObject({ state: "open (cooling down)", reason: "bot-check" });

    clock.now += 2 * HOUR_MS;
    const healthy = fakes(clock);
    const later = await ingest(baseOptions(), healthy.deps, post);
    expect(later.passes.find((pass) => pass.kind === "trend.list")!.counts.creatorsListed).toBe(2);
  });
});

describe("refresh scheduling", () => {
  test("tiers set the next listing time; --due selects only creators past it", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    await ingest(baseOptions(), deps, post);
    const listedAt = clock.now;
    const rows = openDomainDb().query<{ tier: string; next_list_at: number; last_listed_at: number }, []>(
      "SELECT tier, next_list_at, last_listed_at FROM trend_creators ORDER BY id",
    ).all();
    for (const row of rows) {
      expect(row.tier).toBe("active");
      expect(row.next_list_at - row.last_listed_at).toBe(24 * HOUR_MS);
    }
    expect(dueCreators({ workspaceId, now: listedAt + HOUR_MS, dueOnly: true, limit: 10 })).toHaveLength(0);
    expect(dueCreators({ workspaceId, now: listedAt + 25 * HOUR_MS, dueOnly: true, limit: 10 })).toHaveLength(2);

    // A watched creator (watchlist kind "creator") with a post younger than 72 h is hot: 6 h.
    const watch = upsertWatchlist({ workspaceId, platform: "tiktok", kind: "creator", value: "MS4wLjABAAAAfixtureCreatorDeltaSecUid0123456789abcdefghij", source: "tiktok-creator", niche: "tech-tips" });
    const delta = writeIngestBatch({
      workspaceId, runId: null, now: listedAt,
      creators: [{ platform: "tiktok", platformCreatorId: watch.value, discoveredVia: "creator:delta", watchlistId: watch.id }],
      videos: [{ creatorPlatformId: watch.value, platform: "tiktok", platformVideoId: "88888888", url: "u", postedAt: listedAt - 5 * HOUR_MS, discoveredVia: "listing", inListing: true }],
      listings: [{ platform: "tiktok", platformCreatorId: watch.value, at: listedAt, ok: true }],
    });
    const hot = openDomainDb().query<{ next_list_at: number }, [string]>("SELECT next_list_at FROM trend_creators WHERE id = ?").get(delta.creatorIds[0]!)!;
    expect(hot.next_list_at - listedAt).toBe(6 * HOUR_MS);

    // A creator whose newest post is 30 days old is inactive: weekly.
    const quiet = writeIngestBatch({
      workspaceId, runId: null, now: listedAt,
      creators: [{ platform: "tiktok", platformCreatorId: "MS4wLjABAAAAfixtureCreatorEchoSecUid01234567890abcdefghij", discoveredVia: "explore-category:Technology" }],
      videos: [{ creatorPlatformId: "MS4wLjABAAAAfixtureCreatorEchoSecUid01234567890abcdefghij", platform: "tiktok", platformVideoId: "77777777", url: "u", postedAt: listedAt - 30 * DAY_MS, discoveredVia: "listing", inListing: true }],
      listings: [{ platform: "tiktok", platformCreatorId: "MS4wLjABAAAAfixtureCreatorEchoSecUid01234567890abcdefghij", at: listedAt, ok: true }],
    });
    const inactive = openDomainDb().query<{ tier: string; next_list_at: number }, [string]>("SELECT tier, next_list_at FROM trend_creators WHERE id = ?").get(quiet.creatorIds[0]!)!;
    expect(inactive).toEqual({ tier: "inactive", next_list_at: listedAt + 7 * DAY_MS });
  });

  test("a later refresh in a new checkpoint bucket appends snapshot history and measures momentum", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    await ingest(baseOptions(), deps, post);
    const before = count("SELECT COUNT(*) AS n FROM trend_metric_snapshots");
    clock.now += 3 * DAY_MS;
    const later = await refresh({
      workspaceId, dueOnly: true, discover: false, platforms: ["tiktok"], perCreator: 60, maxCreators: 50,
      maxNewCreators: 0, concurrency: 1, budget: 100, discoveryDepth: 5, paid: { enabled: false, dailyCapUsd: null },
    }, deps, post);
    const pass = later.passes.find((entry) => entry.kind === "trend.snapshot")!;
    // The listing window moved by three days: three new videos per creator, older ones cross a bucket.
    expect(pass.counts.newVideosDetected).toBe(6);
    expect(count("SELECT COUNT(*) AS n FROM trend_metric_snapshots")).toBeGreaterThan(before);
  });
});

describe("refresh scheduling by attention tier (#577)", () => {
  test("--due follows the computed tier by default, the stored tier on request, and records the tier per creator", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps, calls } = fakes(clock);
    await ingest(baseOptions(), deps, post);
    const listedCalls = calls.length;
    // Push the stored next listing time out: the stored #556 tier sees nobody due.
    openDomainDb().prepare("UPDATE trend_creators SET next_list_at = ?").run(clock.now + 10 * DAY_MS);
    clock.now += 25 * HOUR_MS;
    const options = {
      workspaceId, dueOnly: true, discover: false, platforms: ["tiktok" as const], perCreator: 60, maxCreators: 50,
      maxNewCreators: 0, concurrency: 1, budget: 100, discoveryDepth: 5, paid: { enabled: false, dailyCapUsd: null },
    };
    const stored = await refresh({ ...options, tierSource: "stored" }, deps, post);
    expect(stored.passes.some((pass) => pass.kind === "trend.snapshot")).toBe(false);
    expect(stored.scheduling).toMatchObject({ tierSource: "stored", byPlatform: { tiktok: { active: { creators: 2, due: 0, selected: 0 } } }, creators: [] });
    expect(calls.length).toBe(listedCalls);

    // Daily posters with a breakout in 30 days are `watched`: daily, so due after 25 h.
    const computed = await refresh(options, deps, post);
    expect(computed.scheduling.tierSource).toBe("computed");
    expect(computed.scheduling.cadenceHours).toEqual({ hot: 6, watched: 24, background: 168, dropped: null });
    expect(computed.scheduling.byPlatform.tiktok).toEqual({ watched: { creators: 2, due: 2, selected: 2 } });
    expect(computed.scheduling.creators).toHaveLength(2);
    for (const entry of computed.scheduling.creators) expect(entry).toMatchObject({ platform: "tiktok", tier: "watched", cadenceHours: 24, selectedBy: "due" });
    const pass = computed.passes.find((entry) => entry.kind === "trend.snapshot")!;
    expect(pass.counts.creatorsListed).toBe(2);
    const metadata = JSON.parse(openDomainDb().query<{ metadata_json: string }, [string]>("SELECT metadata_json FROM runs WHERE id = ?").get(pass.runId!)!.metadata_json) as { tierSource: string; tierByCreator: Record<string, string> };
    expect(metadata.tierSource).toBe("computed");
    expect(Object.values(metadata.tierByCreator)).toEqual(["watched", "watched"]);

    // An hour later nobody is due under the daily cadence.
    clock.now += HOUR_MS;
    const later = await refresh(options, deps, post);
    expect(later.passes.some((entry) => entry.kind === "trend.snapshot")).toBe(false);
    expect(later.scheduling.byPlatform.tiktok).toEqual({ watched: { creators: 2, due: 0, selected: 0 } });
  });
});

describe("paid sources are off by default and capped", () => {
  const reel = (shortCode: string, postedAt: number, plays: number) => ({
    shortCode, url: `https://www.instagram.com/reel/${shortCode}/`, ownerId: "5500000001", ownerUsername: "fixture.reels",
    caption: "fixture reel", timestamp: new Date(postedAt).toISOString(), videoPlayCount: plays, likesCount: 10, commentsCount: 1, videoDuration: 20,
  });

  test("no Apify call runs without --paid and a cap; with them, spend is capped and recorded", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    const apifyCalls: Array<{ actorId: string; maxItems: number; maxTotalChargeUsd: number; input: unknown }> = [];
    deps.apify = async (input) => {
      apifyCalls.push(input as never);
      const urls = ((input.input as { directUrls?: string[] }).directUrls ?? []);
      return { items: urls.map((url, index) => reel(url.split("/").at(-2)!, clock.now - 2 * DAY_MS, 5_000 + index)), run: { id: "apify-run-1", usageTotalUsd: 0.0123 } };
    };
    const paidIngest = await ingest(baseOptions({ source: "apify-instagram", seeds: ["fixture.reels"], niche: "ai-tools" }), deps, post);
    expect(apifyCalls).toHaveLength(0);
    expect(paidIngest.passes.find((pass) => pass.kind === "trend.discover")!.notes.join(" ")).toMatch(/paid-disabled/);

    // Seed two reels at the day-2 checkpoint age, then refresh Instagram.
    writeIngestBatch({
      workspaceId, runId: null, now: clock.now,
      creators: [{ platform: "instagram", platformCreatorId: "5500000001", handle: "fixture.reels", discoveredVia: "manual" }],
      videos: ["FixtureRe1", "FixtureRe2"].map((code) => ({ creatorPlatformId: "5500000001", platform: "instagram" as const, platformVideoId: code, url: `https://www.instagram.com/reel/${code}/`, postedAt: clock.now - 2 * DAY_MS, discoveredVia: "manual", inListing: true })),
    });
    const refreshOptions = {
      workspaceId, dueOnly: true, discover: false, platforms: ["instagram" as const], perCreator: 12, maxCreators: 50,
      maxNewCreators: 0, concurrency: 1, budget: 10, discoveryDepth: 5,
    };
    const off = await refresh({ ...refreshOptions, paid: { enabled: false, dailyCapUsd: null } }, deps, post);
    expect(off.skipped.join(" ")).toMatch(/2 reel checkpoint\(s\) due; paid sources are off/);
    expect(apifyCalls).toHaveLength(0);

    const on = await refresh({ ...refreshOptions, paid: { enabled: true, dailyCapUsd: 0.004 } }, deps, post);
    expect(apifyCalls).toHaveLength(1);
    // $0.004 cap minus the $0.001 run fee fits one reel at $0.0023.
    expect(apifyCalls[0]).toMatchObject({ actorId: "apify/instagram-reel-scraper", maxItems: 1, maxTotalChargeUsd: 0.004 });
    const pass = on.passes.find((entry) => entry.source === "apify-instagram")!;
    expect(pass.costUsd).toBe(0.0123);
    expect(pass.counts.snapshotsInserted).toBe(1);
    const status = statusReport(workspaceId, clock.now);
    expect(status.apify.today).toEqual([{ actorId: "apify/instagram-reel-scraper", usd: 0.0123, runs: 1 }]);

    // The day's spend now exceeds the cap: the next refresh refuses before calling Apify.
    const capped = await refresh({ ...refreshOptions, paid: { enabled: true, dailyCapUsd: 0.004 } }, deps, post);
    expect(apifyCalls).toHaveLength(1);
    expect(capped.skipped.join(" ")).toMatch(/daily cap/);
  });
});

describe("portability and consumers", () => {
  test("workspace export/import carries trend history but not the baseline caches", async () => {
    const clock = { now: Date.now() };
    await ingest(baseOptions(), fakes(clock).deps, post);
    const video = findTrendVideo({ workspaceId, ref: "7700000000000000201" })!;
    linkTrendDigest({ workspaceId, videoId: video.id, refKind: "bundle", digestRef: "cache/digests/abc/digest" });
    const expected = {
      watchlists: count("SELECT COUNT(*) AS n FROM trend_watchlists WHERE workspace_id = ?", workspaceId),
      creators: count("SELECT COUNT(*) AS n FROM trend_creators WHERE workspace_id = ?", workspaceId),
      videos: count("SELECT COUNT(*) AS n FROM trend_videos WHERE workspace_id = ?", workspaceId),
      snapshots: count("SELECT COUNT(*) AS n FROM trend_metric_snapshots s JOIN trend_videos v ON v.id = s.video_id WHERE v.workspace_id = ?", workspaceId),
      labels: count("SELECT COUNT(*) AS n FROM trend_cohort_labels l JOIN trend_videos v ON v.id = l.video_id WHERE v.workspace_id = ?", workspaceId),
      creatorSnapshots: count("SELECT COUNT(*) AS n FROM trend_creator_snapshots s JOIN trend_creators c ON c.id = s.creator_id WHERE c.workspace_id = ?", workspaceId),
    };
    expect(count("SELECT COUNT(*) AS n FROM trend_baselines")).toBeGreaterThan(0);
    const exported = await exportWorkspacePackage({ workspaceId });
    expect(exported.manifestSummary.entityCounts).toMatchObject({ trend_video: expected.videos, trend_metric_snapshot: expected.snapshots });
    expect(exported.manifestSummary.entityCounts).not.toHaveProperty("trend_baseline");
    const imported = await importWorkspacePackage({ packageObjectId: exported.packageObjectId, idempotencyKey: "trend-roundtrip", workspaceSlug: "corpus-copy", limit: 10 });
    const target = imported.workspaceId;
    expect(target).not.toBe(workspaceId);
    expect({
      watchlists: count("SELECT COUNT(*) AS n FROM trend_watchlists WHERE workspace_id = ?", target),
      creators: count("SELECT COUNT(*) AS n FROM trend_creators WHERE workspace_id = ?", target),
      videos: count("SELECT COUNT(*) AS n FROM trend_videos WHERE workspace_id = ?", target),
      snapshots: count("SELECT COUNT(*) AS n FROM trend_metric_snapshots s JOIN trend_videos v ON v.id = s.video_id WHERE v.workspace_id = ?", target),
      labels: count("SELECT COUNT(*) AS n FROM trend_cohort_labels l JOIN trend_videos v ON v.id = l.video_id WHERE v.workspace_id = ?", target),
      creatorSnapshots: count("SELECT COUNT(*) AS n FROM trend_creator_snapshots s JOIN trend_creators c ON c.id = s.creator_id WHERE c.workspace_id = ?", target),
    }).toEqual(expected);
    expect(count("SELECT COUNT(*) AS n FROM trend_baselines b JOIN trend_creators c ON c.id = b.creator_id WHERE c.workspace_id = ?", target)).toBe(0);
    const copy = findTrendVideo({ workspaceId: target, ref: "7700000000000000201" })!;
    expect(copy.id).not.toBe(video.id);
    expect(copy.score.label).toBe(video.score.label);
    expect(count("SELECT COUNT(*) AS n FROM trend_video_digests WHERE video_id = ?", copy.id)).toBe(1);
  });

  test("the corpus implements the #558 CohortBaselineProvider for analytics report", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    await ingest(baseOptions(), fakes(clock).deps, post);
    const provider = trendCohortProvider({ workspaceId, niches: ["tech-tips"], now: clock.now });
    const views = provider.baseline({ platform: "tiktok", metric: "views", postedAt: clock.now - 10 * DAY_MS })!;
    expect(views.n).toBeGreaterThanOrEqual(20);
    expect(views.median).toBeGreaterThan(1_000);
    expect(views.label).toMatch(/Ralphy estimate/);
    expect(provider.baseline({ platform: "tiktok", metric: "avg-watch-pct" })).toBeNull();
    expect(provider.baseline({ platform: "linkedin", metric: "views" })).toBeNull();
    expect(trendCohortProvider({ workspaceId, niches: ["fitness"], now: clock.now }).baseline({ platform: "tiktok", metric: "views" })).toBeNull();

    const report = buildOutcomeReport({
      workspaceId: "ws_consumer",
      projectId: null,
      units: [{
        unitId: "unit_1", slug: "one", format: "video", workspaceId: "ws_consumer", projectId: null, projectSlug: null, createdAt: 1, ledger: null,
        observations: [{
          publicationId: "pub_1", platform: "tiktok", publicationState: "published", publishedAt: clock.now - 10 * DAY_MS, url: null, snapshotCount: 1,
          snapshot: { id: "metric_1", source: "import", asOf: clock.now, views: 2_000, likes: 10, comments: 1, shares: 1, watchTimeMs: null, avgViewDurationSec: null, retentionCurve: null, createdAt: clock.now },
          importFacts: null,
        }],
      }],
      decisionsFor: () => ({ decisions: {}, ledger: "none" }),
      options: { ...DEFAULT_REPORT_OPTIONS, cohort: provider },
    });
    expect(report.cohort.status).toBe("ok");
    expect(report.cohort.rows[0]).toMatchObject({ platform: "tiktok", metric: "views", workspaceMedian: 2_000, cohortN: views.n });
  });
});
