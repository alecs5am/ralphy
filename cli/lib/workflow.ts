// Per-workspace workflow load / list / default-derivation (#478).
//
// Storage: .ralphy/workspaces/<ws>/workflows/<name>.json (workflowsDir). Loading
// mirrors loadWorkspaceEvaluators (read JSON, parse with the schema); on read the
// gate criterion ids are cross-checked against the workspace evaluators.json so a
// step can't gate on a criterion that doesn't exist (#478 acceptance).
//
// deriveDefaultWorkflow scaffolds a sensible starting workflow for `workflow init`
// from the contract spine + the workspace stageGates (+ an optional content-mode
// for image-vs-video engine inference). It is a STARTING POINT the owner edits —
// the inference is a reasonable guess, not a contract.

import fs from "node:fs/promises";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { workflowsDir, projectDir, projectWorkspace } from "./paths.js";
import { dbPath, listJobs } from "./jobs/db.js";
import {
  parseWorkflow,
  type Workflow,
  type WorkflowStep,
  type WorkflowEngine,
} from "./schemas/workflow.js";
import { loadWorkspaceEvaluatorsSync } from "./workspace-evaluators.js";
import { CONTRACT_PHASES, evaluateContract } from "./contract.js";
import { CONTENT_MODES, type ContentMode } from "./content-modes.js";
import { WORKSPACE_EVAL_ARTIFACT } from "./eval/workspace-evaluators.js";

export const WORKFLOW_EXT = ".json";

export function workflowPath(ws: string, name: string): string {
  return path.join(workflowsDir(ws), `${name}${WORKFLOW_EXT}`);
}

