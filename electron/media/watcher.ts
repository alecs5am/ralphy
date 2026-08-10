import { watch, type FSWatcher } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { isDomainLibraryRoot, validateLibraryRoot } from "./catalog";

export interface WatchRoute {
  catalog: boolean;
}

export interface LibraryWatcherOptions {
  rootPath: string;
  onCatalogChange: () => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
  watchFileSystem?: typeof watch;
}

const CATALOG_PROJECT_FILES = new Set([
  "asset-manifest.json",
  "brief.md",
  "production-plan.json",
  "scenario.json",
]);

function noRoute(): WatchRoute {
  return { catalog: false };
}

export function routeLibraryChange(
  rootPath: string,
  changedPath: string,
): WatchRoute {
  const root = resolve(rootPath);
  const changed = resolve(changedPath);
  const rel = relative(root, changed);
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel === "" || rel.startsWith(sep)) {
    return noRoute();
  }
  const parts = rel.split(sep);
  if (parts[0] === "media-library") return noRoute();
  if (parts[0]?.startsWith("ralphy.db")) {
    return { catalog: true };
  }
  if (parts[0] === "registry.json") {
    return { catalog: true };
  }
  if (parts[0] === "buckets") {
    if (parts.length <= 2) return { catalog: true };
    if (parts[2] === "shared") return { catalog: true };
    if (parts[2] !== "projects") return noRoute();
    return { catalog: parts.length <= 4 };
  }
  if (parts[0] !== "workspaces") return noRoute();
  if (parts.length <= 2) return { catalog: true };
  if (parts[2] === "workspace.json" || parts[2] === "shared") {
    return { catalog: true };
  }
  if (parts[2] !== "projects") return noRoute();
  if (parts.length <= 4) return { catalog: true };
  const projectRelativePath = parts.slice(4).join("/").toLowerCase();
  const catalog = !projectRelativePath.includes("/")
    && CATALOG_PROJECT_FILES.has(projectRelativePath);
  return { catalog };
}

export class LibraryWatcher {
  readonly #options: LibraryWatcherOptions;
  #watchers: FSWatcher[] = [];
  #catalogTimer: ReturnType<typeof setTimeout> | null = null;
  #rootPath = "";
  #lifecycleGeneration = 0;

  constructor(options: LibraryWatcherOptions) {
    this.#options = options;
  }

  async start(): Promise<boolean> {
    this.close();
    const lifecycleGeneration = this.#lifecycleGeneration;
    this.#rootPath = await validateLibraryRoot(this.#options.rootPath);
    if (lifecycleGeneration !== this.#lifecycleGeneration) return false;
    const handle = (basePath: string, filename: string | Buffer | null): void => {
      if (lifecycleGeneration !== this.#lifecycleGeneration) return;
      const changedPath = filename ? join(basePath, filename.toString()) : basePath;
      const route = routeLibraryChange(this.#rootPath, changedPath);
      if (route.catalog) this.#debounceCatalog();
    };
    const onError = (error: Error): void => this.#options.onError?.(error);
    const watchFileSystem = this.#options.watchFileSystem ?? watch;
    try {
      const rootWatcher = watchFileSystem(this.#rootPath, (event, filename) => {
        void event;
        handle(this.#rootPath, filename);
      });
      this.#watchers.push(rootWatcher);
      rootWatcher.on("error", onError);
      const workspacesPath = join(
        this.#rootPath,
        await isDomainLibraryRoot(this.#rootPath) ? "buckets" : "workspaces",
      );
      const workspaceWatcher = watchFileSystem(
        workspacesPath,
        { recursive: true },
        (event, filename) => {
          void event;
          handle(workspacesPath, filename);
        },
      );
      this.#watchers.push(workspaceWatcher);
      workspaceWatcher.on("error", onError);
      // Recursive macOS watchers can return before the FSEvents stream is armed.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return lifecycleGeneration === this.#lifecycleGeneration;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close(): void {
    this.#lifecycleGeneration += 1;
    for (const watcher of this.#watchers) {
      try {
        watcher.close();
      } catch {
        // Continue closing the remaining filesystem handles.
      }
    }
    this.#watchers = [];
    if (this.#catalogTimer) clearTimeout(this.#catalogTimer);
    this.#catalogTimer = null;
  }

  #debounceCatalog(): void {
    if (this.#catalogTimer) clearTimeout(this.#catalogTimer);
    this.#catalogTimer = setTimeout(() => {
      this.#catalogTimer = null;
      this.#options.onCatalogChange();
    }, this.#options.debounceMs ?? 100);
  }
}
