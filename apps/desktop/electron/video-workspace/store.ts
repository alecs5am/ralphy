import { constants } from "node:fs";
import { mkdir, open, lstat, realpath, readdir } from "node:fs/promises";
import { join, relative, extname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { guardedAtomicWrite } from "../media/atomic-write";
import { videoHtml, videoRef, VideoWorkspaceError, type VideoWorkspaceRef, type VideoWorkspaceDraft, type VideoWorkspaceVersion, type VideoWorkspaceRender } from "../../shared/video-workspace";

export const VIDEO_BYTES = 16 * 1024 * 1024;
export const videoHash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function videoDirectory(root: string, rawRef: VideoWorkspaceRef): Promise<string> {
  const ref = videoRef(rawRef);
  let path = await realpath(root);
  for (const part of ["media-library", "video-workspaces", ref.workspaceId, ref.projectId, ref.unitId]) {
    path = join(path, part);
    await mkdir(path).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new VideoWorkspaceError("Video workspace storage must be a regular directory");
  }
  return path;
}
export async function safeVideoPath(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  let local = relative(base, path);
  // macOS callers may spell the same root as /var or its canonical /private/var.
  if (local.startsWith("..")) local = relative(resolve(root), resolve(path));
  if (!local || local.startsWith("..") || local.startsWith("/")) throw new VideoWorkspaceError("Video source is outside this library");
  let checked = base;
  for (const part of local.split("/")) {
    checked = join(checked, part);
    if ((await lstat(checked)).isSymbolicLink()) throw new VideoWorkspaceError("Video sources cannot contain symbolic links");
  }
  return checked;
}
export async function readVideoText(path: string, limit = VIDEO_BYTES): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit) throw new VideoWorkspaceError("Video source exceeds the size limit");
    return await file.readFile("utf8");
  } finally { await file.close(); }
}
export interface VideoStored { draft: VideoWorkspaceDraft; versions: VideoWorkspaceVersion[]; render: VideoWorkspaceRender | null }
export async function readVideoStore(directory: string): Promise<{ value: VideoStored; revision: string } | null> {
  let raw: string;
  try { raw = await readVideoText(join(directory, "draft.json"), 64 * 1024 * 1024); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const value = JSON.parse(raw) as VideoStored;
  if (value.draft?.schemaVersion !== 1 || !Array.isArray(value.versions) || !Array.isArray(value.draft.assets)) throw new VideoWorkspaceError("This video draft cannot be opened");
  videoHtml(value.draft.html);
  return { value, revision: videoHash(raw) };
}
export async function writeVideoStore(directory: string, value: VideoStored, expected: string | null, assertCurrent: () => void): Promise<string> {
  const raw = JSON.stringify(value);
  await guardedAtomicWrite(join(directory, "draft.json"), raw, {
    maxBytes: 64 * 1024 * 1024, assertCurrent,
    beforeReplace: async () => {
      if ((await readVideoStore(directory))?.revision !== (expected ?? undefined)) throw new VideoWorkspaceError("This video changed outside this editor. Reload before saving; your current edits are still here.");
    },
  });
  return videoHash(raw);
}
export const videoMime = (path: string) => ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".ttf": "font/ttf" }[extname(path).toLowerCase()] ?? null);
export async function videoFiles(directory: string, prefix = "", depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const files: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile()) files.push(name);
    else if (entry.isDirectory()) files.push(...await videoFiles(directory, name, depth + 1));
    if (files.length > 300) throw new VideoWorkspaceError("This composition contains too many source files to open");
  }
  return files;
}
