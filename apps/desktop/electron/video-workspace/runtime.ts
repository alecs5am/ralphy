import { constants } from "node:fs";
import { open, lstat, mkdir } from "node:fs/promises";
import { basename, extname, join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasRequest, CanvasPreview } from "../canvas/runtime-results";
import type { CanvasCli } from "../canvas/runtime-cli";
import { guardedAtomicWrite } from "../media/atomic-write";
import { prepareVideoUnitRevision } from "./unit-revision";
import { blankVideoComposition, videoHtml, VideoWorkspaceError, VIDEO_HISTORY_LIMIT, type VideoWorkspaceAsset, type VideoWorkspaceLoad, type VideoWorkspaceRef, type VideoWorkspaceRender } from "../../shared/video-workspace";
import { readVideoStore, readVideoText, safeVideoPath, videoDirectory, videoFiles, videoHash, videoMime, writeVideoStore, VIDEO_BYTES, type VideoStored } from "./store";

export interface VideoRuntime {
  root: string; request: CanvasRequest; cli: CanvasCli; mint: CanvasPreview; assertCurrent(): void;
}
const FILE_LIMIT = 1024 * 1024 * 1024;
const kindFor = (mime: string): VideoWorkspaceAsset["kind"] => mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : mime.startsWith("font/") ? "font" : "other";
const contextFor = (ref: VideoWorkspaceRef) => ({ workspaceId: ref.workspaceId, projectId: ref.projectId });
export async function copyVideoFile(source: string, destination: string): Promise<void> {
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await input.stat();
    if (!info.isFile() || info.size > FILE_LIMIT) throw new VideoWorkspaceError("Choose a regular media file under 1 GB");
    const output = await open(destination, "wx", 0o600);
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      let total = 0;
      for (;;) {
        const { bytesRead } = await input.read(buffer);
        if (!bytesRead) break;
        if ((total += bytesRead) > FILE_LIMIT) throw new VideoWorkspaceError("Media file exceeds 1 GB");
        let offset = 0;
        while (offset < bytesRead) offset += (await output.write(buffer, offset, bytesRead - offset)).bytesWritten;
      }
      await output.sync();
    } finally { await output.close(); }
  } finally { await input.close(); }
}
async function assetDirectory(directory: string): Promise<string> {
  const path = join(directory, "_ralphy_assets");
  await mkdir(path).catch((error) => { if (error.code !== "EEXIST") throw error; });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new VideoWorkspaceError("Invalid asset directory");
  return path;
}
async function availableCheckout(root: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  try { return await safeVideoPath(root, path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function assetsFor(runtime: VideoRuntime, directory: string, value: VideoStored): Promise<VideoWorkspaceAsset[]> {
  const rows = new Map<string, VideoWorkspaceAsset>(value.draft.assets.map((asset) => [asset.src, { ...asset, previewUrl: undefined, missing: true }]));
  const checkout = await availableCheckout(runtime.root, value.draft.checkoutPath);
  const sources = [{ directory, prefix: "_ralphy_assets" }, ...(checkout ? [{ directory: checkout, prefix: "" }] : [])];
  for (const source of sources) {
    await assetDirectory(directory);
    for (const src of await videoFiles(source.directory, source.prefix)) {
      const mime = videoMime(src);
      if (!mime || rows.has(src) && !rows.get(src)!.missing) continue;
      const path = await safeVideoPath(runtime.root, join(source.directory, src));
      const preview = await runtime.mint(path, mime, (await lstat(path)).size);
      rows.set(src, { src, name: rows.get(src)?.name ?? basename(src).replace(/^[0-9a-f-]{36}-/i, ""), kind: kindFor(mime), previewUrl: preview.url, missing: false });
    }
  }
  return [...rows.values()];
}
async function hydrate(runtime: VideoRuntime, ref: VideoWorkspaceRef, value: VideoStored, revision: string | null): Promise<VideoWorkspaceLoad> {
  const assets = await assetsFor(runtime, await videoDirectory(runtime.root, ref), value);
  const checkoutPath = await availableCheckout(runtime.root, value.draft.checkoutPath);
  const result: VideoWorkspaceLoad = { ...value, draftPath: join(await videoDirectory(runtime.root, ref), "draft.json"), draft: { ...value.draft, assets, checkoutPath,
    ...(!checkoutPath && value.draft.checkoutPath ? { sourceWarning: "The composition source folder is missing. Your saved edits are preserved. Restore the source folder to render again." } : {}),
  }, revision };
  if (result.render?.artifactRevisionId) {
    try {
      const artifact = await runtime.request("media.revision.show", { context: contextFor(ref), revisionId: result.render.artifactRevisionId });
      const locator = await runtime.request("locator.resolve", { context: contextFor(ref), target: { type: "object", id: artifact.objectId }, purpose: "preview" });
      result.render = { ...result.render, previewUrl: (await runtime.mint(locator.absolutePath, locator.mime, locator.bytes)).url };
    } catch { result.render = { ...result.render, previewUrl: undefined }; }
  }
  runtime.assertCurrent();
  return result;
}
export async function loadVideo(runtime: VideoRuntime, ref: VideoWorkspaceRef): Promise<VideoWorkspaceLoad> {
  const context = contextFor(ref);
  const unit = await runtime.request("unit.show", { context, unitId: ref.unitId });
  if (unit.projectId !== ref.projectId) throw new VideoWorkspaceError("Unit belongs to another project");
  const directory = await videoDirectory(runtime.root, ref);
  const saved = await readVideoStore(directory);
  if (saved) return hydrate(runtime, ref, saved.value, saved.revision);
  let html = blankVideoComposition(), checkoutPath: string | null = null, compositionRevisionId: string | null = null;
  let sourceKind: VideoStored["draft"]["sourceKind"] = "empty";
  let sourceWarning: string | undefined;
  if (unit.compositionId) {
    try {
    const composition = await runtime.request("composition.show", { context, compositionId: unit.compositionId });
    const latest = composition.latestRevisionId ? await runtime.request("composition.revision.show", { context, revisionId: composition.latestRevisionId }) : null;
    // Ralphy materializes draft revisions at tmp/<revision>/checkout. Reuse a live draft:
    // revising it would copy sealed sources and omit edits still in its checkout.
    if (latest && !/^[a-zA-Z0-9_-]+$/.test(latest.id)) throw new VideoWorkspaceError("Invalid composition revision");
    const checkout = latest?.state === "draft"
      ? { id: latest.id, checkoutPath: join(runtime.root, "tmp", latest.id, "checkout") }
      : await runtime.cli(["--project", ref.projectId, "composition", "revise", composition.id, "--expected", composition.latestRevisionId ?? "none", "--engine", "hyperframes"]) as { id?: string; checkoutPath?: string };
    if (!checkout.id || !checkout.checkoutPath) throw new VideoWorkspaceError("Installed runtime did not return an editable checkout");
    checkoutPath = await safeVideoPath(runtime.root, checkout.checkoutPath);
    compositionRevisionId = checkout.id;
    try { html = videoHtml(await readVideoText(await safeVideoPath(runtime.root, join(checkoutPath, "index.html")))); sourceKind = "composition"; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    } catch {
      checkoutPath = null; compositionRevisionId = null;
      sourceWarning = "The editable composition source is unavailable. Using the Unit’s original video; source layers and rendering need a valid composition checkout.";
    }
  }
  if (sourceKind !== "composition" && unit.latestRevisionId) {
    const items = await runtime.request("unit.items", { context, revisionId: unit.latestRevisionId, limit: 100 });
    let selected: { absolutePath: string; kind: "video" | "image" } | null = null;
    for (const item of items.items) {
      if (!item.artifactRevisionId) continue;
      const media = await runtime.request("media.revision.show", { context, revisionId: item.artifactRevisionId });
      const locator = await runtime.request("locator.resolve", { context, target: { type: "object", id: media.objectId }, purpose: "preview" });
      if (locator.mime?.startsWith("video/")) { selected = { absolutePath: locator.absolutePath, kind: "video" }; break; }
      if (!selected && locator.mime?.startsWith("image/")) selected = { absolutePath: locator.absolutePath, kind: "image" };
    }
    if (selected) {
      const filename = `original${extname(selected.absolutePath) || (selected.kind === "video" ? ".mp4" : ".png")}`;
      const path = join(await assetDirectory(directory), filename);
      try { await copyVideoFile(selected.absolutePath, path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await safeVideoPath(runtime.root, path); }
      html = blankVideoComposition({ src: `_ralphy_assets/${filename}`, kind: selected.kind }); sourceKind = "file";
    }
  }
  if (sourceWarning && sourceKind === "empty") throw new VideoWorkspaceError("The Unit’s editable source is unavailable and it has no original video. Restore its composition source before opening the editor.");
  const value: VideoStored = { draft: { schemaVersion: 1, html, fps: 30, updatedAt: Date.now(), compositionId: unit.compositionId, compositionRevisionId, checkoutPath, checkoutHash: videoHash(sourceKind === "composition" ? html : ""), sourceKind, sourceWarning, assets: [] }, versions: [], render: null };
  const revision = await writeVideoStore(directory, value, null, runtime.assertCurrent);
  return hydrate(runtime, ref, value, revision);
}
export async function saveVideo(runtime: VideoRuntime, ref: VideoWorkspaceRef, html: string, fps: number, expected: string | null): Promise<VideoWorkspaceLoad> {
  const directory = await videoDirectory(runtime.root, ref), saved = await readVideoStore(directory);
  if (!saved) throw new VideoWorkspaceError("Open the video before saving");
  const { value } = saved;
  const changed = value.draft.html !== html || value.draft.fps !== fps;
  const versions = changed ? [{ id: videoHash(`${value.draft.fps}:${value.draft.html}`), html: value.draft.html, fps: value.draft.fps, savedAt: value.draft.updatedAt }, ...value.versions].slice(0, VIDEO_HISTORY_LIMIT) : value.versions;
  const assets = (await assetsFor(runtime, directory, value)).map(({ previewUrl: _preview, ...asset }) => asset);
  const next = { ...value, draft: { ...value.draft, html: videoHtml(html), fps, assets, updatedAt: Date.now() }, versions };
  const revision = await writeVideoStore(directory, next, expected, runtime.assertCurrent);
  return hydrate(runtime, ref, next, revision);
}
export async function importVideoAsset(runtime: VideoRuntime, ref: VideoWorkspaceRef, path: string): Promise<VideoWorkspaceAsset> {
  if (!isAbsolute(path) || path.includes("\0") || path.length > 4096 || !videoMime(path)) throw new VideoWorkspaceError("Choose an image, video, audio or font file");
  const directory = await videoDirectory(runtime.root, ref), filename = `${randomUUID()}-${basename(path).replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(-100)}`;
  const destination = join(await assetDirectory(directory), filename);
  await copyVideoFile(path, destination);
  runtime.assertCurrent();
  const mime = videoMime(path)!;
  return { src: `_ralphy_assets/${filename}`, name: basename(path), kind: kindFor(mime), previewUrl: (await runtime.mint(destination, mime, (await lstat(destination)).size)).url };
}
const renders = new Set<string>();
export async function renderVideo(runtime: VideoRuntime, ref: VideoWorkspaceRef, expected: string): Promise<VideoWorkspaceRender> {
  const directory = await videoDirectory(runtime.root, ref);
  if (renders.has(directory)) throw new VideoWorkspaceError("A render is already running for this video");
  renders.add(directory);
  try {
    const saved = await readVideoStore(directory);
    if (!saved || saved.revision !== expected) throw new VideoWorkspaceError("Save your current draft before rendering");
    const value = saved.value, draft = value.draft, context = contextFor(ref);
    if (!draft.compositionId || !draft.compositionRevisionId || !draft.checkoutPath) throw new VideoWorkspaceError("This Unit has no linked Composition. Ask the agent to link a video Composition before rendering.");
    const reviseUnit = await prepareVideoUnitRevision(runtime.request, ref);
    const current = await runtime.request("composition.show", { context, compositionId: draft.compositionId });
    if (current.latestRevisionId !== draft.compositionRevisionId) throw new VideoWorkspaceError("The agent created a newer composition. Reopen its version before rendering these edits.");
    const source = await runtime.request("composition.revision.show", { context, revisionId: draft.compositionRevisionId });
    if (source.state === "sealed") {
      const checkout = await runtime.cli(["--project", ref.projectId, "composition", "revise", current.id, "--expected", source.id, "--engine", "hyperframes"]) as { id: string; checkoutPath: string };
      draft.compositionRevisionId = checkout.id;
      draft.checkoutPath = await safeVideoPath(runtime.root, checkout.checkoutPath);
    }
    const checkout = await safeVideoPath(runtime.root, draft.checkoutPath), target = join(checkout, "index.html");
    const original = await readVideoText(target).catch((error) => { if (error.code === "ENOENT") return ""; throw error; });
    if (draft.checkoutHash && videoHash(original) !== draft.checkoutHash) throw new VideoWorkspaceError("The composition source changed outside this editor. Your saved draft is preserved; reopen the source before rendering.");
    await guardedAtomicWrite(target, draft.html, { maxBytes: VIDEO_BYTES, assertCurrent: runtime.assertCurrent });
    draft.checkoutHash = videoHash(draft.html);
    const localAssets = await assetDirectory(directory), outputAssets = await assetDirectory(checkout);
    for (const name of await videoFiles(localAssets)) {
      const targetAsset = join(outputAssets, name);
      try { await lstat(targetAsset); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await copyVideoFile(join(localAssets, name), targetAsset); }
    }
    // Persist the exact revision before invoking the long-running runtime build.
    const revision = await writeVideoStore(directory, value, saved.revision, runtime.assertCurrent);
    const completion = await runtime.cli(["--project", ref.projectId, "composition", "build", draft.compositionId, "--revision", draft.compositionRevisionId, "--profile", JSON.stringify({ fps: draft.fps, quality: "standard", workers: "1" })]) as { id: string; state: string; outputs: { artifactRevisionId: string }[] };
    const result: VideoWorkspaceRender = { compositionRevisionId: draft.compositionRevisionId, buildId: completion.id, state: completion.state === "succeeded" ? "succeeded" : "failed", artifactRevisionId: completion.outputs[0]?.artifactRevisionId ?? null, sourceRevision: videoHash(draft.html), createdAt: Date.now() };
    if (result.state === "succeeded" && result.artifactRevisionId) {
      try { runtime.assertCurrent(); result.unitRevisionId = (await reviseUnit(result.artifactRevisionId, draft.compositionRevisionId)).id; }
      catch { result.error = "The video rendered, but its Unit changed or could not be updated. The rendered file is preserved below; reopen the Unit before trying again."; }
    }
    // Editing may continue during rendering. Attach the result without replacing newer HTML.
    const latest = await readVideoStore(directory);
    if (latest) await writeVideoStore(directory, { ...latest.value, render: result }, latest.revision, runtime.assertCurrent);
    const hydrated = await hydrate(runtime, ref, { ...value, render: result }, revision);
    return hydrated.render!;
  } finally { renders.delete(directory); }
}
