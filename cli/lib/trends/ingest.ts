// Trend corpus ingest, refresh, label, and score passes (#556).
//
// Creator-first: a discovery source (Explore category, sound page, hashtag
// page, search, explicit creator ids, or a paid Apify seed) only yields
// creators; each creator's own listing returns its recent videos with
// metrics and is the unit of refresh. Every pass is a `runs` row
// (`trend.discover`, `trend.list`, `trend.snapshot`, `trend.label`,
// `trend.score`) and every snapshot / label row points at it.
//
// Headless and safe to re-run: entities upsert on platform ids, snapshots
// insert once per checkpoint bucket, and a per-source circuit breaker stops a
// method on the first bot check, CAPTCHA, login wall, or empty-body streak.

import { finishRun, finishRunAttempt, startRun, startRunAttempt } from "../store/runs.js";
import type { JsonValue } from "../store/types.js";
import {
  dueCreators,
  dueWatchlists,
  insertTrendLabels,
  instagramCheckpointDue,
  loadLabelCandidates,
  loadMaturityPairs,
  loadScoringInput,
  markWatchlistRun,
  recentTrendRuns,
  setCreatorNiche,
  trendApifySpend,
  upsertWatchlist,
  writeIngestBatch,
  writeTrendScores,
  youtubeApiCandidates,
  type DueCreatorDto,
  type IngestBatchResult,
  type TrendCreatorInput,
  type TrendVideoInput,
  type WatchlistDto,
  type WatchlistKind,
} from "../store/trends.js";
import { BREAKER_COOLDOWN_MS, CircuitBreaker, openTrip, type BreakerState, type ProbeOutcome } from "./breaker.js";
import { LLM_BATCH_SIZE, LLM_LABEL_MODEL, deterministicLabels, llmLabelPrompt, parseLlmLabels, type LlmCaller } from "./cohorts.js";
import {
  COHORT_WINDOW_DAYS,
  DAY_MS,
  MATURITY_PRIORS,
  TREND_PLATFORMS,
  WINDOW_K,
  formatKeyFor,
  refitMaturity,
  type MaturityCurve,
  type TrendMetric,
  type TrendPlatform,
} from "./math.js";
import { cohortStats, creatorBaselineRows, scoreCreator } from "./score.js";
import {
  EXPLORE_XHR,
  SOUND_XHR,
  TIKTOK_APIFY_SOURCE,
  TIKTOK_EXPLORE_SOURCE,
  TIKTOK_LISTING_SOURCE,
  TIKTOK_SOUND_SOURCE,
  discoveryFromCapture,
  exploreUrl,
  isSecUid,
  listTiktokCreator,
  soundUrl,
  type XhrCapturer,
} from "./sources/tiktok.js";
import {
  YOUTUBE_API_SOURCE,
  YOUTUBE_HASHTAG_SOURCE,
  YOUTUBE_LISTING_SOURCE,
  YOUTUBE_SEARCH_SOURCE,
  discoverYoutubeHashtag,
  discoverYoutubeSearch,
  listYoutubeChannelShorts,
  youtubeShortUrl,
} from "./sources/youtube.js";
import {
  PAID_ACTORS,
  affordableResults,
  estimatedCostUsd,
  instagramReelInput,
  parseApifyTiktokItems,
  parseInstagramReelItems,
  tiktokSeedInput,
  type PaidSource,
} from "./sources/paid.js";
import type { YtdlpRunner } from "./sources/ytdlp.js";
import type { DiscoveryResult, ListingResult, SourceCreator, SourceVideo } from "./sources/types.js";
import type { YouTubeVideoDetails } from "../providers/youtube-analytics.js";

export const TREND_SOURCES = [
  "tiktok-explore",
  "tiktok-sound",
  "tiktok-creator",
  "youtube-hashtag",
  "youtube-search",
  "youtube-channel",
  "apify-tiktok",
  "apify-instagram",
] as const;
export type TrendSource = (typeof TREND_SOURCES)[number];

export function isTrendSource(value: unknown): value is TrendSource {
  return typeof value === "string" && (TREND_SOURCES as readonly string[]).includes(value);
}

const SOURCE_FACTS: Record<TrendSource, { platform: TrendPlatform; kind: WatchlistKind; discovery: string; listing: string | null; paid: boolean }> = {
  "tiktok-explore": { platform: "tiktok", kind: "explore-category", discovery: TIKTOK_EXPLORE_SOURCE, listing: TIKTOK_LISTING_SOURCE, paid: false },
  "tiktok-sound": { platform: "tiktok", kind: "sound", discovery: TIKTOK_SOUND_SOURCE, listing: TIKTOK_LISTING_SOURCE, paid: false },
  "tiktok-creator": { platform: "tiktok", kind: "creator", discovery: "manual", listing: TIKTOK_LISTING_SOURCE, paid: false },
  "youtube-hashtag": { platform: "youtube", kind: "hashtag", discovery: YOUTUBE_HASHTAG_SOURCE, listing: YOUTUBE_LISTING_SOURCE, paid: false },
  "youtube-search": { platform: "youtube", kind: "keyword", discovery: YOUTUBE_SEARCH_SOURCE, listing: YOUTUBE_LISTING_SOURCE, paid: false },
  "youtube-channel": { platform: "youtube", kind: "creator", discovery: "manual", listing: YOUTUBE_LISTING_SOURCE, paid: false },
  "apify-tiktok": { platform: "tiktok", kind: "hashtag", discovery: TIKTOK_APIFY_SOURCE, listing: TIKTOK_LISTING_SOURCE, paid: true },
  "apify-instagram": { platform: "instagram", kind: "creator", discovery: "apify-instagram", listing: null, paid: true },
};

export const LISTING_SOURCE_BY_PLATFORM: Record<TrendPlatform, string> = {
  tiktok: TIKTOK_LISTING_SOURCE,
  youtube: YOUTUBE_LISTING_SOURCE,
  instagram: "apify-instagram",
};

export type ApifyRunner = (input: {
  actorId: string;
  input: unknown;
  maxItems: number;
  maxTotalChargeUsd: number;
}) => Promise<{ items: unknown[]; run: { id: string; usageTotalUsd: number | null } }>;

