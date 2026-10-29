// `ralphy trends niche init` (#576): topic -> seeds -> snowballed creator
// discovery on free sources -> relevance gate -> quotas -> negative control
// group and anomaly flags. Built on the #556 passes (discovery, listing,
// labels, scores) and their circuit breakers; nothing here fights a block.
//
// Free sources only (no cookies, proxies, or paid runs):
//   YouTube   keyword search (`ytsearchN:`), hashtag pages, channel Shorts
//             tabs by id or @handle (the channel description gives the
//             creator's other handles)
//   TikTok    logged-out profile pages resolve handles to secUids (yt-dlp
//             lists a creator by secUid only); sound pages and Explore
//             categories when seeded (Explore follows the client IP's
//             country, so English / Russian niches seed TikTok through
//             cross-platform handles instead)
// Snowball expansion from kept creators: TikTok handles named in YouTube
// channel descriptions, same-name handles across platforms, @mentions in
// captions and bios (stitch / duet credits, "main account"), and on-topic
// co-hashtags. YouTube removed the featured-channels tab and TikTok's
// suggested accounts need a login, so neither is used.

import { finishRun, finishRunAttempt, startRun, startRunAttempt } from "../store/runs.js";
import type { JsonValue } from "../store/types.js";
import {
  addNicheCandidates,
  cohortMedians,
  getNiche,
  findCreatorIdByHandle,
  followerSeries,
  listedVideoCounts,
  knownHandles,
  loadGateVideos,
  loadNicheMembers,
  loadNicheVideos,
  markNicheRun,
  setGateExclusion,
  upsertNiche,
  writeGateResults,
  writeMemberGroups,
  type GateWrite,
  type NicheCohortGroup,
  type NicheDto,
  type NicheMemberDto,
  type NicheSeedSource,
  type NicheVideoDto,
} from "../store/trend-niches.js";
import { listWatchlists, upsertWatchlist, writeIngestBatch, type WatchlistDto, type WatchlistKind } from "../store/trends.js";
import { CircuitBreaker, type BreakerState } from "./breaker.js";
import { LLM_LABEL_MODEL } from "./cohorts.js";
import {
  LISTING_SOURCE_BY_PLATFORM,
  cooldownFor,
  currentCurves,
  discoveryPass,
  labelPass,
  listingPass,
  scorePass,
  type TrendDeps,
  type TrendPassSummary,
  type TrendSource,
} from "./ingest.js";
import { DAY_MS, HOUR_MS, MATURITY_PRIORS, PROVISIONAL_AGE_HOURS, cohortFallbacks, logValue, median, project, type TrendPlatform } from "./math.js";
import {
  COPYABILITY_SIZE_WEIGHTS,
  compilationName,
  duplicateCaptionShares,
  engagementAnomalies,
  expansionHashtags,
  gateCreator,
  mergedLexicon,
  negativeEligibility,
  prioritizeByQuota,
  quotaBandFor,
  quotaStatus,
  selectAnalysisSample,
  selectNegativeGroup,
  snowballDecision,
  type GateResult,
  type NicheSeedFile,
  type NicheSettings,
  type QuotaBand,
} from "./niche.js";
import { TIKTOK_PROFILE_SOURCE } from "./sources/tiktok.js";
import { YOUTUBE_LISTING_SOURCE, YOUTUBE_WATCH_SOURCE, dateYoutubeVideo, listYoutubeChannelShorts } from "./sources/youtube.js";
import type { SourceVideo } from "./sources/types.js";
import { bioMetadata, extractMentions, tiktokHandleFromYoutube } from "./text.js";
import type { LabelPolicy } from "./thresholds.js";
import { DEFAULT_MAX_AGE_DAYS, listingLimitFor } from "./freshness.js";

/** Watchlist sources that only niche onboarding runs (refresh skips them: they are not TREND_SOURCES). */
export const NICHE_TIKTOK_PROFILE_SOURCE = "niche-tiktok-profile";
export const NICHE_YOUTUBE_HANDLE_SOURCE = "niche-youtube-handle";

export interface NicheInitOptions {
  workspaceId: string;
  seedFile: NicheSeedFile;
  seedSource: NicheSeedSource;
  settings: NicheSettings;
  perCreator: number;
  concurrency: number;
  searchDepth: number;
  hashtagDepth: number;
  /** Request budget per source per pass. */
  budget: number;
  /** TikTok profile pages per run (one per handle). */
  profileBudget: number;
  /** YouTube watch-page calls to date Tier-1 candidates (0 = off; <= 150 per niche). */
  youtubeDateBudget: number;
  /** Same-name TikTok handle guesses from YouTube @handles (gated like any other candidate). */
  guessHandles: boolean;
  /** Co-hashtags added per round. */
  expansionHashtags: number;
  /** Mention / cross-platform handles queued per round. */
  expansionHandles: number;
  llmRelevance: boolean;
  llmModel?: string;
  labelPolicy?: LabelPolicy;
  cooldownMs?: number;
  /** false: no discovery rounds (pending candidates are still sample-listed and gated unless `list` is false). */
  discover?: boolean;
  /** false: list nothing (re-gate, label, score, and regroup the stored members only). */
  list?: boolean;
  /**
   * Sample-first gate: candidates are listed with this many videos, gated on
   * them, and only kept creators get the full `perCreator` backfill. Dropped
   * candidates are never backfilled. 0 = list every candidate in full.
   */
  sampleListing?: number;
  /** #590 collection cutoff in days (default 90): listed videos posted earlier are skipped. */
  maxAgeDays?: number;
}

export interface NicheRoundSummary {
  round: number;
  seeds: Record<string, number>;
  candidatesAdded: number;
  listed: Record<string, number>;
  /** Kept creators that got the full backfill after the sample gate. */
  backfilled: Record<string, number>;
  gate: { kept: number; dropped: number; undetermined: number };
  keptTotal: number;
  wallSeconds: number;
  decision: string;
}

export interface NicheInitSummary {
  nicheId: string;
  slug: string;
  runId: string;
  startedAt: number;
  wallMs: number;
  stopReason: string;
  rounds: NicheRoundSummary[];
  members: {
    byStatus: Record<string, number>;
    byLanguage: Record<string, { kept: number; dropped: number; undetermined: number }>;
    keptByPlatformBand: Record<string, Record<string, number>>;
    groups: Record<string, number>;
    flags: Record<string, number>;
  };
  quotas: Record<string, Array<{ band: string; quota: number; kept: number; deficit: number }>>;
  negative: { target: number; selected: number; provisional: boolean; packagingWeak: number; eligible: number; byBand: Record<string, { target: number; selected: number }> };
  videos: { listed: number; dated: number; scored: number; youtubeDated: number };
  blocks: number;
  breakers: Array<{ source: string; state: string; reason: string | null }>;
  passes: TrendPassSummary[];
  skipped: string[];
  notes: string[];
}

type HandleSeed = { handle: string; via: string };

interface RoundWork {
  youtubeKeywords: string[];
  youtubeHashtags: string[];
  youtubeHandles: HandleSeed[];
  youtubeChannelIds: string[];
  tiktokHandles: HandleSeed[];
  tiktokSecUids: string[];
  tiktokSounds: string[];
  exploreCategories: string[];
}

const emptyWork = (): RoundWork => ({ youtubeKeywords: [], youtubeHashtags: [], youtubeHandles: [], youtubeChannelIds: [], tiktokHandles: [], tiktokSecUids: [], tiktokSounds: [], exploreCategories: [] });

const workSize = (work: RoundWork) =>
  work.youtubeKeywords.length + work.youtubeHashtags.length + work.youtubeHandles.length + work.youtubeChannelIds.length +
  work.tiktokHandles.length + work.tiktokSecUids.length + work.tiktokSounds.length + work.exploreCategories.length;

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
const isSecUid = (value: string) => /^MS4wLj[A-Za-z0-9_-]{20,}$/.test(value);
const isChannelId = (value: string) => /^UC[\w-]{20,}$/.test(value);

