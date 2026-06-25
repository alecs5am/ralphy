// Run-level canvas graph (#490) — a DERIVED read model of a content-farm run as
// a source-to-unit graph, for the Studio run canvas.
//
// This is NOT a new graph runtime: it composes the EXISTING run roll-up
// (summarizeRun), the per-project workflow lane (readWorkflowLane), artifact
// listing (listArtifacts), and the run-scoped annotations (readAnnotations) into
// nodes + provenance edges. ZERO model calls, READ-ONLY over media. The sole
// write is the node layout (canvas.json, run-scoped metadata — like board.json).
//
// Node types (left-to-right layers): source · research · strategy · template ·
// batch · project · gate · repair · unit · destination. Only nodes that have
// backing state are emitted; edges represent artifact/provenance flow, never
// arbitrary executable wiring. Self-contained (no cli import).

import path from "node:path";
import fs from "node:fs";
import { projectDir, summarizeRun, readWorkflowLane, listArtifacts } from "./lib.js";
import { readAnnotations } from "./annotations.js";

export type RunGraphNodeType =
  | "source"
  | "research"
  | "strategy"
  | "template"
  | "batch"
  | "project"
  | "gate"
  | "repair"
  | "unit"
  | "destination";

/** Layer index per type — drives the auto-layout column (x = layer * COL_W). */
const LAYER: Record<RunGraphNodeType, number> = {
  source: 0, research: 1, strategy: 2, template: 3, batch: 4,
  project: 5, gate: 6, repair: 7, unit: 8, destination: 9,
};

export type RunGraphNode = {
  id: string;
  type: RunGraphNodeType;
  label: string;
  layer: number;
  /** Coarse state for project/gate nodes: pass | blocked | waiting | pending | running. */
  status?: string;
  /** Scorecard #427 verdict where one applies (project/gate). */
  verdict?: string | null;
  /** Actual spend (project nodes). */
  cost?: number | null;
  /** A count badge (artifact count for a project). */
  count?: number | null;
  /** Whether the node is awaiting a user decision. */
  approvalNeeded?: boolean;
  /** Short subtitle. */
  detail?: string;
  /** Owning member project id (so the drawer can fetch its files/annotations/logs). */
  project?: string | null;
};

export type RunGraphEdge = { from: string; to: string };

export type RunGraph = {
  run: string;
  workspace: string;
  title: string;
  status: string;
  nextAction: string;
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
  /** Saved node positions (node id → {x,y}); empty = auto-layout. */
  layout: Record<string, { x: number; y: number }>;
} | null;

const CANVAS_FILE = "canvas.json";

function runDirOf(dataRoot: string, workspace: string, runId: string): string {
  return path.join(dataRoot, "workspaces", workspace, "runs", runId);
}

/** Read the extra run.json fields summarizeRun doesn't surface (spine inputs). */
function readRunSpine(dataRoot: string, workspace: string, runId: string): {
  brief: string | null;
  strategyPath: string | null;
  intelligencePackPath: string | null;
  batchId: string | null;
  workflow: string | null;
} {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(runDirOf(dataRoot, workspace, runId), "run.json"), "utf-8"));
    return {
      brief: typeof raw.brief === "string" ? raw.brief : null,
      strategyPath: typeof raw.strategyPath === "string" ? raw.strategyPath : null,
      intelligencePackPath: typeof raw.intelligencePackPath === "string" ? raw.intelligencePackPath : null,
      batchId: typeof raw.batchId === "string" ? raw.batchId : null,
      workflow: typeof raw.workflow === "string" ? raw.workflow : null,
    };
  } catch {
    return { brief: null, strategyPath: null, intelligencePackPath: null, batchId: null, workflow: null };
  }
}

function readCanvasLayout(dataRoot: string, workspace: string, runId: string): Record<string, { x: number; y: number }> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(runDirOf(dataRoot, workspace, runId), CANVAS_FILE), "utf-8"));
    return raw?.layout && typeof raw.layout === "object" ? raw.layout : {};
  } catch {
    return {};
  }
}

/** Map a project's verdict + workflow-lane state to a coarse gate status. */
function gateStatus(verdict: string | null, laneStatus: string | null): string {
  if (verdict === "ship") return "pass";
  if (verdict === "blocked") return "blocked";
  if (laneStatus === "blocked") return "blocked";
  if (laneStatus === "waiting") return "waiting";
  if (verdict === "repair") return "pending";
  return verdict ? "pending" : "pending";
}

/**
 * Build the run graph, or null when the run doesn't resolve. Emits only the
 * nodes that have backing state; edges follow artifact/provenance flow.
 */
