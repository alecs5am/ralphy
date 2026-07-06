// Farm scheduler + headless graph runner (#503) — the piece that turns the
// playground into a farm: wakes on cron ticks, executes a workspace's node
// graphs as #480 Runs, parks durably on approval, and resumes after a crash.
//
// ── Tick → Run compilation: in-process, NOT jobs.db ─────────────────────────
// The #481 queue substrate executes ARGV-shaped CLI invocations through a
// detached worker (`.ralphy/jobs.db` rows carry `command.argv`); graph nodes
// are in-process functions (`NodeExecutor`) whose OUTPUTS feed downstream
// in-ports in memory. Compiling nodes into queue jobs would mean serializing
// every port payload into argv and building a second execution engine inside
// the worker — so one tick = one Run executed DIRECTLY in this process, in
// topological order, with per-node completion (+ outputs + artifact refs)
// persisted to the run journal. Durability comes from the journal, not from
// jobs.db; jobs.db remains the substrate for `ralphy generate --queue` (and a
// future `ralphy-generate` verb node can enqueue through it). The scheduler
// itself is a plain long-lived bun process (`ralphy farm start`, D-06):
// explicit user intent, foregrounded, the user backgrounds/dockerizes it.
//
// ── Durability model ─────────────────────────────────────────────────────────
// Per run (runs/<run-id>/):
//   • run.json           — the #480 manifest (createRun; status stays in the
//                          #480 vocab: active while executing, complete when
//                          the graph finishes).
//   • run-events.jsonl   — APPEND-ONLY journal (appendRunEvent): node-started /
//                          node-completed (output + artifactPath + costUsd) /
//                          node-skipped / node-failed / run-parked /
//                          run-halted / run-completed. Line-atomic appends →
//                          kill -9 mid-run is safe.
//   • farm-state.json    — the farm's execution status index (running |
//                          parked-approval | halted-budget | halted-failure |
//                          complete). Engine STATE (like cursor.json, #500) —
//                          rewriting it does not touch invariant #14. Resume
//                          REBUILDS node state from the journal; the state
//                          file only says which runs to look at.
//
// Resume: `farm start` (and every tick) scans farm-state files; a `running`
// run (crash) re-executes from the first incomplete node — completed nodes
// are NOT re-executed (their outputs come from the journal); a
// `parked-approval` run re-executes its parked node, which passes once the
// approval is recorded (#482 = the run spend ledger via `ralphy run approve`).
//
// Control flow: RunControlSignal (control-flow.ts) parks/halts/routes;
// NodeExecutionError (and any other throw) takes the node's on_fail envelope
// route (halt | skip | route:<id>). A node type with no registered executor
// is a STRUCTURED SKIP (reason "no-executor") — on_fail does NOT fire; the
// graph still runs its executable subset. `fan-out` is skipped with reason
// "fan-out-not-supported" (v1 — see control-flow.ts header).

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  workspaceDir,
  runsDir,
  runDir,
  currentWorkspace,
  ralphDir,
} from "../paths.js";
import { createRun, appendRunEvent, loadRun } from "../run.js";
import { listWorkflowNames, workflowPath } from "../workflow.js";
import {
  parseWorkflowDocument,
  type WorkflowGraph,
  type WorkflowNode,
} from "../schemas/workflow.js";
import { isArtifactRef } from "../workflow-graph.js";
import { getExecutor } from "../workflow/executors/index.js";
import { RunControlSignal } from "../workflow/executors/control-flow.js";
import type { ExecutorContext, NodeExecutor } from "../workflow/executors/types.js";
import type { WorkflowNodeType } from "../schemas/workflow.js";
import { parseCron, nextFire, cronMatches, type CronSpec } from "./cron.js";

// ─── Deps (clock / sleep / stop seams — zero real sleeps in tests) ───────────

