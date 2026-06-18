// Per-stage auto-assemble → eval → auto-repair loop (#473).
//
// The mechanism behind "right the first time": for ONE production stage, this
// runs a BOUNDED eval → repair → re-eval cycle so the user reviews polished
// output, not drafts. It is a LIBRARY entry the studio skill (#474) calls per
// stage — it owns the bounded loop + the paid gate; the CALLER owns the real
// fix mechanism (driving `ralphy` editor verbs) via the injectable `applyFix`.
//
// It COMPOSES already-landed pieces and reinvents NONE of them:
//   • #469 `runWorkspaceEval` → the per-criterion verdicts for the stage.
//   • #472 workspace `stageGates` (loaded via `loadWorkspaceEvaluatorsSync`) →
//     which criteria THIS stage owns.
//   • #409 `buildRepairPlan` (`cli/lib/repair.ts`) → owner-classified, ordered
//     repair items; we never re-classify findings ourselves.
//
// The two hard invariants from the issue:
//   1. BOUNDED — `retryBudget` (default 3) caps the eval→repair→re-eval cycles.
//      NO unbounded loops.
//   2. PAID GATE (mandatory) — an item is FREE iff `costEstimate === 0`, PAID
//      iff `> 0` (the #409 split: editor recut / scenarist rewrite = $0 + loops
//      automatically; art-director re-roll > $0 = stops for approval unless the
//      user pre-approved batch repair). The gate is enforced STRUCTURALLY: a
//      paid item without `batchApproved` short-circuits BEFORE any `applyFix`.
//
// Generic: NO universe literals. Everything flows from the workspace rubric.
// PURE of disk/LLM when the seams are injected — that is what makes it testable.
// English-only-on-disk.

import path from "node:path";
import { projectDir } from "../paths.js";
import { loadWorkspaceEvaluatorsSync } from "../workspace-evaluators.js";
import { runWorkspaceEval } from "./workspace-evaluators.js";
import { buildRepairPlan } from "../repair.js";
import type { Finding, Verdict, EvalReport } from "./types.js";
import type { RepairItem } from "../schemas/repair-plan.js";
import type { ScorecardVerdict } from "../schemas/scorecard.js";

// ─── Seams ────────────────────────────────────────────────────────────────────

/** The per-stage eval shape the loop consumes — a slice of WorkspaceEvalResult. */
export interface StageEvalResult {
  criteria: Array<{ id: string; verdict: Verdict | "na"; findings: Finding[] }>;
}

/** Inject a stage eval. Default: `runWorkspaceEval` filtered to the owned ids. */
export type StageEvalFn = (
  projectId: string,
  ownedCriterionIds: string[],
) => Promise<StageEvalResult>;

/** Inject a fix applier. Default: a no-op that surfaces the item to the caller. */
export type ApplyFixFn = (
  item: RepairItem,
) => Promise<{ applied: boolean; note?: string }>;

export interface StageLoopOptions {
  /** Override the stage eval (default: workspace eval filtered to owned ids). */
  evalStage?: StageEvalFn;
  /** Override the fix applier (default: no-op — caller wires the real verbs). */
  applyFix?: ApplyFixFn;
  /** Max eval→repair→re-eval cycles. Default 3. NO unbounded loops. */
  retryBudget?: number;
  /** When false (default), STOP before applying any PAID (cost>0) item. */
  batchApproved?: boolean;
}

// ─── Result ─────────────────────────────────────────────────────────────────────

