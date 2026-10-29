// Backtest tasks (#578). Each task replays decisions point-in-time through
// `CorpusIndex.view(t)`, builds targets with the outcome oracle, splits
// train / held-out by decision time (purged), tunes any method weight on the
// training side only, and reports held-out metrics with paired cluster
// bootstrap intervals for the lift over the best simple baseline.

import { makePrng } from "../../prng.js";
import { rankCopyability, type CopyCandidate } from "../niche.js";
import { DAY_MS, HOUR_MS, median, sizeBandFor } from "../math.js";
import { potThreshold } from "../methods/gpd.js";
import { geometricGeneration, infectionPressure, reproductionNumber } from "../methods/sir.js";
import { trendsetterScores, type Adoption } from "../methods/lead-lag.js";
import { fitLocalLevel, localLevel } from "../methods/kalman.js";
import { currentRegimeStart } from "../methods/cusum.js";
import { estimateHalo, haloCorrection, type HaloVideo } from "../methods/halo.js";
import { discountedLinTs, fixedPolicy, oneHotArms, replay, uniformPolicy, type Policy, type ReplayEvent } from "../methods/bandit.js";
import { icDecay, monthlyIc } from "../methods/information-coefficient.js";
import type { CorpusIndex, PointInTimeView, VisibleVideo } from "./accessor.js";
import type { LabelAxis } from "./corpus.js";
import { creatorWindow, logMultiplierAt, nicheMedians, projectedLog, sizeBandAt, type NicheStats } from "./features.js";
import type { OutcomeOracle } from "./outcomes.js";
import { sideOf, splitSummary, type TimeSplit } from "./split.js";
import { BASELINES, type EarlyScorer, type DecisionMemo } from "./scorers.js";
import { adoptionRule, bootstrapLift, mean, spearman, topK, type LiftInterval, type RankedItem, type RuleOutcome } from "./stats.js";

export interface TaskContext {
  index: CorpusIndex;
  oracle: OutcomeOracle;
  split: TimeSplit;
  datasetVersion: string;
  preliminary: boolean;
  replicates: number;
  seed: string;
  margin: number;
}

export interface ScorerRow {
  scorer: string;
  kind: "baseline" | "method" | "reference";
  weight: number | null;
  train: number | null;
  test: number | null;
  extra: Record<string, number | string | null>;
}

export interface LiftRow {
  method: string;
  versus: string;
  interval: LiftInterval;
  rule: RuleOutcome;
}

export type TaskStatus = "computed" | "not-enough-history" | "needs-natural-experiment-data";

export interface TaskResult {
  task: string;
  status: TaskStatus;
  reason: string | null;
  preliminary: boolean;
  datasetVersion: string;
  metric: string;
  higherIsBetter: boolean;
  split: ReturnType<typeof splitSummary> | null;
  counts: Record<string, number>;
  rows: ScorerRow[];
  bestBaseline: string | null;
  lifts: LiftRow[];
  notes: string[];
}

const NULL_SCORE = -1e12;

/** Defaults overridden only by options that are actually set (an explicit undefined keeps the default). */
function merge<T extends object>(defaults: T, options: Partial<T>): T {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(options)) if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

function emptyResult(task: string, ctx: TaskContext, metric: string, status: TaskStatus, reason: string, counts: Record<string, number> = {}, higherIsBetter = true): TaskResult {
  return { task, status, reason, preliminary: ctx.preliminary, datasetVersion: ctx.datasetVersion, metric, higherIsBetter, split: splitSummary(ctx.split), counts, rows: [], bestBaseline: null, lifts: [], notes: [] };
}

function weekGroup(split: TimeSplit, at: number): string {
  return `w${Math.floor((at - split.periodStart) / (7 * DAY_MS))}`;
}

/** Paired lift of `method` over `baseline` on per-cluster item lists. */
function liftRows(input: {
  ctx: TaskContext;
  methods: Array<{ id: string; items: Map<string, RankedItem[]> }>;
  baselines: Array<{ id: string; items: Map<string, RankedItem[]>; value: number | null }>;
  statistic: (items: RankedItem[]) => number | null;
  higherIsBetter: boolean;
}): { best: string | null; lifts: LiftRow[] } {
  const scored = input.baselines.filter((baseline) => baseline.value !== null);
  if (scored.length === 0) return { best: null, lifts: [] };
  const best = scored.reduce((a, b) => ((input.higherIsBetter ? b.value! > a.value! : b.value! < a.value!) ? b : a));
  const lifts: LiftRow[] = [];
  for (const method of input.methods) {
    const clusters = [...new Set([...method.items.keys(), ...best.items.keys()])].sort();
    const stat = (sample: readonly number[]) => {
      const m: RankedItem[] = [];
      const b: RankedItem[] = [];
      for (const clusterIndex of sample) {
        const key = clusters[clusterIndex]!;
        for (const item of method.items.get(key) ?? []) m.push(item);
        for (const item of best.items.get(key) ?? []) b.push(item);
      }
      const mv = input.statistic(m);
      const bv = input.statistic(b);
      if (input.higherIsBetter) return { method: mv, baseline: bv };
      // Lower is better: express as reduction so a positive lift means better.
      return { method: bv === null || mv === null ? null : 2 * bv - mv, baseline: bv };
    };
    const interval = bootstrapLift({ clusters: clusters.length, stat, replicates: input.ctx.replicates, seed: `${input.ctx.seed}:${method.id}` });
    lifts.push({ method: method.id, versus: best.id, interval, rule: adoptionRule(interval, { margin: input.ctx.margin, preliminary: input.ctx.preliminary }) });
  }
  return { best: best.id, lifts };
}

const byCluster = (items: Array<RankedItem & { cluster: string }>): Map<string, RankedItem[]> => {
  const out = new Map<string, RankedItem[]>();
  for (const item of items) (out.get(item.cluster) ?? out.set(item.cluster, []).get(item.cluster)!).push({ score: item.score, positive: item.positive, group: item.group });
  return out;
};

// ─── Task 1: early breakout ────────────────────────────────────────────────

export interface EarlyBreakoutOptions {
  checkpointHours: number;
  k: number;
  breakoutMultiplier: number;
  bucketHours: number;
  minTestPositives: number;
}

export const DEFAULT_EARLY_BREAKOUT: EarlyBreakoutOptions = { checkpointHours: 48, k: 10, breakoutMultiplier: 10, bucketHours: 24, minTestPositives: 10 };

