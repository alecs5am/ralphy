// #578 methods on trial: each module recovers a planted value from synthetic
// data with a known answer (seeded, deterministic).

import { describe, expect, test } from "bun:test";
import { makePrng } from "../../cli/lib/prng.js";
import { DAY_MS, HOUR_MS } from "../../cli/lib/trends/math.js";
import { generateSyntheticCorpus, normal, simulateDiscreteHawkes, simulateSir } from "../../cli/lib/trends/backtest/synthetic.js";
import { median } from "../../cli/lib/trends/math.js";
import { fitDiscreteHawkes, fitHawkesCheckpoints, geometricKernel, meanCumulative } from "../../cli/lib/trends/methods/hawkes.js";
import { geometricGeneration, reproductionNumber } from "../../cli/lib/trends/methods/sir.js";
import { fitGpd, gpdQuantile, potThreshold } from "../../cli/lib/trends/methods/gpd.js";
import { fitLocalLevel, localLevel, rollingMedianPredictions } from "../../cli/lib/trends/methods/kalman.js";
import { cusum, currentRegimeStart } from "../../cli/lib/trends/methods/cusum.js";
import { creatorBetas, nicheIndex, type IndexPoint } from "../../cli/lib/trends/methods/niche-index.js";
import { crossCorrelationLag, trendsetterScores, type Adoption } from "../../cli/lib/trends/methods/lead-lag.js";
import { klDivergence, klVectors, novelty, noveltyModel } from "../../cli/lib/trends/methods/kl-novelty.js";
import { icDecay, monthlyIc } from "../../cli/lib/trends/methods/information-coefficient.js";
import { estimateHalo, haloCorrection, type HaloVideo } from "../../cli/lib/trends/methods/halo.js";
import { followConversion } from "../../cli/lib/trends/methods/follow-conversion.js";
import { discountedLinTs, fixedPolicy, oneHotArms, replay, type ReplayEvent } from "../../cli/lib/trends/methods/bandit.js";
import { pearson } from "../../cli/lib/trends/backtest/stats.js";

const T0 = Date.UTC(2026, 8, 1);

describe("hawkes", () => {
  test("EM recovers a planted branching ratio from a binned series", () => {
    const kernel = geometricKernel(0.7, 30);
    const recovered: number[] = [];
    for (const planted of [0.3, 0.6, 0.8]) {
      const counts = simulateDiscreteHawkes({ steps: 4000, mu: 4, n: planted, kernel, prng: makePrng(`hawkes-${planted}`) });
      const fit = fitDiscreteHawkes(counts, kernel);
      recovered.push(fit.n);
      expect(fit.converged).toBe(true);
      expect(Math.abs(fit.n - planted)).toBeLessThan(0.05);
      expect(Math.abs(fit.mu - 4) / 4).toBeLessThan(0.25);
    }
    expect(recovered[0]!).toBeLessThan(recovered[1]!);
  });

  test("checkpoint fit recovers n and the 28-day total from 6 h / 24 h / 48 h", () => {
    const kernel = geometricKernel(11 / 12, 240);
    for (const planted of [0.3, 0.7]) {
      const estimates: number[] = [];
      const errors: number[] = [];
      for (let r = 0; r < 12; r += 1) {
        const pulse = new Array(700).fill(0);
        pulse[0] = 3000;
        const counts = simulateDiscreteHawkes({ steps: 700, mu: pulse, n: planted, kernel, prng: makePrng(`hk-${planted}-${r}`) });
        const cumulative = (hours: number) => counts.slice(0, hours).reduce((sum, value) => sum + value, 0);
        const fit = fitHawkesCheckpoints([6, 24, 48].map((ageHours) => ({ ageHours, views: cumulative(ageHours) })), { kernel })!;
        estimates.push(fit.n);
        errors.push(Math.abs(fit.projected - cumulative(672)) / cumulative(672));
      }
      expect(Math.abs(median(estimates)! - planted)).toBeLessThan(0.06);
      expect(median(errors)!).toBeLessThan(0.1);
    }
  });

  test("mean curve total approaches immigrants / (1 - n)", () => {
    const curve = meanCumulative(0.5, geometricKernel(0.8, 120), 2000);
    expect(curve[curve.length - 1]!).toBeCloseTo(2, 2);
  });
});

