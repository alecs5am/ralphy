import type { CanvasRuntimeBridge } from "../../../shared/canvas-runtime";
import { mockCanvasRuntime } from "./mock-canvas-runtime";
import { parseCanvas, type CanvasBridge, type SavedCanvas } from "../../../shared/workflow-canvas";

export function mockCanvasSurfaces(): CanvasBridge & CanvasRuntimeBridge {
  const stores = new Map<string, SavedCanvas[]>();
  return {
    ...mockCanvasRuntime(),
    async loadCanvases(workspaceId) { return structuredClone(stores.get(workspaceId) ?? []); },
    async saveCanvas(workspaceId, input, expectedRevision) {
      const canvas = parseCanvas(input);
      const current = stores.get(workspaceId) ?? [];
      const previous = current.find((saved) => saved.canvas.id === canvas.id);
      if ((previous?.revision ?? null) !== expectedRevision) throw new Error("Canvas changed. Reload before saving.");
      const saved = { canvas, revision: crypto.randomUUID(), path: `/mock/canvases/${workspaceId}/${canvas.id}.json` };
      stores.set(workspaceId, [...current.filter((item) => item.canvas.id !== canvas.id), saved]);
      return structuredClone(saved);
    },
  };
}
