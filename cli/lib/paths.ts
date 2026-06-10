import path from "path";
import { existsSync } from "fs";

let _root: string = process.cwd();

export function setRoot(dir: string) {
  _root = path.resolve(dir);
}

export function root() {
  return _root;
}

export function workspace() {
  return path.join(_root, "workspace");
}

export function ralphDir() {
  return path.join(workspace(), ".ralph");
}

export function registryPath() {
  return path.join(ralphDir(), "registry.json");
}

export function configPath() {
  return path.join(ralphDir(), "config.json");
}

export function brandsDir() {
  return path.join(ralphDir(), "brands");
}

export function personasDir() {
  return path.join(ralphDir(), "personas");
}

export function refsDir() {
  return path.join(ralphDir(), "refs");
}

export function projectsDir() {
  return path.join(workspace(), "projects");
}

export function batchesDir() {
  return path.join(workspace(), "batches");
}

export function templatesDir() {
  return path.join(workspace(), "templates");
}

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

// Per-workspace cache for assets pulled from ralphy-assets (gitignored).
// Layout: <cache>/manifest.json + <cache>/required/<template>/<file>
export function assetCacheDir() {
  return path.join(ralphDir(), "asset-cache");
}

// ─── Per-project artifact layout (#105) ─────────────────────────────────────
//
// A project's media lives in ONE tree: `workspace/projects/<id>/artifacts/<kind>/`.
// `refs` (input references) is just another kind, so "everything this project
// consumes or produces" is a single `ls artifacts/` away. The legacy layout
// (`assets/<kind>/` + a sibling `refs/`) is still READ as a fallback until the
// one-pass data migration (#106) lands; WRITES go only to `artifacts/`.
//
// NOTE: this is the per-PROJECT refs dir. The global registry refs for brand /
// persona entities live at `refsDir()` above (workspace/.ralph/refs) and are a
// separate concern.

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

/** `workspace/projects/<id>/` — the project root. */
export function projectDir(projectId: string) {
  return path.join(projectsDir(), projectId);
}

/** `workspace/projects/<id>/artifacts/` — all media the project consumes or produces. */
export function artifactsDir(projectId: string) {
  return path.join(projectDir(projectId), "artifacts");
}

/**
 * `workspace/projects/<id>/artifacts/<kind>/`. `kind` is normally one of
 * ARTIFACT_KINDS but the signature stays open for auxiliary subtrees
 * (e.g. "analysis") that live alongside the media kinds.
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

// Per-workspace cache for the public content library read over PostgREST
// (gitignored). Short-TTL JSON files keyed by request, written by
// cli/lib/library/client.ts. Safe to wipe; a miss/parse error just refetches.
export function libraryCacheDir() {
  return path.join(ralphDir(), "library-cache");
}
