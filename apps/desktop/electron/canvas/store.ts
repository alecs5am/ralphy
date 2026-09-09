import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { CANVAS_BYTES, CANVAS_WRITE_LOCK, canvasId, parseCanvas, type SavedCanvas } from "../../shared/workflow-canvas";
import { guardedAtomicWrite } from "../media/atomic-write";

const writes = new Map<string, Promise<unknown>>();
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

async function directory(root: string, workspaceId: string, create: boolean, assertCurrent: () => void): Promise<string | null> {
  canvasId(workspaceId);
  let path = await realpath(root);
  for (const part of ["media-library", "canvases", workspaceId]) {
    path = join(path, part);
    assertCurrent();
    if (create) await mkdir(path).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const info = await lstat(path).catch((error) => { if (missing(error)) return null; throw error; });
    if (!info) return null;
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Canvas storage must be a regular directory");
  }
  assertCurrent();
  return path;
}

async function read(path: string): Promise<SavedCanvas | null> {
  const info = await lstat(path).catch((error) => { if (missing(error)) return null; throw error; });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.size > CANVAS_BYTES) throw new Error("Canvas must be a regular file under 1 MB");
  const file = await open(path, "r");
  let data: Buffer;
  try {
    const buffer = Buffer.alloc(CANVAS_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > CANVAS_BYTES) throw new Error("Canvas file is too large");
    data = buffer.subarray(0, bytesRead);
  } finally { await file.close(); }
  return { canvas: parseCanvas(JSON.parse(data.toString("utf8"))), revision: createHash("sha256").update(data).digest("hex"), path };
}

export async function loadCanvases(root: string, workspaceId: string, assertCurrent = () => {}): Promise<SavedCanvas[]> {
  const path = await directory(root, workspaceId, false, assertCurrent);
  if (!path) return [];
  const names = (await readdir(path)).filter((name) => name.endsWith(".json"));
  if (names.length > 100) throw new Error("A workspace supports up to 100 canvases");
  const items = await Promise.all(names.map(async (name) => {
    const id = canvasId(name.slice(0, -5));
    const saved = await read(join(path, `${id}.json`));
    if (saved && saved.canvas.id !== id) throw new Error("Canvas identity does not match its file");
    return saved;
  }));
  assertCurrent();
  return items.filter((item): item is SavedCanvas => item !== null).sort((a, b) => a.canvas.name.localeCompare(b.canvas.name));
}

export async function saveCanvas(root: string, workspaceId: string, input: unknown, expectedRevision: string | null, assertCurrent = () => {}): Promise<SavedCanvas> {
  const canvas = parseCanvas(input);
  if (expectedRevision !== null && (typeof expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(expectedRevision))) throw new Error("Invalid canvas revision");
  const path = (await directory(root, workspaceId, true, assertCurrent))!;
  const file = join(path, `${canvas.id}.json`);
  // The workspace queue also protects its canvas-count limit across different file IDs.
  const operation = (writes.get(path) ?? Promise.resolve()).catch(() => {}).then(async () => {
    assertCurrent();
    const lock = join(path, CANVAS_WRITE_LOCK);
    await mkdir(lock).catch((error) => {
      if (error.code === "EEXIST") throw new Error("Canvas workspace is locked by another writer. Retry after it finishes. Remove an abandoned .write-lock only after confirming no writer is active.");
      throw error;
    });
    try {
      const verifyRevision = async () => {
        const current = await read(file);
        if ((current?.revision ?? null) !== expectedRevision) throw new Error("This canvas changed outside this editor. Reload it before saving.");
        return current;
      };
      const current = await verifyRevision();
      if (!current && (await readdir(path)).filter((name) => name.endsWith(".json")).length >= 100) throw new Error("A workspace supports up to 100 canvases");
      const data = `${JSON.stringify(canvas, null, 2)}\n`;
      await guardedAtomicWrite(file, data, { maxBytes: CANVAS_BYTES, assertCurrent, beforeReplace: async () => { await verifyRevision(); } });
      assertCurrent();
      return { canvas, revision: createHash("sha256").update(data).digest("hex"), path: file };
    } finally { await rmdir(lock); }
  });
  writes.set(path, operation);
  try { return await operation; } finally { if (writes.get(path) === operation) writes.delete(path); }
}
