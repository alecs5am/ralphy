// Layout single source of truth (#105 artifacts/, #108 workspaces + .ralphy root).
//
// Two layout schemes coexist until the one-pass data migration (#106) lands:
//
//   • "ralphy" (the new scheme, default for fresh installs):
//       .ralphy/                          ← data root (gitignored, engine-managed)
//         registry.json  config.json      ← engine state at top level
//         cache/{assets,library,svg}/     ← caches
//         research/  references/          ← global research output
//         workspaces/<slug>/
//           workspace.json
//           shared/                       ← assets reused across the workspace
//           projects/<id>/                ← project trees (#105 artifacts/ inside)
//           templates/  batches/
//
//   • "legacy" (#108 legacy fallback, removed by #106): the pre-workspaces tree —
//       workspace/.ralph/{registry.json,config.json,asset-cache,library-cache,...}
//       workspace/{projects,batches,templates,references,research}/
//
// `layoutMode()` picks the scheme per root: `.ralphy/` present → "ralphy";
// only `workspace/` present → "legacy"; neither → "ralphy" (fresh install).
// Every legacy branch is tagged `// #108 legacy fallback (removed by #106)`.

import path from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";

let _root: string = process.cwd();

export function setRoot(dir: string) {
  _root = path.resolve(dir);
  _modeCache = null;
  _registryCache = null;
}

export function root() {
  return _root;
}

// ─── Layout mode (#108) ──────────────────────────────────────────────────────

export type LayoutMode = "ralphy" | "legacy";

let _modeCache: { root: string; mode: LayoutMode } | null = null;
let _modeOverride: LayoutMode | null = null;

/**
 * Which layout scheme the current root uses. Cached once a marker directory
 * exists; re-evaluated while the root is still empty (fresh install) so a
 * fixture tree created after setRoot() is still honored.
 */
export function layoutMode(): LayoutMode {
  if (_modeOverride) return _modeOverride;
  if (_modeCache && _modeCache.root === _root) return _modeCache.mode;
  if (existsSync(path.join(_root, ".ralphy"))) {
    _modeCache = { root: _root, mode: "ralphy" };
    return "ralphy";
  }
  if (existsSync(path.join(_root, "workspace"))) {
    // #108 legacy fallback (removed by #106)
    _modeCache = { root: _root, mode: "legacy" };
    return "legacy";
  }
  // Neither exists yet — fresh install → new scheme. Not cached: a legacy
  // fixture tree may still be created before the first write.
  return "ralphy";
}

/** Test hook: force a layout mode (pass null to restore detection). */
export function setLayoutModeForTests(mode: LayoutMode | null) {
  _modeOverride = mode;
  _modeCache = null;
}

/**
 * The data root: `.ralphy/` in the new scheme. Named `workspace` for
 * historical reasons (the legacy root dir was literally `workspace/`).
 */
export function workspace() {
  if (layoutMode() === "legacy") return path.join(_root, "workspace"); // #108 legacy fallback (removed by #106)
  return path.join(_root, ".ralphy");
}

/** Engine-state dir: `.ralphy/` top level (legacy: `workspace/.ralph/`). */
export function ralphDir() {
  if (layoutMode() === "legacy") return path.join(workspace(), ".ralph"); // #108 legacy fallback (removed by #106)
  return workspace();
}

export function registryPath() {
  return path.join(ralphDir(), "registry.json");
}

export function configPath() {
  return path.join(ralphDir(), "config.json");
}

// ─── Workspaces (#108) ───────────────────────────────────────────────────────

export const DEFAULT_WORKSPACE = "default";

/** `.ralphy/workspaces/` — only meaningful in the "ralphy" scheme. */
export function workspacesDir() {
  return path.join(workspace(), "workspaces");
}

/** `.ralphy/workspaces/<slug>/` */
export function workspaceDir(slug: string) {
  return path.join(workspacesDir(), slug);
}

/** `.ralphy/workspaces/<slug>/shared/` — assets reused across the workspace's projects. */
export function sharedDir(slug: string) {
  return path.join(workspaceDir(slug), "shared");
}

/** `.ralphy/workspaces/<slug>/workspace.json` */
export function workspaceManifestPath(slug: string) {
  return path.join(workspaceDir(slug), "workspace.json");
}

/**
 * The active workspace slug — the default home for new projects. Stored as
 * the `activeWorkspace` key in config.json (`ralphy workspace use <slug>`).
 * Legacy mode has exactly one implicit workspace: "default".
 */
export function currentWorkspace(): string {
  if (layoutMode() === "legacy") return DEFAULT_WORKSPACE; // #108 legacy fallback (removed by #106)
  try {
    const cfg = JSON.parse(readFileSync(configPath(), "utf-8"));
    const ws = cfg?.activeWorkspace;
    if (typeof ws === "string" && ws.length > 0) return ws;
  } catch {
    /* missing / malformed config → default */
  }
  return DEFAULT_WORKSPACE;
}