export interface TrendDeps {
  ytdlp: YtdlpRunner;
  capture: XhrCapturer;
  /** Present only when the Apify connector is configured. */
  apify?: ApifyRunner;
  /** Present only when the YouTube connector is configured. */
  youtubeDetails?: (ids: readonly string[]) => Promise<YouTubeVideoDetails[]>;
  /** Present only when `--llm` is set. */
  llm?: LlmCaller;
  now: () => number;
  /** Progress to stderr (never stdout). */
  log?: (event: Record<string, JsonValue>) => void;
  /** Pause between requests per worker (ms). */
  paceMs?: number;
}

export interface PaidOptions {
  enabled: boolean;
  dailyCapUsd: number | null;
}

export interface TrendPassSummary {
  runId: string;
  kind: string;
  source: string;
  requests: number;
  breaker: BreakerState;
  counts: Record<string, number>;
  notes: string[];
  costUsd?: number;
}

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

async function pool<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!);
    }
  });
  await Promise.all(lanes);
}

/** Refuse a source whose breaker tripped inside the cooldown. */
export function cooldownFor(workspaceId: string, source: string, now: number, cooldownMs = BREAKER_COOLDOWN_MS) {
  return openTrip(recentTrendRuns({ workspaceId, limit: 500 }), source, now, cooldownMs);
}

function emptyCounts(): Record<string, number> {
  return {
    seeds: 0,
    creatorsFound: 0,
    creatorsCreated: 0,
    videosFound: 0,
    videosCreated: 0,
    videosUpdated: 0,
    snapshotsInserted: 0,
    snapshotsSkipped: 0,
    unresolvedVideoIds: 0,
    creatorsListed: 0,
    creatorsFailed: 0,
    newVideosDetected: 0,
  };
}

function addBatch(counts: Record<string, number>, result: IngestBatchResult): void {
  counts.creatorsCreated = (counts.creatorsCreated ?? 0) + result.creatorsCreated;
  counts.videosCreated = (counts.videosCreated ?? 0) + result.videosCreated;
  counts.videosUpdated = (counts.videosUpdated ?? 0) + result.videosUpdated;
  counts.snapshotsInserted = (counts.snapshotsInserted ?? 0) + result.snapshotsInserted;
  counts.snapshotsSkipped = (counts.snapshotsSkipped ?? 0) + result.snapshotsSkipped;
}

function creatorInput(creator: SourceCreator, extra: { discoveredVia: string; watchlistId: string | null; niche: string | null; asOf: number; source: string; region?: string | null }): TrendCreatorInput {
  return {
    platform: creator.platform,
    platformCreatorId: creator.platformCreatorId,
    handle: creator.handle,
    displayName: creator.displayName,
    followerCount: creator.followers,
    niche: extra.niche,
    nicheMethod: extra.niche ? "seed" : null,
    region: creator.region ?? extra.region ?? null,
    discoveredVia: extra.discoveredVia,
    watchlistId: extra.watchlistId,
    snapshot: creator.followers !== null || creator.videoCount !== null
      ? { asOf: extra.asOf, source: extra.source, followerCount: creator.followers, videoCount: creator.videoCount, totalLikes: creator.totalLikes }
      : null,
  };
}

function videoInput(video: SourceVideo, extra: { discoveredVia: string; inListing: boolean; asOf: number; source: string; postedAtSource?: string }): TrendVideoInput {
  return {
    creatorPlatformId: video.creatorPlatformId,
    platform: video.platform,
    platformVideoId: video.platformVideoId,
    url: video.url,
    formatKey: formatKeyFor(video.platform),
    postedAt: video.postedAt,
    postedAtSource: video.postedAt === null ? null : extra.postedAtSource ?? "platform",
    durationMs: video.durationMs,
    width: video.width,
    height: video.height,
    title: video.title,
    description: video.description,
    hashtags: video.hashtags,
    soundId: video.soundId,
    soundTitle: video.soundTitle,
    soundOriginal: video.soundOriginal,
    language: video.language,
    region: video.region,
    isAd: video.isAd,
    aigcLabel: video.aigcLabel,
    discoveredVia: extra.discoveredVia,
    inListing: extra.inListing,
    snapshot: {
      asOf: extra.asOf,
      source: extra.source,
      ...video.metrics,
      viewsPrecision: video.viewsPrecision,
    },
  };
}

// ─── Discovery ──────────────────────────────────────────────────────────────

export interface IngestOptions {
  workspaceId: string;
  source: TrendSource;
  seeds: string[];
  niche: string | null;
  /** Videos per creator listing (the research used 60). */
  perCreator: number;
  /** Cap on creators listed in this pass. */
  maxCreators: number;
  concurrency: number;
  /** Discovery depth: Explore scrolls, hashtag / search entries. */
  discoveryDepth: number;
  /** Request budget per source in this pass. */
  budget: number;
  paid: PaidOptions;
  cadenceHours?: number;
  cooldownMs?: number;
  /** Skip the listing step (discovery only). */
  discoverOnly?: boolean;
}

export interface IngestSummary {
  workspaceId: string;
  source: TrendSource;
  niche: string | null;
  startedAt: number;
  wallMs: number;
  passes: TrendPassSummary[];
  totals: Record<string, number>;
  skipped: string[];
}

async function runDiscoveryForSeed(
  source: TrendSource,
  watchlist: WatchlistDto,
  options: IngestOptions,
  deps: TrendDeps,
  paidBudget: { spent: number; calls: number },
): Promise<DiscoveryResult & { costUsd?: number; actorId?: string; apifyRunId?: string }> {
  const depth = Math.max(1, options.discoveryDepth);
  switch (source) {
    case "tiktok-explore":
      return discoveryFromCapture(await deps.capture({ url: exploreUrl(), match: EXPLORE_XHR, chip: watchlist.value, scrolls: depth, timeoutMs: 180_000 }));
    case "tiktok-sound":
      return discoveryFromCapture(await deps.capture({ url: soundUrl(watchlist.value), match: SOUND_XHR, scrolls: depth, timeoutMs: 180_000 }));
    case "youtube-hashtag":
      return discoverYoutubeHashtag({ tag: watchlist.value, limit: depth, run: deps.ytdlp });
    case "youtube-search":
      return discoverYoutubeSearch({ query: watchlist.value, limit: depth, run: deps.ytdlp });
    case "tiktok-creator":
    case "youtube-channel": {
      const platform = SOURCE_FACTS[source].platform;
      const value = watchlist.value;
      return {
        outcome: { kind: "ok" },
        creators: [{
          platform,
          platformCreatorId: value.replace(/^@(?=UC)/, ""),
          handle: platform === "tiktok" && !isSecUid(value) ? value.replace(/^@/, "") : value.startsWith("@") ? value : null,
          displayName: null,
          followers: null,
          videoCount: null,
          totalLikes: null,
          region: null,
        }],
        videos: [],
        unresolvedVideoIds: [],
        requests: 0,
        ms: 0,
      };
    }
    case "apify-tiktok":
    case "apify-instagram":
      return runPaidDiscovery(source, watchlist, options, deps, paidBudget);
  }
}

