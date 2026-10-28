// Trend corpus scoring pass (#556) — pure. The store layer loads creators,
// videos, and snapshots; this module turns them into outlier fields. Nothing
// here reads the network or the database.
//
// Baselines come only from creator listings: a window member must have been
// seen in a listing of its creator (`inListing`), and a video is scored only
// when its creator has been listed at least once. A discovery-only video
// (Explore / hashtag hit whose creator was never listed) stays unscored with
// the `no-listing` flag — discovery surfaces over-represent winners.

import {
  COHORT_WINDOW_DAYS,
  DAY_MS,
  HOUR_MS,
  MATURITY_PRIORS,
  MIN_COHORT_MEMBERS,
  MIN_PROJECTION_AGE_HOURS,
  PROVISIONAL_AGE_HOURS,
  THIN_BASELINE,
  TREND_METRICS,
  WINDOW_K,
  cohortFallbacks,
  composite,
  creatorBaseline,
  engagementLog,
  isRising,
  logValue,
  maturity,
  median,
  metricScore,
  momentum,
  outlierLabel,
  project,
  robustScale,
  rollingWindow,
  shrink,
  valueAtAge,
  type AgedValue,
  type MaturityCurve,
  type OutlierLabel,
  type TrendMetric,
  type TrendPlatform,
  type WindowMember,
} from "./math.js";

export type MetricValues = Partial<Record<TrendMetric, number | null>>;

export interface ScoreSnapshot {
  asOf: number;
  /** Age at snapshot time in hours; null when the post time is unknown. */
  ageHours: number | null;
  values: MetricValues;
  source: string;
}

export interface ScoreVideo {
  id: string;
  /** Platform video id (stable tiebreak). */
  key: string;
  platform: TrendPlatform;
  formatKey: string;
  postedAt: number | null;
  /** Seen in a listing of its own creator (eligible as a baseline member). */
  inListing: boolean;
  cohortKey: string;
  latest: { asOf: number; values: MetricValues } | null;
  snapshots: ScoreSnapshot[];
}

export interface ScoreCreator {
  creatorId: string;
  platform: TrendPlatform;
  /** The creator has at least one successful listing. */
  listed: boolean;
  followerSnapshots: Array<{ asOf: number; followers: number }>;
  videos: ScoreVideo[];
}

export type CohortStats = Map<string, { median: number; scale: number; n: number }>;

export interface VideoScore {
  videoId: string;
  multiplier: number | null;
  z: number | null;
  composite: number | null;
  label: OutlierLabel | null;
  mode: "projected" | "same-age" | null;
  flags: string[];
  momentum: number | null;
  detail: {
    ageHours: number | null;
    baselineN: number;
    cohortKey: string;
    cohortLevel: number | null;
    multipliers: MetricValues;
    z: MetricValues;
    engagement: MetricValues;
    followerMultiplier: number | null;
    curve: { tauHours: number; k: number; basis: string };
    /** Thresholds that produced the label (#576 percentile calibration). */
    labelThresholds?: { group: string; basis: string; breakout: number; outlier: number; strong: number };
  } | null;
}

export interface ScoreOptions {
  now: number;
  curves?: Partial<Record<TrendPlatform, MaturityCurve>>;
  windowK?: number;
}

const curveFor = (platform: TrendPlatform, options: ScoreOptions): MaturityCurve =>
  options.curves?.[platform] ?? MATURITY_PRIORS[platform];

const ageHoursOf = (video: ScoreVideo, asOf: number): number | null =>
  video.postedAt === null ? null : (asOf - video.postedAt) / HOUR_MS;

/** Log projected 28-day values from the latest snapshot (null per metric when not projectable). */
export function projectedLogs(video: ScoreVideo, curve: MaturityCurve): MetricValues | null {
  if (!video.latest || video.postedAt === null) return null;
  const age = ageHoursOf(video, video.latest.asOf)!;
  if (age < MIN_PROJECTION_AGE_HOURS) return null;
  const out: MetricValues = {};
  for (const metric of TREND_METRICS) {
    const value = video.latest.values[metric];
    if (typeof value !== "number") continue;
    const projected = project(value, age, curve);
    out[metric] = projected === null ? null : logValue(projected);
  }
  return out;
}