describe("sir", () => {
  test("renewal estimator recovers R0 = beta / gamma from early adoption", () => {
    const gamma = 0.2;
    const generation = geometricGeneration(gamma, 60);
    const estimates: number[] = [];
    for (let r = 0; r < 20; r += 1) {
      const { incidence } = simulateSir({ population: 5000, beta: 0.4, gamma, initial: 20, steps: 120, prng: makePrng(`sir-${r}`) });
      let cumulative = 0;
      let to = 1;
      while (to < incidence.length && cumulative < 0.3 * 5000) cumulative += incidence[to++]!;
      const estimate = reproductionNumber({ incidence, generation, from: 1, to, population: 5000 });
      if (estimate.r !== null) estimates.push(estimate.r);
    }
    expect(Math.abs(median(estimates)! - 2)).toBeLessThan(0.2);
  });

  test("a fading format reads R < 1", () => {
    const gamma = 0.2;
    const { incidence } = simulateSir({ population: 5000, beta: 0.14, gamma, initial: 200, steps: 40, prng: makePrng("sir-fade") });
    const estimate = reproductionNumber({ incidence, generation: geometricGeneration(gamma, 60), population: 5000 });
    expect(estimate.r!).toBeLessThan(0.9);
    expect(estimate.r!).toBeGreaterThan(0.5);
  });
});

describe("gpd", () => {
  const sampleGpd = (xi: number, sigma: number, n: number, seed: string) => {
    const prng = makePrng(seed);
    return Array.from({ length: n }, () => (sigma / xi) * (Math.pow(1 - prng.next(), -xi) - 1));
  };

  test("PWM recovers xi and sigma", () => {
    const fit = fitGpd(sampleGpd(0.25, 0.8, 20_000, "gpd-a"))!;
    expect(Math.abs(fit.xi - 0.25)).toBeLessThan(0.04);
    expect(Math.abs(fit.sigma - 0.8) / 0.8).toBeLessThan(0.05);
  });

  test("POT level matches the true 98th percentile", () => {
    const values = sampleGpd(0.3, 1, 20_000, "gpd-b");
    const pot = potThreshold(values, { exceedance: 0.02, thresholdQuantile: 0.8 })!;
    const truth = gpdQuantile({ xi: 0.3, sigma: 1 }, 0.98);
    expect(Math.abs(pot.threshold - truth) / truth).toBeLessThan(0.06);
  });
});

describe("kalman", () => {
  const simulate = (q: number, r: number, creators: number, length: number, seed: string) => {
    const prng = makePrng(seed);
    return Array.from({ length: creators }, () => {
      let level = normal(prng, 8, 1);
      return Array.from({ length }, () => {
        level += normal(prng, 0, Math.sqrt(q));
        return level + normal(prng, 0, Math.sqrt(r));
      });
    });
  };

  test("MLE grid recovers the planted q and r", () => {
    const fit = fitLocalLevel(simulate(0.02, 0.3, 200, 60, "kalman-fit"), { steps: 31 });
    expect(fit.q).toBeGreaterThan(0.01);
    expect(fit.q).toBeLessThan(0.04);
    expect(Math.abs(fit.r - 0.3) / 0.3).toBeLessThan(0.15);
  });

  test("filtered baseline beats the rolling median when the level drifts", () => {
    const series = simulate(0.05, 0.3, 100, 80, "kalman-drift");
    let kalman = 0;
    let rolling = 0;
    for (const list of series) {
      const run = localLevel(list, { q: 0.05, r: 0.3 });
      const med = rollingMedianPredictions(list, 30);
      for (let j = 10; j < list.length; j += 1) {
        kalman += (list[j]! - run.predicted[j]!) ** 2;
        rolling += (list[j]! - med[j]!) ** 2;
      }
    }
    expect(kalman).toBeLessThan(rolling * 0.9);
  });
});

describe("cusum", () => {
  test("detects a planted level shift near its true index", () => {
    const delays: number[] = [];
    const errors: number[] = [];
    for (let r = 0; r < 20; r += 1) {
      const prng = makePrng(`cusum-${r}`);
      const series = Array.from({ length: 200 }, (_, t) => normal(prng, t >= 120 ? 1.5 : 0, 1));
      const { changes } = cusum(series, { k: 0.5, h: 8, mean: 0, sd: 1 });
      const hit = changes.find((change) => change.alarmAt >= 120);
      expect(hit).toBeDefined();
      delays.push(hit!.alarmAt - 120);
      errors.push(Math.abs(hit!.changeAt - 120));
    }
    expect(median(delays)!).toBeLessThan(15);
    expect(median(errors)!).toBeLessThanOrEqual(4);
  });

  test("rarely alarms on a stationary series (in-control run length > 1,500)", () => {
    let alarms = 0;
    for (let r = 0; r < 100; r += 1) {
      const prng = makePrng(`cusum-flat-${r}`);
      alarms += cusum(Array.from({ length: 300 }, () => normal(prng)), { k: 0.5, h: 8, mean: 0, sd: 1 }).changes.length;
    }
    expect(alarms).toBeLessThanOrEqual(20);
  });

  test("regime start points at the new regime", () => {
    const prng = makePrng("cusum-regime");
    const series = Array.from({ length: 120 }, (_, t) => normal(prng, t >= 70 ? 2 : 0, 0.5));
    expect(Math.abs(currentRegimeStart(series, { h: 8, warmup: 20 }) - 70)).toBeLessThanOrEqual(4);
  });
});