async function runPaidDiscovery(
  source: PaidSource,
  watchlist: WatchlistDto,
  options: IngestOptions,
  deps: TrendDeps,
  paidBudget: { spent: number; calls: number },
): Promise<DiscoveryResult & { costUsd?: number; actorId?: string; apifyRunId?: string }> {
  const actor = PAID_ACTORS[source];
  if (!options.paid.enabled || options.paid.dailyCapUsd === null) {
    return { outcome: { kind: "failed", reason: "paid-disabled", detail: "paid sources need --paid and --apify-daily-cap-usd" }, creators: [], videos: [], unresolvedVideoIds: [], requests: 0, ms: 0 };
  }
  if (!deps.apify) {
    return { outcome: { kind: "failed", reason: "apify-missing", detail: "APIFY_TOKEN is not configured" }, creators: [], videos: [], unresolvedVideoIds: [], requests: 0, ms: 0 };
  }
  const requested = source === "apify-instagram" ? Math.min(options.perCreator, 12) : options.discoveryDepth;
  const fit = affordableResults(source, requested, { dailyCapUsd: options.paid.dailyCapUsd, spentTodayUsd: paidBudget.spent });
  if (fit.results < 1) {
    return { outcome: { kind: "failed", reason: "daily-cap", detail: `daily cap $${options.paid.dailyCapUsd} reached for ${actor.actorId}` }, creators: [], videos: [], unresolvedVideoIds: [], requests: 0, ms: 0 };
  }
  const started = Date.now();
  const actorInput = source === "apify-tiktok"
    ? tiktokSeedInput(
        watchlist.kind === "keyword" ? { hashtags: [], keywords: [watchlist.value] } : { hashtags: [watchlist.value], keywords: [] },
        fit.results,
      )
    : instagramReelInput({ usernames: [watchlist.value], resultsLimit: fit.results });
  paidBudget.calls += 1;
  const { items, run } = await deps.apify({ actorId: actor.actorId, input: actorInput, maxItems: fit.results, maxTotalChargeUsd: fit.maxChargeUsd });
  const parsed = source === "apify-tiktok" ? parseApifyTiktokItems(items) : parseInstagramReelItems(items);
  const costUsd = run.usageTotalUsd ?? estimatedCostUsd(source, items.length);
  paidBudget.spent += costUsd;
  const creators = new Map<string, SourceCreator>();
  for (const entry of parsed) creators.set(entry.creator.platformCreatorId, entry.creator);
  return {
    outcome: parsed.length > 0 ? { kind: "ok" } : { kind: "empty", reason: "empty-dataset" },
    creators: [...creators.values()],
    videos: parsed.map((entry) => entry.video),
    unresolvedVideoIds: [],
    requests: 1,
    ms: Date.now() - started,
    costUsd,
    actorId: actor.actorId,
    apifyRunId: run.id,
  };
}

/** Exact stats + publish times for YouTube ids through the registered connector. */
async function youtubeApiVideos(ids: readonly string[], deps: TrendDeps): Promise<{ details: YouTubeVideoDetails[]; calls: number }> {
  if (!deps.youtubeDetails || ids.length === 0) return { details: [], calls: 0 };
  const details: YouTubeVideoDetails[] = [];
  let calls = 0;
  for (let index = 0; index < ids.length; index += 50) {
    details.push(...(await deps.youtubeDetails(ids.slice(index, index + 50))));
    calls += 1;
  }
  return { details, calls };
}

function apiVideo(detail: YouTubeVideoDetails): SourceVideo | null {
  if (!detail.channelId) return null;
  return {
    platform: "youtube",
    platformVideoId: detail.id,
    creatorPlatformId: detail.channelId,
    url: youtubeShortUrl(detail.id),
    postedAt: detail.publishedAt,
    durationMs: detail.durationSec === null ? null : detail.durationSec * 1000,
    width: null,
    height: null,
    title: detail.title,
    description: null,
    hashtags: detail.tags.map((tag) => tag.toLowerCase().replace(/\s+/g, "")),
    soundId: null,
    soundTitle: null,
    soundOriginal: null,
    language: detail.language,
    region: null,
    isAd: null,
    aigcLabel: null,
    metrics: { views: detail.views, likes: detail.likes, comments: detail.comments, shares: null, saves: null },
    viewsPrecision: "exact",
  };
}

