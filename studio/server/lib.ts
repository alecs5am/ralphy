// Studio server library (#107) — pure functions for root resolution and
// artifact listing, separated from the HTTP layer so they are unit-testable.
//
// READ-ONLY over media (AGENTS.md invariant #14): nothing here writes, renames,
// or deletes any artifact. The ONE exception is `writeBoardChoice` (#478), which
// persists the chosen scene variant to a project-local board.json and never
// touches media. Every other export only reads the filesystem.

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

// ─── Workflow lane (#478 Phase 3, read-only) ─────────────────────────────────
//
// Studio renders a workspace's declarative workflow (workspaces/<ws>/workflows/
// <name>.json) as a node chain with per-step status. The status derivation
// mirrors `evaluateWorkflow` (cli/lib/workflow.ts) but is re-implemented here so
// studio/ stays self-contained (it never imports cli/ — same reason ARTIFACT_KINDS
// is hand-copied). Derived from artifact presence + the project's
// workspace-eval.json gate verdicts. No jobs.db read → no transient "running"
// state in Studio (the live WS file-watch flips steps to done as artifacts land).

type GateVerdict = "pass" | "warn" | "fail" | "na";
const VERDICT_RANK: Record<GateVerdict, number> = { fail: 3, warn: 2, na: 1, pass: 0 };

/** Project-relative artifact each contract phase produces — a hand-copy of the
 *  core CONTRACT_PHASES entries (cli/lib/contract.ts). Only the phases a default
 *  workflow surfaces need entries; an unmapped phase reads as not-yet-present. */
const PHASE_ARTIFACT: Record<string, string> = {
  intake: "BRIEF.md",
  research: "artifacts/refs/research-facts.json",
  "style-lock": "STYLE_LOCK.md",
  "production-plan": "PRODUCTION_PLAN.md",
  scenario: "scenario.json",
  prompts: "prompts.json",
  assets: "asset-manifest.json",
  render: "render/final.mp4",
  eval: "eval.json",
};

export type WorkflowLaneStep = {
  id: string;
  label: string;
  phase: string;
  engine: string;
  model: string | null;
  variants: number;
  gate: string[];
  mode: string;
  status: "done" | "waiting" | "blocked" | "queued";
  gateVerdict: GateVerdict | null;
};

export type WorkflowLane = {
  workspace: string;
  project: string;
  workflow: string;
  steps: WorkflowLaneStep[];
  currentStep: string | null;
  complete: boolean;
} | null;

/**
 * Read the workspace's workflow + derive its per-step status for a project, or
 * null when the workspace has no workflow / the file is unreadable.
 */
export function readWorkflowLane(dataRoot: string, workspace: string, id: string): WorkflowLane {
  const wfDir = path.join(dataRoot, "workspaces", workspace, "workflows");
  let names: string[];
  try {
    names = fs.readdirSync(wfDir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  const file = names.includes("episode.json") ? "episode.json" : names[0];
  let wf: { steps?: unknown[] };
  try {
    wf = JSON.parse(fs.readFileSync(path.join(wfDir, file), "utf-8"));
  } catch {
    return null;
  }
  const rawSteps = Array.isArray(wf.steps) ? wf.steps : [];
  const proj = projectDir(dataRoot, workspace, id);

  // Gate verdicts from the project's workspace-eval.json (if any).
  const verdicts: Record<string, GateVerdict> = {};
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(proj, "workspace-eval.json"), "utf-8"));
    for (const c of sc?.criteria ?? []) {
      if (c && typeof c.id === "string") verdicts[c.id] = c.verdict;
    }
  } catch { /* no scorecard yet */ }

  const base = rawSteps.map((raw) => {
    const s = raw as Record<string, any>;
    const gate: string[] = Array.isArray(s.gate) ? s.gate : [];
    const artifact = PHASE_ARTIFACT[s.phase as string];
    const phaseSatisfied = artifact ? fs.existsSync(path.join(proj, artifact)) : false;
    const gateVerdict =
      gate.length === 0
        ? null
        : gate
            .map((g) => verdicts[g] ?? "na")
            .reduce<GateVerdict>((w, v) => (VERDICT_RANK[v] > VERDICT_RANK[w] ? v : w), "pass");
    const done =
      phaseSatisfied && (gate.length === 0 || gateVerdict === "pass" || gateVerdict === "warn");
    return { s, gate, gateVerdict, done };
  });

  const cursor = base.findIndex((b) => !b.done);
  const complete = cursor === -1;

  const steps: WorkflowLaneStep[] = base.map((b, i) => {
    let status: WorkflowLaneStep["status"];
    if (b.done) status = "done";
    else if (i !== cursor) status = "queued";
    else if (b.gateVerdict === "fail") status = "blocked";
    else if ((b.s.mode ?? "approve") === "approve") status = "waiting";
    else status = "queued";
    const models: string[] = Array.isArray(b.s.models) ? b.s.models : [];
    return {
      id: String(b.s.id),
      label: String(b.s.label || b.s.id),
      phase: String(b.s.phase),
      engine: String(b.s.engine ?? ""),
      model: b.s.model ?? (models.length ? models.join(", ") : null),
      variants: typeof b.s.variants === "number" ? b.s.variants : 1,
      gate: b.gate,
      mode: String(b.s.mode ?? "approve"),
      status,
      gateVerdict: b.gateVerdict,
    };
  });

  return {
    workspace,
    project: id,
    workflow: file.replace(/\.json$/, ""),
    steps,
    currentStep: complete ? null : steps[cursor].id,
    complete,
  };
}

