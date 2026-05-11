import path from "path";

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

// Repo-level public templates committed to the repo (templates/ at root).
// Visible on GitHub, shipped to every clone. Workspace templates override
// repo ones with the same id.
export function repoTemplatesDir() {
  return path.join(_root, "templates");
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