export function buildRunGraph(dataRoot: string, workspace: string, runId: string): RunGraph {
  const summary = summarizeRun(dataRoot, workspace, runId);
  if (!summary) return null;
  const spine = readRunSpine(dataRoot, workspace, runId);

  const nodes: RunGraphNode[] = [];
  const edges: RunGraphEdge[] = [];
  const add = (n: RunGraphNode) => { nodes.push(n); return n.id; };

  // ── Spine (only the inputs that exist), connected in order ────────────────
  const spineIds: string[] = [];
  if (spine.brief) spineIds.push(add({ id: "source", type: "source", layer: LAYER.source, label: spine.brief.slice(0, 36) || "brief", detail: "campaign brief" }));
  if (spine.intelligencePackPath) spineIds.push(add({ id: "research", type: "research", layer: LAYER.research, label: "research", detail: spine.intelligencePackPath }));
  if (spine.strategyPath) spineIds.push(add({ id: "strategy", type: "strategy", layer: LAYER.strategy, label: "strategy", detail: spine.strategyPath }));
  if (spine.workflow) spineIds.push(add({ id: "template", type: "template", layer: LAYER.template, label: spine.workflow, detail: "workflow / pipeline" }));
  if (spine.batchId) spineIds.push(add({ id: "batch", type: "batch", layer: LAYER.batch, label: spine.batchId, detail: "batch fan-out" }));
  for (let i = 0; i < spineIds.length - 1; i++) edges.push({ from: spineIds[i], to: spineIds[i + 1] });
  const spineTail = spineIds.length ? spineIds[spineIds.length - 1] : null;

  // ── Member projects + their gate / repair / unit sub-nodes ────────────────
  const verdictByProject = new Map(summary.quality.map((q) => [q.project, q.verdict]));
  const phaseByProject = new Map(summary.progress.byProject.map((p) => [p.project, p.phase]));
  const spendByProject = new Map(summary.budget.byProject.map((p) => [p.project, p.spentUsd]));
  const unitsByProject = new Map(summary.units.byProject.map((u) => [u.project, u.slugs]));
  const approvalProjects = new Set(summary.awaitingApprovals.map((a) => a.project).filter(Boolean) as string[]);
  const resolved = summary.progress.byProject.map((p) => p.project);

  for (const pid of resolved) {
    const verdict = verdictByProject.get(pid) ?? null;
    const lane = readWorkflowLane(dataRoot, workspace, pid);
    const cur = lane && lane.currentStep ? lane.steps.find((s) => s.id === lane.currentStep) : null;
    const laneStatus = cur ? cur.status : null;
    let artifactCount = 0;
    try { artifactCount = listArtifacts(dataRoot, workspace, pid).length; } catch { /* race */ }

    const projId = add({
      id: `project:${pid}`,
      type: "project",
      layer: LAYER.project,
      label: pid,
      verdict,
      status: verdict === "ship" ? "pass" : laneStatus ?? (verdict ?? "pending"),
      cost: spendByProject.get(pid) ?? 0,
      count: artifactCount,
      approvalNeeded: approvalProjects.has(pid),
      detail: phaseByProject.get(pid) ?? null ? `phase ${phaseByProject.get(pid)}` : undefined,
      project: pid,
    });
    if (spineTail) edges.push({ from: spineTail, to: projId });

    // Gate node — the quality bar this project sits behind.
    const gStatus = gateStatus(verdict, laneStatus);
    const gateId = add({
      id: `gate:${pid}`,
      type: "gate",
      layer: LAYER.gate,
      label: cur && cur.gate.length ? cur.gate.join(", ") : "gate",
      verdict,
      status: gStatus,
      approvalNeeded: gStatus === "waiting",
      project: pid,
    });
    edges.push({ from: projId, to: gateId });

    // Repair node — only when the project needs a fix pass.
    let upstreamForUnit = gateId;
    if (verdict === "repair" || verdict === "blocked" || gStatus === "blocked") {
      const repairId = add({ id: `repair:${pid}`, type: "repair", layer: LAYER.repair, label: "repair", status: "pending", project: pid });
      edges.push({ from: gateId, to: repairId });
      upstreamForUnit = repairId;
    }

    // Unit nodes — the packaged deliverables.
    for (const slug of unitsByProject.get(pid) ?? []) {
      const unitId = add({ id: `unit:${pid}/${slug}`, type: "unit", layer: LAYER.unit, label: slug, status: "ready", project: pid });
      edges.push({ from: upstreamForUnit, to: unitId });
    }
  }

  // ── Destinations — from run-scoped annotations of type "destination" ──────
  const destAnnotations = readAnnotations({ kind: "run", dataRoot, workspace, id: runId }).filter((a) => a.target.type === "destination");
  const destRefs = [...new Set(destAnnotations.map((a) => a.target.ref))];
  if (destRefs.length) {
    const unitNodeIds = nodes.filter((n) => n.type === "unit").map((n) => n.id);
    const projectNodeIds = nodes.filter((n) => n.type === "project").map((n) => n.id);
    for (const ref of destRefs) {
      const destId = add({ id: `destination:${ref}`, type: "destination", layer: LAYER.destination, label: ref, detail: "publish destination" });
      const upstream = unitNodeIds.length ? unitNodeIds : projectNodeIds;
      for (const u of upstream) edges.push({ from: u, to: destId });
    }
  }

  return {
    run: summary.id,
    workspace,
    title: summary.title,
    status: summary.status,
    nextAction: summary.nextAction,
    nodes,
    edges,
    layout: readCanvasLayout(dataRoot, workspace, runId),
  };
}

/**
 * Persist a node's canvas position to the run's canvas.json (run-scoped
 * METADATA, never touches media — mirrors writeBoardLayout). Returns {ok} or
 * {error}.
 */
export function writeRunCanvasLayout(
  dataRoot: string,
  workspace: string,
  runId: string,
  node: string,
  x: number,
  y: number,
): { ok: true } | { error: string } {
  if (!node || typeof node !== "string") return { error: "bad node id" };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "bad coordinates" };
  const dir = runDirOf(dataRoot, workspace, runId);
  if (!fs.existsSync(dir)) return { error: "unknown run" };
  let data: { version: number; layout: Record<string, { x: number; y: number }> };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, CANVAS_FILE), "utf-8"));
    data = { version: 1, layout: raw?.layout && typeof raw.layout === "object" ? raw.layout : {} };
  } catch {
    data = { version: 1, layout: {} };
  }
  data.layout[node] = { x, y };
  fs.writeFileSync(path.join(dir, CANVAS_FILE), JSON.stringify(data, null, 2) + "\n");
  return { ok: true };
}