// ─── Scene board / anchor variants (#478) ────────────────────────────────────
//
// The variant picker that lives INSIDE the workflow's anchor-generation node:
// scene anchors derived live from artifacts/images/ by the `scene-NN` convention
// (cli/lib paths "{scene-id}-{type}-{descriptor}", re-rolls .vN/.prev), each
// scene's variants side by side, the chosen one highlighted. This is ONE node's
// content on the workflow canvas — not the whole project UI (the canvas is the
// workflow graph; see readWorkflowLane). board.json (project-local) persists the
// two board mutations Studio makes — the chosen variant per scene + the workflow
// node positions — and never touches media (AGENTS.md invariant #14).

const BOARD_FILE = "board.json";
const SCENE_RE = /^(scene-\d+)/;
const VERSION_RE = /\.(v\d+|prev\d*)\.[^.]+$/i;

export type BoardVariant = { path: string; name: string; mtime: number; chosen: boolean };
export type BoardScene = { id: string; label: string; order: number; chosen: string | null; variants: BoardVariant[] };
export type NodePos = { x: number; y: number };
export type Board = {
  workspace: string;
  project: string;
  scenes: BoardScene[];
  /** Non-scene images (props / fx / portraits) — shown as a trailing lane. */
  other: BoardVariant[];
  /** Saved workflow-node positions (node id → {x,y}); empty = auto-layout. */
  layout: Record<string, NodePos>;
} | null;

type BoardFile = { version: number; chosen: Record<string, string>; layout: Record<string, NodePos> };

/** Read the project's board.json (chosen variants + node layout), defaulted. */
function readBoardJson(proj: string): BoardFile {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(proj, BOARD_FILE), "utf-8"));
    return {
      version: 1,
      chosen: raw?.chosen && typeof raw.chosen === "object" ? raw.chosen : {},
      layout: raw?.layout && typeof raw.layout === "object" ? raw.layout : {},
    };
  } catch {
    return { version: 1, chosen: {}, layout: {} };
  }
}

function writeBoardJson(proj: string, data: BoardFile): void {
  fs.writeFileSync(path.join(proj, BOARD_FILE), JSON.stringify(data, null, 2) + "\n");
}

/**
 * Derive the scene board for a project, or null when it has no images at all.
 * Scenes group `artifacts/images/scene-NN-*` by the scene-NN prefix; the chosen
 * variant is the board.json override (when its file still exists) else the
 * latest canonical (non-.vN/.prev) image, else the latest image.
 */
