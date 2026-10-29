// Synthetic trend corpus for #578 tests (seeded, deterministic). It produces
// creators, videos, metric snapshots on the checkpoint schedule, and daily
// follower snapshots, with PLANTED effects whose true values are returned in
// `truth`, so every method has a ground truth to recover:
//
// - creator beta to a per-niche index (niche-index normalization)
// - creator level drift as a random walk (Kalman baseline)
// - per-video branching ratio n shaping the view curve (Hawkes)
// - planted breakouts (early-breakout task labels)
// - post-hit halo h0 * exp(-delta / tau) (halo correction)
// - per-creator follow conversion per 1k views (follower deltas)
// - format adoption by a discrete SIR among creators with known R0, seeded
//   by planted trendsetters (SIR spread, lead-lag), and a format effect on
//   views correlated with R0 (copyability / transfer)
// - novel hashtags with a planted view bonus (KL novelty)
//
// Also exports the process simulators the method tests use directly.

import { makePrng, type Prng } from "../../prng.js";
import { DAY_MS, HOUR_MS } from "../math.js";
import { geometricKernel, meanCumulative } from "../methods/hawkes.js";
import type { BacktestCorpus, BtCreator, BtCreatorSnapshot, BtSnapshot, BtVideo } from "./corpus.js";

// ─── Samplers ──────────────────────────────────────────────────────────────

export function normal(prng: Prng, mean = 0, sd = 1): number {
  let u = 0;
  while (u <= 1e-12) u = prng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * prng.next());
}

export function poisson(prng: Prng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda > 40) return Math.max(0, Math.round(normal(prng, lambda, Math.sqrt(lambda))));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= prng.next();
  } while (p > limit);
  return k - 1;
}

export function binomial(prng: Prng, trials: number, p: number): number {
  if (trials <= 0 || p <= 0) return 0;
  if (p >= 1) return trials;
  if (trials > 60) return Math.min(trials, Math.max(0, Math.round(normal(prng, trials * p, Math.sqrt(trials * p * (1 - p))))));
  let count = 0;
  for (let i = 0; i < trials; i += 1) if (prng.next() < p) count += 1;
  return count;
}

// ─── Process simulators ────────────────────────────────────────────────────

/** Discrete Hawkes: N_k ~ Poisson(mu_k + n * sum phi_j N_{k-j}). */
export function simulateDiscreteHawkes(input: { steps: number; mu: number | readonly number[]; n: number; kernel: readonly number[]; prng: Prng }): number[] {
  const counts: number[] = [];
  for (let k = 0; k < input.steps; k += 1) {
    let excited = 0;
    for (let j = 1; j <= input.kernel.length && j <= k; j += 1) excited += input.kernel[j - 1]! * counts[k - j]!;
    const mu = typeof input.mu === "number" ? input.mu : (input.mu[k] ?? 0);
    counts.push(poisson(input.prng, mu + input.n * excited));
  }
  return counts;
}

/**
 * Discrete stochastic SIR. incidence[0] = initial infecteds; incidence[t]
 * (t >= 1) = new infections during step t from the infectious set, each new
 * case infectious from the next step and recovering with probability gamma
 * per step. R0 = beta / gamma.
 */
export function simulateSir(input: { population: number; beta: number; gamma: number; initial: number; steps: number; prng: Prng }): { incidence: number[]; susceptible: number[] } {
  let susceptible = input.population - input.initial;
  let infectious = input.initial;
  const incidence = [input.initial];
  const susceptibleSeries = [susceptible];
  for (let t = 1; t < input.steps; t += 1) {
    const pressure = 1 - Math.exp((-input.beta * infectious) / input.population);
    const cases = binomial(input.prng, susceptible, pressure);
    const recovered = binomial(input.prng, infectious, input.gamma);
    susceptible -= cases;
    infectious += cases - recovered;
    incidence.push(cases);
    susceptibleSeries.push(susceptible);
  }
  return { incidence, susceptible: susceptibleSeries };
}

// ─── Corpus generator ──────────────────────────────────────────────────────

