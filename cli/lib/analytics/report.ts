// `ralphy analytics report` (#558) — outcome metrics + the decision-vs-outcome
// table for one workspace (or one project), from store facts only. Read-only.
//
// Units with a stored decision ledger use it; units without one get their
// ledger derived on the fly from the same artifacts `ralphy unit decisions`
// reads (flagged `ledger: "derived"`), so a fresh workspace still gets a
// table. Nothing is written here.

import {
  buildObservations,
  currentBaselines,
  decisionTable,
  evaluateHits,
  median,
  OUTCOME_METRICS,
  summarizeHits,
  type CohortBaselineProvider,
  type DecisionRow,
  type DecisionsForUnit,
  type Observation,
  type OutcomeMetric,
} from "./outcomes.js";
import { deriveDecisions, effectiveDecisions, gatherLedgerSources, parseLedgerBody } from "./ledger.js";
import { existsSync } from "node:fs";
import { domainDbPath } from "../store/db.js";
import {
  listUnitCommentDocuments,
  listUnitOutcomeFacts,
  type UnitLocationDto,
  type UnitOutcomeFactsDto,
} from "../store/outcomes.js";
import { parsePostCommentsBody, type PostCommentsBody } from "../schemas/post-comments.js";
import { commentSignalsSection, DEFAULT_COMMENT_SIGNAL_MIN_N } from "./comment-report.js";
import { unitContext } from "../unit-revision.js";
import type { QueryContext } from "../store/scope-context.js";

export interface OutcomeReportOptions {
  /** Target metric for the hit rate and the decision table. */
  metric: OutcomeMetric;
  /** Minimum observations before a decision value gets a claim. */
  minN: number;
  /** Rolling window (observations) for baselines. */
  window: number;
  /** Prior observations needed before a hit can be judged. */
  minPrior: number;
  /** |lift| at or above this reads as over / under. */
  liftThreshold: number;
  /** Absolute hit threshold on the target metric (replaces the rolling rule). */
  hitThreshold?: number;
  /** Restrict to one platform. */
  platform?: string;
  /** Derive ledgers on the fly for units without a stored one (default true). */
  deriveMissing?: boolean;
  cohort?: CohortBaselineProvider;
  /** Minimum analyzed comments per unit + platform before comment signals show (#582). */
  commentMinN?: number;
}

export const DEFAULT_REPORT_OPTIONS: OutcomeReportOptions = {
  metric: "views",
  minN: 3,
  window: 20,
  minPrior: 3,
  liftThreshold: 0.15,
};

const MAX_OBSERVATION_ROWS = 100;

