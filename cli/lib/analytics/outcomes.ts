// Outcome metrics (#558) — pure math over imported / pulled metric snapshots.
//
// One OBSERVATION = one Unit on one platform (the newest snapshot of its
// Publication there). Platforms are never pooled into one baseline: a TikTok
// view and a YouTube view are different currencies. Cross-platform tables use
// each observation's value RELATIVE to its own platform's baseline.
//
// HIT RATE is judged against the workspace's own past, not its present: an
// observation is a hit when its target metric beats the median of the
// preceding `window` observations on the same platform (ordered by post date).
// Comparing a unit to a median that includes itself would make the hit rate
// ~50% by construction; the prior-window rule makes it a trend ("are we
// beating our recent selves?"). An observation with fewer than `minPrior`
// predecessors has no baseline yet and is excluded from the rate, not counted
// as a miss. An absolute `hitThreshold` replaces the rolling rule when given.
//
// MINIMUM-N RULE: a decision value seen in fewer than `minN` observations gets
// verdict "insufficient data" and NO median or lift — the table states a
// sample size, never a claim it cannot support.
//
// COHORT BASELINES (#556): `CohortBaselineProvider` is the seam a trend corpus
// plugs into later. Without one the report says so; nothing is fabricated.

import { lengthBand } from "../selection.js";
import type { LedgerValue } from "./ledger.js";
import type { UnitOutcomeFactsDto, OutcomeObservationDto } from "../store/outcomes.js";

export const OUTCOME_METRICS = [
  "views",
  "avg-watch-pct",
  "completion",
  "engagement-rate",
  "save-rate",
  "share-rate",
] as const;
export type OutcomeMetric = (typeof OUTCOME_METRICS)[number];

export function isOutcomeMetric(value: unknown): value is OutcomeMetric {
  return typeof value === "string" && (OUTCOME_METRICS as readonly string[]).includes(value);
}

export interface Observation {
  unitId: string;
  slug: string;
  projectId: string | null;
  platform: string;
  publicationId: string;
  /** Ordering instant: post date, else publication date, else capture time. */
  at: number;
  atSource: "postedAt" | "publishedAt" | "capturedAt";
  metrics: Record<OutcomeMetric, number | null>;
  raw: {
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    follows: number | null;
    avgWatchTimeSec: number | null;
  };
  /** Metrics computed rather than read off the screen, with how. */
  derivations: string[];
  /** Readings the platform printed abbreviated ("12.3K"). */
  approximateFields: string[];
  decisions: Record<string, LedgerValue>;
  ledger: "stored" | "derived" | "none";
}

export interface DecisionsForUnit {
  decisions: Record<string, LedgerValue>;
  ledger: "stored" | "derived" | "none";
}

/** Flatten store facts into per-platform observations with outcome metrics. */
export function buildObservations(
  units: UnitOutcomeFactsDto[],
  decisionsFor: (unit: UnitOutcomeFactsDto) => DecisionsForUnit,
): Observation[] {
  const out: Observation[] = [];
  for (const unit of units) {
    if (unit.observations.length === 0) continue;
    const { decisions, ledger } = decisionsFor(unit);
    for (const observation of unit.observations) {
      out.push(toObservation(unit, observation, decisions, ledger));
    }
  }
  return out;
}

