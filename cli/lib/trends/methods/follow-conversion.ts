// Method on trial (#578): follow conversion per 1k views from creator
// snapshot deltas. Behind the backtest `--methods follow-conversion` flag.
//
// Between two follower snapshots of a creator (t1 < t2), the follower gain
// is divided by the views the creator's videos gained over the same
// interval. Each video's views at t1 and t2 are interpolated between its own
// snapshots (0 at the post time) along a maturity shape; linear
// interpolation of a concave view curve overstates the gain between sparse
// snapshots and biases the conversion down. Old videos (posted more
// than `coverageDays` before t2) that a listing no longer returns are left
// out (they gain little); the interval is dropped when a recent video is
// unobserved at t1 or t2, because its gain would be misattributed. The
// creator's conversion is the ratio of sums over its intervals.

export interface ConversionSeriesPoint {
  asOf: number;
  views: number;
}

export interface ConversionVideo {
  postedAt: number | null;
  snapshots: readonly ConversionSeriesPoint[];
}

export interface FollowConversion {
  /** Followers gained per 1,000 views gained (null without usable intervals). */
  per1k: number | null;
  deltaFollowers: number;
  deltaViews: number;
  intervals: number;
}

/** Expected share of the final value reached at an age in hours (a maturity curve). */
export type MaturityShape = (ageHours: number) => number;

/**
 * Views at `at`, interpolated between the video's snapshots along the
 * maturity shape (linear in elapsed time when no shape or no post time is
 * given); null when `at` is outside the observed span by more than
 * `toleranceMs` (a listing and the follower snapshot of one pass are
 * seconds apart).
 */
export function viewsAt(video: ConversionVideo, at: number, toleranceMs = 2 * 3_600_000, shape?: MaturityShape): number | null {
  if (video.postedAt !== null && at <= video.postedAt) return 0;
  const points = [...video.snapshots].sort((a, b) => a.asOf - b.asOf);
  if (points.length === 0) return null;
  const anchor = video.postedAt !== null ? [{ asOf: video.postedAt, views: 0 }, ...points] : points;
  const first = anchor[0]!;
  const last = anchor[anchor.length - 1]!;
  if (at < first.asOf) return at >= first.asOf - toleranceMs ? first.views : null;
  if (at > last.asOf) return at <= last.asOf + toleranceMs ? last.views : null;
  const position = (instant: number) =>
    shape && video.postedAt !== null ? shape(Math.max(0, (instant - video.postedAt) / 3_600_000)) : instant;
  for (let i = 1; i < anchor.length; i += 1) {
    const low = anchor[i - 1]!;
    const high = anchor[i]!;
    if (at <= high.asOf) {
      const span = position(high.asOf) - position(low.asOf);
      return span <= 0 ? high.views : low.views + ((position(at) - position(low.asOf)) / span) * (high.views - low.views);
    }
  }
  return last.views;
}

export function followConversion(input: {
  followerSnapshots: ReadonlyArray<{ asOf: number; followers: number | null }>;
  videos: readonly ConversionVideo[];
  /** Ignore intervals shorter than this (follower counts are rounded). */
  minIntervalMs?: number;
  /** Videos posted within this many days before t2 must be observed. */
  coverageDays?: number;
  /** Maturity shape for interpolating views between snapshots (default: linear in time). */
  shape?: MaturityShape;
}): FollowConversion {
  const snapshots = input.followerSnapshots
    .filter((snapshot): snapshot is { asOf: number; followers: number } => snapshot.followers !== null)
    .sort((a, b) => a.asOf - b.asOf);
  const minInterval = input.minIntervalMs ?? 6 * 3_600_000;
  const coverageMs = (input.coverageDays ?? 14) * 86_400_000;
  let deltaFollowers = 0;
  let deltaViews = 0;
  let intervals = 0;
  for (let i = 1; i < snapshots.length; i += 1) {
    const t1 = snapshots[i - 1]!;
    const t2 = snapshots[i]!;
    if (t2.asOf - t1.asOf < minInterval) continue;
    let gained = 0;
    let complete = true;
    for (const video of input.videos) {
      if (video.postedAt !== null && video.postedAt >= t2.asOf) continue;
      const v2 = viewsAt(video, t2.asOf, undefined, input.shape);
      const v1 = viewsAt(video, t1.asOf, undefined, input.shape);
      if (v2 === null || v1 === null) {
        if (video.postedAt === null || video.postedAt < t2.asOf - coverageMs) continue;
        complete = false;
        break;
      }
      gained += Math.max(0, v2 - v1);
    }
    if (!complete || gained <= 0) continue;
    deltaFollowers += t2.followers - t1.followers;
    deltaViews += gained;
    intervals += 1;
  }
  return { per1k: deltaViews > 0 ? (1000 * deltaFollowers) / deltaViews : null, deltaFollowers, deltaViews, intervals };
}
