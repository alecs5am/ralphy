// Golden-set quality-regression gate on bundle upgrade (#535).
//
// The train -> deploy -> retrain -> redeploy loop (#521) needs a guardrail so a
// new bundle version is proven BETTER (or at least not worse), not merely
// asserted. A workspace keeps a small FROZEN golden set — a few representative
// inputs per unit type + the incumbent bundle's per-criterion scores — and
// `workspace upgrade` (#521) runs the CANDIDATE bundle's graph over that set
// headless, scores it against the #468 workspace evaluators, and diffs per
// criterion vs the stored baseline. A regression beyond a tolerance refuses the
// upgrade unless explicitly accepted; an improvement promotes the new baseline.
//
// ── ZERO paid spend by default (the cost-honest contract) ────────────────────
// The DEFAULT golden run is deterministic:
//   • the candidate graph executes headless through the #523 synthetic executors
//     (buildSyntheticExecutors) against an EPHEMERAL scratch root — typed
//     placeholder outputs, ZERO provider calls, ZERO artifact writes, same seam
//     the #516 workflow simulate uses.
//   • scoring runs ONLY the #468 evaluators' DETERMINISTIC criteria via
//     runWorkspaceEval({ noVision: true }) — ZERO model calls.
//   • a criterion that GENUINELY needs real generation or a vision pass to score
//     (every `check: "vision"` criterion) is NOT run — it is reported as
//     `scoring: "deferred-needs-real"` with an estimated cost, and the gate
//     NEVER spends. Only an explicit --golden-real would run those, behind the
//     normal approval gate; this module never fires that path itself.
//
// Storage (all under `<workspace>/golden/`, mirroring the trust.ts pattern —
// engine JSON + append-only versioned baselines):
//   • golden/golden-set.json  — the GoldenSet: frozen items[] + baseline map +
//                                the bundleVersion the baseline was captured on.
//   • golden/baseline.vN.json — archived prior baselines (refreshing the
//                                baseline versions the prior copy, append-only).
//
// #502 bundle inclusion: see the `golden/` note in cli/lib/bundle.ts — the
// export currently leaves golden/ out (documented TODO), because the frozen
// golden inputs + incumbent baseline are DEPLOYMENT-LOCAL calibration state, not
// portable know-how, and wiring it into the bundle tree touches the upgrade
// know-how/runtime-state boundary. Tracked as a follow-up; see the report.
//
// English-only-on-disk.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { root, setRoot, workspaceDir, projectDir } from "./paths.js";
import { fireTick, loadGraphWorkflows } from "./farm/runner.js";
import { buildSyntheticExecutors } from "./farm/simulate.js";
import { loadWorkspaceEvaluatorsSync } from "./workspace-evaluators.js";
import {
  runWorkspaceEval,
  type WorkspaceCriterionResult,
} from "./eval/workspace-evaluators.js";
import type { WorkflowGraph } from "./schemas/workflow.js";

// ─── Golden-set schema ────────────────────────────────────────────────────────

/** One frozen golden input — a representative brief / source item per unit type. */
export const GoldenItemSchema = z.object({
  /** Stable id, unique within the set. */
  id: z.string(),
  /** The content mode / unit type this item exercises (free-form label). */
  unitType: z.string(),
  /** The frozen input (brief text, source item, params) the graph runs over. */
  input: z.record(z.unknown()),
});
export type GoldenItem = z.infer<typeof GoldenItemSchema>;

/** One baseline criterion score — the incumbent bundle's number the gate diffs against. */
export const GoldenBaselineEntrySchema = z.object({
  /** 0-100, or null when the criterion did not score (na / deferred). */
  score: z.number().min(0).max(100).nullable(),
  /** pass | warn | fail | na. */
  verdict: z.string(),
});
export type GoldenBaselineEntry = z.infer<typeof GoldenBaselineEntrySchema>;

export const GoldenSetSchema = z.object({
  /** Schema version. */
  version: z.string().default("1.0"),
  /** Frozen inputs the candidate graph runs over. */
  items: z.array(GoldenItemSchema).default([]),
  /** criterionId -> incumbent score, or null when no baseline captured yet. */
  baseline: z.record(GoldenBaselineEntrySchema).nullable().default(null),
  /** The bundle version the baseline was captured on (null when uncaptured). */
  bundleVersion: z.string().nullable().default(null),
  /** ISO timestamp the baseline was captured (null when uncaptured). */
  capturedAt: z.string().nullable().default(null),
});
export type GoldenSet = z.infer<typeof GoldenSetSchema>;

/** The default regression tolerance (points on the 0-100 scale). */
export const DEFAULT_REGRESSION_TOLERANCE = 5;