describe("niche index", () => {
  test("recovers the planted index and creator betas", () => {
    const prng = makePrng("niche-index");
    const days = 120;
    const index: number[] = [];
    let value = 0;
    for (let d = 0; d < days; d += 1) index.push((value += normal(prng, 0, 0.1)));
    const betas = [0.4, 1, 1.6];
    const points: IndexPoint[] = [];
    for (let c = 0; c < 90; c += 1) {
      const level = normal(prng, 9, 1);
      for (let d = 0; d < days; d += 1) {
        if (prng.next() < 0.6) points.push({ creatorId: `c${c}`, day: d, value: level + betas[c % 3]! * index[d]! + normal(prng, 0, 0.3) });
      }
    }
    const estimated = nicheIndex(points);
    const est = Array.from({ length: days }, (_, d) => estimated.get(d)!);
    expect(pearson(est, index)!).toBeGreaterThan(0.95);
    const fits = creatorBetas(points, estimated);
    for (const [b, planted] of betas.entries()) {
      const recovered = median([...fits].filter(([id]) => Number(id.slice(1)) % 3 === b).map(([, fit]) => fit.beta))!;
      expect(Math.abs(recovered - planted)).toBeLessThan(0.15);
    }
  });

  test("synthetic corpus betas are recoverable from creator-relative residuals", () => {
    const { corpus, truth } = generateSyntheticCorpus({ seed: "niche-corpus", creators: 90, days: 70 });
    const nicheOf = new Map(corpus.creators.map((creator) => [creator.id, creator.niche!]));
    for (const niche of ["alpha", "beta"]) {
      const points: IndexPoint[] = [];
      const byCreator = new Map<string, typeof corpus.videos>();
      for (const video of corpus.videos) if (nicheOf.get(video.creatorId) === niche) (byCreator.get(video.creatorId) ?? byCreator.set(video.creatorId, []).get(video.creatorId)!).push(video);
      for (const [creatorId, list] of byCreator) {
        list.sort((a, b) => a.postedAt! - b.postedAt!);
        list.forEach((video, j) => {
          if (j < 8) return;
          const window = list.slice(Math.max(0, j - 15), j).map((other) => truth.logMature.get(other.id)!);
          points.push({ creatorId, day: Math.floor((video.postedAt! - Date.UTC(2026, 8, 1)) / DAY_MS), value: truth.logMature.get(video.id)! - median(window)! });
        });
      }
      const options = { demean: "none" as const, clip: 1.5 };
      const fits = creatorBetas(points, nicheIndex(points, options), options);
      const errors = [...fits].map(([id, fit]) => Math.abs(fit.beta - truth.creatorBeta.get(id)!));
      expect(median(errors)!).toBeLessThan(0.3);
    }
  });
});

describe("lead-lag", () => {
  test("finds the planted lag", () => {
    const prng = makePrng("xcorr");
    const x = Array.from({ length: 200 }, () => normal(prng));
    const y = x.map((_, t) => (t >= 3 ? x[t - 3]! : 0) + normal(prng, 0, 0.5));
    expect(crossCorrelationLag(x, y, 10)!.lag).toBe(3);
  });

  test("ranks planted trendsetters first", () => {
    const prng = makePrng("trendsetters");
    const adoptions: Adoption[] = [];
    const planted = new Set(["c3", "c17", "c29"]);
    for (let u = 0; u < 30; u += 1) {
      const start = T0 + u * 5 * DAY_MS;
      for (let c = 0; c < 50; c += 1) {
        const id = `c${c}`;
        if (!planted.has(id) && prng.next() < 0.5) continue;
        const delay = planted.has(id) ? prng.next() * DAY_MS : (2 + -Math.log(1 - prng.next()) * 3) * DAY_MS;
        adoptions.push({ creatorId: id, unit: `u${u}`, at: start + delay });
      }
    }
    const top = trendsetterScores(adoptions).slice(0, 3).map((score) => score.creatorId);
    expect(new Set(top)).toEqual(planted);
  });

  test("synthetic corpus trendsetters lead format adoption", () => {
    const { corpus, truth } = generateSyntheticCorpus({ seed: "lead-corpus", creators: 60 });
    const adoptions = corpus.videos
      .filter((video) => video.labels.format && video.labels.format.label !== "basic")
      .map((video) => ({ creatorId: video.creatorId, unit: video.labels.format!.label, at: video.postedAt! }));
    const top = trendsetterScores(adoptions, { minUnits: 3 }).slice(0, truth.trendsetters.size).map((score) => score.creatorId);
    expect(top.filter((id) => truth.trendsetters.has(id)).length).toBeGreaterThanOrEqual(truth.trendsetters.size - 1);
  });
});

