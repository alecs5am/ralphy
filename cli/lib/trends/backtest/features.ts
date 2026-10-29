// Point-in-time features (#578) shared by baselines, methods, and tasks.
// Every function here reads through a `PointInTimeView` only; the #556
// formula pieces (maturity projection, leave-one-out rolling window, cohort
// shrinkage) are reused from `math.ts` unchanged.

import {
  COHORT_WINDOW_DAYS,
  DAY_MS,
  HOUR_MS,
  MATURITY_FLOOR,
  MATURITY_PRIORS,
  WINDOW_K,
  logValue,
  maturity,
  median,
  shrink,
  sizeBandFor,
  type MaturityCurve,
  type TrendPlatform,
} from "../math.js";
import type { PointInTimeView, VisibleVideo } from "./accessor.js";
import type { BtSnapshot } from "./corpus.js";

export type Curves = Partial<Record<TrendPlatform, MaturityCurve>>;

export const curveOf = (platform: TrendPlatform, curves?: Curves): MaturityCurve => curves?.[platform] ?? MATURITY_PRIORS[platform];

/**
 * ln(1 + projected 28-day views) from one snapshot. Unlike the #556 scorer
 * this also projects snapshots younger than 6 h (with the 10% maturity
 * floor), because the early-breakout task decides at the `h0-6` checkpoint.
 */
export function projectedLog(snapshot: BtSnapshot, platform: TrendPlatform, curves?: Curves): number | null {
  if (snapshot.views === null || snapshot.ageHours === null || !(snapshot.ageHours > 0)) return null;
  return logValue(snapshot.views / Math.max(maturity(snapshot.ageHours, curveOf(platform, curves)), MATURITY_FLOOR));
}

export interface BaselineMember {
  id: string;
  postedAt: number;
  x: number;
  ageHours: number;
}

/**
 * Leave-one-out window W(v): the creator's K most recent visible videos
 * posted strictly before `postedAt`, each at its latest visible projected
 * value (snapshots at least `minAgeHours` old).
 */
export function creatorWindow(view: PointInTimeView, creatorId: string, before: { postedAt: number; id: string }, options: { k?: number; minAgeHours?: number; curves?: Curves } = {}): BaselineMember[] {
  const k = options.k ?? WINDOW_K;
  const minAge = options.minAgeHours ?? 6;
  const members: BaselineMember[] = [];
  const videos = view.creatorVideos(creatorId);
  for (let i = videos.length - 1; i >= 0 && members.length < k; i -= 1) {
    const video = videos[i]!;
    if (video.postedAt === null || video.id === before.id) continue;
    if (video.postedAt > before.postedAt || (video.postedAt === before.postedAt && video.id >= before.id)) continue;
    const latest = view.latest(video.id);
    if (!latest || latest.ageHours === null || latest.ageHours < minAge) continue;
    const x = projectedLog(latest, video.platform, options.curves);
    if (x === null) continue;
    members.push({ id: video.id, postedAt: video.postedAt, x, ageHours: latest.ageHours });
  }
  return members;
}

export interface NicheStats {
  median: number;
  n: number;
}

/** Median projected log per creator niche over visible videos posted in the last 90 days. */
export function nicheMedians(view: PointInTimeView, options: { lookbackDays?: number; curves?: Curves } = {}): Map<string, NicheStats> {
  const since = view.t - (options.lookbackDays ?? COHORT_WINDOW_DAYS) * DAY_MS;
  const buckets = new Map<string, number[]>();
  for (const video of view.videos()) {
    if (video.postedAt === null || video.postedAt < since) continue;
    const latest = view.latest(video.id);
    if (!latest || latest.ageHours === null || latest.ageHours < 6) continue;
    const x = projectedLog(latest, video.platform, options.curves);
    if (x === null) continue;
    const key = nicheKey(view, video);
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(x);
  }
  return new Map([...buckets].filter(([, values]) => values.length >= 10).map(([key, values]) => [key, { median: median(values)!, n: values.length }]));
}

export const nicheKey = (view: PointInTimeView, video: VisibleVideo): string => `${video.platform}|${view.creator(video.creatorId)?.niche ?? "unknown"}`;

export interface MultiplierScore {
  /** ln multiplier = x - Bstar. */
  logMultiplier: number;
  x: number;
  baseline: number;
  n: number;
  ageHours: number;
  views: number;
}

/**
 * Creator-relative log multiplier of a video at the view time (the #556
 * baseline: rolling leave-one-out median shrunk toward the niche median).
 * `baselineOverride` lets a method swap the creator baseline estimator.
 */
export function logMultiplierAt(
  view: PointInTimeView,
  video: VisibleVideo,
  niches: ReadonlyMap<string, NicheStats>,
  options: { curves?: Curves; baselineOverride?: (members: BaselineMember[]) => { median: number | null; n: number } } = {},
): MultiplierScore | null {
  if (video.postedAt === null) return null;
  const latest = view.latest(video.id);
  if (!latest || latest.views === null) return null;
  const x = projectedLog(latest, video.platform, options.curves);
  if (x === null) return null;
  const members = creatorWindow(view, video.creatorId, { postedAt: video.postedAt, id: video.id }, { curves: options.curves });
  const own = options.baselineOverride ? options.baselineOverride(members) : { median: median(members.map((member) => member.x)), n: members.length };
  const cohort = niches.get(nicheKey(view, video))?.median ?? null;
  const baseline = shrink(own.median, own.n, cohort);
  if (baseline === null) return null;
  return { logMultiplier: x - baseline, x, baseline, n: own.n, ageHours: latest.ageHours ?? 0, views: latest.views };
}

/** Size band from followers at post time (visible snapshots only). */
export function sizeBandAt(view: PointInTimeView, video: VisibleVideo): string | null {
  if (video.postedAt === null) return null;
  return sizeBandFor(view.followersAt(video.creatorId, Math.min(video.postedAt, view.t)));
}

export const hoursBetween = (from: number, to: number) => (to - from) / HOUR_MS;