/** Seeds file -> round-0 work (and watchlist rows, so the seed list is saved). */
export function seedWork(seedFile: NicheSeedFile, platforms: readonly TrendPlatform[]): { work: RoundWork; unsupported: string[] } {
  const work = emptyWork();
  const unsupported: string[] = [];
  for (const seed of seedFile.seeds) {
    if (!platforms.includes(seed.platform)) continue;
    if (seed.platform === "youtube") {
      if (seed.kind === "keyword") work.youtubeKeywords.push(seed.value);
      else if (seed.kind === "hashtag") work.youtubeHashtags.push(seed.value.toLowerCase());
      else if (seed.kind === "creator") {
        if (isChannelId(seed.value)) work.youtubeChannelIds.push(seed.value);
        else work.youtubeHandles.push({ handle: seed.value.startsWith("@") ? seed.value : `@${seed.value}`, via: `creator:${seed.value}` });
      } else unsupported.push(`youtube ${seed.kind} ${seed.value}`);
    } else if (seed.platform === "tiktok") {
      if (seed.kind === "creator") {
        if (isSecUid(seed.value)) work.tiktokSecUids.push(seed.value);
        else work.tiktokHandles.push({ handle: seed.value.replace(/^@/, "").toLowerCase(), via: `creator:${seed.value}` });
      } else if (seed.kind === "sound") work.tiktokSounds.push(seed.value);
      else if (seed.kind === "explore-category") work.exploreCategories.push(seed.value);
      else unsupported.push(`tiktok ${seed.kind} ${seed.value} (TikTok hashtag and keyword pages are closed logged out; paid Apify seeds are not part of niche init)`);
    } else unsupported.push(`instagram ${seed.kind} ${seed.value} (no free Instagram discovery path)`);
  }
  return { work, unsupported };
}

function watchlistFor(workspaceId: string, slug: string, platform: TrendPlatform, kind: WatchlistKind, value: string, source: string, now: number): WatchlistDto {
  return upsertWatchlist({ workspaceId, platform, kind, value: value.slice(0, 512), source, niche: slug, now });
}

function blocksOf(passes: readonly TrendPassSummary[]): number {
  return passes.reduce((sum, pass) => sum + (pass.breaker.blocks ?? 0), 0);
}

// ─── Passes owned by niche onboarding ───────────────────────────────────────

/** Resolve TikTok handles through logged-out profile pages; one browser per pass. */
export async function tiktokProfilePass(input: {
  workspaceId: string;
  handles: HandleSeed[];
  deps: TrendDeps;
  budget: number;
}): Promise<TrendPassSummary> {
  const breaker = new CircuitBreaker(TIKTOK_PROFILE_SOURCE, { budget: input.budget, clock: input.deps.now });
  const counts: Record<string, number> = { handles: input.handles.length, known: 0, resolved: 0, notFound: 0, private: 0, empty: 0 };
  const notes: string[] = [];
  const discovered: Array<{ creatorId: string; via: string }> = [];
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.discover", label: "TikTok profile pages", metadata: json({ source: TIKTOK_PROFILE_SOURCE, handles: input.handles.length }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "playwright", model: null, request: json({ handles: input.handles.length }) });
  let failure: unknown = null;
  let session: Awaited<ReturnType<NonNullable<TrendDeps["tiktokProfiles"]>>> | null = null;
  try {
    const pending: HandleSeed[] = [];
    for (const seed of input.handles) {
      const existing = findCreatorIdByHandle({ workspaceId: input.workspaceId, platform: "tiktok", handle: seed.handle });
      if (existing) {
        counts.known += 1;
        discovered.push({ creatorId: existing, via: seed.via });
      } else pending.push(seed);
    }
    if (pending.length > 0) {
      if (!input.deps.tiktokProfiles) notes.push(`${pending.length} TikTok handle(s) not resolved: no profile-page source configured`);
      else {
        session = await input.deps.tiktokProfiles();
        for (const seed of pending) {
          if (!breaker.acquire()) {
            notes.push(`stopped before @${seed.handle}: breaker ${breaker.snapshot().state}`);
            break;
          }
          const result = await session.resolve(seed.handle);
          breaker.record(result.outcome);
          if (result.outcome.kind === "blocked") {
            notes.push(`@${seed.handle}: ${result.outcome.reason} (${result.outcome.detail ?? ""})`);
            break;
          }
          const profile = result.profile;
          if (result.outcome.kind !== "ok" || !profile) {
            if (/private/i.test(result.outcome.detail ?? "")) counts.private += 1;
            else counts.notFound += 1;
            continue;
          }
          if (profile.privateAccount) {
            counts.private += 1;
            continue;
          }
          if ((profile.videoCount ?? 1) === 0) {
            counts.empty += 1;
            continue;
          }
          const asOf = input.deps.now();
          const batch = writeIngestBatch({
            workspaceId: input.workspaceId,
            runId: run.id,
            now: asOf,
            creators: [{
              platform: "tiktok",
              platformCreatorId: profile.secUid,
              handle: profile.uniqueId,
              displayName: profile.nickname,
              followerCount: profile.followers,
              region: profile.region,
              discoveredVia: seed.via,
              metadata: bioMetadata(profile.signature, TIKTOK_PROFILE_SOURCE),
              snapshot: { asOf, source: TIKTOK_PROFILE_SOURCE, followerCount: profile.followers, videoCount: profile.videoCount, totalLikes: profile.hearts },
            }],
            videos: [],
          });
          counts.resolved += 1;
          for (const creatorId of batch.creatorIds) discovered.push({ creatorId, via: seed.via });
          input.deps.log?.({ kind: "trend.tiktok-profile", handle: seed.handle, followers: profile.followers, ms: result.ms });
          await sleep(input.deps.paceMs ?? 0);
        }
      }
    }
  } catch (error) {
    failure = error;
  } finally {
    await session?.close();
  }
  const breakerState = breaker.snapshot();
  if (breakerState.state === "tripped") notes.push(`breaker tripped: ${breakerState.reason}${breakerState.detail ? ` (${breakerState.detail})` : ""}`);
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, breaker: breakerState, notes }), ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return { runId: run.id, kind: "trend.discover", source: TIKTOK_PROFILE_SOURCE, requests: breakerState.requests, breaker: breakerState, counts, notes, discovered };
}

