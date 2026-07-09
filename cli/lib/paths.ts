// Layout single source of truth (#105 artifacts/, #108 workspaces + .ralphy root).
//
// There is exactly ONE layout scheme since the one-pass data migration (#106):
//
//   • "ralphy" (the only resolvable scheme):
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
// `layoutMode()` still DETECTS the pre-#106 "legacy" tree (a `workspace/` dir
// with no `.ralphy/`) so `ralphy migrate` and `ralphy doctor` can recognize an
// unmigrated root — but path helpers no longer resolve legacy paths. On a
// legacy root every helper fails fast with `LegacyLayoutError` (mapped to
// E_LEGACY_LAYOUT at the command boundary) unless the verb explicitly opted in
// via `setLegacyAllowed(true)` (only `migrate` and `doctor` do).

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

/**
 * Which layout scheme the current root uses. Cached once a marker directory
 * exists; re-evaluated while the root is still empty (fresh install) so a
 * fixture tree created after setRoot() is still honored.
 *
 * "legacy" is detection-only since #106 — path helpers refuse to resolve on a
 * legacy root (see `workspace()`); the mode exists so `ralphy migrate` can
 * find the unmigrated tree and `ralphy doctor` can warn about it. Detection
 * keys on the ENGINE markers (`workspace/.ralph/` or `workspace/projects/`),
 * not the bare `workspace/` dir — a checkout can carry doc files under
 * `workspace/` without being an unmigrated data root.
 */
export function layoutMode(): LayoutMode {
  if (_modeCache && _modeCache.root === _root) return _modeCache.mode;
  if (existsSync(path.join(_root, ".ralphy"))) {
    _modeCache = { root: _root, mode: "ralphy" };
    return "ralphy";
  }
  if (
    existsSync(path.join(_root, "workspace", ".ralph")) ||
    existsSync(path.join(_root, "workspace", "projects"))
  ) {
    // Pre-#106 unmigrated tree. Detection only — helpers fail fast on it.
    _modeCache = { root: _root, mode: "legacy" };
    return "legacy";
  }
  // No engine markers yet — fresh install → new scheme. Not cached: a fixture
  // tree may still be created before the first write.
  return "ralphy";
}

// ─── Legacy fail-fast guard (#106) ───────────────────────────────────────────

let _legacyAllowed = false;

/**
 * Opt a verb out of the legacy fail-fast guard. Only `ralphy migrate` (which
 * must read/move the legacy tree) and `ralphy doctor` (which must diagnose an
 * unmigrated root) call this. Everything else fails fast so the user migrates
 * instead of silently writing into a half-empty `.ralphy/`.
 */
export function setLegacyAllowed(allowed: boolean) {
  _legacyAllowed = allowed;
}

/**
 * Thrown by `workspace()` on an unmigrated legacy root. Lib code can't call
 * `raiseError()` (it process.exit()s — wrong for library callers and tests),
 * so this Error carries `code = "E_LEGACY_LAYOUT"`; the command boundary in
 * cli/index.ts maps it onto the catalog payload.
 */
export class LegacyLayoutError extends Error {
  readonly code = "E_LEGACY_LAYOUT" as const;
  constructor() {
    super(
      "E_LEGACY_LAYOUT: this root still uses the legacy workspace/ tree — run `ralphy migrate` to move it to the .ralphy/ layout",
    );
    this.name = "LegacyLayoutError";
  }
}

/**
 * The data root: `.ralphy/`. Named `workspace` for historical reasons (the
 * pre-#106 root dir was literally `workspace/`). Fails fast on an unmigrated
 * legacy root unless `setLegacyAllowed(true)` was called (migrate / doctor).
 */
export function workspace() {
  if (layoutMode() === "legacy" && !_legacyAllowed) {
    throw new LegacyLayoutError();
  }
  return path.join(_root, ".ralphy");
}