export interface FarmDeps {
  now?: () => Date;
  /** Chunked by the loop so SIGTERM wakes it; tests inject a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** Graceful-stop / crash-simulation seam: checked between nodes. */
  shouldStop?: () => boolean;
  /** Test seam: per-type executor overrides (mocked paid nodes, injected failures). */
  executorOverrides?: Partial<Record<WorkflowNodeType, NodeExecutor>>;
  /** Extra ExecutorContext fields (modelFactory / fetchImpl passthrough). */
  ctx?: Partial<ExecutorContext>;
  /** Event sink for the CLI's live log line (in addition to the journal). */
  onEvent?: (runId: string, kind: string, message: string) => void;
}

function resolveDeps(deps: FarmDeps = {}) {
  return {
    now: deps.now ?? (() => new Date()),
    sleep: deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    shouldStop: deps.shouldStop ?? (() => false),
    executorOverrides: deps.executorOverrides ?? {},
    ctx: deps.ctx ?? {},
    onEvent: deps.onEvent ?? (() => {}),
  };
}

// ─── Farm state file ─────────────────────────────────────────────────────────

export type FarmRunStatus =
  | "running"
  | "parked-approval"
  | "halted-budget"
  | "halted-failure"
  | "complete";

export interface FarmState {
  workflow: string;
  status: FarmRunStatus;
  updatedAt: string;
  detail?: string;
}

export const FARM_STATE_ARTIFACT = "farm-state.json" as const;

function farmStatePath(ws: string, runId: string): string {
  return path.join(runDir(ws, runId), FARM_STATE_ARTIFACT);
}

function writeFarmState(ws: string, runId: string, state: FarmState): void {
  fs.mkdirSync(runDir(ws, runId), { recursive: true });
  fs.writeFileSync(farmStatePath(ws, runId), JSON.stringify(state, null, 2) + "\n");
}

export function readFarmState(ws: string, runId: string): FarmState | null {
  try {
    return JSON.parse(fs.readFileSync(farmStatePath(ws, runId), "utf8")) as FarmState;
  } catch {
    return null;
  }
}

// ─── Journal read side (resume) ──────────────────────────────────────────────

interface NodeRecord {
  state: "completed" | "skipped";
  output?: unknown;
  artifactPath?: string;
  reason?: string;
}

interface JournalState {
  nodes: Map<string, NodeRecord>;
  /** Realized spend accumulated across node-completed/-failed events. */
  spendUsd: number;
}

function readJournal(ws: string, runId: string): JournalState {
  const nodes = new Map<string, NodeRecord>();
  let spendUsd = 0;
  let lines: string[] = [];
  try {
    lines = fs
      .readFileSync(path.join(runDir(ws, runId), "run-events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return { nodes, spendUsd };
  }
  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // a torn final line from a kill -9 — ignore, the node re-runs
    }
    const node = typeof e.node === "string" ? e.node : null;
    if (typeof e.costUsd === "number") spendUsd += e.costUsd;
    if (!node) continue;
    if (e.kind === "node-completed") {
      nodes.set(node, {
        state: "completed",
        output: e.output,
        artifactPath: typeof e.artifactPath === "string" ? e.artifactPath : undefined,
      });
    } else if (e.kind === "node-skipped") {
      nodes.set(node, { state: "skipped", reason: typeof e.reason === "string" ? e.reason : undefined });
    } else if (e.kind === "node-started" || e.kind === "node-failed") {
      // A started-but-not-completed node re-executes on resume.
      if (nodes.get(node)?.state !== "completed") nodes.delete(node);
    }
  }
  return { nodes, spendUsd: Number(spendUsd.toFixed(6)) };
}

// ─── Graph helpers ───────────────────────────────────────────────────────────

const EDGE_RE = /^([a-z0-9][a-z0-9-]*)\.([A-Za-z0-9][A-Za-z0-9_-]*)$/;