/** List YouTube channels named by @handle and store them under their channel id (no handle-keyed duplicates). */
export async function youtubeHandlePass(input: {
  workspaceId: string;
  handles: HandleSeed[];
  perCreator: number;
  deps: TrendDeps;
  budget: number;
}): Promise<TrendPassSummary> {
  const breaker = new CircuitBreaker(YOUTUBE_LISTING_SOURCE, { budget: input.budget, clock: input.deps.now });
  const counts: Record<string, number> = { handles: input.handles.length, known: 0, listed: 0, failed: 0, videosCreated: 0 };
  const notes: string[] = [];
  const discovered: Array<{ creatorId: string; via: string }> = [];
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.list", label: "YouTube channels by handle", metadata: json({ source: YOUTUBE_LISTING_SOURCE, handles: input.handles.length }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "ytdlp", model: null, request: json({ handles: input.handles.length }) });
  let failure: unknown = null;
  try {
    for (const seed of input.handles) {
      const existing = findCreatorIdByHandle({ workspaceId: input.workspaceId, platform: "youtube", handle: seed.handle });
      if (existing) {
        counts.known += 1;
        discovered.push({ creatorId: existing, via: seed.via });
        continue;
      }
      if (!breaker.acquire()) break;
      // Flat Shorts tabs carry no post time: only the newest entries (#590); they are stored freshness-unknown.
      const result = await listYoutubeChannelShorts({ channelRef: seed.handle, limit: listingLimitFor("youtube", input.perCreator), run: input.deps.ytdlp });
      breaker.record(result.outcome);
      const channelId = result.creator?.platformCreatorId;
      if (result.outcome.kind !== "ok" || !channelId || !isChannelId(channelId)) {
        counts.failed += 1;
        if (result.outcome.kind === "blocked") break;
        continue;
      }
      const asOf = input.deps.now();
      const batch = writeIngestBatch({
        workspaceId: input.workspaceId,
        runId: run.id,
        now: asOf,
        creators: [{
          platform: "youtube",
          platformCreatorId: channelId,
          handle: result.creator?.handle ?? seed.handle,
          displayName: result.creator?.displayName ?? null,
          followerCount: result.creator?.followers ?? null,
          discoveredVia: seed.via,
          metadata: bioMetadata(result.creator?.bio, YOUTUBE_LISTING_SOURCE),
          snapshot: typeof result.creator?.followers === "number" ? { asOf, source: YOUTUBE_LISTING_SOURCE, followerCount: result.creator.followers } : null,
        }],
        videos: result.videos.map((video) => ({
          creatorPlatformId: channelId,
          platform: "youtube" as const,
          platformVideoId: video.platformVideoId,
          url: video.url,
          postedAt: null,
          durationMs: video.durationMs,
          title: video.title,
          hashtags: video.hashtags,
          discoveredVia: "listing",
          inListing: true,
          snapshot: { asOf, source: YOUTUBE_LISTING_SOURCE, views: video.metrics.views, viewsPrecision: video.viewsPrecision },
        })),
        listings: [{ platform: "youtube", platformCreatorId: channelId, at: asOf, ok: true }],
      });
      counts.listed += 1;
      counts.videosCreated += batch.videosCreated;
      for (const creatorId of batch.creatorIds) discovered.push({ creatorId, via: seed.via });
      await sleep(input.deps.paceMs ?? 0);
      if (breaker.tripped) break;
    }
  } catch (error) {
    failure = error;
  }
  const breakerState = breaker.snapshot();
  if (breakerState.state === "tripped") notes.push(`breaker tripped: ${breakerState.reason}`);
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, breaker: breakerState, notes }), ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return { runId: run.id, kind: "trend.list", source: YOUTUBE_LISTING_SOURCE, requests: breakerState.requests, breaker: breakerState, counts, notes, discovered };
}

