// Metric-adapter run + eval-report enrichment (#485).
//
// `runMetrics()` selects the applicable adapters (all, or one named), checks
// each one's availability, and scores the available ones — `na` adapters carry
// their hint, never crash. `enrichEvalWithMetrics()` merges the results INTO
// the project's existing eval.json under `metrics` (read → merge → write back),
// archiving the prior eval.json via protectExistingAsset first (append-only).
// When eval.json is absent it returns `enriched: false` and the caller surfaces
// the metrics standalone — there is no parallel report to write.

import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { projectDir } from "../../paths.js";
import { protectExistingAsset } from "../../providers/shared.js";
import { listMetricAdapters, getMetricAdapter } from "./registry.js";
import { thresholdFor } from "./thresholds.js";
import type { MetricInput, MetricResult } from "./types.js";

export const EVAL_ARTIFACT = "eval.json" as const;

export interface RunMetricsOptions {
  projectId: string;
  /** Score only this adapter id (else all registered adapters). */
  adapterId?: string | null;
  mode?: string | null;
  expectedText?: string | null;
  /** Test seam — a pre-computed transcript so the live (paid) path never runs. */
  hypothesisOverride?: string | null;
}

/** One adapter's plan line (for --dry-run): availability + threshold, no run. */
export interface MetricPlanEntry {
  adapter: string;
  label: string;
  capability: string;
  available: boolean;
  threshold: number;
  /** The availability hint when not available; null when ok. */
  hint: string | null;
}

/** Build the dry-run plan: which adapters apply, their availability + thresholds,
 *  ZERO model calls (availability checks are detection-only). */
export async function planMetrics(opts: RunMetricsOptions): Promise<MetricPlanEntry[]> {
  const adapters = selectAdapters(opts.adapterId);
  const input = toInput(opts);
  const plan: MetricPlanEntry[] = [];
  for (const a of adapters) {
    const avail = await a.available(input);
    plan.push({
      adapter: a.id,
      label: a.label,
      capability: a.capability,
      available: avail.ok,
      threshold: thresholdFor(a.id, opts.mode),
      hint: avail.ok ? null : (avail.hint ?? "unavailable"),
    });
  }
  return plan;
}

/** Run the applicable adapters and return their MetricResults (one per adapter,
 *  `na` for the unavailable ones). */
export async function runMetrics(opts: RunMetricsOptions): Promise<MetricResult[]> {
  const adapters = selectAdapters(opts.adapterId);
  const input = toInput(opts);
  const results: MetricResult[] = [];
  for (const a of adapters) {
    // `score()` is contractually no-throw — it returns `na` when it can't run.
    results.push(await a.score(input));
  }
  return results;
}

/**
 * Merge metric results into the project's eval.json under `metrics`. Append-only:
 * archives the prior eval.json via protectExistingAsset before writing. Returns
 * whether an eval.json existed to enrich (false ⇒ nothing written).
 */
export async function enrichEvalWithMetrics(
  projectId: string,
  metrics: MetricResult[],
): Promise<{ enriched: boolean; evalPath: string }> {
  const evalPath = path.join(projectDir(projectId), EVAL_ARTIFACT);
  if (!existsSync(evalPath)) {
    return { enriched: false, evalPath };
  }
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(readFileSync(evalPath, "utf8")) as Record<string, unknown>;
  } catch {
    // A malformed eval.json is left untouched — never clobber it.
    return { enriched: false, evalPath };
  }
  report.metrics = metrics;

  const fs = await import("node:fs/promises");
  await protectExistingAsset(evalPath, false);
  await fs.mkdir(path.dirname(evalPath), { recursive: true });
  await fs.writeFile(evalPath, JSON.stringify(report, null, 2));
  return { enriched: true, evalPath };
}

// ─── internals ──────────────────────────────────────────────────────────────

function selectAdapters(adapterId?: string | null) {
  if (adapterId) {
    const a = getMetricAdapter(adapterId);
    return a ? [a] : [];
  }
  return listMetricAdapters();
}

function toInput(opts: RunMetricsOptions): MetricInput {
  return {
    projectId: opts.projectId,
    mode: opts.mode ?? null,
    expectedText: opts.expectedText ?? null,
    hypothesisOverride: opts.hypothesisOverride ?? null,
  };
}
