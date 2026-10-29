// #590: the 90-day freshness window. Collection (ingest, refresh, niche init
// backfill) skips listed videos posted before the window and stores undated
// ones as freshness-unknown; analysis (niche report, signals, series) leaves
// older and undated rows out, counts them, and deletes nothing.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { writeIngestBatch } from "../../cli/lib/store/trends.js";
import { addNicheCandidates, upsertNiche, writeGateResults, type NicheDto } from "../../cli/lib/store/trend-niches.js";
import { ingest, listingPass, refresh, scorePass, type IngestOptions, type TrendDeps } from "../../cli/lib/trends/ingest.js";
import { FRESHNESS_UNKNOWN, YOUTUBE_NEWEST_PER_CHANNEL } from "../../cli/lib/trends/freshness.js";
import { DAY_MS, HOUR_MS } from "../../cli/lib/trends/math.js";
import { DEFAULT_NICHE_SETTINGS } from "../../cli/lib/trends/niche.js";
import { buildNicheReport } from "../../cli/lib/trends/niche-report.js";
import { buildNicheSignals } from "../../cli/lib/trends/signal-engine.js";
import type { XhrCapturer } from "../../cli/lib/trends/sources/tiktok.js";
import type { YtdlpRunner } from "../../cli/lib/trends/sources/ytdlp.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "trends");
const exploreBody = fs.readFileSync(path.join(FIXTURES, "tiktok-explore-item-list.json"), "utf8");
const listingTemplate = JSON.parse(fs.readFileSync(path.join(FIXTURES, "tiktok-listing.jsonl"), "utf8").split("\n").find((line) => line.startsWith("{"))!) as Record<string, unknown>;
const channelLines = fs.readFileSync(path.join(FIXTURES, "youtube-channel-shorts.jsonl"), "utf8");

let tmp: TmpRoot;
let workspaceId: string;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-trends-freshness");
  workspaceId = createWorkspace({ slug: "corpus", name: "Corpus" }).id;
});
afterEach(() => {
  closeDomainDb();
  tmp.cleanup();
});

/** Two digits per creator so listing ids never collide across creators. */
const creatorDigits = (secUid: string) => String(([...secUid].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1_000_003, 7) % 90) + 10);

/** One post a day for `days` days before `now`, plus a pinned post from 2024 at the top of the listing. */
function tiktokListing(secUid: string, now: number, days = 120): string {
  const today = Math.floor(now / DAY_MS);
  const pinned = { ...listingTemplate, id: "7300000000000000001", channel_id: secUid, timestamp: Math.floor(Date.UTC(2024, 4, 14, 12) / 1000), view_count: 5_000_000 };
  const posts = Array.from({ length: days }, (_, index) => {
    const day = today - index - 1;
    return { ...listingTemplate, id: `77${String(day).padStart(8, "0")}${creatorDigits(secUid)}`, channel_id: secUid, timestamp: Math.floor((day * DAY_MS + 12 * HOUR_MS) / 1000), view_count: 1_000 + (day % 7) * 60 };
  });
  return [pinned, ...posts].map((entry) => JSON.stringify(entry)).join("\n");
}

function fakes(clock: { now: number }) {
  const calls: string[][] = [];
  const ytdlp: YtdlpRunner = async (args) => {
    calls.push(args);
    const target = args.at(-1)!;
    if (target.includes("youtube.com")) return { code: 0, stdout: channelLines, stderr: "", ms: 1, timedOut: false };
    return { code: 0, stdout: tiktokListing(target.replace(/^tiktokuser:/, ""), clock.now), stderr: "", ms: 1, timedOut: false };
  };
  const capture: XhrCapturer = async () => ({ bodies: [exploreBody], pageBlock: null, region: "US", ms: 1 });
  const deps: TrendDeps = { ytdlp, capture, now: () => clock.now };
  return { deps, calls };
}

const options = (overrides: Partial<IngestOptions> = {}): IngestOptions => ({
  workspaceId,
  source: "tiktok-explore",
  seeds: ["Technology"],
  niche: "tech-tips",
  perCreator: 200,
  maxCreators: 50,
  concurrency: 1,
  discoveryDepth: 5,
  budget: 100,
  paid: { enabled: false, dailyCapUsd: null },
  ...overrides,
});
const post = { llm: false, llmLimit: 0, refit: false };