export function runEarlyBreakout(ctx: TaskContext, methods: readonly EarlyScorer[], options: Partial<EarlyBreakoutOptions> = {}): TaskResult & { ic: Array<{ scorer: string; months: ReturnType<typeof monthlyIc>; decay: ReturnType<typeof icDecay> }> } {
  const o = merge(DEFAULT_EARLY_BREAKOUT, options);
  const metric = `precision@${o.k} per decision week (breakout = 28-day multiplier >= ${o.breakoutMultiplier}x), decision at ${o.checkpointHours} h`;
  const counts = { prospective: 0, resolved: 0, unresolved: 0, train: 0, test: 0, purged: 0, outside: 0, trainPositives: 0, testPositives: 0 };
  interface Decision { video: VisibleVideo; at: number; side: string; positive: boolean; outcome: number; knownAt: number; memo: DecisionMemo; view: PointInTimeView; niches: ReadonlyMap<string, NicheStats> }
  const decisions: Decision[] = [];
  const nicheCache = new Map<number, Map<string, NicheStats>>();
  const bucketMs = o.bucketHours * HOUR_MS;
  const threshold = Math.log(o.breakoutMultiplier);
  for (const video of ctx.oracle.videos()) {
    if (video.postedAt === null) continue;
    const at = video.postedAt + o.checkpointHours * HOUR_MS;
    const view = ctx.index.view(at);
    const visible = view.video(video.id);
    if (!visible || !view.latest(video.id)) continue;
    counts.prospective += 1;
    const outcome = ctx.oracle.outcome(video.id);
    if (!outcome) {
      counts.unresolved += 1;
      continue;
    }
    counts.resolved += 1;
    const side = sideOf(ctx.split, at, outcome.knownAt);
    counts[side] += 1;
    if (side !== "train" && side !== "test") continue;
    const positive = outcome.logMultiplier >= threshold;
    if (positive) counts[side === "train" ? "trainPositives" : "testPositives"] += 1;
    const bucket = Math.floor(at / bucketMs) * bucketMs;
    if (!nicheCache.has(bucket)) nicheCache.set(bucket, nicheMedians(ctx.index.view(bucket)));
    decisions.push({ video: visible, at, side, positive, outcome: outcome.logMultiplier, knownAt: outcome.knownAt, memo: {}, view, niches: nicheCache.get(bucket)! });
  }
  const base = { ...emptyResult("early-breakout", ctx, metric, "computed", "", counts), ic: [] as Array<{ scorer: string; months: ReturnType<typeof monthlyIc>; decay: ReturnType<typeof icDecay> }> };
  if (counts.testPositives < o.minTestPositives || counts.trainPositives < o.minTestPositives) {
    return { ...base, status: "not-enough-history", reason: `needs >= ${o.minTestPositives} breakouts on each side with 28-day outcomes; have train ${counts.trainPositives}, test ${counts.testPositives} (prospective videos ${counts.prospective}, unresolved ${counts.unresolved})` };
  }
  const scorers = [...BASELINES, ...methods];
  const results: Array<{ scorer: EarlyScorer; weight: number; scores: number[] }> = [];
  for (const scorer of scorers) {
    const weights = scorer.weights ?? [1];
    const perWeight = weights.map((weight) =>
      decisions.map((decision) => scorer.score({ view: decision.view, video: decision.video, niches: decision.niches, memo: decision.memo, weight }) ?? NULL_SCORE)
    );
    const trainPrecision = perWeight.map((scores) =>
      topK(decisions.flatMap((decision, i) => (decision.side === "train" ? [{ score: scores[i]!, positive: decision.positive, group: weekGroup(ctx.split, decision.at) }] : [])), o.k).precision ?? -1
    );
    const bestIndex = trainPrecision.indexOf(Math.max(...trainPrecision));
    results.push({ scorer, weight: weights[bestIndex]!, scores: perWeight[bestIndex]! });
  }
  const itemsFor = (scores: number[], side: string) =>
    decisions.flatMap((decision, i) => (decision.side === side ? [{ score: scores[i]!, positive: decision.positive, group: weekGroup(ctx.split, decision.at), cluster: decision.video.creatorId }] : []));
  const leadTimes = (scores: number[]) => {
    const test = decisions.map((decision, i) => ({ decision, score: scores[i]! })).filter((entry) => entry.decision.side === "test");
    const byWeek = new Map<string, typeof test>();
    for (const entry of test) (byWeek.get(weekGroup(ctx.split, entry.decision.at)) ?? byWeek.set(weekGroup(ctx.split, entry.decision.at), []).get(weekGroup(ctx.split, entry.decision.at))!).push(entry);
    const out: number[] = [];
    for (const list of byWeek.values()) {
      for (const { decision } of [...list].sort((a, b) => b.score - a.score).slice(0, o.k)) {
        if (!decision.positive) continue;
        const baseline = decision.memo.multiplier?.baseline;
        let detected = decision.knownAt;
        if (baseline !== undefined) {
          for (const snapshot of ctx.oracle.snapshots(decision.video.id)) {
            if (snapshot.asOf <= decision.at || snapshot.ageHours === null || snapshot.ageHours < 72) continue;
            const x = projectedLog(snapshot, decision.video.platform);
            if (x !== null && x - baseline >= threshold) {
              detected = snapshot.asOf;
              break;
            }
          }
        }
        out.push((detected - decision.at) / HOUR_MS);
      }
    }
    return out;
  };
  const rows: ScorerRow[] = results.map(({ scorer, weight, scores }) => {
    const train = topK(itemsFor(scores, "train"), o.k);
    const test = topK(itemsFor(scores, "test"), o.k);
    const covered = decisions.filter((decision, i) => decision.side === "test" && scores[i] !== NULL_SCORE).length;
    return {
      scorer: scorer.id,
      kind: scorer.kind,
      weight: scorer.weights ? weight : null,
      train: train.precision,
      test: test.precision,
      extra: { recall: test.recall, hits: test.hits, picks: test.picks, positives: test.positives, coverage: counts.test > 0 ? covered / counts.test : null, medianLeadHours: median(leadTimes(scores)) },
    };
  });
  const { best, lifts } = liftRows({
    ctx,
    higherIsBetter: true,
    statistic: (items) => topK(items, o.k).precision,
    baselines: results.filter((r) => r.scorer.kind === "baseline").map((r) => ({ id: r.scorer.id, items: byCluster(itemsFor(r.scores, "test")), value: rows.find((row) => row.scorer === r.scorer.id)!.test })),
    methods: results.filter((r) => r.scorer.kind === "method").map((r) => ({ id: r.scorer.id, items: byCluster(itemsFor(r.scores, "test")) })),
  });
  const ic = results.map(({ scorer, scores }) => {
    const months = monthlyIc(decisions.map((decision, i) => ({ at: decision.at, signal: scores[i]!, outcome: decision.outcome })).filter((item) => item.signal !== NULL_SCORE));
    return { scorer: scorer.id, months, decay: icDecay(months) };
  });
  return { ...base, rows, bestBaseline: best, lifts, ic, notes: ["method weights tuned on the training side (max precision@k); null scores rank last"] };
}

// ─── Shared unit helpers ───────────────────────────────────────────────────

const unitKey = (niche: string | null, unit: string) => `${niche ?? "unknown"}|${unit}`;

