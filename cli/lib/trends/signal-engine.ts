// `ralphy trends signals` / `trends precision` (#577) — read the niche's
// corpus rows, run the pure detectors in `signals.ts`, widen the reference
// set adaptively, build within-creator contrast sets, assign attention
// tiers, and turn references into prediction-ledger picks. Read-only except
// for the ledger revision written on `--record`.
//
// Personal data: public handles, public video URLs, and public metrics only.
// Titles appear truncated in contrast sets (the agent reads them to write the
// hypothesis); bios and full captions are not reproduced.

import { followerSeries, loadNicheMembers, loadNicheVideos, type NicheDto, type NicheMemberDto, type NicheVideoDto } from "../store/trend-niches.js";
import { latestDigestLinks } from "../store/trends.js";
import { appendPredictionLedgerRevision, creatorAttentionFacts, listPredictionLedgerDocuments, loadViewSnapshots, readPredictionLedgerDocument } from "../store/trend-signals.js";
import { listUnitOutcomeFacts, type UnitOutcomeFactsDto } from "../store/outcomes.js";
import type { QueryContext } from "../store/scope-context.js";
import { recordManualDecisions } from "../analytics/ledger.js";
import { DomainError } from "../errors/domain.js";
import { resolveUnitReference, unitContext } from "../unit-revision.js";
import { DAY_MS, HOUR_MS, median, type TrendPlatform } from "./math.js";
import { YOUTUBE_WATCH_SOURCE } from "./sources/youtube.js";
import {
  isSponsored,
  ATTENTION_TIERS,
  DEFAULT_SIGNAL_OPTIONS,
  DEFAULT_TIER_RULES,
  PREDICTION_LEDGER_BODY_KIND,
  PREDICTION_SPREAD_DAYS,
  SIGNAL_TYPES,
  attentionTier,
  decidePick,
  detectBreakouts,
  detectDemandSignals,
  detectEarlyMomentum,
  detectEmergingFormats,
  detectNearMisses,
  detectSmallAccountBreakouts,
  isJudgeable,
  judgeProducedPick,
  mergePicks,
  parsePredictionLedger,
  precisionReport,
  scaleUpEstimate,
  widenReferences,
  type OwnBaseline,
  type PickClassification,
  type PickDecisionInput,
  type PredictionLedgerBody,
  type PredictionPick,
  type SignalOptions,
  type SignalType,
  type SignalVideo,
  type TrendSignal,
  type WideningLevel,
  type WideningStep,
} from "./signals.js";

export const SIGNAL_MIN_N = 3; // the #558 minimum-n rule
export const DEFAULT_K = 20;

export interface SignalEngineOptions {
  language?: string;
  platform?: TrendPlatform;
  subNiche?: string;
  /** Listing and base widening window. */
  sinceDays: number;
  /** Window used by the `extend-window` widening step. */
  widenSinceDays: number;
  k: number;
  types?: SignalType[];
  /** Rows per signal type in the listing. */
  limit: number;
  /** Contrast sets for the top N transferable candidates (0 = off). */
  contrast: number;
  noiseFloorViews?: number;
  signal?: Partial<SignalOptions>;
}

export const DEFAULT_SIGNAL_ENGINE_OPTIONS: SignalEngineOptions = { sinceDays: 30, widenSinceDays: 90, k: DEFAULT_K, limit: 20, contrast: 0 };

type EngineVideo = SignalVideo & {
  member: NicheMemberDto;
  url: string;
  title: string | null;
  durationMs: number | null;
  hashtags: string[];
};

const round = (value: number | null, digits = 2): number | null => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
const normalizeHandle = (handle: string | null, fallback: string) => (handle ?? fallback).replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TYPE_PRIORITY: Record<string, number> = { "small-account-breakout": 0, "early-momentum": 1, breakout: 2, "near-miss": 3 };

function followersAt(series: Array<{ asOf: number; followers: number }>, at: number | null, fallback: number | null): number | null {
  if (at === null || series.length === 0) return fallback;
  let best: { distance: number; followers: number } | null = null;
  for (const point of series) {
    const distance = Math.abs(point.asOf - at);
    if (!best || distance < best.distance) best = { distance, followers: point.followers };
  }
  return best?.followers ?? fallback;
}

function engagementOf(video: NicheVideoDto): SignalVideo["engagement"] {
  const value = video.detail?.engagement;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SignalVideo["engagement"]) : null;
}

/** Own baseline from #558: median views of the newest snapshot per Unit on the platform (last 20). */
export function ownBaselineFor(input: { workspaceId: string; platform: string; followers: number | null; minN?: number }): OwnBaseline {
  const minN = input.minN ?? SIGNAL_MIN_N;
  let views: Array<{ at: number; views: number }> = [];
  try {
    views = listUnitOutcomeFacts({ context: { workspaceId: input.workspaceId } }).flatMap((unit) =>
      unit.observations
        .filter((observation) => observation.platform === input.platform && typeof observation.snapshot.views === "number")
        .map((observation) => ({ at: observation.publishedAt ?? observation.snapshot.asOf, views: observation.snapshot.views! })),
    );
  } catch {
    views = [];
  }
  const recent = views.sort((a, b) => b.at - a.at).slice(0, 20);
  return { platform: input.platform, n: recent.length, medianViews: recent.length >= minN ? median(recent.map((entry) => entry.views)) : null, followers: input.followers, minN };
}