function toObservation(
  unit: UnitOutcomeFactsDto,
  observation: OutcomeObservationDto,
  decisions: Record<string, LedgerValue>,
  ledger: DecisionsForUnit["ledger"],
): Observation {
  const snapshot = observation.snapshot;
  const facts = observation.importFacts;
  const derivations: string[] = [];
  const views = snapshot.views;
  const likes = snapshot.likes;
  const comments = snapshot.comments;
  const shares = snapshot.shares;
  const saves = facts?.saves ?? null;
  const avgWatchTimeSec = snapshot.avgViewDurationSec ?? facts?.avgWatchTimeSec ?? null;
  const ledgerDuration = typeof decisions.duration_sec === "number" ? decisions.duration_sec : null;
  const videoDuration = facts?.videoDurationSec ?? ledgerDuration;

  let avgWatchPct = facts?.avgWatchPct ?? null;
  if (avgWatchPct === null && avgWatchTimeSec !== null && videoDuration) {
    avgWatchPct = round((avgWatchTimeSec / videoDuration) * 100);
    derivations.push(
      `avg-watch-pct = avg watch time / ${facts?.videoDurationSec ? "video length" : "ledger duration_sec"}`,
    );
  }
  let completion = facts?.completionPct ?? null;
  if (completion === null && facts?.retention && facts.retention.length > 0 && videoDuration) {
    const tail = [...facts.retention].sort((a, b) => a.t - b.t).filter((point) => point.t >= videoDuration - 1);
    if (tail.length > 0) {
      completion = Math.min(100, tail[tail.length - 1]!.pct);
      derivations.push("completion = retention at the final second");
    }
  }
  const components = [likes, comments, shares, saves];
  const known = components.filter((value): value is number => value !== null);
  let engagementRate: number | null = null;
  if (views !== null && views > 0 && known.length > 0) {
    engagementRate = round((known.reduce((sum, value) => sum + value, 0) / views) * 100);
    if (known.length < components.length) {
      const missing = ["likes", "comments", "shares", "saves"].filter((_, index) => components[index] === null);
      derivations.push(`engagement-rate excludes unreported ${missing.join(", ")}`);
    }
  }
  const rate = (value: number | null) => (views !== null && views > 0 && value !== null ? round((value / views) * 100) : null);

  const postedAt = facts?.postedAt ?? null;
  const at = postedAt ?? observation.publishedAt ?? facts?.capturedAt ?? snapshot.asOf;
  const atSource: Observation["atSource"] = postedAt !== null
    ? "postedAt"
    : observation.publishedAt !== null
      ? "publishedAt"
      : "capturedAt";
  return {
    unitId: unit.unitId,
    slug: unit.slug,
    projectId: unit.projectId,
    platform: observation.platform,
    publicationId: observation.publicationId,
    at,
    atSource,
    metrics: {
      views,
      "avg-watch-pct": avgWatchPct,
      completion,
      "engagement-rate": engagementRate,
      "save-rate": rate(saves),
      "share-rate": rate(shares),
    },
    raw: { views, likes, comments, shares, saves, follows: facts?.follows ?? null, avgWatchTimeSec },
    derivations,
    approximateFields: facts?.approximateFields ?? [],
    decisions,
    ledger,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function chronological(observations: Observation[]): Observation[] {
  return [...observations].sort((a, b) => a.at - b.at || a.unitId.localeCompare(b.unitId) || a.publicationId.localeCompare(b.publicationId));
}

function byPlatform(observations: Observation[]): Map<string, Observation[]> {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const list = groups.get(observation.platform) ?? [];
    list.push(observation);
    groups.set(observation.platform, list);
  }
  return groups;
}

export interface BaselineOptions {
  /** Rolling window: how many most-recent observations a baseline spans. */
  window: number;
  /** Prior observations required before a rolling baseline exists. */
  minPrior: number;
}

export interface PlatformBaseline {
  platform: string;
  /** Observations on this platform (any metric). */
  observations: number;
  /** Median of the most recent `window` observations, per metric (null = no data). */
  current: Record<OutcomeMetric, { median: number | null; n: number }>;
}

/** The workspace's current baseline per platform: rolling median over the last `window`. */
export function currentBaselines(observations: Observation[], window: number): PlatformBaseline[] {
  const out: PlatformBaseline[] = [];
  for (const [platform, group] of [...byPlatform(observations)].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = chronological(group);
    const current = {} as PlatformBaseline["current"];
    for (const metric of OUTCOME_METRICS) {
      const values = ordered.map((observation) => observation.metrics[metric]).filter(isNumber).slice(-window);
      const middle = median(values);
      current[metric] = { median: middle === null ? null : round(middle), n: values.length };
    }
    out.push({ platform, observations: group.length, current });
  }
  return out;
}

export interface HitEvaluation {
  /** Baseline the observation was judged against (null = not judged). */
  baseline: number | null;
  /** true / false when judged; null when no baseline existed yet or no value. */
  hit: boolean | null;
}

/** Judge each observation against its platform's PRIOR window (or an absolute threshold). */
export function evaluateHits(
  observations: Observation[],
  metric: OutcomeMetric,
  options: BaselineOptions & { hitThreshold?: number },
): Map<Observation, HitEvaluation> {
  const out = new Map<Observation, HitEvaluation>();
  for (const group of byPlatform(observations).values()) {
    const prior: number[] = [];
    for (const observation of chronological(group)) {
      const value = observation.metrics[metric];
      if (value === null) {
        out.set(observation, { baseline: null, hit: null });
        continue;
      }
      if (options.hitThreshold !== undefined) {
        out.set(observation, { baseline: options.hitThreshold, hit: value >= options.hitThreshold });
      } else {
        const window = prior.slice(-options.window);
        const baseline = window.length >= options.minPrior ? median(window) : null;
        out.set(observation, { baseline, hit: baseline === null ? null : value > baseline });
      }
      prior.push(value);
    }
  }
  return out;
}

export interface HitRateSummary {
  metric: OutcomeMetric;
  basis: string;
  evaluated: number;
  hits: number;
  rate: number | null;
  /** Observations with a value but no baseline yet (too few prior posts). */
  awaitingBaseline: number;
}

export function summarizeHits(
  observations: Observation[],
  evaluations: Map<Observation, HitEvaluation>,
  metric: OutcomeMetric,
  basis: string,
): HitRateSummary {
  let evaluated = 0;
  let hits = 0;
  let awaitingBaseline = 0;
  for (const observation of observations) {
    const evaluation = evaluations.get(observation);
    if (!evaluation || observation.metrics[metric] === null) continue;
    if (evaluation.hit === null) {
      awaitingBaseline += 1;
      continue;
    }
    evaluated += 1;
    if (evaluation.hit) hits += 1;
  }
  return {
    metric,
    basis,
    evaluated,
    hits,
    rate: evaluated > 0 ? round(hits / evaluated) : null,
    awaitingBaseline,
  };
}

export type DecisionVerdict = "over" | "under" | "in line" | "insufficient data" | "no baseline";

export interface DecisionRow {
  dimension: string;
  value: string;
  /** Observations with a target-metric value carrying this decision. */
  n: number;
  /** Distinct Units behind those observations. */
  units: number;
  /** Median raw target metric (null below the minimum n). */
  medianOutcome: number | null;
  /** Median of value / platform baseline, minus 1 (null below the minimum n). */
  lift: number | null;
  hitRate: number | null;
  verdict: DecisionVerdict;
}

export interface DecisionTableOptions {
  metric: OutcomeMetric;
  minN: number;
  /** |lift| at or above this is reported as over / under. */
  liftThreshold: number;
}

/**
 * Dimensions a decision value expands into for the table (numbers bucketed,
 * sets exploded). Platform is not a decision row: lift is measured against
 * each platform's own baseline, so a platform row would always read "in
 * line" — per-platform results live in the hit rate and baselines instead.
 */
export function decisionPairs(decisions: Record<string, LedgerValue>): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [dimension, value] of Object.entries(decisions)) {
    if (dimension === "duration_sec") {
      if (typeof value === "number" && !Object.hasOwn(decisions, "length_band")) {
        pairs.push(["length_band", lengthBand(value, "seconds")]);
      }
      continue;
    }
    if (Array.isArray(value)) for (const item of value) pairs.push([dimension, item]);
    else pairs.push([dimension, String(value)]);
  }
  return pairs;
}