/** producer node id of an in-port ref, or null for artifact refs. */
function producerOf(ref: string): string | null {
  if (isArtifactRef(ref)) return null;
  const m = EDGE_RE.exec(ref);
  return m ? m[1]! : null;
}

/**
 * Deterministic topological order over the data edges (Kahn; ties broken by
 * the graph's node-array order). validateWorkflowGraph already guarantees a
 * DAG at import — a cycle here throws defensively.
 */
export function topoOrder(graph: WorkflowGraph): WorkflowNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const indeg = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const ref of Object.values(node.in)) {
      const p = producerOf(ref);
      if (!p || !byId.has(p) || p === node.id) continue;
      indeg.set(node.id, (indeg.get(node.id) ?? 0) + 1);
      out.set(p, [...(out.get(p) ?? []), node.id]);
    }
  }
  const order: WorkflowNode[] = [];
  const ready = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const c of out.get(id) ?? []) {
      const d = (indeg.get(c) ?? 0) - 1;
      indeg.set(c, d);
      if (d === 0) ready.push(c);
    }
    // Keep node-array order among newly-ready nodes (stable, test-friendly).
    ready.sort((a, b) => graph.nodes.findIndex((n) => n.id === a) - graph.nodes.findIndex((n) => n.id === b));
  }
  if (order.length !== graph.nodes.length) {
    throw new Error("workflow graph has a cycle — run `ralphy workflow lint` before farming it");
  }
  return order;
}

/** Load the workspace's GRAPH workflows (linear #478 workflows are not farm-driven). */
export function loadGraphWorkflows(ws: string): Array<{ name: string; graph: WorkflowGraph }> {
  const out: Array<{ name: string; graph: WorkflowGraph }> = [];
  for (const name of listWorkflowNames(ws)) {
    try {
      const raw = JSON.parse(fs.readFileSync(workflowPath(ws, name), "utf8"));
      const doc = parseWorkflowDocument(raw);
      if (doc.kind === "graph") out.push({ name, graph: doc.graph });
    } catch {
      /* malformed workflow file — `ralphy workflow lint` is the diagnosis path */
    }
  }
  return out;
}

/** The cron triggers of a graph: every schedule node with a params.cron string. */
export function scheduleTriggers(graph: WorkflowGraph): Array<{ node: string; spec: CronSpec }> {
  const out: Array<{ node: string; spec: CronSpec }> = [];
  for (const n of graph.nodes) {
    if (n.type !== "schedule") continue;
    const cron = n.params?.cron;
    if (typeof cron !== "string" || cron.length === 0) continue;
    try {
      out.push({ node: n.id, spec: parseCron(cron) });
    } catch {
      /* malformed cron — surfaced by `ralphy workflow lint`, never crashes the farm */
    }
  }
  return out;
}

// ─── Run execution ───────────────────────────────────────────────────────────

/** Node types the runner handles itself instead of getExecutor(). */
const NOT_YET_SUPPORTED: Partial<Record<string, string>> = {
  "fan-out":
    "fan-out-not-supported: v1 does not execute a subgraph per item (follow-up in notes/issues/done/503-farm-scheduler-runner.md)",
};

/** Safety valve on route jumps (on_fail route + gate repair loops). */
const MAX_ROUTE_JUMPS = 16;

export interface RunOutcome {
  runId: string;
  status: FarmRunStatus;
  detail?: string;
}

async function resolveInputs(
  node: WorkflowNode,
  records: Map<string, NodeRecord>,
  ws: string,
): Promise<{ inputs: Record<string, unknown> } | { skippedBecause: string }> {
  const inputs: Record<string, unknown> = {};
  for (const [port, ref] of Object.entries(node.in)) {
    const producer = producerOf(ref);
    if (producer) {
      const rec = records.get(producer);
      if (!rec || rec.state === "skipped") {
        return { skippedBecause: `upstream-skipped: producer "${producer}" did not run` };
      }
      inputs[port] = rec.output;
      continue;
    }
    // Artifact ref: read the file (workspace-relative or absolute) as text;
    // a missing file passes the raw ref through (the executor validates).
    const rel = ref.startsWith("artifact:") ? ref.slice("artifact:".length) : ref;
    let value: unknown = rel;
    for (const candidate of [rel, path.join(workspaceDir(ws), rel)]) {
      try {
        value = await fsp.readFile(candidate, "utf8");
        break;
      } catch {
        /* try next candidate */
      }
    }
    inputs[port] = value;
  }
  return { inputs };
}