function ledgerSlug(niche: NicheDto, options: Pick<SignalEngineOptions, "language" | "platform">): string {
  return `${niche.slug}${options.language ? `-${options.language}` : ""}${options.platform ? `-${options.platform}` : ""}`;
}

export function readLedger(niche: NicheDto, options: Pick<SignalEngineOptions, "language" | "platform">) {
  const document = readPredictionLedgerDocument({ workspaceId: niche.workspaceId, slug: ledgerSlug(niche, options) });
  return { document, body: document ? parsePredictionLedger(document.body) : null };
}

/** Load the niche's in-sample kept creators (main + negative groups) and their videos as detector rows. */
function loadEngineVideos(niche: NicheDto, now: number, windowDays: number) {
  const members = loadNicheMembers({ nicheId: niche.id }).filter((member) => member.status === "kept" && !member.flags.includes("out-of-sample") && member.cohortGroup !== "anomaly");
  const memberById = new Map(members.map((member) => [member.creatorId, member]));
  const series = followerSeries({ creatorIds: members.map((member) => member.creatorId) });
  const rows = loadNicheVideos({ creatorIds: members.map((member) => member.creatorId) });
  const windowStart = now - windowDays * DAY_MS;
  const snapshotIds = rows.filter((video) => video.postedAt !== null && video.postedAt >= windowStart).map((video) => video.id);
  const snapshots = loadViewSnapshots({ videoIds: snapshotIds });
  const videos: EngineVideo[] = rows.map((video) => {
    const member = memberById.get(video.creatorId)!;
    return {
      videoId: video.id,
      creatorId: video.creatorId,
      creatorKey: normalizeHandle(member.handle, member.platformCreatorId),
      platform: video.platform,
      postedAt: video.postedAt,
      ageHours: video.postedAt === null || video.latestAsOf === null ? null : (video.latestAsOf - video.postedAt) / HOUR_MS,
      views: video.views,
      multiplier: video.multiplier,
      z: video.z,
      label: video.label,
      flags: isSponsored({ title: video.title, hashtags: video.hashtags }) ? [...video.flags, "sponsored"] : video.flags,
      engagement: engagementOf(video),
      followers: followersAt(series.get(video.creatorId) ?? [], video.latestAsOf, member.followers),
      sizeBand: member.sizeBand,
      format: video.format,
      hook: video.hook,
      snapshots: snapshots.get(video.id) ?? [],
      member,
      url: video.url,
      title: video.title,
      durationMs: video.durationMs,
      hashtags: video.hashtags,
    };
  });
  return { members, videos };
}

function videoMeta(video: EngineVideo, now: number) {
  const posted = video.postedAt === null ? null : new Date(video.postedAt);
  return {
    url: video.url,
    postedAt: iso(video.postedAt),
    ageDays: video.postedAt === null ? null : round((now - video.postedAt) / DAY_MS, 1),
    postingHourUtc: posted ? posted.getUTCHours() : null,
    weekdayUtc: posted ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][posted.getUTCDay()]! : null,
    durationSec: video.durationMs === null ? null : round(video.durationMs / 1000, 0),
    views: video.views,
    multiplier: round(video.multiplier),
    label: video.label,
    format: video.format,
    hook: video.hook,
    titleChars: video.title === null ? null : Array.from(video.title).length,
    title: video.title === null ? null : Array.from(video.title).slice(0, 90).join(""),
    hashtags: video.hashtags.length,
    videoId: video.videoId,
  };
}

