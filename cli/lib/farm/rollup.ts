// Farm metrics rollup (#518) — per-workspace operational metrics DERIVED from
// the run journals on demand. NO new write path, NO metrics DB: everything
// here is a read-only fold of `runs/<id>/run-events.jsonl` (+ the workspace
// dead-letter and node-cache stores), computed when `ralphy farm report` (or
// the dashboard panel) asks. It degrades gracefully on partial journals — a
// torn final line is skipped, a missing workflow leaves node types
// unclassified (completions still count; unit/publish tallies just can't
// attribute them), and absent #513 cache / #519 dead-letter stores read as
// zero. Sequenced after #503; the digest wants #513 (cache) + #514 (reroute)
// present to report them, but never requires them.
//
// The classifier maps a completed node id → its type via the workspace's
// GRAPH workflows (same source as farmStatus). Units produced = completed
// `ralphy-unit` nodes; gated = completed `approval` nodes; published =
// completed PUBLISH_NODE_TYPES nodes. Approval latency = elapsed between a
// `run-parked` event and the run's NEXT event (the resume that cleared the
// park) — the human-in-the-loop wait the trust ladder's throughput hinges on.

import fs from "node:fs";
import path from "node:path";
import { runsDir, runDir } from "../paths.js";
import { listWorkflowNames, workflowPath } from "../workflow.js";
import { parseWorkflowDocument, PUBLISH_NODE_TYPES } from "../schemas/workflow.js";
import type { WorkflowNodeType } from "../schemas/workflow.js";
import { providerConcurrency } from "../providers/concurrency.js";

const PUBLISH_TYPES = new Set<string>(PUBLISH_NODE_TYPES);

/** One journal line, folded. */
interface JournalEvent {
  kind: string;
  node?: string;
  ts?: string;
  costUsd?: number;
  costSavedUsd?: number;
  /** #543: node-completed carries the node output payload (publish hygiene/attribution). */
  output?: unknown;
}

/**
 * #543: read the attribution/hygiene facts a publish node's completion payload
 * carries. `attribution` present with ≥1 source = covered (and expected);
 * `hygiene.verdict !== "pass"` = a soft flag surfaced on the completion. Returns
 * null-ish counters when the payload is not a publish output.
 */
function readPublishHygiene(output: unknown): {
  hasAttribution: boolean;
  hygieneFlagged: boolean;
} {
  const o = output && typeof output === "object" ? (output as Record<string, unknown>) : {};
  const attr = o.attribution as { sources?: unknown[] } | undefined;
  const hygiene = o.hygiene as { verdict?: string } | undefined;
  return {
    hasAttribution: Array.isArray(attr?.sources) && attr!.sources!.length > 0,
    hygieneFlagged: Boolean(hygiene && hygiene.verdict && hygiene.verdict !== "pass"),
  };
}

/** Per-node-id → its type, unioned across the workspace's graph workflows. */
function nodeTypesOf(ws: string): Map<string, WorkflowNodeType> {
  const types = new Map<string, WorkflowNodeType>();
  for (const name of listWorkflowNames(ws)) {
    try {
      const doc = parseWorkflowDocument(JSON.parse(fs.readFileSync(workflowPath(ws, name), "utf8")));
      if (doc.kind !== "graph") continue;
      for (const n of doc.graph.nodes) if (!types.has(n.id)) types.set(n.id, n.type);
    } catch {
      /* malformed workflow — `ralphy workflow lint` is the diagnosis path */
    }
  }
  return types;
}

function readJournalEvents(ws: string, runId: string): JournalEvent[] {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(path.join(runDir(ws, runId), "run-events.jsonl"), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  const out: JournalEvent[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as JournalEvent);
    } catch {
      /* torn final line from a kill -9 — skip (graceful degrade) */
    }
  }
  return out;
}

// ─── Report shape ─────────────────────────────────────────────────────────────

