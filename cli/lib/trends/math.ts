// Trend corpus math (#556) — pure functions, no I/O.
//
// Implements docs/research/trend-corpus.md "Outlier formula": a per-platform
// Weibull maturity curve projects every snapshot to a 28-day value, the log of
// that value is compared with the creator's rolling, leave-one-out median of
// the last K same-format videos, shrunk toward the cohort median for creators
// with few videos, and turned into a multiplier, a robust z per metric, and a
// platform-weighted composite. Scores are Ralphy's own, never platform data.

export const TREND_PLATFORMS = ["tiktok", "youtube", "instagram"] as const;
export type TrendPlatform = (typeof TREND_PLATFORMS)[number];

export const TREND_METRICS = ["views", "likes", "comments", "shares", "saves"] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export function isTrendPlatform(value: unknown): value is TrendPlatform {
  return typeof value === "string" && (TREND_PLATFORMS as readonly string[]).includes(value);
}

// ─── 1. Maturity curve ──────────────────────────────────────────────────────

export interface MaturityCurve {
  /** Weibull scale in hours. */
  tauHours: number;
  /** Weibull shape. */
  k: number;
  /** Where the parameters came from. */
  basis: "prior" | "refit";
  /** Longitudinal pairs behind a refit (0 for a prior). */
  n: number;
}

/**
 * Bootstrap priors. TikTok is fit through two points of the measured
 * cross-section (#555); YouTube Shorts and Instagram Reels are assumptions
 * until a refit from longitudinal snapshots replaces them.
 */
export const MATURITY_PRIORS: Readonly<Record<TrendPlatform, MaturityCurve>> = {
  tiktok: { tauHours: 54, k: 1.15, basis: "prior", n: 0 },
  youtube: { tauHours: 96, k: 1.0, basis: "prior", n: 0 },
  instagram: { tauHours: 96, k: 1.0, basis: "prior", n: 0 },
};

/** Expected share of the 28-day value reached at age `ageHours`. */
export function maturity(ageHours: number, curve: MaturityCurve): number {
  if (!Number.isFinite(ageHours) || ageHours <= 0) return 0;
  return 1 - Math.exp(-Math.pow(ageHours / curve.tauHours, curve.k));
}

/** Projection floor: never divide by less than 10% maturity. */
export const MATURITY_FLOOR = 0.1;
/** Snapshots younger than this are not projected (too noisy). */
export const MIN_PROJECTION_AGE_HOURS = 6;
/** Scores for videos younger than this stay `provisional`. */
export const PROVISIONAL_AGE_HOURS = 72;

// ─── 2. Projection and log ─────────────────────────────────────────────────

/** Projected 28-day value, or null below the minimum projection age. */
export function project(value: number, ageHours: number, curve: MaturityCurve): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (!Number.isFinite(ageHours) || ageHours < MIN_PROJECTION_AGE_HOURS) return null;
  return value / Math.max(maturity(ageHours, curve), MATURITY_FLOOR);
}

export const logValue = (value: number): number => Math.log1p(Math.max(0, value));

// ─── Checkpoint buckets ─────────────────────────────────────────────────────

export const CHECKPOINTS = [
  "h0-6",
  "h6-24",
  "d1-2",
  "d2-3",
  "d3-7",
  "d7-14",
  "d14-28",
  "d28",
  "monthly",
  "undated",
] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number];

export interface CheckpointBucket {
  checkpoint: Checkpoint;
  /** 0 for fixed buckets; month number for `monthly`; UTC day for `undated`. */
  bucketSeq: number;
}

/**
 * Bucket a snapshot by video age. The first sample in a bucket wins (the
 * store inserts with INSERT OR IGNORE on the bucket key), so a second refresh
 * in the same bucket writes no snapshot row. `d28` covers days 28-56; after
 * that one `monthly` bucket per 30 days. A video without a known post time
 * gets one `undated` bucket per UTC day of observation.
 */
