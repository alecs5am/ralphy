// Control-flow + data node executors (#503): approval, budget-guard, gate,
// join, switch, transform, template-string, artifact-write.
//
// Park/halt/route are NOT failures — they are run-control decisions, so they
// travel as RunControlSignal (a distinct throwable the farm runner catches
// BEFORE on_fail routing ever sees it). A NodeExecutionError still means "the
// node failed" and takes the node's on_fail route.
//
// Approval state model (#482): the run's append-only spend ledger
// (`runs/<runId>/spend-ledger.json`, written by `ralphy run approve`) is the
// approval record. No active (non-expired) approval → the approval node parks
// the run and drops a visible pack into the existing agent-inbox mechanism
// (#489, `runs/<runId>/agent-inbox/<ts>-approve.{json,md}`) naming the exact
// `ralphy run approve` command. A later farm tick / `farm start` re-executes
// the node and passes once the approval is recorded — parked runs survive
// restarts for days by construction (journal + farm-state file).
//
// Gate (#473 semantics): consumes an eval-verdict object (the #427 vocab
// ship | repair | needs-user-decision | blocked). ship → continue (pruning
// the repair branch); repair with params.repair_to → a route signal (the FREE
// auto-loop); repair without a route, needs-user-decision, blocked → park
// like approval (paid regen never auto-fires).
//
// fan-out is deliberately NOT here: mapping the downstream subgraph once per
// input item is the RUNNER's job (cli/lib/farm/runner.ts, #510) — branch
// identity = the item index, branch-scoped journal records
// (`<node-id>@<branch>`), params.concurrency cap, per-branch on_fail
// isolation, durable per-branch resume. `join` (below) executes once,
// top-level: the runner resolves its branch-scoped in-ports to order-stable
// per-branch arrays before this executor runs. Nested fan-out is unsupported
// (structured halt; #517 reusable subgraphs is the follow-up).

import fs from "node:fs/promises";
import path from "node:path";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";
import { writeNodeArtifact, resolveNodePrompt } from "./llm.js";

// ─── Run-control signal ──────────────────────────────────────────────────────

export type RunControlKind = "park-approval" | "halt-budget" | "route";

/** A run-control decision thrown by a control-flow executor. Not a failure. */
export class RunControlSignal extends Error {
  readonly kind: RunControlKind;
  /** route: the node id execution jumps to. */
  readonly target?: string;
  constructor(kind: RunControlKind, message: string, target?: string) {
    super(message);
    this.name = "RunControlSignal";
    this.kind = kind;
    this.target = target;
  }
}

// ─── approval ────────────────────────────────────────────────────────────────

type ApprovalParams = {
  /** Trust-ladder valve: true → the node auto-passes (L1/L2 workspaces). */
  auto_pass?: boolean;
  /** What the user is being asked to approve (lands in the inbox pack). */
  reason?: string;
};

/** Write the park notice through the existing #489 inbox mechanism. */
export async function writeApprovalInboxPack(
  ctx: ExecutorContext,
  nodeId: string,
  reason: string,
): Promise<string | null> {
  if (!ctx.runDir || !ctx.runId) return null;
  const dir = path.join(ctx.runDir, "agent-inbox");
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-approve`;
  const requestedOutcome =
    `Farm run "${ctx.runId}" is parked at approval node "${nodeId}": ${reason} ` +
    `Record an approval with: ralphy run approve ${ctx.runId} --cap <usd> --reason "<why>" — the next farm tick resumes past the node.`;
  const pack = {
    version: 1,
    kind: "agent-inbox",
    id,
    action: "approve",
    createdAt: new Date().toISOString(),
    workspace: ctx.workspace,
    run: ctx.runId,
    project: null,
    selected: [{ type: "run", ref: ctx.runId, tags: [], note: reason }],
    tags: ["farm", "parked-approval"],
    note: reason,
    requestedOutcome,
  };
  await fs.mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, `${id}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(pack, null, 2) + "\n");
  await fs.writeFile(
    path.join(dir, `${id}.md`),
    `# Approval needed — farm run ${ctx.runId}\n\n${requestedOutcome}\n`,
  );
  return jsonPath;
}

/**
 * The project whose workspace-eval scorecard justifies a trust auto-pass:
 * ctx.projectId when the run is project-scoped, else the run's SOLE member
 * project. Ambiguous (0 or 2+ members) → null → the node parks conservatively.
 */
async function resolveTrustProject(ctx: ExecutorContext): Promise<string | null> {
  if (ctx.projectId) return ctx.projectId;
  if (!ctx.runId) return null;
  const { loadRun } = await import("../../run.js");
  const run = await loadRun(ctx.runId);
  return run && run.projectIds.length === 1 ? run.projectIds[0]! : null;
}