/**
 * Execute (or RESUME) one graph run. State is rebuilt from the journal on
 * entry, so calling this on a crashed or parked run continues instead of
 * re-executing completed nodes.
 */
export async function executeGraphRun(
  ws: string,
  runId: string,
  workflowName: string,
  graph: WorkflowGraph,
  deps: FarmDeps = {},
): Promise<RunOutcome> {
  const d = resolveDeps(deps);
  const order = topoOrder(graph);
  const journal = readJournal(ws, runId);
  const records = journal.nodes;
  let spendUsd = journal.spendUsd;
  let routeJumps = 0;
  const runDirAbs = runDir(ws, runId);
  const artifactsDir = path.join(runDirAbs, "artifacts");
  fs.mkdirSync(workspaceDir(ws), { recursive: true });

  const emit = async (kind: string, event: Record<string, unknown> & { message: string }) => {
    await appendRunEvent(runId, { kind, ...event });
    d.onEvent(runId, kind, event.message);
  };

  const finish = async (status: FarmRunStatus, detail?: string): Promise<RunOutcome> => {
    writeFarmState(ws, runId, { workflow: workflowName, status, updatedAt: d.now().toISOString(), detail });
    if (status === "complete") {
      await emit("run-completed", { message: `run complete (${records.size}/${order.length} nodes recorded)` });
      // run.json status is #480 metadata — flip active → complete.
      const manifest = await loadRun(runId);
      if (manifest && manifest.status === "active") {
        manifest.status = "complete";
        await fsp.writeFile(path.join(runDirAbs, "run.json"), JSON.stringify(manifest, null, 2) + "\n");
      }
    }
    return { runId, status, detail };
  };

  writeFarmState(ws, runId, { workflow: workflowName, status: "running", updatedAt: d.now().toISOString() });

  const skipNode = async (node: WorkflowNode, reason: string) => {
    records.set(node.id, { state: "skipped", reason });
    await emit("node-skipped", { node: node.id, reason, message: `node "${node.id}" skipped: ${reason}` });
  };

  let i = 0;
  while (i < order.length) {
    if (d.shouldStop()) {
      return { runId, status: "running", detail: "stopped between nodes (farm-state stays running; resume continues)" };
    }
    const node = order[i]!;
    i++;
    if (records.get(node.id)?.state === "completed") continue;
    if (records.get(node.id)?.state === "skipped") continue;

    // Trigger built-in: a schedule node "completes" with the tick timestamp.
    if (node.type === "schedule") {
      records.set(node.id, { state: "completed", output: { firedAt: d.now().toISOString() } });
      await emit("node-completed", { node: node.id, output: records.get(node.id)!.output, message: `schedule "${node.id}" fired` });
      continue;
    }

    const unsupported = NOT_YET_SUPPORTED[node.type];
    if (unsupported) {
      await skipNode(node, unsupported);
      continue;
    }
    const executor = d.executorOverrides[node.type] ?? getExecutor(node.type);
    if (!executor) {
      await skipNode(node, `no-executor: node type "${node.type}" has no registered executor yet`);
      continue;
    }

    const resolved = await resolveInputs(node, records, ws);
    if ("skippedBecause" in resolved) {
      await skipNode(node, resolved.skippedBecause);
      continue;
    }

    // Run-wide budget pre-check (#481 opt-in floor: only when a run ledger
    // with an active approval exists — mirrors checkSpend's pass-through).
    if (node.type !== "budget-guard") {
      const { readRunLedger, activeApproval } = await import("../spend.js");
      const approval = activeApproval(await readRunLedger(runId));
      if (approval && spendUsd >= approval.budgetCapUsd) {
        const detail = `run spend $${spendUsd.toFixed(2)} >= approved cap $${approval.budgetCapUsd.toFixed(2)} before node "${node.id}"`;
        await emit("run-halted", { node: node.id, status: "halted-budget", reason: detail, message: detail });
        return finish("halted-budget", detail);
      }
    }

    let nodeCost = 0;
    const ctx: ExecutorContext = {
      workspace: ws,
      workspaceDir: workspaceDir(ws),
      artifactsDir,
      inputs: resolved.inputs,
      runId,
      runDir: runDirAbs,
      runSpendUsd: spendUsd,
      log: async (entry) => {
        await fsp.mkdir(runDirAbs, { recursive: true });
        await fsp.appendFile(
          path.join(runDirAbs, "generations.jsonl"),
          JSON.stringify({ ts: d.now().toISOString(), node: node.id, ...entry }) + "\n",
        );
      },
      reportCost: (usd) => {
        nodeCost += usd;
      },
      ...d.ctx,
    };

    await emit("node-started", { node: node.id, message: `node "${node.id}" (${node.type}) started` });

    let attempt = 0;
    let outcome: "completed" | "failed" | "signal" = "failed";
    let signal: RunControlSignal | null = null;
    let lastError = "";
    let result: Awaited<ReturnType<NodeExecutor>> | null = null;
    while (attempt <= node.retry.max) {
      attempt++;
      try {
        result = await executor(node, ctx);
        outcome = "completed";
        break;
      } catch (e) {
        if (e instanceof RunControlSignal) {
          signal = e;
          outcome = "signal";
          break;
        }
        lastError = (e as Error).message;
        await emit("node-failed", {
          node: node.id,
          attempt,
          error: lastError,
          costUsd: nodeCost,
          message: `node "${node.id}" attempt ${attempt} failed: ${lastError}`,
        });
        // A failed attempt's realized spend still counts toward the run total.
        spendUsd = Number((spendUsd + nodeCost).toFixed(6));
        nodeCost = 0;
      }
    }

    if (outcome === "signal" && signal) {
      spendUsd = Number((spendUsd + nodeCost).toFixed(6));
      if (signal.kind === "park-approval") {
        await emit("run-parked", { node: node.id, status: "parked-approval", reason: signal.message, message: signal.message });
        return finish("parked-approval", signal.message);
      }
      if (signal.kind === "halt-budget") {
        await emit("run-halted", { node: node.id, status: "halted-budget", reason: signal.message, message: signal.message });
        return finish("halted-budget", signal.message);
      }
      // route: jump to the target node (gate repair loop). Bounded.
      routeJumps++;
      if (routeJumps > MAX_ROUTE_JUMPS) {
        const detail = `route-jump budget exceeded (${MAX_ROUTE_JUMPS}) at node "${node.id}" — likely a repair loop that never converges`;
        await emit("run-halted", { node: node.id, status: "halted-failure", reason: detail, message: detail });
        return finish("halted-failure", detail);
      }
      const target = order.findIndex((n) => n.id === signal!.target);
      if (target === -1) {
        const detail = `route target "${signal.target}" is not in the graph`;
        await emit("run-halted", { node: node.id, status: "halted-failure", reason: detail, message: detail });
        return finish("halted-failure", detail);
      }
      await emit("node-routed", { node: node.id, target: signal.target, message: signal.message });
      // A backward jump re-executes the target chain: clear completion records
      // downstream of (and including) the target so the loop actually re-runs.
      // The JOURNAL keeps every prior event — this only resets the in-memory cursor.
      for (let k = target; k < i - 1; k++) {
        const rec = order[k]!;
        if (records.get(rec.id)?.state === "completed" && rec.type !== "schedule") records.delete(rec.id);
      }
      i = target;
      continue;
    }

    if (outcome === "completed" && result) {
      spendUsd = Number((spendUsd + nodeCost).toFixed(6));
      records.set(node.id, { state: "completed", output: result.output, artifactPath: result.artifactPath });
      await emit("node-completed", {
        node: node.id,
        output: result.output,
        artifactPath: result.artifactPath,
        costUsd: nodeCost,
        message: `node "${node.id}" completed`,
      });
      for (const target of result.deactivate ?? []) {
        if (!records.has(target)) {
          const t = graph.nodes.find((n) => n.id === target);
          if (t) await skipNode(t, `deactivated by "${node.id}"`);
        }
      }
      continue;
    }

    // Failure after retries → on_fail envelope routing.
    if (node.on_fail === "skip") {
      await skipNode(node, `on-fail-skip: ${lastError}`);
      continue;
    }
    if (node.on_fail.startsWith("route:")) {
      routeJumps++;
      if (routeJumps > MAX_ROUTE_JUMPS) {
        const detail = `route-jump budget exceeded (${MAX_ROUTE_JUMPS}) at node "${node.id}"`;
        await emit("run-halted", { node: node.id, status: "halted-failure", reason: detail, message: detail });
        return finish("halted-failure", detail);
      }
      const targetId = node.on_fail.slice("route:".length);
      const target = order.findIndex((n) => n.id === targetId);
      if (target === -1) {
        const detail = `on_fail route target "${targetId}" is not in the graph`;
        await emit("run-halted", { node: node.id, status: "halted-failure", reason: detail, message: detail });
        return finish("halted-failure", detail);
      }
      records.set(node.id, { state: "skipped", reason: `on-fail-route: ${lastError}` });
      await emit("node-skipped", { node: node.id, reason: `on-fail-route to "${targetId}"`, message: `node "${node.id}" failed — routing to "${targetId}"` });
      // Forward jump: mark the intermediates skipped (they are being bypassed).
      for (let k = i; k < target; k++) {
        const mid = order[k]!;
        if (!records.has(mid.id)) await skipNode(mid, `route-jump: bypassed by "${node.id}" on_fail`);
      }
      i = target;
      continue;
    }
    // halt (default).
    const detail = `node "${node.id}" failed after ${attempt} attempt(s): ${lastError}`;
    await emit("run-halted", { node: node.id, status: "halted-failure", reason: detail, message: detail });
    return finish("halted-failure", detail);
  }

  return finish("complete");
}