describe("kl novelty", () => {
  test("KL matches the closed form", () => {
    expect(klVectors([0.5, 0.5], [0.9, 0.1])).toBeCloseTo(0.5 * Math.log(0.5 / 0.9) + 0.5 * Math.log(0.5 / 0.1), 10);
    const p = new Map([["a", 5000], ["b", 5000]]);
    const q = new Map([["a", 9000], ["b", 1000]]);
    expect(klDivergence(p, q, 0.5)).toBeCloseTo(klVectors([0.5, 0.5], [0.9, 0.1]), 3);
    expect(klDivergence(p, p)).toBeCloseTo(0, 10);
  });

  test("planted novel tokens rank top", () => {
    const { corpus, truth } = generateSyntheticCorpus({ seed: "kl-corpus", creators: 40, days: 40 });
    const model = noveltyModel(corpus.videos.map((video) => video.hashtags));
    const scores = corpus.videos.map((video) => ({ novel: truth.novelVideos.has(video.id), score: novelty(model, video.hashtags)! }));
    const novel = scores.filter((item) => item.novel);
    const plain = scores.filter((item) => !item.novel);
    let wins = 0;
    for (const a of novel) for (const b of plain) wins += a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
    expect(wins / (novel.length * plain.length)).toBeGreaterThan(0.9);
  });
});

describe("information coefficient", () => {
  test("recovers monthly IC and the planted half-life", () => {
    const prng = makePrng("ic");
    const observations = [];
    for (let m = 0; m < 6; m += 1) {
      const rho = 0.6 * Math.pow(0.5, m / 2);
      for (let i = 0; i < 4000; i += 1) {
        const outcome = normal(prng);
        observations.push({ at: Date.UTC(2026, m, 10), signal: rho * outcome + Math.sqrt(1 - rho * rho) * normal(prng), outcome });
      }
    }
    const months = monthlyIc(observations);
    const expected0 = (6 / Math.PI) * Math.asin(0.6 / 2);
    expect(Math.abs(months[0]!.ic! - expected0)).toBeLessThan(0.03);
    const decay = icDecay(months);
    expect(Math.abs(decay.halfLifeMonths! - 2)).toBeLessThan(0.4);
  });
});

describe("halo", () => {
  test("recovers planted h0 and tau", () => {
    const prng = makePrng("halo");
    const creators: HaloVideo[][] = [];
    for (let c = 0; c < 200; c += 1) {
      const hitDay = 30 + Math.floor(prng.next() * 20);
      const videos: HaloVideo[] = [];
      for (let d = 0; d < 90; d += 1) {
        if (prng.next() > 0.6) continue;
        const delta = d - hitDay;
        const x = 10 + normal(prng, 0, 0.4) + (delta > 0 && delta <= 30 ? 0.8 * Math.exp(-delta / 5) : 0);
        videos.push({ postedAt: T0 + d * DAY_MS, x: d === hitDay ? x + 3 : x, hit: d === hitDay });
      }
      if (!videos.some((video) => video.hit)) videos.push({ postedAt: T0 + hitDay * DAY_MS, x: 13, hit: true });
      creators.push(videos);
    }
    const fit = estimateHalo(creators)!;
    expect(Math.abs(fit.h0 - 0.8)).toBeLessThan(0.12);
    expect(Math.abs(fit.tauDays - 5)).toBeLessThan(1.5);
    expect(haloCorrection(fit, 0)).toBe(0);
  });

  test("recovers the synthetic corpus halo from planted values", () => {
    const { corpus, truth } = generateSyntheticCorpus({ seed: "halo-corpus", creators: 150, days: 80, breakoutRate: 0.06 });
    const byCreator = new Map<string, HaloVideo[]>();
    for (const video of corpus.videos) {
      (byCreator.get(video.creatorId) ?? byCreator.set(video.creatorId, []).get(video.creatorId)!).push({
        postedAt: video.postedAt!, x: truth.logMature.get(video.id)!, hit: truth.breakouts.has(video.id),
      });
    }
    const fit = estimateHalo([...byCreator.values()])!;
    expect(Math.abs(fit.h0 - truth.halo.h0)).toBeLessThan(0.3);
    expect(fit.tauDays).toBeGreaterThan(2);
    expect(fit.tauDays).toBeLessThan(15);
  });
});