/** Date Tier-1 YouTube candidates through the watch page, under a budget; stops on the first bot check. */
export async function youtubeWatchPass(input: { workspaceId: string; videoIds: string[]; deps: TrendDeps; budget: number }): Promise<TrendPassSummary> {
  const breaker = new CircuitBreaker(YOUTUBE_WATCH_SOURCE, { budget: Math.min(input.budget, 150), clock: input.deps.now });
  const counts: Record<string, number> = { candidates: input.videoIds.length, dated: 0, failed: 0 };
  const notes: string[] = [];
  const run = startRun({ workspaceId: input.workspaceId, kind: "trend.snapshot", label: "YouTube watch-page dating (Tier-1 candidates)", metadata: json({ source: YOUTUBE_WATCH_SOURCE, videos: input.videoIds.length }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "ytdlp", model: null, request: json({ videos: input.videoIds.length, budget: input.budget }) });
  let failure: unknown = null;
  try {
    for (const id of input.videoIds) {
      if (!breaker.acquire()) break;
      const result = await dateYoutubeVideo({ id, run: input.deps.ytdlp });
      breaker.record(result.outcome);
      if (result.outcome.kind === "blocked") {
        notes.push(`stopped at ${id}: ${result.outcome.reason}`);
        break;
      }
      if (!result.video) {
        counts.failed += 1;
        continue;
      }
      const video: SourceVideo = result.video;
      const asOf = input.deps.now();
      writeIngestBatch({
        workspaceId: input.workspaceId,
        runId: run.id,
        now: asOf,
        creators: [],
        videos: [{
          creatorPlatformId: video.creatorPlatformId,
          platform: "youtube",
          platformVideoId: video.platformVideoId,
          url: video.url,
          postedAt: video.postedAt,
          postedAtSource: YOUTUBE_WATCH_SOURCE,
          durationMs: video.durationMs,
          title: video.title,
          hashtags: video.hashtags,
          language: video.language,
          discoveredVia: "listing",
          inListing: true,
          snapshot: { asOf, source: YOUTUBE_WATCH_SOURCE, ...video.metrics, viewsPrecision: "exact" },
        }],
      });
      counts.dated += 1;
      await sleep(Math.max(input.deps.paceMs ?? 0, 400));
    }
  } catch (error) {
    // A video whose channel is not in the corpus cannot be stored; count and move on.
    failure = /has no creator/.test(String((error as Error)?.message)) ? null : error;
    if (!failure) counts.failed += 1;
  }
  const breakerState = breaker.snapshot();
  finishRunAttempt(attempt.id, { state: failure ? "failed" : "succeeded", response: json({ counts, breaker: breakerState, notes }), ...(failure ? { error: failure } : {}) });
  finishRun(run.id, failure ? { state: "failed", error: failure } : { state: "succeeded" });
  if (failure) throw failure;
  return { runId: run.id, kind: "trend.snapshot", source: YOUTUBE_WATCH_SOURCE, requests: breakerState.requests, breaker: breakerState, counts, notes };
}

// ─── Gate ───────────────────────────────────────────────────────────────────

function gateWrite(member: NicheMemberDto, result: GateResult, method: "rule" | "llm", languages: readonly string[]): GateWrite {
  // Too little text to tell the language: keep an earlier verdict, else a single-language niche assumes its own.
  const earlier = member.evidence?.languageInferred === true ? null : member.language;
  const language = result.language ?? earlier ?? (languages.length === 1 ? languages[0]! : null);
  return {
    creatorId: member.creatorId,
    status: result.status,
    reason: result.reason,
    method,
    language,
    relevance: result.relevance,
    sampled: result.sampled,
    onTopic: result.onTopic,
    subNiche: result.subNiche,
    subNicheConfidence: result.subNicheConfidence,
    evidence: { matchedTerms: result.matchedTerms, profileTerms: result.profileTerms, textual: result.textual, languageInferred: result.language === null && language !== null },
  };
}

const profileText = (member: NicheMemberDto) => [member.handle, member.displayName, typeof member.metadata?.bio === "string" ? member.metadata.bio : null].filter(Boolean).join(" ");

/**
 * Run the relevance gate for listed members (only `candidate` ones unless
 * `all`). A member whose listing failed for good (no Shorts tab, private) is
 * dropped as `no-listing`; one not listed yet stays a candidate.
 */
export function gateMembers(input: { niche: NicheDto; runId: string | null; now: number; all: boolean }): { kept: number; dropped: number; undetermined: number; keptIds: string[]; droppedIds: string[] } {
  const settings = input.niche.settings;
  const members = loadNicheMembers({ nicheId: input.niche.id }).filter((member) => input.all ? member.gateMethod !== "manual" : member.status === "candidate");
  const listed = members.filter((member) => member.lastListedAt !== null);
  const unlisted = members.filter((member) => member.lastListedAt === null && member.tier === "excluded" && member.listingFailures > 0);
  const videos = loadGateVideos({ creatorIds: listed.map((member) => member.creatorId), sample: settings.gateSample });
  const results: GateWrite[] = [];
  for (const member of listed) {
    const rows = videos.get(member.creatorId) ?? [];
    const result = gateCreator(
      { videos: rows.map((row) => ({ text: [row.title, row.description].filter(Boolean).join(" "), hashtags: row.hashtags })), profileText: profileText(member), preferProfileLanguage: member.platform === "youtube" },
      { languages: input.niche.languages, lexicon: input.niche.taxonomy.lexicon, subNiches: input.niche.taxonomy.subNiches, threshold: settings.relevanceThreshold, profileFloor: settings.profileRelevanceFloor ?? 0, sample: settings.gateSample, minSample: settings.minGateSample },
    );
    results.push(gateWrite(member, result, "rule", input.niche.languages));
  }
  for (const member of unlisted) {
    results.push({ creatorId: member.creatorId, status: "dropped", reason: "no-listing", method: "rule", language: null, relevance: null, sampled: 0, onTopic: 0, subNiche: null, subNicheConfidence: null, evidence: { listError: member.lastListError } });
  }
  const counts = writeGateResults({ nicheId: input.niche.id, nicheSlug: input.niche.slug, runId: input.runId, now: input.now, results });
  const keptIds = results.filter((row) => row.status === "kept").map((row) => row.creatorId);
  const droppedIds = results.filter((row) => row.status === "dropped").map((row) => row.creatorId);
  setGateExclusion({ creatorIds: keptIds, exclude: false, now: input.now });
  setGateExclusion({ creatorIds: droppedIds, exclude: true, now: input.now });
  return { ...counts, keptIds, droppedIds };
}

/** Optional LLM pass (behind --llm-relevance) for undetermined and near-threshold creators. */
export async function llmRelevancePass(input: { niche: NicheDto; runId: string | null; now: number; deps: TrendDeps; model?: string; limit?: number }): Promise<{ judged: number; changed: number }> {
  if (!input.deps.llm) return { judged: 0, changed: 0 };
  const threshold = input.niche.settings.relevanceThreshold;
  const members = loadNicheMembers({ nicheId: input.niche.id, statuses: ["undetermined", "dropped"] })
    .filter((member) => member.lastListedAt !== null && member.gateMethod === "rule" && !member.gateReason?.startsWith("language-") && member.gateReason !== "no-listing")
    .filter((member) => member.status === "undetermined" || (member.relevance ?? 0) >= threshold - 0.25)
    .slice(0, input.limit ?? 200);
  const videos = loadGateVideos({ creatorIds: members.map((member) => member.creatorId), sample: input.niche.settings.gateSample });
  const subs = input.niche.taxonomy.subNiches.map((sub) => sub.slug);
  let changed = 0;
  for (let index = 0; index < members.length; index += 10) {
    const batch = members.slice(index, index + 10);
    const system = [
      `You judge whether short-form creators belong to the niche "${input.niche.topic}" (languages: ${input.niche.languages.join(", ")}).`,
      "For each creator count how many of the listed recent titles are on-topic. Pick a sub-niche from the list or general.",
      `Sub-niches: ${subs.join(", ") || "general"}.`,
      'Reply JSON only: {"items":[{"i":0,"on_topic":0,"total":0,"sub_niche":"...","confidence":0.0}]}',
    ].join("\n");
    const user = batch.map((member, i) => JSON.stringify({ i, name: member.displayName, titles: (videos.get(member.creatorId) ?? []).map((row) => (row.title ?? row.description ?? "").slice(0, 120)) })).join("\n");
    let text: string;
    try {
      text = await input.deps.llm({ model: input.model ?? LLM_LABEL_MODEL, system, user });
    } catch {
      continue;
    }
    let parsed: { items?: Array<{ i?: number; on_topic?: number; total?: number; sub_niche?: string; confidence?: number }> };
    try {
      parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      continue;
    }
    const writes: GateWrite[] = [];
    for (const item of parsed.items ?? []) {
      const member = typeof item.i === "number" ? batch[item.i] : undefined;
      if (!member || typeof item.on_topic !== "number" || typeof item.total !== "number" || item.total <= 0 || (item.confidence ?? 0) < 0.6) continue;
      const relevance = Math.max(0, Math.min(1, item.on_topic / item.total));
      const status = relevance >= threshold ? "kept" : "dropped";
      if (status !== member.status) changed += 1;
      writes.push({
        creatorId: member.creatorId, status, reason: status === "kept" ? "on-topic" : "off-topic", method: "llm", language: member.language,
        relevance: Math.round(relevance * 1000) / 1000, sampled: item.total, onTopic: item.on_topic,
        subNiche: typeof item.sub_niche === "string" && (subs.includes(item.sub_niche) || item.sub_niche === "general") ? item.sub_niche : member.subNiche,
        subNicheConfidence: item.confidence ?? null, evidence: { ...(member.evidence ?? {}), llmModel: input.model ?? LLM_LABEL_MODEL },
      });
    }
    writeGateResults({ nicheId: input.niche.id, nicheSlug: input.niche.slug, runId: input.runId, now: input.now, results: writes });
  }
  return { judged: members.length, changed };
}

// ─── Groups: anomalies and the negative control group ───────────────────────

export interface GroupSummary {
  groups: Record<string, number>;
  flags: Record<string, number>;
  negative: NicheInitSummary["negative"];
}

/** Engagement rate per view of one video (interactions the source exposes), null without views. */
export function engagementRate(video: Pick<NicheVideoDto, "views" | "likes" | "comments" | "shares" | "saves">): number | null {
  if (video.views === null || video.views <= 0) return null;
  const parts = [video.likes, video.comments, video.shares, video.saves].filter((value): value is number => value !== null);
  return parts.length === 0 ? null : parts.reduce((sum, value) => sum + value, 0) / video.views;
}

/**
 * Assign kept members to main / negative / anomaly and write flags
 * (`engagement-anomaly`, `compilation-page`, `repost-account`,
 * `packaging-weak`, `provisional`, `inactive`, `activity-unknown`).
 */
export function assignGroups(input: { niche: NicheDto; now: number }): GroupSummary {
  const kept = loadNicheMembers({ nicheId: input.niche.id, statuses: ["kept"] });
  const ids = kept.map((member) => member.creatorId);
  const videos = loadNicheVideos({ creatorIds: ids });
  const byCreator = new Map<string, NicheVideoDto[]>();
  for (const video of videos) (byCreator.get(video.creatorId) ?? byCreator.set(video.creatorId, []).get(video.creatorId)!).push(video);
  const series = followerSeries({ creatorIds: ids });
  const cohorts = cohortMedians({ workspaceId: input.niche.workspaceId });
  const curves = currentCurves(input.niche.workspaceId);

  const rates = kept.map((member) => {
    const list = byCreator.get(member.creatorId) ?? [];
    const values = list.map(engagementRate).filter((value): value is number => value !== null);
    const withViews = list.filter((video) => video.views !== null && video.views > 0 && video.likes !== null);
    const impossible = withViews.filter((video) => (video.likes ?? 0) > (video.views ?? 0)).length;
    return { creatorId: member.creatorId, medianRate: values.length >= 5 ? median(values) : null, impossibleShare: withViews.length > 0 ? impossible / withViews.length : 0 };
  });
  const rateById = new Map(rates.map((entry) => [entry.creatorId, entry.medianRate]));
  const engagementFlagged = engagementAnomalies(rates);
  const duplicates = duplicateCaptionShares(new Map(kept.map((member) => [member.creatorId, (byCreator.get(member.creatorId) ?? []).map((video) => video.description ?? video.title ?? "")])));

  const flags = new Map<string, string[]>(kept.map((member) => [member.creatorId, []]));
  const anomalies = new Set<string>();
  for (const member of kept) {
    const list = flags.get(member.creatorId)!;
    if (engagementFlagged.has(member.creatorId)) list.push("engagement-anomaly");
    if (compilationName(member.handle, member.displayName)) list.push("compilation-page");
    const dup = duplicates.get(member.creatorId);
    if (dup && dup.considered >= 5 && dup.share >= 0.3) list.push("repost-account");
    if (list.length > 0) anomalies.add(member.creatorId);
    if (member.platform === "youtube") list.push("activity-unknown");
    else if (member.lastPostedAt !== null && input.now - member.lastPostedAt > 14 * DAY_MS) list.push("inactive");
  }

  // Analysis cap per language, stratified by quota band; the rest is out-of-sample.
  const outOfSample = new Set<string>();
  const cap = input.niche.settings.sampleCap ?? 400;
  const byLanguage = new Map<string, NicheMemberDto[]>();
  for (const member of kept) {
    if (anomalies.has(member.creatorId)) continue;
    const key = member.language ?? "unknown";
    (byLanguage.get(key) ?? byLanguage.set(key, []).get(key)!).push(member);
  }
  for (const list of byLanguage.values()) {
    const sample = selectAnalysisSample(list, cap);
    for (const member of list) {
      if (!sample.has(member.creatorId)) {
        outOfSample.add(member.creatorId);
        flags.get(member.creatorId)!.push("out-of-sample");
      }
    }
  }

  // Negative control group: persistently below the platform x niche x size cohort median.
  const cohortMedianFor = (cohortKey: string | null): number | null => {
    if (!cohortKey) return null;
    const keys = cohortFallbacks(cohortKey).slice(1);
    for (const key of keys) {
      const hit = cohorts.get(`${key}#views`);
      if (hit) return hit.median;
    }
    return null;
  };
  const eligible: Array<{ creatorId: string; quotaBand: QuotaBand | null; belowShare: number }> = [];
  let provisional = false;
  for (const member of kept) {
    if (anomalies.has(member.creatorId) || outOfSample.has(member.creatorId)) continue;
    const curve = curves[member.platform] ?? MATURITY_PRIORS[member.platform];
    const performance = (byCreator.get(member.creatorId) ?? []).flatMap((video) => {
      if (video.postedAt === null || video.latestAsOf === null) return [];
      const ageHours = (video.latestAsOf - video.postedAt) / HOUR_MS;
      const projected = video.views === null ? null : project(video.views, ageHours, curve);
      const cohort = cohortMedianFor(video.cohortKey);
      const belowCohort = ageHours >= PROVISIONAL_AGE_HOURS && projected !== null && cohort !== null ? logValue(projected) < cohort : null;
      return [{ postedAt: video.postedAt, multiplier: video.multiplier, label: video.label, belowCohort }];
    });
    const verdict = negativeEligibility({ creatorId: member.creatorId, quotaBand: quotaBandFor(member.followers), videos: performance, followerSeries: series.get(member.creatorId) ?? [] }, input.now);
    if (verdict.eligible && verdict.belowShare !== null) {
      eligible.push({ creatorId: member.creatorId, quotaBand: quotaBandFor(member.followers), belowShare: verdict.belowShare });
      if (verdict.provisional) provisional = true;
    }
  }
  const bandCounts = new Map<QuotaBand, number>();
  for (const member of kept) {
    if (anomalies.has(member.creatorId) || outOfSample.has(member.creatorId)) continue;
    const band = quotaBandFor(member.followers);
    if (band) bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }
  const selection = selectNegativeGroup(eligible, bandCounts, input.niche.settings.negativeShare);
  const negatives = new Set(selection.selected);
  const keptRates = kept.map((member) => rateById.get(member.creatorId)).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  const p75 = keptRates.length >= 8 ? keptRates[Math.floor(keptRates.length * 0.75)]! : null;
  let packagingWeak = 0;
  for (const creatorId of negatives) {
    const list = flags.get(creatorId)!;
    if (provisional) list.push("provisional");
    const rate = rateById.get(creatorId);
    if (p75 !== null && typeof rate === "number" && rate >= p75) {
      list.push("packaging-weak");
      packagingWeak += 1;
    }
  }
  const groups: Array<{ creatorId: string; group: NicheCohortGroup; flags: string[] }> = kept.map((member) => ({
    creatorId: member.creatorId,
    group: anomalies.has(member.creatorId) ? "anomaly" : negatives.has(member.creatorId) ? "negative" : "main",
    flags: flags.get(member.creatorId) ?? [],
  }));
  writeMemberGroups({ nicheId: input.niche.id, now: input.now, groups });
  const groupCounts: Record<string, number> = {};
  const flagCounts: Record<string, number> = {};
  for (const entry of groups) {
    const key = entry.flags.includes("out-of-sample") ? "out-of-sample" : entry.group;
    groupCounts[key] = (groupCounts[key] ?? 0) + 1;
    for (const flag of entry.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
  }
  return {
    groups: groupCounts,
    flags: flagCounts,
    negative: { target: selection.target, selected: selection.selected.length, provisional, packagingWeak, eligible: eligible.length, byBand: selection.byBand },
  };
}

/** Tier-1 YouTube candidates for watch-page dating: one top video per kept main creator, by raw listing ratio. */
export function youtubeDatingCandidates(input: { niche: NicheDto; budget: number }): string[] {
  const members = loadNicheMembers({ nicheId: input.niche.id, statuses: ["kept"] }).filter((member) => member.platform === "youtube" && member.cohortGroup === "main");
  const videos = loadNicheVideos({ creatorIds: members.map((member) => member.creatorId) });
  const sizeOf = new Map(members.map((member) => [member.creatorId, member.sizeBand]));
  const byCreator = new Map<string, NicheVideoDto[]>();
  for (const video of videos) (byCreator.get(video.creatorId) ?? byCreator.set(video.creatorId, []).get(video.creatorId)!).push(video);
  const picks: Array<{ id: string; weight: number }> = [];
  for (const [creatorId, list] of byCreator) {
    if (list.some((video) => video.postedAtSource === YOUTUBE_WATCH_SOURCE)) continue;
    const views = list.map((video) => video.views).filter((value): value is number => value !== null);
    const center = views.length >= 8 ? median(views) : null;
    if (!center || center <= 0) continue;
    const best = list
      .filter((video) => video.postedAt === null && (video.views ?? 0) >= input.niche.settings.noiseFloorViews)
      .map((video) => ({ id: video.platformVideoId, ratio: (video.views ?? 0) / center }))
      .filter((entry) => entry.ratio >= 3)
      .sort((a, b) => b.ratio - a.ratio)[0];
    if (!best) continue;
    const band = sizeOf.get(creatorId) ?? "unknown";
    const weight = (COPYABILITY_SIZE_WEIGHTS[band as keyof typeof COPYABILITY_SIZE_WEIGHTS] ?? 0.5) * Math.log(best.ratio);
    picks.push({ id: best.id, weight });
  }
  return picks.sort((a, b) => b.weight - a.weight).slice(0, Math.max(0, Math.min(150, input.budget))).map((entry) => entry.id);
}

// ─── Orchestration ──────────────────────────────────────────────────────────

function keptCount(nicheId: string, languages: readonly string[]): number {
  return loadNicheMembers({ nicheId, statuses: ["kept"] }).filter((member) => member.language === null || languages.includes(member.language)).length;
}

/**
 * A second `niche init` for another language adds to the niche: languages
 * and platforms are unions, lexicons merge per language, and sub-niches with
 * the same slug pool their terms (one taxonomy, terms in every language).
 */
export function mergeNicheDefinition(existing: NicheDto | null, seedFile: NicheSeedFile): { languages: string[]; platforms: TrendPlatform[]; taxonomy: NicheSeedFile["taxonomy"] } {
  if (!existing) return { languages: seedFile.languages, platforms: seedFile.platforms, taxonomy: seedFile.taxonomy };
  const languages = [...new Set([...existing.languages, ...seedFile.languages])];
  const platforms = [...new Set([...existing.platforms, ...seedFile.platforms])];
  const subNiches = existing.taxonomy.subNiches.map((sub) => ({ ...sub, terms: [...sub.terms] }));
  for (const sub of seedFile.taxonomy.subNiches) {
    const prior = subNiches.find((entry) => entry.slug === sub.slug);
    if (prior) {
      prior.terms = [...new Set([...prior.terms, ...sub.terms])];
      prior.label = sub.label || prior.label;
    } else subNiches.push({ ...sub, terms: [...sub.terms] });
  }
  return { languages, platforms, taxonomy: { subNiches, lexicon: { ...existing.taxonomy.lexicon, ...seedFile.taxonomy.lexicon } } };
}

/** Expansion work from creators kept in this round. */
function expansionWork(input: {
  niche: NicheDto;
  keptIds: readonly string[];
  usedHashtags: Set<string>;
  attemptedTiktok: Set<string>;
  attemptedYoutube: Set<string>;
  options: NicheInitOptions;
}): RoundWork {
  const work = emptyWork();
  if (input.keptIds.length === 0) return work;
  const members = loadNicheMembers({ nicheId: input.niche.id, statuses: ["kept"] }).filter((member) => input.keptIds.includes(member.creatorId));
  const videos = loadGateVideos({ creatorIds: input.keptIds, sample: input.niche.settings.gateSample });
  const platforms = input.niche.platforms;
  const knownTiktok = knownHandles({ workspaceId: input.niche.workspaceId, platform: "tiktok" });
  const knownYoutube = knownHandles({ workspaceId: input.niche.workspaceId, platform: "youtube" });
  const queueTiktok = (handle: string | null, via: string) => {
    if (!handle || !platforms.includes("tiktok")) return;
    const bare = handle.replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9._]{2,24}$/.test(bare) || input.attemptedTiktok.has(bare) || knownTiktok.has(bare)) return;
    if (work.tiktokHandles.length >= input.options.expansionHandles) return;
    input.attemptedTiktok.add(bare);
    work.tiktokHandles.push({ handle: bare, via });
  };
  const queueYoutube = (handle: string | null, via: string) => {
    if (!handle || !platforms.includes("youtube")) return;
    const withAt = handle.startsWith("@") ? handle : `@${handle}`;
    const key = withAt.slice(1).toLowerCase();
    if (key.length < 3 || input.attemptedYoutube.has(key) || knownYoutube.has(key)) return;
    if (work.youtubeHandles.length >= input.options.expansionHandles) return;
    input.attemptedYoutube.add(key);
    work.youtubeHandles.push({ handle: withAt, via });
  };
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  for (const member of members) {
    const meta = member.metadata ?? {};
    for (const handle of strings(meta.tiktokHandles)) queueTiktok(handle, `related:bio-link:${member.platform}:${member.handle ?? member.platformCreatorId}`);
    for (const handle of strings(meta.youtubeHandles)) queueYoutube(handle, `related:bio-link:${member.platform}:${member.handle ?? member.platformCreatorId}`);
    if (member.platform === "youtube" && input.options.guessHandles) queueTiktok(tiktokHandleFromYoutube(member.handle), `related:same-handle:${member.handle}`);
    const mentions = new Set<string>(strings(meta.mentions));
    for (const row of videos.get(member.creatorId) ?? []) for (const mention of extractMentions(`${row.title ?? ""} ${row.description ?? ""}`)) mentions.add(mention);
    for (const mention of mentions) {
      if (mention === (member.handle ?? "").replace(/^@/, "").toLowerCase()) continue;
      if (member.platform === "tiktok") queueTiktok(mention, `related:mention:tiktok:${member.handle ?? member.platformCreatorId}`);
      else queueYoutube(mention, `related:mention:youtube:${member.handle ?? member.platformCreatorId}`);
    }
  }
  if (platforms.includes("youtube") && input.options.expansionHashtags > 0) {
    const lexicon = mergedLexicon(input.niche.taxonomy.lexicon, input.niche.languages);
    const terms = [...lexicon.core, ...input.niche.taxonomy.subNiches.flatMap((sub) => sub.terms)];
    const tags = expansionHashtags(
      input.keptIds.map((id) => (videos.get(id) ?? []).flatMap((row) => row.hashtags)),
      input.usedHashtags,
      terms,
      { limit: input.options.expansionHashtags, minCreators: 2 },
    );
    for (const tag of tags) {
      input.usedHashtags.add(tag);
      work.youtubeHashtags.push(tag);
    }
  }
  return work;
}

