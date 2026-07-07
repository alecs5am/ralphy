// Workflow simulate — dry-run with cost forecast (#516).
//
// `ralphy workflow simulate` answers the operator's pre-flight questions
// BEFORE `farm start` (#506) spends a cent: what does one tick of this graph
// cost, what does a calendar week cost, which nodes are paid, where are the
// approval stops, and does the environment actually have the keys/coverage
// the graph needs.
//
// ── How the simulation runs ──────────────────────────────────────────────────
// The REAL farm runner executes the graph (fireTick → executeGraphRun — no
// parallel interpreter): every node type is overridden through the existing
// `FarmDeps.executorOverrides` seam with a SYNTHETIC executor that propagates
// typed placeholder data per NODE_SIGNATURES port types, never calls a
// provider, and never writes artifacts. Isolation: the run executes against an
// EPHEMERAL scratch root (paths setRoot → a mkdtemp dir, restored + deleted in
// a finally) so the run journal / farm-state / node-cache of the simulation
// never land in the workspace's runs/ tree or farm state. Fan-out (#510)
// multiplication is therefore EXACT — branch-scoped nodes really execute once
// per item — and #517 subgraph expansion comes for free (loadGraphWorkflows
// hands the runner the expanded graph).
//
// ── Cost model (reuse, don't duplicate) ──────────────────────────────────────
//   • image nodes    — the `generate image` table (generate-batch.ts, via
//                      knownImageCostUsd) × variants.
//   • video nodes    — VIDEO_PRICE_PER_SEC (or-catalog.ts, the same table
//                      estimateVideoCostUsd reads) × durationSec × variants.
//   • VO/music/sfx   — the flat ElevenLabs ballparks via estimatedCallCostUsd
//                      (spend.ts — the same helper the #444 spend gate uses).
//   • LLM nodes      — a nominal-token estimate (~3K in / 1K out) over the
//                      hand-maintained $/Mtok table below (MODELS.md mirror
//                      convention, same as VIDEO_PRICE_PER_SEC).
//   • unknown pricing — an EXPLICIT `unknown` line, never a silent $0: a model
//                      absent from its table, a missing duration, or a node
//                      class with no USD table (transcribe, connector-metered
//                      ingestion, external coding agents).
//
// Blocking findings (missing connector keys via the #502 requirement
// derivation, #497 coverage gaps) flip `ok: false` — the CLI exits non-zero
// so CI can gate a deploy on the report.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { root, setRoot, workspaceDir, runDir } from "../paths.js";
import { fireTick, loadGraphWorkflows, topoOrder, scheduleTriggers } from "./runner.js";
import type { FarmRunStatus } from "./runner.js";
import { cronMatches, type CronSpec } from "./cron.js";
import { estimatedCallCostUsd } from "../spend.js";
import { VIDEO_PRICE_PER_SEC } from "../or-catalog.js";
import { knownImageCostUsd } from "../generate-batch.js";
import { deriveBundleRequirements } from "../bundle.js";
import { coverageFor } from "../providers/coverage.js";
import { readTrustConfig } from "../trust.js";
import { readCalendar } from "../calendar/store.js";
import {
  WORKFLOW_NODE_TYPES,
  nodeOutType,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeType,
} from "../schemas/workflow.js";
import type { NodeExecutor } from "../workflow/executors/types.js";

// ─── LLM token-estimate pricing ──────────────────────────────────────────────
// Hand-maintained $/Mtok ballparks (MODELS.md is the human source of truth —
// same convention as VIDEO_PRICE_PER_SEC). A model absent here is an explicit
// `unknown` line, never a fallback price.

/** Mirrors the executors' default (cli/lib/workflow/executors/llm.ts). */
const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash";

const LLM_PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "google/gemini-3.1-pro-preview": { input: 2, output: 12 },
};

/** Nominal per-call token shape for the estimate (~ one prompt + one answer). */
const NOMINAL_LLM_TOKENS = { input: 3000, output: 1000 } as const;