/** First use per (niche|unit) and creator over the full corpus (oracle side). */
function oracleFirstUse(oracle: OutcomeOracle, axis: LabelAxis): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const video of oracle.videos()) {
    if (video.postedAt === null) continue;
    for (const unit of oracle.units(video.id, axis)) {
      const key = unitKey(oracle.niche(video.creatorId), unit);
      const byCreator = out.get(key) ?? out.set(key, new Map()).get(key)!;
      const current = byCreator.get(video.creatorId);
      if (current === undefined || video.postedAt < current) byCreator.set(video.creatorId, video.postedAt);
    }
  }
  return out;
}

function decisionTimes(ctx: TaskContext, leadDays: number, horizonDays: number, stepDays = 7): number[] {
  const out: number[] = [];
  for (let t = ctx.split.periodStart + leadDays * DAY_MS; t + horizonDays * DAY_MS <= ctx.split.periodEnd; t += stepDays * DAY_MS) out.push(t);
  return out;
}

// ─── Task 2: format spread (next 14 days) ──────────────────────────────────

export interface FormatSpreadOptions {
  axis: LabelAxis;
  horizonDays: number;
  lookbackDays: number;
  /** Metric baselines read the unit's videos posted this far back (with any visible snapshot). */
  metricLookbackDays: number;
  minAdopters: number;
  k: number;
  gamma: number;
  methods: string[];
}

export const DEFAULT_FORMAT_SPREAD: FormatSpreadOptions = { axis: "format", horizonDays: 14, lookbackDays: 28, metricLookbackDays: 42, minAdopters: 3, k: 5, gamma: 1 / 7, methods: ["sir", "lead-lag"] };

export function runFormatSpread(ctx: TaskContext, options: Partial<FormatSpreadOptions> = {}): TaskResult {
  const o = merge(DEFAULT_FORMAT_SPREAD, options);
  const metric = `precision@${o.k} per decision week: share of top-${o.k} units that are among the true top-${o.k} by new adopting creators in the next ${o.horizonDays} days (axis: ${o.axis})`;
  const firstUse = oracleFirstUse(ctx.oracle, o.axis);
  const times = decisionTimes(ctx, o.lookbackDays, o.horizonDays);
  const counts = { decisionTimes: times.length, train: 0, test: 0, purged: 0, outside: 0, units: 0 };
  if (times.length < 4) return emptyResult("format-spread", ctx, metric, "not-enough-history", `needs >= 4 weekly decision times with ${o.lookbackDays} days of lookback and a ${o.horizonDays}-day horizon inside the period; have ${times.length}`, counts);
  const generation = geometricGeneration(o.gamma, 60);
  type Item = { side: string; group: string; cluster: string; target: number; scores: Record<string, number> };
  const items: Item[] = [];
  for (const t of times) {
    const side = sideOf(ctx.split, t, t + o.horizonDays * DAY_MS);
    counts[side] += 1;
    if (side !== "train" && side !== "test") continue;
    const view = ctx.index.view(t);
    const niches = nicheMedians(view);
    const visibleFirst = new Map<string, Map<string, number>>();
    const recent = new Map<string, VisibleVideo[]>();
    const activeByNiche = new Map<string, Set<string>>();
    const adoptions: Adoption[] = [];
    for (const video of view.videos()) {
      if (video.postedAt === null || video.postedAt >= t) continue;
      const niche = view.creator(video.creatorId)?.niche ?? null;
      if (video.postedAt >= t - 30 * DAY_MS) (activeByNiche.get(niche ?? "unknown") ?? activeByNiche.set(niche ?? "unknown", new Set()).get(niche ?? "unknown")!).add(video.creatorId);
      for (const unit of view.units(video.id, o.axis)) {
        const key = unitKey(niche, unit);
        const byCreator = visibleFirst.get(key) ?? visibleFirst.set(key, new Map()).get(key)!;
        const current = byCreator.get(video.creatorId);
        if (current === undefined || video.postedAt < current) byCreator.set(video.creatorId, video.postedAt);
        if (video.postedAt >= t - o.metricLookbackDays * DAY_MS) (recent.get(key) ?? recent.set(key, []).get(key)!).push(video);
        adoptions.push({ creatorId: video.creatorId, unit: key, at: video.postedAt });
      }
    }
    const trendsetters = o.methods.includes("lead-lag") ? new Set(trendsetterScores(adoptions, { minAdopters: 5, minUnits: 3 }).filter((score) => score.z >= 2).map((score) => score.creatorId)) : new Set<string>();
    for (const [key, byCreator] of visibleFirst) {
      const adopterTimes = [...byCreator.values()];
      const recentAdopters = adopterTimes.filter((at) => at >= t - o.lookbackDays * DAY_MS).length;
      if (recentAdopters < o.minAdopters) continue;
      const truth = firstUse.get(key);
      let target = 0;
      if (truth) for (const at of truth.values()) if (at >= t && at < t + o.horizonDays * DAY_MS) target += 1;
      const videos = recent.get(key) ?? [];
      const scored = videos.map((video) => ({ video, latest: view.latest(video.id) })).filter((entry) => entry.latest?.views !== null && entry.latest?.views !== undefined);
      const multipliers = scored.map((entry) => logMultiplierAt(view, entry.video, niches)?.logMultiplier).filter((value): value is number => value !== undefined);
      const vpf = scored.flatMap((entry) => {
        const followers = view.followersAt(entry.video.creatorId, Math.min(entry.video.postedAt!, t));
        return followers === null ? [] : [Math.log1p(entry.latest!.views!) - Math.log1p(followers)];
      });
      const scores: Record<string, number> = {
        "recent-adoption": adopterTimes.filter((at) => at >= t - 14 * DAY_MS).length,
        "raw-views": median(scored.map((entry) => Math.log1p(entry.latest!.views!))) ?? NULL_SCORE,
        "creator-multiplier": median(multipliers) ?? NULL_SCORE,
        "views-per-follower": median(vpf) ?? NULL_SCORE,
      };
      if (o.methods.includes("sir")) {
        const windowDays = 42;
        const start = t - windowDays * DAY_MS;
        const incidence = new Array<number>(windowDays).fill(0);
        let prior = 0;
        for (const at of adopterTimes) {
          if (at < start) prior += 1;
          else incidence[Math.min(windowDays - 1, Math.floor((at - start) / DAY_MS))] += 1;
        }
        const population = Math.max(activeByNiche.get(key.split("|")[0]!)?.size ?? 0, prior + incidence.reduce((a, b) => a + b, 0) + 1);
        const r = reproductionNumber({ incidence, generation, from: windowDays - 14, to: windowDays, population, priorAdopters: prior }).r;
        // Renewal forecast of the next horizon's adopters with depletion.
        let forecast = 0;
        if (r !== null) {
          const series = [...incidence];
          let cumulative = prior + incidence.reduce((a, b) => a + b, 0);
          for (let s = 0; s < o.horizonDays; s += 1) {
            const pressure = infectionPressure([...series, 0], generation)[series.length]!;
            const next = r * Math.max(0, population - cumulative) / population * pressure;
            series.push(next);
            cumulative += next;
            forecast += next;
          }
        }
        scores.sir = r === null ? NULL_SCORE : forecast;
      }
      if (o.methods.includes("lead-lag")) {
        let leaders = 0;
        for (const [creatorId, at] of byCreator) if (trendsetters.has(creatorId) && at >= t - o.lookbackDays * DAY_MS) leaders += 1;
        scores["lead-lag"] = leaders + 0.01 * scores["recent-adoption"]!;
      }
      items.push({ side, group: `t${t}`, cluster: key, target, scores });
    }
  }
  counts.units = new Set(items.map((item) => item.cluster)).size;
  // Positives: the true top-k units per decision time (target > 0).
  const groups = new Map<string, Item[]>();
  for (const item of items) (groups.get(item.group) ?? groups.set(item.group, []).get(item.group)!).push(item);
  const positive = new Set<Item>();
  for (const list of groups.values()) {
    const kth = [...list].map((item) => item.target).sort((a, b) => b - a)[o.k - 1] ?? 0;
    for (const item of list) if (item.target > 0 && item.target >= kth) positive.add(item);
  }
  const testItems = items.filter((item) => item.side === "test");
  if (testItems.length === 0 || items.filter((item) => item.side === "train").length === 0) {
    return emptyResult("format-spread", ctx, metric, "not-enough-history", `no units with >= ${o.minAdopters} adopters on one side of the split (units seen: ${counts.units})`, counts);
  }
  const scorerIds = Object.keys(items[0]!.scores);
  const ranked = (id: string, side: string) => items.filter((item) => item.side === side).map((item) => ({ score: item.scores[id] ?? NULL_SCORE, positive: positive.has(item), group: item.group, cluster: item.cluster }));
  const baselineIds = ["recent-adoption", "raw-views", "creator-multiplier", "views-per-follower"];
  const rows: ScorerRow[] = scorerIds.map((id) => {
    const perGroupIc = [...groups.values()].map((list) => list.filter((item) => item.side === "test")).filter((list) => list.length >= 3)
      .map((list) => spearman(list.map((item) => item.scores[id] ?? NULL_SCORE), list.map((item) => Math.log1p(item.target)))).filter((value): value is number => value !== null);
    return {
      scorer: id,
      kind: baselineIds.includes(id) ? "baseline" : "method",
      weight: null,
      train: topK(ranked(id, "train"), o.k).precision,
      test: topK(ranked(id, "test"), o.k).precision,
      extra: { meanIc: mean(perGroupIc), testUnits: testItems.length },
    };
  });
  const { best, lifts } = liftRows({
    ctx,
    higherIsBetter: true,
    statistic: (list) => topK(list, o.k).precision,
    baselines: baselineIds.map((id) => ({ id, items: byCluster(ranked(id, "test")), value: rows.find((row) => row.scorer === id)?.test ?? null })),
    methods: scorerIds.filter((id) => !baselineIds.includes(id)).map((id) => ({ id, items: byCluster(ranked(id, "test")) })),
  });
  return { task: "format-spread", status: "computed", reason: null, preliminary: ctx.preliminary, datasetVersion: ctx.datasetVersion, metric, higherIsBetter: true, split: splitSummary(ctx.split), counts, rows, bestBaseline: best, lifts, notes: ["recent-adoption (new adopters in the last 14 days) is an extra naive baseline"] };
}

