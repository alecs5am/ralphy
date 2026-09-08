import { CANVAS_NODE_WIDTH, type CanvasNode } from "../../../../shared/workflow-canvas";

export function canvasNodeWidth(node: CanvasNode): number {
  return node.width ?? (node.config?.modality === "video" || node.config?.asset?.kind === "video" ? 400 : CANVAS_NODE_WIDTH);
}

export function canvasNodeAspect(node: CanvasNode): number {
  const value = String(node.config?.parameters?.aspectRatio ?? "");
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value);
  if (match && +match[1]! > 0 && +match[2]! > 0) return Math.max(.4, Math.min(2.5, +match[1]! / +match[2]!));
  if (node.kind === "prompt" || node.kind === "note" || node.kind === "step" || node.kind === "connector") return 1.4;
  const kind = node.config?.asset?.kind ?? node.config?.modality;
  return kind === "video" ? 16 / 9 : kind === "audio" ? 1.5 : 1;
}

export function canvasNodeHeight(node: CanvasNode): number {
  return canvasNodeWidth(node) / canvasNodeAspect(node);
}