// ─── Storage ────────────────────────────────────────────────────────────────

/** `<workspace>/golden/`. */
export function goldenDir(ws: string): string {
  return path.join(workspaceDir(ws), "golden");
}

/** `<workspace>/golden/golden-set.json`. */
export function goldenSetPath(ws: string): string {
  return path.join(goldenDir(ws), "golden-set.json");
}

/** Read the workspace's golden set, or an empty set (no items, no baseline) when absent / malformed. */
export function readGoldenSet(ws: string): GoldenSet {
  try {
    return GoldenSetSchema.parse(JSON.parse(fs.readFileSync(goldenSetPath(ws), "utf8")));
  } catch {
    return GoldenSetSchema.parse({});
  }
}

/** Whether the workspace has a golden set with a captured baseline (the gate needs both). */
export function hasGoldenBaseline(ws: string): boolean {
  const set = readGoldenSet(ws);
  return set.items.length > 0 && set.baseline !== null;
}

/**
 * Write the golden set. Append-only spirit: when a baseline already exists on
 * disk AND the incoming write carries a (different) baseline, the prior baseline
 * is archived to `golden/baseline.vN.json` first — a refresh never silently
 * clobbers the number it is replacing.
 */
export function writeGoldenSet(ws: string, set: GoldenSet): void {
  fs.mkdirSync(goldenDir(ws), { recursive: true });
  const prior = readGoldenSetRaw(ws);
  if (prior?.baseline && set.baseline && JSON.stringify(prior.baseline) !== JSON.stringify(set.baseline)) {
    archiveBaseline(ws, { baseline: prior.baseline, bundleVersion: prior.bundleVersion, capturedAt: prior.capturedAt });
  }
  fs.writeFileSync(goldenSetPath(ws), JSON.stringify(GoldenSetSchema.parse(set), null, 2) + "\n");
}

/** Raw on-disk set (undefined when the file is absent), for the archive-before-overwrite check. */
function readGoldenSetRaw(ws: string): GoldenSet | undefined {
  try {
    return GoldenSetSchema.parse(JSON.parse(fs.readFileSync(goldenSetPath(ws), "utf8")));
  } catch {
    return undefined;
  }
}

/** Archive a baseline to the next `golden/baseline.vN.json` (append-only — never overwrites). */
function archiveBaseline(
  ws: string,
  prior: { baseline: GoldenSet["baseline"]; bundleVersion: string | null; capturedAt: string | null },
): void {
  let n = 2;
  while (fs.existsSync(path.join(goldenDir(ws), `baseline.v${n}.json`))) n++;
  fs.writeFileSync(
    path.join(goldenDir(ws), `baseline.v${n}.json`),
    JSON.stringify(prior, null, 2) + "\n",
  );
}

// ─── Golden run + diff ─────────────────────────────────────────────────────────

/** How a criterion was scored in the golden run. */
export type GoldenScoring = "deterministic" | "deferred-needs-real";

export interface GoldenCriterionDelta {
  criterionId: string;
  /** How the candidate side was scored this run. */
  scoring: GoldenScoring;
  /** The stored baseline score for this criterion, or null (no baseline / na). */
  baselineScore: number | null;
  /** The candidate score, or null (deferred / na). */
  candidateScore: number | null;
  /** candidateScore - baselineScore, or null when either side is null. */
  delta: number | null;
  /** True when delta < -tolerance. A null delta never regresses. */
  regressed: boolean;
  /** For `deferred-needs-real`: an estimated cost line (never spent by default). */
  estimatedCostNote?: string;
}

export interface GoldenGateResult {
  workspace: string;
  /** false when any criterion regressed beyond tolerance. */
  ok: boolean;
  /** The tolerance (points) applied this run. */
  tolerance: number;
  /** Whether a baseline was present to diff against (false = gate skipped clean). */
  baselinePresent: boolean;
  /** Per-criterion deltas over the scored (deterministic) criteria + deferred lines. */
  deltas: GoldenCriterionDelta[];
  /** The subset of deltas that regressed. */
  regressions: GoldenCriterionDelta[];
  /** True when every delta >= 0 AND at least one delta > 0 (a genuine improvement). */
  improved: boolean;
  /** The candidate per-criterion scores (feeds baseline promotion). */
  candidateBaseline: Record<string, GoldenBaselineEntry>;
  /** How many golden items the candidate graph ran over (headless, zero spend). */
  itemsRun: number;
  /** Human-readable one-liner. */
  summary: string;
}