export interface FarmReportTotals {
  /** Number of farm ticks in the window (farm-tick journal events). */
  ticks: number;
  /** Distinct farm runs the window touched. */
  runs: number;
  /** Completed `ralphy-unit` nodes — the deliverables the farm formed. */
  unitsProduced: number;
  /** Completed `approval` nodes — units that cleared the gate. */
  unitsGated: number;
  /** Completed PUBLISH_NODE_TYPES nodes — units pushed out. */
  unitsPublished: number;
  /**
   * #542: units DROPPED at the publish-time freshness guard (aged past their
   * TTL before they could publish). A non-zero count is a throughput-loss
   * signal — the tick cadence or quota is too slow for the ingest rate.
   */
  staleDropped: number;
  /**
   * #541: candidates SUPPRESSED at the dedup node's long-horizon topic consult
   * (the topic was already covered by a published/produced unit in the window).
   * Surfaced so silent suppression does not read as a coverage gap.
   */
  topicDuplicateSkipped: number;
  /**
   * #543 attribution: of the units that PUBLISHED with sources available, how
   * many carried a "Sources:" attribution block (`attributionCovered`) out of
   * those that had sources to cite (`attributionExpected`). The coverage % =
   * attributionCovered / attributionExpected (surfaced as `attributionCoverage`
   * on the report). A publish whose node payload had no `attribution` block but
   * also no sources does NOT count against expectation (nothing to attribute).
   */
  attributionExpected: number;
  attributionCovered: number;
  /**
   * #543 copyright hygiene: units the pre-publish hygiene guard FLAGGED (a
   * scraped/source asset embedded, or a soft warn routed to review) and, of
   * those, how many were BLOCKED outright (a hard fail that parked/refused).
   * A non-zero `hygieneBlocked` is a strike-risk signal the operator must clear.
   */
  hygieneFlagged: number;
  hygieneBlocked: number;
  /** Realized model spend (sum of node costUsd across the window). */
  spendUsd: number;
  /** #513 content-hash cache hits + estimated spend they saved. */
  cacheHits: number;
  cacheSavedUsd: number;
}

export interface FarmReportRates {
  /** Total node executions counted (completed + failed attempts + quarantined). */
  nodeExecutions: number;
  nodeFailures: number;
  nodeReroutes: number;
  nodeQuarantines: number;
  nodeCacheHits: number;
  /** failures / executions, reroutes / executions, cacheHits / (completions+hits). 0 when no denominator. */
  failureRate: number;
  rerouteRate: number;
  cacheHitRate: number;
}

export interface FarmReportDurations {
  /** Median node wall-clock (node-started → node-completed) in ms; null with no pairs. */
  medianNodeMs: number | null;
  /** Sample count behind medianNodeMs. */
  nodeDurationSamples: number;
  /** Median approval latency (run-parked → next run event) in ms; null with no pairs. */
  medianApprovalLatencyMs: number | null;
  approvalLatencySamples: number;
}

/** #522 provider queue-wait rollup (process-scoped — the in-process semaphore). */
export interface FarmReportQueueWait {
  /** Total time (ms) calls spent blocked waiting for a provider slot this process. */
  totalQueueWaitMs: number;
  /** Per-provider breakdown: cumulative queue-wait + current in-flight/queued. */
  byProvider: Array<{ provider: string; totalWaitMs: number; inFlight: number; queued: number }>;
}