/** Three same-creator videos nearest the creator's median (|ln X| small), preferring ones close in time. */
export function pickControls<T extends SignalVideo>(signal: T, creatorVideos: readonly T[], count = 3): T[] {
  return creatorVideos
    .filter((video) => video.videoId !== signal.videoId && isJudgeable(video) && video.multiplier! > 0)
    .map((video) => ({
      video,
      cost: Math.abs(Math.log(video.multiplier!)) + (signal.postedAt !== null && video.postedAt !== null ? (0.01 * Math.abs(signal.postedAt - video.postedAt)) / DAY_MS : 0.5),
    }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, count)
    .map((entry) => entry.video);
}

export function buildNicheSignals(input: { niche: NicheDto; now: number; options?: Partial<SignalEngineOptions>; ownFollowers?: number | null; ownWorkspaceId?: string }) {
  const options: SignalEngineOptions = { ...DEFAULT_SIGNAL_ENGINE_OPTIONS, ...(input.options ?? {}) };
  const signalOptions: SignalOptions = { ...DEFAULT_SIGNAL_OPTIONS, ...(options.signal ?? {}) };
  const { niche, now } = input;
  const noiseFloor = options.noiseFloorViews ?? niche.settings.noiseFloorViews;
  const widestDays = Math.max(options.sinceDays, options.widenSinceDays);
  const { members, videos } = loadEngineVideos(niche, now, widestDays);
  const byId = new Map(videos.map((video) => [video.videoId, video]));

  const inLanguage = (video: EngineVideo, language = options.language) => !language || video.member.language === language;
  const inPlatform = (video: EngineVideo, platform = options.platform) => !platform || video.platform === platform;
  const inSub = (video: EngineVideo, sub = options.subNiche) => !sub || (video.member.subNiche ?? "general") === sub;
  const inWindow = (video: EngineVideo, days: number) => video.postedAt !== null && video.postedAt >= now - days * DAY_MS;
  const scoped = (video: EngineVideo) => inLanguage(video) && inPlatform(video) && inSub(video);

  // Detectors run once over the widest window; scopes filter the results.
  const pool = videos.filter((video) => inWindow(video, widestDays));
  const early = detectEarlyMomentum(pool, signalOptions);
  const videoSignals: TrendSignal[] = [
    ...detectSmallAccountBreakouts(pool, signalOptions),
    ...early.signals,
    ...detectBreakouts(pool),
    ...detectNearMisses(pool, signalOptions),
  ];
  const emerging = detectEmergingFormats(pool.filter((video) => scoped(video) && inWindow(video, options.sinceDays)), now, signalOptions);
  const demand = detectDemandSignals(null);
  const ledger = readLedger(niche, options);
  const ledgerByVideo = new Map((ledger.body?.picks ?? []).filter((pick) => pick.videoId).map((pick) => [pick.videoId!, pick]));

  const videoOf = (signal: TrendSignal) => (signal.videoId ? byId.get(signal.videoId) ?? null : null);
  const listed = videoSignals.filter((signal) => {
    const video = videoOf(signal);
    return video !== null && scoped(video) && inWindow(video, options.sinceDays);
  });

  // Counts per type (scope + listing window).
  const counts: Record<string, number> = Object.fromEntries(SIGNAL_TYPES.map((type) => [type, 0]));
  for (const signal of listed) counts[signal.type] = (counts[signal.type] ?? 0) + 1;
  counts["emerging-format"] = emerging.length;
  const nearMissCauses: Record<string, number> = { "packaging-weak": 0, "content-weak": 0, unclear: 0 };
  for (const signal of listed) if (signal.type === "near-miss" && signal.cause) nearMissCauses[signal.cause] = (nearMissCauses[signal.cause] ?? 0) + 1;

  // Adaptive widening of the reference set.
  const strongTypes = new Set<SignalType>(["small-account-breakout", "early-momentum", "breakout"]);
  const references = (filter: (video: EngineVideo) => boolean, types: Set<SignalType>) => {
    const bestByVideo = new Map<string, TrendSignal>();
    for (const signal of videoSignals) {
      if (!types.has(signal.type)) continue;
      const video = videoOf(signal);
      if (!video || !filter(video) || (video.views ?? 0) < noiseFloor) continue;
      const current = bestByVideo.get(video.videoId);
      if (!current || (TYPE_PRIORITY[signal.type] ?? 9) < (TYPE_PRIORITY[current.type] ?? 9)) bestByVideo.set(video.videoId, signal);
    }
    return [...bestByVideo.values()].sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9) || b.strength - a.strength || a.key.localeCompare(b.key));
  };
  const withNearMiss = new Set<SignalType>([...strongTypes, "near-miss"]);
  const otherLanguages = niche.languages.filter((language) => language !== options.language);
  const levels: Array<WideningLevel<TrendSignal>> = [
    { step: "base", items: references((video) => scoped(video) && inWindow(video, options.sinceDays), strongTypes), note: `breakout, small-account breakout, early momentum; last ${options.sinceDays} days; views >= ${noiseFloor}` },
    { step: "near-miss-threshold", items: references((video) => scoped(video) && inWindow(video, options.sinceDays), withNearMiss), note: `threshold lowered to near-miss (${signalOptions.nearMissBand.join("-")}x or a high engagement lift)` },
    widestDays > options.sinceDays
      ? { step: "extend-window", items: references((video) => scoped(video) && inWindow(video, widestDays), withNearMiss), note: `window extended to ${widestDays} days` }
      : { step: "extend-window", items: null, note: `window already ${widestDays} days` },
    options.subNiche
      ? { step: "adjacent-sub-niches", items: references((video) => inLanguage(video) && inPlatform(video) && inWindow(video, widestDays), withNearMiss), note: `all sub-niches of ${niche.slug}` }
      : { step: "adjacent-sub-niches", items: null, note: "whole niche already in scope (no --sub-niche)" },
    options.language && otherLanguages.length > 0
      ? { step: "other-languages", items: references((video) => inPlatform(video) && inWindow(video, widestDays), withNearMiss), note: `adds ${otherLanguages.join(", ")}` }
      : { step: "other-languages", items: null, note: options.language ? "the niche has no other language" : "all languages already in scope" },
    options.platform
      ? { step: "other-platforms", items: references((video) => inWindow(video, widestDays), withNearMiss), note: "all platforms" }
      : { step: "other-platforms", items: null, note: "all platforms already in scope (only TikTok videos are dated and scored without the YouTube Data API key)" },
  ];
  const widened = widenReferences(levels, (signal) => signal.videoId ?? signal.key, options.k);
  // Keyed by video: a video's step applies to every signal type it carries.
  const stepOf = new Map(widened.items.map((entry) => [entry.item.videoId ?? entry.item.key, entry.wideningStep]));

  const own = ownBaselineFor({ workspaceId: input.ownWorkspaceId ?? niche.workspaceId, platform: options.platform ?? "tiktok", followers: input.ownFollowers ?? null });

  const render = (signal: TrendSignal) => {
    const video = videoOf(signal);
    const recorded = signal.videoId ? ledgerByVideo.get(signal.videoId) : undefined;
    return {
      type: signal.type,
      label: signal.label,
      cause: signal.cause,
      creator: video ? video.member.handle ?? video.member.platformCreatorId : null,
      platform: video?.platform ?? null,
      url: video?.url ?? null,
      strength: signal.strength,
      evidence: signal.evidence,
      improvement: signal.improvement,
      why: recorded?.why ?? null,
      transferable: recorded ? (recorded.classification === "unclassified" ? null : recorded.classification === "transferable") : null,
      pickKey: recorded?.pickId ?? null,
      decision: recorded?.decision ?? null,
      transferCandidate: signal.transferCandidate,
      wideningStep: stepOf.get(signal.videoId ?? signal.key) ?? null,
      scaleUp: signal.transferCandidate && video ? scaleUpEstimate({ views: video.views, followers: video.followers, multiplier: video.multiplier, own: { ...own, platform: video.platform } }) : null,
      videoId: signal.videoId,
    };
  };
  const wanted = (type: SignalType) => !options.types || options.types.includes(type);
  const listing = SIGNAL_TYPES.filter(wanted).flatMap((type): Array<Record<string, unknown>> => {
    if (type === "emerging-format") {
      return emerging.slice(0, options.limit).map((signal) => ({
        type: signal.type,
        label: signal.label,
        cause: null,
        creators: signal.creatorIds.map((id) => byId.get(signal.videoIds.find((videoId) => byId.get(videoId)?.creatorId === id) ?? "")?.member.handle ?? id),
        strength: signal.strength,
        evidence: signal.evidence,
        urls: signal.videoIds.map((id) => byId.get(id)?.url ?? id),
        why: null,
        transferable: null,
      }));
    }
    if (type === "demand-signal") return [];
    return listed
      .filter((signal) => signal.type === type)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, options.limit)
      .map(render);
  });

  // Within-creator contrast sets.
  // Contrast candidates: walk every widening level (not only up to K) so N
  // distinct creators can be found; they become ledger picks too.
  const contrastPicked: Array<{ signal: TrendSignal; step: WideningStep }> = [];
  if (options.contrast > 0) {
    const deep = widenReferences(levels, (signal) => signal.videoId ?? signal.key, Number.POSITIVE_INFINITY);
    const seenCreators = new Set<string>();
    for (const entry of deep.items) {
      if (contrastPicked.length >= options.contrast) break;
      if (!entry.item.transferCandidate || !entry.item.creatorId || seenCreators.has(entry.item.creatorId)) continue;
      seenCreators.add(entry.item.creatorId);
      contrastPicked.push({ signal: entry.item, step: entry.wideningStep });
    }
  }
  const contrasts = contrastPicked.length > 0
    ? (() => {
        const picked = contrastPicked;
        const digests = latestDigestLinks(picked.map((entry) => entry.signal.videoId!));
        return picked.map(({ signal, step }, index) => {
          const video = videoOf(signal)!;
          const controls = pickControls(video, videos.filter((candidate) => candidate.creatorId === video.creatorId));
          const meta = videoMeta(video, now);
          const controlMeta = controls.map((control) => videoMeta(control, now));
          const medianOf = (values: Array<number | null>) => median(values.filter((value): value is number => value !== null));
          const recorded = ledgerByVideo.get(video.videoId);
          const digest = digests.get(video.videoId);
          return {
            rank: index + 1,
            type: signal.type,
            label: signal.label,
            wideningStep: step,
            creator: video.member.handle ?? video.member.platformCreatorId,
            sizeBand: video.sizeBand,
            followers: video.followers,
            subNiche: video.member.subNiche,
            signal: meta,
            controls: controlMeta,
            deltas: {
              durationSec: meta.durationSec === null ? null : round(meta.durationSec - (medianOf(controlMeta.map((row) => row.durationSec)) ?? meta.durationSec), 0),
              titleChars: meta.titleChars === null ? null : round(meta.titleChars - (medianOf(controlMeta.map((row) => row.titleChars)) ?? meta.titleChars), 0),
              postingHourUtc: { signal: meta.postingHourUtc, controls: controlMeta.map((row) => row.postingHourUtc) },
              hashtags: meta.hashtags - (medianOf(controlMeta.map((row) => row.hashtags)) ?? meta.hashtags),
              sameHook: controlMeta.filter((row) => row.hook !== null && row.hook === meta.hook).length,
              sameFormat: controlMeta.filter((row) => row.format !== null && row.format === meta.format).length,
              controlMedianMultiplier: round(medianOf(controlMeta.map((row) => row.multiplier))),
            },
            digest: digest ? `${digest.refKind}:${digest.digestRef}` : null,
            why: recorded?.why ?? null,
            classification: recorded?.classification ?? "unclassified",
          };
        });
      })()
    : [];

  // Attention tiers of the niche's creators in scope.
  const scopedMembers = members.filter((member) => (!options.language || member.language === options.language) && (!options.platform || member.platform === options.platform) && (!options.subNiche || (member.subNiche ?? "general") === options.subNiche));
  const hotByEarly = new Set(early.signals.map((signal) => signal.creatorId));
  const tierFacts = creatorAttentionFacts({ workspaceId: niche.workspaceId, now, signalFloor: signalOptions.nearMissBand[0], hotMaxAgeHours: DEFAULT_TIER_RULES.hotMaxAgeHours, creatorIds: scopedMembers.map((member) => member.creatorId), ignoreDateSources: [YOUTUBE_WATCH_SOURCE] });
  const tierCounts: Record<string, Record<string, number>> = {};
  const tierReasons: Record<string, number> = {};
  for (const facts of tierFacts) {
    const tier = attentionTier({ ...facts, hotVideo: facts.hotVideo || hotByEarly.has(facts.creatorId) }, now);
    const row = tierCounts[facts.platform] ?? (tierCounts[facts.platform] = Object.fromEntries(ATTENTION_TIERS.map((name) => [name, 0])));
    row[tier.tier] = (row[tier.tier] ?? 0) + 1;
    const reasonKey = `${tier.tier}: ${tier.reason.replace(/\d+/g, "N")}`;
    tierReasons[reasonKey] = (tierReasons[reasonKey] ?? 0) + 1;
  }

  // Ledger picks: the widened references plus emerging formats.
  const unrelatedHitCreators = (axis: "format" | "hook", value: string) =>
    new Set(pool.filter((video) => scoped(video) && isJudgeable(video) && video[axis] === value && video.multiplier! >= signalOptions.emerging.minMultiplier).map((video) => video.creatorKey)).size;
  const picks: PredictionPick[] = [
    ...[...widened.items, ...contrastPicked.filter((entry) => !stepOf.has(entry.signal.videoId ?? entry.signal.key)).map((entry) => ({ item: entry.signal, wideningStep: entry.step }))].map(({ item, wideningStep }) => {
      const video = videoOf(item)!;
      const axis: "format" | "hook" | null = video.format && video.format !== "unknown" ? "format" : video.hook && video.hook !== "unknown" ? "hook" : null;
      const value = axis ? video[axis]! : null;
      return {
        pickId: item.key,
        signalType: item.type,
        cause: item.cause,
        wideningStep,
        videoId: video.videoId,
        url: video.url,
        creator: video.member.handle ?? video.member.platformCreatorId,
        platform: video.platform,
        detectedAt: new Date(now).toISOString(),
        evidence: { multiplier: round(video.multiplier), views: video.views, followers: video.followers, format: video.format, hook: video.hook, creators: null },
        predicted: {
          own: scaleUpEstimate({ views: video.views, followers: video.followers, multiplier: video.multiplier, own: { ...own, platform: video.platform } }),
          spread: axis && value ? { axis, value, creatorsAtPick: unrelatedHitCreators(axis, value), withinDays: PREDICTION_SPREAD_DAYS } : null,
        },
        why: null,
        classification: "unclassified" as PickClassification,
        decision: "pending" as const,
        outcome: null,
      };
    }),
    ...emerging.map((signal) => ({
      pickId: signal.key,
      signalType: signal.type,
      cause: null,
      wideningStep: null,
      videoId: null,
      url: null,
      creator: null,
      platform: null,
      detectedAt: new Date(now).toISOString(),
      evidence: { multiplier: null, views: null, followers: null, format: signal.evidence.axis === "format" ? String(signal.evidence.value) : null, hook: signal.evidence.axis === "hook" ? String(signal.evidence.value) : null, creators: signal.strength },
      predicted: {
        own: null,
        spread: { axis: signal.evidence.axis as "format" | "hook", value: String(signal.evidence.value), creatorsAtPick: signal.strength, withinDays: PREDICTION_SPREAD_DAYS },
      },
      why: null,
      classification: "unclassified" as PickClassification,
      decision: "pending" as const,
      outcome: null,
    })),
  ];

  const scopeVideos = videos.filter(scoped);
  const scopeWindow = scopeVideos.filter((video) => inWindow(video, options.sinceDays));
  const notes = [
    "Multipliers, engagement lifts, and bands are Ralphy's own estimates from creator-relative baselines, not platform data.",
    `early-momentum needs 2+ dated snapshots per video: ${early.withTwoSnapshots} video(s) in the ${widestDays}-day pool have them; most corpus videos have one snapshot until refreshes accrue`,
    `demand-signal: ${demand.status} (${demand.reason})`,
    "near-miss 'momentum that stalled' needs 2+ snapshots per video and is not evaluated yet",
    ...(own.medianViews === null && !own.followers ? [`scale-up: no own baseline yet (#558 has ${own.n} own outcome(s) on ${own.platform}; ${own.minN} needed)`] : []),
    ...(widened.reachedK ? [] : [`only ${widened.items.length} qualifying reference(s) after every widening step (K=${options.k})`]),
  ];
  return {
    kind: "trend-signals",
    niche: niche.slug,
    scope: { language: options.language ?? null, platform: options.platform ?? null, subNiche: options.subNiche ?? null, sinceDays: options.sinceDays, widenSinceDays: options.widenSinceDays, types: options.types ?? null },
    coverage: {
      creators: scopedMembers.length,
      videos: scopeVideos.length,
      datedInWindow: scopeWindow.length,
      judgeableInWindow: scopeWindow.filter(isJudgeable).length,
      withTwoSnapshots: early.withTwoSnapshots,
    },
    counts: { ...counts, nearMissCauses },
    widening: { k: options.k, qualifying: widened.items.length, reachedK: widened.reachedK, noiseFloorViews: noiseFloor, steps: widened.steps },
    tiers: { rules: DEFAULT_TIER_RULES, byPlatform: tierCounts, reasons: tierReasons },
    ownBaseline: own,
    signals: listing,
    contrasts,
    demand: { status: demand.status, reason: demand.reason },
    ledger: { slug: ledgerSlug(niche, options), revisions: ledger.document?.revisions ?? 0, picks: ledger.body?.picks.length ?? 0 },
    notes,
    /** Picks the caller may record (not printed). */
    _picks: picks,
  };
}