export const approvalExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as ApprovalParams;
  if (p.auto_pass === true) {
    return { output: { approved: true, autoPass: true } };
  }
  if (!ctx.runId) {
    throw new NodeExecutionError(
      "run-context-missing",
      `approval node "${node.id}" needs a run context (ctx.runId) — it only executes inside a farm run`,
    );
  }
  const { readRunLedger, activeApproval } = await import("../../spend.js");
  const approval = activeApproval(await readRunLedger(ctx.runId));
  const expired =
    approval?.expiry != null &&
    Number.isFinite(Date.parse(approval.expiry)) &&
    Date.now() > Date.parse(approval.expiry);
  if (approval && !expired) {
    return {
      output: { approved: true, approvedAt: approval.approvedAt, capUsd: approval.budgetCapUsd },
    };
  }

  // #505 trust ladder: an L1/L2 workspace may auto-pass this gate when the
  // run's project carries a gate-clearing workspace-eval scorecard.
  // decideAutoPass owns the never-over-a-failed/warn-gate rule (invariant #4);
  // L0 (the default) always falls through to the park below. EVERY auto-pass
  // is audited: workspace trust-audit.jsonl + a run-journal event.
  const trust = await import("../../trust.js");
  const config = trust.readTrustConfig(ctx.workspace);
  let trustNote = "";
  if (config.level !== "L0") {
    const project = await resolveTrustProject(ctx);
    const decision = trust.decideAutoPass(
      config,
      project ? trust.readProjectEval(project) : { found: false, verdict: null, score: null, failOrWarnCriteria: [] },
      project ?? "(unresolved project)",
    );
    if (decision.autoPass) {
      trust.appendTrustAudit(ctx.workspace, {
        kind: "auto-pass",
        level: config.level,
        surface: "approval-node",
        run: ctx.runId,
        node: node.id,
        project,
        verdict: decision.verdict,
        score: decision.score,
        threshold: config.level === "L1" ? config.autoPublishScore : null,
        reason: decision.reason,
      });
      const { appendRunEvent } = await import("../../run.js");
      await appendRunEvent(ctx.runId, {
        kind: "trust-auto-pass",
        node: node.id,
        level: config.level,
        project,
        verdict: decision.verdict,
        score: decision.score,
        message: `approval node "${node.id}" auto-passed at ${config.level}: ${decision.reason}`,
      });
      return {
        output: {
          approved: true,
          autoPass: true,
          trust: {
            level: config.level,
            project,
            verdict: decision.verdict,
            score: decision.score,
            reason: decision.reason,
          },
        },
      };
    }
    trustNote = ` (trust ${config.level}: ${decision.reason})`;
  }

  const reason =
    (p.reason ??
      (expired ? "the recorded run approval has expired" : "no run approval is recorded yet")) +
    trustNote;
  await writeApprovalInboxPack(ctx, node.id, reason);
  throw new RunControlSignal("park-approval", `approval node "${node.id}": ${reason}`);
};

// ─── budget-guard ────────────────────────────────────────────────────────────

type BudgetGuardParams = { max_usd?: number };

export const budgetGuardExecutor: NodeExecutor = async (node, ctx) => {
  const spentUsd = Number((ctx.runSpendUsd ?? 0).toFixed(6));
  const caps: number[] = [];
  const paramCap = (node.params as BudgetGuardParams).max_usd ?? node.budget?.max_usd;
  if (typeof paramCap === "number") caps.push(paramCap);
  if (ctx.runId) {
    const { readRunLedger, activeApproval } = await import("../../spend.js");
    const approval = activeApproval(await readRunLedger(ctx.runId));
    if (approval) caps.push(approval.budgetCapUsd);
  }
  if (caps.length === 0) {
    throw new NodeExecutionError(
      "params-invalid",
      `budget-guard node "${node.id}" has no cap — set params.max_usd, a node budget.max_usd, or record a run approval`,
    );
  }
  const capUsd = Math.min(...caps);
  if (spentUsd >= capUsd) {
    throw new RunControlSignal(
      "halt-budget",
      `budget-guard node "${node.id}": run spend $${spentUsd.toFixed(2)} >= cap $${capUsd.toFixed(2)} — raise the cap (\`ralphy run approve ${ctx.runId ?? "<run>"} --cap <usd> --reason <text>\`) to continue`,
    );
  }
  return { output: { ok: true, spentUsd, capUsd, remainingUsd: Number((capUsd - spentUsd).toFixed(6)) } };
};

// ─── gate ────────────────────────────────────────────────────────────────────

type GateParams = {
  /** Field on the verdict object to read (default "verdict"). */
  verdict_field?: string;
  /** Node id the FREE repair loop routes to on a "repair" verdict. */
  repair_to?: string;
  /** Max repair route jumps before the gate parks instead (default 2, #473). */
  max_repairs?: number;
};