/** Token-estimate cost of one LLM call, or null when the model has no table entry. */
export function llmCallCostUsd(model: string): number | null {
  const p = LLM_PRICE_PER_MTOK[model];
  if (!p) return null;
  const usd =
    (NOMINAL_LLM_TOKENS.input / 1_000_000) * p.input +
    (NOMINAL_LLM_TOKENS.output / 1_000_000) * p.output;
  return Number(usd.toFixed(6));
}

// ─── Static per-node cost estimate ───────────────────────────────────────────

export interface NodePricing {
  /** known = a price table covers it; unknown = paid but unpriceable (explicit line); free = $0 by construction. */
  pricing: "known" | "unknown" | "free";
  /** USD per single execution (per branch); null when unknown. */
  unitUsd: number | null;
  /** Human-readable basis / reason line. */
  basis: string;
}

const VIDEO_NODE_TYPES = new Set(["t2v", "i2v", "r2v", "v2v", "lipsync"]);
const IMAGE_NODE_TYPES = new Set(["t2i", "i2i"]);
const LLM_ESTIMATE_TYPES = new Set(["generate-text", "generate-object", "agent-loop"]);
const FREE_POST_OPS = new Set(["upscale", "remove-bg", "reframe", "crunch"]);

function nodeVariants(node: WorkflowNode): number {
  const v = (node.params as { variants?: unknown }).variants;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 1;
}

function nodeDurationSec(node: WorkflowNode): number | undefined {
  const p = node.params as { durationSec?: unknown; duration?: unknown };
  const d = typeof p.durationSec === "number" ? p.durationSec : typeof p.duration === "number" ? p.duration : undefined;
  return d !== undefined && d > 0 ? d : undefined;
}

function nodeModel(node: WorkflowNode): string | undefined {
  const m = (node.params as { model?: unknown }).model;
  return typeof m === "string" && m.length > 0 ? m : undefined;
}

const known = (usd: number, basis: string): NodePricing => ({
  pricing: "known",
  unitUsd: Number(usd.toFixed(6)),
  basis,
});
const unknown = (basis: string): NodePricing => ({ pricing: "unknown", unitUsd: null, basis });
const free = (basis: string): NodePricing => ({ pricing: "free", unitUsd: 0, basis });

/** Flat ElevenLabs kinds through the SAME helper the spend gate uses. */
function flatKind(kind: "voiceover" | "music" | "sfx", variants: number): NodePricing {
  const usd = estimatedCallCostUsd({ kind, variants });
  return known(usd, `${variants}x ${kind} @ flat ElevenLabs ballpark (spend.ts)`);
}

function videoPricing(node: WorkflowNode, model: string | undefined, variants: number): NodePricing {
  if (!model) return unknown(`no params.model on ${node.type} node — video pricing needs a model id`);
  const perSec = VIDEO_PRICE_PER_SEC[model];
  if (perSec === undefined) return unknown(`no video price entry for model "${model}" (or-catalog.ts VIDEO_PRICE_PER_SEC)`);
  const durationSec = nodeDurationSec(node);
  if (durationSec === undefined) {
    return unknown(`model "${model}" is priced $${perSec}/s but params.durationSec is missing`);
  }
  return known(perSec * durationSec * variants, `${variants}x ${durationSec}s video @ $${perSec}/s (${model})`);
}

function imagePricing(node: WorkflowNode, model: string | undefined, variants: number): NodePricing {
  if (!model) return unknown(`no params.model on ${node.type} node — image pricing needs a model id`);
  const perImage = knownImageCostUsd(model);
  if (perImage === null) return unknown(`no image price entry for model "${model}" (generate-batch.ts)`);
  return known(perImage * variants, `${variants}x image @ $${perImage} (${model})`);
}

function llmPricing(node: WorkflowNode, model: string | undefined): NodePricing {
  const m = model ?? DEFAULT_TEXT_MODEL;
  const usd = llmCallCostUsd(m);
  if (usd === null) return unknown(`no LLM token price entry for model "${m}" (simulate.ts LLM_PRICE_PER_MTOK)`);
  return known(
    usd,
    `token estimate ${NOMINAL_LLM_TOKENS.input} in / ${NOMINAL_LLM_TOKENS.output} out (${m}${model ? "" : ", engine default"})`,
  );
}

