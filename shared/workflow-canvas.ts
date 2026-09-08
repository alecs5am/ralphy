import { connectionProblem } from "./canvas-ports";

export const CANVAS_KINDS = ["prompt", "media", "model", "connector", "variation", "output", "note", "step"] as const;
export type CanvasNodeKind = (typeof CANVAS_KINDS)[number];
export type CanvasMediaKind = "text" | "image" | "video" | "audio";
export interface CanvasAsset { path: string; name: string; kind: CanvasMediaKind }
export interface CanvasNodeConfig {
  provider?: string;
  modelId?: string;
  modality?: CanvasMediaKind;
  operation?: string;
  parameters?: Record<string, string | number | boolean>;
  variants?: number;
  asset?: CanvasAsset;
  selectedResultId?: string;
}
export interface CanvasNode { id: string; kind: CanvasNodeKind; title: string; value: string; x: number; y: number; width?: number; locked?: boolean; config?: CanvasNodeConfig }
export interface CanvasEdge { from: string; to: string; sourcePort?: string; targetPort?: string }
export interface CanvasViewport { x: number; y: number; zoom: number }
export interface WorkflowCanvas { version: 1 | 2; id: string; name: string; mode?: "board" | "workflow"; nodes: CanvasNode[]; edges: CanvasEdge[]; viewport?: CanvasViewport }
export interface SavedCanvas { canvas: WorkflowCanvas; revision: string; path: string }
export interface CanvasBridge {
  loadCanvases(workspaceId: string): Promise<SavedCanvas[]>;
  saveCanvas(workspaceId: string, canvas: WorkflowCanvas, expectedRevision: string | null): Promise<SavedCanvas>;
}
export const CANVAS_LIMIT = 100;
export const CANVAS_BYTES = 1_048_576;
/** Writers must mkdir this directory exclusively before reading/editing, then rmdir in finally. */
export const CANVAS_WRITE_LOCK = ".write-lock";
export const CANVAS_NODE_WIDTH = 304;
export const CANVAS_NODE_HEIGHT = 280;
export const CANVAS_NODE_MIN_WIDTH = 240;
export const CANVAS_NODE_MAX_WIDTH = 960;
export const CANVAS_EXTENT = 100_000;

export function canvasId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error("Invalid canvas or workspace identifier");
  return value;
}

function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
const mediaKinds = ["text", "image", "video", "audio"];
function configuration(input: unknown): CanvasNodeConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid node settings");
  const value = input as CanvasNodeConfig;
  const result: CanvasNodeConfig = {};
  for (const key of ["provider", "modelId", "operation", "selectedResultId"] as const) {
    if (value[key] !== undefined) {
      if (!text(value[key], 512) || value[key]!.includes("\0")) throw new Error("Invalid node setting");
      result[key] = value[key];
    }
  }
  if (value.modality !== undefined) {
    if (!mediaKinds.includes(value.modality)) throw new Error("Invalid media type");
    result.modality = value.modality;
  }
  if (value.variants !== undefined) {
    if (!Number.isInteger(value.variants) || value.variants < 1 || value.variants > 4) throw new Error("Choose between 1 and 4 variations");
    result.variants = value.variants;
  }
  if (value.parameters !== undefined) {
    if (!value.parameters || typeof value.parameters !== "object" || Array.isArray(value.parameters) || Object.keys(value.parameters).length > 32) throw new Error("Invalid model parameters");
    result.parameters = Object.fromEntries(Object.entries(value.parameters).map(([key, entry]) => {
      if (!/^[a-zA-Z][\w.-]{0,79}$/.test(key) || /api.?key|authorization|access.?token|secret|password/i.test(key)) throw new Error("Credentials belong in provider settings, not in a canvas");
      if (!(text(entry, 20_000) || typeof entry === "boolean" || typeof entry === "number" && Number.isFinite(entry))) throw new Error("Invalid model parameter");
      return [key, entry];
    }));
  }
  if (value.asset !== undefined) {
    const asset = value.asset;
    if (!asset || !text(asset.path, 4096) || !asset.path.startsWith("/") || asset.path.includes("\0") || !text(asset.name, 240) || !mediaKinds.includes(asset.kind)) throw new Error("Invalid canvas media reference");
    result.asset = { path: asset.path, name: asset.name, kind: asset.kind };
  }
  return result;
}

