import { selectedCanvasNodes, type WorkflowCanvas } from "./workflow-canvas";

export function canvasExecutionPlan(canvas: WorkflowCanvas) {
  const nodes = selectedCanvasNodes(canvas);
  const included = new Set(nodes.map((node) => node.id));
  const reachable = new Set(selectedCanvasNodes(canvas, undefined, false).map((node) => node.id));
  return {
    mode: canvas.mode ?? "workflow",
    nodes, included,
    outputs: canvas.nodes.filter((node) => node.kind === "output"),
    sources: nodes.filter((node) => node.kind === "variation" && node.config?.selectedResultId || !canvas.edges.some((edge) => edge.to === node.id && included.has(edge.from))),
    outside: canvas.mode === "board" ? [] : canvas.nodes.filter((node) => node.kind !== "note" && !reachable.has(node.id)),
    reused: canvas.nodes.filter((node) => reachable.has(node.id) && !included.has(node.id)),
  };
}
export type CanvasExecutionPlan = ReturnType<typeof canvasExecutionPlan>;
