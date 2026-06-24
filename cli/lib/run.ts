// Workspace-scoped Run (campaign) control plane (#480).
//
// A Run binds ONE content-farm campaign across its member projects. It only
// REFERENCES existing artifacts (project ids, batch id, paths, Unit ids) — it
// never duplicates them. This module is the read-side + create + append-only
// event log; the rich operator view is `summarizeRun`.
//
// Design notes mirror the rest of the codebase:
//   • Storage is file-on-disk under the workspace (like batches under
//     batchesDir()), NOT a registry collection — runs are discovered by listing
//     `.ralphy/workspaces/<ws>/runs/`.
//   • `summarizeRun` is PURE best-effort aggregation: it composes the EXISTING
//     per-project helpers (evaluateContract, buildScorecard, actualSpendUsd /
//     budgetSummary, evaluateWorkflow when a workflow is set). ZERO model calls.
//     A member project that doesn't resolve on disk lands in `missingProjects`
//     and is skipped — never a throw.
//   • The event log (`run-events.jsonl`) ONLY ever appends (AGENTS.md #14).
//   • Updating run.json (e.g. add a member project) is allowed — run.json is
//     run-level METADATA. Member-project artifacts are NEVER touched.

import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  runsDir,
  runDir,
  runManifestPath,
  runWorkspace,
  currentWorkspace,
  projectDir,
  projectWorkspace,
} from "./paths.js";
import {
  parseRun,
  type RunManifest,
  type RunStatusValue,
  RUN_EVENTS_ARTIFACT,
} from "./schemas/run.js";
import { evaluateContract } from "./contract.js";
import { buildScorecard } from "./scorecard.js";
import { budgetSummary } from "./spend.js";
import { evaluateWorkflow } from "./workflow.js";
import type { ScorecardVerdict } from "./schemas/scorecard.js";

// ─── Create / load / list ───────────────────────────────────────────────────

export interface CreateRunInput {
  id: string;
  workspace: string;
  title: string;
  brief?: string;
  status?: RunStatusValue;
  workflow?: string;
  projectIds?: string[];
  batchId?: string;
  strategyPath?: string;
  intelligencePackPath?: string;
  unitIds?: string[];
  createdAt?: string;
}

/**
 * Create a run: write run.json under `runs/<id>/` (mkdir -p). Throws an
 * `E_ALREADY_EXISTS`-shaped error when the run id already exists. Lib code can't
 * call raiseError (it process.exit()s), so the command layer checks existence
 * and raises the catalog error; this helper just refuses to clobber.
 */