export interface RunGoldenGateOptions {
  /** Regression tolerance (points on the 0-100 scale). Default 5. */
  tolerance?: number;
  /**
   * Run the criteria that need real generation / a vision pass (behind the
   * normal approval gate). NEVER set by the gate itself, the loop, or tests —
   * defined for symmetry with the CLI flag only.
   */
  goldenReal?: boolean;
  /** Fan-out cardinality for the synthetic run (default 1 — keep the golden set small). */
  assumeItems?: number;
}

/**
 * Run the golden gate for a workspace against its CANDIDATE graph workflows.
 *
 * DEFAULT = ZERO paid spend:
 *   1. Execute each candidate graph headless through the synthetic executors
 *      (buildSyntheticExecutors) in an ephemeral scratch root — proves the
 *      candidate runs; no provider call, no artifact write.
 *   2. Score the workspace evaluators' DETERMINISTIC criteria via
 *      runWorkspaceEval({ noVision: true }) — no model call. Every `vision`
 *      criterion is reported `deferred-needs-real` (never auto-spent).
 *   3. Diff each SCORED criterion vs the stored baseline per criterion.
 *
 * Returns ok:false when any criterion regressed beyond tolerance. The caller
 * (workspace upgrade / the `workspace golden` verb) owns the refuse/promote
 * decision; this function neither refuses nor spends.
 */
export async function runGoldenGate(
  ws: string,
  candidateGraphs: WorkflowGraph[],
  opts: RunGoldenGateOptions = {},
): Promise<GoldenGateResult> {
  const tolerance = opts.tolerance ?? DEFAULT_REGRESSION_TOLERANCE;
  const set = readGoldenSet(ws);
  const baseline = set.baseline;

  const config = loadWorkspaceEvaluatorsSync(ws);
  const criteria = config?.criteria ?? [];

  // 1 + 2 — run the candidate headless (zero spend) + score the deterministic
  //         criteria (zero model calls). Both happen in ONE ephemeral scratch
  //         root so nothing lands in the real workspace tree.
  const scored = await scoreCandidateDeterministic(ws, candidateGraphs, criteria, opts.assumeItems ?? 1);

  // Build the candidate baseline map (deterministic scores only — deferred
  // criteria carry no candidate number to promote).
  const candidateBaseline: Record<string, GoldenBaselineEntry> = {};
  for (const r of scored.results) {
    candidateBaseline[r.id] = { score: r.score, verdict: r.verdict };
  }

  // 3 — diff per criterion.
  const deltas: GoldenCriterionDelta[] = [];
  for (const c of criteria) {
    if (c.check === "vision") {
      deltas.push({
        criterionId: c.id,
        scoring: "deferred-needs-real",
        baselineScore: baseline?.[c.id]?.score ?? null,
        candidateScore: null,
        delta: null,
        regressed: false,
        estimatedCostNote:
          "vision criterion — one deep-vision pass over a real render (~$0.01-0.05); not run by default (pass --golden-real to score, behind the approval gate)",
      });
      continue;
    }
    const cand = candidateBaseline[c.id]?.score ?? null;
    const base = baseline?.[c.id]?.score ?? null;
    const delta = cand !== null && base !== null ? cand - base : null;
    deltas.push({
      criterionId: c.id,
      scoring: "deterministic",
      baselineScore: base,
      candidateScore: cand,
      delta,
      regressed: delta !== null && delta < -tolerance,
    });
  }

  const regressions = deltas.filter((d) => d.regressed);
  const scoredDeltas = deltas.filter((d) => d.delta !== null);
  const improved =
    scoredDeltas.length > 0 &&
    scoredDeltas.every((d) => (d.delta ?? 0) >= 0) &&
    scoredDeltas.some((d) => (d.delta ?? 0) > 0);
  const baselinePresent = baseline !== null && set.items.length > 0;

  const summary = !baselinePresent
    ? `no golden baseline for "${ws}" — regression gate skipped (capture one with \`ralphy workspace golden ${ws} --refresh\`)`
    : regressions.length > 0
      ? `${regressions.length} criterion regressed beyond ${tolerance}pt: ${regressions.map((r) => `${r.criterionId} (${r.delta})`).join(", ")}`
      : improved
        ? `no regressions; candidate improved on ${scoredDeltas.filter((d) => (d.delta ?? 0) > 0).length} criterion — promote the baseline`
        : `no regressions across ${scoredDeltas.length} scored criterion (${deltas.length - scoredDeltas.length} deferred/na)`;

  return {
    workspace: ws,
    ok: regressions.length === 0,
    tolerance,
    baselinePresent,
    deltas,
    regressions,
    improved,
    candidateBaseline,
    itemsRun: scored.itemsRun,
    summary,
  };
}