// ─── Task 3: small-account transferability ─────────────────────────────────

export interface TransferOptions {
  axis: LabelAxis;
  smallMaxFollowers: number;
  breakoutMultiplier: number;
  horizonDays: number;
  minFollowers: number;
}

export const DEFAULT_TRANSFER: TransferOptions = { axis: "format", smallMaxFollowers: 100_000, breakoutMultiplier: 10, horizonDays: 28, minFollowers: 2 };

export function runSmallAccountTransfer(ctx: TaskContext, options: Partial<TransferOptions> = {}): TaskResult {
  const o = merge(DEFAULT_TRANSFER, options);
  const metric = `transfer rate: share of units whose later videos by larger creators (>= ${o.smallMaxFollowers} followers) beat those creators' baselines within ${o.horizonDays} days (axis: ${o.axis})`;
  const times = decisionTimes(ctx, 14, o.horizonDays);
  const counts = { decisionTimes: times.length, breakoutUnits: 0, controlUnits: 0, train: 0, test: 0, purged: 0, outside: 0 };
  if (times.length < 2) return emptyResult("small-account-transfer", ctx, metric, "not-enough-history", `needs >= 2 weekly decision times with 14 days of lookback and a ${o.horizonDays}-day horizon; have ${times.length}`, counts);
  type Item = { side: string; cluster: string; breakout: boolean; transferred: boolean; lift: number };
  const items: Item[] = [];
  const largerVideos = ctx.oracle.videos().filter((video) => video.postedAt !== null && (ctx.oracle.followersNear(video.creatorId, video.postedAt) ?? 0) >= o.smallMaxFollowers);
  for (const t of times) {
    const side = sideOf(ctx.split, t, t + (o.horizonDays + 28) * DAY_MS);
    counts[side] += 1;
    if (side !== "train" && side !== "test") continue;
    const view = ctx.index.view(t);
    const niches = nicheMedians(view);
    const seen = new Map<string, boolean>();
    for (const video of view.videos()) {
      if (video.postedAt === null || video.postedAt < t - 14 * DAY_MS || video.postedAt >= t - 7 * DAY_MS) continue;
      const followers = view.followersAt(video.creatorId, video.postedAt);
      if (followers === null || followers >= o.smallMaxFollowers) continue;
      const scored = logMultiplierAt(view, video, niches);
      if (!scored || scored.n < 3) continue;
      const breakout = scored.logMultiplier >= Math.log(o.breakoutMultiplier);
      const control = scored.logMultiplier >= Math.log(0.5) && scored.logMultiplier < Math.log(2);
      if (!breakout && !control) continue;
      for (const unit of view.units(video.id, o.axis)) {
        const key = unitKey(view.creator(video.creatorId)?.niche ?? null, unit);
        seen.set(key, (seen.get(key) ?? false) || breakout);
      }
    }
    for (const [key, breakout] of seen) {
      const later = largerVideos.filter((video) => video.postedAt! >= t && video.postedAt! < t + o.horizonDays * DAY_MS && ctx.oracle.units(video.id, o.axis).some((unit) => unitKey(ctx.oracle.niche(video.creatorId), unit) === key));
      const outcomes = later.map((video) => ctx.oracle.outcome(video.id)?.logMultiplier).filter((value): value is number => value !== undefined);
      if (new Set(later.map((video) => video.creatorId)).size < o.minFollowers || outcomes.length < 2) continue;
      const lift = mean(outcomes)!;
      items.push({ side, cluster: key, breakout, transferred: lift > 0, lift });
      counts[breakout ? "breakoutUnits" : "controlUnits"] += 1;
    }
  }
  const rate = (list: Item[]) => (list.length === 0 ? null : list.filter((item) => item.transferred).length / list.length);
  const test = items.filter((item) => item.side === "test");
  const train = items.filter((item) => item.side === "train");
  if (test.filter((item) => item.breakout).length < 3 || test.filter((item) => !item.breakout).length < 3) {
    return { ...emptyResult("small-account-transfer", ctx, metric, "not-enough-history", `needs >= 3 breakout and 3 control units with larger-creator follow-ups in the held-out period; have ${test.filter((item) => item.breakout).length} / ${test.filter((item) => !item.breakout).length}`, counts) };
  }
  const clusters = [...new Set(test.map((item) => item.cluster))].sort();
  const byKey = new Map<string, Item[]>();
  for (const item of test) (byKey.get(item.cluster) ?? byKey.set(item.cluster, []).get(item.cluster)!).push(item);
  const interval = bootstrapLift({
    clusters: clusters.length,
    replicates: ctx.replicates,
    seed: `${ctx.seed}:transfer`,
    stat: (sample) => {
      const list = sample.flatMap((index) => byKey.get(clusters[index]!) ?? []);
      return { method: rate(list.filter((item) => item.breakout)), baseline: rate(list.filter((item) => !item.breakout)) };
    },
  });
  return {
    task: "small-account-transfer",
    status: "computed",
    reason: null,
    preliminary: ctx.preliminary,
    datasetVersion: ctx.datasetVersion,
    metric,
    higherIsBetter: true,
    split: splitSummary(ctx.split),
    counts,
    rows: [
      { scorer: "small-account-breakout-units", kind: "method", weight: null, train: rate(train.filter((item) => item.breakout)), test: rate(test.filter((item) => item.breakout)), extra: { meanLift: mean(test.filter((item) => item.breakout).map((item) => item.lift)) } },
      { scorer: "small-account-normal-units", kind: "baseline", weight: null, train: rate(train.filter((item) => !item.breakout)), test: rate(test.filter((item) => !item.breakout)), extra: { meanLift: mean(test.filter((item) => !item.breakout).map((item) => item.lift)) } },
    ],
    bestBaseline: "small-account-normal-units",
    lifts: [{ method: "small-account-breakout-units", versus: "small-account-normal-units", interval, rule: adoptionRule(interval, { margin: ctx.margin, preliminary: ctx.preliminary }) }],
    notes: ["control = units of small-account videos at 0.5-2x their baseline in the same week"],
  };
}