export function readBoard(dataRoot: string, workspace: string, id: string): Board {
  const proj = projectDir(dataRoot, workspace, id);
  const imagesDir = path.join(proj, "artifacts", "images");
  let files: string[];
  try {
    files = fs.readdirSync(imagesDir).filter((f) => mediaType(f) === "image" && !f.startsWith("."));
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  const boardJson = readBoardJson(proj);
  const choices = boardJson.chosen;
  const bySceneOrder = new Map<string, { order: number; files: string[] }>();
  const other: string[] = [];
  for (const f of files) {
    const m = f.match(SCENE_RE);
    if (!m) { other.push(f); continue; }
    const sceneId = m[1];
    const order = parseInt(sceneId.slice("scene-".length), 10);
    const g = bySceneOrder.get(sceneId) ?? { order, files: [] };
    g.files.push(f);
    bySceneOrder.set(sceneId, g);
  }

  const rel = (f: string) => `artifacts/images/${f}`;
  const toVariant = (f: string, chosenName: string | null): BoardVariant => {
    let mtime = 0;
    try { mtime = fs.statSync(path.join(imagesDir, f)).mtimeMs; } catch { /* race */ }
    return { path: rel(f), name: f, mtime, chosen: f === chosenName };
  };

  const scenes: BoardScene[] = [...bySceneOrder.entries()]
    .map(([sceneId, g]) => {
      const sorted = g.files.slice().sort();
      // Default chosen: the override (if its file is still here), else the latest
      // canonical (non-version/preview) image, else the latest image overall.
      const overrideRel = choices[sceneId];
      const overrideName = overrideRel && sorted.includes(path.basename(overrideRel)) ? path.basename(overrideRel) : null;
      let chosenName = overrideName;
      if (!chosenName) {
        const canonical = sorted.filter((f) => !VERSION_RE.test(f));
        const pool = canonical.length ? canonical : sorted;
        chosenName = pool.reduce((best, f) => {
          const bt = fs.statSync(path.join(imagesDir, best)).mtimeMs;
          const ft = (() => { try { return fs.statSync(path.join(imagesDir, f)).mtimeMs; } catch { return 0; } })();
          return ft > bt ? f : best;
        }, pool[0]);
      }
      // A descriptive label: the longest shared descriptor (strip the scene prefix + ext).
      const label = sorted[0].replace(/\.[^.]+$/, "");
      return {
        id: sceneId,
        label,
        order: g.order,
        chosen: chosenName ? rel(chosenName) : null,
        variants: sorted.map((f) => toVariant(f, chosenName)),
      };
    })
    .sort((a, b) => a.order - b.order);

  return {
    workspace,
    project: id,
    scenes,
    other: other.sort().map((f) => toVariant(f, null)),
    layout: boardJson.layout,
  };
}

/**
 * Persist a chosen variant for a scene to board.json (preserving node layout).
 * One of the two board writes Studio makes (AGENTS.md invariant #14 — read-only
 * over media; board.json is metadata). Validates the path is an existing image
 * inside the project; NEVER touches or deletes media. Returns the updated board.
 */
export function writeBoardChoice(
  dataRoot: string,
  workspace: string,
  id: string,
  scene: string,
  relPath: string,
): Board | { error: string } {
  if (!/^scene-\d+$/.test(scene)) return { error: "bad scene id" };
  const abs = safeProjectFile(dataRoot, workspace, id, relPath);
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { error: "unknown variant path" };
  if (mediaType(relPath) !== "image") return { error: "not an image" };

  const proj = projectDir(dataRoot, workspace, id);
  const board = readBoardJson(proj);
  board.chosen[scene] = relPath;
  writeBoardJson(proj, board);
  return readBoard(dataRoot, workspace, id);
}

/**
 * Persist a workflow node's canvas position to board.json (preserving choices).
 * The second board write — metadata only, never touches media. `node` is a
 * workflow step id; coordinates are finite numbers in canvas space.
 */
export function writeBoardLayout(
  dataRoot: string,
  workspace: string,
  id: string,
  node: string,
  x: number,
  y: number,
): { ok: true } | { error: string } {
  if (!node || typeof node !== "string") return { error: "bad node id" };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "bad coordinates" };
  if (!fs.existsSync(projectDir(dataRoot, workspace, id))) return { error: "unknown project" };
  const proj = projectDir(dataRoot, workspace, id);
  const board = readBoardJson(proj);
  board.layout[node] = { x, y };
  writeBoardJson(proj, board);
  return { ok: true };
}