export interface SyntheticOptions {
  seed?: number | string;
  creators?: number;
  /** Days of observation (snapshots) after `start`. */
  days?: number;
  /** Days of backfill posting before `start`. */
  backfillDays?: number;
  start?: number;
  postsPerWeek?: number;
  breakoutRate?: number;
  niches?: string[];
  trendsetters?: number;
  /** Planted halo after a breakout. */
  halo?: { h0: number; tauDays: number };
}

export interface SyntheticTruth {
  creatorBeta: Map<string, number>;
  creatorConversionPer1k: Map<string, number>;
  creatorFollowers0: Map<string, number>;
  nicheIndex: Map<string, Map<number, number>>;
  branching: Map<string, number>;
  breakouts: Set<string>;
  halo: { h0: number; tauDays: number };
  trendsetters: Set<string>;
  formatR0: Map<string, number>;
  formatEffect: Map<string, number>;
  formatStartDay: Map<string, number>;
  novelVideos: Set<string>;
  /** Planted log mature views (ln of the 28-day value) per video. */
  logMature: Map<string, number>;
  levelDrift: number;
  /** Share of the 28-day value at an age (the normal-video view curve, n = 0.4). */
  maturity: (ageHours: number) => number;
}

export const SYNTHETIC_CHECKPOINT_AGES_HOURS = [3, 14, 36, 60, 110, 230, 460, 740] as const;
export const SYNTHETIC_FORMATS = ["listicle", "pov", "green-screen", "skit", "screen-recording", "before-after"] as const;
const SYNTHETIC_R0 = [0.8, 1.2, 1.6, 2.0, 2.4, 2.8];
const SYNTHETIC_GAMMA = 0.15;
const KERNEL = geometricKernel(11 / 12, 240);
const NORMAL_N = [0.3, 0.4, 0.5];
const BREAKOUT_N = [0.8, 0.85, 0.9];