async function runDiscovery(input: {
  niche: NicheDto;
  work: RoundWork;
  round: number;
  options: NicheInitOptions;
  deps: TrendDeps;
  passes: TrendPassSummary[];
  skipped: string[];
}): Promise<{ discovered: Array<{ creatorId: string; via: string }>; seeds: Record<string, number> }> {
  const { niche, work, options, deps } = input;
  const now = deps.now();
  const discovered: Array<{ creatorId: string; via: string }> = [];
  const seeds: Record<string, number> = {};
  const cooldown = options.cooldownMs;
  const guard = (source: string): boolean => {
    const trip = cooldownFor(niche.workspaceId, source, deps.now(), cooldown);
    if (trip) input.skipped.push(`${source}: breaker open (${trip.reason}) until ${new Date(trip.retryAfter).toISOString()}`);
    return trip === null;
  };
  const passOptions = (source: TrendSource, values: string[], depth: number) => ({
    workspaceId: niche.workspaceId,
    source,
    seeds: values,
    niche: niche.slug,
    perCreator: options.perCreator,
    maxCreators: 0,
    concurrency: options.concurrency,
    discoveryDepth: depth,
    budget: options.budget,
    paid: { enabled: false, dailyCapUsd: null },
    maxAgeDays: options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
  });
  const plain: Array<{ source: TrendSource; discoverySource: string; kind: WatchlistKind; platform: TrendPlatform; values: string[]; depth: number }> = [
    { source: "youtube-search", discoverySource: "youtube-search", kind: "keyword", platform: "youtube", values: work.youtubeKeywords, depth: options.searchDepth },
    { source: "youtube-hashtag", discoverySource: "youtube-hashtag", kind: "hashtag", platform: "youtube", values: work.youtubeHashtags, depth: options.hashtagDepth },
    { source: "youtube-channel", discoverySource: "manual", kind: "creator", platform: "youtube", values: work.youtubeChannelIds, depth: 1 },
    { source: "tiktok-creator", discoverySource: "manual", kind: "creator", platform: "tiktok", values: work.tiktokSecUids, depth: 1 },
    { source: "tiktok-sound", discoverySource: "tiktok-sound", kind: "sound", platform: "tiktok", values: work.tiktokSounds, depth: 20 },
    { source: "tiktok-explore", discoverySource: "tiktok-explore", kind: "explore-category", platform: "tiktok", values: work.exploreCategories, depth: 40 },
  ];
  for (const entry of plain) {
    if (entry.values.length === 0) continue;
    seeds[entry.source] = entry.values.length;
    if (entry.discoverySource !== "manual" && !guard(entry.discoverySource)) continue;
    const watchlists = entry.values.map((value) => watchlistFor(niche.workspaceId, niche.slug, entry.platform, entry.kind, value, entry.source, now));
    const pass = await discoveryPass(passOptions(entry.source, entry.values, entry.depth), watchlists, deps);
    input.passes.push(pass);
    discovered.push(...(pass.discovered ?? []));
  }
  if (work.youtubeHandles.length > 0) {
    seeds["youtube-handle"] = work.youtubeHandles.length;
    for (const seed of work.youtubeHandles) watchlistFor(niche.workspaceId, niche.slug, "youtube", seed.via.startsWith("creator:") ? "creator" : "related", seed.handle, NICHE_YOUTUBE_HANDLE_SOURCE, now);
    if (guard(LISTING_SOURCE_BY_PLATFORM.youtube)) {
      const pass = await youtubeHandlePass({ workspaceId: niche.workspaceId, handles: work.youtubeHandles, perCreator: options.perCreator, deps, budget: options.budget });
      input.passes.push(pass);
      discovered.push(...(pass.discovered ?? []));
    }
  }
  if (work.tiktokHandles.length > 0) {
    seeds["tiktok-handle"] = work.tiktokHandles.length;
    for (const seed of work.tiktokHandles) watchlistFor(niche.workspaceId, niche.slug, "tiktok", seed.via.startsWith("creator:") ? "creator" : "related", seed.handle, NICHE_TIKTOK_PROFILE_SOURCE, now);
    if (guard(TIKTOK_PROFILE_SOURCE)) {
      const used = input.passes.filter((pass) => pass.source === TIKTOK_PROFILE_SOURCE).reduce((sum, pass) => sum + pass.requests, 0);
      const remaining = Math.max(0, options.profileBudget - used);
      if (remaining === 0) input.skipped.push(`${TIKTOK_PROFILE_SOURCE}: profile budget of ${options.profileBudget} spent; ${work.tiktokHandles.length} handle(s) left`);
      else {
        const pass = await tiktokProfilePass({ workspaceId: niche.workspaceId, handles: work.tiktokHandles, deps, budget: remaining });
        input.passes.push(pass);
        discovered.push(...(pass.discovered ?? []));
      }
    }
  }
  return { discovered, seeds };
}