// ─── Tick → Run compilation ──────────────────────────────────────────────────

function tickRunId(workflowName: string, now: Date): string {
  const ts = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  return `farm-${workflowName}-${ts}`;
}

/**
 * One tick for one graph workflow = one Run. Creates run.json (#480 schema),
 * journals the tick, executes the graph. Same-instant collisions get a
 * numeric suffix (createRun refuses to clobber).
 */
export async function fireTick(
  ws: string,
  workflowName: string,
  graph: WorkflowGraph,
  deps: FarmDeps = {},
  trigger: { node?: string; cron?: string } = {},
): Promise<RunOutcome> {
  const d = resolveDeps(deps);
  const now = d.now();
  let runId = tickRunId(workflowName, now);
  for (let n = 2; ; n++) {
    try {
      await createRun({
        id: runId,
        workspace: ws,
        title: `farm tick: ${workflowName}`,
        workflow: workflowName,
        createdAt: now.toISOString(),
      });
      break;
    } catch (e) {
      if ((e as { code?: string }).code === "E_ALREADY_EXISTS" && n <= 9) {
        runId = `${tickRunId(workflowName, now)}-${n}`;
        continue;
      }
      throw e;
    }
  }
  await appendRunEvent(runId, {
    kind: "farm-tick",
    workflow: workflowName,
    trigger: trigger.node ?? null,
    cron: trigger.cron ?? null,
    firedAt: now.toISOString(),
    message: `tick fired for workflow "${workflowName}"`,
  });
  d.onEvent(runId, "farm-tick", `tick fired for workflow "${workflowName}"`);
  return executeGraphRun(ws, runId, workflowName, graph, deps);
}