export function checkpointFor(ageMs: number | null, asOf: number): CheckpointBucket {
  if (ageMs === null || !Number.isFinite(ageMs)) {
    return { checkpoint: "undated", bucketSeq: Math.max(0, Math.floor(asOf / DAY_MS)) };
  }
  const hours = Math.max(0, ageMs) / HOUR_MS;
  if (hours < 6) return { checkpoint: "h0-6", bucketSeq: 0 };
  if (hours < 24) return { checkpoint: "h6-24", bucketSeq: 0 };
  if (hours < 48) return { checkpoint: "d1-2", bucketSeq: 0 };
  if (hours < 72) return { checkpoint: "d2-3", bucketSeq: 0 };
  if (hours < 168) return { checkpoint: "d3-7", bucketSeq: 0 };
  if (hours < 336) return { checkpoint: "d7-14", bucketSeq: 0 };
  if (hours < 672) return { checkpoint: "d14-28", bucketSeq: 0 };
  if (hours < 1344) return { checkpoint: "d28", bucketSeq: 0 };
  return { checkpoint: "monthly", bucketSeq: Math.floor((hours / 24 - 56) / 30) + 1 };
}

// ─── Robust statistics ──────────────────────────────────────────────────────

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Median absolute deviation around `center`. */
export function mad(values: readonly number[], center: number): number | null {
  return median(values.map((value) => Math.abs(value - center)));
}

/** Consistency constant: 1.4826 * MAD estimates the SD of a normal sample. */
export const MAD_SCALE = 1.4826;
/** Floor on the robust scale so very consistent creators cannot explode z. */
export const SCALE_FLOOR = 0.25;
/** Fewer window members than this marks the baseline `thin`. */
export const THIN_BASELINE = 8;
/** Shrinkage prior strength toward the cohort median. */
export const SHRINK_N0 = 5;
/** Rolling window size (most recent same-format videos). */
export const WINDOW_K = 30;

export function robustScale(values: readonly number[], center: number): number {
  const deviation = mad(values, center);
  return Math.max(MAD_SCALE * (deviation ?? 0), SCALE_FLOOR);
}

// ─── 3-4. Baseline + shrinkage ──────────────────────────────────────────────

export interface WindowMember {
  /** Ordering instant (post time). */
  postedAt: number;
  /** Stable tiebreak (platform video id). */
  key: string;
  /** Log projected values per metric (null = not exposed / not projectable). */
  x: Partial<Record<TrendMetric, number | null>>;
}

/**
 * W(v): the K most recent members posted strictly before `target` (by post
 * time, then key). The target itself is never a member (leave-one-out).
 */
export function rollingWindow<T extends WindowMember>(
  members: readonly T[],
  target: { postedAt: number; key: string },
  k = WINDOW_K,
): T[] {
  return members
    .filter((member) =>
      member.postedAt < target.postedAt ||
      (member.postedAt === target.postedAt && member.key < target.key)
    )
    .sort((a, b) => b.postedAt - a.postedAt || (a.key < b.key ? 1 : -1))
    .slice(0, k);
}

export interface CreatorBaseline {
  median: number | null;
  scale: number;
  n: number;
}