export function buildOutcomeReport(input: {
  workspaceId: string;
  projectId: string | null;
  units: UnitOutcomeFactsDto[];
  decisionsFor: (unit: UnitOutcomeFactsDto) => DecisionsForUnit;
  options: OutcomeReportOptions;
  /** Stored post comments per Unit ID (#582); absent = none loaded. */
  comments?: Map<string, PostCommentsBody>;
  generatedAt?: string;
}) {
  const options = input.options;
  const all = buildObservations(input.units, input.decisionsFor);
  const observations = options.platform ? all.filter((entry) => entry.platform === options.platform) : all;
  const baselines = currentBaselines(observations, options.window);
  const evaluations = evaluateHits(observations, options.metric, options);
  const basis = options.hitThreshold !== undefined
    ? `${options.metric} >= ${options.hitThreshold} (absolute target)`
    : `${options.metric} above the median of the previous ${options.window} posts on the same platform (needs ${options.minPrior} prior)`;
  const hitRate = summarizeHits(observations, evaluations, options.metric, basis);
  const byPlatform = baselines.map((baseline) => {
    const group = observations.filter((entry) => entry.platform === baseline.platform);
    const summary = summarizeHits(group, evaluations, options.metric, basis);
    return {
      platform: baseline.platform,
      evaluated: summary.evaluated,
      hits: summary.hits,
      rate: summary.rate,
      awaitingBaseline: summary.awaitingBaseline,
    };
  });
  const decisions = decisionTable(observations, baselines, evaluations, options);

  const unitsWithOutcomes = new Set(observations.map((entry) => entry.unitId));
  const ledgerCounts = { stored: 0, derived: 0, none: 0 };
  const seen = new Set<string>();
  for (const entry of observations) {
    if (seen.has(entry.unitId)) continue;
    seen.add(entry.unitId);
    ledgerCounts[entry.ledger] += 1;
  }

  const cohort = cohortSection(observations, baselines, options);
  const comments = commentSignalsSection({
    units: input.units.map((unit) => ({ unitId: unit.unitId, slug: unit.slug })),
    bodies: input.comments ?? new Map(),
    outcomeFor: (unitId, platform) => {
      const observation = observations.find((entry) => entry.unitId === unitId && entry.platform === platform);
      if (!observation) return null;
      return { target: observation.metrics[options.metric], hit: evaluations.get(observation)?.hit ?? null };
    },
    minN: options.commentMinN ?? DEFAULT_COMMENT_SIGNAL_MIN_N,
    ...(options.platform ? { platform: options.platform } : {}),
  });
  const notes: string[] = [];
  if (observations.length === 0) {
    notes.push("No measured outcomes yet. Read the platform analytics screenshot, then `ralphy analytics import <unit> --platform <p> --data <json> --dry-run` and re-run with --yes.");
  }
  if (hitRate.awaitingBaseline > 0) {
    notes.push(`${hitRate.awaitingBaseline} observation(s) await a baseline (each platform needs ${options.minPrior} earlier posts).`);
  }
  if (decisions.some((row) => row.verdict === "insufficient data")) {
    notes.push(`Decision values seen fewer than ${options.minN} times show "insufficient data" instead of a claim.`);
  }
  if (ledgerCounts.derived > 0) {
    notes.push(`${ledgerCounts.derived} unit(s) have no stored ledger; their decisions were derived on the fly (pin them with \`ralphy unit decisions <unit> --derive\`).`);
  }
  if (new Set(observations.map((entry) => entry.platform)).size > 1) {
    notes.push("Platforms are never pooled: lift compares each post to its own platform's baseline.");
  }

  return {
    kind: "outcome-report" as const,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    scope: input.projectId ? "project" : "workspace-tree",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    settings: {
      metric: options.metric,
      minN: options.minN,
      window: options.window,
      minPrior: options.minPrior,
      liftThreshold: options.liftThreshold,
      hitThreshold: options.hitThreshold ?? null,
      platform: options.platform ?? null,
    },
    coverage: {
      units: input.units.length,
      unitsWithOutcomes: unitsWithOutcomes.size,
      pendingPerformance: input.units.filter((unit) => !unitsWithOutcomes.has(unit.unitId)).length,
      observations: observations.length,
      ledgers: ledgerCounts,
    },
    hitRate: { ...hitRate, byPlatform },
    baselines: baselines.flatMap((baseline) =>
      OUTCOME_METRICS.map((metric) => ({
        platform: baseline.platform,
        metric,
        median: baseline.current[metric].median,
        n: baseline.current[metric].n,
      }))
    ).filter((row) => row.n > 0),
    cohort,
    decisions,
    comments,
    observations: observationRows(observations, evaluations, options.metric),
    observationsTruncated: Math.max(0, observations.length - MAX_OBSERVATION_ROWS),
    notes,
  };
}

export type OutcomeReport = ReturnType<typeof buildOutcomeReport>;

function cohortSection(
  observations: Observation[],
  baselines: ReturnType<typeof currentBaselines>,
  options: OutcomeReportOptions,
) {
  if (!options.cohort) {
    return {
      provider: null,
      status: "not configured" as const,
      note: "cohort baselines arrive with the trend corpus (#556); the workspace baseline is its own past",
      rows: [] as Array<{ platform: string; metric: string; workspaceMedian: number | null; cohortMedian: number; cohortN: number; ratio: number | null; label: string }>,
    };
  }
  const rows = [];
  for (const baseline of baselines) {
    const dates = observations.filter((entry) => entry.platform === baseline.platform).map((entry) => entry.at);
    const answer = options.cohort.baseline({
      platform: baseline.platform,
      metric: options.metric,
      ...(dates.length > 0 ? { postedAt: median(dates)! } : {}),
    });
    if (!answer) continue;
    const workspaceMedian = baseline.current[options.metric].median;
    rows.push({
      platform: baseline.platform,
      metric: options.metric,
      workspaceMedian,
      cohortMedian: answer.median,
      cohortN: answer.n,
      ratio: workspaceMedian !== null && answer.median > 0 ? Math.round((workspaceMedian / answer.median) * 10_000) / 10_000 : null,
      label: answer.label,
    });
  }
  return { provider: options.cohort.id, status: "ok" as const, note: "", rows };
}