export type HypothesisInput = { videoId?: string; url?: string; why: string; classification: PickClassification };

/** Append a ledger revision with new picks and any agent-authored hypotheses. */
export function recordPicks(input: { niche: NicheDto; options: Pick<SignalEngineOptions, "language" | "platform">; picks: PredictionPick[]; hypotheses?: HypothesisInput[]; now: number }) {
  const current = readLedger(input.niche, input.options);
  const byUrl = new Map(input.picks.filter((pick) => pick.url).map((pick) => [pick.url!, pick.videoId]));
  const existingByUrl = new Map((current.body?.picks ?? []).filter((pick) => pick.url).map((pick) => [pick.url!, pick.videoId]));
  const hypotheses = new Map<string, HypothesisInput>();
  for (const entry of input.hypotheses ?? []) {
    const id = entry.videoId ?? (entry.url ? byUrl.get(entry.url) ?? existingByUrl.get(entry.url) : undefined);
    if (id) hypotheses.set(id, entry);
  }
  const incoming = input.picks.map((pick) => {
    const hypothesis = pick.videoId ? hypotheses.get(pick.videoId) : undefined;
    return hypothesis ? { ...pick, why: hypothesis.why, classification: hypothesis.classification } : pick;
  });
  // Hypotheses for picks recorded earlier (not in this run's references) still land.
  const carried = (current.body?.picks ?? []).flatMap((pick) => {
    const hypothesis = pick.videoId ? hypotheses.get(pick.videoId) : undefined;
    return hypothesis && !incoming.some((entry) => entry.pickId === pick.pickId) ? [{ ...pick, why: hypothesis.why, classification: hypothesis.classification }] : [];
  });
  const merged = mergePicks(current.body?.picks ?? [], [...incoming, ...carried]);
  const unmatched = (input.hypotheses ?? []).filter((entry) => !(entry.videoId ?? (entry.url ? byUrl.get(entry.url) ?? existingByUrl.get(entry.url) : undefined))).length;
  if (current.body && merged.added === 0 && merged.updated === 0) {
    return { written: false, documentId: current.document!.documentId, revisionId: current.document!.revisionId, added: 0, updated: 0, picks: merged.picks.length, unmatchedHypotheses: unmatched };
  }
  const body: PredictionLedgerBody = {
    kind: PREDICTION_LEDGER_BODY_KIND,
    version: 1,
    niche: input.niche.slug,
    scope: { language: input.options.language ?? null, platform: input.options.platform ?? null },
    picks: merged.picks,
    updatedAt: new Date(input.now).toISOString(),
  };
  const slug = ledgerSlug(input.niche, input.options);
  const saved = appendPredictionLedgerRevision({ workspaceId: input.niche.workspaceId, slug, title: `Trend prediction ledger: ${slug}`, body });
  return { written: true, ...saved, added: merged.added, updated: merged.updated, picks: merged.picks.length, unmatchedHypotheses: unmatched };
}

