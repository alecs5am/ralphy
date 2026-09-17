import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasRun, CanvasRunPage } from "../../shared/canvas-runtime";
import { canvasId, type CanvasAsset } from "../../shared/workflow-canvas";
import { parseCanvasRun } from "./runtime-record";
import { guardedAtomicWrite } from "../media/atomic-write";

const RUN_BYTES = 16 * 1024 * 1024;
const ASSET_BYTES = 250 * 1024 * 1024;
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg" };
export const canvasAssetMime = (path: string): string | null => MIME[extname(path).toLowerCase()] ?? null;
const EXTENSIONS: Record<string, CanvasAsset["kind"]> = { ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".mp4": "video", ".mov": "video", ".webm": "video", ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio", ".txt": "text", ".md": "text", ".json": "text" };

export async function runtimeDirectory(root: string, workspaceId: string, ...parts: string[]): Promise<string> {
  let path = await realpath(root);
  for (const part of ["media-library", "canvases", canvasId(workspaceId), ...parts.map(canvasId)]) {
    path = join(path, part);
    await mkdir(path).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Canvas runtime storage must be a regular directory");
  }
  return path;
}

export async function validateCanvasAsset(root: string, asset: CanvasAsset, workspaceId: string): Promise<{ path: string; bytes: number }> {
  const [base, path] = await Promise.all([realpath(await runtimeDirectory(root, workspaceId, "assets")), realpath(asset.path)]);
  const local = relative(base, path);
  if (!local || local.startsWith("..") || local.startsWith("/")) throw new Error("Import this asset into the workspace before running it");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > ASSET_BYTES) throw new Error("Canvas assets must be regular files under 250 MB");
  return { path, bytes: info.size };
}

export async function importCanvasFile(root: string, workspaceId: string, source: string): Promise<CanvasAsset> {
  const extension = extname(source).toLowerCase(), kind = EXTENSIONS[extension];
  if (!kind) throw new Error("Choose an image, video, audio or text file");
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await input.stat();
    if (!info.isFile() || info.size > ASSET_BYTES) throw new Error("Choose a regular file under 250 MB");
    const path = join(await runtimeDirectory(root, workspaceId, "assets"), `${randomUUID()}${extension}`);
    const output = await open(path, "wx", 0o600);
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      let total = 0;
      for (;;) {
        const { bytesRead } = await input.read(buffer);
        if (!bytesRead) break;
        total += bytesRead;
        if (total > ASSET_BYTES) throw new Error("Choose a regular file under 250 MB");
        let offset = 0;
        while (offset < bytesRead) offset += (await output.write(buffer, offset, bytesRead - offset)).bytesWritten;
      }
    } finally { await output.close(); }
    return { path, name: basename(source), kind };
  } finally { await input.close(); }
}

export async function writeCanvasRun(root: string, run: CanvasRun): Promise<void> {
  const path = join(await runtimeDirectory(root, run.workspaceId, "runs", run.canvasId), `${canvasId(run.id)}.json`);
  const durable = { ...run, nodes: run.nodes.map((node) => ({ ...node, results: node.results.map(({ previewUrl: _url, unavailableReason: _reason, ...result }) => result) })) };
  await guardedAtomicWrite(path, `${JSON.stringify(durable)}\n`, { maxBytes: RUN_BYTES });
}

export async function readCanvasRuns(root: string, workspaceId: string, canvas: string, before?: string | null): Promise<CanvasRunPage> {
  const directory = await runtimeDirectory(root, workspaceId, "runs", canvas);
  const cursor = before == null ? null : `${canvasId(before)}.json`;
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json") && (!cursor || name < cursor)).sort().reverse();
  const page = names.slice(0, 100);
  const runs: CanvasRun[] = [];
  for (const name of page) {
    const id = canvasId(name.slice(0, -5));
    runs.push(await readRunFile(directory, workspaceId, canvas, id));
  }
  return { items: runs.sort((a, b) => b.startedAt - a.startedAt), nextCursor: names.length > page.length ? page.at(-1)!.slice(0, -5) : null };
}

async function readRunFile(directory: string, workspaceId: string, canvas: string, id: string): Promise<CanvasRun> {
  const handle = await open(join(directory, `${canvasId(id)}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > RUN_BYTES) throw new Error("Invalid canvas run record");
    return parseCanvasRun(JSON.parse(await handle.readFile("utf8")), id, workspaceId, canvas);
  } finally { await handle.close(); }
}

export async function readCanvasRun(root: string, workspaceId: string, canvas: string, id: string): Promise<CanvasRun> {
  return readRunFile(await runtimeDirectory(root, workspaceId, "runs", canvas), workspaceId, canvas, id);
}

/** A saved selection is independent of which history pages the renderer has opened. */
export async function findCanvasResultRuns(root: string, workspaceId: string, canvas: string, resultIds: string[]): Promise<CanvasRun[]> {
  // ponytail: scan durable pages; add a result index only if large histories make selection slow.
  if (!Array.isArray(resultIds) || resultIds.length > 100 || resultIds.some((id) => typeof id !== "string" || !id || id.length > 256)) throw new Error("Invalid saved result selection");
  const remaining = new Set(resultIds), found: CanvasRun[] = [];
  let before: string | null = null;
  while (remaining.size) {
    const page = await readCanvasRuns(root, workspaceId, canvas, before);
    for (const run of page.items) {
      if (run.mode !== "execute") continue;
      let matched = false;
      for (const node of run.nodes) for (const result of node.results) if (remaining.delete(result.id)) matched = true;
      if (matched) found.push(run);
    }
    if (!page.nextCursor) break;
    before = page.nextCursor;
  }
  return found;
}

export async function readCanvasText(root: string, workspaceId: string, asset: CanvasAsset): Promise<string> {
  if (asset.kind !== "text") throw new Error("Choose a text source");
  const checked = await validateCanvasAsset(root, asset, workspaceId);
  const file = await open(checked.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("Text source exceeds 1 MB. Use a smaller text file.");
    const bytes = await file.readFile();
    if (bytes.length !== info.size) throw new Error("Text source changed while it was being read");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("Text source must be valid UTF-8"); }
  } finally { await file.close(); }
}

export async function writeCanvasText(root: string, workspaceId: string, text: string): Promise<CanvasAsset> {
  const path = join(await runtimeDirectory(root, workspaceId, "assets"), `${randomUUID()}.txt`);
  await guardedAtomicWrite(path, text, { maxBytes: 1024 * 1024 });
  return { path, name: "Workflow output.txt", kind: "text" };
}