async function listCandidates(input: { niche: NicheDto; options: NicheInitOptions; deps: TrendDeps; passes: TrendPassSummary[]; skipped: string[] }): Promise<Record<string, number>> {
  const { niche, options, deps } = input;
  const perCreator = options.sampleListing && options.sampleListing > 0 ? Math.min(options.sampleListing, options.perCreator) : options.perCreator;
  const listed: Record<string, number> = {};
  const candidates = loadNicheMembers({ nicheId: niche.id, statuses: ["candidate"] }).filter((member) => member.lastListedAt === null && member.tier !== "excluded");
  const kept = loadNicheMembers({ nicheId: niche.id, statuses: ["kept"] });
  for (const platform of ["tiktok", "youtube"] as const) {
    if (!niche.platforms.includes(platform)) continue;
    const pool = candidates.filter((member) => member.platform === platform);
    if (pool.length === 0) continue;
    const source = LISTING_SOURCE_BY_PLATFORM[platform];
    const trip = cooldownFor(niche.workspaceId, source, deps.now(), options.cooldownMs);
    if (trip) {
      input.skipped.push(`${source}: breaker open (${trip.reason}) until ${new Date(trip.retryAfter).toISOString()}`);
      continue;
    }
    const status = quotaStatus(kept.filter((member) => member.platform === platform).map((member) => member.followers), options.settings.targetCreators);
    const ordered = prioritizeByQuota(pool, status);
    const pass = await listingPass({
      workspaceId: niche.workspaceId,
      platform,
      creators: ordered.map((member) => ({
        id: member.creatorId,
        platform: member.platform,
        platformCreatorId: member.platformCreatorId,
        handle: member.handle,
        tier: member.tier,
        lastListedAt: member.lastListedAt,
        nextListAt: null,
        niche: member.creatorNiche,
        watchlistId: null,
      })),
      perCreator,
      concurrency: options.concurrency,
      budget: options.budget,
      kind: "trend.list",
      deps,
      maxAgeDays: options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
    });
    input.passes.push(pass);
    listed[platform] = pass.counts.creatorsListed ?? 0;
  }
  return listed;
}

