import { CANVAS_EXTENT, CANVAS_LIMIT, CANVAS_NODE_WIDTH, CANVAS_WRITE_LOCK, canvasOrder, type CanvasMediaKind, type CanvasNode, type CanvasNodeKind, type SavedCanvas, type WorkflowCanvas } from "../../../../shared/workflow-canvas";
import { canvasNodeHeight, canvasNodeWidth } from "./node-layout";
export { canvasNodeHeight } from "./node-layout";

export const NODE_LABELS: Record<CanvasNodeKind, string> = { prompt: "Prompt", media: "Media", model: "Model", connector: "Connector", variation: "Variations", output: "Output", note: "Note", step: "Pipeline step" };
export type CanvasTemplate = "blank" | "image" | "video" | "comparison" | "idea";
export interface CanvasEditOptions { coalesceKey?: string }
export interface CanvasHistory { past: WorkflowCanvas[]; future: WorkflowCanvas[]; key?: string; editedAt: number }
export const createCanvasHistory = (): CanvasHistory => ({ past: [], future: [], editedAt: 0 });

export function recordCanvasEdit(history: CanvasHistory, previous: WorkflowCanvas, options: CanvasEditOptions = {}, now = Date.now()): void {
  if (!options.coalesceKey || history.key !== options.coalesceKey || now - history.editedAt > 600 || history.future.length) {
    history.past.push(structuredClone(previous));
    if (history.past.length > 40) history.past.shift();
  }
  history.future = [];
  history.key = options.coalesceKey;
  history.editedAt = now;
}

export function moveCanvasHistory(history: CanvasHistory, current: WorkflowCanvas, direction: "undo" | "redo"): WorkflowCanvas | null {
  const source = direction === "undo" ? history.past : history.future;
  const target = direction === "undo" ? history.future : history.past;
  const next = source.pop();
  if (!next) return null;
  target.push(structuredClone(current));
  if (target.length > 40) target.shift();
  history.key = undefined;
  return next;
}

export function newCanvasNode(kind: CanvasNodeKind, position = { x: 80, y: 80 }, modality: CanvasMediaKind = "image"): CanvasNode {
  const node: CanvasNode = { id: crypto.randomUUID(), kind, title: NODE_LABELS[kind], value: "", x: Math.max(-CANVAS_EXTENT, Math.min(CANVAS_EXTENT, position.x)), y: Math.max(-CANVAS_EXTENT, Math.min(CANVAS_EXTENT, position.y)) };
  if (kind === "model") node.config = { modality, variants: 1 };
  if (kind === "media" || kind === "output") node.config = { modality };
  if (kind === "variation") node.config = { variants: 3 };
  if (kind === "connector") node.config = { operation: "collect" };
  return node;
}

export function arrangeCanvas(canvas: WorkflowCanvas, heights: ReadonlyMap<string, number> = new Map()): WorkflowCanvas {
  const columns = new Map<string, number>();
  const offsets = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  const widths = new Map<number, number>();
  for (const node of canvasOrder(canvas)) {
    const column = Math.max(0, ...canvas.edges.filter((edge) => edge.to === node.id).map((edge) => (columns.get(edge.from) ?? 0) + 1));
    columns.set(node.id, column);
    widths.set(column, Math.max(widths.get(column) ?? CANVAS_NODE_WIDTH, canvasNodeWidth(node)));
    const y = offsets.get(column) ?? 80;
    positions.set(node.id, { x: 0, y });
    offsets.set(column, y + (heights.get(node.id) ?? canvasNodeHeight(node)) + 140);
  }
  const left = new Map<number, number>();
  let x = 80;
  for (let column = 0; column < widths.size; column++) { left.set(column, x); x += widths.get(column)! + 120; }
  return { ...canvas, nodes: canvas.nodes.map((node) => node.locked ? node : ({ ...node, ...positions.get(node.id)!, x: left.get(columns.get(node.id)!)! })) };
}

export function duplicateCanvasNodes(canvas: WorkflowCanvas, ids: readonly string[]): WorkflowCanvas {
  const selected = new Set(ids);
  const originals = canvas.nodes.filter((node) => selected.has(node.id));
  if (canvas.nodes.length + originals.length > CANVAS_LIMIT) throw new Error(`A canvas supports up to ${CANVAS_LIMIT} nodes`);
  const mapping = new Map(originals.map((node) => [node.id, crypto.randomUUID()]));
  const nodes = originals.map((node) => ({ ...structuredClone(node), id: mapping.get(node.id)!, x: Math.min(CANVAS_EXTENT, node.x + 48), y: Math.min(CANVAS_EXTENT, node.y + 48) }));
  const edges = canvas.edges.filter((edge) => mapping.has(edge.from) && mapping.has(edge.to)).map((edge) => ({ ...edge, from: mapping.get(edge.from)!, to: mapping.get(edge.to)! }));
  if (canvas.edges.length + edges.length > CANVAS_LIMIT * 4) throw new Error("Duplicating these nodes would exceed the connection limit");
  return { ...canvas, nodes: [...canvas.nodes, ...nodes], edges: [...canvas.edges, ...edges] };
}

export function copyCanvas(canvas: WorkflowCanvas): WorkflowCanvas {
  const mapping = new Map(canvas.nodes.map((node) => [node.id, crypto.randomUUID()]));
  return { ...structuredClone(canvas), id: crypto.randomUUID(), name: `${canvas.name.slice(0, 153)} (copy)`, nodes: canvas.nodes.map((node) => ({ ...structuredClone(node), id: mapping.get(node.id)! })), edges: canvas.edges.map((edge) => ({ ...edge, from: mapping.get(edge.from)!, to: mapping.get(edge.to)! })) };
}