async function discoveryPass(options: IngestOptions, watchlists: WatchlistDto[], deps: TrendDeps): Promise<TrendPassSummary> {
  const facts = SOURCE_FACTS[options.source];
  const breaker = new CircuitBreaker(facts.discovery, { budget: options.budget, clock: deps.now });
  const counts = emptyCounts();
  const notes: string[] = [];
  const run = startRun({
    workspaceId: options.workspaceId,
    kind: "trend.discover",
    label: `Trend discovery: ${options.source}`,
    metadata: json({ source: facts.discovery, niche: options.niche, seeds: options.seeds }),
  });
  const actorId = facts.paid ? PAID_ACTORS[options.source as PaidSource].actorId : null;
  const dayStart = Math.floor(deps.now() / DAY_MS) * DAY_MS;
  const paidBudget = { calls: 0, spent: actorId ? trendApifySpend({ workspaceId: options.workspaceId, actorId, since: dayStart }).reduce((sum, row) => sum + row.usd, 0) : 0 };
  const startSpent = paidBudget.spent;
  const attempt = startRunAttempt({
    runId: run.id,
    provider: facts.paid && options.paid.enabled ? "apify" : facts.paid ? "apify-refused" : options.source.startsWith("tiktok-explore") || options.source === "tiktok-sound" ? "playwright" : "ytdlp",
    model: actorId,
    request: json({ seeds: options.seeds, depth: options.discoveryDepth }),
  });
  let failure: unknown = null;
  try {
    for (const watchlist of watchlists) {
      counts.seeds += 1;
      if (!breaker.acquire()) {
        notes.push(`stopped before seed ${watchlist.value}: breaker ${breaker.snapshot().state}`);
        break;
      }
      const result = await runDiscoveryForSeed(options.source, watchlist, options, deps, paidBudget);
      breaker.record(result.outcome);
      if (result.outcome.kind !== "ok") notes.push(`${watchlist.value}: ${result.outcome.kind}${result.outcome.reason ? ` (${result.outcome.reason})` : ""}${result.outcome.detail ? ` ${result.outcome.detail}` : ""}`);
      if (result.note) notes.push(result.note);
      const asOf = deps.now();
      const discoveredVia = `${watchlist.kind}:${watchlist.value}`.slice(0, 600);
      let videos = result.videos;
      let creators = result.creators;
      counts.unresolvedVideoIds += result.unresolvedVideoIds.length;
      if (result.unresolvedVideoIds.length > 0 && deps.youtubeDetails) {
        const resolved = await youtubeApiVideos(result.unresolvedVideoIds, deps);
        const apiVideos = resolved.details.map(apiVideo).filter((video): video is SourceVideo => video !== null);
        videos = [...videos, ...apiVideos];
        const seen = new Set(creators.map((creator) => creator.platformCreatorId));
        for (const detail of resolved.details) {
          if (!detail.channelId || seen.has(detail.channelId)) continue;
          seen.add(detail.channelId);
          creators = [...creators, { platform: "youtube", platformCreatorId: detail.channelId, handle: null, displayName: detail.channelTitle, followers: null, videoCount: null, totalLikes: null, region: null }];
        }
        counts.unresolvedVideoIds -= apiVideos.length;
        counts.youtubeApiCalls = (counts.youtubeApiCalls ?? 0) + resolved.calls;
      }
      counts.creatorsFound += creators.length;
      counts.videosFound += videos.length;
      const batch = writeIngestBatch({
        workspaceId: options.workspaceId,
        runId: run.id,
        now: asOf,
        creators: creators.map((creator) => creatorInput(creator, {
          discoveredVia,
          watchlistId: watchlist.id,
          niche: watchlist.niche ?? options.niche,
          asOf,
          source: facts.discovery,
          region: result.region ?? null,
        })),
        videos: videos.map((video) => videoInput(video, {
          discoveredVia,
          inListing: false,
          asOf,
          source: video.viewsPrecision === "exact" && video.platform === "youtube" ? YOUTUBE_API_SOURCE : facts.discovery,
          postedAtSource: video.platform === "youtube" ? YOUTUBE_API_SOURCE : "platform",
        })),
      });
      addBatch(counts, batch);
      markWatchlistRun({ watchlistId: watchlist.id, runId: run.id, at: asOf });
      deps.log?.({ kind: "trend.discover", seed: watchlist.value, outcome: result.outcome.kind, creators: creators.length, videos: videos.length });
      if (breaker.tripped) break;
    }
  } catch (error) {
    failure = error;
  }
  const costUsd = Math.round((paidBudget.spent - startSpent) * 10_000) / 10_000;
  if (counts.unresolvedVideoIds > 0) {
    notes.push(`${counts.unresolvedVideoIds} hashtag Shorts ids have no channel in the flat listing; configure YOUTUBE_API_KEY (registered YouTube connector) to resolve them`);
  }
  const breakerState = breaker.snapshot();
  finishRunAttempt(attempt.id, {
    state: failure ? "failed" : "succeeded",
    response: json({ counts, breaker: breakerState, notes }),
    ...(paidBudget.calls > 0 ? { costUsd } : {}),
    ...(failure ? { error: failure } : {}),
  });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return { runId: run.id, kind: "trend.discover", source: facts.discovery, requests: breakerState.requests, breaker: breakerState, counts, notes, ...(facts.paid ? { costUsd } : {}) };
}

// ─── Listing ────────────────────────────────────────────────────────────────

async function listOne(creator: DueCreatorDto, perCreator: number, deps: TrendDeps): Promise<ListingResult> {
  if (creator.platform === "tiktok") {
    return listTiktokCreator({ platformCreatorId: creator.platformCreatorId, handle: creator.handle, limit: perCreator, run: deps.ytdlp });
  }
  if (creator.platform === "youtube") {
    return listYoutubeChannelShorts({ channelRef: creator.platformCreatorId, limit: perCreator, run: deps.ytdlp });
  }
  return { outcome: { kind: "failed", reason: "no-free-listing", detail: "Instagram listing runs only through the paid Apify reel actor" }, creator: null, videos: [], ms: 0 };
}