// ─── Pick decisions (`trends pick link | skip`) ─────────────────────────────

export interface PickScope {
  /** Niche slug; omitted = every ledger of the Workspace. */
  niche?: string;
  language?: string;
  platform?: TrendPlatform;
}

/** The Workspace's prediction ledgers that hold `pickId`, narrowed by niche / language / platform. */
export function findPickLedger(input: { workspaceId: string; pickId: string; scope: PickScope }) {
  const ledgers = listPredictionLedgerDocuments({ workspaceId: input.workspaceId })
    .map((document) => ({ document, body: parsePredictionLedger(document.body) }))
    .filter((entry): entry is { document: typeof entry.document; body: PredictionLedgerBody } => entry.body !== null)
    .filter(({ body }) =>
      (!input.scope.niche || body.niche === input.scope.niche) &&
      (input.scope.language === undefined || body.scope.language === input.scope.language) &&
      (input.scope.platform === undefined || body.scope.platform === input.scope.platform));
  const matches = ledgers.filter(({ body }) => body.picks.some((pick) => pick.pickId === input.pickId));
  const scopeText = [input.scope.niche ? `niche ${input.scope.niche}` : null, input.scope.language ? `language ${input.scope.language}` : null, input.scope.platform ? `platform ${input.scope.platform}` : null].filter(Boolean).join(", ");
  if (matches.length === 0) {
    const id = input.pickId.includes(":") ? input.pickId.slice(input.pickId.lastIndexOf(":") + 1) : input.pickId;
    const near = ledgers.flatMap(({ body }) => body.picks.filter((pick) => pick.pickId.endsWith(`:${id}`) || pick.videoId === id).map((pick) => pick.pickId)).slice(0, 5);
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "pick-key",
      detail: `no pick "${input.pickId}" in ${ledgers.length} prediction ledger(s)${scopeText ? ` (${scopeText})` : ""}${near.length > 0 ? `; did you mean ${near.join(", ")}?` : "; pick keys are the pickKey of each signal after trends signals --record"}`,
      verb: "trends pick",
    });
  }
  if (matches.length > 1) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "pick-key",
      detail: `"${input.pickId}" is in ${matches.length} ledgers (${matches.map(({ document }) => document.slug).join(", ")}); pass --niche / --lang / --platform`,
      verb: "trends pick",
    });
  }
  return matches[0]!;
}

