// Method on trial (#578): SIR-style format spread and R0.
// Behind the backtest `--methods sir` flag only; no default path uses it.
//
// A format (or hook, sound, hashtag) spreads through a niche's creators the
// way an infection spreads through a population: a creator "adopts" when it
// first posts the format, stays "infectious" (visible, imitated) for a
// while, and each adopter triggers R further adopters while most creators
// are still susceptible. The estimator is the renewal (Cori-style) form of
// a discrete SIR:
//
//   E[I_t] = R * (S_{t-1} / N) * Lambda_t,   Lambda_t = sum_{s>=1} w_s I_{t-s}
//
// with a geometric generation interval w_s = gamma (1 - gamma)^(s-1) (mean
// infectious period 1 / gamma steps). R > 1 means the format is spreading.

/** w_s = gamma (1 - gamma)^(s-1), s = 1..maxLag, renormalized after truncation. */
export function geometricGeneration(gamma: number, maxLag: number): number[] {
  if (!(gamma > 0 && gamma <= 1)) throw new Error("gamma must be in (0, 1]");
  const raw = Array.from({ length: maxLag }, (_, index) => gamma * Math.pow(1 - gamma, index));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

/** Lambda_t: the infection pressure from past incidence. */
export function infectionPressure(incidence: readonly number[], generation: readonly number[]): number[] {
  return incidence.map((_, t) => {
    let total = 0;
    for (let s = 1; s <= generation.length && s <= t; s += 1) total += generation[s - 1]! * incidence[t - s]!;
    return total;
  });
}

export interface ReproductionEstimate {
  r: number | null;
  /** Gamma-posterior style interval proxy: R * (1 +/- 1.96 / sqrt(cases)). */
  low: number | null;
  high: number | null;
  cases: number;
  pressure: number;
}

/**
 * R over steps [from, to): sum I_t / sum (S_{t-1}/N) Lambda_t. `population`
 * (N) and `initialSusceptible` enable the depletion correction; without
 * them S/N = 1 (early phase).
 */
export function reproductionNumber(input: {
  incidence: readonly number[];
  generation: readonly number[];
  from?: number;
  to?: number;
  population?: number;
  /** Adopters before index 0 (removed from the susceptible pool). */
  priorAdopters?: number;
}): ReproductionEstimate {
  const { incidence, generation } = input;
  const from = Math.max(1, input.from ?? 1);
  const to = Math.min(incidence.length, input.to ?? incidence.length);
  const pressure = infectionPressure(incidence, generation);
  let cumulative = input.priorAdopters ?? 0;
  for (let t = 0; t < from; t += 1) cumulative += incidence[t]!;
  let cases = 0;
  let weighted = 0;
  for (let t = from; t < to; t += 1) {
    const susceptibleShare = input.population ? Math.max(0, input.population - cumulative) / input.population : 1;
    cases += incidence[t]!;
    weighted += susceptibleShare * pressure[t]!;
    cumulative += incidence[t]!;
  }
  if (weighted <= 0) return { r: null, low: null, high: null, cases, pressure: weighted };
  const r = cases / weighted;
  const spread = cases > 0 ? 1.96 / Math.sqrt(cases) : Infinity;
  return { r, low: Math.max(0, r * (1 - spread)), high: Number.isFinite(spread) ? r * (1 + spread) : null, cases, pressure: weighted };
}

/** Daily adoption incidence for one unit: first-use day of each creator, as counts per day from `start`. */
export function adoptionIncidence(firstUse: readonly number[], start: number, days: number, dayMs = 86_400_000): number[] {
  const out = new Array<number>(days).fill(0);
  for (const at of firstUse) {
    const day = Math.floor((at - start) / dayMs);
    if (day >= 0 && day < days) out[day] += 1;
  }
  return out;
}