/**
 * Cohort medians of the log projected value per metric, for every cohort key
 * and its fallbacks, over listing members posted in the last 90 days.
 */
export function cohortStats(creators: readonly ScoreCreator[], options: ScoreOptions): CohortStats {
  const buckets = new Map<string, number[]>();
  const since = options.now - COHORT_WINDOW_DAYS * DAY_MS;
  for (const creator of creators) {
    const curve = curveFor(creator.platform, options);
    for (const video of creator.videos) {
      if (!video.inListing || video.postedAt === null || video.postedAt < since) continue;
      const x = projectedLogs(video, curve);
      if (!x) continue;
      for (const key of cohortFallbacks(video.cohortKey)) {
        for (const metric of TREND_METRICS) {
          const value = x[metric];
          if (typeof value !== "number") continue;
          const bucketKey = `${key}#${metric}`;
          const list = buckets.get(bucketKey) ?? [];
          list.push(value);
          buckets.set(bucketKey, list);
        }
      }
    }
  }
  const out: CohortStats = new Map();
  for (const [key, values] of buckets) {
    if (values.length < MIN_COHORT_MEMBERS) continue;
    const center = median(values)!;
    out.set(key, { median: center, scale: robustScale(values, center), n: values.length });
  }
  return out;
}

function cohortMedianFor(stats: CohortStats, cohortKey: string, metric: TrendMetric): { median: number; scale: number; level: number } | null {
  const keys = cohortFallbacks(cohortKey);
  for (let level = 0; level < keys.length; level += 1) {
    const hit = stats.get(`${keys[level]}#${metric}`);
    if (hit) return { median: hit.median, scale: hit.scale, level };
  }
  return null;
}

type Member = WindowMember & { video: ScoreVideo };

/** Score every video of one creator. */
export function scoreCreator(creator: ScoreCreator, stats: CohortStats, options: ScoreOptions): VideoScore[] {
  const curve = curveFor(creator.platform, options);
  const k = options.windowK ?? WINDOW_K;
  const members: Member[] = [];
  for (const video of creator.videos) {
    if (!video.inListing || video.postedAt === null) continue;
    const x = projectedLogs(video, curve);
    if (!x || typeof x.views !== "number") continue;
    members.push({ postedAt: video.postedAt, key: video.key, x, video });
  }
  return creator.videos.map((video) => scoreVideo(creator, video, members, stats, curve, k, options));
}

function unscored(videoId: string, flags: string[]): VideoScore {
  return { videoId, multiplier: null, z: null, composite: null, label: null, mode: null, flags, momentum: null, detail: null };
}