function writeDecision(input: { workspaceId: string; ledger: ReturnType<typeof findPickLedger>; decision: PickDecisionInput; now: number }) {
  const { ledger } = input;
  const result = decidePick(ledger.body.picks, input.decision);
  if (!result.ok) throw new DomainError("E_INPUT_INVALID", undefined, { field: "pick-key", detail: result.detail, verb: "trends pick" });
  if (!result.changed) {
    return { written: false, ledger: { slug: ledger.document.slug, documentId: ledger.document.documentId, revisionId: ledger.document.revisionId, revisions: ledger.document.revisions }, pick: result.pick };
  }
  const body: PredictionLedgerBody = { ...ledger.body, picks: result.picks, updatedAt: new Date(input.now).toISOString() };
  const saved = appendPredictionLedgerRevision({ workspaceId: input.workspaceId, slug: ledger.document.slug, title: `Trend prediction ledger: ${ledger.document.slug}`, body });
  return { written: true, ledger: { slug: ledger.document.slug, documentId: saved.documentId, revisionId: saved.revisionId, revisions: ledger.document.revisions + 1 }, pick: result.pick };
}

const pickView = (pick: PredictionPick) => ({
  pickId: pick.pickId,
  signalType: pick.signalType,
  decision: pick.decision,
  unit: pick.unit ?? null,
  skip: pick.skip ?? null,
  url: pick.url,
  creator: pick.creator,
  platform: pick.platform,
  detectedAt: pick.detectedAt,
  predicted: pick.predicted.own
    ? { status: pick.predicted.own.status, low: pick.predicted.own.low, high: pick.predicted.own.high, relativeToOwnMedian: pick.predicted.own.relativeToOwnMedian }
    : null,
});

