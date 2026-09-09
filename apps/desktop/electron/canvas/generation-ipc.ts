import { constants } from "node:fs";
import { copyFile, open } from "node:fs/promises";
import { basename, join } from "node:path";
import { GENERATION_CANVAS_ID } from "../../shared/generation-studio";
import { canvasId, type CanvasAsset } from "../../shared/workflow-canvas";
import { guardedAtomicWrite } from "../media/atomic-write";
import { MEDIA_CHANNELS } from "../media/types";
import { loadGenerationCatalog } from "./generation-catalog";
import { loadGenerationVoices } from "./generation-voices";
import { generationRevision, generationSnapshot, parseGenerationDraft, preflightGeneration, validateGenerationDraft } from "./generation-draft";
import { createCanvasRuntime, type RuntimeDependencies } from "./runtime";
import { canvasAssetMime, runtimeDirectory, validateCanvasAsset } from "./runtime-files";

const DRAFT_BYTES = 1_048_576;
const draftPath = async (runtime: RuntimeDependencies) => join(await runtimeDirectory(runtime.root, runtime.workspaceId, "generation"), "draft.json");

export function registerGenerationIpc(deps: {
  handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void;
  capture(workspaceId: string): Promise<RuntimeDependencies>;
  fetcher: typeof fetch;
  chooseExport(name: string): Promise<string | null>;
}) {
  const capture = (workspaceId: unknown) => deps.capture(canvasId(workspaceId));
  const saves = new Map<string, Promise<unknown>>();
  const assetFile = async (runtime: RuntimeDependencies, value: unknown) => {
    const asset = value as CanvasAsset;
    if (!asset || typeof asset.path !== "string" || typeof asset.name !== "string" || !["image", "video", "audio"].includes(asset.kind)) throw new Error("Choose a generated media file");
    const checked = await validateCanvasAsset(runtime.root, asset, runtime.workspaceId);
    if (!canvasAssetMime(checked.path)?.startsWith(`${asset.kind}/`)) throw new Error("The file does not match its media type");
    runtime.assertCurrent();
    return checked.path;
  };
  deps.handle(MEDIA_CHANNELS.loadGenerationCatalog, async (workspaceId) => {
    const runtime = await capture(workspaceId);
    const catalog = await loadGenerationCatalog(runtime.cli, deps.fetcher);
    runtime.assertCurrent();
    return catalog;
  });
  deps.handle(MEDIA_CHANNELS.loadGenerationVoices, async (workspaceId) => {
    const runtime = await capture(workspaceId);
    const voices = await loadGenerationVoices(runtime.cli);
    runtime.assertCurrent();
    return voices;
  });
  deps.handle(MEDIA_CHANNELS.loadGenerationDraft, async (workspaceId) => {
    const runtime = await capture(workspaceId);
    await saves.get(canvasId(workspaceId))?.catch(() => undefined);
    runtime.assertCurrent();
    const path = await draftPath(runtime);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (!handle) { runtime.assertCurrent(); return null; }
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > DRAFT_BYTES) throw new Error("Invalid saved generation draft");
      const draft = parseGenerationDraft(JSON.parse(await handle.readFile("utf8")));
      runtime.assertCurrent();
      return draft;
    } finally { await handle.close(); }
  });
  deps.handle(MEDIA_CHANNELS.saveGenerationDraft, (workspaceId, value) => {
    const id = canvasId(workspaceId), draft = parseGenerationDraft(value);
    // Capture the root now; queued saves must never move into a subsequently selected root.
    const captured = capture(id);
    void captured.catch(() => undefined);
    const pending = (saves.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const runtime = await captured;
      runtime.assertCurrent();
      await guardedAtomicWrite(await draftPath(runtime), `${JSON.stringify(draft)}\n`, { maxBytes: DRAFT_BYTES, assertCurrent: runtime.assertCurrent });
    });
    saves.set(id, pending);
    return pending.finally(() => { if (saves.get(id) === pending) saves.delete(id); });
  });
  deps.handle(MEDIA_CHANNELS.startGeneration, async (workspaceId, value, mode) => {
    if (mode !== "preview" && mode !== "execute") throw new Error("Choose preview or generate");
    const runtime = await capture(workspaceId), parsed = parseGenerationDraft(value);
    const catalog = await loadGenerationCatalog(runtime.cli, deps.fetcher);
    const model = catalog.models.find((item) => item.id === parsed.modelId && item.provider === parsed.provider && item.kind === parsed.kind);
    if (!model) throw new Error("Choose a model from the current catalog");
    const draft = validateGenerationDraft(parsed, model, mode);
    for (const item of draft.inputs) await assetFile(runtime, item.asset);
    await preflightGeneration(runtime.cli, draft);
    runtime.assertCurrent();
    return createCanvasRuntime(runtime).startSnapshot(generationSnapshot(draft, model.name), { mode, expectedRevision: generationRevision(draft), nodeId: "generation" });
  });
  deps.handle(MEDIA_CHANNELS.loadGenerationRuns, async (workspaceId) => {
    const runtime = await capture(workspaceId);
    const runs = await createCanvasRuntime(runtime).list(GENERATION_CANVAS_ID);
    runtime.assertCurrent();
    return runs;
  });
  deps.handle(MEDIA_CHANNELS.cancelGenerationRun, async (workspaceId, value) => {
    const runtime = await capture(workspaceId), id = canvasId(value), engine = createCanvasRuntime(runtime);
    if (!(await engine.list(GENERATION_CANVAS_ID)).some((run) => run.id === id)) throw new Error("This generation is no longer available");
    runtime.assertCurrent();
    return engine.cancel(id);
  });
  deps.handle(MEDIA_CHANNELS.exportGenerationAsset, async (workspaceId, value) => {
    const runtime = await capture(workspaceId);
    await assetFile(runtime, value);
    const destination = await deps.chooseExport(basename((value as CanvasAsset).name));
    runtime.assertCurrent();
    if (!destination) return false;
    await copyFile(await assetFile(runtime, value), destination);
    return true;
  });
}
