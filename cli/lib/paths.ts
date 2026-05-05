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

export function referencesDir() {
  return path.join(workspace(), "references");
}