/**
 * Static USD estimate for ONE execution of a node (one branch). Pure — reads
 * only the node's params. Fan-out multiplication comes from the simulated
 * run's per-branch invocation counts, not from here.
 */
export function estimateNodeCost(node: WorkflowNode): NodePricing {
  const t = node.type;
  const model = nodeModel(node);
  const variants = nodeVariants(node);

  if (IMAGE_NODE_TYPES.has(t)) return imagePricing(node, model, variants);
  if (VIDEO_NODE_TYPES.has(t)) return videoPricing(node, model, variants);
  if (t === "tts") return flatKind("voiceover", variants);
  if (t === "music") return flatKind("music", variants);
  if (t === "sfx") return flatKind("sfx", variants);
  if (t === "voice-design") return unknown("no price table for voice-design passes");
  if (t === "transcribe") return unknown("no price table for the scribe transcription pass");
  if (FREE_POST_OPS.has(t)) return free("deterministic ffmpeg post-op — no provider spend");

  if (LLM_ESTIMATE_TYPES.has(t)) return llmPricing(node, model);
  if (t === "coding-agent") return unknown("external agent binary — billed outside ralphy");

  if (t === "ralphy-generate") {
    const kind = (node.params as { kind?: unknown }).kind;
    if (kind === "image") return imagePricing(node, model, variants);
    if (kind === "video") return videoPricing(node, model, variants);
    if (kind === "voiceover") return flatKind("voiceover", variants);
    if (kind === "music") return flatKind("music", variants);
    if (kind === "sfx") return flatKind("sfx", variants);
    return unknown(`ralphy-generate params.kind "${String(kind ?? "(unset)")}" has no price mapping`);
  }
  if (t === "ralphy-render") return free("local HyperFrames render — compute, not provider spend");
  if (t === "ralphy-eval") return unknown("vision eval calls — no price table");
  if (t === "ralphy-captions") return unknown("caption generation (scribe pass) — no price table");
  if (t === "ralphy-social-copy") return llmPricing(node, model);
  if (t === "ralphy-repair" || t === "ralphy-unit") return free("deterministic — zero model calls");

  if (t === "web-scrape" || t === "actor") {
    return unknown(`${t} is connector-metered (credits) — no USD price table`);
  }
  if (t === "trend-watch") {
    const topics = (node.params as { topics?: unknown }).topics;
    const metered =
      Array.isArray(topics) &&
      topics.some((x) => x && typeof x === "object" && ((x as Record<string, unknown>).query || (x as Record<string, unknown>).actor));
    return metered
      ? unknown("trend-watch topics use firecrawl/apify backends — connector-metered, no USD table")
      : free("rss-only trend-watch — keyless");
  }

  // rss / http, publish nodes, control-flow, data plumbing.
  return free("no provider model billing");
}

// ─── Synthetic executors ─────────────────────────────────────────────────────

/** Placeholder source-item[] with the assumed cardinality. */
function simItems(n: number, nodeId: string): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_v, i) => ({
    id: `sim-${nodeId}-${i + 1}`,
    title: `Simulated item ${i + 1}`,
    url: `sim://item/${nodeId}/${i + 1}`,
    ts: new Date(0).toISOString(),
    simulated: true,
  }));
}

/** Typed placeholder per the node's OUTPUT port type (NODE_SIGNATURES / nodeOutType). */
function placeholderFor(node: WorkflowNode, assumeItems: number): unknown {
  const outType = nodeOutType(node);
  if (outType === "source-item[]") return simItems(assumeItems, node.id);
  if (outType === "image[]") return [`sim://image/${node.id}.png`];
  if (outType === "video") return `sim://video/${node.id}.mp4`;
  if (outType === "audio") return `sim://audio/${node.id}.mp3`;
  if (outType === "unit") return { slug: `sim-${node.id}`, simulated: true };
  if (outType.startsWith("object:")) return { simulated: true, node: node.id };
  return `[simulated ${node.id}]`; // text / any
}

