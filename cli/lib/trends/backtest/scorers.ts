// Early-breakout scorers (#578): the three simple baselines and the methods
// on trial, each a small adapter from a `PointInTimeView` to a score. The
// method modules under `cli/lib/trends/methods/` stay pure; nothing in the
// default #556 / #576 / #577 paths imports this file.

import { DAY_MS, MATURITY_PRIORS, maturity, median, shrink } from "../math.js";
import { fitHawkesCheckpoints } from "../methods/hawkes.js";
import { creatorBetas, nicheIndex, type IndexPoint } from "../methods/niche-index.js";
import { currentRegimeStart } from "../methods/cusum.js";
import { fitLocalLevel, localLevel, type LocalLevelParams } from "../methods/kalman.js";
import { estimateHalo, haloCorrection, type HaloFit, type HaloVideo } from "../methods/halo.js";
import { novelty, noveltyModel, type NoveltyModel } from "../methods/kl-novelty.js";
import { followConversion } from "../methods/follow-conversion.js";
import type { PointInTimeView, VisibleVideo } from "./accessor.js";
import type { LabelAxis } from "./corpus.js";
import { creatorWindow, logMultiplierAt, nicheKey, nicheMedians, projectedLog, type BaselineMember, type MultiplierScore, type NicheStats } from "./features.js";

export interface DecisionMemo {
  multiplier?: MultiplierScore | null;
}

export interface ScoreInput {
  view: PointInTimeView;
  video: VisibleVideo;
  niches: ReadonlyMap<string, NicheStats>;
  memo: DecisionMemo;
  weight: number;
}

export interface EarlyScorer {
  id: string;
  kind: "baseline" | "method";
  description: string;
  /** Tuning grid for the method's weight (chosen on the training period). */
  weights?: number[];
  score(input: ScoreInput): number | null;
}

/** The creator-relative multiplier, memoized per decision. */
export function memoMultiplier(input: ScoreInput): MultiplierScore | null {
  if (input.memo.multiplier === undefined) input.memo.multiplier = logMultiplierAt(input.view, input.video, input.niches);
  return input.memo.multiplier;
}

// ─── Baselines ─────────────────────────────────────────────────────────────

export const rawViewsBaseline: EarlyScorer = {
  id: "raw-views",
  kind: "baseline",
  description: "ln(1 + views) at the decision time, no age or creator correction",
  score: ({ view, video }) => {
    const latest = view.latest(video.id);
    return latest?.views === null || latest?.views === undefined ? null : Math.log1p(latest.views);
  },
};

export const viewsPerFollowerBaseline: EarlyScorer = {
  id: "views-per-follower",
  kind: "baseline",
  description: "ln((1 + views) / (1 + followers at post time)); followers from snapshots before the decision",
  score: ({ view, video }) => {
    const latest = view.latest(video.id);
    if (latest?.views === null || latest?.views === undefined || video.postedAt === null) return null;
    const followers = view.followersAt(video.creatorId, Math.min(video.postedAt, view.t));
    return followers === null ? null : Math.log1p(latest.views) - Math.log1p(followers);
  },
};

export const creatorMultiplierBaseline: EarlyScorer = {
  id: "creator-multiplier",
  kind: "baseline",
  description: "#556 creator-relative multiplier: age-projected views vs the leave-one-out rolling median, shrunk to the niche",
  score: (input) => memoMultiplier(input)?.logMultiplier ?? null,
};

export const BASELINES: readonly EarlyScorer[] = [creatorMultiplierBaseline, rawViewsBaseline, viewsPerFollowerBaseline];

// ─── Methods ───────────────────────────────────────────────────────────────

/** Memoize a per-period fit on a view at the start of the period (never later than the decision). */
function periodic<T>(periodMs: number, compute: (view: PointInTimeView) => T): (view: PointInTimeView) => T {
  const cache = new Map<number, T>();
  return (view) => {
    const start = Math.floor(view.t / periodMs) * periodMs;
    if (!cache.has(start)) cache.set(start, compute(view.at(start)));
    return cache.get(start)!;
  };
}

const withBaseline = (input: ScoreInput, estimator: (members: BaselineMember[]) => { median: number | null; n: number }): number | null => {
  const scored = logMultiplierAt(input.view, input.video, input.niches, { baselineOverride: estimator });
  return scored?.logMultiplier ?? memoMultiplier(input)?.logMultiplier ?? null;
};

