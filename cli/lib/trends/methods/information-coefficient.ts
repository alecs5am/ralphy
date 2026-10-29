// Method on trial (#578): information coefficient per signal with monthly
// decay. Behind the backtest `--methods ic` flag only.
//
// IC = Spearman rank correlation between a signal's value at decision time
// and the realized outcome (log 28-day multiplier). Computed per calendar
// month of the decision, then fit IC_m = IC_0 * exp(-lambda * m) by least
// squares on ln IC (months with IC > 0 only): the half-life ln 2 / lambda
// says how fast the signal stops working as the niche adapts. A negative
// lambda (IC rising) reports no half-life.

import { spearman } from "../backtest/stats.js";

export interface IcObservation {
  at: number;
  signal: number;
  outcome: number;
}

export interface MonthlyIc {
  month: string;
  index: number;
  ic: number | null;
  n: number;
}

const monthKey = (at: number) => new Date(at).toISOString().slice(0, 7);

export function monthlyIc(observations: readonly IcObservation[], options: { minPerMonth?: number } = {}): MonthlyIc[] {
  const minPerMonth = options.minPerMonth ?? 30;
  const byMonth = new Map<string, IcObservation[]>();
  for (const observation of observations) (byMonth.get(monthKey(observation.at)) ?? byMonth.set(monthKey(observation.at), []).get(monthKey(observation.at))!).push(observation);
  const months = [...byMonth.keys()].sort();
  if (months.length === 0) return [];
  const [y0, m0] = months[0]!.split("-").map(Number) as [number, number];
  return months.map((month) => {
    const list = byMonth.get(month)!;
    const [y, m] = month.split("-").map(Number) as [number, number];
    return {
      month,
      index: (y - y0) * 12 + (m - m0),
      ic: list.length >= minPerMonth ? spearman(list.map((item) => item.signal), list.map((item) => item.outcome)) : null,
      n: list.length,
    };
  });
}

export interface IcDecay {
  ic0: number | null;
  lambda: number | null;
  halfLifeMonths: number | null;
  months: number;
}

/** Log-linear fit of IC over month index (needs at least 3 months with IC > 0). */
export function icDecay(months: readonly MonthlyIc[]): IcDecay {
  const usable = months.filter((month): month is MonthlyIc & { ic: number } => month.ic !== null && month.ic > 0);
  if (usable.length < 3) return { ic0: null, lambda: null, halfLifeMonths: null, months: usable.length };
  const xs = usable.map((month) => month.index);
  const ys = usable.map((month) => Math.log(month.ic));
  const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (sxx === 0) return { ic0: null, lambda: null, halfLifeMonths: null, months: usable.length };
  const slope = sxy / sxx;
  const lambda = -slope;
  return {
    ic0: Math.exp(my - slope * mx),
    lambda,
    halfLifeMonths: lambda > 0 ? Math.log(2) / lambda : null,
    months: usable.length,
  };
}