interface SyntheticCollector {
  approvalStops: Array<{ node: string; reason: string | null; autoPass: boolean }>;
  budgetGuards: Array<{ node: string; capUsd: number | null }>;
}

/**
 * One synthetic executor per node type: typed placeholder outputs, ZERO
 * provider calls, ZERO artifact writes (no artifactPath is ever returned, so
 * the #513 cache write path never fires either). Control-flow nodes pass
 * through instead of parking/halting/pruning — the simulation costs the FULL
 * graph (worst case): gates ship, switches keep every route, approvals record
 * a stop and continue.
 */
export function buildSyntheticExecutors(
  assumeItems: number,
  collector: SyntheticCollector,
): Partial<Record<WorkflowNodeType, NodeExecutor>> {
  const overrides: Partial<Record<WorkflowNodeType, NodeExecutor>> = {};
  const generic =
    (): NodeExecutor =>
    async (node) => ({ output: placeholderFor(node, assumeItems) });

  for (const type of WORKFLOW_NODE_TYPES) overrides[type] = generic();

  // Pass-through plumbing keeps fan-out cardinality flowing.
  overrides.dedup = async (node, ctx) => {
    const items = ctx.inputs.items;
    return { output: Array.isArray(items) ? items : simItems(assumeItems, node.id) };
  };
  overrides.join = async (_node, ctx) => ({ output: { ...ctx.inputs } });
  overrides.transform = async (node, ctx) => {
    const vals = Object.values(ctx.inputs);
    return { output: vals.length === 1 ? vals[0] : vals.length > 1 ? { ...ctx.inputs } : placeholderFor(node, assumeItems) };
  };

  // Worst-case control flow: never prune, never park, never halt.
  overrides.gate = async (node) => ({ output: { decision: "ship", simulated: true, node: node.id } });
  overrides.switch = async (node) => ({ output: { simulated: true, node: node.id } });
  overrides.approval = async (node) => {
    const p = node.params as { reason?: unknown; auto_pass?: unknown };
    if (!collector.approvalStops.some((s) => s.node === node.id)) {
      collector.approvalStops.push({
        node: node.id,
        reason: typeof p.reason === "string" ? p.reason : null,
        autoPass: p.auto_pass === true,
      });
    }
    return { output: { approved: true, simulated: true } };
  };
  overrides["budget-guard"] = async (node) => {
    const cap = (node.params as { max_usd?: unknown }).max_usd ?? node.budget?.max_usd;
    if (!collector.budgetGuards.some((g) => g.node === node.id)) {
      collector.budgetGuards.push({ node: node.id, capUsd: typeof cap === "number" ? cap : null });
    }
    return { output: { ok: true, simulated: true } };
  };

  return overrides;
}

// ─── Fan-out cardinality assumption ──────────────────────────────────────────

export function resolveAssumeItems(
  graph: WorkflowGraph,
  explicit?: number,
): { items: number; source: string } {
  if (typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 1) {
    return { items: explicit, source: "--assume-items" };
  }
  const tw = graph.nodes.find((n) => n.type === "trend-watch");
  if (tw) {
    const p = tw.params as { expected_items?: unknown; topics?: unknown };
    if (typeof p.expected_items === "number" && Number.isInteger(p.expected_items) && p.expected_items >= 1) {
      return { items: p.expected_items, source: `trend-watch "${tw.id}" params.expected_items` };
    }
    if (Array.isArray(p.topics) && p.topics.length > 0) {
      return { items: p.topics.length, source: `trend-watch "${tw.id}" topics count` };
    }
  }
  return { items: 3, source: "default (3 items — pass --assume-items to override)" };
}

// ─── Weekly tick projection ──────────────────────────────────────────────────

const WEEK_MINUTES = 7 * 24 * 60;

/** Cron fires over the 7 days starting at `from` (minute resolution). */
export function cronFiresPerWeek(spec: CronSpec, from: Date): number {
  return countMatchingMinutes([spec], from);
}