export const gateExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as GateParams;
  const raw = ctx.inputs.verdict;
  const obj = typeof raw === "string" ? safeParse(raw) : raw;
  if (obj == null || typeof obj !== "object") {
    throw new NodeExecutionError(
      "input-invalid",
      `gate node "${node.id}" expects an eval-verdict object on in-port "verdict"`,
    );
  }
  const field = p.verdict_field ?? "verdict";
  const verdict = String((obj as Record<string, unknown>)[field] ?? "");
  // #427 vocab (+ the eval pass/warn/fail synonyms).
  if (verdict === "ship" || verdict === "pass" || verdict === "warn") {
    return {
      output: { decision: "ship", verdict, gated: obj },
      deactivate: p.repair_to ? [p.repair_to] : [],
    };
  }
  if (verdict === "repair" && p.repair_to) {
    throw new RunControlSignal(
      "route",
      `gate node "${node.id}": verdict "repair" — routing the free repair loop to "${p.repair_to}"`,
      p.repair_to,
    );
  }
  // repair with no route, needs-user-decision, blocked, fail, unknown → park.
  throw new RunControlSignal(
    "park-approval",
    `gate node "${node.id}": verdict "${verdict || "(missing)"}" needs a human — parking the run (#473: paid regen never auto-fires)`,
  );
};

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ─── join / switch ───────────────────────────────────────────────────────────

/**
 * Barrier: the runner guarantees all in-ports are resolved before this fires.
 * Downstream of a fan-out (#510) each branch-scoped in-port arrives as an
 * order-stable per-branch array (null where that branch skipped the producer).
 */
export const joinExecutor: NodeExecutor = async (_node, ctx) => {
  return { output: { ...ctx.inputs } };
};

type SwitchParams = {
  /** Dot-path into the resolved inputs (e.g. "item.content_mode"). */
  field?: string;
  /** Field value → downstream node id to activate. */
  routes?: Record<string, string>;
  /** Node id to activate when no route matches (else the run halts on_fail). */
  default?: string;
};

export const switchExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as SwitchParams;
  if (!p.field || !p.routes || Object.keys(p.routes).length === 0) {
    throw new NodeExecutionError(
      "params-invalid",
      `switch node "${node.id}" requires params.field and a non-empty params.routes map`,
    );
  }
  const value = String(dotGet(ctx.inputs, p.field) ?? "");
  const selected = p.routes[value] ?? p.default;
  if (!selected) {
    throw new NodeExecutionError(
      "switch-unmatched",
      `switch node "${node.id}": value "${value}" matches no route and no params.default is set`,
    );
  }
  const deactivate = [...new Set(Object.values(p.routes))].filter((t) => t !== selected);
  return { output: { value, selected }, deactivate };
};

// ─── transform / template-string / artifact-write ────────────────────────────

/** Dot-path lookup over objects/arrays ("items.0.title"). No code eval. */
export function dotGet(root: unknown, dotPath: string): unknown {
  let cur: unknown = root;
  for (const key of dotPath.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

type TransformParams = {
  /** Pick ONE value by dot-path over the resolved inputs. */
  pick?: string;
  /** Build an object: output key → dot-path over the resolved inputs. */
  map?: Record<string, string>;
};

/**
 * Pure declarative reshaping — deliberately NOT arbitrary JS (no Function/
 * eval): params.pick extracts one value, params.map builds an object of
 * extracted values. Inputs may be JSON strings (artifact refs) — they are
 * parsed first when they look like JSON.
 */
export const transformExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as TransformParams;
  if (!p.pick && !p.map) {
    throw new NodeExecutionError(
      "params-invalid",
      `transform node "${node.id}" requires params.pick (dot-path) or params.map (key -> dot-path)`,
    );
  }
  const inputs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx.inputs)) {
    inputs[k] = typeof v === "string" && /^\s*[[{]/.test(v) ? (safeParse(v) ?? v) : v;
  }
  if (p.pick) return { output: dotGet(inputs, p.pick) };
  const out: Record<string, unknown> = {};
  for (const [key, dp] of Object.entries(p.map!)) out[key] = dotGet(inputs, dp);
  return { output: out };
};

/** Prompt interpolation reusing the #499 helper (params.prompt: file ref or inline). */
export const templateStringExecutor: NodeExecutor = async (node, ctx) => {
  const text = await resolveNodePrompt(node, ctx);
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.txt`, text);
  return { output: text, artifactPath };
};

type ArtifactWriteParams = {
  /** Output filename inside the run/project artifacts dir. */
  filename?: string;
  /** Inline content — else the node's sole in-port value is written. */
  content?: string;
};

/** Persist an input into the artifact tree (append-only, .vN versioned). */
export const artifactWriteExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as ArtifactWriteParams;
  if (typeof p.filename !== "string" || p.filename.length === 0) {
    throw new NodeExecutionError(
      "params-invalid",
      `artifact-write node "${node.id}" requires params.filename`,
    );
  }
  let value: unknown = p.content;
  if (value === undefined) {
    const vals = Object.values(ctx.inputs);
    if (vals.length !== 1) {
      throw new NodeExecutionError(
        "input-invalid",
        `artifact-write node "${node.id}" needs exactly one in-port (or params.content) — got ${vals.length}`,
      );
    }
    value = vals[0];
  }
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const artifactPath = await writeNodeArtifact(ctx, p.filename, body);
  return { output: artifactPath, artifactPath };
};