/**
 * `trends pick link <key> --unit <unit>`: mark the pick `produced` with the
 * Unit reference (one ledger revision), and record `reference_pick` /
 * `reference_signal` in the Unit's #558 decision ledger so outcome reports
 * group by reference type. The Unit may live in another Workspace (the own
 * account) than the corpus.
 */
export function linkPickToUnit(input: {
  workspaceId: string;
  pickId: string;
  scope: PickScope;
  unitRef: string;
  /** Where the Unit is resolved (default: the corpus Workspace). */
  unitContext?: QueryContext;
  now: number;
  authoredBySessionId?: string;
}) {
  const ledger = findPickLedger({ workspaceId: input.workspaceId, pickId: input.pickId, scope: input.scope });
  const context = input.unitContext ?? { workspaceId: input.workspaceId };
  const location = resolveUnitReference(context, input.unitRef);
  const pick = ledger.body.picks.find((entry) => entry.pickId === input.pickId)!;
  const unit = { unitId: location.unitId, slug: location.slug, workspaceId: location.workspaceId, projectId: location.projectId, linkedAt: new Date(input.now).toISOString() };
  const decision = writeDecision({ workspaceId: input.workspaceId, ledger, decision: { pickId: input.pickId, decision: "produced", unit }, now: input.now });
  const decisions = recordManualDecisions({
    context: unitContext(context, location),
    location,
    assignments: [`reference_pick=${pick.pickId}`, `reference_signal=${pick.signalType}`],
    ...(input.authoredBySessionId ? { authoredBySessionId: input.authoredBySessionId } : {}),
    now: new Date(input.now),
  });
  return {
    kind: "trend-pick-link",
    written: decision.written,
    ledger: decision.ledger,
    pick: pickView(decision.pick),
    unitDecisions: {
      unit: { id: location.unitId, slug: location.slug, projectId: location.projectId },
      written: decisions.written,
      documentId: decisions.documentId,
      revisionId: decisions.revisionId,
      reference_pick: decisions.manual.reference_pick ?? null,
      reference_signal: decisions.manual.reference_signal ?? null,
    },
    next: "ralphy trends precision --niche <n> joins this pick to the Unit's #558 outcomes once metrics are imported (ralphy analytics import)",
  };
}

/** `trends pick skip <key> --reason <text>`: mark the pick `skipped`; precision checks it by whether the signal kept spreading. */
export function skipPick(input: { workspaceId: string; pickId: string; scope: PickScope; reason: string; now: number }) {
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!reason) throw new DomainError("E_INPUT_INVALID", undefined, { field: "reason", detail: "a skip needs a reason", verb: "trends pick skip" });
  if (Array.from(reason).length > 500) throw new DomainError("E_INPUT_INVALID", undefined, { field: "reason", detail: "at most 500 characters", verb: "trends pick skip" });
  const ledger = findPickLedger({ workspaceId: input.workspaceId, pickId: input.pickId, scope: input.scope });
  const decision = writeDecision({ workspaceId: input.workspaceId, ledger, decision: { pickId: input.pickId, decision: "skipped", reason, at: new Date(input.now).toISOString() }, now: input.now });
  return {
    kind: "trend-pick-skip",
    written: decision.written,
    ledger: decision.ledger,
    pick: pickView(decision.pick),
    spreadCheck: decision.pick.predicted.spread
      ? { axis: decision.pick.predicted.spread.axis, value: decision.pick.predicted.spread.value, resolvesAfter: new Date(Date.parse(decision.pick.detectedAt) + decision.pick.predicted.spread.withinDays * DAY_MS).toISOString() }
      : null,
  };
}

// ─── Precision ──────────────────────────────────────────────────────────────

type OutcomeObservation = UnitOutcomeFactsDto["observations"][number];
const observedAt = (observation: OutcomeObservation) => observation.importFacts?.postedAt ?? observation.publishedAt ?? observation.snapshot.asOf;

