// Method on trial (#578): lead-lag trendsetter detection. Behind the
// backtest `--methods lead-lag` flag only; no default path uses it.
//
// Two pieces:
// - `crossCorrelationLag`: the lag at which series x best predicts series y
//   (positive lag: x leads y), for niche-level series such as daily
//   adoption counts in two languages or platforms.
// - `trendsetterScores`: per creator, how early it adopts content units
//   (formats, hooks, sounds, hashtags) relative to the other adopters of the
//   same unit. lead = 1 - mean percentile of its first-use time among the
//   unit's adopters; 0.5 is what chance gives, so z = (lead - 0.5) / se with
//   se = sqrt(1/12 / units) (the uniform percentile's sd).

export function crossCorrelationLag(x: readonly number[], y: readonly number[], maxLag: number): { lag: number; correlation: number } | null {
  const n = Math.min(x.length, y.length);
  let best: { lag: number; correlation: number } | null = null;
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const a: number[] = [];
    const b: number[] = [];
    for (let t = 0; t < n; t += 1) {
      const u = t + lag;
      if (u < 0 || u >= n) continue;
      a.push(x[t]!);
      b.push(y[u]!);
    }
    if (a.length < 5) continue;
    const ma = a.reduce((sum, value) => sum + value, 0) / a.length;
    const mb = b.reduce((sum, value) => sum + value, 0) / b.length;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < a.length; i += 1) {
      sab += (a[i]! - ma) * (b[i]! - mb);
      saa += (a[i]! - ma) ** 2;
      sbb += (b[i]! - mb) ** 2;
    }
    if (saa <= 0 || sbb <= 0) continue;
    const correlation = sab / Math.sqrt(saa * sbb);
    if (!best || correlation > best.correlation) best = { lag, correlation };
  }
  return best;
}

export interface Adoption {
  creatorId: string;
  unit: string;
  at: number;
}

export interface TrendsetterScore {
  creatorId: string;
  lead: number;
  z: number;
  units: number;
}

/**
 * First-use percentile of each creator inside each unit's adopter list
 * (units with at least `minAdopters` creators), averaged per creator.
 * Creators with fewer than `minUnits` qualifying units are omitted.
 */
export function trendsetterScores(adoptions: readonly Adoption[], options: { minAdopters?: number; minUnits?: number } = {}): TrendsetterScore[] {
  const minAdopters = options.minAdopters ?? 5;
  const minUnits = options.minUnits ?? 3;
  const firstUse = new Map<string, Map<string, number>>();
  for (const adoption of adoptions) {
    const byCreator = firstUse.get(adoption.unit) ?? firstUse.set(adoption.unit, new Map()).get(adoption.unit)!;
    const current = byCreator.get(adoption.creatorId);
    if (current === undefined || adoption.at < current) byCreator.set(adoption.creatorId, adoption.at);
  }
  const percentiles = new Map<string, number[]>();
  for (const byCreator of firstUse.values()) {
    if (byCreator.size < minAdopters) continue;
    const ordered = [...byCreator.entries()].sort((a, b) => a[1] - b[1]);
    // Ties share the mean position.
    let i = 0;
    while (i < ordered.length) {
      let j = i;
      while (j + 1 < ordered.length && ordered[j + 1]![1] === ordered[i]![1]) j += 1;
      const percentile = ((i + j) / 2) / (ordered.length - 1);
      for (let index = i; index <= j; index += 1) {
        const creatorId = ordered[index]![0];
        (percentiles.get(creatorId) ?? percentiles.set(creatorId, []).get(creatorId)!).push(percentile);
      }
      i = j + 1;
    }
  }
  const out: TrendsetterScore[] = [];
  for (const [creatorId, list] of percentiles) {
    if (list.length < minUnits) continue;
    const lead = 1 - list.reduce((sum, value) => sum + value, 0) / list.length;
    out.push({ creatorId, lead, z: (lead - 0.5) / Math.sqrt(1 / 12 / list.length), units: list.length });
  }
  return out.sort((a, b) => b.z - a.z || a.creatorId.localeCompare(b.creatorId));
}