/** List creators of one platform with a breaker; writes one batch per creator. */
export async function listingPass(input: {
  workspaceId: string;
  platform: TrendPlatform;
  creators: DueCreatorDto[];
  perCreator: number;
  concurrency: number;
  budget: number;
  kind: "trend.list" | "trend.snapshot";
  deps: TrendDeps;
}): Promise<TrendPassSummary & { listedCreatorIds: string[] }> {
  const source = LISTING_SOURCE_BY_PLATFORM[input.platform];
  const breaker = new CircuitBreaker(source, { budget: input.budget, clock: input.deps.now });
  const counts = emptyCounts();
  const notes: string[] = [];
  const listed: string[] = [];
  const run = startRun({
    workspaceId: input.workspaceId,
    kind: input.kind,
    label: `Trend creator listing: ${source}`,
    metadata: json({ source, creators: input.creators.length, perCreator: input.perCreator }),
  });
  const attempt = startRunAttempt({ runId: run.id, provider: "ytdlp", model: null, request: json({ creators: input.creators.length, perCreator: input.perCreator }) });
  let failure: unknown = null;
  const failures = new Map<string, number>();
  try {
    await pool(input.creators, input.concurrency, async (creator) => {
      if (!breaker.acquire()) return;
      const result = await listOne(creator, input.perCreator, input.deps);
      breaker.record(result.outcome);
      const asOf = input.deps.now();
      const ok = result.outcome.kind === "ok";
      if (!ok) {
        const reason = result.outcome.reason ?? result.outcome.kind;
        failures.set(reason, (failures.get(reason) ?? 0) + 1);
      }
      const creatorUpdate: TrendCreatorInput[] = result.creator
        ? [{
            platform: creator.platform,
            platformCreatorId: creator.platformCreatorId,
            handle: result.creator.handle ?? null,
            displayName: result.creator.displayName ?? null,
            followerCount: result.creator.followers ?? null,
            discoveredVia: "listing",
            snapshot: typeof result.creator.followers === "number" ? { asOf, source, followerCount: result.creator.followers } : null,
          }]
        : [];
      // A blocked response is not the creator's fault: no failure is counted against it.
      const listings = result.outcome.kind === "blocked"
        ? []
        : [{ platform: creator.platform, platformCreatorId: creator.platformCreatorId, at: asOf, ok, error: ok ? null : `${result.outcome.reason ?? result.outcome.kind}: ${result.outcome.detail ?? ""}`.trim() }];
      const batch = writeIngestBatch({
        workspaceId: input.workspaceId,
        runId: run.id,
        now: asOf,
        creators: creatorUpdate,
        // The stored identity wins: a channel listed by @handle keeps its row.
        videos: result.videos.map((video) => videoInput({ ...video, creatorPlatformId: creator.platformCreatorId }, { discoveredVia: "listing", inListing: true, asOf, source })),
        listings,
      });
      addBatch(counts, batch);
      counts.videosFound += result.videos.length;
      if (ok) {
        counts.creatorsListed += 1;
        listed.push(creator.id);
        if (creator.lastListedAt !== null) counts.newVideosDetected += batch.videosCreated;
      } else if (result.outcome.kind !== "blocked") counts.creatorsFailed += 1;
      input.deps.log?.({ kind: input.kind, creator: creator.handle ?? creator.platformCreatorId, outcome: result.outcome.kind, videos: result.videos.length, ms: result.ms });
      await sleep(input.deps.paceMs ?? 0);
    });
  } catch (error) {
    failure = error;
  }
  const breakerState = breaker.snapshot();
  if (breakerState.state === "tripped") notes.push(`breaker tripped: ${breakerState.reason}${breakerState.detail ? ` (${breakerState.detail})` : ""}`);
  if (breakerState.state === "budget-exhausted") notes.push(`request budget of ${input.budget} reached`);
  for (const [reason, n] of failures) notes.push(`${n} listing(s) ${reason}`);
  finishRunAttempt(attempt.id, {
    state: failure ? "failed" : "succeeded",
    response: json({ counts, breaker: breakerState, notes }),
    ...(failure ? { error: failure } : {}),
  });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return { runId: run.id, kind: input.kind, source, requests: breakerState.requests, breaker: breakerState, counts, notes, listedCreatorIds: listed };
}

/** Date + exact stats for YouTube videos via the Data API (also the 30-day re-fetch). */
export async function youtubeApiPass(input: { workspaceId: string; deps: TrendDeps; limit: number }): Promise<TrendPassSummary | null> {
  const now = input.deps.now();
  const candidates = youtubeApiCandidates({ workspaceId: input.workspaceId, now, limit: input.limit });
  const ids = [...new Set([...candidates.undated, ...candidates.stale])];
  if (!input.deps.youtubeDetails || ids.length === 0) return null;
  const breaker = new CircuitBreaker(YOUTUBE_API_SOURCE, { budget: Math.ceil(ids.length / 50) + 1, clock: input.deps.now });
  const counts = emptyCounts();
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.snapshot", label: "YouTube Data API statistics", metadata: json({ source: YOUTUBE_API_SOURCE, ids: ids.length }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "youtube", model: "videos.list", request: json({ ids: ids.length }) });
  let failure: unknown = null;
  try {
    for (let index = 0; index < ids.length; index += 50) {
      if (!breaker.acquire()) break;
      const details = await input.deps.youtubeDetails(ids.slice(index, index + 50));
      breaker.record(details.length > 0 ? { kind: "ok" } : { kind: "empty", reason: "empty-body" });
      const asOf = input.deps.now();
      const videos = details.map(apiVideo).filter((video): video is SourceVideo => video !== null);
      addBatch(counts, writeIngestBatch({
        workspaceId: input.workspaceId,
        runId: run.id,
        now: asOf,
        creators: [],
        videos: videos.map((video) => videoInput(video, { discoveredVia: "listing", inListing: true, asOf, source: YOUTUBE_API_SOURCE, postedAtSource: YOUTUBE_API_SOURCE })),
      }));
      counts.videosFound += videos.length;
    }
  } catch (error) {
    failure = error;
  }
  const breakerState = breaker.snapshot();
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, breaker: breakerState }), ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return { runId: run.id, kind: "trend.snapshot", source: YOUTUBE_API_SOURCE, requests: breakerState.requests, breaker: breakerState, counts, notes: [`${candidates.undated.length} undated, ${candidates.stale.length} due for the 30-day re-fetch`] };
}

/**
 * Paid Instagram checkpoints: reels at ages 1, 3, 7, 14 days re-fetched by URL
 * through `apify/instagram-reel-scraper`. Runs only with --paid and a daily
 * cap; the request is shrunk to the remaining budget.
 */
