// Method on trial (#578): extreme-value (peaks-over-threshold) breakout
// thresholds per niche, versus the fixed 10x cut and the empirical p98.
// Behind the backtest `--methods gpd` flag only; no default path uses it.
//
// Exceedances of the log multiplier over a high threshold u follow a
// Generalized Pareto distribution GPD(xi, sigma) (Pickands-Balkema-de Haan).
// With zeta = P(X > u), the level exceeded with probability p is
//
//   x_p = u + sigma / xi * ((p / zeta)^(-xi) - 1)      (xi != 0)
//   x_p = u + sigma * ln(zeta / p)                      (xi = 0)
//
// The fit uses probability-weighted moments (Hosking & Wallis 1987), which
// are stable for small samples and valid for xi < 0.5.

export interface GpdFit {
  xi: number;
  sigma: number;
  n: number;
}

/** PWM fit of GPD(xi, sigma) to non-negative exceedances. Null below 10 points or when degenerate. */
export function fitGpd(exceedances: readonly number[]): GpdFit | null {
  const y = exceedances.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const n = y.length;
  if (n < 10) return null;
  let a0 = 0;
  let a1 = 0;
  for (let i = 0; i < n; i += 1) {
    a0 += y[i]!;
    a1 += (y[i]! * (n - 1 - i)) / (n - 1);
  }
  a0 /= n;
  a1 /= n;
  const denominator = a0 - 2 * a1;
  if (!(denominator > 0)) return null;
  const k = a0 / denominator - 2;
  const sigma = (2 * a0 * a1) / denominator;
  if (!(sigma > 0)) return null;
  return { xi: -k, sigma, n };
}

/** Quantile of GPD(xi, sigma) at cumulative probability q. */
export function gpdQuantile(fit: Pick<GpdFit, "xi" | "sigma">, q: number): number {
  const tail = 1 - q;
  if (Math.abs(fit.xi) < 1e-9) return -fit.sigma * Math.log(tail);
  return (fit.sigma / fit.xi) * (Math.pow(tail, -fit.xi) - 1);
}

export interface PotThreshold {
  threshold: number;
  u: number;
  zeta: number;
  fit: GpdFit;
}

/**
 * Peaks-over-threshold level exceeded with probability `exceedance` (e.g.
 * 0.02 for "top 2%"), using exceedances over the `thresholdQuantile`
 * empirical quantile. Null when the tail is too small to fit.
 */
export function potThreshold(values: readonly number[], options: { exceedance?: number; thresholdQuantile?: number; minExceedances?: number } = {}): PotThreshold | null {
  const p = options.exceedance ?? 0.02;
  const q = options.thresholdQuantile ?? 0.9;
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = q * (sorted.length - 1);
  const u = sorted[Math.floor(position)]! + (sorted[Math.ceil(position)]! - sorted[Math.floor(position)]!) * (position - Math.floor(position));
  const exceed = sorted.filter((value) => value > u).map((value) => value - u);
  if (exceed.length < (options.minExceedances ?? 20)) return null;
  const fit = fitGpd(exceed);
  if (!fit) return null;
  const zeta = exceed.length / sorted.length;
  if (p >= zeta) return null;
  const ratio = p / zeta;
  const threshold = Math.abs(fit.xi) < 1e-9 ? u + fit.sigma * Math.log(1 / ratio) : u + (fit.sigma / fit.xi) * (Math.pow(ratio, -fit.xi) - 1);
  return { threshold, u, zeta, fit };
}