describe("follow conversion", () => {
  test("recovers planted conversion per 1k views from creator snapshot deltas", () => {
    const { corpus, truth } = generateSyntheticCorpus({ seed: "conversion", creators: 30, days: 30 });
    const errors: number[] = [];
    for (const creator of corpus.creators) {
      const videos = corpus.videos.filter((video) => video.creatorId === creator.id).map((video) => ({
        postedAt: video.postedAt,
        snapshots: corpus.snapshots.filter((s) => s.videoId === video.id).map((s) => ({ asOf: s.asOf, views: s.views! })),
      }));
      const result = followConversion({ followerSnapshots: corpus.creatorSnapshots.filter((s) => s.creatorId === creator.id), videos, coverageDays: 25, shape: truth.maturity });
      if (result.per1k === null || result.deltaViews < 50_000) continue;
      errors.push(Math.abs(result.per1k - truth.creatorConversionPer1k.get(creator.id)!) / truth.creatorConversionPer1k.get(creator.id)!);
    }
    expect(errors.length).toBeGreaterThan(10);
    expect(median(errors)!).toBeLessThan(0.15);
  });
});

describe("bandit", () => {
  const environment = (means: (t: number) => number[], events: number, seed: string): ReplayEvent[] => {
    const prng = makePrng(seed);
    const arms = oneHotArms(4);
    return Array.from({ length: events }, (_, t) => {
      const logged = Math.floor(prng.next() * 4);
      return { arms, logged, reward: means(t)[logged]! + normal(prng, 0, 0.3) };
    });
  };

  test("replay of a fixed policy is unbiased under uniform logging", () => {
    const events = environment(() => [0.1, 0.3, 0.5, 0.2], 8000, "replay-fixed");
    const result = replay(events, fixedPolicy(2), makePrng("p"));
    expect(Math.abs(result.meanReward! - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(result.matched / 8000 - 0.25)).toBeLessThan(0.02);
  });

  test("Thompson sampling finds the best arm; discounting tracks a switch", () => {
    const stationary = replay(environment(() => [0.1, 0.3, 0.5, 0.2], 8000, "ts-a"), discountedLinTs({ dimension: 4, sigma: 0.3 }), makePrng("ts-a-p"));
    expect(stationary.meanReward!).toBeGreaterThan(0.42);
    const switching = (t: number) => (t < 6000 ? [0.6, 0.3, 0.1, 0.2] : [0.1, 0.3, 0.6, 0.2]);
    let discounted = 0;
    let plain = 0;
    for (let r = 0; r < 5; r += 1) {
      const late = environment(switching, 12_000, `switch-${r}`);
      const run = (gamma: number) => {
        const policy = discountedLinTs({ dimension: 4, sigma: 0.3, gamma });
        const prng = makePrng(`switch-p-${r}`);
        replay(late.slice(0, 6000), policy, prng);
        return replay(late.slice(6000), policy, prng).meanReward!;
      };
      discounted += run(0.97);
      plain += run(1);
    }
    expect(discounted / 5).toBeGreaterThan(plain / 5 + 0.05);
  });
});

test("synthetic generator is deterministic per seed", () => {
  const a = generateSyntheticCorpus({ seed: "det", creators: 10, days: 20 });
  const b = generateSyntheticCorpus({ seed: "det", creators: 10, days: 20 });
  expect(a.corpus.snapshots.length).toBe(b.corpus.snapshots.length);
  expect(a.corpus.snapshots.slice(0, 20)).toEqual(b.corpus.snapshots.slice(0, 20));
  expect(a.corpus.snapshots.every((s) => s.asOf >= a.corpus.videos.find((v) => v.id === s.videoId)!.discoveredAt)).toBe(true);
  expect(HOUR_MS).toBe(3_600_000);
});
