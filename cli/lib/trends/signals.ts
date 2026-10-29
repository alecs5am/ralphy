// Trend signal engine (#577) — pure detectors, attention tiers, adaptive
// widening, the scale-up estimate, and the prediction-ledger math. No store
// access and no model calls: `signal-engine.ts` feeds plain rows in.
//
// Every signal carries a label and its evidence (the numbers that fired it).
// Multipliers, engagement lifts, and bands are Ralphy's own estimates from
// creator-relative baselines (#556), never platform data.

import { COPYABILITY_SIZE_WEIGHTS, SMALL_SIZE_BANDS } from "./niche.js";
import { DAY_MS, MATURITY_PRIORS, PROVISIONAL_AGE_HOURS, median, momentum, type MaturityCurve, type TrendPlatform } from "./math.js";

export const SIGNAL_TYPES = ["breakout", "small-account-breakout", "early-momentum", "near-miss", "emerging-format", "demand-signal"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export const isSignalType = (value: unknown): value is SignalType => typeof value === "string" && (SIGNAL_TYPES as readonly string[]).includes(value);

export type NearMissCause = "packaging-weak" | "content-weak" | "unclear";

/** One video as the detectors see it. */
export interface SignalVideo {
  videoId: string;
  creatorId: string;
  /** Normalized handle; creators sharing it across platforms count as one person. */
  creatorKey: string;
  platform: TrendPlatform;
  postedAt: number | null;
  /** Age at the latest snapshot. */
  ageHours: number | null;
  views: number | null;
  multiplier: number | null;
  z: number | null;
  label: string | null;
  flags: string[];
  /** q_r from the #556 score detail: ln interactions per view minus the creator window's median. */
  engagement: Partial<Record<"likes" | "comments" | "shares" | "saves", number | null>> | null;
  followers: number | null;
  sizeBand: string | null;
  format: string | null;
  hook: string | null;
  /** Dated view snapshots (age in hours), any order. */
  snapshots?: Array<{ ageHours: number; views: number }>;
}

export interface TrendSignal {
  type: SignalType;
  /** Stable key: `<type>:<videoId>` or `emerging-format:<axis>:<label>`. */
  key: string;
  label: string;
  cause: NearMissCause | null;
  videoId: string | null;
  creatorId: string | null;
  videoIds: string[];
  creatorIds: string[];
  /** Ranking strength (copyability-style for video signals, creator count for emerging formats). */
  strength: number;
  evidence: Record<string, number | string | boolean | null | string[]>;
  /** Near-miss only: the concrete improvement hypothesis. */
  improvement: string | null;
  /** Video-level signal that can feed the content plan once its cause is judged transferable. */
  transferCandidate: boolean;
}

export interface SignalOptions {
  /** Near-miss reach band [low, high): strong but not breakout. */
  nearMissBand: [number, number];
  /** |mean q| (log units) at which engagement per view reads as high / low. */
  engagementLift: number;
  /** Below the band, a video with at least this engagement lift is still a packaging-weak near-miss. */
  packagingOnlyLift: number;
  smallAccount: { minMultiplier: number; minViewsPerFollower: number; minViews: number };
  earlyMomentum: { minExcess: number; maxFirstAgeHours: number; maxLatestAgeHours: number };
  emerging: { windowDays: number; minCreators: number; minMultiplier: number; recentDays: number };
  curves: Partial<Record<TrendPlatform, MaturityCurve>>;
}

export const DEFAULT_SIGNAL_OPTIONS: Readonly<SignalOptions> = {
  nearMissBand: [2, 4],
  engagementLift: 0.3,
  packagingOnlyLift: 0.5,
  smallAccount: { minMultiplier: 10, minViewsPerFollower: 2, minViews: 10_000 },
  earlyMomentum: { minExcess: 0.5, maxFirstAgeHours: 24, maxLatestAgeHours: 7 * 24 },
  emerging: { windowDays: 14, minCreators: 2, minMultiplier: 3, recentDays: 14 },
  curves: {},
};

const round = (value: number | null, digits = 2): number | null => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

/** Paid-reach markers: a sponsored post's reach was bought, so it says nothing about the format. */
const SPONSORED_TAGS = new Set(["ad", "ads", "sponsored", "sponsor", "paidpartnership", "partner", "advertisement", "spon"]);
const SPONSORED_TEXT = /(^|[\s(\[])#(ad|ads|sponsored|paidpartnership|advertisement|spon)\b|\bpaid partnership\b/i;

export function isSponsored(input: { title?: string | null; hashtags?: readonly string[] | null; isAd?: boolean | null }): boolean {
  if (input.isAd === true) return true;
  if ((input.hashtags ?? []).some((tag) => SPONSORED_TAGS.has(tag.replace(/^#/, "").toLowerCase()))) return true;
  return input.title ? SPONSORED_TEXT.test(input.title) : false;
}

/** Scored, non-thin, past the provisional window, not sponsored: the multiplier means something. */
export const isJudgeable = (video: SignalVideo) =>
  video.multiplier !== null && !video.flags.includes("thin") && !video.flags.includes("provisional") && !video.flags.includes("sponsored") && video.ageHours !== null && video.ageHours >= PROVISIONAL_AGE_HOURS;

/** Mean q over likes / shares / saves (at least two present), the "per view" engagement lift. */
export function engagementLift(video: SignalVideo): number | null {
  const values = (["likes", "shares", "saves"] as const).map((metric) => video.engagement?.[metric]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length < 2) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const viewsPerFollower = (video: SignalVideo) => (video.views !== null && video.followers && video.followers > 0 ? video.views / video.followers : null);

/** Copyability-style strength (#576 formula without replication): size-discounted log multiplier plus reach term. */
export function signalStrength(video: SignalVideo): number {
  if (video.multiplier === null || video.multiplier <= 0) return 0;
  const weight = COPYABILITY_SIZE_WEIGHTS[(video.sizeBand ?? "unknown") as keyof typeof COPYABILITY_SIZE_WEIGHTS] ?? COPYABILITY_SIZE_WEIGHTS.unknown;
  const vpf = viewsPerFollower(video);
  const reach = vpf === null ? 0 : 0.5 * Math.log1p(Math.min(vpf, 100));
  return round(weight * (Math.log(video.multiplier) + reach), 3) ?? 0;
}

function videoSignal(type: SignalType, video: SignalVideo, label: string, evidence: TrendSignal["evidence"], extra: Partial<TrendSignal> = {}): TrendSignal {
  return {
    type,
    key: `${type}:${video.videoId}`,
    label,
    cause: null,
    videoId: video.videoId,
    creatorId: video.creatorId,
    videoIds: [video.videoId],
    creatorIds: [video.creatorId],
    strength: signalStrength(video),
    evidence: {
      multiplier: round(video.multiplier),
      views: video.views,
      followers: video.followers,
      viewsPerFollower: round(viewsPerFollower(video), 3),
      sizeBand: video.sizeBand,
      ageDays: video.ageHours === null ? null : round(video.ageHours / 24, 1),
      ...evidence,
    },
    improvement: null,
    transferCandidate: true,
    ...extra,
  };
}

// ─── Detectors ──────────────────────────────────────────────────────────────

/** `breakout`: the #556 percentile label `breakout` or `outlier` (creator-relative multiplier above the calibrated cut). */
export function detectBreakouts(videos: readonly SignalVideo[]): TrendSignal[] {
  return videos
    .filter((video) => isJudgeable(video) && (video.label === "breakout" || video.label === "outlier"))
    .map((video) => videoSignal("breakout", video, video.label === "breakout" ? "breakout" : "breakout (outlier label)", { scoreLabel: video.label, z: round(video.z) }));
}

/** `small-account-breakout`: a seed / nano / micro creator far above its own median AND its follower count. */
export function detectSmallAccountBreakouts(videos: readonly SignalVideo[], options: SignalOptions = DEFAULT_SIGNAL_OPTIONS): TrendSignal[] {
  const rule = options.smallAccount;
  return videos
    .filter((video) => {
      if (!isJudgeable(video) || !SMALL_SIZE_BANDS.has(video.sizeBand ?? "")) return false;
      const vpf = viewsPerFollower(video);
      return video.multiplier! >= rule.minMultiplier && (video.views ?? 0) >= rule.minViews && vpf !== null && vpf >= rule.minViewsPerFollower;
    })
    .map((video) => videoSignal("small-account-breakout", video, "small-account breakout", {
      rule: `size band seed/nano/micro, multiplier >= ${rule.minMultiplier}, views >= ${rule.minViews}, views per follower >= ${rule.minViewsPerFollower}`,
    }));
}

/**
 * `early-momentum`: curve-adjusted view growth between two snapshots, the
 * first taken in the h0-6 / h6-24 checkpoints, far above the creator's usual
 * growth (its median over other videos with two snapshots, else 0).
 */
export function detectEarlyMomentum(videos: readonly SignalVideo[], options: SignalOptions = DEFAULT_SIGNAL_OPTIONS): { signals: TrendSignal[]; withTwoSnapshots: number } {
  const rule = options.earlyMomentum;
  const growth = new Map<string, { g: number; first: number; latest: number; snapshots: number }>();
  for (const video of videos) {
    const series = [...(video.snapshots ?? [])].filter((point) => Number.isFinite(point.ageHours) && point.ageHours >= 0).sort((a, b) => a.ageHours - b.ageHours);
    if (series.length < 2) continue;
    const first = series[0]!;
    const later = series[series.length - 1]!;
    if (later.ageHours - first.ageHours < 1) continue;
    const curve = options.curves[video.platform] ?? MATURITY_PRIORS[video.platform];
    const g = momentum({ ageHours: Math.max(first.ageHours, 0.5), value: first.views }, { ageHours: later.ageHours, value: later.views }, curve);
    if (g === null) continue;
    growth.set(video.videoId, { g, first: first.ageHours, latest: later.ageHours, snapshots: series.length });
  }
  const byCreator = new Map<string, number[]>();
  for (const video of videos) {
    const entry = growth.get(video.videoId);
    if (entry) (byCreator.get(video.creatorId) ?? byCreator.set(video.creatorId, []).get(video.creatorId)!).push(entry.g);
  }
  const signals: TrendSignal[] = [];
  for (const video of videos) {
    const entry = growth.get(video.videoId);
    if (!entry || entry.first > rule.maxFirstAgeHours || entry.latest > rule.maxLatestAgeHours) continue;
    const others = (byCreator.get(video.creatorId) ?? []).filter((value) => value !== entry.g);
    const usual = others.length >= 3 ? median(others)! : 0;
    const excess = entry.g - usual;
    if (excess < rule.minExcess) continue;
    signals.push(videoSignal("early-momentum", video, "early momentum", {
      momentum: round(entry.g, 3),
      creatorUsualMomentum: others.length >= 3 ? round(usual, 3) : null,
      excess: round(excess, 3),
      firstSnapshotAgeHours: round(entry.first, 1),
      latestSnapshotAgeHours: round(entry.latest, 1),
      snapshots: entry.snapshots,
    }, { strength: round(excess, 3) ?? 0 }));
  }
  return { signals, withTwoSnapshots: growth.size };
}

export function nearMissImprovement(cause: NearMissCause, multiplier: number, lift: number | null): string {
  const rate = lift === null ? "an unmeasured" : `${round(Math.exp(lift), 2)}x the creator's usual`;
  if (cause === "packaging-weak") {
    return `Content strong, packaging weak: viewers who got it interacted at ${rate} rate per view (likes, shares, saves), but reach stopped at ${round(multiplier, 1)}x. Keep the body; rework the packaging (the first 1-2 s, the first frame, the on-screen hook line, the caption) and remake or repost.`;
  }
  if (cause === "content-weak") {
    return `Packaging strong, content weak: the opening won ${round(multiplier, 1)}x the creator's usual reach, but interactions per view fell to ${rate} rate. Keep the hook and first frame; fix the body (pay off the hook's promise, one concrete takeaway, a reason to save or share).`;
  }
  return `Reach ${round(multiplier, 1)}x with engagement per view in line with the creator's norm: neither ratio points at the hook or the body. Compare it with the creator's breakouts before changing either.`;
}

/**
 * `near-miss`: reach in the near-miss band (default 2-4x), or below it with a
 * high engagement lift. Cause from engagement ratios: high likes / shares /
 * saves per view = content strong, packaging weak; reach without engagement
 * = packaging strong, content weak.
 */
export function detectNearMisses(videos: readonly SignalVideo[], options: SignalOptions = DEFAULT_SIGNAL_OPTIONS): TrendSignal[] {
  const [low, high] = options.nearMissBand;
  const out: TrendSignal[] = [];
  for (const video of videos) {
    if (!isJudgeable(video) || video.label === "breakout" || video.label === "outlier") continue;
    const multiplier = video.multiplier!;
    const lift = engagementLift(video);
    let cause: NearMissCause;
    let basis: string;
    if (multiplier >= low && multiplier < high) {
      basis = `reach ${low}-${high}x`;
      cause = lift === null ? "unclear" : lift >= options.engagementLift ? "packaging-weak" : lift <= -options.engagementLift ? "content-weak" : "unclear";
    } else if (multiplier >= 1 && multiplier < low && lift !== null && lift >= options.packagingOnlyLift) {
      basis = `reach ${round(multiplier, 1)}x with engagement lift >= ${options.packagingOnlyLift}`;
      cause = "packaging-weak";
    } else {
      continue;
    }
    out.push(videoSignal("near-miss", video, `near-miss (${cause})`, {
      basis,
      engagementLift: round(lift, 3),
      engagementPerViewVsNorm: lift === null ? null : round(Math.exp(lift), 2),
    }, { cause, improvement: nearMissImprovement(cause, multiplier, lift), transferCandidate: cause === "packaging-weak" }));
  }
  return out;
}

/**
 * `emerging-format`: the same content-format or hook-type label breaking out
 * (multiplier >= 3, judgeable) for 2+ unrelated creators within a 14-day
 * window. One signal per label, on its densest window; `active` when the last
 * hit is within `recentDays` of now.
 */
export function detectEmergingFormats(videos: readonly SignalVideo[], now: number, options: SignalOptions = DEFAULT_SIGNAL_OPTIONS): TrendSignal[] {
  const rule = options.emerging;
  const judged = videos.filter((video) => isJudgeable(video) && video.postedAt !== null);
  const overallHitRate = judged.length > 0 ? judged.filter((video) => video.multiplier! >= rule.minMultiplier).length / judged.length : null;
  const out: TrendSignal[] = [];
  for (const axis of ["format", "hook"] as const) {
    const groups = new Map<string, SignalVideo[]>();
    for (const video of judged) {
      const label = video[axis];
      if (!label || label === "unknown") continue;
      (groups.get(label) ?? groups.set(label, []).get(label)!).push(video);
    }
    for (const [label, list] of groups) {
      const hits = list.filter((video) => video.multiplier! >= rule.minMultiplier).sort((a, b) => a.postedAt! - b.postedAt!);
      let best: SignalVideo[] = [];
      let bestPeople = 0;
      for (let start = 0; start < hits.length; start++) {
        const window = hits.filter((video) => video.postedAt! >= hits[start]!.postedAt! && video.postedAt! <= hits[start]!.postedAt! + rule.windowDays * DAY_MS);
        const people = new Set(window.map((video) => video.creatorKey)).size;
        if (people > bestPeople || (people === bestPeople && window.length > best.length)) {
          best = window;
          bestPeople = people;
        }
      }
      if (bestPeople < rule.minCreators) continue;
      const lastHit = best[best.length - 1]!.postedAt!;
      const labelHitRate = hits.length / list.length;
      out.push({
        type: "emerging-format",
        key: `emerging-format:${axis}:${label}`,
        label: `emerging ${axis}: ${label}`,
        cause: null,
        videoId: null,
        creatorId: null,
        videoIds: best.map((video) => video.videoId),
        creatorIds: [...new Set(best.map((video) => video.creatorId))],
        strength: bestPeople,
        evidence: {
          axis,
          value: label,
          unrelatedCreators: bestPeople,
          hitsInWindow: best.length,
          windowStart: iso(best[0]!.postedAt),
          windowEnd: iso(lastHit),
          windowDays: rule.windowDays,
          active: now - lastHit <= rule.recentDays * DAY_MS,
          labelVideos: list.length,
          labelHitRate: round(labelHitRate, 3),
          nicheHitRate: round(overallHitRate, 3),
          rule: `multiplier >= ${rule.minMultiplier} for ${rule.minCreators}+ unrelated creators within ${rule.windowDays} days`,
        },
        improvement: null,
        transferCandidate: false,
      });
    }
  }
  return out.sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key));
}

/** Comment-sample source for `demand-signal`; none is collected for the trend corpus yet. */
export interface DemandSignalSource {
  /** Analyzed comments per video id, when a free comment sample exists. */
  commentsFor(videoId: string): Array<{ text: string }> | null;
}

/**
 * `demand-signal` (stub): comments asking for more ("part 2", questions,
 * "how"). Reports "not collected" until a comment sample feeds it.
 */
export function detectDemandSignals(source: DemandSignalSource | null): { status: "not collected"; signals: TrendSignal[]; reason: string } {
  void source;
  return {
    status: "not collected",
    signals: [],
    reason: "no comment samples are stored for trend corpus videos; free paths are yt-dlp comment extraction for YouTube and logged-out TikTok comments where they load",
  };
}

// ─── Attention tiers ────────────────────────────────────────────────────────

export const ATTENTION_TIERS = ["hot", "watched", "background", "dropped"] as const;
export type AttentionTier = (typeof ATTENTION_TIERS)[number];

export interface TierRules {
  /** A creator qualifies for `watched` with a post in this many days... */
  recentDays: number;
  /** ...at least this many posts in 30 days... */
  minPosts30: number;
  /** ...and at least this many breakout or near-miss videos in the 30-day window. */
  minSignals30: number;
  /** No post for this many days: `dropped`. */
  droppedAfterDays: number;
  /** A video younger than this with rising momentum makes the creator `hot`. */
  hotMaxAgeHours: number;
}

export const DEFAULT_TIER_RULES: Readonly<TierRules> = { recentDays: 14, minPosts30: 6, minSignals30: 1, droppedAfterDays: 60, hotMaxAgeHours: 72 };

export const TIER_CADENCE: Readonly<Record<AttentionTier, string>> = { hot: "every 6 h", watched: "daily", background: "weekly / monthly", dropped: "none" };

export interface TierFacts {
  creatorId: string;
  lastPostedAt: number | null;
  /** Posts in the last 30 days (null when no video carries a post time). */
  posts30: number | null;
  /** Breakout or near-miss videos (multiplier >= the near-miss floor, non-thin) posted in the last 30 days. */
  signals30: number;
  /** A video younger than the hot age with rising momentum (or an early-momentum signal). */
  hotVideo: boolean;
  /** Excluded from refresh (gate exclusion, repeated listing failures). */
  excluded: boolean;
}

export function attentionTier(facts: TierFacts, now: number, rules: TierRules = DEFAULT_TIER_RULES): { tier: AttentionTier; cadence: string; reason: string } {
  const at = (tier: AttentionTier, reason: string, cadence = TIER_CADENCE[tier]) => ({ tier, cadence, reason });
  if (facts.excluded) return at("dropped", "excluded from refresh");
  if (facts.posts30 === null || facts.lastPostedAt === null) return at("background", "activity unknown (no post times)", "monthly");
  const idleDays = (now - facts.lastPostedAt) / DAY_MS;
  if (idleDays >= rules.droppedAfterDays) return at("dropped", `no post in ${Math.floor(idleDays)} days`);
  if (facts.hotVideo && idleDays * 24 < rules.hotMaxAgeHours) return at("hot", `a video under ${rules.hotMaxAgeHours} h with rising momentum`);
  const missing: string[] = [];
  if (idleDays > rules.recentDays) missing.push(`no post in ${rules.recentDays} days`);
  if (facts.posts30 < rules.minPosts30) missing.push(`${facts.posts30} posts in 30 days (< ${rules.minPosts30})`);
  if (facts.signals30 < rules.minSignals30) missing.push("no breakout or near-miss in 30 days");
  if (missing.length === 0) return at("watched", `posted in ${rules.recentDays} days, ${facts.posts30} posts in 30 days, ${facts.signals30} signal video(s)`);
  return at("background", missing.join("; "), idleDays > rules.recentDays ? "monthly" : "weekly");
}

// ─── Adaptive widening ──────────────────────────────────────────────────────

export const WIDENING_STEPS = ["base", "near-miss-threshold", "extend-window", "adjacent-sub-niches", "other-languages", "other-platforms"] as const;
export type WideningStep = (typeof WIDENING_STEPS)[number];

export interface WideningLevel<T> {
  step: WideningStep;
  /** Every qualifying item at this widening level (cumulative); null = the step does not apply. */
  items: readonly T[] | null;
  /** Why the step does not apply, or what it changed. */
  note: string;
}

/**
 * Walk the widening levels in order until `k` qualifying items exist. Each
 * item records the first step that produced it; steps after the target is
 * reached are recorded as not needed.
 */
export function widenReferences<T>(levels: ReadonlyArray<WideningLevel<T>>, keyOf: (item: T) => string, k: number): {
  items: Array<{ item: T; wideningStep: WideningStep }>;
  steps: Array<{ step: WideningStep; status: "applied" | "not applicable" | "not needed"; added: number; total: number; note: string }>;
  reachedK: boolean;
} {
  const seen = new Set<string>();
  const items: Array<{ item: T; wideningStep: WideningStep }> = [];
  const steps: Array<{ step: WideningStep; status: "applied" | "not applicable" | "not needed"; added: number; total: number; note: string }> = [];
  for (const level of levels) {
    if (level.step !== "base" && items.length >= k) {
      steps.push({ step: level.step, status: "not needed", added: 0, total: items.length, note: `${items.length} >= K=${k}` });
      continue;
    }
    if (level.items === null) {
      steps.push({ step: level.step, status: "not applicable", added: 0, total: items.length, note: level.note });
      continue;
    }
    let added = 0;
    for (const item of level.items) {
      const key = keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ item, wideningStep: level.step });
      added += 1;
    }
    steps.push({ step: level.step, status: "applied", added, total: items.length, note: level.note });
  }
  return { items, steps, reachedK: items.length >= k };
}

// ─── Scale-up estimate ──────────────────────────────────────────────────────

export interface OwnBaseline {
  platform: string;
  /** #558 observations behind the median (newest per Unit and platform). */
  n: number;
  medianViews: number | null;
  /** Own follower count when given (#558 stores none). */
  followers: number | null;
  minN: number;
}

export interface ScaleUpEstimate {
  status: "ok" | "no own baseline yet";
  method: "reach-per-follower" | "own-median" | null;
  low: number | null;
  high: number | null;
  /** Band relative to our own median views (stored even without a baseline, so precision can check it later). */
  relativeToOwnMedian: { low: number; high: number } | null;
  inputs: { viewsPerFollower: number | null; multiplier: number | null; ownMedianViews: number | null; ownFollowers: number | null; ownN: number };
  assumptions: string[];
}

/**
 * What a transferable idea could do on our account: the reference's reach
 * per follower (views / creator followers) applied to our own baseline.
 * With our follower count: [0.1, 0.5] x vpf x followers. Without it, the
 * creator-relative multiplier applied to our #558 median views:
 * [X^0.25, X^0.5] x median. Neither: "no own baseline yet" (the relative
 * band is still stored for later checks).
 */
export function scaleUpEstimate(input: { views: number | null; followers: number | null; multiplier: number | null; own: OwnBaseline | null }): ScaleUpEstimate {
  const vpf = input.views !== null && input.followers && input.followers > 0 ? input.views / input.followers : null;
  const multiplier = input.multiplier !== null && input.multiplier > 0 ? input.multiplier : null;
  const own = input.own;
  const ownMedian = own && own.n >= own.minN ? own.medianViews : null;
  // The reference was selected as an extreme, so expect regression to the
  // mean: a remake transfers between the fourth root and the square root of
  // the creator-relative multiplier.
  const relative = multiplier === null ? null : { low: round(Math.max(1, multiplier ** 0.25), 2)!, high: round(Math.max(1, Math.sqrt(multiplier)), 2)! };
  const inputs = { viewsPerFollower: round(vpf, 3), multiplier: round(multiplier), ownMedianViews: ownMedian, ownFollowers: own?.followers ?? null, ownN: own?.n ?? 0 };
  if (own?.followers && vpf !== null) {
    const central = vpf * own.followers;
    return {
      status: "ok",
      method: "reach-per-follower",
      low: Math.round(central * 0.1),
      high: Math.round(central * 0.5),
      relativeToOwnMedian: relative,
      inputs,
      assumptions: [
        "views scale with followers at the reference's views-per-follower ratio",
        "a remake captures 10-50% of the reference's reach per follower (the reference was selected as an extreme; expect regression to the mean)",
      ],
    };
  }
  if (ownMedian !== null && relative !== null) {
    return {
      status: "ok",
      method: "own-median",
      low: Math.round(ownMedian * relative.low),
      high: Math.round(ownMedian * relative.high),
      relativeToOwnMedian: relative,
      inputs,
      assumptions: [
        `own median views from ${own!.n} #558 observations on ${own!.platform}`,
        "a remake lifts our post over our own median by the fourth root to the square root of the creator-relative multiplier (regression to the mean)",
      ],
    };
  }
  return {
    status: "no own baseline yet",
    method: null,
    low: null,
    high: null,
    relativeToOwnMedian: relative,
    inputs,
    assumptions: [`#558 has fewer than ${own?.minN ?? 3} own outcomes${own ? ` on ${own.platform}` : ""} and no own follower count; the relative band is stored for later checks`],
  };
}

// ─── Prediction ledger ──────────────────────────────────────────────────────

export const PREDICTION_LEDGER_BODY_KIND = "ralphy.trend-prediction-ledger";
export const PREDICTION_SPREAD_DAYS = 14;

export type PickClassification = "transferable" | "creator-bound" | "unclassified";

export interface PredictionPick {
  pickId: string;
  signalType: SignalType;
  cause: NearMissCause | null;
  wideningStep: WideningStep | null;
  videoId: string | null;
  url: string | null;
  creator: string | null;
  platform: string | null;
  detectedAt: string;
  evidence: { multiplier: number | null; views: number | null; followers: number | null; format: string | null; hook: string | null; creators: number | null };
  predicted: {
    /** Our own produced version (#558 outcomes). */
    own: ScaleUpEstimate | null;
    /** Skipped picks: the format / hook keeps spreading to more creators within the window. */
    spread: { axis: "format" | "hook"; value: string; creatorsAtPick: number; withinDays: number } | null;
  };
  why: string | null;
  classification: PickClassification;
  decision: "pending" | "produce" | "skip";
  /** Filled when a produced pick is linked to #558 outcomes. */
  outcome: { checkedAt: string; views: number; ownMedianViews: number; verdict: "hit" | "miss" } | null;
}

export interface PredictionLedgerBody {
  kind: typeof PREDICTION_LEDGER_BODY_KIND;
  version: 1;
  niche: string;
  scope: { language: string | null; platform: string | null };
  picks: PredictionPick[];
  updatedAt: string;
}

export function parsePredictionLedger(body: unknown): PredictionLedgerBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Partial<PredictionLedgerBody>;
  if (record.kind !== PREDICTION_LEDGER_BODY_KIND || record.version !== 1 || !Array.isArray(record.picks) || typeof record.niche !== "string") return null;
  return record as PredictionLedgerBody;
}

/**
 * Merge new picks into a ledger. A recorded prediction is never rewritten:
 * existing picks keep their band, detection time and evidence; only a
 * missing hypothesis / classification may be filled (the Document's
 * revisions keep every prior state). New picks are appended.
 */
export function mergePicks(existing: readonly PredictionPick[], incoming: readonly PredictionPick[]): { picks: PredictionPick[]; added: number; updated: number } {
  const byId = new Map(existing.map((pick) => [pick.pickId, { ...pick }]));
  let added = 0;
  let updated = 0;
  const order = existing.map((pick) => pick.pickId);
  for (const pick of incoming) {
    const current = byId.get(pick.pickId);
    if (!current) {
      byId.set(pick.pickId, pick);
      order.push(pick.pickId);
      added += 1;
      continue;
    }
    let changed = false;
    if (pick.why && pick.why !== current.why) { current.why = pick.why; changed = true; }
    if (pick.classification !== "unclassified" && pick.classification !== current.classification) { current.classification = pick.classification; changed = true; }
    if (changed) updated += 1;
  }
  return { picks: order.map((id) => byId.get(id)!), added, updated };
}

export interface PrecisionFacts {
  /** Distinct unrelated creators with a hit on `axis:value` posted after `since`. */
  spreadCreatorsAfter(axis: "format" | "hook", value: string, since: number): number;
}

/**
 * Engine precision per signal type. A produced pick resolves through its
 * #558 outcome (hit = at or above the low end of its band); a pick with a
 * spread prediction resolves once its window has elapsed (hit = at least one
 * more unrelated creator broke out on the same label). Below `minN` resolved
 * picks a type reports "insufficient data" (the #558 minimum-n rule).
 */
export function precisionReport(ledger: PredictionLedgerBody | null, facts: PrecisionFacts, now: number, minN: number) {
  const picks = ledger?.picks ?? [];
  const rows = SIGNAL_TYPES.filter((type) => type !== "demand-signal").map((type) => {
    const list = picks.filter((pick) => pick.signalType === type);
    let resolved = 0;
    let hits = 0;
    let pendingSpread = 0;
    let produced = 0;
    for (const pick of list) {
      if (pick.outcome) {
        produced += 1;
        resolved += 1;
        if (pick.outcome.verdict === "hit") hits += 1;
        continue;
      }
      const spread = pick.predicted.spread;
      if (spread) {
        const detected = Date.parse(pick.detectedAt);
        if (!Number.isFinite(detected) || now < detected + spread.withinDays * DAY_MS) { pendingSpread += 1; continue; }
        resolved += 1;
        if (facts.spreadCreatorsAfter(spread.axis, spread.value, detected) >= 1) hits += 1;
      }
    }
    const enough = resolved >= minN;
    return {
      signalType: type,
      picks: list.length,
      resolved,
      producedWithOutcome: produced,
      pendingSpreadChecks: pendingSpread,
      precision: enough ? round(hits / resolved, 3) : null,
      verdict: enough ? "ok" : "insufficient data",
    };
  });
  return { minN, rows, picks: picks.length };
}
