// Outlier label thresholds by percentile (#576) — pure, no I/O.
//
// The #556 formula labels with fixed multipliers (breakout X >= 10, outlier
// X >= 5 with Z >= 2, strong X >= 3). On the first real TikTok corpus those
// fixed cuts labeled 9.5% of mature videos `breakout`: the multiplier
// distribution is heavy-tailed, so a fixed cut says more about the tail than
// about the video. Labels are therefore set per platform x niche from the
// multiplier distribution of mature, non-thin videos:
//
//   breakout  X >= max(10, p98)              top 2%
//   outlier   X >= max(5,  p95) and Z >= 2    top 5%
//   strong    X >= max(3,  p85)              top 15%
//   under     X < 0.5                         unchanged
//
// The fixed multipliers stay as floors, so a flat distribution never labels
// an ordinary video. A group with fewer than `minSample` mature videos falls
// back to the platform-wide distribution, then to the fixed cuts. Percentiles
// are overridable per niche (trend_niches.settings_json.labelPercentiles) and
// per score pass (`trends score --label-percentiles`, `--label-mode fixed`).

import { UNDER_MULTIPLIER, type OutlierLabel } from "./math.js";

export const LABEL_FLOORS = { breakout: 10, outlier: 5, strong: 3 } as const;
export const OUTLIER_MIN_Z = 2;

export interface LabelPercentiles {
  breakout: number;
  outlier: number;
  strong: number;
}

export const DEFAULT_LABEL_PERCENTILES: Readonly<LabelPercentiles> = { breakout: 0.98, outlier: 0.95, strong: 0.85 };
/** Mature, non-thin videos a group needs before its own percentiles are trusted. */
export const MIN_CALIBRATION_SAMPLE = 200;
/** Calibration population: videos at least this old at their latest snapshot. */
export const CALIBRATION_MATURE_HOURS = 168;

export interface LabelPolicy {
  mode: "percentile" | "fixed";
  percentiles: LabelPercentiles;
  minSample: number;
  /** Per-niche percentile overrides (niche slug -> percentiles). */
  overrides?: Record<string, LabelPercentiles>;
}

export const DEFAULT_LABEL_POLICY: Readonly<LabelPolicy> = {
  mode: "percentile",
  percentiles: DEFAULT_LABEL_PERCENTILES,
  minSample: MIN_CALIBRATION_SAMPLE,
};

export interface LabelThresholds {
  /** platform|niche, or platform|* for the platform fallback. */
  group: string;
  basis: "percentile" | "platform-percentile" | "fixed";
  /** Calibration videos behind the cut (0 for fixed). */
  n: number;
  breakout: number;
  outlier: number;
  strong: number;
  outlierMinZ: number;
  percentiles: LabelPercentiles | null;
}

export function fixedThresholds(group: string): LabelThresholds {
  return { group, basis: "fixed", n: 0, ...LABEL_FLOORS, outlierMinZ: OUTLIER_MIN_Z, percentiles: null };
}

/** Linear-interpolation quantile (R type 7) of an ascending sample. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const clamped = Math.max(0, Math.min(1, q));
  const position = (sorted.length - 1) * clamped;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low]!;
  return sorted[low]! + (position - low) * (sorted[high]! - sorted[low]!);
}

export function isLabelPercentiles(value: unknown): value is LabelPercentiles {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const ok = (key: string) => typeof record[key] === "number" && (record[key] as number) > 0 && (record[key] as number) < 1;
  if (!ok("breakout") || !ok("outlier") || !ok("strong")) return false;
  return (record.breakout as number) >= (record.outlier as number) && (record.outlier as number) >= (record.strong as number);
}

/** Parse `0.98,0.95,0.85` (breakout, outlier, strong). */
export function parseLabelPercentiles(text: string): LabelPercentiles | null {
  const parts = text.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const candidate = { breakout: parts[0]!, outlier: parts[1]!, strong: parts[2]! };
  return isLabelPercentiles(candidate) ? candidate : null;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function thresholdsFromSample(
  values: readonly number[],
  percentiles: LabelPercentiles,
  group: string,
  basis: "percentile" | "platform-percentile",
): LabelThresholds {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  return {
    group,
    basis,
    n: sorted.length,
    breakout: round(Math.max(LABEL_FLOORS.breakout, quantile(sorted, percentiles.breakout))),
    outlier: round(Math.max(LABEL_FLOORS.outlier, quantile(sorted, percentiles.outlier))),
    strong: round(Math.max(LABEL_FLOORS.strong, quantile(sorted, percentiles.strong))),
    outlierMinZ: OUTLIER_MIN_Z,
    percentiles: { ...percentiles },
  };
}

export interface CalibrationSample {
  platform: string;
  niche: string;
  multiplier: number;
}

export type ThresholdLookup = ((platform: string, niche: string) => LabelThresholds) & { summary: () => LabelThresholds[] };

/**
 * Build the per platform x niche threshold lookup from the calibration
 * sample (mature, non-thin, non-provisional scored videos).
 */
export function calibrateLabelThresholds(samples: readonly CalibrationSample[], policy: LabelPolicy = DEFAULT_LABEL_POLICY): ThresholdLookup {
  const byGroup = new Map<string, number[]>();
  const byPlatform = new Map<string, number[]>();
  for (const sample of samples) {
    if (!Number.isFinite(sample.multiplier) || sample.multiplier <= 0) continue;
    const group = `${sample.platform}|${sample.niche}`;
    (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push(sample.multiplier);
    (byPlatform.get(sample.platform) ?? byPlatform.set(sample.platform, []).get(sample.platform)!).push(sample.multiplier);
  }
  const cache = new Map<string, LabelThresholds>();
  const lookup = ((platform: string, niche: string) => {
    const group = `${platform}|${niche}`;
    const cached = cache.get(group);
    if (cached) return cached;
    let result: LabelThresholds;
    if (policy.mode === "fixed") result = fixedThresholds(group);
    else {
      const percentiles = policy.overrides?.[niche] ?? policy.percentiles;
      const own = byGroup.get(group) ?? [];
      const platformValues = byPlatform.get(platform) ?? [];
      if (own.length >= policy.minSample) result = thresholdsFromSample(own, percentiles, group, "percentile");
      else if (platformValues.length >= policy.minSample) result = { ...thresholdsFromSample(platformValues, percentiles, `${platform}|*`, "platform-percentile") };
      else result = fixedThresholds(group);
    }
    cache.set(group, result);
    return result;
  }) as ThresholdLookup;
  lookup.summary = () => [...cache.values()].sort((a, b) => a.group.localeCompare(b.group));
  return lookup;
}

/** Label with calibrated thresholds; thin or provisional scores get no label. */
export function labelWithThresholds(
  input: { viewsMultiplier: number; viewsZ: number; thin: boolean; provisional: boolean },
  thresholds: LabelThresholds,
): OutlierLabel | null {
  if (input.thin || input.provisional) return null;
  if (input.viewsMultiplier >= thresholds.breakout) return "breakout";
  if (input.viewsMultiplier >= thresholds.outlier && input.viewsZ >= thresholds.outlierMinZ) return "outlier";
  if (input.viewsMultiplier >= thresholds.strong) return "strong";
  if (input.viewsMultiplier < UNDER_MULTIPLIER) return "under";
  return "normal";
}