export async function instagramCheckpointPass(input: { workspaceId: string; paid: PaidOptions; deps: TrendDeps; limit: number }): Promise<{ pass: TrendPassSummary | null; skipped: string | null }> {
  const now = input.deps.now();
  const due = instagramCheckpointDue({ workspaceId: input.workspaceId, now, limit: input.limit });
  if (due.length === 0) return { pass: null, skipped: null };
  if (!input.paid.enabled || input.paid.dailyCapUsd === null) {
    return { pass: null, skipped: `apify-instagram: ${due.length} reel checkpoint(s) due; paid sources are off (pass --paid with --apify-daily-cap-usd)` };
  }
  if (!input.deps.apify) return { pass: null, skipped: "apify-instagram: APIFY_TOKEN is not configured" };
  const actor = PAID_ACTORS["apify-instagram"];
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const spent = trendApifySpend({ workspaceId: input.workspaceId, actorId: actor.actorId, since: dayStart }).reduce((sum, row) => sum + row.usd, 0);
  const fit = affordableResults("apify-instagram", due.length, { dailyCapUsd: input.paid.dailyCapUsd, spentTodayUsd: spent });
  if (fit.results < 1) return { pass: null, skipped: `apify-instagram: daily cap $${input.paid.dailyCapUsd} reached` };
  const batch = due.slice(0, fit.results);
  const counts = emptyCounts();
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.snapshot", label: "Instagram reel checkpoints", metadata: json({ source: "apify-instagram", reels: batch.length }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "apify", model: actor.actorId, request: json({ reels: batch.length, maxChargeUsd: fit.maxChargeUsd }) });
  const breaker = new CircuitBreaker("apify-instagram", { budget: 1, clock: input.deps.now });
  breaker.acquire();
  let failure: unknown = null;
  let costUsd = 0;
  try {
    const { items, run: apifyRun } = await input.deps.apify({
      actorId: actor.actorId,
      input: instagramReelInput({ reelUrls: batch.map((entry) => entry.url), resultsLimit: batch.length }),
      maxItems: batch.length,
      maxTotalChargeUsd: fit.maxChargeUsd,
    });
    costUsd = apifyRun.usageTotalUsd ?? estimatedCostUsd("apify-instagram", items.length);
    const parsed = parseInstagramReelItems(items);
    breaker.record(parsed.length > 0 ? { kind: "ok" } : { kind: "empty", reason: "empty-dataset" });
    const asOf = input.deps.now();
    addBatch(counts, writeIngestBatch({
      workspaceId: input.workspaceId,
      runId: run.id,
      now: asOf,
      creators: [],
      videos: parsed.map(({ video }) => videoInput(video, { discoveredVia: "listing", inListing: true, asOf, source: "apify-instagram" })),
    }));
    counts.videosFound = parsed.length;
  } catch (error) {
    failure = error;
  }
  const breakerState = breaker.snapshot();
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, breaker: breakerState }), costUsd: Math.round(costUsd * 10_000) / 10_000, ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return {
    pass: { runId: run.id, kind: "trend.snapshot", source: "apify-instagram", requests: 1, breaker: breakerState, counts, notes: [`${batch.length} of ${due.length} due reels fit the daily cap`], costUsd },
    skipped: null,
  };
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export async function labelPass(input: { workspaceId: string; deps: TrendDeps; llm: boolean; llmLimit: number; llmModel?: string }): Promise<TrendPassSummary> {
  const now = input.deps.now();
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.label", label: "Trend cohort labels", metadata: json({ source: "labels", llm: input.llm }) });
  const attempt = startRunAttempt({ runId: run.id, provider: input.llm ? "llm" : "rules", model: input.llm ? input.llmModel ?? LLM_LABEL_MODEL : null, request: json({ llmLimit: input.llm ? input.llmLimit : 0 }) });
  const counts: Record<string, number> = { candidates: 0, ruleLabels: 0, llmBatches: 0, llmLabels: 0, llmUnknown: 0, creatorNichesFromHashtags: 0 };
  const notes: string[] = [];
  let failure: unknown = null;
  try {
    const candidates = loadLabelCandidates({ workspaceId: input.workspaceId });
    counts.candidates = candidates.length;
    const rows = candidates.flatMap(deterministicLabels);
    counts.ruleLabels = insertTrendLabels({ runId: run.id, now, labels: rows }).inserted;
    if (input.llm) {
      if (!input.deps.llm) notes.push("--llm requested but no text provider is configured; skipped");
      else {
        const model = input.llmModel ?? LLM_LABEL_MODEL;
        const pending = loadLabelCandidates({ workspaceId: input.workspaceId, llmAxis: "format", limit: input.llmLimit });
        for (let index = 0; index < pending.length; index += LLM_BATCH_SIZE) {
          const batch = pending.slice(index, index + LLM_BATCH_SIZE);
          const prompt = llmLabelPrompt(batch);
          const text = await input.deps.llm({ model, ...prompt });
          const labels = parseLlmLabels(text, batch, model);
          counts.llmBatches += 1;
          counts.llmLabels += insertTrendLabels({ runId: run.id, now: input.deps.now(), labels }).inserted;
          counts.llmUnknown += labels.filter((label) => label.label === "unknown").length;
        }
      }
    }
  } catch (error) {
    failure = error;
  }
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, notes }), ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  const breaker = new CircuitBreaker("labels", { budget: 0 }).snapshot();
  return { runId: run.id, kind: "trend.label", source: "labels", requests: counts.llmBatches, breaker, counts, notes };
}

/** Creator-level niche for creators without a seed niche, through one batched LLM call per 20 creators. */
export async function creatorNichePass(input: { creators: Array<{ id: string; titles: string[] }>; llm: LlmCaller; model?: string; now: number }): Promise<number> {
  let updated = 0;
  for (let index = 0; index < input.creators.length; index += 20) {
    const batch = input.creators.slice(index, index + 20);
    const text = await input.llm({
      model: input.model ?? LLM_LABEL_MODEL,
      system: 'Assign each creator one niche from: ai-tools, tech-tips, coding, productivity, personal-finance, investing, business, marketing, fitness, food, beauty, fashion, gaming, education, real-estate, travel, family, comedy, self-improvement, health, pets, diy-home, auto, sports, music, news-commentary, other. Reply JSON {"items":[{"i":0,"niche":"...","confidence":0.0}]}.',
      user: batch.map((creator, i) => JSON.stringify({ i, titles: creator.titles.slice(0, 10).map((title) => title.slice(0, 120)) })).join("\n"),
    });
    try {
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { items?: Array<{ i?: number; niche?: string; confidence?: number }> };
      for (const item of parsed.items ?? []) {
        const creator = typeof item.i === "number" ? batch[item.i] : undefined;
        if (!creator || typeof item.niche !== "string" || (item.confidence ?? 0) < 0.6) continue;
        setCreatorNiche({ creatorId: creator.id, niche: item.niche, method: "llm", now: input.now });
        updated += 1;
      }
    } catch {
      // An unparseable reply leaves those creators unlabeled.
    }
  }
  return updated;
}

// ─── Score ──────────────────────────────────────────────────────────────────