function scoreVideo(
  creator: ScoreCreator,
  video: ScoreVideo,
  allMembers: readonly Member[],
  stats: CohortStats,
  curve: MaturityCurve,
  k: number,
  options: ScoreOptions,
): VideoScore {
  if (!creator.listed) return unscored(video.id, ["no-listing"]);
  if (video.postedAt === null || !video.latest) return unscored(video.id, ["undated"]);
  const age = ageHoursOf(video, video.latest.asOf)!;
  const g = videoMomentum(video, curve);
  const rising = g !== null && isRising(g.value, g.laterAgeHours);
  if (age < MIN_PROJECTION_AGE_HOURS) {
    return { ...unscored(video.id, ["provisional", "too-young", ...(rising ? ["rising"] : [])]), momentum: g?.value ?? null };
  }
  const sameFormat = allMembers.filter((member) => member.video.formatKey === video.formatKey);
  const window = rollingWindow(sameFormat, { postedAt: video.postedAt, key: video.key }, k);

  // Same-age mode: enough window members with snapshots bracketing this age.
  const bracketed = window
    .map((member) => ({ member, at: valueAtAge(agedSeries(member.video, "views"), age) }))
    .filter((entry): entry is { member: Member; at: number } => entry.at !== null);
  const sameAge = bracketed.length >= THIN_BASELINE;

  const own = sameAge ? rawLogs(video) : projectedLogs(video, curve);
  if (!own || typeof own.views !== "number") return unscored(video.id, ["no-baseline"]);

  const multipliers: MetricValues = {};
  const zs: MetricValues = {};
  let viewsN = 0;
  let cohortLevel: number | null = null;
  const maturityAtAge = maturity(age, curve);
  for (const metric of TREND_METRICS) {
    const x = own[metric];
    if (typeof x !== "number") continue;
    let creatorMedian: number | null;
    let scale: number;
    let n: number;
    if (sameAge) {
      const values = window
        .map((member) => valueAtAge(agedSeries(member.video, metric), age))
        .filter((value): value is number => value !== null);
      creatorMedian = median(values);
      scale = creatorMedian === null ? 0 : robustScale(values, creatorMedian);
      n = values.length;
    } else {
      const baseline = creatorBaseline(window, metric);
      creatorMedian = baseline.median;
      scale = baseline.scale;
      n = baseline.n;
    }
    const cohort = cohortMedianFor(stats, video.cohortKey, metric);
    // In same-age mode the cohort median (a 28-day projection) is moved to
    // this age: ln(1 + (e^C - 1) * M(a)).
    const cohortMedian = cohort === null
      ? null
      : sameAge
        ? logValue(Math.expm1(cohort.median) * maturityAtAge)
        : cohort.median;
    const bstar = shrink(creatorMedian, n, cohortMedian);
    if (bstar === null) continue;
    if (n < 3) scale = Math.max(cohort?.scale ?? 0, scale);
    const scored = metricScore(x, bstar, scale);
    multipliers[metric] = round(scored.multiplier);
    zs[metric] = round(scored.z);
    if (metric === "views") {
      viewsN = n;
      cohortLevel = cohort?.level ?? null;
    }
  }
  const viewsMultiplier = multipliers.views;
  const viewsZ = zs.views;
  if (typeof viewsMultiplier !== "number" || typeof viewsZ !== "number") return unscored(video.id, ["no-baseline"]);

  const thin = viewsN < THIN_BASELINE;
  const provisional = age < PROVISIONAL_AGE_HOURS;
  const flags = [
    ...(thin ? ["thin"] : []),
    ...(provisional ? ["provisional"] : []),
    ...(rising ? ["rising"] : []),
    ...(cohortLevel !== null && cohortLevel > 0 ? ["cohort-fallback"] : []),
    ...(cohortLevel === null && viewsN === 0 ? ["no-cohort"] : []),
  ];
  return {
    videoId: video.id,
    multiplier: viewsMultiplier,
    z: viewsZ,
    composite: roundOrNull(composite(creator.platform, zs)),
    label: outlierLabel({ viewsMultiplier, viewsZ, thin, provisional }),
    mode: sameAge ? "same-age" : "projected",
    flags,
    momentum: g === null ? null : round(g.value),
    detail: {
      ageHours: round(age),
      baselineN: viewsN,
      cohortKey: video.cohortKey,
      cohortLevel,
      multipliers,
      z: zs,
      engagement: engagementQuality(video, window.map((member) => member.video)),
      followerMultiplier: followerMultiplier(creator, video, window, curve),
      curve: { tauHours: curve.tauHours, k: curve.k, basis: curve.basis },
    },
  };
}

function rawLogs(video: ScoreVideo): MetricValues | null {
  if (!video.latest) return null;
  const out: MetricValues = {};
  for (const metric of TREND_METRICS) {
    const value = video.latest.values[metric];
    if (typeof value === "number") out[metric] = logValue(value);
  }
  return out;
}

function agedSeries(video: ScoreVideo, metric: TrendMetric): AgedValue[] {
  return video.snapshots.flatMap((snapshot) => {
    const value = snapshot.values[metric];
    return snapshot.ageHours !== null && typeof value === "number" ? [{ ageHours: snapshot.ageHours, value }] : [];
  });
}