/** Full backfill for kept creators listed only with the gate sample (never for dropped candidates). */
async function backfillKept(input: { niche: NicheDto; options: NicheInitOptions; deps: TrendDeps; passes: TrendPassSummary[]; skipped: string[] }): Promise<Record<string, number>> {
  const { niche, options, deps } = input;
  const sample = options.sampleListing ?? 0;
  const out: Record<string, number> = {};
  if (sample <= 0 || sample >= options.perCreator) return out;
  const kept = loadNicheMembers({ nicheId: niche.id, statuses: ["kept"] }).filter((member) => member.tier !== "excluded");
  const counts = listedVideoCounts({ creatorIds: kept.map((member) => member.creatorId) });
  const needs = kept.filter((member) => (counts.get(member.creatorId) ?? 0) <= sample && member.flags.indexOf("backfilled") === -1);
  for (const platform of ["tiktok", "youtube"] as const) {
    const pool = needs.filter((member) => member.platform === platform);
    if (pool.length === 0) continue;
    const source = LISTING_SOURCE_BY_PLATFORM[platform];
    const trip = cooldownFor(niche.workspaceId, source, deps.now(), options.cooldownMs);
    if (trip) {
      input.skipped.push(`${source}: backfill skipped, breaker open (${trip.reason})`);
      continue;
    }
    const pass = await listingPass({
      workspaceId: niche.workspaceId,
      platform,
      creators: pool.map((member) => ({ id: member.creatorId, platform: member.platform, platformCreatorId: member.platformCreatorId, handle: member.handle, tier: member.tier, lastListedAt: member.lastListedAt, nextListAt: null, niche: member.creatorNiche, watchlistId: null })),
      perCreator: options.perCreator,
      concurrency: options.concurrency,
      budget: options.budget,
      kind: "trend.list",
      deps,
      maxAgeDays: options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
    });
    input.passes.push(pass);
    out[platform] = pass.counts.creatorsListed ?? 0;
  }
  return out;
}