/** Farm-state files across a workspace's runs (id-sorted). */
export function listFarmRuns(ws: string): Array<{ runId: string; state: FarmState }> {
  let ids: string[] = [];
  try {
    ids = fs
      .readdirSync(runsDir(ws), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const out: Array<{ runId: string; state: FarmState }> = [];
  for (const runId of ids) {
    const state = readFarmState(ws, runId);
    if (state) out.push({ runId, state });
  }
  return out;
}

/**
 * Resume every incomplete farm run in the workspace: `running` (crashed
 * mid-run) always; `parked-approval` re-checks its parked node (it passes
 * once the approval is recorded, else it re-parks without duplicating the
 * park side effects on state). Halted runs are terminal.
 */
export async function resumeIncompleteRuns(ws: string, deps: FarmDeps = {}): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  for (const { runId, state } of listFarmRuns(ws)) {
    if (state.status !== "running" && state.status !== "parked-approval") continue;
    const graphs = loadGraphWorkflows(ws);
    const wf = graphs.find((g) => g.name === state.workflow);
    if (!wf) continue; // workflow file gone — leave the run as-is
    outcomes.push(await executeGraphRun(ws, runId, wf.name, wf.graph, deps));
  }
  return outcomes;
}

// ─── The scheduler loop (`ralphy farm start`) ────────────────────────────────

export interface FarmLoopOptions {
  workspace?: string;
  /** Exit after the first tick completes (test / CI mode). */
  once?: boolean;
  /** Fire every scheduled graph immediately once at startup (debug). */
  tickNow?: boolean;
}

/** Idle re-scan interval when the workspace has no cron triggers yet. */
const IDLE_RESCAN_MS = 60_000;
/** Sleep chunk so a stop signal wakes the loop promptly. */
const SLEEP_CHUNK_MS = 1_000;

/**
 * The long-lived scheduler: resume incomplete runs, then sleep until the next
 * cron fire across every schedule trigger in the workspace's graph workflows,
 * tick, repeat. Workflow files are re-read every wake, so edits land without
 * a restart. Foreground by design (AGENTS.md #5: explicit user intent).
 */
export async function farmLoop(opts: FarmLoopOptions = {}, deps: FarmDeps = {}): Promise<void> {
  const d = resolveDeps(deps);
  const ws = opts.workspace ?? currentWorkspace();

  await resumeIncompleteRuns(ws, deps);

  if (opts.tickNow) {
    for (const { name, graph } of loadGraphWorkflows(ws)) {
      const triggers = scheduleTriggers(graph);
      if (triggers.length === 0) continue;
      if (d.shouldStop()) return;
      await fireTick(ws, name, graph, deps, {
        node: triggers[0]!.node,
        cron: `${triggers[0]!.spec.expr} (--tick-now)`,
      });
    }
    if (opts.once) return;
  }

  while (!d.shouldStop()) {
    const graphs = loadGraphWorkflows(ws);
    const triggers: Array<{ name: string; graph: WorkflowGraph; node: string; spec: CronSpec; at: Date }> = [];
    const from = d.now();
    for (const { name, graph } of graphs) {
      for (const t of scheduleTriggers(graph)) {
        const at = nextFire(t.spec, from);
        if (at) triggers.push({ name, graph, node: t.node, spec: t.spec, at });
      }
    }
    if (triggers.length === 0) {
      if (opts.once) return;
      await chunkedSleep(IDLE_RESCAN_MS, d);
      continue;
    }
    const nextAt = new Date(Math.min(...triggers.map((t) => t.at.getTime())));
    await chunkedSleep(nextAt.getTime() - d.now().getTime(), d);
    if (d.shouldStop()) return;

    const nowAtWake = d.now();
    const due = triggers.filter((t) => cronMatches(t.spec, nowAtWake) || t.at.getTime() <= nowAtWake.getTime());
    const firedWorkflows = new Set<string>();
    for (const t of due) {
      if (firedWorkflows.has(t.name)) continue; // one Run per workflow per tick
      firedWorkflows.add(t.name);
      await fireTick(ws, t.name, t.graph, deps, { node: t.node, cron: t.spec.expr });
    }
    await resumeIncompleteRuns(ws, deps); // parked runs re-check every tick
    if (opts.once && firedWorkflows.size > 0) return;
  }
}

async function chunkedSleep(ms: number, d: ReturnType<typeof resolveDeps>): Promise<void> {
  let remaining = ms;
  while (remaining > 0 && !d.shouldStop()) {
    const chunk = Math.min(remaining, SLEEP_CHUNK_MS);
    await d.sleep(chunk);
    remaining -= chunk;
  }
}

// ─── Pidfile (`farm start` refusal / `farm stop`) ────────────────────────────

export function farmPidPath(ws: string): string {
  return path.join(ralphDir(), "farm", `${ws}.pid`);
}

export function readFarmPid(ws: string): number | null {
  try {
    const n = Number(fs.readFileSync(farmPidPath(ws), "utf8").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function isFarmAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function writeFarmPid(ws: string, pid: number): void {
  fs.mkdirSync(path.dirname(farmPidPath(ws)), { recursive: true });
  fs.writeFileSync(farmPidPath(ws), String(pid) + "\n");
}

export function clearFarmPid(ws: string): void {
  try {
    fs.unlinkSync(farmPidPath(ws));
  } catch {
    /* already gone */
  }
}

// ─── Status roll-up (`farm status`) ──────────────────────────────────────────

export interface FarmStatusReport {
  workspace: string;
  daemon: { running: boolean; pid: number | null; pidFile: string };
  counts: Record<FarmRunStatus, number>;
  runs: Array<{
    id: string;
    workflow: string;
    status: FarmRunStatus;
    completedNodes: number;
    skippedNodes: number;
    totalNodes: number | null;
    spendUsd: number;
    updatedAt: string;
    detail: string | null;
  }>;
}

export function farmStatus(ws: string): FarmStatusReport {
  const pid = readFarmPid(ws);
  const running = isFarmAlive(pid);
  if (pid && !running) clearFarmPid(ws); // stale pidfile hygiene (mirrors daemonStatus)
  const graphs = loadGraphWorkflows(ws);
  const counts: Record<FarmRunStatus, number> = {
    running: 0,
    "parked-approval": 0,
    "halted-budget": 0,
    "halted-failure": 0,
    complete: 0,
  };
  const runs: FarmStatusReport["runs"] = [];
  for (const { runId, state } of listFarmRuns(ws)) {
    counts[state.status]++;
    const journal = readJournal(ws, runId);
    let completedNodes = 0;
    let skippedNodes = 0;
    for (const rec of journal.nodes.values()) {
      if (rec.state === "completed") completedNodes++;
      else skippedNodes++;
    }
    const wf = graphs.find((g) => g.name === state.workflow);
    runs.push({
      id: runId,
      workflow: state.workflow,
      status: state.status,
      completedNodes,
      skippedNodes,
      totalNodes: wf ? wf.graph.nodes.length : null,
      spendUsd: journal.spendUsd,
      updatedAt: state.updatedAt,
      detail: state.detail ?? null,
    });
  }
  return {
    workspace: ws,
    daemon: { running, pid: running ? pid : null, pidFile: farmPidPath(ws) },
    counts,
    runs,
  };
}
