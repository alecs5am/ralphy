// Backtest statistics (#578): rank correlation, top-k metrics, a paired
// cluster bootstrap for relative lift, and the pre-registered adoption rule.

import { makePrng } from "../../prng.js";

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function quantileOf(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}

/** Average ranks (1-based), ties share the mean rank. */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k]!.index] = rank;
    i = j + 1;
  }
  return out;
}

export function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = mean(x.slice(0, n))!;
  const my = mean(y.slice(0, n))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Spearman rank correlation (the information coefficient). */
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  return pearson(ranks(x), ranks(y));
}

export interface RankedItem {
  score: number;
  positive: boolean;
  /** Group for per-period top-k (e.g. decision week). */
  group: string;
}

/**
 * Per-group top-k: rank inside each group, take the top k, and pool hits.
 * precision = hits / picks; recall = hits / positives (all groups).
 */
export function topK(items: readonly RankedItem[], k: number): { precision: number | null; recall: number | null; picks: number; hits: number; positives: number } {
  const groups = new Map<string, RankedItem[]>();
  for (const item of items) (groups.get(item.group) ?? groups.set(item.group, []).get(item.group)!).push(item);
  let picks = 0;
  let hits = 0;
  let positives = 0;
  for (const list of groups.values()) {
    positives += list.filter((item) => item.positive).length;
    const top = [...list].sort((a, b) => b.score - a.score).slice(0, k);
    picks += top.length;
    hits += top.filter((item) => item.positive).length;
  }
  return { precision: picks > 0 ? hits / picks : null, recall: positives > 0 ? hits / positives : null, picks, hits, positives };
}

export interface LiftInterval {
  /** Relative lift (method - baseline) / |baseline| on the full sample. */
  lift: number | null;
  low: number | null;
  high: number | null;
  method: number | null;
  baseline: number | null;
  replicates: number;
  /** Replicates where the baseline statistic was 0 or undefined (skipped). */
  skipped: number;
}

/**
 * Paired cluster bootstrap of the relative lift. `clusters` lists the
 * resampling units (creators, so correlated videos move together); `stat`
 * computes the method and baseline statistics on a resample given as a list
 * of cluster indices (with repeats). Percentile interval.
 */
export function bootstrapLift(input: {
  clusters: number;
  stat: (sample: readonly number[]) => { method: number | null; baseline: number | null };
  replicates?: number;
  seed?: number | string;
  alpha?: number;
}): LiftInterval {
  const replicates = input.replicates ?? 500;
  const alpha = input.alpha ?? 0.05;
  const all = Array.from({ length: input.clusters }, (_, index) => index);
  const full = input.stat(all);
  const relative = (method: number | null, baseline: number | null) =>
    method === null || baseline === null || baseline === 0 ? null : (method - baseline) / Math.abs(baseline);
  const lift = relative(full.method, full.baseline);
  if (input.clusters < 2) return { lift, low: null, high: null, method: full.method, baseline: full.baseline, replicates: 0, skipped: 0 };
  const prng = makePrng(input.seed ?? "bootstrap-578");
  const values: number[] = [];
  let skipped = 0;
  for (let r = 0; r < replicates; r += 1) {
    const sample = new Array<number>(input.clusters);
    for (let i = 0; i < input.clusters; i += 1) sample[i] = Math.floor(prng.next() * input.clusters);
    const result = input.stat(sample);
    const value = relative(result.method, result.baseline);
    if (value === null || !Number.isFinite(value)) skipped += 1;
    else values.push(value);
  }
  return {
    lift,
    low: quantileOf(values, alpha / 2),
    high: quantileOf(values, 1 - alpha / 2),
    method: full.method,
    baseline: full.baseline,
    replicates: values.length,
    skipped,
  };
}

// ─── Pre-registered adoption rule ──────────────────────────────────────────

/** Default margin set before any test: 10% relative on the task metric. */
export const DEFAULT_ADOPTION_MARGIN = 0.1;

export type RuleOutcome = "insufficient-data" | "passes" | "fails";

/**
 * The #578 rule: a method passes only when its out-of-sample relative lift
 * over the best simple baseline is at least the margin AND the bootstrap
 * interval excludes zero. Passing is necessary for `adopt`, not sufficient
 * (cost and the owner's review decide); a preliminary run never passes.
 */
export function adoptionRule(interval: LiftInterval, options: { margin?: number; preliminary?: boolean; minReplicates?: number } = {}): RuleOutcome {
  const margin = options.margin ?? DEFAULT_ADOPTION_MARGIN;
  if (interval.lift === null || interval.low === null || interval.high === null) return "insufficient-data";
  if (interval.replicates < (options.minReplicates ?? 100)) return "insufficient-data";
  if (options.preliminary) return "insufficient-data";
  return interval.lift >= margin && interval.low > 0 ? "passes" : "fails";
}