export function hawkesScorer(): EarlyScorer {
  return {
    id: "hawkes",
    kind: "method",
    description: "Hawkes branching ratio fit to the visible checkpoints; projected 28-day views vs the creator baseline",
    score: (input) => {
      const base = memoMultiplier(input);
      if (!base) return null;
      const points = input.view.snapshots(input.video.id)
        .filter((snapshot) => snapshot.ageHours !== null && snapshot.views !== null)
        .map((snapshot) => ({ ageHours: snapshot.ageHours!, views: snapshot.views! }));
      const fit = fitHawkesCheckpoints(points);
      return fit ? Math.log1p(fit.projected) - base.baseline : base.logMultiplier;
    },
  };
}

export function nicheIndexScorer(): EarlyScorer {
  const fitFor = periodic(DAY_MS, (view) => {
    const niches = nicheMedians(view);
    const points = new Map<string, IndexPoint[]>();
    const since = view.t - 90 * DAY_MS;
    for (const video of view.videos()) {
      if (video.postedAt === null || video.postedAt < since) continue;
      const scored = logMultiplierAt(view, video, niches);
      if (!scored || scored.ageHours < 24) continue;
      const key = nicheKey(view, video);
      (points.get(key) ?? points.set(key, []).get(key)!).push({ creatorId: video.creatorId, day: Math.floor(video.postedAt / DAY_MS), value: scored.logMultiplier });
    }
    const out = new Map<string, { index: Map<number, number>; betas: Map<string, number> }>();
    for (const [key, list] of points) {
      const options = { demean: "none" as const, clip: 2 };
      const index = nicheIndex(list, options);
      out.set(key, { index, betas: new Map([...creatorBetas(list, index, options)].map(([id, fit]) => [id, fit.beta])) });
    }
    return out;
  });
  return {
    id: "niche-index",
    kind: "method",
    description: "creator multiplier minus beta x the niche index (latest day before the decision)",
    score: (input) => {
      const base = memoMultiplier(input);
      if (!base) return null;
      const fit = fitFor(input.view).get(nicheKey(input.view, input.video));
      if (!fit || fit.index.size === 0) return base.logMultiplier;
      const day = Math.floor((input.video.postedAt ?? input.view.t) / DAY_MS);
      let latestDay = -Infinity;
      for (const d of fit.index.keys()) if (d <= day && d > latestDay) latestDay = d;
      const value = Number.isFinite(latestDay) ? fit.index.get(latestDay)! : 0;
      return base.logMultiplier - (fit.betas.get(input.video.creatorId) ?? 1) * value;
    },
  };
}

export function cusumScorer(): EarlyScorer {
  return {
    id: "cusum",
    kind: "method",
    description: "creator baseline from videos since the last CUSUM change point in the creator's log views",
    score: (input) =>
      withBaseline(input, (members) => {
        const ordered = [...members].sort((a, b) => a.postedAt - b.postedAt);
        const series = ordered.map((member) => member.x);
        const start = series.length >= 12 ? currentRegimeStart(series, { k: 0.5, h: 5, warmup: 8 }) : 0;
        const regime = series.length - start >= 5 ? series.slice(start) : series;
        return { median: median(regime), n: regime.length };
      }),
  };
}

export function kalmanScorer(): EarlyScorer {
  const paramsFor = periodic(7 * DAY_MS, (view): LocalLevelParams => {
    const series: number[][] = [];
    for (const creator of view.creators()) {
      const values = view.creatorVideos(creator.id).flatMap((video) => {
        const latest = view.latest(video.id);
        if (!latest || latest.ageHours === null || latest.ageHours < 72) return [];
        const x = projectedLog(latest, video.platform);
        return x === null ? [] : [x];
      });
      if (values.length >= 5) series.push(values);
    }
    if (series.length === 0) return { q: 0.01, r: 0.5, huber: 2.5 };
    const fit = fitLocalLevel(series, { steps: 15 });
    return { q: fit.q, r: fit.r, huber: 2.5 };
  });
  return {
    id: "kalman",
    kind: "method",
    description: "creator baseline = Kalman local-level prediction (q, r by weekly MLE on visible data, Huber-robust)",
    score: (input) => {
      const params = paramsFor(input.view);
      return withBaseline(input, (members) => {
        if (members.length === 0) return { median: null, n: 0 };
        const ordered = [...members].sort((a, b) => a.postedAt - b.postedAt).map((member) => member.x);
        const run = localLevel(ordered, params);
        return { median: run.filtered[run.filtered.length - 1]!, n: members.length };
      });
    },
  };
}

/** Hits from a creator's own visible series (log value >= ln 10 above the previous 15's median). */
function haloSeries(view: PointInTimeView, creatorId: string): HaloVideo[] {
  const out: HaloVideo[] = [];
  const values: number[] = [];
  for (const video of view.creatorVideos(creatorId)) {
    if (video.postedAt === null) continue;
    const latest = view.latest(video.id);
    if (!latest || latest.ageHours === null || latest.ageHours < 24) continue;
    const x = projectedLog(latest, video.platform);
    if (x === null) continue;
    const prior = values.slice(-15);
    out.push({ postedAt: video.postedAt, x, hit: prior.length >= 5 && x - median(prior)! >= Math.log(10) });
    values.push(x);
  }
  return out;
}

