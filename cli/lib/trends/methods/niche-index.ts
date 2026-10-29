// Method on trial (#578): niche index normalization (creator beta).
// Behind the backtest `--methods niche-index` flag only.
//
// The niche moves as a whole (platform-wide reach shifts, seasonality). A
// creator's log views are modeled as
//
//   x_cj = a_c + beta_c * I_day(j) + e_cj
//
// where I is the niche index (the day's median creator-relative residual)
// and beta_c the creator's sensitivity to it, as a stock's beta to the
// market. Pass creator-relative residuals (log multipliers against each
// creator's rolling baseline, `demean: "none"`) on real data: regressing
// raw levels on a random-walk index picks up the creator's own drift as a
// spurious beta. `demean: "creator-median"` is for stationary creators. The normalized residual x - a - beta * I says how much a video beat
// its creator AFTER the niche-wide move, so a niche-wide reach surge does not
// read as many breakouts at once. beta is shrunk toward 1 for creators with
// little data.

export interface IndexPoint {
  creatorId: string;
  day: number;
  value: number;
}

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Creator-demeaned residuals: value minus the creator's median. */
export function creatorResiduals(points: readonly IndexPoint[]): Array<IndexPoint & { residual: number }> {
  const byCreator = new Map<string, number[]>();
  for (const point of points) (byCreator.get(point.creatorId) ?? byCreator.set(point.creatorId, []).get(point.creatorId)!).push(point.value);
  const centers = new Map([...byCreator].map(([creatorId, values]) => [creatorId, median(values)!]));
  return points.map((point) => ({ ...point, residual: point.value - centers.get(point.creatorId)! }));
}

export type Demean = "creator-median" | "none";

const residualsOf = (points: readonly IndexPoint[], demean: Demean, clip: number) =>
  (demean === "none" ? points.map((point) => ({ ...point, residual: point.value })) : creatorResiduals(points))
    .map((point) => ({ ...point, residual: Math.max(-clip, Math.min(clip, point.residual)) }));

/**
 * Daily niche index: median residual per day (days with fewer than
 * `minPerDay` points carry the previous value), centered to median 0.
 */
export function nicheIndex(points: readonly IndexPoint[], options: { minPerDay?: number; demean?: Demean; clip?: number } = {}): Map<number, number> {
  const minPerDay = options.minPerDay ?? 3;
  const byDay = new Map<number, number[]>();
  for (const point of residualsOf(points, options.demean ?? "creator-median", options.clip ?? Infinity)) (byDay.get(point.day) ?? byDay.set(point.day, []).get(point.day)!).push(point.residual);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const raw = new Map<number, number>();
  let previous = 0;
  for (let day = days[0] ?? 0; day <= (days[days.length - 1] ?? -1); day += 1) {
    const values = byDay.get(day) ?? [];
    if (values.length >= minPerDay) previous = median(values)!;
    raw.set(day, previous);
  }
  const center = median([...raw.values()]) ?? 0;
  return new Map([...raw].map(([day, value]) => [day, value - center]));
}

export interface CreatorBeta {
  beta: number;
  /** Unshrunk OLS slope (null when the index has no variance over the creator's days). */
  raw: number | null;
  n: number;
}

/**
 * beta_c by least squares of the creator's residuals on the index, shrunk
 * toward 1: (Sxy + lambda) / (Sxx + lambda) with Sxx the index variance mass.
 */
export function creatorBetas(points: readonly IndexPoint[], index: ReadonlyMap<number, number>, options: { shrinkage?: number; demean?: Demean; clip?: number } = {}): Map<string, CreatorBeta> {
  const lambda = options.shrinkage ?? 1;
  const byCreator = new Map<string, Array<{ x: number; y: number }>>();
  for (const point of residualsOf(points, options.demean ?? "creator-median", options.clip ?? Infinity)) {
    const x = index.get(point.day);
    if (x === undefined) continue;
    (byCreator.get(point.creatorId) ?? byCreator.set(point.creatorId, []).get(point.creatorId)!).push({ x, y: point.residual });
  }
  const out = new Map<string, CreatorBeta>();
  for (const [creatorId, pairs] of byCreator) {
    const mx = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
    const my = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
    let sxx = 0;
    let sxy = 0;
    for (const pair of pairs) {
      sxx += (pair.x - mx) * (pair.x - mx);
      sxy += (pair.x - mx) * (pair.y - my);
    }
    out.set(creatorId, { beta: (sxy + lambda) / (sxx + lambda), raw: sxx > 0 ? sxy / sxx : null, n: pairs.length });
  }
  return out;
}

/** Niche-normalized value: x - beta * I(day). */
export function normalize(value: number, beta: number, indexValue: number): number {
  return value - beta * indexValue;
}