const scalar = (sql: string, ...values: Array<string | number>) => openDomainDb().query<{ n: number }, Array<string | number>>(sql).get(...values)?.n ?? 0;

describe("collection cutoff (--max-age-days)", () => {
  test("ingest skips TikTok listing videos posted before the window, including a pinned old post", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    const summary = await ingest(options(), deps, post);
    const list = summary.passes.find((pass) => pass.kind === "trend.list")!;
    // 120 daily posts + 1 pinned 2024 post per creator; posts 1-90 days old stay.
    expect(list.counts.creatorsListed).toBe(2);
    expect(list.counts.videosSkippedOld).toBe(2 * (120 - 90 + 1));
    expect(list.counts.videosCreated).toBe(2 * 90);
    expect(list.notes.some((note) => /posted more than 90 days ago skipped/.test(note))).toBe(true);
    const cutoff = clock.now - 90 * DAY_MS;
    expect(scalar("SELECT COUNT(*) AS n FROM trend_videos WHERE posted_at < ?", cutoff)).toBe(0);
    expect(scalar("SELECT COUNT(*) AS n FROM trend_videos WHERE platform_video_id = '7300000000000000001'")).toBe(0);
  });

  test("a wider --max-age-days keeps more; the window is recorded on the listing run", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    const summary = await ingest(options({ maxAgeDays: 200 }), deps, post);
    const list = summary.passes.find((pass) => pass.kind === "trend.list")!;
    expect(list.counts.videosSkippedOld).toBe(2); // only the pinned 2024 posts
    expect(list.counts.videosCreated).toBe(2 * 120);
    const metadata = openDomainDb().query<{ metadata_json: string }, [string]>("SELECT metadata_json FROM runs WHERE id = ?").get(list.runId)!;
    expect(JSON.parse(metadata.metadata_json)).toMatchObject({ maxAgeDays: 200 });
  });

  test("refresh skips videos that aged out of the window and adds no snapshot for them", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    await ingest(options(), deps, post);
    const before = scalar("SELECT COUNT(*) AS n FROM trend_videos");
    clock.now += 30 * DAY_MS;
    const summary = await refresh({ workspaceId, dueOnly: false, discover: false, platforms: ["tiktok"], perCreator: 200, maxCreators: 50, maxNewCreators: 0, concurrency: 1, budget: 100, discoveryDepth: 5, paid: { enabled: false, dailyCapUsd: null } }, deps, post);
    const list = summary.passes.find((pass) => pass.kind === "trend.snapshot")!;
    // The listing now reaches 120 days back from the later clock: 30 new days, 60 still fresh, the rest aged out.
    expect(list.counts.videosSkippedOld).toBe(2 * (120 - 90 + 1));
    expect(list.counts.newVideosDetected).toBe(2 * 30);
    expect(scalar("SELECT COUNT(*) AS n FROM trend_videos")).toBe(before + 2 * 30);
    // Videos that aged out stay stored (append-only) but got no new snapshot in this pass.
    const agedOut = scalar(
      "SELECT COUNT(*) AS n FROM trend_videos v WHERE v.posted_at < ? AND EXISTS (SELECT 1 FROM trend_metric_snapshots s WHERE s.video_id = v.id AND s.run_id = ?)",
      clock.now - 90 * DAY_MS, list.runId,
    );
    expect(agedOut).toBe(0);
    expect(scalar("SELECT COUNT(*) AS n FROM trend_videos WHERE posted_at < ?", clock.now - 90 * DAY_MS)).toBe(2 * 30);
  });

  test("YouTube lists only the newest entries per channel and stores undated videos as freshness-unknown", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps, calls } = fakes(clock);
    const summary = await ingest(options({ source: "youtube-channel", seeds: ["UCfixtureChannelAlpha0001"], niche: "ai-tools", perCreator: 60 }), deps, post);
    const list = summary.passes.find((pass) => pass.kind === "trend.list")!;
    const listing = calls.find((args) => args.at(-1)!.includes("youtube.com"))!;
    expect(listing[listing.indexOf("--playlist-end") + 1]).toBe(String(YOUTUBE_NEWEST_PER_CHANNEL));
    expect(list.counts.videosFreshnessUnknown).toBe(2);
    expect(list.notes.some((note) => /stored freshness-unknown/.test(note))).toBe(true);
    const rows = openDomainDb().query<{ posted_at: number | null; posted_at_source: string | null }, []>("SELECT posted_at, posted_at_source FROM trend_videos WHERE platform = 'youtube'").all();
    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.posted_at === null && row.posted_at_source === FRESHNESS_UNKNOWN)).toBe(true);
  });

  test("a later dated sample replaces the freshness-unknown flag with its own source", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const creator = { platform: "youtube" as const, platformCreatorId: "UCdated", discoveredVia: "manual" };
    const video = { creatorPlatformId: "UCdated", platform: "youtube" as const, platformVideoId: "datedAAAAA1", url: "https://www.youtube.com/shorts/datedAAAAA1", discoveredVia: "listing", inListing: true };
    writeIngestBatch({ workspaceId, runId: null, now: clock.now, creators: [creator], videos: [{ ...video, postedAt: null }] });
    const source = () => openDomainDb().query<{ posted_at_source: string | null }, []>("SELECT posted_at_source FROM trend_videos").get()!.posted_at_source;
    expect(source()).toBe(FRESHNESS_UNKNOWN);
    writeIngestBatch({ workspaceId, runId: null, now: clock.now, creators: [], videos: [{ ...video, postedAt: clock.now - 5 * DAY_MS, postedAtSource: "ytdlp-yt-watch" }] });
    expect(source()).toBe("ytdlp-yt-watch");
  });

  test("the listing pass used by niche init backfill applies the same cutoff", async () => {
    const clock = { now: Date.UTC(2026, 9, 28, 12) };
    const { deps } = fakes(clock);
    const secUid = "MS4wLjABAAAAfixtureCreatorBackfill0123456789abcdefghijkl";
    writeIngestBatch({ workspaceId, runId: null, now: clock.now, creators: [{ platform: "tiktok", platformCreatorId: secUid, discoveredVia: "manual" }], videos: [] });
    const creatorId = openDomainDb().query<{ id: string }, []>("SELECT id FROM trend_creators").get()!.id;
    const pass = await listingPass({
      workspaceId, platform: "tiktok", perCreator: 200, concurrency: 1, budget: 10, kind: "trend.list", deps, maxAgeDays: 30,
      creators: [{ id: creatorId, platform: "tiktok", platformCreatorId: secUid, handle: null, tier: "active", lastListedAt: null, nextListAt: null, niche: null, watchlistId: null }],
    });
    expect(pass.counts).toMatchObject({ videosCreated: 30, videosSkippedOld: 120 - 30 + 1 });
  });
});