/** Momentum from the two most recent dated view snapshots. */
export function videoMomentum(video: ScoreVideo, curve: MaturityCurve): { value: number; laterAgeHours: number } | null {
  const series = agedSeries(video, "views").sort((a, b) => a.ageHours - b.ageHours);
  if (series.length < 2) return null;
  const later = series[series.length - 1]!;
  // The newest snapshot at least an hour older than the latest one (two
  // sources in the same pass are minutes apart and say nothing about growth).
  const earlier = [...series].reverse().find((point) => later.ageHours - point.ageHours >= 1);
  if (!earlier || earlier.ageHours < MIN_PROJECTION_AGE_HOURS / 6) return null;
  const value = momentum(earlier, later, curve);
  return value === null ? null : { value, laterAgeHours: later.ageHours };
}

/** q_r: interactions per view vs the same quantity's median over the window. */
export function engagementQuality(video: ScoreVideo, window: readonly ScoreVideo[]): MetricValues {
  const out: MetricValues = {};
  const views = video.latest?.values.views;
  if (typeof views !== "number") return out;
  for (const metric of ["likes", "comments", "shares", "saves"] as const) {
    const own = video.latest?.values[metric];
    if (typeof own !== "number") continue;
    const reference = window.flatMap((member) => {
      const memberViews = member.latest?.values.views;
      const memberValue = member.latest?.values[metric];
      return typeof memberViews === "number" && typeof memberValue === "number" ? [engagementLog(memberValue, memberViews)] : [];
    });
    const center = median(reference);
    if (center === null) continue;
    out[metric] = round(engagementLog(own, views) - center);
  }
  return out;
}

/**
 * Follower-normalized variant: projected views per follower at post time vs
 * the window's median of the same quantity. Needs a follower snapshot within
 * 14 days of each post and at least THIN_BASELINE window members with one.
 */
export function followerMultiplier(
  creator: ScoreCreator,
  video: ScoreVideo,
  window: readonly Member[],
  curve: MaturityCurve,
): number | null {
  const followersAt = (postedAt: number): number | null => {
    let best: { distance: number; followers: number } | null = null;
    for (const snapshot of creator.followerSnapshots) {
      const distance = Math.abs(snapshot.asOf - postedAt);
      if (distance > 14 * DAY_MS || snapshot.followers <= 0) continue;
      if (!best || distance < best.distance) best = { distance, followers: snapshot.followers };
    }
    return best?.followers ?? null;
  };
  const ratio = (target: ScoreVideo): number | null => {
    if (target.postedAt === null) return null;
    const x = projectedLogs(target, curve);
    const followers = followersAt(target.postedAt);
    if (!x || typeof x.views !== "number" || followers === null) return null;
    return x.views - Math.log1p(followers);
  };
  const own = ratio(video);
  if (own === null) return null;
  const reference = window.map((member) => ratio(member.video)).filter((value): value is number => value !== null);
  if (reference.length < THIN_BASELINE) return null;
  return round(Math.exp(own - median(reference)!));
}

/** Creator baseline rows for the recomputable cache (newest window). */
export function creatorBaselineRows(creator: ScoreCreator, options: ScoreOptions): Array<{ formatKey: string; metric: TrendMetric; medianLog: number; madLog: number; n: number }> {
  const curve = curveFor(creator.platform, options);
  const byFormat = new Map<string, WindowMember[]>();
  for (const video of creator.videos) {
    if (!video.inListing || video.postedAt === null) continue;
    const x = projectedLogs(video, curve);
    if (!x) continue;
    const list = byFormat.get(video.formatKey) ?? [];
    list.push({ postedAt: video.postedAt, key: video.key, x });
    byFormat.set(video.formatKey, list);
  }
  const rows: Array<{ formatKey: string; metric: TrendMetric; medianLog: number; madLog: number; n: number }> = [];
  for (const [formatKey, list] of byFormat) {
    const window = [...list].sort((a, b) => b.postedAt - a.postedAt).slice(0, options.windowK ?? WINDOW_K);
    for (const metric of TREND_METRICS) {
      const baseline = creatorBaseline(window, metric);
      if (baseline.median === null) continue;
      rows.push({ formatKey, metric, medianLog: round(baseline.median), madLog: round(baseline.scale), n: baseline.n });
    }
  }
  return rows;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : round(value);
}