export interface FarmReport {
  workspace: string;
  /** ISO lower bound applied (null = all history). */
  since: string | null;
  /** Runs contributing to the window (id + workflow + when its journal starts). */
  runsIncluded: string[];
  totals: FarmReportTotals;
  /** Cost efficiency — the operator's headline numbers. */
  spendPerUnit: number | null;
  spendPerTick: number | null;
  /**
   * #543: attribution coverage = attributionCovered / attributionExpected
   * (0-1), null when nothing needed attribution in the window. The operator's
   * "are we crediting our sources?" headline.
   */
  attributionCoverage: number | null;
  rates: FarmReportRates;
  durations: FarmReportDurations;
  /**
   * #522 provider concurrency queue-wait. PROCESS-scoped: the dispatch
   * semaphore is in-process, so this is populated only when `farm report` runs
   * inside the daemon that holds the slots (e.g. the dashboard panel). A
   * standalone CLI call sees zero — the durable per-node metrics above are the
   * cross-process record.
   */
  queueWait: FarmReportQueueWait;
  /** True when at least one contributing run had no loadable workflow (types unclassified). */
  partial: boolean;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

function inWindow(ts: string | undefined, sinceMs: number | null): boolean {
  if (sinceMs === null) return true;
  if (!ts) return true; // a timestamp-less event stays in (degrade toward inclusion)
  const t = Date.parse(ts);
  return Number.isNaN(t) || t >= sinceMs;
}

/**
 * Build the per-workspace operational report from the run journals. `since`
 * is an ISO date/datetime lower bound on event timestamps (a run is included
 * when ANY of its in-window events survives the filter). Everything is a
 * fold of on-disk journals — no model calls, no writes.
 */
export function buildFarmReport(ws: string, opts: { since?: string } = {}): FarmReport {
  const sinceMs = opts.since && !Number.isNaN(Date.parse(opts.since)) ? Date.parse(opts.since) : null;
  const types = nodeTypesOf(ws);

  let runIds: string[] = [];
  try {
    runIds = fs
      .readdirSync(runsDir(ws), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    /* no runs yet */
  }

  const totals: FarmReportTotals = {
    ticks: 0,
    runs: 0,
    unitsProduced: 0,
    unitsGated: 0,
    unitsPublished: 0,
    staleDropped: 0,
    topicDuplicateSkipped: 0,
    attributionExpected: 0,
    attributionCovered: 0,
    hygieneFlagged: 0,
    hygieneBlocked: 0,
    spendUsd: 0,
    cacheHits: 0,
    cacheSavedUsd: 0,
  };
  const rates: FarmReportRates = {
    nodeExecutions: 0,
    nodeFailures: 0,
    nodeReroutes: 0,
    nodeQuarantines: 0,
    nodeCacheHits: 0,
    failureRate: 0,
    rerouteRate: 0,
    cacheHitRate: 0,
  };
  const nodeDurations: number[] = [];
  const approvalLatencies: number[] = [];
  const runsIncluded: string[] = [];
  let partial = false;
  let completions = 0;

  for (const runId of runIds) {
    const events = readJournalEvents(ws, runId);
    if (events.length === 0) continue;
    // A run with no loadable workflow leaves its node types unclassified — the
    // fold still counts completions/spend, but unit/publish attribution is
    // best-effort. Flag the report partial so the operator knows.
    const runHasTypes = events.some((e) => e.node && types.has(e.node));
    const startedAt = new Map<string, string>();
    let contributed = false;

    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (!inWindow(e.ts, sinceMs)) continue;
      contributed = true;

      if (typeof e.costUsd === "number") totals.spendUsd += e.costUsd;

      if (e.kind === "farm-tick") totals.ticks++;

      if (e.kind === "node-started" && e.node && e.ts) {
        startedAt.set(e.node, e.ts);
      } else if (e.kind === "node-completed" && e.node) {
        completions++;
        const startTs = startedAt.get(e.node);
        if (startTs && e.ts) {
          const d = Date.parse(e.ts) - Date.parse(startTs);
          if (Number.isFinite(d) && d >= 0) nodeDurations.push(d);
        }
        rates.nodeExecutions++;
        const t = types.get(e.node);
        if (t === "ralphy-unit") totals.unitsProduced++;
        else if (t === "approval") totals.unitsGated++;
        else if (t && PUBLISH_TYPES.has(t)) {
          totals.unitsPublished++;
          // #543: attribution coverage on the publish completion. A unit that
          // published WITH sources available carries an attribution block —
          // count it as covered + expected. No attribution block = nothing to
          // cite (not counted against expectation). A soft hygiene warn that
          // still completed is folded as flagged.
          const { hasAttribution, hygieneFlagged } = readPublishHygiene(e.output);
          if (hasAttribution) {
            totals.attributionExpected++;
            totals.attributionCovered++;
          }
          if (hygieneFlagged) totals.hygieneFlagged++;
        }
      } else if (e.kind === "stale-dropped") {
        totals.staleDropped++;
      } else if (e.kind === "topic-duplicate-skip") {
        totals.topicDuplicateSkipped++;
      } else if (e.kind === "hygiene-blocked") {
        // #543: a hard hygiene fail that parked the run (never published).
        totals.hygieneFlagged++;
        totals.hygieneBlocked++;
      } else if (e.kind === "hygiene-flagged") {
        // #543: a soft hygiene warn / missing-required-attribution routed to review.
        totals.hygieneFlagged++;
      } else if (e.kind === "node-cached") {
        totals.cacheHits++;
        rates.nodeCacheHits++;
        if (typeof e.costSavedUsd === "number") totals.cacheSavedUsd += e.costSavedUsd;
      } else if (e.kind === "node-failed") {
        rates.nodeFailures++;
        rates.nodeExecutions++;
      } else if (e.kind === "node-routed") {
        rates.nodeReroutes++;
      } else if (e.kind === "node-quarantined") {
        rates.nodeQuarantines++;
        rates.nodeExecutions++;
      } else if (e.kind === "run-parked" && e.ts) {
        // Approval latency = wait until the run's NEXT event (the resume that
        // cleared the park). No later event yet → still waiting, no sample.
        const next = events.slice(i + 1).find((n) => n.ts);
        if (next?.ts) {
          const d = Date.parse(next.ts) - Date.parse(e.ts);
          if (Number.isFinite(d) && d >= 0) approvalLatencies.push(d);
        }
      }
    }

    if (contributed) {
      runsIncluded.push(runId);
      totals.runs++;
      if (!runHasTypes) partial = true;
    }
  }

  totals.spendUsd = Number(totals.spendUsd.toFixed(6));
  totals.cacheSavedUsd = Number(totals.cacheSavedUsd.toFixed(6));

  const cacheDenom = completions + rates.nodeCacheHits;
  rates.failureRate = rates.nodeExecutions ? Number((rates.nodeFailures / rates.nodeExecutions).toFixed(4)) : 0;
  rates.rerouteRate = rates.nodeExecutions ? Number((rates.nodeReroutes / rates.nodeExecutions).toFixed(4)) : 0;
  rates.cacheHitRate = cacheDenom ? Number((rates.nodeCacheHits / cacheDenom).toFixed(4)) : 0;

  const providers = providerConcurrency();
  const queueWait: FarmReportQueueWait = {
    totalQueueWaitMs: providers.reduce((a, p) => a + p.totalWaitMs, 0),
    byProvider: providers.map((p) => ({
      provider: p.provider,
      totalWaitMs: p.totalWaitMs,
      inFlight: p.inFlight,
      queued: p.queued,
    })),
  };

  return {
    workspace: ws,
    since: opts.since ?? null,
    runsIncluded,
    totals,
    spendPerUnit: totals.unitsProduced > 0 ? Number((totals.spendUsd / totals.unitsProduced).toFixed(4)) : null,
    spendPerTick: totals.ticks > 0 ? Number((totals.spendUsd / totals.ticks).toFixed(4)) : null,
    attributionCoverage:
      totals.attributionExpected > 0
        ? Number((totals.attributionCovered / totals.attributionExpected).toFixed(4))
        : null,
    rates,
    durations: {
      medianNodeMs: median(nodeDurations),
      nodeDurationSamples: nodeDurations.length,
      medianApprovalLatencyMs: median(approvalLatencies),
      approvalLatencySamples: approvalLatencies.length,
    },
    queueWait,
    partial,
  };
}

/**
 * #541: count `topic-duplicate-skip` events across the workspace's run
 * journals, optionally filtered to those whose suppressed candidate url matches
 * `urlPrefix` (e.g. `campaign://<id>/` to scope to one campaign). A read-only
 * fold, mirroring buildFarmReport's journal walk. Used by `campaign status` to
 * surface long-horizon suppressions so silent dedup does not read as a gap.
 */
export function countTopicDuplicateSkips(ws: string, opts: { urlPrefix?: string } = {}): number {
  let runIds: string[] = [];
  try {
    runIds = fs
      .readdirSync(runsDir(ws), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return 0;
  }
  let n = 0;
  for (const runId of runIds) {
    for (const e of readJournalEvents(ws, runId) as Array<JournalEvent & { url?: string }>) {
      if (e.kind !== "topic-duplicate-skip") continue;
      if (opts.urlPrefix && !(e.url ?? "").startsWith(opts.urlPrefix)) continue;
      n++;
    }
  }
  return n;
}

/**
 * The daily-digest one-liner + body, DERIVED from the same report so the
 * digest content mirrors `farm report`'s summary (issue #518). `needsYou` =
 * runs currently parked/halted awaiting a human, surfaced from the live farm
 * status counts (passed in so this stays a pure function over the report).
 */
export function digestSummary(
  report: FarmReport,
  needsYou = 0,
): { title: string; body: string; data: Record<string, unknown> } {
  const t = report.totals;
  const since = report.since ? ` since ${report.since}` : "";
  const title = `Farm "${report.workspace}"${since}: ${t.unitsProduced} produced, ${t.unitsPublished} published, $${t.spendUsd.toFixed(2)} spent${needsYou > 0 ? `, ${needsYou} needs you` : ""}`;
  const body = [
    `Ticks: ${t.ticks} · runs: ${t.runs}`,
    `Produced ${t.unitsProduced} · gated ${t.unitsGated} · published ${t.unitsPublished}` +
      (t.staleDropped > 0 ? ` · stale-dropped ${t.staleDropped}` : "") +
      (t.topicDuplicateSkipped > 0 ? ` · topic-dupe-skipped ${t.topicDuplicateSkipped}` : ""),
    `Spend $${t.spendUsd.toFixed(2)}` +
      (report.spendPerUnit !== null ? ` ($${report.spendPerUnit.toFixed(2)}/unit)` : "") +
      (report.spendPerTick !== null ? ` ($${report.spendPerTick.toFixed(2)}/tick)` : ""),
    `Cache: ${t.cacheHits} hits (saved ~$${t.cacheSavedUsd.toFixed(2)})`,
    (report.attributionCoverage !== null
      ? `Attribution: ${(report.attributionCoverage * 100).toFixed(0)}% (${t.attributionCovered}/${t.attributionExpected})`
      : "Attribution: n/a") +
      (t.hygieneFlagged > 0 ? ` · hygiene flags ${t.hygieneFlagged}` : "") +
      (t.hygieneBlocked > 0 ? ` · blocked ${t.hygieneBlocked}` : ""),
    `Failure rate ${(report.rates.failureRate * 100).toFixed(1)}% · reroute rate ${(report.rates.rerouteRate * 100).toFixed(1)}% · quarantined ${report.rates.nodeQuarantines}`,
    needsYou > 0 ? `Needs you: ${needsYou} run(s) parked/halted` : "Nothing needs you",
  ].join("\n");
  return { title, body, data: { report, needsYou } };
}
