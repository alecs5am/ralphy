import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasRun } from "../../shared/canvas-runtime";
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
  const durable = { ...run, nodes: run.nodes.map((node) => ({ ...node, results: node.results.map(({ previewUrl: _url, ...result }) => result) })) };
  await guardedAtomicWrite(path, `${JSON.stringify(durable)}\n`, { maxBytes: RUN_BYTES });
}

export async function readCanvasRuns(root: string, workspaceId: string, canvas: string): Promise<CanvasRun[]> {
  const directory = await runtimeDirectory(root, workspaceId, "runs", canvas);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, 100);
  const runs: CanvasRun[] = [];
  for (const name of names) {
    const id = canvasId(name.slice(0, -5));
    const handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > RUN_BYTES) throw new Error("Invalid canvas run record");
      const run = parseCanvasRun(JSON.parse(await handle.readFile("utf8")), id, workspaceId, canvas);
      runs.push(run);
    } finally { await handle.close(); }
  }
  return runs.sort((a, b) => b.startedAt - a.startedAt);
}

export async function writeCanvasText(root: string, workspaceId: string, text: string): Promise<CanvasAsset> {
  const path = join(await runtimeDirectory(root, workspaceId, "assets"), `${randomUUID()}.txt`);
  await guardedAtomicWrite(path, text, { maxBytes: 1024 * 1024 });
  return { path, name: "Workflow output.txt", kind: "text" };
}
