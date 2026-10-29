// Method on trial (#578): non-stationary linear Thompson sampling with a
// corpus prior, judged by an offline replay. Behind the backtest
// `--methods bandit` flag only; no default path uses it.
//
// Policy: discounted linear Thompson sampling (the TS form of D-LinUCB,
// Russac et al. 2019). With discount gamma in (0, 1], ridge lambda, and a
// prior mean mu0 learned from the training period,
//
//   V_t = gamma V_{t-1} + x x^T + (1 - gamma) lambda I
//   b_t = gamma b_{t-1} + r x   + (1 - gamma) lambda mu0
//   theta ~ N(V^-1 b, sigma^2 V^-1),  pick argmax_a x_a . theta
//
// so old evidence fades (the niche drifts) and, absent evidence, the
// estimate relaxes to the corpus prior instead of to zero.
//
// Replay (Li et al. 2011): stream logged events in time order; when the
// policy picks the arm that was actually posted, it observes that reward and
// learns. Unbiased when logging was uniform over arms; with known logging
// propensities the self-normalized IPS mean corrects for creators' own
// choices (an approximation: corpus propensities are estimated).

import type { Prng } from "../../prng.js";

export function gaussian(prng: Prng): number {
  let u = 0;
  while (u <= 1e-12) u = prng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * prng.next());
}

/** Lower-triangular L with A = L L^T, or null when A is not positive definite. */
export function cholesky(a: readonly number[][]): number[][] | null {
  const n = a.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = a[i]![j]!;
      for (let k = 0; k < j; k += 1) sum -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (sum <= 0) return null;
        l[i]![i] = Math.sqrt(sum);
      } else {
        l[i]![j] = sum / l[j]![j]!;
      }
    }
  }
  return l;
}

/** Solve (L L^T) x = b. */
function choleskySolve(l: readonly number[][], b: readonly number[]): number[] {
  const n = l.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let sum = b[i]!;
    for (let k = 0; k < i; k += 1) sum -= l[i]![k]! * y[k]!;
    y[i] = sum / l[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k += 1) sum -= l[k]![i]! * x[k]!;
    x[i] = sum / l[i]![i]!;
  }
  return x;
}

/** Solve L^T x = z (back substitution): x has covariance (L L^T)^-1 when z ~ N(0, I). */
function backSolveTranspose(l: readonly number[][], z: readonly number[]): number[] {
  const n = l.length;
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = z[i]!;
    for (let k = i + 1; k < n; k += 1) sum -= l[k]![i]! * x[k]!;
    x[i] = sum / l[i]![i]!;
  }
  return x;
}

export interface Policy {
  readonly name: string;
  choose(arms: ReadonlyArray<readonly number[]>, prng: Prng): number;
  update(x: readonly number[], reward: number): void;
}

export interface LinTsOptions {
  dimension: number;
  /** 1 = stationary; < 1 forgets old evidence. */
  gamma?: number;
  lambda?: number;
  /** Posterior scale (reward noise sd). */
  sigma?: number;
  priorMean?: readonly number[];
}

export function discountedLinTs(options: LinTsOptions): Policy & { mean(): number[] } {
  const d = options.dimension;
  const gamma = options.gamma ?? 1;
  const lambda = options.lambda ?? 1;
  const sigma = options.sigma ?? 0.5;
  const prior = options.priorMean ?? new Array<number>(d).fill(0);
  const v = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? lambda : 0)));
  const b = prior.map((value) => lambda * value);
  const solve = () => {
    const l = cholesky(v)!;
    return { l, mu: choleskySolve(l, b) };
  };
  return {
    name: gamma < 1 ? `lin-ts(gamma=${gamma})` : "lin-ts(stationary)",
    mean: () => solve().mu,
    choose(arms, prng) {
      const { l, mu } = solve();
      const z = Array.from({ length: d }, () => gaussian(prng));
      const noise = backSolveTranspose(l, z);
      const theta = mu.map((value, i) => value + sigma * noise[i]!);
      let best = 0;
      let bestValue = -Infinity;
      arms.forEach((x, index) => {
        let value = 0;
        for (let i = 0; i < d; i += 1) value += x[i]! * theta[i]!;
        if (value > bestValue) {
          bestValue = value;
          best = index;
        }
      });
      return best;
    },
    update(x, reward) {
      for (let i = 0; i < d; i += 1) {
        for (let j = 0; j < d; j += 1) v[i]![j] = gamma * v[i]![j]! + x[i]! * x[j]! + (i === j ? (1 - gamma) * lambda : 0);
        b[i] = gamma * b[i]! + reward * x[i]! + (1 - gamma) * lambda * prior[i]!;
      }
    },
  };
}

export function fixedPolicy(arm: number, name = `fixed(${arm})`): Policy {
  return { name, choose: () => arm, update: () => {} };
}

export function uniformPolicy(): Policy {
  return { name: "uniform", choose: (arms, prng) => Math.floor(prng.next() * arms.length), update: () => {} };
}

export interface ReplayEvent {
  /** Feature vector of every candidate arm at this event. */
  arms: ReadonlyArray<readonly number[]>;
  /** Index of the arm that was actually posted. */
  logged: number;
  reward: number;
  /** Logging propensity of the posted arm (default: uniform 1 / arms). */
  propensity?: number;
}

export interface ReplayResult {
  policy: string;
  matched: number;
  events: number;
  /** Self-normalized IPS mean reward over matched events. */
  meanReward: number | null;
}

export function replay(events: readonly ReplayEvent[], policy: Policy, prng: Prng): ReplayResult {
  let matched = 0;
  let weighted = 0;
  let weights = 0;
  for (const event of events) {
    const pick = policy.choose(event.arms, prng);
    if (pick !== event.logged) continue;
    matched += 1;
    const propensity = event.propensity ?? 1 / event.arms.length;
    const weight = 1 / Math.max(propensity, 1e-6);
    weighted += weight * event.reward;
    weights += weight;
    policy.update(event.arms[pick]!, event.reward);
  }
  return { policy: policy.name, matched, events: events.length, meanReward: weights > 0 ? weighted / weights : null };
}

/** One-hot arm features (arm i of k). */
export function oneHotArms(k: number): number[][] {
  return Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
}
