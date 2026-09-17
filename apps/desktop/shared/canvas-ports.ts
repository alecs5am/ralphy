import type { CanvasEdge, CanvasMediaKind, CanvasNode, WorkflowCanvas } from "./workflow-canvas";

export type CanvasPortType = CanvasMediaKind | "any";
export interface CanvasPort { id: string; label: string; type: CanvasPortType }
export function canvasNodePorts(node: CanvasNode): { inputs: CanvasPort[]; outputs: CanvasPort[] } {
  const port = (id: string, label: string, type: CanvasPortType): CanvasPort => ({ id, label, type });
  const media = node.config?.asset?.kind ?? node.config?.modality ?? "image";
  switch (node.kind) {
    case "prompt": return { inputs: [], outputs: [port("text", "Prompt", "text")] };
    case "media": return { inputs: [], outputs: [port("media", media === "text" ? "Text" : "Media", media)] };
    case "note": return { inputs: [], outputs: [] };
    case "model": return { inputs: [port("prompt", "Prompt", "text"), ...(media === "image" || media === "video" ? [port("reference", media === "video" && node.config?.modelId !== "bytedance/seedance-2.0/reference-to-video" ? "Start frame" : "Reference", "image")] : []), ...(media === "video" && node.config?.provider !== "fal" ? [port("video", "Video reference", "video")] : [])], outputs: [port("result", "Result", media)] };
    case "output": return { inputs: [port("input", "Result", "any")], outputs: [] };
    case "connector": {
      const type = node.config?.operation === "join-text" ? "text" : "any";
      return { inputs: [port("input", "Input", type)], outputs: [port("result", "Output", type)] };
    }
    case "variation": return { inputs: [port("input", "Variations", "any")], outputs: [port("selected", "Selected", "any")] };
    case "step": return { inputs: [port("input", "Input", "any")], outputs: [port("result", "Output", "any")] };
  }
}

export function connectionProblem(canvas: WorkflowCanvas, edge: CanvasEdge): string | null {
  const from = canvas.nodes.find((node) => node.id === edge.from);
  const to = canvas.nodes.find((node) => node.id === edge.to);
  if (!from || !to) return "Both nodes must exist before connecting them";
  if (from.id === to.id) return "A node cannot connect to itself";
  const source = canvasNodePorts(from).outputs;
  const target = canvasNodePorts(to).inputs;
  const out = edge.sourcePort ? source.find((port) => port.id === edge.sourcePort) : source[0];
  const input = edge.targetPort ? target.find((port) => port.id === edge.targetPort) : target[0];
  if (!out || !input) return "This connection does not have a valid input and output port";
  if (out.type !== input.type && out.type !== "any" && input.type !== "any") return `Cannot connect ${out.type} to ${input.type}. Choose a compatible input.`;
  if (canvas.edges.some((item) => item.from === edge.from && item.to === edge.to && (item.sourcePort ?? source[0]?.id) === out.id && (item.targetPort ?? target[0]?.id) === input.id)) return "These ports are already connected";
  const pending = [to.id];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === from.id) return "Canvas connections cannot contain a cycle";
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...canvas.edges.filter((item) => item.from === id).map((item) => item.to));
  }
  return null;
}