// ─── Task 4: copyability ranking check (#576) ──────────────────────────────

export interface CopyabilityCheckOptions {
  axis: LabelAxis;
  k: number;
  horizonDays: number;
  noiseFloorViews: number;
}

export const DEFAULT_COPYABILITY_CHECK: CopyabilityCheckOptions = { axis: "format", k: 10, horizonDays: 28, noiseFloorViews: 50_000 };

export function runCopyabilityCheck(ctx: TaskContext, options: Partial<CopyabilityCheckOptions> = {}): TaskResult {
  const o = merge(DEFAULT_COPYABILITY_CHECK, options);
  const metric = `precision@${o.k} per decision week: top references whose ${o.axis} later beats other creators' baselines within ${o.horizonDays} days`;
  const times = decisionTimes(ctx, 30, o.horizonDays);
  const counts = { decisionTimes: times.length, references: 0, train: 0, test: 0, purged: 0, outside: 0 };
  if (times.length < 2) return emptyResult("copyability", ctx, metric, "not-enough-history", `needs >= 2 weekly decision times with 30 days of lookback and a ${o.horizonDays}-day horizon; have ${times.length}`, counts);
  type Item = RankedItem & { cluster: string; side: string; scorer: string };
  const items: Item[] = [];
  const later = ctx.oracle.videos().filter((video) => video.postedAt !== null);
  for (const t of times) {
    const side = sideOf(ctx.split, t, t + (o.horizonDays + 28) * DAY_MS);
    counts[side] += 1;
    if (side !== "train" && side !== "test") continue;
    const view = ctx.index.view(t);
    const niches = nicheMedians(view);
    const candidates: Array<CopyCandidate & { cluster: string; target: number; logMultiplier: number; logViews: number; vpf: number | null }> = [];
    const followUps = later.filter((video) => video.postedAt! >= t && video.postedAt! < t + o.horizonDays * DAY_MS);
    const followUpByKey = new Map<string, Array<{ creatorId: string; lift: number }>>();
    for (const video of followUps) {
      const outcome = ctx.oracle.outcome(video.id);
      if (!outcome) continue;
      for (const unit of ctx.oracle.units(video.id, o.axis)) {
        const key = unitKey(ctx.oracle.niche(video.creatorId), unit);
        (followUpByKey.get(key) ?? followUpByKey.set(key, []).get(key)!).push({ creatorId: video.creatorId, lift: outcome.logMultiplier });
      }
    }
    for (const video of view.videos()) {
      if (video.postedAt === null || video.postedAt < t - 30 * DAY_MS || video.postedAt >= t - 7 * DAY_MS) continue;
      const units = view.units(video.id, o.axis);
      if (units.length === 0) continue;
      const scored = logMultiplierAt(view, video, niches);
      if (!scored || scored.ageHours < 168) continue;
      const key = unitKey(view.creator(video.creatorId)?.niche ?? null, units[0]!);
      const others = (followUpByKey.get(key) ?? []).filter((entry) => entry.creatorId !== video.creatorId);
      if (others.length < 2) continue;
      const followers = view.followersAt(video.creatorId, video.postedAt);
      candidates.push({
        videoId: video.id,
        creatorId: video.creatorId,
        multiplier: Math.exp(scored.logMultiplier),
        views: scored.views,
        followers,
        sizeBand: sizeBandAt(view, video) ?? sizeBandFor(followers),
        format: o.axis === "format" ? units[0]! : null,
        hook: o.axis === "hook" ? units[0]! : null,
        thin: scored.n < 8,
        cluster: video.creatorId,
        target: mean(others.map((entry) => entry.lift))!,
        logMultiplier: scored.logMultiplier,
        logViews: Math.log1p(scored.views),
        vpf: followers === null ? null : Math.log1p(scored.views) - Math.log1p(followers),
      });
    }
    counts.references += candidates.length;
    const copy = new Map(rankCopyability(candidates, { noiseFloorViews: o.noiseFloorViews }).ranked.map((entry) => [entry.candidate.videoId, entry.score]));
    for (const candidate of candidates) {
      const base = { positive: candidate.target > 0, group: `t${t}`, cluster: candidate.cluster, side };
      items.push({ ...base, scorer: "copyability", score: copy.get(candidate.videoId) ?? NULL_SCORE });
      items.push({ ...base, scorer: "raw-views", score: candidate.logViews });
      items.push({ ...base, scorer: "creator-multiplier", score: candidate.logMultiplier });
      items.push({ ...base, scorer: "views-per-follower", score: candidate.vpf ?? NULL_SCORE });
    }
  }
  const pick = (scorer: string, side: string) => items.filter((item) => item.scorer === scorer && item.side === side);
  if (pick("raw-views", "test").length < o.k || pick("raw-views", "train").length < o.k) {
    return emptyResult("copyability", ctx, metric, "not-enough-history", `needs >= ${o.k} mature references with >= 2 later same-unit videos by other creators on each side; have train ${pick("raw-views", "train").length}, test ${pick("raw-views", "test").length}`, counts);
  }
  const ids = ["copyability", "raw-views", "creator-multiplier", "views-per-follower"];
  const rows: ScorerRow[] = ids.map((id) => ({
    scorer: id,
    kind: id === "copyability" ? "method" : "baseline",
    weight: null,
    train: topK(pick(id, "train"), o.k).precision,
    test: topK(pick(id, "test"), o.k).precision,
    extra: { references: pick(id, "test").length, baseRate: mean(pick(id, "test").map((item) => (item.positive ? 1 : 0))) },
  }));
  const { best, lifts } = liftRows({
    ctx,
    higherIsBetter: true,
    statistic: (list) => topK(list, o.k).precision,
    baselines: ids.slice(1).map((id) => ({ id, items: byCluster(pick(id, "test")), value: rows.find((row) => row.scorer === id)!.test })),
    methods: [{ id: "copyability", items: byCluster(pick("copyability", "test")) }],
  });
  return { task: "copyability", status: "computed", reason: null, preliminary: ctx.preliminary, datasetVersion: ctx.datasetVersion, metric, higherIsBetter: true, split: splitSummary(ctx.split), counts, rows, bestBaseline: best, lifts, notes: ["copyability = the #576 default rankCopyability score (the ranking under check)"] };
}