export function parseCanvas(input: unknown): WorkflowCanvas {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid canvas document");
  const value = input as WorkflowCanvas;
  canvasId(value.id);
  if (![1, 2].includes(value.version) || !text(value.name, 160) || !value.name.trim()
    || !Array.isArray(value.nodes) || value.nodes.length > CANVAS_LIMIT
    || !Array.isArray(value.edges) || value.edges.length > CANVAS_LIMIT * 4) throw new Error("Invalid canvas document");
  const ids = new Set<string>();
  const nodes = value.nodes.map((node) => {
    if (!node || typeof node !== "object") throw new Error("Invalid canvas node");
    const id = canvasId(node.id);
    if (ids.has(id) || !CANVAS_KINDS.includes(node.kind) || !text(node.title, 160) || !text(node.value, 20_000)
      || ![node.x, node.y].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= CANVAS_EXTENT)) throw new Error("Invalid canvas node");
    ids.add(id);
    if (node.width !== undefined && (!Number.isFinite(node.width) || node.width < CANVAS_NODE_MIN_WIDTH || node.width > CANVAS_NODE_MAX_WIDTH)) throw new Error("Invalid node width");
    if (node.locked !== undefined && typeof node.locked !== "boolean") throw new Error("Invalid node lock");
    return { id, kind: node.kind, title: node.title, value: node.value, x: node.x, y: node.y, ...(node.width === undefined ? {} : { width: node.width }), ...(node.locked === undefined ? {} : { locked: node.locked }), ...(node.config === undefined ? {} : { config: configuration(node.config) }) };
  });
  const connections = new Set<string>();
  const edges = value.edges.map((edge) => {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) throw new Error("Invalid canvas connection");
    for (const port of [edge.sourcePort, edge.targetPort]) if (port !== undefined && (!text(port, 80) || !/^[\w-]+$/.test(port))) throw new Error("Invalid canvas port");
    const key = `${edge.from}:${edge.sourcePort ?? ""}:${edge.to}:${edge.targetPort ?? ""}`;
    if (connections.has(key)) throw new Error("Duplicate canvas connection");
    connections.add(key);
    return { from: edge.from, to: edge.to, ...(edge.sourcePort ? { sourcePort: edge.sourcePort } : {}), ...(edge.targetPort ? { targetPort: edge.targetPort } : {}) };
  });
  const canvas: WorkflowCanvas = { version: value.version, id: value.id, name: value.name, nodes, edges };
  if (value.mode !== undefined) {
    if (value.mode !== "board" && value.mode !== "workflow") throw new Error("Invalid canvas mode");
    canvas.mode = value.mode;
  }
  if (value.viewport !== undefined) {
    const view = value.viewport;
    if (!view || ![view.x, view.y, view.zoom].every((number) => typeof number === "number" && Number.isFinite(number)) || Math.abs(view.x) > CANVAS_EXTENT || Math.abs(view.y) > CANVAS_EXTENT || view.zoom < 0.1 || view.zoom > 2) throw new Error("Invalid canvas viewport");
    canvas.viewport = { x: view.x, y: view.y, zoom: view.zoom };
  }
  canvasOrder(canvas);
  for (const edge of edges) {
    if (value.version === 1 && !edge.sourcePort && !edge.targetPort) continue;
    const problem = connectionProblem({ ...canvas, edges: edges.filter((item) => item !== edge) }, edge);
    if (problem) throw new Error(problem);
  }
  return canvas;
}

export function canvasOrder(canvas: WorkflowCanvas): CanvasNode[] {
  const pending = new Map(canvas.nodes.map((node) => [node.id, node]));
  const ordered: CanvasNode[] = [];
  // ponytail: bounded at 100 nodes; use adjacency lists if canvases outgrow this limit.
  while (pending.size) {
    const ready = [...pending.values()].filter((node) => !canvas.edges.some((edge) => edge.to === node.id && pending.has(edge.from)));
    if (!ready.length) throw new Error("Canvas connections cannot contain a cycle");
    for (const node of ready) { ordered.push(node); pending.delete(node.id); }
  }
  return ordered;
}

export function selectedCanvasNodes(canvas: WorkflowCanvas, nodeId?: string, reuseResults = true): CanvasNode[] {
  if (canvas.mode === "board" && !nodeId) return [];
  if (nodeId && !canvas.nodes.some((node) => node.id === nodeId)) throw new Error("Canvas node no longer exists");
  const selected = new Set(nodeId ? [nodeId] : canvas.nodes.filter((node) => node.kind === "output").map((node) => node.id));
  for (const node of [...canvasOrder(canvas)].reverse()) if (selected.has(node.id)) {
    if (reuseResults && node.kind === "variation" && node.config?.selectedResultId) continue;
    for (const edge of canvas.edges.filter((edge) => edge.to === node.id)) selected.add(edge.from);
  }
  return canvasOrder(canvas).filter((node) => selected.has(node.id) && node.kind !== "note");
}
