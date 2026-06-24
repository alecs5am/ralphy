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

// ─── Runs (#480/#481 control plane → #482 operator dashboard, READ-ONLY) ──────
//
// Studio re-derives a run's operator view from on-disk artifacts WITHOUT importing
// cli/ (the same self-containment rule that makes readWorkflowLane a hand-copy of
// evaluateWorkflow). It reads the run manifest (runs/<id>/run.json), the run spend
// ledger (runs/<id>/spend-ledger.json), and per-member-project artifacts —
// scorecard.json (verdict), logs/generations.jsonl (actual spend), the contract
// phase artifacts (progress), units/*/ (packaged deliverables) — and rolls them
// into progress / quality / budget / awaiting-approvals / winners / failures.
// Nothing here writes: the dashboard is read-only, and the approval inbox surfaces
// the exact `ralphy run approve` / `ralphy project approve` command the user runs
// in their own shell (Studio never mutates a spend ledger).

/** Contract phase order — a hand-copy of cli/lib/contract.ts CONTRACT_PHASES ids,
 *  used to pick the laggard phase across member projects. */
const CONTRACT_PHASE_ORDER = [
  "intake",
  "research",
  "style-lock",
  "production-plan",
  "scenario",
  "prompts",
  "assets",
  "render",
  "eval",
  "repair",
  "unit",
  "postmortem",
] as const;

function runsRoot(dataRoot: string, workspace: string): string {
  return path.join(dataRoot, "workspaces", workspace, "runs");
}

function runDir(dataRoot: string, workspace: string, runId: string): string {
  return path.join(runsRoot(dataRoot, workspace), runId);
}

type RunManifest = {
  id: string;
  workspace: string;
  title: string;
  brief?: string;
  status: "active" | "complete" | "archived";
  workflow?: string;
  projectIds: string[];
  batchId?: string;
  unitIds?: string[];
};

function readRunManifest(dataRoot: string, workspace: string, runId: string): RunManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(runDir(dataRoot, workspace, runId), "run.json"), "utf-8"));
    if (!raw || typeof raw.id !== "string") return null;
    return {
      id: String(raw.id),
      workspace: String(raw.workspace ?? workspace),
      title: String(raw.title ?? raw.id),
      brief: typeof raw.brief === "string" ? raw.brief : undefined,
      status: raw.status === "complete" || raw.status === "archived" ? raw.status : "active",
      workflow: typeof raw.workflow === "string" ? raw.workflow : undefined,
      projectIds: Array.isArray(raw.projectIds) ? raw.projectIds.map(String) : [],
      batchId: typeof raw.batchId === "string" ? raw.batchId : undefined,
      unitIds: Array.isArray(raw.unitIds) ? raw.unitIds.map(String) : undefined,
    };
  } catch {
    return null;
  }
}

export type RunRow = {
  id: string;
  title: string;
  status: RunManifest["status"];
  workspace: string;
  projects: number;
  workflow: string | null;
};

