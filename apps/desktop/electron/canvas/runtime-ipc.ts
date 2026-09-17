import type { CanvasAsset } from "../../shared/workflow-canvas";
import { isAbsolute } from "node:path";
import { canvasId } from "../../shared/workflow-canvas";
import type { CanvasRunOptions, CanvasHistoryQuery } from "../../shared/canvas-runtime";
import { MEDIA_CHANNELS } from "../media/types";
import { createCanvasRuntime, type RuntimeDependencies } from "./runtime";
import { canvasAssetMime, importCanvasFile, validateCanvasAsset } from "./runtime-files";
import { loadCanvasModelCatalog } from "./runtime-catalog";
import { registerGenerationIpc } from "./generation-ipc";

export function registerCanvasRuntimeIpc(deps: {
  handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void;
  capture(workspaceId: string): Promise<RuntimeDependencies>;
  chooseFile(): Promise<string | null>;
  fetcher: typeof fetch;
  chooseExport(name: string): Promise<string | null>;
}) {
  registerGenerationIpc(deps);
  const capture = (workspaceId: unknown) => deps.capture(canvasId(workspaceId));
  deps.handle(MEDIA_CHANNELS.loadCanvasModels, async (workspaceId) => {
    const runtime = await capture(workspaceId);
    const catalog = await loadCanvasModelCatalog(runtime.cli, deps.fetcher);
    runtime.assertCurrent();
    return catalog;
  });
  deps.handle(MEDIA_CHANNELS.importCanvasAsset, async (workspaceId, droppedPath) => {
    const runtime = await capture(workspaceId);
    if (droppedPath !== undefined && (typeof droppedPath !== "string" || !isAbsolute(droppedPath) || droppedPath.length > 4096 || droppedPath.includes("\0"))) throw new Error("Invalid dropped file");
    const path = typeof droppedPath === "string" ? droppedPath : await deps.chooseFile();
    runtime.assertCurrent();
    if (!path) return null;
    const asset = await importCanvasFile(runtime.root, runtime.workspaceId, path);
    runtime.assertCurrent();
    return asset;
  });
  deps.handle(MEDIA_CHANNELS.loadCanvasAssetPreview, async (workspaceId, value) => {
    const runtime = await capture(workspaceId);
    const asset = value as CanvasAsset;
    if (!asset || typeof asset.path !== "string" || typeof asset.name !== "string" || !["text", "image", "video", "audio"].includes(asset.kind)) throw new Error("Invalid canvas asset");
    const file = await validateCanvasAsset(runtime.root, asset, runtime.workspaceId);
    const mime = canvasAssetMime(file.path);
    if (!mime) return null;
    const preview = await runtime.mint(file.path, mime, file.bytes);
    runtime.assertCurrent();
    return preview.url;
  });
  deps.handle(MEDIA_CHANNELS.startCanvasRun, async (workspaceId, canvas, options) => createCanvasRuntime(await capture(workspaceId)).start(canvasId(canvas), options as CanvasRunOptions));
  deps.handle(MEDIA_CHANNELS.loadCanvasRuns, async (workspaceId, canvas, query) => createCanvasRuntime(await capture(workspaceId)).list(canvasId(canvas), query as CanvasHistoryQuery | undefined));
  deps.handle(MEDIA_CHANNELS.cancelCanvasRun, async (workspaceId, run) => createCanvasRuntime(await capture(workspaceId)).cancel(canvasId(run)));
}