// ─── Analysis exclusion ─────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 9, 30, 12);

/** A kept TikTok creator with fresh, old (2024 / 200-day), and undated rows already in the store. */
function seedNiche(): NicheDto {
  const niche = upsertNiche({ workspaceId, slug: "psychology", topic: "psychology", languages: ["en"], platforms: ["tiktok"], parentNiche: null, taxonomy: { subNiches: [], lexicon: {} } as never, settings: { ...DEFAULT_NICHE_SETTINGS, noiseFloorViews: 1_000 }, seedSource: "file", now: NOW });
  const secUid = "MS4wLjABAAAAfixtureCreatorAnalysis0123456789abcdefghijkl";
  const fresh = Array.from({ length: 30 }, (_, index) => ({ id: `71${String(index).padStart(10, "0")}`, postedAt: NOW - (index + 5) * DAY_MS, views: index === 0 ? 90_000 : 2_000 }));
  const old = Array.from({ length: 20 }, (_, index) => ({ id: `72${String(index).padStart(10, "0")}`, postedAt: NOW - (200 + index) * DAY_MS, views: index === 0 ? 900_000 : 2_000 }));
  const batch = writeIngestBatch({
    workspaceId, runId: null, now: NOW,
    creators: [{ platform: "tiktok", platformCreatorId: secUid, handle: "analysis", followerCount: 20_000, discoveredVia: "seed" }],
    videos: [
      ...[...fresh, ...old].map((video) => ({ creatorPlatformId: secUid, platform: "tiktok" as const, platformVideoId: video.id, url: `https://www.tiktok.com/@analysis/video/${video.id}`, title: `anxiety tip ${video.id}`, postedAt: video.postedAt, discoveredVia: "listing", inListing: true, snapshot: { asOf: NOW, source: "ytdlp-tiktok-user", views: video.views, likes: Math.round(video.views / 20), comments: 5, shares: 3, saves: 2 } })),
      ...Array.from({ length: 4 }, (_, index) => ({ creatorPlatformId: secUid, platform: "tiktok" as const, platformVideoId: `73${String(index).padStart(10, "0")}`, url: `https://www.tiktok.com/@analysis/video/73${index}`, title: "undated", postedAt: null, discoveredVia: "listing", inListing: true, snapshot: { asOf: NOW, source: "ytdlp-tiktok-user", views: 3_000 } })),
    ],
    listings: [{ platform: "tiktok", platformCreatorId: secUid, at: NOW, ok: true }],
  });
  addNicheCandidates({ nicheId: niche.id, runId: null, now: NOW, entries: batch.creatorIds.map((creatorId) => ({ creatorId, via: "seed", round: 0 })) });
  writeGateResults({
    nicheId: niche.id, nicheSlug: niche.slug, runId: null, now: NOW,
    results: batch.creatorIds.map((creatorId) => ({ creatorId, status: "kept" as const, reason: "on-topic", method: "rule" as const, language: "en", relevance: 0.9, sampled: 9, onTopic: 8, subNiche: null, subNicheConfidence: null, evidence: {} })),
  });
  scorePass({ workspaceId, now: NOW, refit: false });
  return niche;
}