/** Names of the workflows authored in a workspace (basenames, sorted). */
export function listWorkflowNames(ws: string): string[] {
  try {
    return readdirSync(workflowsDir(ws))
      .filter((f) => f.endsWith(WORKFLOW_EXT))
      .map((f) => f.slice(0, -WORKFLOW_EXT.length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Resolve which workflow to use: an explicit name, else the workspace's only
 * one, else "episode" when present. Throws when ambiguous or absent.
 */
export function resolveWorkflowName(ws: string, name?: string): string {
  if (name) {
    if (!existsSync(workflowPath(ws, name))) {
      throw new Error(`workflow "${name}" not found in workspace "${ws}"`);
    }
    return name;
  }
  const names = listWorkflowNames(ws);
  if (names.length === 0) {
    throw new Error(`no workflows in workspace "${ws}" — scaffold one with: ralphy workflow init ${ws}`);
  }
  if (names.length === 1) return names[0];
  if (names.includes("episode")) return "episode";
  throw new Error(`workspace "${ws}" has ${names.length} workflows (${names.join(", ")}) — pass --workflow <name>`);
}

/**
 * Load + validate a workspace workflow. Throws on a missing file, a malformed
 * config (ZodError), or a gate that references an unknown workspace criterion.
 */
export async function loadWorkflow(ws: string, name: string): Promise<Workflow> {
  const raw = JSON.parse(await fs.readFile(workflowPath(ws, name), "utf-8"));
  const wf = parseWorkflow(raw);
  const known = new Set(
    (loadWorkspaceEvaluatorsSync(ws)?.criteria ?? []).map((c) => c.id),
  );
  if (known.size > 0) {
    for (const step of wf.steps) {
      for (const g of step.gate) {
        if (!known.has(g)) {
          throw new Error(
            `workflow "${name}" step "${step.id}" gates on unknown criterion "${g}" — not in ${ws}/evaluators.json`,
          );
        }
      }
    }
  }
  return wf;
}

// ─── Default derivation (workflow init) ──────────────────────────────────────

/** The core creative pipeline phases a default workflow surfaces as steps. */
const CORE_PHASES = ["intake", "style-lock", "scenario", "assets", "render", "eval"];
/** Phases that default to a manual approval checkpoint. */
const APPROVE_PHASES = new Set(["scenario", "assets", "eval"]);
/** Friendly default labels for the core phases (owner edits freely). */
const PHASE_LABELS: Record<string, string> = {
  intake: "Load context",
  "style-lock": "Cast + location anchors",
  scenario: "Scenario",
  assets: "Scene generation",
  render: "Render",
  eval: "Eval",
};
/** Formats whose `assets` phase generates stills rather than video. */
const IMAGE_FORMATS = ["image", "poster", "carousel", "fb-creative", "sticker-pack"];

function inferEngine(phase: string, format: string): WorkflowEngine {
  switch (phase) {
    case "scenario":
    case "prompts":
      return "llm";
    case "style-lock":
      return "generate.image";
    case "assets":
      return IMAGE_FORMATS.includes(format) ? "generate.image" : "generate.video";
    case "render":
      return "render";
    case "eval":
      return "eval";
    default:
      return "agent";
  }
}

/**
 * Scaffold a default workflow for a workspace: walk the (correctly-ordered)
 * contract phases, keep the core creative phases plus any phase a workspace
 * stageGate targets, and attach each phase's gate criteria. Reusing the contract
 * order guarantees a valid sequence (scenario before assets, render before eval)
 * for free. Engine is inferred (image vs video from the content mode); model is
 * left unset so no stale id is baked in. Normalized through the schema so the
 * scaffold is always schema-valid.
 */
export function deriveDefaultWorkflow(
  ws: string,
  mode?: ContentMode,
  name = "episode",
): Workflow {
  const stageGates = loadWorkspaceEvaluatorsSync(ws)?.stageGates ?? [];
  const gateByPhase = new Map<string, { criteria: string[]; block: boolean }>();
  for (const g of stageGates) {
    const e = gateByPhase.get(g.phase) ?? { criteria: [], block: false };
    e.criteria.push(...g.criteria);
    if (g.severity !== "warn") e.block = true; // schema default is "block"
    gateByPhase.set(g.phase, e);
  }

  const format = mode ? CONTENT_MODES[mode].expectedUnitShape.format : "video";
  const include = new Set<string>([...CORE_PHASES, ...gateByPhase.keys()]);

  const steps = CONTRACT_PHASES.filter((p) => include.has(p.id)).map((p) => {
    const g = gateByPhase.get(p.id);
    const gate = g ? [...new Set(g.criteria)] : [];
    return {
      id: p.id,
      label: PHASE_LABELS[p.id] ?? p.id,
      phase: p.id,
      engine: inferEngine(p.id, format),
      variants: 1,
      gate,
      mode: g?.block || APPROVE_PHASES.has(p.id) ? "approve" : "auto",
      repair: { retryBudget: 2, batchApproved: false },
    };
  });

  return parseWorkflow({ version: "1.0", name, steps });
}

// ─── Status ledger (workflow status / run) ───────────────────────────────────
//
// Pure derivation over already-on-disk state — mirrors evaluateContract (#406).
// No separate workflow-state file: a step's status is read from the contract
// phase artifacts (present?), the workspace-eval.json gate verdicts, and the
// jobs.db active-job count. Same "declarative steps → pure evaluator → thin
// command wrapper" shape the contract ledger uses.

export type WorkflowStepRunStatus = "done" | "running" | "waiting" | "blocked" | "queued";
export type GateVerdict = "pass" | "warn" | "fail" | "na";

export interface WorkflowStepStatus {
  id: string;
  label: string;
  phase: string;
  engine: WorkflowEngine;
  model: string | null;
  variants: number;
  gate: string[];
  mode: "auto" | "approve";
  status: WorkflowStepRunStatus;
  /** Worst verdict over the step's gate criteria (null when ungated). */
  gateVerdict: GateVerdict | null;
  phaseSatisfied: boolean;
}

export interface WorkflowEvaluation {
  project: string;
  workspace: string;
  workflow: string;
  version: string;
  steps: WorkflowStepStatus[];
  /** First not-done step (the cursor), or null when complete. */
  currentStep: string | null;
  /** One-line, agent-facing instruction for the current step. */
  nextAction: string;
  complete: boolean;
  runningJobs: number;
  awaitingApproval: boolean;
}

const VERDICT_RANK: Record<GateVerdict, number> = { fail: 3, warn: 2, na: 1, pass: 0 };
function worstVerdict(vs: GateVerdict[]): GateVerdict {
  return vs.reduce<GateVerdict>((w, v) => (VERDICT_RANK[v] > VERDICT_RANK[w] ? v : w), "pass");
}

/** Map criterion id → its latest verdict from <project>/workspace-eval.json. */
function readScorecardVerdicts(project: string): Record<string, GateVerdict> {
  try {
    const raw = JSON.parse(
      readFileSync(path.join(projectDir(project), WORKSPACE_EVAL_ARTIFACT), "utf-8"),
    );
    const map: Record<string, GateVerdict> = {};
    for (const c of raw?.criteria ?? []) {
      if (c && typeof c.id === "string") map[c.id] = c.verdict;
    }
    return map;
  } catch {
    return {};
  }
}

/** Active (pending + running) jobs for a project — guarded so a read never creates jobs.db. */
function countActiveJobs(project: string): number {
  if (!existsSync(dbPath())) return 0;
  try {
    return listJobs({ projectId: project, status: ["pending", "running"] }).length;
  } catch {
    return 0;
  }
}

function describeNext(cur: WorkflowStepStatus | null, project: string): string {
  if (!cur) return "Workflow complete — all steps done.";
  switch (cur.status) {
    case "blocked":
      return `Step "${cur.label}" (${cur.phase}) is BLOCKED — gate failed (${cur.gate.join(", ")}). Run the repair loop (ralphy project repair-plan ${project} / the /fixer skill).`;
    case "running":
      return `Step "${cur.label}" (${cur.phase}) is generating — wait for the queue to drain, then check its gate.`;
    case "waiting":
      return cur.gate.length > 0
        ? `Step "${cur.label}" (${cur.phase}) awaits your approval — check the gate (ralphy workspace eval ${project} --criterion ${cur.gate.join(" --criterion ")}) and approve to continue.`
        : `Step "${cur.label}" (${cur.phase}) awaits your approval — review and approve to continue.`;
    default:
      return `Run step "${cur.label}" (${cur.phase}) via the ${cur.engine} engine.`;
  }
}

/**
 * Derive the per-step run status of a workflow for a project. Pure read over the
 * contract ledger + workspace-eval.json + jobs.db. A step is `done` when its
 * phase artifact exists AND (it has no gate OR the gate verdict is pass/warn);
 * the first not-done step is the cursor, refined to blocked | running | waiting
 * | queued. Throws on an unresolvable / unknown / malformed workflow.
 */
export async function evaluateWorkflow(
  project: string,
  name?: string,
): Promise<WorkflowEvaluation> {
  const ws = projectWorkspace(project);
  const wfName = resolveWorkflowName(ws, name);
  const wf = await loadWorkflow(ws, wfName);

  const contract = evaluateContract(project);
  const satisfied = new Set(contract.phases.filter((p) => p.satisfied).map((p) => p.id));
  const verdicts = readScorecardVerdicts(project);
  const activeJobs = countActiveJobs(project);

  const base = wf.steps.map((s: WorkflowStep) => {
    const phaseSatisfied = satisfied.has(s.phase);
    const gateVerdict =
      s.gate.length === 0
        ? null
        : worstVerdict(s.gate.map((id) => verdicts[id] ?? "na"));
    const done =
      phaseSatisfied &&
      (s.gate.length === 0 || gateVerdict === "pass" || gateVerdict === "warn");
    return { s, phaseSatisfied, gateVerdict, done };
  });

  const cursor = base.findIndex((b) => !b.done);
  const complete = cursor === -1;

  const steps: WorkflowStepStatus[] = base.map((b, i) => {
    let status: WorkflowStepRunStatus;
    if (b.done) status = "done";
    else if (i !== cursor) status = "queued";
    else if (b.gateVerdict === "fail") status = "blocked";
    else if (activeJobs > 0) status = "running";
    else if (b.s.mode === "approve") status = "waiting";
    else status = "queued";
    return {
      id: b.s.id,
      label: b.s.label || b.s.id,
      phase: b.s.phase,
      engine: b.s.engine,
      model: b.s.model ?? (b.s.models?.length ? b.s.models.join(", ") : null),
      variants: b.s.variants,
      gate: b.s.gate,
      mode: b.s.mode,
      status,
      gateVerdict: b.gateVerdict,
      phaseSatisfied: b.phaseSatisfied,
    };
  });

  const cur = complete ? null : steps[cursor];
  return {
    project,
    workspace: ws,
    workflow: wfName,
    version: wf.version,
    steps,
    currentStep: cur?.id ?? null,
    nextAction: describeNext(cur, project),
    complete,
    runningJobs: activeJobs,
    awaitingApproval: cur?.status === "waiting",
  };
}