// ─── Task 5: near-miss repair (stub) ───────────────────────────────────────

export function runNearMissRepair(ctx: TaskContext): TaskResult {
  return emptyResult(
    "near-miss-repair",
    ctx,
    "outcome of a reshoot of a near-miss topic with a different hook vs the original",
    "needs-natural-experiment-data",
    "needs natural-experiment data: matched pairs where a creator reshoots a near-miss topic with a different hook (topic matching from #557 digests and hook labels); not built in this pass",
  );
}

// ─── Experiment: breakout threshold calibration (GPD vs fixed vs p98) ──────

export function runThresholdCalibration(ctx: TaskContext, options: { exceedance?: number; minTrain?: number } = {}): TaskResult {
  const p = options.exceedance ?? 0.02;
  const minTrain = options.minTrain ?? 200;
  const metric = `mean |held-out exceedance rate - ${p}| across niches (lower is better)`;
  const byNiche = new Map<string, { train: number[]; test: Array<{ value: number; creatorId: string }> }>();
  for (const outcome of ctx.oracle.all()) {
    if (outcome.baselineN < 8) continue;
    const niche = ctx.oracle.niche(outcome.creatorId) ?? "unknown";
    const entry = byNiche.get(niche) ?? byNiche.set(niche, { train: [], test: [] }).get(niche)!;
    if (outcome.knownAt < ctx.split.testStart && outcome.postedAt >= ctx.split.periodStart) entry.train.push(outcome.logMultiplier);
    else if (outcome.postedAt >= ctx.split.testStart && outcome.knownAt <= ctx.split.periodEnd) entry.test.push({ value: outcome.logMultiplier, creatorId: outcome.creatorId });
  }
  const usable = [...byNiche].filter(([, entry]) => entry.train.length >= minTrain && entry.test.length >= 50);
  const counts = { niches: byNiche.size, usableNiches: usable.length, trainVideos: usable.reduce((sum, [, entry]) => sum + entry.train.length, 0), testVideos: usable.reduce((sum, [, entry]) => sum + entry.test.length, 0) };
  if (usable.length === 0) return emptyResult("threshold-calibration", ctx, metric, "not-enough-history", `needs a niche with >= ${minTrain} training and >= 50 held-out videos with 28-day outcomes and non-thin baselines`, counts, false);
  const sortedQuantile = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    const position = q * (sorted.length - 1);
    return sorted[Math.floor(position)]! + (sorted[Math.ceil(position)]! - sorted[Math.floor(position)]!) * (position - Math.floor(position));
  };
  const thresholds: Record<string, (train: number[]) => number | null> = {
    "fixed-10x": () => Math.log(10),
    "p98-floor-10x": (train) => Math.max(Math.log(10), sortedQuantile(train, 1 - p)),
    "p98": (train) => sortedQuantile(train, 1 - p),
    "gpd-pot": (train) => potThreshold(train, { exceedance: p, thresholdQuantile: 0.9 })?.threshold ?? null,
  };
  const perNiche = usable.map(([niche, entry]) => ({ niche, entry, cuts: Object.fromEntries(Object.entries(thresholds).map(([id, fn]) => [id, fn(entry.train)])) as Record<string, number | null> }));
  const calibration = (id: string, sample?: Map<string, Array<{ value: number; creatorId: string }>>) => {
    const errors = perNiche.flatMap(({ niche, entry, cuts }) => {
      const cut = cuts[id];
      const test = sample ? sample.get(niche) ?? [] : entry.test;
      if (cut === null || cut === undefined || test.length === 0) return [];
      return [Math.abs(test.filter((item) => item.value >= cut).length / test.length - p)];
    });
    return mean(errors);
  };
  const rows: ScorerRow[] = Object.keys(thresholds).map((id) => ({
    scorer: id,
    kind: id === "gpd-pot" ? "method" : "baseline",
    weight: null,
    train: null,
    test: calibration(id),
    extra: Object.fromEntries(perNiche.map(({ niche, cuts }) => [`cut:${niche}`, cuts[id] === null ? null : Math.round(Math.exp(cuts[id]!) * 100) / 100])),
  }));
  const baselineRows = rows.filter((row) => row.kind === "baseline" && row.test !== null);
  const best = baselineRows.reduce((a, b) => (b.test! < a.test! ? b : a));
  const creators = [...new Set(perNiche.flatMap(({ entry }) => entry.test.map((item) => item.creatorId)))].sort();
  const interval = bootstrapLift({
    clusters: creators.length,
    replicates: ctx.replicates,
    seed: `${ctx.seed}:gpd`,
    stat: (sample) => {
      const chosen = new Map<string, number>();
      for (const index of sample) chosen.set(creators[index]!, (chosen.get(creators[index]!) ?? 0) + 1);
      const resampled = new Map(perNiche.map(({ niche, entry }) => [niche, entry.test.flatMap((item) => Array.from({ length: chosen.get(item.creatorId) ?? 0 }, () => item))]));
      const method = calibration("gpd-pot", resampled);
      const baseline = calibration(best.scorer, resampled);
      // Error reduction relative to the baseline error (positive = better).
      return { method: method === null || baseline === null ? null : 2 * baseline - method, baseline };
    },
  });
  return {
    task: "threshold-calibration",
    status: "computed",
    reason: null,
    preliminary: ctx.preliminary,
    datasetVersion: ctx.datasetVersion,
    metric,
    higherIsBetter: false,
    split: splitSummary(ctx.split),
    counts,
    rows,
    bestBaseline: best.scorer,
    lifts: [{ method: "gpd-pot", versus: best.scorer, interval, rule: adoptionRule(interval, { margin: ctx.margin, preliminary: ctx.preliminary }) }],
    notes: ["lift = relative reduction of the calibration error; thresholds fit on outcomes known before the held-out start"],
  };
}