/** Engine-state dir: `.ralphy/` top level. */
export function ralphDir() {
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

/** `.ralphy/workspaces/` */
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

/** `.ralphy/workspaces/<slug>/workflows/` — declarative staged pipelines (#478). */
export function workflowsDir(slug: string) {
  return path.join(workspaceDir(slug), "workflows");
}

/** `.ralphy/workspaces/<slug>/subgraphs/` — reusable named subgraphs (#517). */
export function subgraphsDir(slug: string) {
  return path.join(workspaceDir(slug), "subgraphs");
}

/**
 * The active workspace slug — the default home for new projects. Stored as
 * the `activeWorkspace` key in config.json (`ralphy workspace use <slug>`).
 */
export function currentWorkspace(): string {
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
// Brand / persona / global-ref entity files live in the active workspace's
// shared/ tree (issue #108; #106 migrated legacy data there).

export function brandsDir() {
  return path.join(sharedDir(currentWorkspace()), "brands");
}

export function personasDir() {
  return path.join(sharedDir(currentWorkspace()), "personas");
}

export function refsDir() {
  return path.join(sharedDir(currentWorkspace()), "refs");
}

// ─── Workspace-scoped data dirs ──────────────────────────────────────────────

/** Projects of the ACTIVE workspace. */
export function projectsDir() {
  return path.join(workspaceDir(currentWorkspace()), "projects");
}

export function batchesDir() {
  return path.join(workspaceDir(currentWorkspace()), "batches");
}

export function templatesDir() {
  return path.join(workspaceDir(currentWorkspace()), "templates");
}

// ─── Runs (#480) ─────────────────────────────────────────────────────────────
// A run = one content-farm campaign that binds many member projects across a
// workspace. It lives under the workspace (like batches), discovered file-on-disk
// — runs are NOT a registry collection. `runWorkspace` resolves which workspace a
// run lives in, mirroring `projectWorkspace`.

/** `.ralphy/workspaces/<slug>/runs/` */
export function runsDir(slug: string = currentWorkspace()) {
  return path.join(workspaceDir(slug), "runs");
}

/** `.ralphy/workspaces/<slug>/runs/<runId>/` */
export function runDir(slug: string, runId: string) {
  return path.join(runsDir(slug), runId);
}

/** `.ralphy/workspaces/<slug>/runs/<runId>/run.json` */
export function runManifestPath(slug: string, runId: string) {
  return path.join(runDir(slug, runId), "run.json");
}

/**
 * Which workspace a run belongs to. Resolution order (mirrors `projectWorkspace`):
 *   1. an existing `workspaces/<ws>/runs/<runId>/` dir, active workspace first
 *      (covers a run created under a non-active workspace).
 *   2. the active workspace (the creation path: dir doesn't exist yet).
 */
export function runWorkspace(runId: string): string {
  const active = currentWorkspace();
  if (existsSync(path.join(workspaceDir(active), "runs", runId))) return active;
  try {
    for (const slug of readdirSync(workspacesDir())) {
      if (slug === active) continue;
      if (existsSync(path.join(workspaceDir(slug), "runs", runId))) return slug;
    }
  } catch {
    /* no workspaces dir yet */
  }
  return active;
}

// ─── Campaigns (#528) ────────────────────────────────────────────────────────
// A campaign = a workspace-scoped keyword/topic cluster mapped to a planned set
// of units. It lives under the workspace (like batches / runs), discovered
// file-on-disk (campaigns are NOT a registry collection). `campaignWorkspace`
// resolves which workspace a campaign lives in, mirroring `runWorkspace`.

/** `.ralphy/workspaces/<slug>/campaigns/` */
export function campaignsDir(slug: string = currentWorkspace()) {
  return path.join(workspaceDir(slug), "campaigns");
}

/** `.ralphy/workspaces/<slug>/campaigns/<id>/` */
export function campaignDir(slug: string, id: string) {
  return path.join(campaignsDir(slug), id);
}

/** `.ralphy/workspaces/<slug>/campaigns/<id>/campaign.json` */
export function campaignManifestPath(slug: string, id: string) {
  return path.join(campaignDir(slug, id), "campaign.json");
}

/**
 * Which workspace a campaign belongs to. Resolution order (mirrors `runWorkspace`):
 *   1. an existing `workspaces/<ws>/campaigns/<id>/` dir, active workspace first.
 *   2. the active workspace (the creation path: dir doesn't exist yet).
 */
export function campaignWorkspace(id: string): string {
  const active = currentWorkspace();
  if (existsSync(path.join(workspaceDir(active), "campaigns", id))) return active;
  try {
    for (const slug of readdirSync(workspacesDir())) {
      if (slug === active) continue;
      if (existsSync(path.join(workspaceDir(slug), "campaigns", id))) return slug;
    }
  } catch {
    /* no workspaces dir yet */
  }
  return active;
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
 * topic-level researchDir() above.
 */
export function researchJobsDir() {
  return path.join(researchDir(), "jobs");
}

// ─── Caches ──────────────────────────────────────────────────────────────────

// Cache of assets pulled from ralphy-assets (gitignored).
// Layout: <cache>/manifest.json + <cache>/required/<template>/<file>
export function assetCacheDir() {
  return path.join(workspace(), "cache", "assets");
}

// Cache for the public content library JSON (gitignored). Short-TTL files
// keyed by request, written by cli/lib/library/client.ts. Safe to wipe; a
// miss/parse error just refetches.
export function libraryCacheDir() {
  return path.join(workspace(), "cache", "library");
}

// Rasterized-SVG cache (cli/lib/image/cutout.ts) — same logo isn't re-rendered
// per generation.
export function svgCacheDir() {
  return path.join(workspace(), "cache", "svg");
}

// ─── Per-project artifact layout (#105) ─────────────────────────────────────
//
// A project's media lives in ONE tree: `<project>/artifacts/<kind>/`. `refs`
// (input references) is just another kind, so "everything this project
// consumes or produces" is a single `ls artifacts/` away. Since #106 the
// resolution is single-path: the legacy layout (`assets/<kind>/` + a sibling
// `refs/`) is migrated by `ralphy migrate` and no longer read.
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
 * The project root, resolved through the registry —
 * `.ralphy/workspaces/<ws>/projects/<id>/`, no workspace arg needed.
 */
export function projectDir(projectId: string) {
  return path.join(workspaceDir(projectWorkspace(projectId)), "projects", projectId);
}

/** `<project>/artifacts/` — all media the project consumes or produces. */
export function artifactsDir(projectId: string) {
  return path.join(projectDir(projectId), "artifacts");
}

/**
 * Reverse-lookup a project id from an arbitrary file/dir path (#411). Used by
 * `ralphy eval` to auto-detect the project a rendered mp4 belongs to.
 *
 * Resolution order (most → least authoritative):
 *   1. Registry: the longest registered project id whose resolved `projectDir`
 *      is an ancestor of (or equal to) the path. Authoritative because it
 *      respects `ralphy project move` (a project not under its id's default
 *      workspace still resolves correctly).
 *   2. Layout regex on the CURRENT `.ralphy/workspaces/<ws>/projects/<id>/`
 *      shape (extract `<id>`), so a render outside the registry (a stray mp4 in
 *      a project tree, or a test fixture without a registry) still resolves.
 *   3. Legacy fallback regex on the pre-#106 `workspace/projects/<id>/` shape.
 *
 * Returns null when the path is not inside any recognizable project tree.
 */
export function projectIdFromPath(p: string): string | null {
  const abs = path.resolve(p);

  // 1. Registry-backed: pick the registered project whose dir contains `abs`.
  //    Longest dir match wins (handles nested-looking ids defensively).
  try {
    const projects = readRegistryProjectsSync();
    let best: { id: string; len: number } | null = null;
    for (const id of Object.keys(projects)) {
      const dir = projectDir(id);
      if (abs === dir || abs.startsWith(dir + path.sep)) {
        if (!best || dir.length > best.len) best = { id, len: dir.length };
      }
    }
    if (best) return best.id;
  } catch {
    /* no registry / unreadable — fall through to the layout regexes */
  }

  // 2. Current `.ralphy/` layout: .../workspaces/<ws>/projects/<id>/...
  const current = abs.match(/[\\/]workspaces[\\/][^\\/]+[\\/]projects[\\/]([^\\/]+)(?:[\\/]|$)/);
  if (current) return current[1];

  // 3. Legacy fallback: .../workspace/projects/<id>/...
  const legacy = abs.match(/[\\/]workspace[\\/]projects[\\/]([^\\/]+)(?:[\\/]|$)/);
  if (legacy) return legacy[1];

  return null;
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

/**
 * Resolution of a kind dir. Single-path since #106 (`artifacts/<kind>/` only);
 * the name survives from the dual-scan era so call sites stay stable.
 */
export function resolveArtifactKindDir(projectId: string, kind: ArtifactKind | (string & {})) {
  return artifactKindDir(projectId, kind);
}

/**
 * Resolution for directory SCANS. Single-path since #106 — always exactly
 * `[artifacts/<kind>/]`. Kept array-shaped so scan call sites stay stable.
 */
export function resolveArtifactKindDirs(projectId: string, kind: ArtifactKind | (string & {})): string[] {
  return [artifactKindDir(projectId, kind)];
}

/**
 * Resolution of a single file: `artifacts/<kind>/<file>`. Single-path since
 * #106; the name survives from the dual-scan era so call sites stay stable.
 */
export function resolveArtifactPath(
  projectId: string,
  kind: ArtifactKind | (string & {}),
  filename: string,
) {
  return path.join(artifactKindDir(projectId, kind), filename);
}