export function generateSyntheticCorpus(options: SyntheticOptions = {}): { corpus: BacktestCorpus; truth: SyntheticTruth } {
  const prng = makePrng(options.seed ?? "synthetic-578");
  const creatorsN = options.creators ?? 80;
  const days = options.days ?? 70;
  const backfillDays = options.backfillDays ?? 45;
  const start = options.start ?? Date.UTC(2026, 8, 1);
  const postsPerWeek = options.postsPerWeek ?? 4;
  const breakoutRate = options.breakoutRate ?? 0.04;
  const niches = options.niches ?? ["alpha", "beta"];
  const halo = options.halo ?? { h0: 0.7, tauDays: 6 };
  const end = start + days * DAY_MS;
  const firstDay = -backfillDays;
  const totalBins = (backfillDays + days + 2) * 24;
  const shapes = new Map<number, number[]>();
  for (const n of [...NORMAL_N, ...BREAKOUT_N]) shapes.set(n, meanCumulative(n, KERNEL, totalBins));
  const shapeAt = (n: number, ageHours: number) => {
    const shape = shapes.get(n)!;
    const bin = Math.max(0, Math.min(shape.length - 1, Math.floor(ageHours) - 1));
    return ageHours <= 0 ? 0 : shape[bin]!;
  };

  const truth: SyntheticTruth = {
    creatorBeta: new Map(),
    creatorConversionPer1k: new Map(),
    creatorFollowers0: new Map(),
    nicheIndex: new Map(),
    branching: new Map(),
    breakouts: new Set(),
    halo,
    trendsetters: new Set(),
    formatR0: new Map(),
    formatEffect: new Map(),
    formatStartDay: new Map(),
    novelVideos: new Set(),
    logMature: new Map(),
    levelDrift: 0.004,
    maturity: (ageHours: number) => shapeAt(0.4, ageHours) / shapeAt(0.4, 672),
  };

  // Niche index: daily random walk per niche.
  for (const niche of niches) {
    const series = new Map<number, number>();
    let value = 0;
    for (let day = firstDay; day <= days; day += 1) {
      value += normal(prng, 0, 0.12);
      series.set(day, value);
    }
    truth.nicheIndex.set(niche, series);
  }

  const creators: BtCreator[] = [];
  const betas = [0.5, 1, 1.5];
  for (let i = 0; i < creatorsN; i += 1) {
    const id = `c${String(i).padStart(3, "0")}`;
    creators.push({ id, platform: "tiktok", niche: niches[i % niches.length]!, group: "main" });
    truth.creatorBeta.set(id, betas[i % betas.length]!);
    truth.creatorConversionPer1k.set(id, 1 + 3 * prng.next());
    truth.creatorFollowers0.set(id, Math.round(Math.pow(10, 2.5 + 4 * prng.next())));
  }
  const trendsetterCount = options.trendsetters ?? 4;
  for (let i = 0; i < trendsetterCount && i < creatorsN; i += 1) truth.trendsetters.add(creators[(i * 7) % creatorsN]!.id);

  // Format adoption: discrete SIR per format over creators, seeded by trendsetters.
  const infectedDays = new Map<string, Map<string, [number, number]>>(); // format -> creator -> [from, to)
  SYNTHETIC_FORMATS.forEach((format, index) => {
    const r0 = SYNTHETIC_R0[index]!;
    const beta = r0 * SYNTHETIC_GAMMA;
    const startDay = firstDay + 5 + index * Math.floor((backfillDays + days - 40) / SYNTHETIC_FORMATS.length);
    truth.formatR0.set(format, r0);
    truth.formatEffect.set(format, 0.25 * (r0 - 1.6));
    truth.formatStartDay.set(format, startDay);
    const state = new Map<string, "S" | "I" | "R">(creators.map((creator) => [creator.id, "S"]));
    const spans = new Map<string, [number, number]>();
    for (const id of truth.trendsetters) {
      state.set(id, "I");
      spans.set(id, [startDay, Infinity]);
    }
    for (let day = startDay + 1; day <= days; day += 1) {
      const infectious = [...state.values()].filter((value) => value === "I").length;
      const pressure = 1 - Math.exp((-beta * infectious) / creatorsN);
      const recovering: string[] = [];
      for (const [id, value] of state) if (value === "I" && prng.next() < SYNTHETIC_GAMMA) recovering.push(id);
      for (const [id, value] of state) {
        if (value === "S" && prng.next() < pressure) {
          state.set(id, "I");
          spans.set(id, [day, Infinity]);
        }
      }
      for (const id of recovering) {
        state.set(id, "R");
        spans.get(id)![1] = day;
      }
    }
    infectedDays.set(format, spans);
  });
  const activeFormats = (creatorId: string, day: number) =>
    SYNTHETIC_FORMATS.filter((format) => {
      const span = infectedDays.get(format)!.get(creatorId);
      return span !== undefined && day >= span[0] && day < span[1];
    });

  const commonTags = Array.from({ length: 30 }, (_, i) => `tag${i}`);
  const hooks = ["question", "pov", "numbered-list", "bold-claim"];
  const videos: BtVideo[] = [];
  const snapshots: BtSnapshot[] = [];
  const curves = new Map<string, { postedAt: number; finalViews: number; n: number; creatorId: string }>();
  let novelSeq = 0;

  for (const creator of creators) {
    const beta = truth.creatorBeta.get(creator.id)!;
    const followers0 = truth.creatorFollowers0.get(creator.id)!;
    let level = 0.85 * Math.log(followers0) + normal(prng, 0, 0.4);
    let lastHit: number | null = null;
    const isTrendsetter = truth.trendsetters.has(creator.id);
    let seq = 0;
    for (let day = firstDay; day < days; day += 1) {
      if (prng.next() >= postsPerWeek / 7) continue;
      const postedAt = start + day * DAY_MS + Math.floor(prng.next() * 20 * HOUR_MS);
      const id = `${creator.id}-v${String(seq).padStart(3, "0")}`;
      seq += 1;
      level += normal(prng, 0, Math.sqrt(truth.levelDrift));
      const formats = activeFormats(creator.id, day);
      const format = formats.length > 0 && prng.next() < (isTrendsetter ? 0.95 : 0.8) ? formats[Math.floor(prng.next() * formats.length)]! : "basic";
      const breakout = prng.next() < breakoutRate;
      const novel = prng.next() < 0.05;
      const index = truth.nicheIndex.get(creator.niche!)!.get(day) ?? 0;
      let x = level + beta * index + normal(prng, 0, 0.6) + (truth.formatEffect.get(format) ?? 0) + (novel ? 0.3 : 0);
      if (lastHit !== null) {
        const delta = (postedAt - lastHit) / DAY_MS;
        if (delta > 0 && delta <= 30) x += halo.h0 * Math.exp(-delta / halo.tauDays);
      }
      if (breakout) {
        x += Math.log(12) + Math.abs(normal(prng, 0, 0.5));
        truth.breakouts.add(id);
        lastHit = postedAt;
      }
      const n = breakout ? BREAKOUT_N[Math.floor(prng.next() * 3)]! : NORMAL_N[Math.floor(prng.next() * 3)]!;
      truth.branching.set(id, n);
      truth.logMature.set(id, x);
      if (novel) truth.novelVideos.add(id);
      const finalViews = Math.exp(x);
      curves.set(id, { postedAt, finalViews, n, creatorId: creator.id });
      const discoveredAt = Math.max(postedAt + Math.floor((0.5 + 2 * prng.next()) * HOUR_MS), start);
      const tags = [creator.niche!, format, commonTags[Math.floor(prng.next() * commonTags.length)]!];
      if (novel) tags.push(`fresh${novelSeq++}`);
      videos.push({
        id,
        creatorId: creator.id,
        platform: "tiktok",
        postedAt,
        discoveredAt,
        durationMs: 20_000 + Math.floor(prng.next() * 40_000),
        labels: {
          format: { label: format, availableAt: discoveredAt },
          hook: { label: hooks[Math.floor(prng.next() * hooks.length)]!, availableAt: discoveredAt },
        },
        hashtags: tags,
        soundKey: `sound:${Math.floor(prng.next() * 10)}`,
      });
      const total28 = shapeAt(n, 672);
      for (const baseAge of SYNTHETIC_CHECKPOINT_AGES_HOURS) {
        const ageHours = baseAge * (0.925 + 0.15 * prng.next());
        const asOf = postedAt + ageHours * HOUR_MS;
        if (asOf < discoveredAt || asOf > end) continue;
        const views = Math.round(finalViews * (shapeAt(n, ageHours) / total28) * Math.exp(normal(prng, 0, 0.03)));
        snapshots.push({
          videoId: id,
          asOf: Math.round(asOf),
          ageHours,
          checkpoint: checkpointName(ageHours),
          source: "synthetic",
          views,
          likes: Math.round(views * 0.06),
          comments: Math.round(views * 0.004),
          shares: Math.round(views * 0.003),
          saves: Math.round(views * 0.005),
          precision: "exact",
        });
      }
    }
  }

  // Daily follower snapshots: followers0 + conversion * views gained since the first post.
  const creatorSnapshots: BtCreatorSnapshot[] = [];
  const byCreator = new Map<string, Array<{ postedAt: number; finalViews: number; n: number }>>();
  for (const curve of curves.values()) (byCreator.get(curve.creatorId) ?? byCreator.set(curve.creatorId, []).get(curve.creatorId)!).push(curve);
  for (const creator of creators) {
    const list = byCreator.get(creator.id) ?? [];
    const conversion = truth.creatorConversionPer1k.get(creator.id)! / 1000;
    const followers0 = truth.creatorFollowers0.get(creator.id)!;
    for (let day = 0; day <= days; day += 1) {
      const asOf = start + day * DAY_MS + 12 * HOUR_MS;
      if (asOf > end) break;
      let views = 0;
      for (const curve of list) {
        const age = (asOf - curve.postedAt) / HOUR_MS;
        if (age > 0) views += curve.finalViews * (shapeAt(curve.n, age) / shapeAt(curve.n, 672));
      }
      creatorSnapshots.push({ creatorId: creator.id, asOf, followers: Math.round(followers0 + conversion * views) });
    }
  }

  return {
    corpus: { creators, videos, snapshots, creatorSnapshots, provenance: { source: "synthetic", seed: String(options.seed ?? "synthetic-578"), transforms: "" } },
    truth,
  };
}

function checkpointName(ageHours: number): string {
  if (ageHours < 6) return "h0-6";
  if (ageHours < 24) return "h6-24";
  if (ageHours < 48) return "d1-2";
  if (ageHours < 72) return "d2-3";
  if (ageHours < 168) return "d3-7";
  if (ageHours < 336) return "d7-14";
  if (ageHours < 672) return "d14-28";
  return "d28";
}