// Sync registry read for path resolution (registry.ts owns the async CRUD).
// mtime-keyed cache so repeated projectDir() calls don't re-parse, while a
// registry write within the same process is still picked up.
let _registryCache: { path: string; mtimeMs: number; projects: Record<string, any> } | null = null;

function readRegistryProjectsSync(): Record<string, any> {
  const p = registryPath();
  try {
    const st = statSync(p);
    if (_registryCache && _registryCache.path === p && _registryCache.mtimeMs === st.mtimeMs) {
      return _registryCache.projects;
    }
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const projects = data && typeof data.projects === "object" && data.projects ? data.projects : {};
    _registryCache = { path: p, mtimeMs: st.mtimeMs, projects };
    return projects;
  } catch {
    return {};
  }
}

/**
 * Which workspace a project belongs to. Resolution order:
 *   1. registry entry's `workspace` field (absent → "default")
 *   2. unknown id: an existing `workspaces/<ws>/projects/<id>/` dir, active
 *      workspace first (covers registry drift / hand-moved dirs)
 *   3. the active workspace (the creation path: dir + entry don't exist yet)
 */
export function projectWorkspace(projectId: string): string {
  if (layoutMode() === "legacy") return DEFAULT_WORKSPACE; // #108 legacy fallback (removed by #106)
  const entry = readRegistryProjectsSync()[projectId];
  if (entry) {
    const ws = entry.workspace;
    return typeof ws === "string" && ws.length > 0 ? ws : DEFAULT_WORKSPACE;
  }
  const active = currentWorkspace();
  if (existsSync(path.join(workspaceDir(active), "projects", projectId))) return active;
  try {
    for (const slug of readdirSync(workspacesDir())) {
      if (slug === active) continue;
      if (existsSync(path.join(workspaceDir(slug), "projects", projectId))) return slug;
    }
  } catch {
    /* no workspaces dir yet */
  }
  return active;
}

// ─── Registry entity dirs ────────────────────────────────────────────────────
// In the new scheme, brand / persona / global-ref entity files live in the
// active workspace's shared/ tree (issue #108; #106 migrates legacy data there).

export function brandsDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "brands"); // #108 legacy fallback (removed by #106)
  return path.join(sharedDir(currentWorkspace()), "brands");
}

export function personasDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "personas"); // #108 legacy fallback (removed by #106)
  return path.join(sharedDir(currentWorkspace()), "personas");
}

export function refsDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "refs"); // #108 legacy fallback (removed by #106)
  return path.join(sharedDir(currentWorkspace()), "refs");
}

// ─── Workspace-scoped data dirs ──────────────────────────────────────────────

/** Projects of the ACTIVE workspace (legacy: the single flat `workspace/projects/`). */
export function projectsDir() {
  if (layoutMode() === "legacy") return path.join(workspace(), "projects"); // #108 legacy fallback (removed by #106)
  return path.join(workspaceDir(currentWorkspace()), "projects");
}

export function batchesDir() {
  if (layoutMode() === "legacy") return path.join(workspace(), "batches"); // #108 legacy fallback (removed by #106)
  return path.join(workspaceDir(currentWorkspace()), "batches");
}

export function templatesDir() {
  if (layoutMode() === "legacy") return path.join(workspace(), "templates"); // #108 legacy fallback (removed by #106)
  return path.join(workspaceDir(currentWorkspace()), "templates");
}

// ─── Global (cross-workspace) dirs ───────────────────────────────────────────

export function referencesDir() {
  return path.join(workspace(), "references");
}

// Topic-level research output (cross-source synthesis).
// `references/` holds per-URL raw artifacts; `research/<topic>/` holds the
// final report + sources.json + per-topic state. The two live side-by-side
// so a single reference can be cited from multiple topics without copying.
export function researchDir() {
  return path.join(workspace(), "research");
}

/**
 * Deep-research JOB state (`ralphy research run` job dirs) — distinct from the
 * topic-level researchDir() above. Legacy: `workspace/.ralph/research/`.
 */
export function researchJobsDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "research"); // #108 legacy fallback (removed by #106)
  return path.join(researchDir(), "jobs");
}

// ─── Caches ──────────────────────────────────────────────────────────────────

// Cache of assets pulled from ralphy-assets (gitignored).
// Layout: <cache>/manifest.json + <cache>/required/<template>/<file>
export function assetCacheDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "asset-cache"); // #108 legacy fallback (removed by #106)
  return path.join(workspace(), "cache", "assets");
}

// Cache for the public content library JSON (gitignored). Short-TTL files
// keyed by request, written by cli/lib/library/client.ts. Safe to wipe; a
// miss/parse error just refetches.
export function libraryCacheDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "library-cache"); // #108 legacy fallback (removed by #106)
  return path.join(workspace(), "cache", "library");
}