/** Minutes in the week where ANY spec matches — one Run per workflow per tick. */
function countMatchingMinutes(specs: CronSpec[], from: Date): number {
  const start = new Date(from);
  start.setSeconds(0, 0);
  let fires = 0;
  for (let m = 0; m < WEEK_MINUTES; m++) {
    const at = new Date(start.getTime() + m * 60_000);
    if (specs.some((s) => cronMatches(s, at))) fires++;
  }
  return fires;
}

// ─── The report ──────────────────────────────────────────────────────────────

export interface SimulateNodeCost {
  node: string;
  type: string;
  model: string | null;
  provider: string | null;
  pricing: NodePricing["pricing"];
  /** USD per execution (per branch); null when unknown. */
  unitUsd: number | null;
  /** Simulated executions this tick (fan-out branches multiply this). */
  invocations: number;
  /** unitUsd x invocations; null when pricing is unknown. */
  totalUsd: number | null;
  basis: string;
}

export interface SimulateBlockingFinding {
  id: "missing-key" | "coverage-gap";
  detail: string;
  fix: string;
}

export interface SimulateReport {
  workspace: string;
  workflow: string;
  /** false when a blocking finding (missing key / coverage gap) is present. */
  ok: boolean;
  blocking: SimulateBlockingFinding[];
  assumptions: {
    fanOutItems: number;
    fanOutItemsSource: string;
    note: string;
  };
  run: {
    status: FarmRunStatus;
    detail: string | null;
    nodesCompleted: number;
    nodesSkipped: number;
  };
  costs: {
    perNode: SimulateNodeCost[];
    /** Sum of the KNOWN per-node totals for one tick. */
    tickKnownUsd: number;
    unknownPricing: Array<{ node: string; type: string; model: string | null; reason: string }>;
  };
  paidNodes: Array<{
    node: string;
    type: string;
    model: string | null;
    provider: string | null;
    cache: string;
    pricing: NodePricing["pricing"];
    unitUsd: number | null;
  }>;
  approvals: {
    trustLevel: string;
    stops: Array<{ node: string; reason: string | null; autoPass: boolean }>;
  };
  budget: {
    guards: Array<{ node: string; capUsd: number | null }>;
    nodeBudgets: Array<{ node: string; maxUsd: number }>;
    minCapUsd: number | null;
    tickKnownUsd: number;
    /** minCapUsd - tickKnownUsd; null when no cap is configured. */
    headroomUsd: number | null;
  };
  weekly: {
    ticksPerWeek: number;
    basis: "schedule-cron" | "calendar-slots" | "none";
    schedule: Array<{ node: string; cron: string; firesPerWeek: number }>;
    calendarSlots: number;
    projectedKnownUsd: number;
  };
  ticks: {
    count: number;
    projectedKnownUsd: number;
  };
  environment: {
    requiredKeys: string[];
    missingKeys: string[];
    coverageGaps: Array<{ model: string; capability: string; provider: string }>;
  };
}

export interface SimulateOptions {
  /** Fan-out cardinality override (else trend-watch expectations, else 3). */
  assumeItems?: number;
  /** Ticks to project over (default 1). */
  ticks?: number;
  /** Project over a calendar week (ticks = weekly fire count). */
  week?: boolean;
  /** Clock seam for deterministic tests. */
  now?: () => Date;
}

/** node-completed / node-cached counts per node id (branch events fold into their node). */
function countInvocations(eventsFile: string): { completions: Map<string, number>; skipped: number } {
  const completions = new Map<string, number>();
  let skipped = 0;
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(eventsFile, "utf8").split("\n").filter(Boolean);
  } catch {
    return { completions, skipped };
  }
  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof e.node !== "string") continue;
    if (e.kind === "node-completed" || e.kind === "node-cached") {
      completions.set(e.node, (completions.get(e.node) ?? 0) + 1);
    } else if (e.kind === "node-skipped") {
      skipped++;
    }
  }
  return { completions, skipped };
}