/** Latest refit curves recorded by a `trend.score` run, else the priors. */
export function currentCurves(workspaceId: string): Partial<Record<TrendPlatform, MaturityCurve>> {
  for (const run of recentTrendRuns({ workspaceId, limit: 500 })) {
    if (run.kind !== "trend.score" || run.state !== "succeeded") continue;
    const curves = (run.response as { curves?: Record<string, MaturityCurve> } | null)?.curves;
    if (!curves) continue;
    const out: Partial<Record<TrendPlatform, MaturityCurve>> = {};
    for (const platform of TREND_PLATFORMS) {
      const curve = curves[platform];
      if (curve && curve.basis === "refit" && typeof curve.tauHours === "number" && typeof curve.k === "number") out[platform] = curve;
    }
    return out;
  }
  return {};
}

export interface ScorePassResult extends TrendPassSummary {
  curves: Record<string, MaturityCurve>;
}

export function scorePass(input: { workspaceId: string; now: number; refit: boolean }): ScorePassResult {
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.score", label: "Trend outlier scores", metadata: json({ source: "score", refit: input.refit }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "ralphy", model: "outlier-v1", request: json({ refit: input.refit }) });
  const counts: Record<string, number> = { creators: 0, videos: 0, scored: 0, labeled: 0, breakout: 0, outlier: 0, strong: 0, normal: 0, under: 0, unscored: 0 };
  const notes: string[] = [];
  let curves: Partial<Record<TrendPlatform, MaturityCurve>> = currentCurves(input.workspaceId);
  let failure: unknown = null;
  try {
    if (input.refit) {
      for (const platform of TREND_PLATFORMS) {
        const fit = refitMaturity(loadMaturityPairs({ workspaceId: input.workspaceId, platform }));
        if (fit) {
          curves = { ...curves, [platform]: fit };
          notes.push(`${platform} curve refit from ${fit.n} pairs: tau ${fit.tauHours} h, k ${fit.k}`);
        } else notes.push(`${platform}: not enough longitudinal pairs to refit; keeping ${curves[platform] ? "the last refit" : "the prior"}`);
      }
    }
    const creators = loadScoringInput({ workspaceId: input.workspaceId });
    const options = { now: input.now, curves };
    const stats = cohortStats(creators, options);
    const scores = [];
    const creatorBaselines = [];
    for (const creator of creators) {
      counts.creators += 1;
      const byId = new Map(creator.videos.map((video) => [video.id, video]));
      for (const score of scoreCreator(creator, stats, options)) {
        counts.videos += 1;
        if (score.multiplier !== null) counts.scored += 1;
        else counts.unscored += 1;
        if (score.label) {
          counts.labeled += 1;
          counts[score.label] = (counts[score.label] ?? 0) + 1;
        }
        scores.push({ ...score, cohortKey: byId.get(score.videoId)!.cohortKey });
      }
      for (const row of creatorBaselineRows(creator, options)) creatorBaselines.push({ ...row, creatorId: creator.creatorId, windowK: WINDOW_K });
    }
    const cohortBaselines = [...stats.entries()].map(([key, value]) => {
      const [cohort, metric] = key.split("#");
      return { cohortKey: cohort!, metric: metric as TrendMetric, medianLog: value.median, madLog: value.scale, n: value.n, windowDays: COHORT_WINDOW_DAYS };
    });
    writeTrendScores({ workspaceId: input.workspaceId, computedAt: input.now, scores, creatorBaselines, cohortBaselines });
  } catch (error) {
    failure = error;
  }
  const curveRecord: Record<string, MaturityCurve> = {};
  for (const platform of TREND_PLATFORMS) curveRecord[platform] = curves[platform] ?? MATURITY_PRIORS[platform];
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, curves: curveRecord, notes }), ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  const breaker = new CircuitBreaker("score", { budget: 0 }).snapshot();
  return { runId: run.id, kind: "trend.score", source: "score", requests: 0, breaker, counts, notes, curves: curveRecord };
}

// ─── Ingest ─────────────────────────────────────────────────────────────────

function mergeTotals(passes: TrendPassSummary[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const pass of passes) {
    for (const [key, value] of Object.entries(pass.counts)) totals[`${pass.kind}.${key}`] = (totals[`${pass.kind}.${key}`] ?? 0) + value;
  }
  return totals;
}