/**
 * Join a produced pick to its Unit's #558 outcome: the newest views on the
 * pick's platform (else any platform with views), judged against the
 * predicted band. The own median for a relative band follows the #558
 * prior-window rule: our posts on that platform before this one (last 20),
 * this Unit excluded, at least `minN` of them.
 */
export function producedPickOutcome(pick: PredictionPick, units: readonly UnitOutcomeFactsDto[], now: number, minN = SIGNAL_MIN_N) {
  if (!pick.unit) return null;
  const unit = units.find((entry) => entry.unitId === pick.unit!.unitId);
  const withViews = (unit?.observations ?? []).filter((observation) => typeof observation.snapshot.views === "number");
  const observation = withViews.find((entry) => entry.platform === pick.platform) ?? withViews[0] ?? null;
  let ownMedianViews: number | null = null;
  if (observation) {
    const at = observedAt(observation);
    const prior = units
      .filter((entry) => entry.unitId !== pick.unit!.unitId)
      .flatMap((entry) => entry.observations)
      .filter((entry) => entry.platform === observation.platform && typeof entry.snapshot.views === "number" && observedAt(entry) < at)
      .sort((a, b) => observedAt(b) - observedAt(a))
      .slice(0, 20)
      .map((entry) => entry.snapshot.views!);
    ownMedianViews = prior.length >= minN ? median(prior) : null;
  }
  return judgeProducedPick({ pick, observation: observation ? { platform: observation.platform, views: observation.snapshot.views } : null, ownMedianViews, checkedAt: new Date(now).toISOString() });
}

/** `trends precision`: per-signal-type precision from the ledger; "insufficient data" below the #558 minimum n. */
export function buildPrecision(input: { niche: NicheDto; now: number; options: Pick<SignalEngineOptions, "language" | "platform">; minN: number }) {
  const ledger = readLedger(input.niche, input.options);
  let pool: EngineVideo[] | null = null;
  const unitsByWorkspace = new Map<string, UnitOutcomeFactsDto[]>();
  const unitsOf = (workspaceId: string) => {
    let units = unitsByWorkspace.get(workspaceId);
    if (!units) {
      try {
        units = listUnitOutcomeFacts({ context: { workspaceId } });
      } catch {
        units = [];
      }
      unitsByWorkspace.set(workspaceId, units);
    }
    return units;
  };
  const judged = new Map<string, ReturnType<typeof producedPickOutcome>>();
  const facts = {
    spreadCreatorsAfter(axis: "format" | "hook", value: string, since: number) {
      pool ??= loadEngineVideos(input.niche, input.now, 120).videos.filter((video) => (!input.options.language || video.member.language === input.options.language) && (!input.options.platform || video.platform === input.options.platform));
      return new Set(pool.filter((video) => isJudgeable(video) && video.postedAt !== null && video.postedAt > since && video[axis] === value && video.multiplier! >= DEFAULT_SIGNAL_OPTIONS.emerging.minMultiplier).map((video) => video.creatorKey)).size;
    },
    producedOutcome(pick: PredictionPick) {
      if (!pick.unit) return null;
      if (!judged.has(pick.pickId)) judged.set(pick.pickId, producedPickOutcome(pick, unitsOf(pick.unit.workspaceId), input.now));
      return judged.get(pick.pickId) ?? null;
    },
  };
  const report = precisionReport(ledger.body, facts, input.now, input.minN);
  const producedPicks = (ledger.body?.picks ?? []).filter((pick) => pick.decision === "produced");
  const produced = producedPicks.map((pick) => {
    const result = facts.producedOutcome(pick);
    return {
      pickId: pick.pickId,
      signalType: pick.signalType,
      unit: pick.unit ? { id: pick.unit.unitId, slug: pick.unit.slug } : null,
      status: result?.status ?? "awaiting-outcome",
      verdict: result?.status === "resolved" ? result.outcome.verdict : null,
      views: result?.status === "resolved" ? result.outcome.views : null,
      band: result?.status === "resolved" ? result.outcome.band : null,
      position: result?.status === "resolved" ? result.outcome.position : null,
      basis: result?.status === "resolved" ? result.outcome.basis : null,
      reason: result && result.status !== "resolved" ? result.reason : null,
    };
  });
  const resolvedProduced = produced.filter((row) => row.status === "resolved").length;
  const skipped = (ledger.body?.picks ?? []).filter((pick) => pick.decision === "skipped").length;
  return {
    kind: "trend-precision",
    niche: input.niche.slug,
    ledger: { slug: ledgerSlug(input.niche, input.options), revisions: ledger.document?.revisions ?? 0, picks: report.picks, produced: producedPicks.length, skipped },
    minN: report.minN,
    rows: report.rows,
    produced,
    notes: [
      "A produced pick resolves through its #558 outcome (hit = views at or above the low end of its predicted band); skipped and pending picks with a spread prediction resolve after the window (hit = one more unrelated creator broke out on the same label).",
      ...(producedPicks.length === 0 ? ["no pick is linked to a produced Unit yet (ralphy trends pick link <pick-key> --unit <unit>)"] : []),
      ...(producedPicks.length > resolvedProduced ? [`${producedPicks.length - resolvedProduced} produced pick(s) wait for #558 outcomes or an own baseline`] : []),
      ...(report.rows.every((row) => row.verdict === "insufficient data") ? [`insufficient data: fewer than ${report.minN} resolved picks per signal type`] : []),
    ],
  };
}