export async function createRun(input: CreateRunInput): Promise<RunManifest> {
  const dir = runDir(input.workspace, input.id);
  if (existsSync(path.join(dir, "run.json"))) {
    const e = new Error(`run already exists: ${input.id}`) as Error & { code: string };
    e.code = "E_ALREADY_EXISTS";
    throw e;
  }
  const manifest = parseRun({
    version: 1,
    id: input.id,
    workspace: input.workspace,
    title: input.title,
    brief: input.brief,
    status: input.status ?? "active",
    createdAt: input.createdAt ?? new Date().toISOString(),
    workflow: input.workflow,
    projectIds: input.projectIds ?? [],
    batchId: input.batchId,
    strategyPath: input.strategyPath,
    intelligencePackPath: input.intelligencePackPath,
    unitIds: input.unitIds,
  });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(runManifestPath(input.workspace, input.id), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/** Read + parse a run's manifest. Returns null on a missing / unparseable run. */
export async function loadRun(runId: string): Promise<RunManifest | null> {
  const ws = runWorkspace(runId);
  try {
    const raw = JSON.parse(await fs.readFile(runManifestPath(ws, runId), "utf-8"));
    return parseRun(raw);
  } catch {
    return null;
  }
}

/** A light list-row for `ralphy run list`. */
export interface RunSummaryLite {
  id: string;
  title: string;
  status: RunStatusValue;
  workspace: string;
  projects: number;
  workflow: string | null;
}

/** List the runs in a workspace (default: the active one). Sorted by id. */
export async function listRuns(ws: string = currentWorkspace()): Promise<RunSummaryLite[]> {
  let ids: string[];
  try {
    const entries = await fs.readdir(runsDir(ws), { withFileTypes: true });
    ids = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
  const rows: RunSummaryLite[] = [];
  for (const id of ids) {
    try {
      const raw = JSON.parse(await fs.readFile(runManifestPath(ws, id), "utf-8"));
      const m = parseRun(raw);
      rows.push({
        id: m.id,
        title: m.title,
        status: m.status,
        workspace: m.workspace,
        projects: m.projectIds.length,
        workflow: m.workflow ?? null,
      });
    } catch {
      /* a dir without a parseable run.json — skip it from the listing */
    }
  }
  return rows;
}

/**
 * Which run (if any) a project is a member of (#481). Scans the project's
 * workspace runs for the first manifest listing this project id. Returns null
 * when the project belongs to no run. SYNC + best-effort (a dir without a
 * parseable run.json is skipped) — the spend gate calls this on the hot path.
 */
export function projectRun(projectId: string): { runId: string; workspace: string } | null {
  const ws = projectWorkspace(projectId);
  let ids: string[];
  try {
    ids = readdirSync(runsDir(ws), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  for (const id of ids) {
    try {
      const raw = JSON.parse(readFileSync(runManifestPath(ws, id), "utf-8"));
      const m = parseRun(raw);
      if (m.projectIds.includes(projectId)) return { runId: m.id, workspace: ws };
    } catch {
      /* unparseable run dir — skip */
    }
  }
  return null;
}

// ─── Append-only event log ────────────────────────────────────────────────────

export interface RunEvent {
  /** ISO timestamp (auto-filled when omitted). */
  ts?: string;
  /** Optional contract phase the event relates to. */
  phase?: string;
  /** Event kind (kebab-case): created | project-added | status-changed | note | … */
  kind: string;
  /** One-line, English-on-disk message. */
  message: string;
  /** Free-form extra fields. */
  [k: string]: unknown;
}

/**
 * Append a JSON line to the run's `run-events.jsonl`. APPEND-ONLY — never
 * rewrites the file (AGENTS.md #14). Best-effort mkdir so a first event on a
 * fresh run dir still lands.
 */
export async function appendRunEvent(runId: string, event: RunEvent): Promise<void> {
  const ws = runWorkspace(runId);
  const dir = runDir(ws, runId);
  await fs.mkdir(dir, { recursive: true });
  const row = { ts: event.ts ?? new Date().toISOString(), ...event };
  await fs.appendFile(path.join(dir, RUN_EVENTS_ARTIFACT), JSON.stringify(row) + "\n");
}

// ─── Add a member project (run-level metadata update) ──────────────────────────

/**
 * Append a member project id to the run (re-reads + rewrites run.json). run.json
 * is run-level METADATA, so updating it is allowed; member-project artifacts are
 * NEVER touched. Idempotent — a project already in the list is a no-op. Returns
 * the updated manifest, or null when the run does not exist.
 */
export async function addProjectToRun(runId: string, projectId: string): Promise<RunManifest | null> {
  const existing = await loadRun(runId);
  if (!existing) return null;
  if (!existing.projectIds.includes(projectId)) {
    existing.projectIds = [...existing.projectIds, projectId];
    await fs.writeFile(
      runManifestPath(existing.workspace, runId),
      JSON.stringify(existing, null, 2) + "\n",
    );
  }
  return existing;
}

// ─── Status (the heart: pure aggregation over member projects) ─────────────────

/** Per-project quality roll-up entry. */
export interface RunQualityEntry {
  project: string;
  verdict: ScorecardVerdict;
  polished: boolean | null;
  reason: string;
}

export interface RunCostSummary {
  /** Sum of actual spend (generations.jsonl cost_usd) across member projects. */
  spentUsd: number;
  /**
   * The effective run cap: the RUN-WIDE approval cap (#481) when a run ledger
   * exists, else the sum of the per-project approved caps, else null.
   */
  capUsd: number | null;
  /** cap - spent (null when no cap). */
  remainingUsd: number | null;
  /** true when a cap exists and run-wide spent ≥ cap (#481). */
  overBudget: boolean;
  /** Estimated remaining QUEUED spend — pending generate.* jobs on run members (#481). */
  queuedEstimateUsd: number;
  /** Per-project spend breakdown. */
  byProject: Array<{ project: string; spentUsd: number; capUsd: number | null }>;
}

export interface RunStatus {
  id: string;
  workspace: string;
  title: string;
  status: RunStatusValue;
  /** Total member projects declared. */
  projectCount: number;
  /** Member project ids that don't resolve to a dir on disk (degraded, never thrown). */
  missingProjects: string[];
  /** The furthest contract phase reached across member projects (the laggard cursor). */
  currentPhase: string | null;
  /** Hard blockers across member projects (stopConditions with severity "block"). */
  blockers: Array<{ project: string; id: string; phase: string; detail: string }>;
  /** Steps/phases awaiting a user approval (workflow `waiting` steps, else pre-spend gate). */
  awaitingApprovals: Array<{ project: string; detail: string }>;
  costSummary: RunCostSummary;
  /** Per-project scorecard verdict roll-up. */
  qualitySummary: RunQualityEntry[];
  /** Ship-ready member projects (scorecard verdict `ship`). */
  winners: string[];
  /** Blocked member projects (scorecard verdict `blocked`). */
  failures: string[];
  /** One-line, agent-facing next step. */
  nextAction: string;
}

/**
 * Summarize a run: PURE aggregation over its member projects via the existing
 * per-project helpers. ZERO model calls. A member project that does not resolve
 * on disk is recorded in `missingProjects` and skipped — NEVER a throw.
 */
export async function summarizeRun(runId: string): Promise<RunStatus | null> {
  const run = await loadRun(runId);
  if (!run) return null;

  const missingProjects: string[] = [];
  const resolved: string[] = [];
  for (const pid of run.projectIds) {
    if (existsSync(projectDir(pid))) resolved.push(pid);
    else missingProjects.push(pid);
  }

  const blockers: RunStatus["blockers"] = [];
  const awaitingApprovals: RunStatus["awaitingApprovals"] = [];
  const qualitySummary: RunQualityEntry[] = [];
  const byProject: RunCostSummary["byProject"] = [];
  const winners: string[] = [];
  const failures: string[] = [];
  const phaseDepth: Array<{ project: string; phase: string | null }> = [];

  // Contract phase order — for the laggard "currentPhase" (the furthest phase the
  // SLOWEST member project has reached). The whole farm is only as far as its
  // least-advanced project.
  const { CONTRACT_PHASES } = await import("./contract.js");
  const phaseOrder = new Map(CONTRACT_PHASES.map((p, i) => [p.id, i] as const));

  let spentUsd = 0;
  let capTotal = 0;
  let anyCap = false;

  for (const pid of resolved) {
    // Contract — phase, blockers, the pre-spend approval gate.
    const contract = evaluateContract(pid);
    phaseDepth.push({ project: pid, phase: contract.currentPhase });
    for (const stop of contract.stopConditions) {
      if (stop.severity === "block") {
        blockers.push({ project: pid, id: stop.id, phase: stop.phase, detail: stop.detail });
      }
      if (stop.id === "user-approval-needed") {
        awaitingApprovals.push({ project: pid, detail: stop.detail });
      }
    }

    // Scorecard — quality roll-up + winners/failures.
    let verdict: ScorecardVerdict = "needs-user-decision";
    let polished: boolean | null = null;
    let reason = "";
    try {
      const card = buildScorecard({ projectId: pid });
      verdict = card.verdict;
      polished = card.polished;
      reason = card.reason;
    } catch {
      reason = "scorecard could not be built";
    }
    qualitySummary.push({ project: pid, verdict, polished, reason });
    if (verdict === "ship") winners.push(pid);
    if (verdict === "blocked") failures.push(pid);

    // Cost — actual spend + cap (per project).
    let projSpent = 0;
    let projCap: number | null = null;
    try {
      const budget = await budgetSummary(pid);
      projSpent = budget.spentUsd;
      projCap = budget.capUsd;
    } catch {
      /* unreadable ledger / gen-log → 0 spend, no cap */
    }
    spentUsd += projSpent;
    if (projCap != null) {
      anyCap = true;
      capTotal += projCap;
    }
    byProject.push({ project: pid, spentUsd: projSpent, capUsd: projCap });

    // Workflow — surface a `waiting` step as an approval, when a workflow is set.
    if (run.workflow) {
      try {
        const wf = await evaluateWorkflow(pid, run.workflow);
        if (wf.awaitingApproval && wf.currentStep) {
          awaitingApprovals.push({ project: pid, detail: `${pid}: ${wf.nextAction}` });
        }
      } catch {
        /* unresolvable / unknown workflow — skip the workflow lane for this project */
      }
    }
  }

  // currentPhase = the laggard: the LEAST-advanced phase among resolved projects.
  let currentPhase: string | null = null;
  if (phaseDepth.length > 0) {
    let minRank = Number.POSITIVE_INFINITY;
    for (const { phase } of phaseDepth) {
      const rank = phase == null ? -1 : (phaseOrder.get(phase) ?? -1);
      if (rank < minRank) {
        minRank = rank;
        currentPhase = phase;
      }
    }
  }

  // Effective cap: the RUN-WIDE approval cap (#481) when a run ledger exists,
  // else the sum of per-project caps (legacy behavior). The run cap is the spend
  // ceiling the queue dispatch gate enforces, so it's the authoritative figure.
  const { readRunLedger, activeApproval } = await import("./spend.js");
  const runApproval = activeApproval(await readRunLedger(run.id));
  const spentRounded = Number(spentUsd.toFixed(6));
  const capUsd = runApproval ? runApproval.budgetCapUsd : anyCap ? Number(capTotal.toFixed(6)) : null;
  const overBudget = capUsd != null && spentRounded >= capUsd;

  const { estimateRunQueuedSpendUsd } = await import("./jobs/queued-spend.js");
  const queuedEstimateUsd = estimateRunQueuedSpendUsd(run.projectIds);

  const costSummary: RunCostSummary = {
    spentUsd: spentRounded,
    capUsd,
    remainingUsd: capUsd == null ? null : Number((capUsd - spentRounded).toFixed(6)),
    overBudget,
    queuedEstimateUsd,
    byProject,
  };

  // A run that is at/over its run-wide cap is a hard blocker — paid generation
  // (direct + queued) will refuse until the cap is raised (#481).
  if (overBudget) {
    blockers.push({
      project: run.id,
      id: "run-over-budget",
      phase: "assets",
      detail: `Run-wide spend $${spentRounded.toFixed(2)} ≥ cap $${(capUsd ?? 0).toFixed(2)} — raise it with \`ralphy run approve ${run.id} --cap <usd> --reason <text>\` or paid generation will refuse.`,
    });
  }

  return {
    id: run.id,
    workspace: run.workspace,
    title: run.title,
    status: run.status,
    projectCount: run.projectIds.length,
    missingProjects,
    currentPhase,
    blockers,
    awaitingApprovals,
    costSummary,
    qualitySummary,
    winners,
    failures,
    nextAction: deriveNextAction({
      runStatus: run.status,
      resolvedCount: resolved.length,
      missingProjects,
      blockers,
      awaitingApprovals,
      winners,
      total: run.projectIds.length,
    }),
  };
}

/** One-line, agent-facing next step. Pure over the rolled-up state. */
function deriveNextAction(s: {
  runStatus: RunStatusValue;
  resolvedCount: number;
  missingProjects: string[];
  blockers: RunStatus["blockers"];
  awaitingApprovals: RunStatus["awaitingApprovals"];
  winners: string[];
  total: number;
}): string {
  if (s.total === 0) {
    return "No member projects yet — add one with `ralphy run add-project <id> <project>`.";
  }
  if (s.resolvedCount === 0) {
    return `None of the ${s.total} member project(s) resolve on disk (${s.missingProjects.join(", ")}). Re-link or recreate them before continuing.`;
  }
  if (s.blockers.length > 0) {
    const b = s.blockers[0]!;
    return `Clear the blocker on "${b.project}" (${b.id} at phase ${b.phase}): ${b.detail}`;
  }
  if (s.awaitingApprovals.length > 0) {
    return `Approve to advance: ${s.awaitingApprovals[0]!.detail}`;
  }
  if (s.winners.length === s.resolvedCount) {
    return `All ${s.resolvedCount} resolved project(s) are ship-ready — form Units (`+
      "`ralphy unit create`) and package the campaign deliverables.";
  }
  return `Continue the pipeline on the ${s.resolvedCount - s.winners.length} project(s) not yet ship-ready (${s.winners.length}/${s.resolvedCount} ship-ready).`;
}
