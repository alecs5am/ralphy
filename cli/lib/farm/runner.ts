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
//                          node-cached (#513: hash + reused output/artifact +
//                          costSavedUsd — counts as a completion on resume) /
//                          node-skipped / node-failed / node-quarantined
//                          (#519: retries exhausted or permanent-class — the
//                          #518 notification hook) / node-invalidated (#519
//                          targeted retry: drops the node's records on the
//                          next journal fold) / run-parked / run-halted /
//                          run-completed. Line-atomic appends → kill -9
//                          mid-run is safe.
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
// graph still runs its executable subset.
//
// ── Fan-out (#510) ───────────────────────────────────────────────────────────
// A `fan-out` node maps its downstream subgraph (every node reachable from it
// over the data edges, stopping at — and excluding — `join` nodes) once per
// input item. Branch identity is the ITEM INDEX (deterministic, never
// clock-derived): journal events for branch-scoped nodes carry a
// `branch: <index>` field and the resume index keys them
// `<node-id>@<branch-index>`, so a crash mid-branch re-executes only that
// branch's incomplete nodes. `params.concurrency` caps simultaneous branches
// (default: all items at once). on_fail is branch-isolated: a failing node
// routes/skips/halts ITS branch while sibling branches finish; halted
// branches then surface as a failure OF THE FAN-OUT NODE, routed through the
// fan-out's own retry + on_fail envelope. A `join` node executes ONCE,
// top-level — its in-ports from branch-scoped producers resolve to
// order-stable arrays indexed by branch (null where that branch skipped the
// producer). CONSTRAINT: nested fan-out (a fan-out inside another fan-out's
// subgraph) and overlapping fan-out subgraphs are unsupported — the run halts
// with a structured "nested-fan-out-not-supported" / "overlapping-fan-out"
// detail.
//
// ── Reusable named subgraphs (#517) ──────────────────────────────────────────
// `subgraph` nodes NEVER reach this runner: loadGraphWorkflows expands them
// (cli/lib/subgraph.ts) into namespaced `<instance>:<inner>` nodes at load
// time. Expansion is deterministic, so journal records carry the namespaced
// ids and resume/fan-out compose for free — a fan-out over a subgraph
// instance journals `<instance>:<inner>@<branch>`. The nested-fan-out
// constraint above applies to the EXPANDED graph (a subgraph carrying a
// fan-out, instantiated downstream of another fan-out, still halts).

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  workspaceDir,
  runsDir,
  runDir,
  currentWorkspace,
  ralphDir,
  subgraphsDir,
} from "../paths.js";
import { expandGraphSubgraphs, dirSubgraphResolver } from "../subgraph.js";
import { createRun, appendRunEvent, loadRun } from "../run.js";
import { listWorkflowNames, workflowPath } from "../workflow.js";
import {
  parseWorkflowDocument,
  type WorkflowGraph,
  type WorkflowNode,
} from "../schemas/workflow.js";
import { isArtifactRef } from "../workflow-graph.js";
import { getExecutor } from "../workflow/executors/index.js";
import { RunControlSignal, dotGet } from "../workflow/executors/control-flow.js";
import type { ExecutorContext, NodeExecutor } from "../workflow/executors/types.js";
import type { WorkflowNodeType } from "../schemas/workflow.js";
import { parseCron, nextFire, cronMatches, type CronSpec } from "./cron.js";
import { computeNodeCacheHash, lookupNodeCache, appendNodeCacheEntry } from "./node-cache.js";
import { classifyError, classifyFilterError } from "../errors/taxonomy.js";
import { appendQuarantine, appendResolution } from "./dead-letter.js";
import { notifyFarmEvent, approvalDeepLink, type FarmNotification } from "./notify.js";
import { readNotificationsConfig } from "../notifications.js";
import type { NotifyEvent } from "../schemas/notifications.js";

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
  /**
   * #518 notification hook: fired (failure-safe, awaited) on the runner's
   * needs-a-human journal events (run-parked / budget-halt / run-failed /
   * node-quarantined). Isolated from the journal — a throwing notifier must
   * never fail the run. Tests inject a mock; production wires notifyFarmEvent.
   */
  notify?: (n: FarmNotification) => Promise<void>;
  /** Run option rider (#513): force execution, ignoring the content-hash cache. */
  noCache?: boolean;
}