function observationRows(
  observations: Observation[],
  evaluations: ReturnType<typeof evaluateHits>,
  metric: OutcomeMetric,
) {
  return [...observations]
    .sort((a, b) => b.at - a.at || a.slug.localeCompare(b.slug))
    .slice(0, MAX_OBSERVATION_ROWS)
    .map((entry) => {
      const evaluation = evaluations.get(entry);
      return {
        unit: entry.slug,
        unitId: entry.unitId,
        platform: entry.platform,
        postedAt: new Date(entry.at).toISOString(),
        dateSource: entry.atSource,
        target: entry.metrics[metric],
        baseline: evaluation?.baseline ?? null,
        hit: evaluation?.hit ?? null,
        views: entry.metrics.views,
        avgWatchPct: entry.metrics["avg-watch-pct"],
        completion: entry.metrics.completion,
        engagementRate: entry.metrics["engagement-rate"],
        saveRate: entry.metrics["save-rate"],
        shareRate: entry.metrics["share-rate"],
        approximate: entry.approximateFields,
        derivations: entry.derivations,
        ledger: entry.ledger,
      };
    });
}

/** Stored ledger when present, else a fresh derivation (or none when disabled). */
export function ledgerDecisionsFor(
  context: QueryContext,
  deriveMissing: boolean,
): (unit: UnitOutcomeFactsDto) => DecisionsForUnit {
  return (unit) => {
    const stored = parseLedgerBody(unit.ledger?.body);
    if (stored) return { decisions: effectiveDecisions(stored.derived, stored.manual), ledger: "stored" };
    if (!deriveMissing) return { decisions: { format: unit.format }, ledger: "none" };
    try {
      const location: UnitLocationDto = {
        unitId: unit.unitId,
        slug: unit.slug,
        format: unit.format,
        workspaceId: unit.workspaceId,
        projectId: unit.projectId,
        projectSlug: unit.projectSlug,
        latestRevisionId: null,
        selectedRevisionId: null,
        matchedBy: "unit-id",
      };
      const gathered = gatherLedgerSources(unitContext(context, location), location);
      return { decisions: effectiveDecisions(deriveDecisions(gathered.sources), {}), ledger: "derived" };
    } catch {
      return { decisions: { format: unit.format }, ledger: "none" };
    }
  };
}

/** Facts from the store + the report, for a command or the plan builder. */
export function loadOutcomeReport(context: QueryContext, options: OutcomeReportOptions, scope: { workspaceId: string; projectId: string | null }) {
  const units = listUnitOutcomeFacts({ context });
  return buildOutcomeReport({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    units,
    decisionsFor: ledgerDecisionsFor(context, options.deriveMissing ?? true),
    options,
    comments: loadCommentBodies(context),
  });
}

/** Stored post comments per Unit (#582); best effort, never fatal to the report. */
function loadCommentBodies(context: QueryContext): Map<string, PostCommentsBody> {
  const out = new Map<string, PostCommentsBody>();
  try {
    for (const [unitId, document] of listUnitCommentDocuments({ context })) {
      const body = parsePostCommentsBody(document.body);
      if (body) out.set(unitId, body);
    }
  } catch {
    /* comment signals are optional evidence */
  }
  return out;
}

// ─── production-plan citation ────────────────────────────────────────────────

export interface LedgerEvidenceIndex {
  workspaceId: string;
  metric: OutcomeMetric;
  minN: number;
  observations: number;
  generatedAt: string;
  rows: DecisionRow[];
}

export function ledgerEvidenceIndex(report: OutcomeReport): LedgerEvidenceIndex {
  return {
    workspaceId: report.workspaceId,
    metric: report.settings.metric,
    minN: report.settings.minN,
    observations: report.coverage.observations,
    generatedAt: report.generatedAt,
    rows: report.decisions,
  };
}

/**
 * Best-effort evidence index for `ralphy project plan`: the Workspace-tree
 * report with stored ledgers only (no on-the-fly derivation, so planning stays
 * fast). Returns null when there is no store (it never creates one) or the
 * Workspace has no store record; never throws.
 */
export function loadPlanLedgerEvidence(workspaceId: string | null | undefined): LedgerEvidenceIndex | null {
  if (!workspaceId || !existsSync(domainDbPath())) return null;
  try {
    const report = loadOutcomeReport(
      { workspaceId },
      { ...DEFAULT_REPORT_OPTIONS, deriveMissing: false },
      { workspaceId, projectId: null },
    );
    return ledgerEvidenceIndex(report);
  } catch {
    return null;
  }
}