export function haloScorer(): EarlyScorer {
  const fitFor = periodic(7 * DAY_MS, (view): HaloFit | null => estimateHalo(view.creators().map((creator) => haloSeries(view, creator.id))));
  return {
    id: "halo",
    kind: "method",
    description: "post-hit halo h0 exp(-delta/tau) removed from the video and its creator window before the multiplier",
    score: (input) => {
      const base = memoMultiplier(input);
      if (!base || input.video.postedAt === null) return base?.logMultiplier ?? null;
      const fit = fitFor(input.view);
      if (!fit || fit.h0 <= 0) return base.logMultiplier;
      const series = haloSeries(input.view, input.video.creatorId);
      const lastHitBefore = (at: number) => {
        let hit: number | null = null;
        for (const item of series) if (item.hit && item.postedAt < at) hit = item.postedAt;
        return hit;
      };
      const delta = (at: number) => {
        const hit = lastHitBefore(at);
        return hit === null ? null : (at - hit) / DAY_MS;
      };
      const members = creatorWindow(input.view, input.video.creatorId, { postedAt: input.video.postedAt, id: input.video.id });
      const corrected = members.map((member) => member.x - haloCorrection(fit, delta(member.postedAt)));
      const cohort = input.niches.get(nicheKey(input.view, input.video))?.median ?? null;
      const baseline = shrink(median(corrected), corrected.length, cohort);
      if (baseline === null) return base.logMultiplier;
      return base.x - haloCorrection(fit, delta(input.video.postedAt)) - baseline;
    },
  };
}

export function contentTokens(view: PointInTimeView, videoId: string): string[] {
  const axes: LabelAxis[] = ["hashtag", "sound", "format", "hook"];
  return axes.flatMap((axis) => view.units(videoId, axis).map((unit) => `${axis}:${unit}`));
}

export function klNoveltyScorer(): EarlyScorer {
  const modelFor = periodic(DAY_MS, (view): NoveltyModel => {
    const since = view.t - 30 * DAY_MS;
    return noveltyModel(view.videos().filter((video) => video.postedAt !== null && video.postedAt >= since).map((video) => contentTokens(view, video.id)));
  });
  return {
    id: "kl-novelty",
    kind: "method",
    description: "creator multiplier + w x KL novelty of the video's tokens vs the niche's trailing 30 days",
    weights: [0, 0.05, 0.1, 0.2, 0.4],
    score: (input) => {
      const base = memoMultiplier(input);
      if (!base) return null;
      const value = novelty(modelFor(input.view), contentTokens(input.view, input.video.id));
      return base.logMultiplier + input.weight * (value ?? 0);
    },
  };
}

export function followConversionScorer(): EarlyScorer {
  const shape = (ageHours: number) => maturity(ageHours, MATURITY_PRIORS.tiktok);
  const conversionFor = periodic(7 * DAY_MS, (view) => {
    const out = new Map<string, number>();
    for (const creator of view.creators()) {
      const snapshots = view.creatorSnapshots(creator.id);
      if (snapshots.length < 2) continue;
      const videos = view.creatorVideos(creator.id).map((video) => ({
        postedAt: video.postedAt,
        snapshots: view.snapshots(video.id).filter((s) => s.views !== null).map((s) => ({ asOf: s.asOf, views: s.views! })),
      }));
      const result = followConversion({ followerSnapshots: snapshots, videos, shape });
      if (result.per1k !== null && result.deltaViews >= 10_000) out.set(creator.id, result.per1k);
    }
    return out;
  });
  return {
    id: "follow-conversion",
    kind: "method",
    description: "creator multiplier + w x ln(1 + followers gained per 1k views) of the creator (snapshot deltas)",
    weights: [0, 0.1, 0.25, 0.5],
    score: (input) => {
      const base = memoMultiplier(input);
      if (!base) return null;
      const conversion = conversionFor(input.view).get(input.video.creatorId);
      return base.logMultiplier + input.weight * (conversion === undefined ? 0 : Math.log1p(Math.max(0, conversion)));
    },
  };
}

export const METHOD_FACTORIES: Readonly<Record<string, () => EarlyScorer>> = {
  hawkes: hawkesScorer,
  "niche-index": nicheIndexScorer,
  cusum: cusumScorer,
  kalman: kalmanScorer,
  halo: haloScorer,
  "kl-novelty": klNoveltyScorer,
  "follow-conversion": followConversionScorer,
};