export interface StageLoopResult {
  /** The stage label from the gate (echoes `stageId` when the gate matched on it). */
  stage: string;
  /** The contract phase the gate maps to, or null when no gate matched. */
  phase: string | null;
  /** Final #427 readiness verdict. */
  verdict: ScorecardVerdict;
  /** Eval→repair→re-eval cycles actually run (≤ retryBudget). */
  iterations: number;
  /** findingIds (labels) of the fixes auto-applied across all iterations. */
  autoFixed: string[];
  /** Paid items the loop refused to apply without approval. */
  pendingPaidActions: RepairItem[];
  /** Free items the loop could NOT apply (no applier wired / not appliable). */
  pendingFreeActions: RepairItem[];
  /** Human-readable English-on-disk reason for the verdict. */
  reason: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Resolve the workspace slug from the project dir layout (mirrors contract.ts). */
function resolveSlug(projectId: string): string {
  const parts = projectDir(projectId).split(path.sep);
  const wi = parts.lastIndexOf("workspaces");
  return wi >= 0 && parts[wi + 1] ? parts[wi + 1] : "default";
}

/** The worst owned criterion verdict (fail beats warn beats na/pass). */
function worstVerdict(
  results: StageEvalResult["criteria"],
): "fail" | "warn" | "clean" {
  if (results.some((r) => r.verdict === "fail")) return "fail";
  if (results.some((r) => r.verdict === "warn")) return "warn";
  return "clean";
}

/** Every owned criterion passes or is na → the stage clears. */
function allClear(results: StageEvalResult["criteria"]): boolean {
  return results.every((r) => r.verdict === "pass" || r.verdict === "na");
}

/**
 * Synthesize the minimal EvalReport `buildRepairPlan` reads. It only touches
 * `.findings`, `.scoring.verdict`, and `.meta.projectId` (see cli/lib/repair.ts)
 * — so we supply exactly those, flattening the owned criteria's findings and
 * mapping the worst owned verdict onto the eval `Verdict` ladder. The rest of
 * the EvalReport shape is irrelevant to the plan builder; an `as` cast keeps the
 * synthetic object honest without fabricating ffprobe / scoring detail.
 */
function synthEvalReport(
  projectId: string,
  results: StageEvalResult["criteria"],
): EvalReport {
  const findings = results.flatMap((r) => r.findings);
  const worst = worstVerdict(results);
  const verdict: Verdict = worst === "fail" ? "fail" : "warn"; // builder is only called when not all-clear
  return {
    findings,
    scoring: { weights: {}, penalties: {}, score: 0, verdict },
    meta: { projectId },
  } as unknown as EvalReport;
}

const NO_OP_APPLY: ApplyFixFn = async () => ({
  applied: false,
  note: "no applier wired — surface to caller",
});

// ─── The loop ─────────────────────────────────────────────────────────────────

/**
 * Run the bounded per-stage repair loop for ONE stage of ONE project.
 *
 * A `stageId` matches the workspace rubric's stage gate by `stage` FIRST, then
 * `phase` (stage wins on a tie — the user-facing label is the more specific
 * handle). No matching gate / no rubric → a graceful `needs-user-decision`
 * (never a throw). See StageLoopResult for the emitted shape.
 */
export async function runStageRepairLoop(
  projectId: string,
  stageId: string,
  opts: StageLoopOptions = {},
): Promise<StageLoopResult> {
  const retryBudget = opts.retryBudget ?? 3;
  const batchApproved = opts.batchApproved ?? false;
  const applyFix = opts.applyFix ?? NO_OP_APPLY;

  // 1. Resolve the stage gate from the workspace rubric (#472).
  const slug = resolveSlug(projectId);
  const config = loadWorkspaceEvaluatorsSync(slug);
  const gates = config?.stageGates ?? [];
  // stage match wins over phase match (the user-facing label is more specific).
  const gate =
    gates.find((g) => g.stage === stageId) ?? gates.find((g) => g.phase === stageId);
  if (!gate) {
    return {
      stage: stageId,
      phase: null,
      verdict: "needs-user-decision",
      iterations: 0,
      autoFixed: [],
      pendingPaidActions: [],
      pendingFreeActions: [],
      reason: `no stage gate configured for "${stageId}" in workspace "${slug}" — cannot auto-repair this stage.`,
    };
  }

  const ownedIds = gate.criteria;
  const evalStage: StageEvalFn =
    opts.evalStage ??
    (async (pid, ids) => {
      const full = await runWorkspaceEval(pid);
      const owned = new Set(ids);
      return {
        criteria: full.criteria
          .filter((c) => owned.has(c.id))
          .map((c) => ({ id: c.id, verdict: c.verdict, findings: c.findings })),
      };
    });

  const autoFixed: string[] = [];
  let iterations = 0;
  let lastResults: StageEvalResult["criteria"] = [];

  while (iterations < retryBudget) {
    iterations += 1;

    // 2. Eval the stage.
    const evaluated = await evalStage(projectId, ownedIds);
    lastResults = evaluated.criteria;

    // 3. All owned criteria pass/na → DONE.
    if (allClear(lastResults)) {
      return {
        stage: gate.stage,
        phase: gate.phase,
        verdict: "ship",
        iterations,
        autoFixed,
        pendingPaidActions: [],
        pendingFreeActions: [],
        reason: `stage "${gate.stage}" cleared: every owned criterion passes${autoFixed.length ? ` after ${autoFixed.length} auto-fix(es)` : ""}.`,
      };
    }

    // 4. Synthesize an EvalReport from the owned findings + build the #409 plan.
    const plan = buildRepairPlan(synthEvalReport(projectId, lastResults));
    const free = plan.items.filter((it) => it.costEstimate === 0);
    const paid = plan.items.filter((it) => it.costEstimate > 0);

    // 5. PAID GATE — paid items + no batch approval → STOP before any applyFix.
    if (paid.length > 0 && !batchApproved) {
      const worst = worstVerdict(lastResults);
      return {
        stage: gate.stage,
        phase: gate.phase,
        verdict: worst === "fail" ? "blocked" : "needs-user-decision",
        iterations,
        autoFixed,
        pendingPaidActions: paid,
        pendingFreeActions: free,
        reason: `stage "${gate.stage}" needs ${paid.length} paid regeneration(s) (cost > 0) — stopped for user approval (the paid gate). Approve batch repair to let the loop apply them.`,
      };
    }

    // 6. Apply fixes. Free always; paid only when batch-approved (still delegated
    //    to the applier — the library never spends directly). The gate above
    //    guarantees we never reach here with un-approved paid items.
    const toApply = batchApproved ? [...free, ...paid] : free;
    const couldNotApply: RepairItem[] = [];
    let appliedThisIteration = 0;
    for (const item of toApply) {
      const { applied } = await applyFix(item);
      if (applied) {
        autoFixed.push(item.findingId);
        appliedThisIteration += 1;
      } else {
        couldNotApply.push(item);
      }
    }

    // 7. Nothing applied → nothing will converge; STOP and hand back to caller.
    if (appliedThisIteration === 0) {
      const worst = worstVerdict(lastResults);
      return {
        stage: gate.stage,
        phase: gate.phase,
        verdict: worst === "fail" ? "blocked" : "repair",
        iterations,
        autoFixed,
        pendingPaidActions: batchApproved ? [] : paid,
        pendingFreeActions: couldNotApply,
        reason: `stage "${gate.stage}" could not converge: no fix was applied this iteration (no applier wired or items are not auto-appliable). ${couldNotApply.length} action(s) left for the caller.`,
      };
    }
    // 8. Applied at least one fix → loop again (re-eval).
  }

  // 9. Budget exhausted without all-pass — return the latest verdict + residuals.
  const worst = worstVerdict(lastResults);
  const verdict: ScorecardVerdict = worst === "fail" ? "blocked" : "repair";
  const lastPlan = lastResults.length
    ? buildRepairPlan(synthEvalReport(projectId, lastResults))
    : null;
  return {
    stage: gate.stage,
    phase: gate.phase,
    verdict,
    iterations,
    autoFixed,
    pendingPaidActions: lastPlan
      ? lastPlan.items.filter((it) => it.costEstimate > 0)
      : [],
    pendingFreeActions: lastPlan
      ? lastPlan.items.filter((it) => it.costEstimate === 0)
      : [],
    reason: `stage "${gate.stage}" hit the retry budget (${retryBudget}) without clearing — ${autoFixed.length} fix(es) applied, but owned criteria still ${worst}. Surface the residual actions to the user.`,
  };
}
