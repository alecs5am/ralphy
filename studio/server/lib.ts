// Studio server library (#107) — pure functions for root resolution and
// artifact listing, separated from the HTTP layer so they are unit-testable.
//
// READ-ONLY by contract (AGENTS.md invariant #14): nothing in studio/ ever
// writes, renames, or deletes inside the data root. Every export here only
// reads the filesystem.

import path from "node:path";
import fs from "node:fs";

/** Artifact kinds, mirroring cli/lib/paths.ts ARTIFACT_KINDS (#105). */
export const ARTIFACT_KINDS = [
  "images",
  "videos",
  "voiceover",
  "music",
  "sfx",
  "captions",
  "fonts",
  "refs",
] as const;

/** Pseudo-kinds appended after the real artifact kinds: deliverables. */
export const EXTRA_KINDS = ["render"] as const;

export type MediaType = "image" | "video" | "audio" | "text" | "other";

export type ArtifactEntry = {
  /** Path relative to the project dir, e.g. "artifacts/images/hero.v2.png". */
  path: string;
  /** Kind bucket: an ARTIFACT_KIND, an unknown artifacts/ subdir name, or "render". */
  kind: string;
  name: string;
  size: number;
  mtime: number;
  type: MediaType;
};

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);
const TEXT_EXT = new Set([".txt", ".md", ".json", ".jsonl", ".srt", ".vtt", ".html", ".css", ".js", ".mjs", ".ts", ".yaml", ".yml"]);

export function mediaType(file: string): MediaType {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (TEXT_EXT.has(ext)) return "text";
  return "other";
}

export const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".json": "application/json", ".jsonl": "text/plain; charset=utf-8",
  ".srt": "text/plain; charset=utf-8", ".vtt": "text/vtt",
  ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "text/javascript", ".mjs": "text/javascript",
  ".woff2": "font/woff2", ".ttf": "font/ttf",
};

/**
 * Resolve the `.ralphy/` data root: RALPHY_STUDIO_ROOT env override (points
 * at the dir that CONTAINS `.ralphy/`), else walk up from `startDir` looking
 * for a `.ralphy/workspaces/` marker.
 */
export function resolveDataRoot(startDir: string): string | null {
  const override = process.env.RALPHY_STUDIO_ROOT;
  if (override) {
    const p = path.join(path.resolve(override), ".ralphy");
    return fs.existsSync(p) ? p : null;
  }
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ".ralphy");
    if (fs.existsSync(path.join(candidate, "workspaces"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export type WorkspaceInfo = { slug: string; name: string; projects: number };

export function listWorkspaces(dataRoot: string): WorkspaceInfo[] {
  const wsDir = path.join(dataRoot, "workspaces");
  if (!fs.existsSync(wsDir)) return [];
  const out: WorkspaceInfo[] = [];
  for (const slug of fs.readdirSync(wsDir).sort()) {
    const dir = path.join(wsDir, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    let name = slug;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, "workspace.json"), "utf-8"));
      if (typeof manifest.name === "string" && manifest.name) name = manifest.name;
    } catch { /* manifest optional */ }
    let projects = 0;
    try {
      projects = fs
        .readdirSync(path.join(dir, "projects"))
        .filter((p) => fs.statSync(path.join(dir, "projects", p)).isDirectory()).length;
    } catch { /* no projects dir yet */ }
    out.push({ slug, name, projects });
  }
  return out;
}

export type ProjectInfo = { id: string; workspace: string; mtime: number };

export function listProjects(dataRoot: string, workspace: string): ProjectInfo[] {
  const dir = path.join(dataRoot, "workspaces", workspace, "projects");
  if (!fs.existsSync(dir)) return [];
  const out: ProjectInfo[] = [];
  for (const id of fs.readdirSync(dir)) {
    const p = path.join(dir, id);
    let st: fs.Stats;
    try { st = fs.statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    out.push({ id, workspace, mtime: st.mtimeMs });
  }
  // Most recently touched first — the project you're generating into is on top.
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function projectDir(dataRoot: string, workspace: string, id: string): string {
  return path.join(dataRoot, "workspaces", workspace, "projects", id);
}

function walkFiles(dir: string, baseRel: string, kind: string, out: ArtifactEntry[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === ".DS_Store") continue;
    const abs = path.join(dir, e.name);
    const rel = `${baseRel}/${e.name}`;
    if (e.isDirectory()) {
      walkFiles(abs, rel, kind, out);
    } else if (e.isFile()) {
      let st: fs.Stats;
      try { st = fs.statSync(abs); } catch { continue; }
      out.push({ path: rel, kind, name: e.name, size: st.size, mtime: st.mtimeMs, type: mediaType(e.name) });
    }
  }
}

/**
 * Walk `<project>/artifacts/**` (#105 layout) grouped by kind subdir, plus
 * the `render/` deliverables as a pseudo-kind. Unknown artifacts/ subdirs
 * (e.g. `analysis/`) come through under their own name.
 */
export function listArtifacts(dataRoot: string, workspace: string, id: string): ArtifactEntry[] {
  const proj = projectDir(dataRoot, workspace, id);
  const out: ArtifactEntry[] = [];
  const artifactsDir = path.join(proj, "artifacts");
  if (fs.existsSync(artifactsDir)) {
    for (const sub of fs.readdirSync(artifactsDir).sort()) {
      const abs = path.join(artifactsDir, sub);
      try {
        if (fs.statSync(abs).isDirectory()) walkFiles(abs, `artifacts/${sub}`, sub, out);
      } catch { /* race: file vanished mid-walk */ }
    }
  }
  const renderDir = path.join(proj, "render");
  if (fs.existsSync(renderDir)) walkFiles(renderDir, "render", "render", out);
  // Newest first inside the full list; the UI re-groups by kind.
  return out.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Resolve a project-relative file path, guarding against path traversal and
 * symlink escape. Returns the absolute path or null when the request is
 * outside the project dir.
 */
export function safeProjectFile(dataRoot: string, workspace: string, id: string, rel: string): string | null {
  const proj = projectDir(dataRoot, workspace, id);
  const abs = path.resolve(proj, rel);
  if (abs !== proj && !abs.startsWith(proj + path.sep)) return null;
  let real: string;
  try { real = fs.realpathSync(abs); } catch { return null; }
  const realProj = fs.realpathSync(proj);
  if (real !== realProj && !real.startsWith(realProj + path.sep)) return null;
  return real;
}

/** Map an fs.watch-relative path inside a project to its kind bucket. */
export function kindOfRelPath(rel: string): string | null {
  const parts = rel.split(path.sep);
  if (parts[0] === "artifacts" && parts.length >= 3) return parts[1];
  if (parts[0] === "render" && parts.length >= 2) return "render";
  return null;
}