/**
 * Simulate one tick of a workspace's graph workflow through the REAL farm
 * runner with synthetic executors, and roll the result into the #516 report.
 * READ-ONLY over the workspace: the run executes against an ephemeral scratch
 * root that is deleted before this function returns.
 */
export async function simulateWorkflow(
  ws: string,
  workflowName: string | undefined,
  opts: SimulateOptions = {},
): Promise<SimulateReport> {
  const now = opts.now ?? (() => new Date());

  // ── Load + select the graph (real root) ────────────────────────────────────
  const graphs = loadGraphWorkflows(ws);
  if (graphs.length === 0) {
    throw new Error(
      `workspace "${ws}" has no lint-clean node-graph workflow — author one under workflows/ and check it with \`ralphy workflow lint ${ws}\``,
    );
  }
  let wf = workflowName ? graphs.find((g) => g.name === workflowName) : undefined;
  if (workflowName && !wf) {
    throw new Error(`no graph workflow "${workflowName}" in ${ws} (have: ${graphs.map((g) => g.name).join(", ")})`);
  }
  if (!wf) {
    if (graphs.length > 1) {
      throw new Error(`${ws} has ${graphs.length} graph workflows (${graphs.map((g) => g.name).join(", ")}) — pass a name`);
    }
    wf = graphs[0]!;
  }
  const graph = wf.graph;

  // ── Real-root context: trust, calendar, keys, coverage ─────────────────────
  const trust = readTrustConfig(ws);
  const calendarSlots = readCalendar(workspaceDir(ws)).slots.length;
  const requirements = deriveBundleRequirements([graph]);
  const missingKeys = requirements.requiredConnectorKeys.filter((k) => !process.env[k]);
  const coverageGaps = requirements.requiredCoverage.filter(
    (t) => coverageFor(t.model, t.capability, t.provider) === undefined,
  );

  const blocking: SimulateBlockingFinding[] = [
    ...missingKeys.map((k) => ({
      id: "missing-key" as const,
      detail: `required connector key ${k} is not set — the farm cannot run the nodes bound to it`,
      fix: `export ${k} (or run \`ralphy setup\`)`,
    })),
    ...coverageGaps.map((t) => ({
      id: "coverage-gap" as const,
      detail: `coverage matrix has no entry for (${t.model}, ${t.capability}, ${t.provider}) — node params cannot be validated`,
      fix: `check \`ralphy provider matrix --model ${t.model}\` / update cli/lib/providers/coverage.ts`,
    })),
  ];

  // ── Fan-out assumption + synthetic executors ───────────────────────────────
  const assume = resolveAssumeItems(graph, opts.assumeItems);
  const collector: SyntheticCollector = { approvalStops: [], budgetGuards: [] };
  const overrides = buildSyntheticExecutors(assume.items, collector);

  // ── Execute ONE tick in an ephemeral scratch root ──────────────────────────
  const prevRoot = root();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-simulate-"));
  let outcome: { status: FarmRunStatus; detail?: string; runId: string };
  let invocations: Map<string, number>;
  let skippedEvents: number;
  try {
    fs.mkdirSync(path.join(scratch, ".ralphy"), { recursive: true });
    setRoot(scratch);
    fs.mkdirSync(workspaceDir(ws), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir(ws), "workspace.json"), JSON.stringify({ slug: ws }) + "\n");
    outcome = await fireTick(ws, wf.name, graph, {
      sleep: async () => {},
      now,
      executorOverrides: overrides,
      noCache: true,
    });
    const counted = countInvocations(path.join(runDir(ws, outcome.runId), "run-events.jsonl"));
    invocations = counted.completions;
    skippedEvents = counted.skipped;
  } finally {
    setRoot(prevRoot);
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  // ── Cost rollup (static unit estimate x simulated invocation count) ────────
  const order = topoOrder(graph);
  const perNode: SimulateNodeCost[] = [];
  const unknownPricing: SimulateReport["costs"]["unknownPricing"] = [];
  let tickKnownUsd = 0;
  let nodesCompleted = 0;
  for (const node of order) {
    const est = estimateNodeCost(node);
    const inv = invocations.get(node.id) ?? 0;
    if (inv > 0) nodesCompleted++;
    const totalUsd = est.unitUsd === null ? null : Number((est.unitUsd * inv).toFixed(6));
    if (totalUsd !== null) tickKnownUsd += totalUsd;
    const provider = (node.params as { provider?: unknown }).provider;
    perNode.push({
      node: node.id,
      type: node.type,
      model: nodeModel(node) ?? null,
      provider: typeof provider === "string" ? provider : null,
      pricing: est.pricing,
      unitUsd: est.unitUsd,
      invocations: inv,
      totalUsd,
      basis: est.basis,
    });
    if (est.pricing === "unknown") {
      unknownPricing.push({ node: node.id, type: node.type, model: nodeModel(node) ?? null, reason: est.basis });
    }
  }
  tickKnownUsd = Number(tickKnownUsd.toFixed(6));

  const paidNodes = perNode
    .filter((n) => n.pricing !== "free")
    .map((n) => ({
      node: n.node,
      type: n.type,
      model: n.model,
      provider: n.provider,
      cache: graph.nodes.find((g) => g.id === n.node)?.cache ?? "none",
      pricing: n.pricing,
      unitUsd: n.unitUsd,
    }));

  // ── Budget headroom (#481) ─────────────────────────────────────────────────
  const nodeBudgets = graph.nodes
    .filter((n) => n.budget && typeof n.budget.max_usd === "number")
    .map((n) => ({ node: n.id, maxUsd: n.budget!.max_usd }));
  const guardCaps = collector.budgetGuards.map((g) => g.capUsd).filter((c): c is number => c !== null);
  const minCapUsd = guardCaps.length > 0 ? Math.min(...guardCaps) : null;

  // ── Weekly projection: schedule crons x calendar slots (#504) ──────────────
  const triggers = scheduleTriggers(graph);
  const schedule = triggers.map((t) => ({
    node: t.node,
    cron: t.spec.expr,
    firesPerWeek: cronFiresPerWeek(t.spec, now()),
  }));
  const scheduleFires = triggers.length > 0 ? countMatchingMinutes(triggers.map((t) => t.spec), now()) : 0;
  const ticksPerWeek = scheduleFires > 0 ? scheduleFires : calendarSlots;
  const weeklyBasis: SimulateReport["weekly"]["basis"] =
    scheduleFires > 0 ? "schedule-cron" : calendarSlots > 0 ? "calendar-slots" : "none";

  const tickCount = opts.week ? ticksPerWeek : Math.max(1, opts.ticks ?? 1);

  return {
    workspace: ws,
    workflow: wf.name,
    ok: blocking.length === 0,
    blocking,
    assumptions: {
      fanOutItems: assume.items,
      fanOutItemsSource: assume.source,
      note: "worst-case walk: gates ship, switch routes are not pruned, approvals pass through (each recorded as a stop)",
    },
    run: {
      status: outcome.status,
      detail: outcome.detail ?? null,
      nodesCompleted,
      nodesSkipped: skippedEvents,
    },
    costs: { perNode, tickKnownUsd, unknownPricing },
    paidNodes,
    approvals: { trustLevel: trust.level, stops: collector.approvalStops },
    budget: {
      guards: collector.budgetGuards,
      nodeBudgets,
      minCapUsd,
      tickKnownUsd,
      headroomUsd: minCapUsd === null ? null : Number((minCapUsd - tickKnownUsd).toFixed(6)),
    },
    weekly: {
      ticksPerWeek,
      basis: weeklyBasis,
      schedule,
      calendarSlots,
      projectedKnownUsd: Number((ticksPerWeek * tickKnownUsd).toFixed(6)),
    },
    ticks: {
      count: tickCount,
      projectedKnownUsd: Number((tickCount * tickKnownUsd).toFixed(6)),
    },
    environment: {
      requiredKeys: requirements.requiredConnectorKeys,
      missingKeys,
      coverageGaps,
    },
  };
}