/** List the runs in a workspace (newest run.json mtime first). */
export function listRuns(dataRoot: string, workspace: string): RunRow[] {
  const dir = runsRoot(dataRoot, workspace);
  let ids: string[];
  try {
    ids = fs.readdirSync(dir).filter((d) => {
      try { return fs.statSync(path.join(dir, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    return [];
  }
  const rows: Array<RunRow & { _mtime: number }> = [];
  for (const id of ids) {
    const m = readRunManifest(dataRoot, workspace, id);
    if (!m) continue;
    let mtime = 0;
    try { mtime = fs.statSync(path.join(runDir(dataRoot, workspace, id), "run.json")).mtimeMs; } catch { /* race */ }
    rows.push({ id: m.id, title: m.title, status: m.status, workspace, projects: m.projectIds.length, workflow: m.workflow ?? null, _mtime: mtime });
  }
  rows.sort((a, b) => b._mtime - a._mtime);
  return rows.map(({ _mtime, ...r }) => r);
}

/** Active run spend cap (the most recent run approval), with expiry awareness. */
function readRunCap(dataRoot: string, workspace: string, runId: string): { capUsd: number | null; expired: boolean } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(runDir(dataRoot, workspace, runId), "spend-ledger.json"), "utf-8"));
    const approvals = Array.isArray(raw?.approvals) ? raw.approvals : [];
    const active = approvals[approvals.length - 1];
    if (!active || typeof active.budgetCapUsd !== "number") return { capUsd: null, expired: false };
    const expired = active.expiry ? Number.isFinite(Date.parse(active.expiry)) && Date.now() > Date.parse(active.expiry) : false;
    return { capUsd: active.budgetCapUsd, expired };
  } catch {
    return { capUsd: null, expired: false };
  }
}

/** Sum of cost_usd over a member project's logs/generations.jsonl (actual spend). */
function projectActualSpend(proj: string): number {
  let total = 0;
  try {
    const raw = fs.readFileSync(path.join(proj, "logs", "generations.jsonl"), "utf-8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { const row = JSON.parse(t); if (typeof row.cost_usd === "number") total += row.cost_usd; } catch { /* skip bad line */ }
    }
  } catch { /* no gen-log → 0 */ }
  return Number(total.toFixed(6));
}

/** Best-effort scorecard verdict for a member project: scorecard.json, else the
 *  workspace-eval overall verdict, else null. Both share the #427 vocab. */
function projectVerdict(proj: string): string | null {
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(proj, "scorecard.json"), "utf-8"));
    if (typeof sc?.verdict === "string") return sc.verdict;
  } catch { /* no scorecard.json */ }
  try {
    const we = JSON.parse(fs.readFileSync(path.join(proj, "workspace-eval.json"), "utf-8"));
    if (typeof we?.overall?.verdict === "string") return we.overall.verdict;
  } catch { /* no workspace-eval.json */ }
  return null;
}

/** Furthest contract phase a member project has reached (artifact presence). */
function projectPhase(proj: string): string | null {
  let furthest: string | null = null;
  for (const phase of CONTRACT_PHASE_ORDER) {
    const artifact = PHASE_ARTIFACT[phase];
    if (artifact && fs.existsSync(path.join(proj, artifact))) furthest = phase;
  }
  return furthest;
}