export function newCanvas(template: CanvasTemplate): WorkflowCanvas {
  const canvas: WorkflowCanvas = { version: 2, id: crypto.randomUUID(), name: { blank: "Untitled canvas", image: "Image concept", video: "Video pipeline", comparison: "Model comparison", idea: "Idea to image" }[template], nodes: [], edges: [] };
  if (template === "blank") return { ...canvas, mode: "board" };
  const add = (kind: CanvasNodeKind, title: string, value = "", modality: CanvasMediaKind = "image") => {
    const node = { ...newCanvasNode(kind, undefined, modality), title, value };
    canvas.nodes.push(node);
    return node;
  };
  const connect = (from: CanvasNode, to: CanvasNode, sourcePort: string, targetPort: string) => canvas.edges.push({ from: from.id, to: to.id, sourcePort, targetPort });
  const brief = add("prompt", template === "video" ? "Story & script" : "Creative brief", "Describe the subject, audience and visual direction.");
  const model = add("model", template === "video" ? "Video model" : "Image model", "", template === "video" ? "video" : "image");
  if (template === "idea") {
    brief.title = "Base idea";
    brief.value = "Turn this idea into one detailed image-generation prompt in English, under 120 words. Specify composition, material, lighting and palette. Return only the final prompt, without headings or quotation marks.\n\nIdea: A quiet landscape made from folded indigo paper, a tiny warm sun, soft studio shadows.";
    const writer = add("model", "Prompt writer", "", "text");
    connect(brief, writer, "text", "prompt");
    connect(writer, model, "result", "prompt");
  } else connect(brief, model, "text", "prompt");
  if (template === "video") {
    const reference = add("media", "Start frame", "Attach a starting image, or remove this node to run without a reference.");
    connect(reference, model, "media", "reference");
    const step = add("connector", "Review clip", "Pass the generated clip to the output.");
    connect(model, step, "result", "input");
    connect(step, add("output", "Final video", "Generated video will appear after a successful run.", "video"), "result", "input");
  } else {
    const review = add("variation", "Review & refine", "Compare actual results and choose a direction.");
    connect(model, review, "result", "input");
    if (template === "comparison") {
      const alternative = add("model", "Alternative image model");
      connect(brief, alternative, "text", "prompt");
      connect(alternative, review, "result", "input");
    }
    connect(review, add("output", "Final image", "Selected results appear here after generation."), "selected", "input");
  }
  return arrangeCanvas(canvas);
}

export function canvasAgentPrompt(saved: SavedCanvas, action: "edit" | "run"): string {
  const ordered = canvasOrder(saved.canvas);
  return [
    action === "edit" ? `Help me improve the working canvas “${saved.canvas.name}”.` : `Execute the workflow in “${saved.canvas.name}” using the connected models and Ralphy CLI.`,
    `Canvas file: ${saved.path}`,
    `Before reading or editing, acquire the workspace write lock by atomically creating the directory ${saved.path.slice(0, saved.path.lastIndexOf("/"))}/${CANVAS_WRITE_LOCK}. If it already exists, stop and retry later; never remove another writer's lock. Hold your lock while reading, validating, writing a temporary file and renaming it over the canvas. Remove only the lock you acquired in a finally block.`,
    "Read that JSON file first. The desktop accepts version 1 (legacy) and version 2 canvases with id, name, nodes, edges optional mode (board/workflow; absent means workflow) and viewport {x,y,zoom}. Board mode runs an explicitly chosen node and its dependencies; workflow runs branches leading to Output. Nodes have id, kind (prompt/media/model/connector/variation/output/note/step), title, value, x, y, optional width (240–960) and locked boolean, and optional config: provider, modelId, modality, operation, parameters, variants, asset {path,name,kind}, selectedResultId. Keep existing configs and credentials out of the document. Use only real configured model IDs and existing asset paths. Version 2 edges have from/to IDs and compatible sourcePort/targetPort IDs: prompt.text → model.prompt; media.media → model.reference or model.video according to media type; model.result → connector.input, variation.input or output.input; connector.result and variation.selected lead to compatible inputs. Notes have no ports. Preserve valid schema and acyclic connections; save atomically to the same path. Never invent generated outputs or mark a result selected without evidence. The desktop can reload your changes.",
    `Steps in dependency order:\n${ordered.map((node, index) => `${index + 1}. ${NODE_LABELS[node.kind]} — ${node.title}\n${node.value}`).join("\n\n")}`,
    action === "run" ? "Resolve model choices and missing inputs before running. Follow the Ralphy playbooks for every generation step. Report actual results and output paths; do not mark a step completed without evidence." : "Suggest useful improvements, then update the canvas as requested. Do not run paid generation while editing the plan.",
  ].join("\n\n");
}

export interface CanvasAgentRequest {
  prompt: string;
  attachment: { kind: "file"; ref: string; label: string; instructions: string };
}

export function canvasAgentRequest(saved: SavedCanvas, action: "edit" | "run"): CanvasAgentRequest {
  return {
    prompt: action === "run" ? `Run the workflow in “${saved.canvas.name}”. Resolve missing models and inputs with me first.` : `Help me improve the working canvas “${saved.canvas.name}”.`,
    attachment: { kind: "file", ref: saved.path, label: saved.canvas.name, instructions: canvasAgentPrompt(saved, action) },
  };
}
