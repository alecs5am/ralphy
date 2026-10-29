// Method on trial (#578): Hawkes branching ratio from early checkpoints.
// Behind the backtest `--methods hawkes` flag only; no default path uses it.
//
// Model: a discrete-time Hawkes (Poisson autoregression) on binned view
// increments,
//
//   lambda_k = mu * g_k + n * sum_{j>=1} phi_j * N_{k-j},   sum phi = 1,
//
// where g is the exogenous (platform push) profile, phi the offspring delay
// kernel, and n the branching ratio (expected views each view triggers).
// n < 1 is subcritical; the expected total is immigrants / (1 - n).
//
// Two estimators:
// - `fitDiscreteHawkes`: the MLE of the Poisson autoregression on a fully
//   binned count series (EM warm start, then damped Newton).
// - `fitHawkesCheckpoints`: from 2-4 cumulative checkpoints (6 h / 24 h /
//   48 h), a least-squares fit of the mean curve with a pulse of immigrants
//   and a known kernel; returns n and the projected 28-day total (the
//   SEISMIC-style early estimate).

export interface HawkesFit {
  n: number;
  mu: number;
  iterations: number;
  converged: boolean;
}

/** phi_j proportional to decay^(j-1), j = 1..length, normalized to sum 1. */
export function geometricKernel(decay: number, length: number): number[] {
  if (!(decay >= 0 && decay < 1)) throw new Error("kernel decay must be in [0, 1)");
  const raw = Array.from({ length }, (_, index) => Math.pow(decay, index));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

/** e_k = sum_j phi_j * N_{k-j}: the excitation each bin receives from the past. */
export function excitation(counts: readonly number[], kernel: readonly number[]): number[] {
  const out = new Array<number>(counts.length).fill(0);
  for (let k = 0; k < counts.length; k += 1) {
    let total = 0;
    for (let j = 1; j <= kernel.length && j <= k; j += 1) total += kernel[j - 1]! * counts[k - j]!;
    out[k] = total;
  }
  return out;
}

export function fitDiscreteHawkes(
  counts: readonly number[],
  kernel: readonly number[],
  options: { exogenous?: readonly number[]; maxIterations?: number; tolerance?: number } = {},
): HawkesFit {
  const e = excitation(counts, kernel);
  const g = counts.map((_, k) => options.exogenous?.[k] ?? 1);
  const gTotal = g.reduce((sum, value) => sum + value, 0);
  const exposure = e.reduce((sum, value) => sum + value, 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const logLik = (mu: number, n: number): number => {
    let value = 0;
    for (let k = 0; k < counts.length; k += 1) {
      const lambda = mu * g[k]! + n * e[k]!;
      if (lambda <= 0) {
        if (counts[k]! > 0) return -Infinity;
        continue;
      }
      value += counts[k]! * Math.log(lambda) - lambda;
    }
    return value;
  };
  // A few EM steps for a safe start (EM keeps both parameters positive) ...
  let n = 0.5;
  let mu = Math.max((total / Math.max(gTotal, 1e-12)) * (1 - n), 1e-9);
  for (let step = 0; step < 25; step += 1) {
    let immigrants = 0;
    let offspring = 0;
    for (let k = 0; k < counts.length; k += 1) {
      const count = counts[k]!;
      if (count <= 0) continue;
      const base = mu * g[k]!;
      const excited = n * e[k]!;
      const lambda = base + excited;
      if (lambda <= 0) continue;
      immigrants += (count * base) / lambda;
      offspring += (count * excited) / lambda;
    }
    mu = Math.max(gTotal > 0 ? immigrants / gTotal : mu, 1e-12);
    n = exposure > 0 ? Math.min(0.999, offspring / exposure) : 0;
  }
  // ... then damped Newton on the (concave) Poisson log-likelihood.
  const maxIterations = options.maxIterations ?? 200;
  const tolerance = options.tolerance ?? 1e-10;
  let current = logLik(mu, n);
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIterations; iterations += 1) {
    let gm = 0;
    let gn = 0;
    let hmm = 0;
    let hmn = 0;
    let hnn = 0;
    for (let k = 0; k < counts.length; k += 1) {
      const lambda = mu * g[k]! + n * e[k]!;
      if (lambda <= 0) continue;
      const ratio = counts[k]! / lambda;
      gm += (ratio - 1) * g[k]!;
      gn += (ratio - 1) * e[k]!;
      const curvature = counts[k]! / (lambda * lambda);
      hmm -= curvature * g[k]! * g[k]!;
      hmn -= curvature * g[k]! * e[k]!;
      hnn -= curvature * e[k]! * e[k]!;
    }
    const det = hmm * hnn - hmn * hmn;
    if (!(det > 0)) break;
    const dMu = -(hnn * gm - hmn * gn) / det;
    const dN = -(-hmn * gm + hmm * gn) / det;
    let scale = 1;
    let accepted = false;
    for (let halving = 0; halving < 40; halving += 1) {
      const nextMu = mu + scale * dMu;
      const nextN = Math.min(0.999, Math.max(0, n + scale * dN));
      if (nextMu > 0) {
        const value = logLik(nextMu, nextN);
        if (value >= current - 1e-12) {
          const change = Math.abs(nextN - n) + Math.abs(nextMu - mu) / Math.max(mu, 1e-9);
          mu = nextMu;
          n = nextN;
          current = value;
          accepted = true;
          if (change < tolerance) converged = true;
          break;
        }
      }
      scale /= 2;
    }
    if (!accepted || converged) {
      converged = true;
      break;
    }
  }
  return { n, mu, iterations, converged };
}

/**
 * Mean cumulative curve of the discrete process for one immigrant arriving
 * with profile `g` (default: a pulse in bin 0), up to `bins` bins.
 */
export function meanCumulative(n: number, kernel: readonly number[], bins: number, exogenous: readonly number[] = [1]): number[] {
  const m = new Array<number>(bins).fill(0);
  const cumulative = new Array<number>(bins).fill(0);
  let running = 0;
  for (let k = 0; k < bins; k += 1) {
    let excited = 0;
    for (let j = 1; j <= kernel.length && j <= k; j += 1) excited += kernel[j - 1]! * m[k - j]!;
    m[k] = (exogenous[k] ?? 0) + n * excited;
    running += m[k]!;
    cumulative[k] = running;
  }
  return cumulative;
}

export interface CheckpointPoint {
  ageHours: number;
  views: number;
}

export interface HawkesCheckpointFit {
  n: number;
  immigrants: number;
  /** Projected cumulative views at `horizonHours`. */
  projected: number;
  loss: number;
  points: number;
}

export interface HawkesCheckpointOptions {
  binHours?: number;
  /** Offspring delay kernel per bin (default: geometric, mean delay ~12 h). */
  kernel?: readonly number[];
  horizonHours?: number;
  /** Grid step for n in [0, maxN]. */
  step?: number;
  maxN?: number;
}

export const DEFAULT_HAWKES_BIN_HOURS = 1;
export const DEFAULT_HAWKES_KERNEL = geometricKernel(11 / 12, 240);

const SHAPE_CACHE = new WeakMap<readonly number[], Map<string, Array<{ n: number; shape: number[] }>>>();

/** Mean cumulative shapes for every grid value of n, cached per kernel (they do not depend on the video). */
function shapeTable(kernel: readonly number[], bins: number, step: number, maxN: number): Array<{ n: number; shape: number[] }> {
  const byKey = SHAPE_CACHE.get(kernel) ?? new Map<string, Array<{ n: number; shape: number[] }>>();
  SHAPE_CACHE.set(kernel, byKey);
  const key = `${bins}|${step}|${maxN}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const table: Array<{ n: number; shape: number[] }> = [];
  for (let index = 0; index * step <= maxN + 1e-9; index += 1) {
    const n = index * step;
    table.push({ n, shape: meanCumulative(n, kernel, bins) });
  }
  byKey.set(key, table);
  return table;
}

/**
 * Fit (immigrants, n) to 2+ cumulative checkpoints by grid search on n and
 * closed-form log least squares for the immigrant count. Returns null with
 * fewer than two usable points (age > 0, views > 0, distinct bins).
 */
export function fitHawkesCheckpoints(points: readonly CheckpointPoint[], options: HawkesCheckpointOptions = {}): HawkesCheckpointFit | null {
  const binHours = options.binHours ?? DEFAULT_HAWKES_BIN_HOURS;
  const kernel = options.kernel ?? DEFAULT_HAWKES_KERNEL;
  const horizonHours = options.horizonHours ?? 28 * 24;
  const usable = new Map<number, number>();
  for (const point of points) {
    if (!(point.ageHours > 0) || !(point.views > 0)) continue;
    const bin = Math.max(0, Math.floor(point.ageHours / binHours) - 1);
    usable.set(bin, Math.max(usable.get(bin) ?? 0, point.views));
  }
  if (usable.size < 2) return null;
  const observed = [...usable.entries()].sort((a, b) => a[0] - b[0]);
  const horizonBin = Math.max(1, Math.round(horizonHours / binHours));
  const bins = Math.max(horizonBin, observed[observed.length - 1]![0] + 1);
  const step = options.step ?? 0.01;
  const maxN = options.maxN ?? 0.99;
  let best: HawkesCheckpointFit | null = null;
  for (const { n, shape } of shapeTable(kernel, bins, step, maxN)) {
    let logOffset = 0;
    for (const [bin, views] of observed) logOffset += Math.log(views) - Math.log(shape[bin]!);
    logOffset /= observed.length;
    let loss = 0;
    for (const [bin, views] of observed) {
      const residual = Math.log(views) - (logOffset + Math.log(shape[bin]!));
      loss += residual * residual;
    }
    if (!best || loss < best.loss - 1e-12) {
      const immigrants = Math.exp(logOffset);
      best = { n: Math.round(n * 1000) / 1000, immigrants, projected: immigrants * shape[horizonBin - 1]!, loss, points: observed.length };
    }
  }
  return best;
}