/** Packaged unit slugs for a member project (units/<slug>/ dirs). */
function projectUnits(proj: string): string[] {
  try {
    return fs
      .readdirSync(path.join(proj, "units"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export type RunSummary = {
  id: string;
  workspace: string;
  title: string;
  brief: string | null;
  status: RunManifest["status"];
  projectCount: number;
  missingProjects: string[];
  progress: { phase: string | null; byProject: Array<{ project: string; phase: string | null }> };
  blockers: Array<{ project: string | null; detail: string }>;
  awaitingApprovals: Array<{ project: string | null; detail: string }>;
  budget: {
    spentUsd: number;
    capUsd: number | null;
    remainingUsd: number | null;
    overBudget: boolean;
    expired: boolean;
    byProject: Array<{ project: string; spentUsd: number }>;
  };
  quality: Array<{ project: string; verdict: string | null }>;
  winners: string[];
  failures: string[];
  units: { count: number; byProject: Array<{ project: string; slugs: string[] }> };
  nextAction: string;
} | null;

/**
 * Roll a run up into the operator dashboard view. PURE read over on-disk state,
 * ZERO model calls. A member project that doesn't resolve on disk lands in
 * `missingProjects` and is skipped — never a throw. Returns null when the run
 * does not exist.
 */
export function summarizeRun(dataRoot: string, workspace: string, runId: string): RunSummary {
  const run = readRunManifest(dataRoot, workspace, runId);
  if (!run) return null;

  const missingProjects: string[] = [];
  const resolved: string[] = [];
  for (const pid of run.projectIds) {
    if (fs.existsSync(projectDir(dataRoot, workspace, pid))) resolved.push(pid);
    else missingProjects.push(pid);
  }

  const byPhase: Array<{ project: string; phase: string | null }> = [];
  const blockers: Array<{ project: string | null; detail: string }> = [];
  const awaitingApprovals: Array<{ project: string | null; detail: string }> = [];
  const quality: Array<{ project: string; verdict: string | null }> = [];
  const winners: string[] = [];
  const failures: string[] = [];
  const byProjectSpend: Array<{ project: string; spentUsd: number }> = [];
  const unitsByProject: Array<{ project: string; slugs: string[] }> = [];
  let spentUsd = 0;
  let unitCount = 0;

  for (const pid of resolved) {
    const proj = projectDir(dataRoot, workspace, pid);

    // Progress — furthest contract phase reached.
    byPhase.push({ project: pid, phase: projectPhase(proj) });

    // Quality verdict → winners / failures.
    const verdict = projectVerdict(proj);
    quality.push({ project: pid, verdict });
    if (verdict === "ship") winners.push(pid);
    if (verdict === "blocked") failures.push(pid);

    // Cost.
    const s = projectActualSpend(proj);
    byProjectSpend.push({ project: pid, spentUsd: s });
    spentUsd += s;

    // Units.
    const slugs = projectUnits(proj);
    unitsByProject.push({ project: pid, slugs });
    unitCount += slugs.length;

    // Awaiting-approval / blocked — derive from the workflow lane (if the
    // workspace has a workflow); its currentStep status encodes the gate state.
    const lane = readWorkflowLane(dataRoot, workspace, pid);
    if (lane && lane.currentStep) {
      const cur = lane.steps.find((s2) => s2.id === lane.currentStep);
      if (cur?.status === "waiting") {
        awaitingApprovals.push({ project: pid, detail: `${pid}: step "${cur.label}" (${cur.phase}) awaits approval.` });
      } else if (cur?.status === "blocked") {
        blockers.push({ project: pid, detail: `${pid}: step "${cur.label}" (${cur.phase}) is blocked — gate ${cur.gate.join(", ") || "failed"}.` });
      }
    }
    if (verdict === "blocked") {
      blockers.push({ project: pid, detail: `${pid}: readiness scorecard verdict is "blocked".` });
    }
  }

  spentUsd = Number(spentUsd.toFixed(6));
  const { capUsd, expired } = readRunCap(dataRoot, workspace, runId);
  const overBudget = capUsd != null && spentUsd > capUsd;

  // Run-level budget inbox: no cap on an active run, or the cap is breached/expired.
  if (run.status === "active" && capUsd == null) {
    awaitingApprovals.push({ project: null, detail: `No run budget approved — approve one with: ralphy run approve ${run.id} --cap <usd> --reason "<why>"` });
  }
  if (overBudget) {
    blockers.push({ project: null, detail: `Run is over budget: spent $${spentUsd.toFixed(2)} of $${capUsd!.toFixed(2)} cap.` });
  }
  if (expired) {
    awaitingApprovals.push({ project: null, detail: `Run budget approval expired — re-approve with: ralphy run approve ${run.id} --cap <usd> --reason "<why>"` });
  }

  // Laggard phase across resolved members.
  let phase: string | null = null;
  if (byPhase.length > 0) {
    let minRank = Number.POSITIVE_INFINITY;
    for (const { phase: p } of byPhase) {
      const rank = p == null ? -1 : CONTRACT_PHASE_ORDER.indexOf(p as (typeof CONTRACT_PHASE_ORDER)[number]);
      if (rank < minRank) { minRank = rank; phase = p; }
    }
  }

  return {
    id: run.id,
    workspace,
    title: run.title,
    brief: run.brief ?? null,
    status: run.status,
    projectCount: run.projectIds.length,
    missingProjects,
    progress: { phase, byProject: byPhase },
    blockers,
    awaitingApprovals,
    budget: { spentUsd, capUsd, remainingUsd: capUsd == null ? null : Number((capUsd - spentUsd).toFixed(6)), overBudget, expired, byProject: byProjectSpend },
    quality,
    winners,
    failures,
    units: { count: unitCount, byProject: unitsByProject },
    nextAction: deriveRunNextAction({ status: run.status, resolved: resolved.length, total: run.projectIds.length, missing: missingProjects.length, blockers: blockers.length, awaiting: awaitingApprovals.length, winners: winners.length }),
  };
}

function deriveRunNextAction(s: {
  status: string;
  resolved: number;
  total: number;
  missing: number;
  blockers: number;
  awaiting: number;
  winners: number;
}): string {
  if (s.total === 0) return "No member projects yet — add one with `ralphy run add-project <id> <project>`.";
  if (s.resolved === 0) return `None of the ${s.total} member project(s) resolve on disk. Re-link or recreate them.`;
  if (s.blockers > 0) return `Clear ${s.blockers} blocker(s) — see the approval inbox.`;
  if (s.awaiting > 0) return `${s.awaiting} item(s) awaiting your decision — see the approval inbox.`;
  if (s.winners === s.resolved) return `All ${s.resolved} resolved project(s) are ship-ready — form Units and package the campaign.`;
  return `Continue the pipeline on the ${s.resolved - s.winners} project(s) not yet ship-ready.`;
}