describe("analysis exclusion (no deletion)", () => {
  test("the niche report and signals leave old and undated rows out and count them", () => {
    const niche = seedNiche();
    const total = scalar("SELECT COUNT(*) AS n FROM trend_videos");
    const report = buildNicheReport({ niche, now: NOW, options: { language: "en", sinceDays: 365 } });
    expect(report.settings).toMatchObject({ sinceDays: 90, maxAgeDays: 90, sinceClamped: true });
    expect(report.coverage.videos.excluded).toMatchObject({ olderThanWindow: 20, undated: 4, windowDays: 90 });
    const cutoff = NOW - 90 * DAY_MS;
    const shown = [...report.whatToCopy.items, ...report.topOutliers.overall];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.some((item) => item.url.endsWith("720000000000"))).toBe(false); // the 200-day-old 900k hit
    expect(shown.every((item) => item.postedAt !== null && Date.parse(item.postedAt) >= cutoff)).toBe(true);
    expect(shown.every((item) => item.scorecard !== null && item.scorecard.posted.ageDays! <= 90)).toBe(true);

    const signals = buildNicheSignals({ niche, now: NOW, options: { language: "en", sinceDays: 120, widenSinceDays: 400 } });
    expect(signals.scope).toMatchObject({ sinceDays: 90, widenSinceDays: 90, maxAgeDays: 90 });
    expect(signals.coverage.excluded).toMatchObject({ olderThanWindow: 20, undated: 4 });
    const rows = [...signals.references.rows, ...signals.signals.filter((row) => "scorecard" in row)] as Array<{ postedAt: string | null; scorecard: { posted: { ageDays: number | null } } | null }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.postedAt !== null && Date.parse(row.postedAt) >= cutoff)).toBe(true);
    expect(signals.notes.some((note) => /--widen-since 400d was clamped/.test(note))).toBe(true);
    // The breakout reference carries a verdict with explicit rule reasons.
    const breakout = signals.references.rows.find((row) => row.url?.endsWith("710000000000"));
    expect(breakout?.scorecard?.verdict).toMatch(/^(adapt|test)$/);
    expect(breakout?.scorecard?.reasons.length).toBeGreaterThan(0);
    // Nothing was deleted.
    expect(scalar("SELECT COUNT(*) AS n FROM trend_videos")).toBe(total);
  });
});
