import type { CanvasRuntimeBridge } from "../../../shared/canvas-runtime";

/** Browser previews never submit native or paid work. The real host supplies these methods. */
export function mockCanvasRuntime(): CanvasRuntimeBridge {
  const native = async (): Promise<never> => { throw new Error("Open the desktop app to use the native canvas runtime."); };
  return {
    loadCanvasModels: async () => ({ models: [], providers: [], errors: ["Native model discovery is available in the desktop app."] }),
    importCanvasAsset: native,
    loadCanvasAssetPreview: async () => null,
    startCanvasRun: native,
    loadCanvasRuns: async () => ({ items: [], nextCursor: null }),
    cancelCanvasRun: native,
  };
}