// ─── Experiment: creator baseline accuracy (Kalman / CUSUM / halo vs rolling median) ──

export function runBaselineAccuracy(ctx: TaskContext, options: { methods?: string[] } = {}): TaskResult {
  const methods = options.methods ?? ["kalman", "cusum", "halo"];
  const metric = "mean |ln(1 + 28-day views) - predicted creator baseline| (lower is better), baseline predicted at post time";
  const outcomes = ctx.oracle.all().filter((outcome) => outcome.postedAt >= ctx.split.periodStart);
  const fitView = ctx.index.view(ctx.split.testStart);
  const series: number[][] = [];
  const haloInput: HaloVideo[][] = [];
  for (const creator of fitView.creators()) {
    const values: number[] = [];
    const halo: HaloVideo[] = [];
    for (const video of fitView.creatorVideos(creator.id)) {
      const latest = fitView.latest(video.id);
      if (video.postedAt === null || !latest || latest.ageHours === null || latest.ageHours < 72) continue;
      const x = projectedLog(latest, video.platform);
      if (x === null) continue;
      const prior = values.slice(-15);
      halo.push({ postedAt: video.postedAt, x, hit: prior.length >= 5 && x - median(prior)! >= Math.log(10) });
      values.push(x);
    }
    if (values.length >= 5) series.push(values);
    haloInput.push(halo);
  }
  const counts = { outcomes: outcomes.length, fitCreators: series.length, train: 0, test: 0 };
  if (series.length < 10) return emptyResult("baseline-accuracy", ctx, metric, "not-enough-history", `needs >= 10 creators with >= 5 videos aged 72 h+ before the held-out start to fit (q, r); have ${series.length}`, counts, false);
  const kalmanParams = { ...fitLocalLevel(series, { steps: 15 }), huber: 2.5 };
  const haloFit = estimateHalo(haloInput);
  type Item = { cluster: string; errors: Record<string, number> };
  const items: Item[] = [];
  for (const outcome of outcomes) {
    if (outcome.postedAt < ctx.split.testStart || outcome.knownAt > ctx.split.periodEnd) {
      if (outcome.knownAt < ctx.split.testStart) counts.train += 1;
      continue;
    }
    const view = ctx.index.view(outcome.postedAt);
    const members = creatorWindow(view, outcome.creatorId, { postedAt: outcome.postedAt, id: outcome.videoId }).sort((a, b) => a.postedAt - b.postedAt);
    if (members.length < 5) continue;
    counts.test += 1;
    const xs = members.map((member) => member.x);
    const errors: Record<string, number> = { "rolling-median": Math.abs(outcome.logViews - median(xs)!) };
    if (methods.includes("kalman")) {
      const run = localLevel(xs, kalmanParams);
      errors.kalman = Math.abs(outcome.logViews - run.filtered[run.filtered.length - 1]!);
    }
    if (methods.includes("cusum")) {
      const start = xs.length >= 12 ? currentRegimeStart(xs, { k: 0.5, h: 5, warmup: 8 }) : 0;
      const regime = xs.length - start >= 5 ? xs.slice(start) : xs;
      errors.cusum = Math.abs(outcome.logViews - median(regime)!);
    }
    if (methods.includes("halo") && haloFit && haloFit.h0 > 0) {
      const prior: number[] = [];
      let lastHit: number | null = null;
      const corrected: number[] = [];
      for (const member of members) {
        const window = prior.slice(-15);
        const hit = window.length >= 5 && member.x - median(window)! >= Math.log(10);
        corrected.push(member.x - haloCorrection(haloFit, lastHit === null ? null : (member.postedAt - lastHit) / DAY_MS));
        if (hit) lastHit = member.postedAt;
        prior.push(member.x);
      }
      const expectedHalo = haloCorrection(haloFit, lastHit === null ? null : (outcome.postedAt - lastHit) / DAY_MS);
      errors.halo = Math.abs(outcome.logViews - (median(corrected)! + expectedHalo));
    }
    items.push({ cluster: outcome.creatorId, errors });
  }
  if (items.length < 30) return emptyResult("baseline-accuracy", ctx, metric, "not-enough-history", `needs >= 30 held-out videos with 28-day outcomes and >= 5 visible prior videos; have ${items.length}`, counts, false);
  const ids = Object.keys(items[0]!.errors);
  const mae = (id: string, list: Item[]) => mean(list.flatMap((item) => (item.errors[id] === undefined ? [] : [item.errors[id]!])));
  const rows: ScorerRow[] = ids.map((id) => ({ scorer: id, kind: id === "rolling-median" ? "baseline" : "method", weight: null, train: null, test: mae(id, items), extra: { videos: items.filter((item) => item.errors[id] !== undefined).length } }));
  const clusters = [...new Set(items.map((item) => item.cluster))].sort();
  const byKey = new Map<string, Item[]>();
  for (const item of items) (byKey.get(item.cluster) ?? byKey.set(item.cluster, []).get(item.cluster)!).push(item);
  const lifts: LiftRow[] = ids.filter((id) => id !== "rolling-median").map((id) => {
    const interval = bootstrapLift({
      clusters: clusters.length,
      replicates: ctx.replicates,
      seed: `${ctx.seed}:baseline:${id}`,
      stat: (sample) => {
        const list = sample.flatMap((index) => byKey.get(clusters[index]!) ?? []).filter((item) => item.errors[id] !== undefined);
        const method = mae(id, list);
        const baseline = mae("rolling-median", list);
        return { method: method === null || baseline === null ? null : 2 * baseline - method, baseline };
      },
    });
    return { method: id, versus: "rolling-median", interval, rule: adoptionRule(interval, { margin: ctx.margin, preliminary: ctx.preliminary }) };
  });
  return {
    task: "baseline-accuracy",
    status: "computed",
    reason: null,
    preliminary: ctx.preliminary,
    datasetVersion: ctx.datasetVersion,
    metric,
    higherIsBetter: false,
    split: splitSummary(ctx.split),
    counts,
    rows,
    bestBaseline: "rolling-median",
    lifts,
    notes: [`kalman q=${round(kalmanParams.q)}, r=${round(kalmanParams.r)}; halo ${haloFit ? `h0=${round(haloFit.h0)}, tau=${round(haloFit.tauDays)} d (n=${haloFit.n})` : "not fitted"}; parameters fit on data visible at the held-out start`],
  };
}

