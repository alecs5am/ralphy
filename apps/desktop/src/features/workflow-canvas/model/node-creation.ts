import { canvasNodePorts, connectionProblem } from "../../../../shared/canvas-ports";
import { CANVAS_EXTENT, type CanvasEdge, type CanvasMediaKind, type CanvasNode, type CanvasNodeKind, type WorkflowCanvas } from "../../../../shared/workflow-canvas";
import { canvasNodeWidth } from "./node-layout";
import { newCanvasNode } from "./canvas-editor";

export interface CanvasWireOrigin { nodeId: string; portId: string; direction: "input" | "output" }
export const CANVAS_CREATION_CHOICES = [
  { id: "prompt", kind: "prompt", label: "Prompt", modality: "text" },
  { id: "llm", kind: "model", label: "LLM assistant", modality: "text" },
  { id: "image", kind: "model", label: "Image generation", modality: "image" },
  { id: "video", kind: "model", label: "Video generation", modality: "video" },
  { id: "audio", kind: "model", label: "Audio generation", modality: "audio" },
  { id: "media", kind: "media", label: "Media reference", modality: "image" },
  { id: "connector", kind: "connector", label: "Connector" },
  { id: "variation", kind: "variation", label: "Variations" },
  { id: "output", kind: "output", label: "Output" },
  { id: "note", kind: "note", label: "Note" },
] as const satisfies readonly { id: string; kind: CanvasNodeKind; label: string; modality?: CanvasMediaKind }[];
export type CanvasCreationChoice = (typeof CANVAS_CREATION_CHOICES)[number];

export function createNodeFromChoice(choice: CanvasCreationChoice, position: { x: number; y: number }, direction?: CanvasWireOrigin["direction"]): CanvasNode {
  const node = { ...newCanvasNode(choice.kind, position, "modality" in choice ? choice.modality : undefined), title: choice.label };
  if (direction === "input") node.x = Math.max(-CANVAS_EXTENT, node.x - canvasNodeWidth(node) - 48);
  return node;
}

/** The same port validation governs the preview menu and the committed graph. */
export function connectionToNewNode(canvas: WorkflowCanvas, node: CanvasNode, origin: CanvasWireOrigin): CanvasEdge | null {
  const ports = canvasNodePorts(node);
  for (const port of origin.direction === "output" ? ports.inputs : ports.outputs) {
    const edge = origin.direction === "output"
      ? { from: origin.nodeId, sourcePort: origin.portId, to: node.id, targetPort: port.id }
      : { from: node.id, sourcePort: port.id, to: origin.nodeId, targetPort: origin.portId };
    if (!connectionProblem({ ...canvas, nodes: [...canvas.nodes, node] }, edge)) return edge;
  }
  return null;
}

/** A normal input has one owner; collection nodes deliberately accept multiple sources. */
export function connectCanvas(canvas: WorkflowCanvas, edge: CanvasEdge): WorkflowCanvas {
  const problem = connectionProblem(canvas, edge);
  if (problem) throw new Error(problem);
  const target = canvas.nodes.find((node) => node.id === edge.to)!;
  const firstPort = canvasNodePorts(target).inputs[0]?.id;
  const collection = target.kind === "connector" || target.kind === "variation";
  const edges = collection ? canvas.edges : canvas.edges.filter((item) => item.to !== edge.to || (item.targetPort ?? firstPort) !== (edge.targetPort ?? firstPort));
  return { ...canvas, edges: [...edges, edge] };
}