// Rasterized-SVG cache (cli/lib/image/cutout.ts) — same logo isn't re-rendered
// per generation.
export function svgCacheDir() {
  if (layoutMode() === "legacy") return path.join(ralphDir(), "svg-cache"); // #108 legacy fallback (removed by #106)
  return path.join(workspace(), "cache", "svg");
}

// ─── Per-project artifact layout (#105) ─────────────────────────────────────
//
// A project's media lives in ONE tree: `<project>/artifacts/<kind>/`. `refs`
// (input references) is just another kind, so "everything this project
// consumes or produces" is a single `ls artifacts/` away. The legacy layout
// (`assets/<kind>/` + a sibling `refs/`) is still READ as a fallback until the
// one-pass data migration (#106) lands; WRITES go only to `artifacts/`.
//
// NOTE: this is the per-PROJECT refs dir. The global registry refs for brand /
// persona entities live at `refsDir()` above and are a separate concern.

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

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * The project root. New scheme: resolved through the registry —
 * `.ralphy/workspaces/<ws>/projects/<id>/`, no workspace arg needed. Legacy:
 * `workspace/projects/<id>/`.
 */
export function projectDir(projectId: string) {
  if (layoutMode() === "legacy") return path.join(projectsDir(), projectId); // #108 legacy fallback (removed by #106)
  return path.join(workspaceDir(projectWorkspace(projectId)), "projects", projectId);
}

/** `<project>/artifacts/` — all media the project consumes or produces. */
export function artifactsDir(projectId: string) {
  return path.join(projectDir(projectId), "artifacts");
}

/**
 * `<project>/artifacts/<kind>/`. `kind` is normally one of ARTIFACT_KINDS but
 * the signature stays open for auxiliary subtrees (e.g. "analysis") that live
 * alongside the media kinds.
 */
export function artifactKindDir(projectId: string, kind: ArtifactKind | (string & {})) {
  return path.join(artifactsDir(projectId), kind);
}

/** Per-project input references — `artifacts/refs/`. NOT the registry's global refsDir(). */
export function projectRefsDir(projectId: string) {
  return artifactKindDir(projectId, "refs");
}

// #105 legacy fallback (removed by #106): pre-artifacts layout, `assets/<kind>/`
// with `refs/` as a sibling of `assets/`.
export function legacyAssetsRootDir(projectId: string) {
  return path.join(projectDir(projectId), "assets");
}

// #105 legacy fallback (removed by #106)
export function legacyArtifactKindDir(projectId: string, kind: ArtifactKind | (string & {})) {
  if (kind === "refs") return path.join(projectDir(projectId), "refs");
  return path.join(legacyAssetsRootDir(projectId), kind);
}

/**
 * Read-side resolution of a kind dir: prefer `artifacts/<kind>/`, fall back to
 * the legacy location when only that exists. Returns the artifacts/ path when
 * neither exists (the write target).
 */
export function resolveArtifactKindDir(projectId: string, kind: ArtifactKind | (string & {})) {
  const next = artifactKindDir(projectId, kind);
  if (existsSync(next)) return next;
  const legacy = legacyArtifactKindDir(projectId, kind); // #105 legacy fallback (removed by #106)
  if (existsSync(legacy)) return legacy;
  return next;
}

/**
 * Read-side resolution for directory SCANS: every existing location for the
 * kind, artifacts/ first. A project mid-migration can hold old clips in
 * `assets/videos/` and new ones in `artifacts/videos/` — scanners must see
 * both. Returns `[artifacts path]` when neither exists.
 */
export function resolveArtifactKindDirs(projectId: string, kind: ArtifactKind | (string & {})): string[] {
  const next = artifactKindDir(projectId, kind);
  const legacy = legacyArtifactKindDir(projectId, kind); // #105 legacy fallback (removed by #106)
  const found: string[] = [];
  if (existsSync(next)) found.push(next);
  if (existsSync(legacy)) found.push(legacy);
  return found.length > 0 ? found : [next];
}

/**
 * Read-side resolution of a single file: `artifacts/<kind>/<file>` when it
 * exists, else the legacy `assets/<kind>/<file>` (or `refs/<file>`) when that
 * exists. Returns the artifacts/ path when neither exists.
 */
export function resolveArtifactPath(
  projectId: string,
  kind: ArtifactKind | (string & {}),
  filename: string,
) {
  const next = path.join(artifactKindDir(projectId, kind), filename);
  if (existsSync(next)) return next;
  const legacy = path.join(legacyArtifactKindDir(projectId, kind), filename); // #105 legacy fallback (removed by #106)
  if (existsSync(legacy)) return legacy;
  return next;
}