// ─── Experiment: bandit replay ─────────────────────────────────────────────

export function runBanditReplay(ctx: TaskContext, options: { axis?: LabelAxis; arms?: number; gamma?: number; strongMultiplier?: number } = {}): TaskResult {
  const axis = options.axis ?? "format";
  const armCount = options.arms ?? 6;
  const strong = Math.log(options.strongMultiplier ?? 3);
  const metric = `replayed rate of ${options.strongMultiplier ?? 3}x+ outcomes for the units a policy picks (self-normalized IPS, delayed 28-day feedback; axis: ${axis})`;
  const events = ctx.oracle.all()
    .filter((outcome) => outcome.postedAt >= ctx.split.periodStart && outcome.knownAt <= ctx.split.periodEnd)
    .flatMap((outcome) => {
      const unit = ctx.oracle.units(outcome.videoId, axis)[0];
      return unit ? [{ outcome, unit }] : [];
    })
    .sort((a, b) => a.outcome.postedAt - b.outcome.postedAt || (a.outcome.videoId < b.outcome.videoId ? -1 : 1));
  const train = events.filter((event) => event.outcome.knownAt < ctx.split.testStart);
  const test = events.filter((event) => event.outcome.postedAt >= ctx.split.testStart);
  const frequency = new Map<string, number>();
  for (const event of train) frequency.set(event.unit, (frequency.get(event.unit) ?? 0) + 1);
  const arms = [...frequency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, armCount).map(([unit]) => unit);
  const counts = { trainEvents: train.length, testEvents: test.length, arms: arms.length };
  const inArms = (list: typeof events) => list.filter((event) => arms.includes(event.unit));
  if (arms.length < 2 || inArms(test).length < 100 || inArms(train).length < 100) {
    return emptyResult("bandit-replay", ctx, metric, "not-enough-history", `needs >= 2 arms and >= 100 train and held-out events with 28-day outcomes; have ${arms.length} arms, train ${inArms(train).length}, test ${inArms(test).length}`, counts);
  }
  const features = oneHotArms(arms.length);
  const trainArms = inArms(train);
  const propensity = arms.map((unit) => trainArms.filter((event) => event.unit === unit).length / trainArms.length);
  const prior = arms.map((unit) => {
    const list = trainArms.filter((event) => event.unit === unit);
    return list.filter((event) => event.outcome.logMultiplier >= strong).length / Math.max(1, list.length);
  });
  const bestArm = prior.indexOf(Math.max(...prior));
  const replayEvents = (list: typeof events): ReplayEvent[] =>
    inArms(list).map((event) => {
      const logged = arms.indexOf(event.unit);
      return { arms: features, logged, reward: event.outcome.logMultiplier >= strong ? 1 : 0, propensity: propensity[logged]! };
    });
  // Delayed feedback: an update applies once the replay clock passes the outcome time.
  const delayed = (policy: Policy, list: typeof events, seed: string) => {
    const queue: Array<{ at: number; x: readonly number[]; reward: number }> = [];
    const wrapped: Policy = {
      name: policy.name,
      choose: (choices, prng) => policy.choose(choices, prng),
      update: (x, reward) => queue.push({ at: clock + 28 * DAY_MS, x, reward }),
    };
    let clock = 0;
    const replayList = replayEvents(list);
    const timed = inArms(list);
    const prng = makePrng(seed);
    let matched = 0;
    let weighted = 0;
    let weights = 0;
    replayList.forEach((event, index) => {
      clock = timed[index]!.outcome.postedAt;
      while (queue.length > 0 && queue[0]!.at <= clock) {
        const next = queue.shift()!;
        policy.update(next.x, next.reward);
      }
      const result = replay([event], wrapped, prng);
      if (result.matched > 0) {
        matched += 1;
        const weight = 1 / Math.max(event.propensity ?? 1 / arms.length, 1e-6);
        weighted += weight * event.reward;
        weights += weight;
      }
    });
    return { matched, mean: weights > 0 ? weighted / weights : null };
  };
  const make = (id: string): Policy => {
    if (id === "uniform") return uniformPolicy();
    if (id === "best-train-arm") return fixedPolicy(bestArm, "best-train-arm");
    if (id === "lin-ts-stationary") return discountedLinTs({ dimension: arms.length, gamma: 1, sigma: 0.3, priorMean: prior, lambda: 20 });
    return discountedLinTs({ dimension: arms.length, gamma: options.gamma ?? 0.995, sigma: 0.3, priorMean: prior, lambda: 20 });
  };
  const ids = ["uniform", "best-train-arm", "lin-ts-stationary", "lin-ts-discounted"];
  const rows: ScorerRow[] = ids.map((id) => {
    const result = delayed(make(id), test, `${ctx.seed}:${id}:b`);
    return { scorer: id, kind: id.startsWith("lin-ts") ? "method" : "baseline", weight: null, train: null, test: result.mean, extra: { matched: result.matched } };
  });
  const creators = [...new Set(inArms(test).map((event) => event.outcome.creatorId))].sort();
  const byCreator = new Map<string, typeof events>();
  for (const event of inArms(test)) (byCreator.get(event.outcome.creatorId) ?? byCreator.set(event.outcome.creatorId, []).get(event.outcome.creatorId)!).push(event);
  const baselineRows = rows.filter((row) => row.kind === "baseline" && row.test !== null);
  const best = baselineRows.reduce((a, b) => (b.test! > a.test! ? b : a));
  const lifts: LiftRow[] = ["lin-ts-discounted", "lin-ts-stationary"].map((id) => {
    const interval = bootstrapLift({
      clusters: creators.length,
      replicates: Math.min(ctx.replicates, 100),
      seed: `${ctx.seed}:bandit:${id}`,
      stat: (sample) => {
        const list = sample.flatMap((index) => byCreator.get(creators[index]!) ?? []).sort((a, b) => a.outcome.postedAt - b.outcome.postedAt || (a.outcome.videoId < b.outcome.videoId ? -1 : 1));
        return { method: delayed(make(id), list, `${ctx.seed}:${id}:b`).mean, baseline: delayed(make(best.scorer), list, `${ctx.seed}:${best.scorer}:b`).mean };
      },
    });
    return { method: id, versus: best.scorer, interval, rule: adoptionRule(interval, { margin: ctx.margin, preliminary: ctx.preliminary }) };
  });
  return {
    task: "bandit-replay",
    status: "computed",
    reason: null,
    preliminary: ctx.preliminary,
    datasetVersion: ctx.datasetVersion,
    metric,
    higherIsBetter: true,
    split: splitSummary(ctx.split),
    counts,
    rows,
    bestBaseline: best.scorer,
    lifts,
    notes: [`arms: ${arms.join(", ")}; corpus prior = training-period strong rate per arm; logging propensity = training share (creators do not post uniformly, so IPS is approximate)`],
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