function resolveDeps(deps: FarmDeps = {}) {
  return {
    now: deps.now ?? (() => new Date()),
    sleep: deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    shouldStop: deps.shouldStop ?? (() => false),
    executorOverrides: deps.executorOverrides ?? {},
    ctx: deps.ctx ?? {},
    onEvent: deps.onEvent ?? (() => {}),
    // #518: default notifier reads the workspace's `notifications` config and
    // dispatches (quiet when unconfigured). notifyFarmEvent is itself
    // failure-safe, but we double-guard so no notify path can ever throw into
    // the run. Tests override with a mock.
    notify:
      deps.notify ??
      (async (n: FarmNotification) => {
        try {
          await notifyFarmEvent(n);
        } catch {
          /* invariant: a notification never fails the run */
        }
      }),
    noCache: deps.noCache ?? false,
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
  /** #513 content-hash cache hits (node-cached events). */
  cacheHits: number;
  /** Aggregate estimated cost the cache hits saved. */
  cacheSavedUsd: number;
}

function readJournal(ws: string, runId: string): JournalState {
  const nodes = new Map<string, NodeRecord>();
  let spendUsd = 0;
  let cacheHits = 0;
  let cacheSavedUsd = 0;
  let lines: string[] = [];
  try {
    lines = fs
      .readFileSync(path.join(runDir(ws, runId), "run-events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return { nodes, spendUsd, cacheHits, cacheSavedUsd };
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
    // Branch-scoped events (#510) key `<node-id>@<branch-index>` so resume
    // honors completed branch nodes without conflating sibling branches.
    const branch = typeof e.branch === "number" ? e.branch : null;
    const key = branch == null ? node : `${node}@${branch}`;
    if (e.kind === "node-completed" || e.kind === "node-cached") {
      // A cache hit IS a completion on resume: the reused output/artifact
      // stands in for the execution (#513) and the node never re-runs.
      nodes.set(key, {
        state: "completed",
        output: e.output,
        artifactPath: typeof e.artifactPath === "string" ? e.artifactPath : undefined,
      });
      if (e.kind === "node-cached") {
        cacheHits++;
        if (typeof e.costSavedUsd === "number") cacheSavedUsd += e.costSavedUsd;
      }
    } else if (e.kind === "node-skipped") {
      nodes.set(key, { state: "skipped", reason: typeof e.reason === "string" ? e.reason : undefined });
    } else if (e.kind === "node-started" || e.kind === "node-failed") {
      // A started-but-not-completed node re-executes on resume.
      if (nodes.get(key)?.state !== "completed") nodes.delete(key);
    } else if (e.kind === "node-invalidated") {
      // #519 targeted retry: drop EVERY record for this node (all branches)
      // so the resume walk re-executes it against the journaled inputs.
      for (const k of [...nodes.keys()]) {
        if (k === node || k.startsWith(`${node}@`)) nodes.delete(k);
      }
    }
  }
  return {
    nodes,
    spendUsd: Number(spendUsd.toFixed(6)),
    cacheHits,
    cacheSavedUsd: Number(cacheSavedUsd.toFixed(6)),
  };
}

// ─── Graph helpers ───────────────────────────────────────────────────────────

// The optional `:<inner-id>` segment is the #517 subgraph namespace — the
// runner executes EXPANDED graphs, so `<instance>:<inner>.<out>` edges (and
// the matching `<instance>:<inner>@<branch>` journal keys) are first-class.
const EDGE_RE = /^([a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?)\.([A-Za-z0-9][A-Za-z0-9_-]*)$/;

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

/**
 * Load the workspace's GRAPH workflows (linear #478 workflows are not
 * farm-driven), with #517 subgraph instances EXPANDED — the runner never sees
 * a `subgraph` node. Expansion is deterministic, so a resume that re-loads
 * the workflow rebuilds the exact same namespaced ids the journal recorded.
 * A workflow whose expansion errors (missing/broken subgraph) is skipped —
 * `ralphy workflow lint` is the diagnosis path.
 */
export function loadGraphWorkflows(ws: string): Array<{ name: string; graph: WorkflowGraph }> {
  const out: Array<{ name: string; graph: WorkflowGraph }> = [];
  const resolve = dirSubgraphResolver(subgraphsDir(ws));
  for (const name of listWorkflowNames(ws)) {
    try {
      const raw = JSON.parse(fs.readFileSync(workflowPath(ws, name), "utf8"));
      const doc = parseWorkflowDocument(raw);
      if (doc.kind !== "graph") continue;
      const expansion = expandGraphSubgraphs(doc.graph, resolve);
      if (expansion.issues.some((i) => i.level === "error")) continue;
      out.push({ name, graph: expansion.graph });
    } catch {
      /* malformed workflow file — `ralphy workflow lint` is the diagnosis path */
    }
  }
  return out;
}

/** The trigger that fired a tick (#503 cron / #520 inbound webhook). */
export interface TickTrigger {
  /** The firing trigger node id (schedule or webhook-trigger). */
  node?: string;
  /** The matched cron expression (schedule triggers). */
  cron?: string;
  /** The inbound hook's RAW JSON payload (webhook triggers). */
  payload?: unknown;
}

/**
 * Normalize an inbound webhook payload into the trigger's out-port (#520):
 * `params.pick` extracts one value by dot-path, `params.map` builds an object
 * of dot-path extractions — the same declarative vocabulary as the transform
 * node (dotGet, no code eval). No mapping params → the raw payload passes.
 */
export function normalizeWebhookPayload(node: WorkflowNode, payload: unknown): unknown {
  const p = node.params as { pick?: string; map?: Record<string, string> };
  if (typeof p.pick === "string" && p.pick.length > 0) return dotGet(payload, p.pick);
  if (p.map && typeof p.map === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, dp] of Object.entries(p.map)) {
      if (typeof dp === "string") out[key] = dotGet(payload, dp);
    }
    return out;
  }
  return payload;
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

/** Safety valve on route jumps (on_fail route + gate repair loops), per sequence. */
const MAX_ROUTE_JUMPS = 16;

export interface RunOutcome {
  runId: string;
  status: FarmRunStatus;
  detail?: string;
}

// ─── Fan-out planning (#510) ─────────────────────────────────────────────────

interface FanPlan {
  fan: WorkflowNode;
  /** Branch-scoped node ids: reachable from the fan, stopping at (and excluding) joins. */
  branchNodes: Set<string>;
  /** The main topo order restricted to branchNodes (still topologically valid). */
  branchOrder: WorkflowNode[];
}

interface FanAnalysis {
  plans: Map<string, FanPlan>;
  /** Branch-scoped node id → owning fan-out node id. */
  ownerOf: Map<string, string>;
  /** Structured constraint violation (nested / overlapping fan-out) — the run halts. */
  error?: string;
}

/**
 * Static branch analysis: each fan-out owns every node reachable downstream
 * of it over the data edges, stopping at `join` nodes (a join executes ONCE,
 * top-level, collecting per-branch outputs as order-stable arrays). Nested
 * fan-out and overlapping fan-out subgraphs are unsupported — structured
 * error, the run halts before executing anything (#517 subgraphs follow up).
 */
function planFanOuts(graph: WorkflowGraph, order: WorkflowNode[]): FanAnalysis {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const consumers = new Map<string, string[]>();
  for (const n of graph.nodes) {
    for (const ref of Object.values(n.in)) {
      const p = producerOf(ref);
      if (!p || !byId.has(p) || p === n.id) continue;
      consumers.set(p, [...(consumers.get(p) ?? []), n.id]);
    }
  }
  const plans = new Map<string, FanPlan>();
  const ownerOf = new Map<string, string>();
  for (const fan of graph.nodes) {
    if (fan.type !== "fan-out") continue;
    const branch = new Set<string>();
    const queue = [...(consumers.get(fan.id) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (branch.has(id)) continue;
      const n = byId.get(id)!;
      if (n.type === "join") continue; // barrier — executes once, outside the branch
      if (n.type === "fan-out") {
        return {
          plans,
          ownerOf,
          error: `nested-fan-out-not-supported: fan-out "${id}" is inside the subgraph of fan-out "${fan.id}" — join the branches first (reusable-subgraph nesting is the #517 follow-up)`,
        };
      }
      const prior = ownerOf.get(id);
      if (prior && prior !== fan.id) {
        return {
          plans,
          ownerOf,
          error: `overlapping-fan-out-not-supported: node "${id}" is downstream of both fan-out "${prior}" and fan-out "${fan.id}" — join each fan's branches before sharing nodes`,
        };
      }
      branch.add(id);
      ownerOf.set(id, fan.id);
      queue.push(...(consumers.get(id) ?? []));
    }
    plans.set(fan.id, { fan, branchNodes: branch, branchOrder: order.filter((n) => branch.has(n.id)) });
  }
  return { plans, ownerOf };
}

/**
 * Journal/record key: top-level nodes key by id; branch-scoped nodes key
 * `<node-id>@<branch-index>`. Branch identity = the input-item index —
 * deterministic across resumes, never clock-derived.
 */
function recKey(id: string, branch: number | null): string {
  return branch == null ? id : `${id}@${branch}`;
}

/** Execution scope: TOP for the main walk, or one fan-out branch. */
interface ExecScope {
  branch: number | null;
  plan?: FanPlan;
  /** The branch's input item (what the fan-out node's out-port resolves to in-branch). */
  item?: unknown;
}
const TOP: ExecScope = { branch: null };

function fanSafeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** The fan-out node's items: params.items_port, an in-port named "items", or the sole in-port. */
function pickFanItems(
  fan: WorkflowNode,
  inputs: Record<string, unknown>,
): unknown[] | { error: string } {
  const ports = Object.keys(fan.in);
  const explicit = (fan.params as { items_port?: unknown }).items_port;
  const port =
    typeof explicit === "string"
      ? explicit
      : ports.includes("items")
        ? "items"
        : ports.length === 1
          ? ports[0]!
          : null;
  if (!port || !(port in inputs)) {
    return {
      error: `fan-out "${fan.id}" cannot pick an items in-port — wire exactly one in-port, name one "items", or set params.items_port (got: ${ports.join(", ") || "none"})`,
    };
  }
  let value = inputs[port];
  if (typeof value === "string" && /^\s*\[/.test(value)) value = fanSafeParse(value) ?? value;
  if (!Array.isArray(value)) {
    return {
      error: `fan-out "${fan.id}" in-port "${port}" did not resolve to an array (got ${value === null ? "null" : typeof value})`,
    };
  }
  return value;
}

/**
 * Execute (or RESUME) one graph run. State is rebuilt from the journal on
 * entry, so calling this on a crashed or parked run continues instead of
 * re-executing completed nodes — including branch-scoped fan-out records.
 */
export async function executeGraphRun(
  ws: string,
  runId: string,
  workflowName: string,
  graph: WorkflowGraph,
  deps: FarmDeps = {},
  trigger: TickTrigger = {},
): Promise<RunOutcome> {
  const d = resolveDeps(deps);
  const order = topoOrder(graph);
  const analysis = planFanOuts(graph, order);
  const journal = readJournal(ws, runId);
  const records = journal.nodes;
  const spend = { usd: journal.spendUsd };
  const runDirAbs = runDir(ws, runId);
  const artifactsDir = path.join(runDirAbs, "artifacts");
  fs.mkdirSync(workspaceDir(ws), { recursive: true });

  const emit = async (kind: string, event: Record<string, unknown> & { message: string }) => {
    await appendRunEvent(runId, { kind, ...event });
    d.onEvent(runId, kind, event.message);
  };

  // #518 notification side-effect — fired on the needs-a-human journal events.
  // Failure-safe by construction (d.notify is guarded, notifyFarmEvent never
  // rejects); a broken/absent notify path leaves the run untouched. The
  // dashboard deep-link (approval events) resolves from the workspace's
  // configured base — read once, best-effort.
  const fireNotify = async (
    event: NotifyEvent,
    fields: { title: string; body?: string; node?: string | null; data?: Record<string, unknown> },
  ): Promise<void> => {
    try {
      let url: string | null = null;
      if (event === "run-parked") {
        const cfg = readNotificationsConfig(ws);
        url = approvalDeepLink(cfg, ws, runId);
      }
      await d.notify({
        event,
        workspace: ws,
        title: fields.title,
        body: fields.body,
        runId,
        node: fields.node ?? null,
        url,
        data: fields.data,
        ts: d.now().toISOString(),
      });
    } catch {
      /* invariant: a notification never fails the run */
    }
  };

  const finish = async (status: FarmRunStatus, detail?: string): Promise<RunOutcome> => {
    writeFarmState(ws, runId, { workflow: workflowName, status, updatedAt: d.now().toISOString(), detail });
    if (status === "complete") {
      const topRecorded = [...records.keys()].filter((k) => !k.includes("@")).length;
      await emit("run-completed", { message: `run complete (${topRecorded}/${order.length} nodes recorded)` });
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

  // Unsupported fan-out shapes halt structurally before any node executes.
  if (analysis.error) {
    await emit("run-halted", { status: "halted-failure", reason: analysis.error, message: analysis.error });
    return finish("halted-failure", analysis.error);
  }

  const branchField = (scope: ExecScope) => (scope.branch == null ? {} : { branch: scope.branch });
  const branchTag = (scope: ExecScope) => (scope.branch == null ? "" : ` [branch ${scope.branch}]`);
  const scopeName = (scope: ExecScope) =>
    scope.branch == null ? "the graph" : `the fan-out "${scope.plan!.fan.id}" branch subgraph`;

  const skipNode = async (node: WorkflowNode, reason: string, scope: ExecScope = TOP) => {
    records.set(recKey(node.id, scope.branch), { state: "skipped", reason });
    await emit("node-skipped", {
      node: node.id,
      ...branchField(scope),
      reason,
      message: `node "${node.id}"${branchTag(scope)} skipped: ${reason}`,
    });
  };

  /**
   * Resolve a node's in-ports. Branch scope: the fan node itself resolves to
   * the branch ITEM; in-branch producers resolve branch-scoped; everything
   * else top-level. Top scope: a branch-scoped producer (a join collecting a
   * fan's results) resolves to the ORDER-STABLE per-branch array indexed by
   * branch (null where that branch skipped the producer).
   */
  const resolveInputs = async (
    node: WorkflowNode,
    scope: ExecScope,
  ): Promise<{ inputs: Record<string, unknown> } | { skippedBecause: string }> => {
    const inputs: Record<string, unknown> = {};
    for (const [port, ref] of Object.entries(node.in)) {
      const producer = producerOf(ref);
      if (producer) {
        if (scope.branch != null && scope.plan && producer === scope.plan.fan.id) {
          inputs[port] = scope.item;
          continue;
        }
        if (scope.branch == null) {
          const fanId = analysis.ownerOf.get(producer);
          if (fanId) {
            const fanRec = records.get(fanId);
            if (!fanRec || fanRec.state === "skipped") {
              return { skippedBecause: `upstream-skipped: fan-out "${fanId}" did not run` };
            }
            const count = Array.isArray(fanRec.output) ? fanRec.output.length : 0;
            inputs[port] = Array.from({ length: count }, (_v, b) => {
              const rec = records.get(recKey(producer, b));
              return rec?.state === "completed" ? rec.output : null;
            });
            continue;
          }
        }
        const branchLocal =
          scope.branch != null && scope.plan?.branchNodes.has(producer) ? scope.branch : null;
        const rec = records.get(recKey(producer, branchLocal));
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
  };

  type ExecOutcome =
    | { kind: "completed" }
    | { kind: "skipped" }
    | { kind: "stopped" }
    | { kind: "signal"; signal: RunControlSignal; node?: WorkflowNode }
    | { kind: "on-fail-route"; target: string }
    | { kind: "halt"; detail: string };

  /** The node's on_fail envelope after retries are exhausted. */
  const applyOnFail = async (
    node: WorkflowNode,
    scope: ExecScope,
    attempts: number,
    lastError: string,
  ): Promise<ExecOutcome> => {
    if (node.on_fail === "skip") {
      await skipNode(node, `on-fail-skip: ${lastError}`, scope);
      return { kind: "skipped" };
    }
    if (node.on_fail.startsWith("route:")) {
      const targetId = node.on_fail.slice("route:".length);
      records.set(recKey(node.id, scope.branch), { state: "skipped", reason: `on-fail-route: ${lastError}` });
      await emit("node-skipped", {
        node: node.id,
        ...branchField(scope),
        reason: `on-fail-route to "${targetId}"`,
        message: `node "${node.id}"${branchTag(scope)} failed — routing to "${targetId}"`,
      });
      return { kind: "on-fail-route", target: targetId };
    }
    // halt (default).
    return {
      kind: "halt",
      detail: `node "${node.id}"${branchTag(scope)} failed after ${attempts} attempt(s): ${lastError}`,
    };
  };

  /** Execute one regular node: executor lookup, budget pre-flight, retry, on_fail. */
  const execNode = async (node: WorkflowNode, scope: ExecScope): Promise<ExecOutcome> => {
    const executor = d.executorOverrides[node.type] ?? getExecutor(node.type);
    if (!executor) {
      await skipNode(node, `no-executor: node type "${node.type}" has no registered executor yet`, scope);
      return { kind: "skipped" };
    }

    const resolved = await resolveInputs(node, scope);
    if ("skippedBecause" in resolved) {
      await skipNode(node, resolved.skippedBecause, scope);
      return { kind: "skipped" };
    }

    // #513 content-hash cache: BEFORE the budget pre-check and the paid call —
    // identical resolved inputs + params on a cache-enabled node reuse the
    // prior artifact refs as the node output ($0, no execution). A hit reuses
    // the EXISTING artifact version, never writes a new one (invariant #14).
    let cacheHash: string | null = null;
    if (node.cache === "content-hash" && !d.noCache) {
      cacheHash = computeNodeCacheHash(node, resolved.inputs);
      const hit = lookupNodeCache(ws, cacheHash);
      if (hit) {
        records.set(recKey(node.id, scope.branch), {
          state: "completed",
          output: hit.output,
          artifactPath: hit.artifactPath,
        });
        await emit("node-cached", {
          node: node.id,
          ...branchField(scope),
          hash: hit.hash,
          output: hit.output,
          artifactPath: hit.artifactPath,
          costSavedUsd: hit.costSavedUsd,
          message: `node "${node.id}"${branchTag(scope)} reused cached artifact (saved ~$${hit.costSavedUsd.toFixed(2)})`,
        });
        return { kind: "completed" };
      }
    }

    // Run-wide budget pre-check (#481 opt-in floor: only when a run ledger
    // with an active approval exists — mirrors checkSpend's pass-through).
    if (node.type !== "budget-guard") {
      const { readRunLedger, activeApproval } = await import("../spend.js");
      const approval = activeApproval(await readRunLedger(runId));
      if (approval && spend.usd >= approval.budgetCapUsd) {
        const detail = `run spend $${spend.usd.toFixed(2)} >= approved cap $${approval.budgetCapUsd.toFixed(2)} before node "${node.id}"`;
        return { kind: "signal", signal: new RunControlSignal("halt-budget", detail) };
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
      runSpendUsd: spend.usd,
      log: async (entry) => {
        await fsp.mkdir(runDirAbs, { recursive: true });
        await fsp.appendFile(
          path.join(runDirAbs, "generations.jsonl"),
          JSON.stringify({ ts: d.now().toISOString(), node: node.id, ...branchField(scope), ...entry }) + "\n",
        );
      },
      reportCost: (usd) => {
        nodeCost += usd;
      },
      ...d.ctx,
    };

    await emit("node-started", {
      node: node.id,
      ...branchField(scope),
      message: `node "${node.id}" (${node.type})${branchTag(scope)} started`,
    });

    let attempt = 0;
    let outcome: "completed" | "failed" | "signal" = "failed";
    let signal: RunControlSignal | null = null;
    let lastError = "";
    let nodeSpentUsd = 0;
    let permanent: ReturnType<typeof classifyFilterError> = null;
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
          ...branchField(scope),
          attempt,
          error: lastError,
          costUsd: nodeCost,
          message: `node "${node.id}"${branchTag(scope)} attempt ${attempt} failed: ${lastError}`,
        });
        // A failed attempt's realized spend still counts toward the run total.
        spend.usd = Number((spend.usd + nodeCost).toFixed(6));
        nodeSpentUsd = Number((nodeSpentUsd + nodeCost).toFixed(6));
        nodeCost = 0;
        // #519 class-aware retry: a permanent filter-class failure (safety-* /
        // copyright / tos-content) never clears on a re-attempt — the
        // executor's #514 reroute already had its one hop — so skip the
        // remaining retries and go straight to quarantine. `transient` and
        // UNRECOGNIZED errors keep the envelope's retry budget (unknown =
        // treat transient, per the issue).
        const filtered = classifyFilterError({ message: lastError });
        if (filtered && filtered.filterClass !== "transient") {
          permanent = filtered;
          break;
        }
      }
    }

    if (outcome === "signal" && signal) {
      spend.usd = Number((spend.usd + nodeCost).toFixed(6));
      return { kind: "signal", signal };
    }

    if (outcome === "completed" && result) {
      spend.usd = Number((spend.usd + nodeCost).toFixed(6));
      records.set(recKey(node.id, scope.branch), {
        state: "completed",
        output: result.output,
        artifactPath: result.artifactPath,
      });
      await emit("node-completed", {
        node: node.id,
        ...branchField(scope),
        output: result.output,
        artifactPath: result.artifactPath,
        costUsd: nodeCost,
        message: `node "${node.id}"${branchTag(scope)} completed`,
      });
      // #513 write path: a successful cache-enabled execution that produced an
      // artifact gets an index entry (hash → artifact REFS + the realized cost
      // as the future savings). No artifact → nothing verifiable → no entry.
      if (cacheHash && result.artifactPath) {
        appendNodeCacheEntry(ws, {
          hash: cacheHash,
          nodeType: node.type,
          output: result.output,
          artifactPath: result.artifactPath,
          artifactRefs: [result.artifactPath],
          costSavedUsd: nodeCost,
          ts: d.now().toISOString(),
        });
      }
      for (const target of result.deactivate ?? []) {
        if (!records.has(recKey(target, scope.branch))) {
          const t = graph.nodes.find((n) => n.id === target);
          if (t) await skipNode(t, `deactivated by "${node.id}"`, scope);
        }
      }
      return { kind: "completed" };
    }

    // #519 dead-letter quarantine: retries exhausted (or a permanent-class
    // failure short-circuited them). Record enough to re-execute (inputsHash →
    // the journaled inputs) and to explain, then let the run continue per
    // on_fail — quarantine is a record, not a control-flow change. The
    // `node-quarantined` journal event is the #518 notification hook.
    const classification = permanent ?? classifyError({ message: lastError });
    const quarantineFields = {
      node: node.id,
      ...branchField(scope),
      inputsHash: cacheHash ?? computeNodeCacheHash(node, resolved.inputs),
      errorClass: classification.class,
      ...(classification.filterClass ? { filterClass: classification.filterClass } : {}),
      attempts: attempt,
      costSpentUsd: nodeSpentUsd,
      nextActionHint: classification.nextActions[0] ?? "read the raw provider payload",
    };
    appendQuarantine(ws, {
      ts: d.now().toISOString(),
      run: runId,
      providerPayloadExcerpt: lastError,
      ...quarantineFields,
    });
    await emit("node-quarantined", {
      ...quarantineFields,
      message: `node "${node.id}"${branchTag(scope)} quarantined after ${attempt} attempt(s) [${classification.filterClass ?? classification.class}] — \`ralphy farm retry ${runId} ${node.id}\` re-executes it`,
    });
    await fireNotify("node-quarantined", {
      title: `Farm node "${node.id}" quarantined in run "${runId}"`,
      body: `[${classification.filterClass ?? classification.class}] after ${attempt} attempt(s): ${lastError}. Retry with \`ralphy farm retry ${runId} ${node.id}\``,
      node: node.id,
      data: { errorClass: classification.class, filterClass: classification.filterClass ?? null, attempts: attempt },
    });

    return applyOnFail(node, scope, attempt, lastError);
  };

  type SeqOutcome =
    | { kind: "done" }
    | { kind: "stopped" }
    | { kind: "signal"; signal: RunControlSignal; node: WorkflowNode }
    | { kind: "halt"; detail: string; node: WorkflowNode };

  /**
   * Walk one node sequence in order — the whole graph (TOP scope, where
   * branch-scoped nodes are skipped: their fan-out executes them) or one
   * fan-out branch. Owns the route-jump machinery (gate repair loops + on_fail
   * route), bounded per sequence by MAX_ROUTE_JUMPS.
   */
  const runSequence = async (seq: WorkflowNode[], scope: ExecScope): Promise<SeqOutcome> => {
    let i = 0;
    let routeJumps = 0;
    while (i < seq.length) {
      if (d.shouldStop()) return { kind: "stopped" };
      const node = seq[i]!;
      i++;
      if (scope.branch == null && analysis.ownerOf.has(node.id)) continue; // branch-scoped — its fan-out executes it
      if (records.has(recKey(node.id, scope.branch))) continue; // completed or skipped

      // Trigger built-in: a schedule node "completes" with the tick timestamp.
      if (node.type === "schedule") {
        const output = { firedAt: d.now().toISOString() };
        records.set(recKey(node.id, scope.branch), { state: "completed", output });
        await emit("node-completed", { node: node.id, ...branchField(scope), output, message: `schedule "${node.id}" fired` });
        continue;
      }

      // Trigger built-in (#520): the webhook-trigger that FIRED this tick
      // completes with the normalized inbound payload (pick/map, dotGet);
      // any other tick (cron, resume) SKIPS it — its downstream depends on a
      // payload that never arrived. Exception: an injected executorOverride
      // (the #516 simulate seam) falls through to execNode so a dry-run can
      // cost the full graph with a synthetic payload.
      if (node.type === "webhook-trigger" && trigger.node !== node.id) {
        if (!d.executorOverrides[node.type]) {
          await skipNode(node, `trigger-not-fired: webhook trigger "${node.id}" received no inbound hook this tick`, scope);
          continue;
        }
      } else if (node.type === "webhook-trigger") {
        const output = normalizeWebhookPayload(node, trigger.payload ?? {});
        records.set(recKey(node.id, scope.branch), { state: "completed", output });
        await emit("node-completed", {
          node: node.id,
          ...branchField(scope),
          output,
          message: `webhook trigger "${node.id}" fired`,
        });
        continue;
      }

      const out: ExecOutcome =
        node.type === "fan-out"
          ? await runFanOut(analysis.plans.get(node.id)!)
          : await execNode(node, scope);

      if (out.kind === "completed" || out.kind === "skipped") continue;
      if (out.kind === "stopped") return { kind: "stopped" };
      if (out.kind === "halt") return { kind: "halt", detail: out.detail, node };

      if (out.kind === "signal") {
        const signal = out.signal;
        if (signal.kind !== "route") return { kind: "signal", signal, node: out.node ?? node };
        // route: jump to the target node (gate repair loop). Bounded.
        routeJumps++;
        if (routeJumps > MAX_ROUTE_JUMPS) {
          return {
            kind: "halt",
            detail: `route-jump budget exceeded (${MAX_ROUTE_JUMPS}) at node "${node.id}" — likely a repair loop that never converges`,
            node,
          };
        }
        const target = seq.findIndex((n) => n.id === signal.target);
        if (target === -1) {
          return { kind: "halt", detail: `route target "${signal.target}" is not in ${scopeName(scope)}`, node };
        }
        await emit("node-routed", { node: node.id, ...branchField(scope), target: signal.target, message: signal.message });
        // A backward jump re-executes the target chain: clear completion records
        // downstream of (and including) the target so the loop actually re-runs.
        // The JOURNAL keeps every prior event — this only resets the in-memory cursor.
        for (let k = target; k < i - 1; k++) {
          const rec = seq[k]!;
          const key = recKey(rec.id, scope.branch);
          // Triggers keep their completion on a backward jump: a schedule's
          // timestamp / a webhook's payload cannot be re-produced mid-run.
          if (records.get(key)?.state === "completed" && rec.type !== "schedule" && rec.type !== "webhook-trigger") {
            records.delete(key);
          }
        }
        i = target;
        continue;
      }

      // on-fail-route: forward jump, marking bypassed intermediates skipped.
      routeJumps++;
      if (routeJumps > MAX_ROUTE_JUMPS) {
        return { kind: "halt", detail: `route-jump budget exceeded (${MAX_ROUTE_JUMPS}) at node "${node.id}"`, node };
      }
      const target = seq.findIndex((n) => n.id === out.target);
      if (target === -1) {
        return { kind: "halt", detail: `on_fail route target "${out.target}" is not in ${scopeName(scope)}`, node };
      }
      for (let k = i; k < target; k++) {
        const mid = seq[k]!;
        if (scope.branch == null && analysis.ownerOf.has(mid.id)) continue;
        if (!records.has(recKey(mid.id, scope.branch))) await skipNode(mid, `route-jump: bypassed by "${node.id}" on_fail`, scope);
      }
      i = target;
      continue;
    }
    return { kind: "done" };
  };

  /**
   * Run all branches of one fan-out through a bounded worker pool
   * (params.concurrency). One branch halting does NOT stop siblings; a
   * park/halt-budget signal or a stop request drains in-flight branches and
   * propagates (resume re-executes only the incomplete branch nodes).
   */
  const runBranches = async (
    plan: FanPlan,
    items: unknown[],
    cap: number,
  ): Promise<
    | { kind: "stopped" }
    | { kind: "signal"; signal: RunControlSignal; node: WorkflowNode }
    | { kind: "ran"; failures: Array<{ branch: number; detail: string }> }
  > => {
    const failures: Array<{ branch: number; detail: string }> = [];
    let signal: { signal: RunControlSignal; node: WorkflowNode } | null = null;
    let stopped = false;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (!stopped && !signal && next < items.length) {
        const b = next++;
        const out = await runSequence(plan.branchOrder, { branch: b, plan, item: items[b] });
        if (out.kind === "halt") failures.push({ branch: b, detail: out.detail });
        else if (out.kind === "signal") signal = { signal: out.signal, node: out.node };
        else if (out.kind === "stopped") stopped = true;
      }
    };
    const workers = Math.max(1, Math.min(cap, Math.max(items.length, 1)));
    await Promise.all(Array.from({ length: workers }, () => worker()));
    if (signal) return { kind: "signal", ...(signal as { signal: RunControlSignal; node: WorkflowNode }) };
    if (stopped) return { kind: "stopped" };
    return { kind: "ran", failures: failures.sort((a, b) => a.branch - b.branch) };
  };

  /**
   * Fan-out (#510): map the downstream subgraph once per input item. Branch
   * identity = the item index; branch records key `<node-id>@<branch>`. Halted
   * branches are isolated (siblings finish first) and surface as a failure of
   * the fan-out node itself, routed through its retry + on_fail envelope — a
   * retry re-executes only the failed branches' incomplete nodes.
   */
  const runFanOut = async (plan: FanPlan): Promise<ExecOutcome> => {
    const fan = plan.fan;
    const resolved = await resolveInputs(fan, TOP);
    if ("skippedBecause" in resolved) {
      await skipNode(fan, resolved.skippedBecause);
      return { kind: "skipped" };
    }
    const picked = pickFanItems(fan, resolved.inputs);
    if (!Array.isArray(picked)) {
      await emit("node-failed", {
        node: fan.id,
        attempt: 1,
        error: picked.error,
        message: `fan-out "${fan.id}" failed: ${picked.error}`,
      });
      return applyOnFail(fan, TOP, 1, picked.error);
    }
    const items = picked;
    const rawCap = Number((fan.params as { concurrency?: unknown }).concurrency);
    const cap = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : Math.max(1, items.length);
    await emit("node-started", {
      node: fan.id,
      branches: items.length,
      concurrency: Math.max(1, Math.min(cap, Math.max(items.length, 1))),
      message: `fan-out "${fan.id}" started: ${items.length} branch(es), concurrency ${Math.max(1, Math.min(cap, Math.max(items.length, 1)))}`,
    });

    let attempt = 0;
    let lastError = "";
    while (attempt <= fan.retry.max) {
      attempt++;
      const res = await runBranches(plan, items, cap);
      if (res.kind === "stopped") return { kind: "stopped" };
      if (res.kind === "signal") return { kind: "signal", signal: res.signal, node: res.node };
      if (res.failures.length === 0) {
        records.set(fan.id, { state: "completed", output: items });
        await emit("node-completed", {
          node: fan.id,
          output: items,
          branches: items.length,
          message: `fan-out "${fan.id}" completed ${items.length} branch(es)`,
        });
        return { kind: "completed" };
      }
      lastError = res.failures.map((f) => `branch ${f.branch}: ${f.detail}`).join("; ");
      await emit("node-failed", {
        node: fan.id,
        attempt,
        error: lastError,
        message: `fan-out "${fan.id}" attempt ${attempt}: ${res.failures.length}/${items.length} branch(es) halted — ${lastError}`,
      });
    }
    return applyOnFail(fan, TOP, attempt, lastError);
  };

  const seqOut = await runSequence(order, TOP);
  if (seqOut.kind === "stopped") {
    return { runId, status: "running", detail: "stopped between nodes (farm-state stays running; resume continues)" };
  }
  if (seqOut.kind === "halt") {
    await emit("run-halted", { node: seqOut.node.id, status: "halted-failure", reason: seqOut.detail, message: seqOut.detail });
    await fireNotify("run-failed", {
      title: `Farm run "${runId}" failed`,
      body: seqOut.detail,
      node: seqOut.node.id,
      data: { workflow: workflowName },
    });
    return finish("halted-failure", seqOut.detail);
  }
  if (seqOut.kind === "signal") {
    const signal = seqOut.signal;
    if (signal.kind === "park-approval") {
      await emit("run-parked", { node: seqOut.node.id, status: "parked-approval", reason: signal.message, message: signal.message });
      await fireNotify("run-parked", {
        title: `Farm run "${runId}" is parked for your approval`,
        body: signal.message,
        node: seqOut.node.id,
        data: { workflow: workflowName },
      });
      return finish("parked-approval", signal.message);
    }
    await emit("run-halted", { node: seqOut.node.id, status: "halted-budget", reason: signal.message, message: signal.message });
    await fireNotify("budget-halt", {
      title: `Farm run "${runId}" hit the budget guard`,
      body: signal.message,
      node: seqOut.node.id,
      data: { workflow: workflowName },
    });
    return finish("halted-budget", signal.message);
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
  trigger: TickTrigger = {},
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
  return executeGraphRun(ws, runId, workflowName, graph, deps, trigger);
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

// ─── Targeted retry (#519) ───────────────────────────────────────────────────

/** Transitive consumers of a node over the data edges (excluding the node itself). */
export function downstreamDependents(graph: WorkflowGraph, nodeId: string): string[] {
  const byId = new Set(graph.nodes.map((n) => n.id));
  const consumers = new Map<string, string[]>();
  for (const n of graph.nodes) {
    for (const ref of Object.values(n.in)) {
      const p = producerOf(ref);
      if (!p || !byId.has(p) || p === n.id) continue;
      consumers.set(p, [...(consumers.get(p) ?? []), n.id]);
    }
  }
  const out = new Set<string>();
  const queue = [...(consumers.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(consumers.get(id) ?? []));
  }
  return [...out];
}

export interface RetryOutcome extends RunOutcome {
  /** The retried node. */
  node: string;
  /** Every node whose completion records were invalidated (topo order). */
  invalidated: string[];
  /** true when the retried node completed and its quarantine entries were marked resolved. */
  quarantineResolved: boolean;
}

/**
 * Targeted re-execution (#519): append `node-invalidated` journal events for
 * ONE node plus its transitive downstream dependents (append-only — prior
 * events stay), then re-enter the #503/#510 resume machinery over the same
 * journal. Upstream completed records are untouched, so the node re-executes
 * against the journaled inputs. Spend gates apply exactly as on a first run
 * (the run ledger's cap is pre-flight-checked per node against the journaled
 * realized spend). The #513 cache applies too — safe by construction: failed
 * nodes never wrote cache entries, so a hit can only come from a genuinely
 * successful execution of identical inputs. On completion the node's
 * dead-letter entries get a resolution line (append-only).
 */
export async function retryNode(
  ws: string,
  runId: string,
  workflowName: string,
  graph: WorkflowGraph,
  nodeId: string,
  deps: FarmDeps = {},
): Promise<RetryOutcome> {
  const order = topoOrder(graph);
  const analysis = planFanOuts(graph, order);
  const targets = new Set<string>([nodeId, ...downstreamDependents(graph, nodeId)]);
  // A branch-scoped node re-executes THROUGH its fan-out (the top-level walk
  // skips branch-scoped ids), so the owning fan-out is invalidated too — its
  // re-run executes only the invalidated branch records (#510 resume).
  const owner = analysis.ownerOf.get(nodeId);
  if (owner) targets.add(owner);
  const invalidated = order.map((n) => n.id).filter((id) => targets.has(id));
  for (const id of invalidated) {
    await appendRunEvent(runId, {
      kind: "node-invalidated",
      node: id,
      reason: `farm retry ${nodeId}`,
      message: `node "${id}" invalidated for targeted retry of "${nodeId}"`,
    });
  }
  const outcome = await executeGraphRun(ws, runId, workflowName, graph, deps);
  const nowCompleted = [...readJournal(ws, runId).nodes.entries()].some(
    ([k, rec]) => (k === nodeId || k.startsWith(`${nodeId}@`)) && rec.state === "completed",
  );
  const quarantineResolved = nowCompleted && appendResolution(ws, runId, nodeId) > 0;
  return { ...outcome, node: nodeId, invalidated, quarantineResolved };
}

// ─── The scheduler loop (`ralphy farm start`) ────────────────────────────────

export interface FarmLoopOptions {
  workspace?: string;
  /** Exit after the first tick completes (test / CI mode). */
  once?: boolean;
  /** Fire every scheduled graph immediately once at startup (debug). */
  tickNow?: boolean;
  /** #513: force execution on every node, ignoring the content-hash cache. */
  noCache?: boolean;
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
  if (opts.noCache) deps = { ...deps, noCache: true };
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
  /** #513 aggregate across all runs: content-hash cache hits + cost saved. */
  cache: { hits: number; savedUsd: number };
  runs: Array<{
    id: string;
    workflow: string;
    status: FarmRunStatus;
    completedNodes: number;
    skippedNodes: number;
    totalNodes: number | null;
    spendUsd: number;
    cacheHits: number;
    cacheSavedUsd: number;
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
  const cache = { hits: 0, savedUsd: 0 };
  for (const { runId, state } of listFarmRuns(ws)) {
    counts[state.status]++;
    const journal = readJournal(ws, runId);
    let completedNodes = 0;
    let skippedNodes = 0;
    for (const rec of journal.nodes.values()) {
      if (rec.state === "completed") completedNodes++;
      else skippedNodes++;
    }
    cache.hits += journal.cacheHits;
    cache.savedUsd = Number((cache.savedUsd + journal.cacheSavedUsd).toFixed(6));
    const wf = graphs.find((g) => g.name === state.workflow);
    runs.push({
      id: runId,
      workflow: state.workflow,
      status: state.status,
      completedNodes,
      skippedNodes,
      totalNodes: wf ? wf.graph.nodes.length : null,
      spendUsd: journal.spendUsd,
      cacheHits: journal.cacheHits,
      cacheSavedUsd: journal.cacheSavedUsd,
      updatedAt: state.updatedAt,
      detail: state.detail ?? null,
    });
  }
  return {
    workspace: ws,
    daemon: { running, pid: running ? pid : null, pidFile: farmPidPath(ws) },
    counts,
    cache,
    runs,
  };
}
