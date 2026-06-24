// Estimated remaining queued spend for a run (#481).
//
// `ralphy run budget` + `run status` surface how much money is still QUEUED but
// not yet spent: the sum of `estimatedCallCostUsd` over PENDING `generate.*`
// jobs whose `project_id` is a member of the run. Pure aggregation over the
// jobs DB — ZERO model calls. The per-job estimate reuses `deriveJobEstimate`
// (the same argv parser the dispatch gate uses), so the figure matches what the
// gate will charge against the cap when those jobs dispatch.

import { listJobs } from "./db.js";
import { deriveJobEstimate } from "./spend-gate.js";

/**
 * Sum the estimated cost of all PENDING jobs whose project_id is one of
 * `memberProjectIds`. Best-effort: an unreadable jobs DB (no daemon ever ran)
 * yields 0, never a throw.
 */
export function estimateRunQueuedSpendUsd(memberProjectIds: string[]): number {
  if (memberProjectIds.length === 0) return 0;
  const members = new Set(memberProjectIds);
  let total = 0;
  try {
    for (const job of listJobs({ status: "pending" })) {
      if (!job.project_id || !members.has(job.project_id)) continue;
      total += deriveJobEstimate(job).estimatedUsd;
    }
  } catch {
    return 0;
  }
  return Number(total.toFixed(6));
}