export async function ingest(options: IngestOptions, deps: TrendDeps, post: { llm: boolean; llmLimit: number; refit: boolean }): Promise<IngestSummary> {
  const startedAt = deps.now();
  const facts = SOURCE_FACTS[options.source];
  const skipped: string[] = [];
  const passes: TrendPassSummary[] = [];
  const cooldownMs = options.cooldownMs ?? BREAKER_COOLDOWN_MS;
  const discoveryTrip = facts.discovery === "manual" ? null : cooldownFor(options.workspaceId, facts.discovery, startedAt, cooldownMs);
  const watchlists = options.seeds.map((seed) => upsertWatchlist({
    workspaceId: options.workspaceId,
    platform: facts.platform,
    kind: options.source === "apify-tiktok" && !seed.startsWith("#") && /\s/.test(seed) ? "keyword" : facts.kind,
    value: seed.replace(/^#/, ""),
    source: options.source,
    niche: options.niche,
    ...(options.cadenceHours ? { cadenceHours: options.cadenceHours } : {}),
    now: startedAt,
  }));
  if (discoveryTrip) {
    skipped.push(`${facts.discovery}: breaker tripped at ${new Date(discoveryTrip.trippedAt).toISOString()} (${discoveryTrip.reason}); retry after ${new Date(discoveryTrip.retryAfter).toISOString()}`);
  } else {
    passes.push(await discoveryPass(options, watchlists, deps));
  }
  if (!options.discoverOnly && facts.listing) {
    const listingTrip = cooldownFor(options.workspaceId, facts.listing, deps.now(), cooldownMs);
    if (listingTrip) {
      skipped.push(`${facts.listing}: breaker tripped at ${new Date(listingTrip.trippedAt).toISOString()} (${listingTrip.reason}); retry after ${new Date(listingTrip.retryAfter).toISOString()}`);
    } else {
      const creators = dueCreators({ workspaceId: options.workspaceId, now: deps.now(), platform: facts.platform, dueOnly: false, unlistedOnly: true, limit: options.maxCreators });
      if (creators.length > 0) {
        passes.push(await listingPass({
          workspaceId: options.workspaceId,
          platform: facts.platform,
          creators,
          perCreator: options.perCreator,
          concurrency: options.concurrency,
          budget: options.budget,
          kind: "trend.list",
          deps,
        }));
      }
    }
  }
  if (facts.platform === "youtube") {
    const api = await youtubeApiPass({ workspaceId: options.workspaceId, deps, limit: 5_000 });
    if (api) passes.push(api);
    else if (!deps.youtubeDetails) skipped.push(`${YOUTUBE_API_SOURCE}: YOUTUBE_API_KEY not configured; YouTube videos stay undated (unscored) with rounded views`);
  }
  passes.push(await labelPass({ workspaceId: options.workspaceId, deps, llm: post.llm, llmLimit: post.llmLimit }));
  passes.push(scorePass({ workspaceId: options.workspaceId, now: deps.now(), refit: post.refit }));
  return {
    workspaceId: options.workspaceId,
    source: options.source,
    niche: options.niche,
    startedAt,
    wallMs: deps.now() - startedAt,
    passes,
    totals: mergeTotals(passes),
    skipped,
  };
}

// ─── Refresh ────────────────────────────────────────────────────────────────

export interface RefreshOptions {
  workspaceId: string;
  dueOnly: boolean;
  discover: boolean;
  platforms: TrendPlatform[];
  perCreator: number;
  maxCreators: number;
  maxNewCreators: number;
  concurrency: number;
  budget: number;
  discoveryDepth: number;
  paid: PaidOptions;
  cooldownMs?: number;
}

export interface RefreshSummary {
  workspaceId: string;
  startedAt: number;
  wallMs: number;
  dueOnly: boolean;
  passes: TrendPassSummary[];
  totals: Record<string, number>;
  skipped: string[];
}

export async function refresh(options: RefreshOptions, deps: TrendDeps, post: { llm: boolean; llmLimit: number; refit: boolean }): Promise<RefreshSummary> {
  const startedAt = deps.now();
  const cooldownMs = options.cooldownMs ?? BREAKER_COOLDOWN_MS;
  const passes: TrendPassSummary[] = [];
  const skipped: string[] = [];

  if (options.discover) {
    for (const watchlist of dueWatchlists({ workspaceId: options.workspaceId, now: startedAt })) {
      if (!options.platforms.includes(watchlist.platform)) continue;
      if (!isTrendSource(watchlist.source)) continue;
      const facts = SOURCE_FACTS[watchlist.source];
      if (facts.paid && !options.paid.enabled) {
        skipped.push(`${watchlist.source} ${watchlist.value}: paid source skipped (pass --paid with --apify-daily-cap-usd)`);
        continue;
      }
      if (facts.discovery !== "manual") {
        const trip = cooldownFor(options.workspaceId, facts.discovery, deps.now(), cooldownMs);
        if (trip) {
          skipped.push(`${facts.discovery}: breaker open (${trip.reason}) until ${new Date(trip.retryAfter).toISOString()}`);
          continue;
        }
      }
      passes.push(await discoveryPass({
        workspaceId: options.workspaceId,
        source: watchlist.source,
        seeds: [watchlist.value],
        niche: watchlist.niche,
        perCreator: options.perCreator,
        maxCreators: options.maxNewCreators,
        concurrency: options.concurrency,
        discoveryDepth: options.discoveryDepth,
        budget: options.budget,
        paid: options.paid,
      }, [watchlist], deps));
    }
  }

  for (const platform of options.platforms) {
    const source = LISTING_SOURCE_BY_PLATFORM[platform];
    if (platform === "instagram") continue;
    const trip = cooldownFor(options.workspaceId, source, deps.now(), cooldownMs);
    if (trip) {
      skipped.push(`${source}: breaker open (${trip.reason}) until ${new Date(trip.retryAfter).toISOString()}`);
      continue;
    }
    // New (never listed) creators first, capped per refresh; then due creators.
    // Never-listed creators respect their failure backoff in a refresh.
    const fresh = options.maxNewCreators > 0
      ? dueCreators({ workspaceId: options.workspaceId, now: deps.now(), platform, dueOnly: true, unlistedOnly: true, limit: options.maxNewCreators })
      : [];
    const due = dueCreators({ workspaceId: options.workspaceId, now: deps.now(), platform, dueOnly: options.dueOnly, limit: options.maxCreators })
      .filter((creator) => creator.lastListedAt !== null);
    const creators = [...fresh, ...due].slice(0, options.maxCreators + options.maxNewCreators);
    if (creators.length === 0) continue;
    passes.push(await listingPass({
      workspaceId: options.workspaceId,
      platform,
      creators,
      perCreator: options.perCreator,
      concurrency: options.concurrency,
      budget: options.budget,
      kind: "trend.snapshot",
      deps,
    }));
  }
  if (options.platforms.includes("youtube")) {
    const api = await youtubeApiPass({ workspaceId: options.workspaceId, deps, limit: 5_000 });
    if (api) passes.push(api);
  }
  if (options.platforms.includes("instagram")) {
    const checkpoints = await instagramCheckpointPass({ workspaceId: options.workspaceId, paid: options.paid, deps, limit: options.maxCreators });
    if (checkpoints.pass) passes.push(checkpoints.pass);
    if (checkpoints.skipped) skipped.push(checkpoints.skipped);
  }
  passes.push(await labelPass({ workspaceId: options.workspaceId, deps, llm: post.llm, llmLimit: post.llmLimit }));
  const refitDue = post.refit || refitIsDue(options.workspaceId, deps.now());
  passes.push(scorePass({ workspaceId: options.workspaceId, now: deps.now(), refit: refitDue }));
  return {
    workspaceId: options.workspaceId,
    startedAt,
    wallMs: deps.now() - startedAt,
    dueOnly: options.dueOnly,
    passes,
    totals: mergeTotals(passes),
    skipped,
  };
}

/** Monthly maturity refit: due when no `trend.score` run with refit ran in the last 30 days. */
export function refitIsDue(workspaceId: string, now: number): boolean {
  for (const run of recentTrendRuns({ workspaceId, limit: 500 })) {
    if (run.kind !== "trend.score" || run.state !== "succeeded") continue;
    const notes = (run.response as { notes?: unknown } | null)?.notes;
    const refitRan = Array.isArray(notes) && notes.some((note) => typeof note === "string" && /curve refit|not enough longitudinal/.test(note));
    if (refitRan) return now - run.createdAt > 30 * DAY_MS;
  }
  return true;
}

export type { ProbeOutcome };