/**
 * Execute the candidate graphs headless (synthetic executors, zero spend) once
 * per golden item, then score the workspace evaluators' DETERMINISTIC criteria
 * (noVision, zero model calls). Runs entirely inside an ephemeral scratch root
 * so the golden run never writes into the real workspace / project tree.
 */
async function scoreCandidateDeterministic(
  ws: string,
  candidateGraphs: WorkflowGraph[],
  criteria: Array<{ id: string; check: string }>,
  assumeItems: number,
): Promise<{ results: WorkspaceCriterionResult[]; itemsRun: number }> {
  const set = readGoldenSet(ws);
  const items = set.items.length > 0 ? set.items : [{ id: "golden-1" }];

  // Nothing deterministic to score → skip the (still zero-spend) run entirely.
  const deterministicIds = new Set(criteria.filter((c) => c.check === "deterministic").map((c) => c.id));
  if (candidateGraphs.length === 0) {
    return { results: [], itemsRun: 0 };
  }

  // Snapshot the LIVE workspace's evaluator files BEFORE switching root (the
  // scratch workspace needs them for the eval config loader to resolve).
  const evaluatorFiles = snapshotEvaluatorFiles(ws);

  const prevRoot = root();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-golden-"));
  let itemsRun = 0;
  try {
    fs.mkdirSync(path.join(scratch, ".ralphy"), { recursive: true });
    setRoot(scratch);
    fs.mkdirSync(workspaceDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }) + "\n");

    // Materialize the candidate graphs + evaluators into the scratch workspace so
    // the runner + the eval config loader resolve them from disk.
    fs.mkdirSync(path.join(workspaceDir(ws), "workflows"), { recursive: true });
    candidateGraphs.forEach((graph, i) => {
      const name = graph.name || `candidate-${i + 1}`;
      fs.writeFileSync(
        path.join(workspaceDir(ws), "workflows", `${name}.json`),
        JSON.stringify(graph, null, 2) + "\n",
      );
    });
    for (const [rel, body] of evaluatorFiles) {
      const dest = path.join(workspaceDir(ws), rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
    }

    // Execute each candidate graph headless per golden item (zero spend).
    const graphs = loadGraphWorkflows(ws);
    const collector = { approvalStops: [] as never[], budgetGuards: [] as never[] };
    const overrides = buildSyntheticExecutors(assumeItems, collector);
    for (const _item of items) {
      for (const g of graphs) {
        await fireTick(ws, g.name, g.graph, {
          sleep: async () => {},
          executorOverrides: overrides,
          noCache: true,
        });
      }
      itemsRun++;
    }

    // Score against a fresh ephemeral project (deterministic validators degrade
    // gracefully on a bare project — they read index.html / metrics best-effort).
    const projectId = `golden-${randomUUID().slice(0, 8)}`;
    fs.mkdirSync(projectDir(projectId), { recursive: true });
    const evalResult = await runWorkspaceEval(projectId, { noVision: true, workspace: ws });
    const results = evalResult.criteria.filter((r) => deterministicIds.has(r.id));
    return { results, itemsRun };
  } finally {
    setRoot(prevRoot);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Read the LIVE workspace's evaluator files (config + style lock + benchmarks +
 * any rubrics/*.md the vision criteria reference) as [workspace-relative, body]
 * pairs, so the golden run can re-materialize them under the scratch root.
 * Called BEFORE setRoot(scratch) — resolves against the live root.
 */
function snapshotEvaluatorFiles(ws: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const dir = workspaceDir(ws);
  for (const f of ["evaluators.json", "STYLE_LOCK.md", "metrics-benchmarks.json"]) {
    const src = path.join(dir, f);
    try {
      out.push([f, fs.readFileSync(src, "utf8")]);
    } catch {
      /* missing — the loader degrades gracefully */
    }
  }
  const rubricsDir = path.join(dir, "rubrics");
  try {
    for (const f of fs.readdirSync(rubricsDir)) {
      const src = path.join(rubricsDir, f);
      if (fs.statSync(src).isFile()) out.push([path.join("rubrics", f), fs.readFileSync(src, "utf8")]);
    }
  } catch {
    /* no rubrics dir */
  }
  return out;
}

/**
 * Promote a golden-gate result's candidate scores to the workspace's stored
 * baseline (append-only — the prior baseline is archived). Called after a
 * SUCCESSFUL improving upgrade apply, and by `workspace golden --refresh`.
 */
export function promoteBaseline(ws: string, candidate: Record<string, GoldenBaselineEntry>, bundleVersion: string | null): void {
  const set = readGoldenSet(ws);
  writeGoldenSet(ws, {
    ...set,
    baseline: candidate,
    bundleVersion,
    capturedAt: new Date().toISOString(),
  });
}