export async function nicheInit(options: NicheInitOptions, deps: TrendDeps): Promise<NicheInitSummary> {
  const startedAt = deps.now();
  const seedFile = options.seedFile;
  const merged = mergeNicheDefinition(getNiche({ workspaceId: options.workspaceId, ref: seedFile.slug }), seedFile);
  const niche = upsertNiche({
    workspaceId: options.workspaceId,
    slug: seedFile.slug,
    topic: seedFile.topic,
    languages: merged.languages,
    platforms: merged.platforms,
    parentNiche: seedFile.parentNiche,
    taxonomy: merged.taxonomy,
    settings: options.settings,
    seedSource: options.seedSource,
    now: startedAt,
  });
  const runLanguages = seedFile.languages;
  const run = startRun({ workspaceId: options.workspaceId, kind: "trend.niche", label: `Niche init: ${niche.slug}`, metadata: json({ source: "niche", niche: niche.slug, seedSource: options.seedSource }) });
  const attempt = startRunAttempt({ runId: run.id, provider: "ralphy", model: "niche-v1", request: json({ seeds: seedFile.seeds.length, target: options.settings.targetCreators, languages: seedFile.languages }) });
  const passes: TrendPassSummary[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  const rounds: NicheRoundSummary[] = [];
  let failure: unknown = null;
  let stopReason = "not-started";
  const budgetMs = options.settings.timeBudgetMinutes * 60_000;
  const target = options.settings.targetCreators * seedFile.languages.length;
  try {
    const { work: firstWork, unsupported } = seedWork(seedFile, seedFile.platforms);
    for (const line of unsupported) skipped.push(`seed not used: ${line}`);
    // Re-gate members from earlier runs so a changed lexicon applies to them too.
    gateMembers({ niche, runId: run.id, now: deps.now(), all: true });
    // Expansion seeds tried by earlier runs are watchlist rows of this niche: a
    // re-run continues the snowball instead of repeating it.
    const earlier = listWatchlists({ workspaceId: niche.workspaceId, includeInactive: true }).filter((row) => row.niche === niche.slug && row.kind === "related");
    const usedHashtags = new Set([
      ...firstWork.youtubeHashtags,
      ...listWatchlists({ workspaceId: niche.workspaceId, includeInactive: true }).filter((row) => row.niche === niche.slug && row.kind === "hashtag" && row.platform === "youtube").map((row) => row.value.toLowerCase()),
    ]);
    const attemptedTiktok = new Set([
      ...firstWork.tiktokHandles.map((seed) => seed.handle),
      ...earlier.filter((row) => row.platform === "tiktok").map((row) => row.value.replace(/^@/, "").toLowerCase()),
    ]);
    const attemptedYoutube = new Set([
      ...firstWork.youtubeHandles.map((seed) => seed.handle.slice(1).toLowerCase()),
      ...earlier.filter((row) => row.platform === "youtube").map((row) => row.value.replace(/^@/, "").toLowerCase()),
    ]);
    let work = firstWork;
    if (options.discover === false) {
      stopReason = "no-discovery";
      if (options.list !== false) {
        const roundStarted = deps.now();
        const listed = await listCandidates({ niche, options, deps, passes, skipped });
        const gate = gateMembers({ niche, runId: run.id, now: deps.now(), all: false });
        const backfilled = await backfillKept({ niche, options, deps, passes, skipped });
        rounds.push({ round: 0, seeds: {}, candidatesAdded: 0, listed, backfilled, gate: { kept: gate.kept, dropped: gate.dropped, undetermined: gate.undetermined }, keptTotal: keptCount(niche.id, runLanguages), wallSeconds: Math.round((deps.now() - roundStarted) / 100) / 10, decision: "no-discovery" });
      }
    }
    for (let round = 0; options.discover !== false; round += 1) {
      const roundStarted = deps.now();
      const keptBefore = keptCount(niche.id, runLanguages);
      const { discovered, seeds } = await runDiscovery({ niche, work, round, options, deps, passes, skipped });
      const added = addNicheCandidates({ nicheId: niche.id, runId: run.id, now: deps.now(), entries: discovered.map((entry) => ({ ...entry, round })) });
      const listed = await listCandidates({ niche, options, deps, passes, skipped });
      const gate = gateMembers({ niche, runId: run.id, now: deps.now(), all: false });
      const backfilled = await backfillKept({ niche, options, deps, passes, skipped });
      const keptAfter = keptCount(niche.id, runLanguages);
      // Round 0 expands from every kept member (a re-run picks up creators an
      // earlier run kept but did not expand); later rounds from the newly kept.
      const expandFrom = round === 0 ? loadNicheMembers({ nicheId: niche.id, statuses: ["kept"] }).map((member) => member.creatorId) : gate.keptIds;
      work = expansionWork({ niche, keptIds: expandFrom, usedHashtags, attemptedTiktok, attemptedYoutube, options });
      const decision = snowballDecision({
        round,
        maxRounds: options.settings.maxRounds,
        keptBefore,
        keptAfter,
        target,
        elapsedMs: deps.now() - startedAt,
        budgetMs,
        nextSeeds: workSize(work),
      });
      rounds.push({
        round,
        seeds,
        candidatesAdded: added.added,
        listed,
        backfilled,
        gate: { kept: gate.kept, dropped: gate.dropped, undetermined: gate.undetermined },
        keptTotal: keptAfter,
        wallSeconds: Math.round((deps.now() - roundStarted) / 100) / 10,
        decision: decision.reason,
      });
      deps.log?.({ kind: "trend.niche.round", round, kept: keptAfter, added: added.added, decision: decision.reason });
      if (decision.stop) {
        stopReason = decision.reason;
        break;
      }
    }
    if (options.llmRelevance) {
      const llm = await llmRelevancePass({ niche, runId: run.id, now: deps.now(), deps, ...(options.llmModel ? { model: options.llmModel } : {}) });
      notes.push(llm.judged > 0 ? `LLM relevance pass judged ${llm.judged} undetermined / near-threshold creator(s), changed ${llm.changed}` : "--llm-relevance: no text provider configured or nothing to judge");
    }
    passes.push(await labelPass({ workspaceId: niche.workspaceId, deps, llm: false, llmLimit: 0 }));
    passes.push(scorePass({ workspaceId: niche.workspaceId, now: deps.now(), refit: false, ...(options.labelPolicy ? { labelPolicy: options.labelPolicy } : {}) }));
    const groups = assignGroups({ niche, now: deps.now() });
    let youtubeDated = 0;
    if (options.youtubeDateBudget > 0 && niche.platforms.includes("youtube")) {
      const ids = youtubeDatingCandidates({ niche, budget: options.youtubeDateBudget });
      if (ids.length > 0 && cooldownFor(niche.workspaceId, YOUTUBE_WATCH_SOURCE, deps.now(), options.cooldownMs) === null) {
        const pass = await youtubeWatchPass({ workspaceId: niche.workspaceId, videoIds: ids, deps, budget: options.youtubeDateBudget });
        passes.push(pass);
        youtubeDated = pass.counts.dated ?? 0;
      }
    }
    const summary = summarize({ niche, runId: run.id, startedAt, deps, rounds, stopReason, passes, skipped, notes, groups, youtubeDated, target: options.settings.targetCreators });
    finishRunAttempt(attempt.id, { state: "succeeded", response: json({ ...summary, passes: summary.passes.map((pass) => ({ kind: pass.kind, source: pass.source, requests: pass.requests, breaker: pass.breaker.state })) }) });
    finishRun(run.id, { state: "succeeded" });
    markNicheRun({ nicheId: niche.id, runId: run.id, now: deps.now() });
    return summary;
  } catch (error) {
    failure = error;
    finishRunAttempt(attempt.id, { state: "failed", response: json({ rounds, stopReason, skipped, notes }), error: failure });
    finishRun(run.id, { state: "failed", error: failure });
    throw failure;
  }
}

function summarize(input: {
  niche: NicheDto;
  runId: string;
  startedAt: number;
  deps: TrendDeps;
  rounds: NicheRoundSummary[];
  stopReason: string;
  passes: TrendPassSummary[];
  skipped: string[];
  notes: string[];
  groups: GroupSummary;
  youtubeDated: number;
  target: number;
}): NicheInitSummary {
  const members = loadNicheMembers({ nicheId: input.niche.id });
  const byStatus: Record<string, number> = {};
  const byLanguage: Record<string, { kept: number; dropped: number; undetermined: number }> = {};
  const keptByPlatformBand: Record<string, Record<string, number>> = {};
  for (const member of members) {
    byStatus[member.status] = (byStatus[member.status] ?? 0) + 1;
    if (member.status !== "candidate") {
      const language = member.language ?? "unknown";
      const row = byLanguage[language] ?? (byLanguage[language] = { kept: 0, dropped: 0, undetermined: 0 });
      row[member.status] += 1;
    }
    if (member.status === "kept") {
      const platform = keptByPlatformBand[member.platform] ?? (keptByPlatformBand[member.platform] = {});
      const band = quotaBandFor(member.followers) ?? "unknown";
      platform[band] = (platform[band] ?? 0) + 1;
    }
  }
  const quotas: NicheInitSummary["quotas"] = {};
  for (const language of input.niche.languages) {
    quotas[language] = quotaStatus(members.filter((member) => member.status === "kept" && member.language === language).map((member) => member.followers), input.target);
  }
  const keptIds = members.filter((member) => member.status === "kept").map((member) => member.creatorId);
  const videos = loadNicheVideos({ creatorIds: keptIds });
  const breakers = new Map<string, BreakerState>();
  for (const pass of input.passes) {
    const prior = breakers.get(pass.source);
    if (!prior || pass.breaker.state === "tripped") breakers.set(pass.source, pass.breaker);
  }
  return {
    nicheId: input.niche.id,
    slug: input.niche.slug,
    runId: input.runId,
    startedAt: input.startedAt,
    wallMs: input.deps.now() - input.startedAt,
    stopReason: input.stopReason,
    rounds: input.rounds,
    members: { byStatus, byLanguage, keptByPlatformBand, groups: input.groups.groups, flags: input.groups.flags },
    quotas,
    negative: input.groups.negative,
    videos: {
      listed: videos.length,
      dated: videos.filter((video) => video.postedAt !== null).length,
      scored: videos.filter((video) => video.multiplier !== null).length,
      youtubeDated: input.youtubeDated,
    },
    blocks: blocksOf(input.passes),
    breakers: [...breakers.values()].map((state) => ({ source: state.source, state: state.state, reason: state.reason })),
    passes: input.passes,
    skipped: input.skipped,
    notes: input.notes,
  };
}