export function creatorBaseline(window: readonly WindowMember[], metric: TrendMetric): CreatorBaseline {
  const values = window
    .map((member) => member.x[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const center = median(values);
  return {
    median: center,
    scale: center === null ? SCALE_FLOOR : robustScale(values, center),
    n: values.length,
  };
}

/** Bstar = (n * B + n0 * C) / (n + n0); falls back to whichever side exists. */
export function shrink(
  creatorMedian: number | null,
  n: number,
  cohortMedian: number | null,
  n0 = SHRINK_N0,
): number | null {
  if (creatorMedian === null || n === 0) return cohortMedian;
  if (cohortMedian === null) return creatorMedian;
  return (n * creatorMedian + n0 * cohortMedian) / (n + n0);
}

// ─── 5. Per-metric scores ──────────────────────────────────────────────────

export interface MetricScore {
  multiplier: number;
  z: number;
}

export function metricScore(x: number, baseline: number, scale: number): MetricScore {
  const delta = x - baseline;
  return { multiplier: Math.exp(delta), z: delta / Math.max(scale, SCALE_FLOOR) };
}

// ─── 6. Engagement quality ─────────────────────────────────────────────────

/** ln((1 + y_r) / (1 + y_views)) — interactions per view on a log scale. */
export function engagementLog(interactions: number, views: number): number {
  return Math.log1p(Math.max(0, interactions)) - Math.log1p(Math.max(0, views));
}

// ─── 7. Composite ──────────────────────────────────────────────────────────

export const COMPOSITE_WEIGHTS: Readonly<Record<TrendPlatform, Partial<Record<TrendMetric, number>>>> = {
  tiktok: { views: 0.55, shares: 0.2, saves: 0.15, comments: 0.1 },
  youtube: { views: 0.75, likes: 0.15, comments: 0.1 },
  instagram: { views: 0.6, likes: 0.2, comments: 0.2 },
};

/** O(v) = sum w * Z, with weights renormalized over the metrics present. */
export function composite(platform: TrendPlatform, z: Partial<Record<TrendMetric, number | null>>): number | null {
  const weights = COMPOSITE_WEIGHTS[platform];
  let total = 0;
  let weight = 0;
  for (const [metric, w] of Object.entries(weights) as Array<[TrendMetric, number]>) {
    const value = z[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    total += w * value;
    weight += w;
  }
  return weight > 0 ? total / weight : null;
}

// ─── Labels ────────────────────────────────────────────────────────────────

export const OUTLIER_LABELS = ["breakout", "outlier", "strong", "normal", "under"] as const;
export type OutlierLabel = (typeof OUTLIER_LABELS)[number];

/** Below this views multiplier a mature, non-thin video reads `under`. */
export const UNDER_MULTIPLIER = 0.5;

/**
 * breakout X >= 10; outlier X >= 5 and Z >= 2; strong X >= 3; all three need a
 * non-thin baseline and a non-provisional age. Thin or provisional scores get
 * no label (null) — the multiplier and flags still show.
 */
export function outlierLabel(input: {
  viewsMultiplier: number;
  viewsZ: number;
  thin: boolean;
  provisional: boolean;
}): OutlierLabel | null {
  if (input.thin || input.provisional) return null;
  if (input.viewsMultiplier >= 10) return "breakout";
  if (input.viewsMultiplier >= 5 && input.viewsZ >= 2) return "outlier";
  if (input.viewsMultiplier >= 3) return "strong";
  if (input.viewsMultiplier < UNDER_MULTIPLIER) return "under";
  return "normal";
}

/** Display bands matching the competitor convention (Eden). */
export function multiplierBand(multiplier: number): string {
  if (multiplier < 1) return "under 1x";
  if (multiplier < 3) return "1-3x";
  if (multiplier < 5) return "3-5x";
  if (multiplier < 10) return "5-10x";
  if (multiplier < 50) return "10-50x";
  return "50x+";
}

// ─── 8. Momentum ───────────────────────────────────────────────────────────

/** g = ln((1+y2)/(1+y1)) - ln(M(a2)/M(a1)) between snapshots a1 < a2. */
export function momentum(
  earlier: { ageHours: number; value: number },
  later: { ageHours: number; value: number },
  curve: MaturityCurve,
): number | null {
  if (later.ageHours <= earlier.ageHours) return null;
  const m1 = maturity(earlier.ageHours, curve);
  const m2 = maturity(later.ageHours, curve);
  if (m1 <= 0 || m2 <= 0) return null;
  return logValue(later.value) - logValue(earlier.value) - Math.log(m2 / m1);
}

export const RISING_MOMENTUM = 0.3;
export const RISING_MAX_AGE_HOURS = 7 * 24;

export function isRising(g: number | null, laterAgeHours: number): boolean {
  return g !== null && g > RISING_MOMENTUM && laterAgeHours < RISING_MAX_AGE_HOURS;
}

// ─── 9. Same-age mode ──────────────────────────────────────────────────────

export interface AgedValue {
  ageHours: number;
  value: number;
}

/**
 * Log-interpolated value at `ageHours` from snapshots that bracket it, or
 * null when no pair brackets the age. Interpolation is linear in age on
 * ln(1 + value).
 */
export function valueAtAge(series: readonly AgedValue[], ageHours: number): number | null {
  const sorted = [...series].sort((a, b) => a.ageHours - b.ageHours);
  for (const point of sorted) if (point.ageHours === ageHours) return logValue(point.value);
  for (let index = 1; index < sorted.length; index += 1) {
    const low = sorted[index - 1]!;
    const high = sorted[index]!;
    if (low.ageHours < ageHours && ageHours < high.ageHours) {
      const t = (ageHours - low.ageHours) / (high.ageHours - low.ageHours);
      return logValue(low.value) + t * (logValue(high.value) - logValue(low.value));
    }
  }
  return null;
}

// ─── Maturity refit ────────────────────────────────────────────────────────

export interface MaturityPair {
  ageHours: number;
  /** y(a) / y(28 d) for one video. */
  ratio: number;
}

/** Longitudinal pairs needed before a refit replaces the prior. */
export const MIN_REFIT_PAIRS = 200;

/**
 * Least-squares grid fit of (tau, k) to observed maturity ratios, robust to
 * ratios above 1 (clipped). Returns null below the minimum pair count.
 */
export function refitMaturity(pairs: readonly MaturityPair[], minPairs = MIN_REFIT_PAIRS): MaturityCurve | null {
  const usable = pairs.filter((pair) => pair.ageHours > 0 && Number.isFinite(pair.ratio) && pair.ratio >= 0);
  if (usable.length < minPairs) return null;
  let best: { tau: number; k: number; loss: number } | null = null;
  for (let tau = 6; tau <= 480; tau += 2) {
    for (let k = 0.4; k <= 3.001; k += 0.05) {
      let loss = 0;
      for (const pair of usable) {
        const predicted = 1 - Math.exp(-Math.pow(pair.ageHours / tau, k));
        const residual = Math.min(pair.ratio, 1.5) - predicted;
        loss += residual * residual;
      }
      if (!best || loss < best.loss) best = { tau, k, loss };
    }
  }
  return best
    ? { tauHours: best.tau, k: Math.round(best.k * 100) / 100, basis: "refit", n: usable.length }
    : null;
}

// ─── Deterministic bands ───────────────────────────────────────────────────

export const LENGTH_BANDS = ["le7s", "8-15s", "16-30s", "31-60s", "61-90s", "91-180s", "gt180s"] as const;
export type LengthBand = (typeof LENGTH_BANDS)[number];

export function lengthBandFor(durationMs: number | null | undefined): LengthBand | null {
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const seconds = Math.round(durationMs / 1000);
  if (seconds <= 7) return "le7s";
  if (seconds <= 15) return "8-15s";
  if (seconds <= 30) return "16-30s";
  if (seconds <= 60) return "31-60s";
  if (seconds <= 90) return "61-90s";
  if (seconds <= 180) return "91-180s";
  return "gt180s";
}

export const SIZE_BANDS = ["seed", "nano", "micro", "mid", "macro", "mega"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export function sizeBandFor(followers: number | null | undefined): SizeBand | null {
  if (followers === null || followers === undefined || !Number.isFinite(followers) || followers < 0) return null;
  if (followers < 1_000) return "seed";
  if (followers < 10_000) return "nano";
  if (followers < 100_000) return "micro";
  if (followers < 500_000) return "mid";
  if (followers < 1_000_000) return "macro";
  return "mega";
}

export function formatKeyFor(platform: TrendPlatform): string {
  return platform === "tiktok" ? "tiktok-video" : platform === "youtube" ? "yt-short" : "ig-reel";
}

/** Cohort key: platform|niche|format|length|size ("unknown" for missing axes). */
export function cohortKey(parts: {
  platform: TrendPlatform;
  niche: string | null;
  formatKey: string;
  lengthBand: string | null;
  sizeBand: string | null;
}): string {
  return [parts.platform, parts.niche ?? "unknown", parts.formatKey, parts.lengthBand ?? "unknown", parts.sizeBand ?? "unknown"].join("|");
}

/**
 * Coarser keys for shrinkage when a cohort is too small: drop length band,
 * then size band, then niche. Index 0 is the full key.
 */
export function cohortFallbacks(key: string): string[] {
  const [platform, niche, format, , size] = key.split("|");
  return [
    key,
    [platform, niche, format, "*", size].join("|"),
    [platform, niche, format, "*", "*"].join("|"),
    [platform, "*", format, "*", "*"].join("|"),
  ].filter((value, index, all) => all.indexOf(value) === index && value !== undefined) as string[];
}

/** Minimum cohort members before a cohort median is trusted. */
export const MIN_COHORT_MEMBERS = 10;
/** Cohort window: videos posted in the last 90 days. */
export const COHORT_WINDOW_DAYS = 90;

// ─── Text ──────────────────────────────────────────────────────────────────

/** Truncate by Unicode code point (never splits a surrogate pair). */
export function truncateCodePoints(value: string, max: number): string {
  let out = "";
  let count = 0;
  for (const char of value) {
    if (count >= max) break;
    out += char;
    count += 1;
  }
  return out;
}