export function decisionTable(
  observations: Observation[],
  baselines: PlatformBaseline[],
  evaluations: Map<Observation, HitEvaluation>,
  options: DecisionTableOptions,
): DecisionRow[] {
  const baselineFor = new Map(baselines.map((baseline) => [baseline.platform, baseline.current[options.metric].median]));
  const groups = new Map<string, { dimension: string; value: string; observations: Observation[] }>();
  for (const observation of observations) {
    if (observation.metrics[options.metric] === null) continue;
    for (const [dimension, value] of decisionPairs(observation.decisions)) {
      const key = `${dimension}\u0000${value}`;
      const group = groups.get(key) ?? { dimension, value, observations: [] };
      group.observations.push(observation);
      groups.set(key, group);
    }
  }
  const rows: DecisionRow[] = [];
  for (const group of groups.values()) {
    const n = group.observations.length;
    const units = new Set(group.observations.map((observation) => observation.unitId)).size;
    if (n < options.minN) {
      rows.push({ dimension: group.dimension, value: group.value, n, units, medianOutcome: null, lift: null, hitRate: null, verdict: "insufficient data" });
      continue;
    }
    const values = group.observations.map((observation) => observation.metrics[options.metric]!);
    const relative = group.observations.flatMap((observation) => {
      const baseline = baselineFor.get(observation.platform);
      return baseline !== null && baseline !== undefined && baseline > 0
        ? [observation.metrics[options.metric]! / baseline]
        : [];
    });
    const relativeMedian = relative.length >= options.minN ? median(relative) : null;
    const lift = relativeMedian === null ? null : round(relativeMedian - 1);
    const judged = group.observations.map((observation) => evaluations.get(observation)?.hit).filter((hit): hit is boolean => typeof hit === "boolean");
    const hitRate = judged.length > 0 ? round(judged.filter(Boolean).length / judged.length) : null;
    const verdict: DecisionVerdict = lift === null
      ? "no baseline"
      : lift >= options.liftThreshold
        ? "over"
        : lift <= -options.liftThreshold
          ? "under"
          : "in line";
    rows.push({ dimension: group.dimension, value: group.value, n, units, medianOutcome: round(median(values)!), lift, hitRate, verdict });
  }
  return rows.sort((a, b) =>
    a.dimension.localeCompare(b.dimension) ||
    rankLift(b.lift) - rankLift(a.lift) ||
    b.n - a.n ||
    a.value.localeCompare(b.value)
  );
}

function rankLift(lift: number | null): number {
  return lift === null ? Number.NEGATIVE_INFINITY : lift;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

// ─── #556 seam ───────────────────────────────────────────────────────────────

/**
 * External cohort baselines (#556 trend corpus): the median a comparable
 * creator cohort reaches on a platform for a metric. The report asks it for
 * each platform's current target metric and shows the workspace's position
 * against it. Return null when the cohort has no data — never a guess.
 */
export interface CohortBaselineProvider {
  readonly id: string;
  baseline(input: {
    platform: string;
    metric: OutcomeMetric;
    /** Optional cohort label (niche / format), when the caller knows one. */
    cohort?: string;
    /** Post age context: the median post date of the workspace sample. */
    postedAt?: number;
  }): { median: number; n: number; label: string } | null;
}
