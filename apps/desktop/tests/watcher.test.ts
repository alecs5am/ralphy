import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LibraryWatcher, routeLibraryChange } from "../electron/media/watcher";
import { makeLibraryFixture, type LibraryFixture } from "./fixtures";

const root = "/tmp/example/.ralphy";
let fixture: LibraryFixture | undefined;

afterEach(async () => {
  if (fixture) await rm(fixture.parentPath, { recursive: true, force: true });
  fixture = undefined;
});

describe("watcher path routing", () => {
  test.each([
    ["registry", join(root, "registry.json")],
    ["workspace metadata", join(root, "workspaces", "studio", "workspace.json")],
    ["project structure", join(root, "workspaces", "studio", "projects", "new-001")],
    ["selected production plan", join(root, "workspaces", "studio", "projects", "alpha-001", "production-plan.json")],
  ])("refreshes the shallow catalog for %s changes", (_label, path) => {
    expect(routeLibraryChange(root, path).catalog).toBe(true);
  });

  test("does not refresh the catalog for project media bytes", () => {
    const selectedMedia = join(root, "workspaces", "studio", "projects", "alpha-001", "artifacts", "hero.png");
    const inactiveMedia = join(root, "workspaces", "studio", "projects", "beta-001", "artifacts", "hero.png");

    expect(routeLibraryChange(root, selectedMedia)).toEqual({ catalog: false });
    expect(routeLibraryChange(root, inactiveMedia)).toEqual({ catalog: false });
  });

  test("routes SQLite and bucket changes for a domain library", () => {
    expect(routeLibraryChange(root, join(root, "ralphy.db-wal"))).toEqual({ catalog: true });
    expect(routeLibraryChange(
      root,
      join(root, "buckets", "studio", "projects", "alpha-001", "objects", "obj_one.mp4"),
    )).toEqual({ catalog: false });
  });

  test("ignores annotation writes and paths outside the active root", () => {
    expect(
      routeLibraryChange(root, join(root, "media-library", "library.json")),
    ).toEqual({ catalog: false });
    expect(routeLibraryChange(root, "/tmp/other/.ralphy/registry.json")).toEqual({ catalog: false });
  });
});

describe("watcher lifecycle", () => {
  test("does not attach watchers after close wins a start race", async () => {
    fixture = await makeLibraryFixture();
    const onCatalogChange = vi.fn();
    const watcher = new LibraryWatcher({
      rootPath: fixture.rootPath,
      onCatalogChange,
      debounceMs: 1,
    });

    const starting = watcher.start();
    watcher.close();
    await expect(starting).resolves.toBe(false);
    await writeFile(join(fixture.rootPath, "registry.json"), "{}");
    await new Promise((resolve) => setTimeout(resolve, 50));
    watcher.close();

    expect(onCatalogChange).not.toHaveBeenCalled();
  });

  test("closes attached watchers when close wins the readiness barrier", async () => {
    fixture = await makeLibraryFixture();
    let resolveAttached: (() => void) | undefined;
    const attached = new Promise<void>((resolve) => {
      resolveAttached = resolve;
    });
    const closeRoot = vi.fn();
    const closeWorkspaces = vi.fn();
    const rootWatcher = {
      close: closeRoot,
      on: vi.fn().mockReturnThis(),
    };
    const workspaceWatcher = {
      close: closeWorkspaces,
      on: vi.fn().mockReturnThis(),
    };
    const watchFileSystem = vi.fn()
      .mockReturnValueOnce(rootWatcher)
      .mockImplementationOnce(() => {
        resolveAttached?.();
        return workspaceWatcher;
      });
    const watcher = new LibraryWatcher({
      rootPath: fixture.rootPath,
      onCatalogChange: () => undefined,
      watchFileSystem: watchFileSystem as unknown as typeof import("node:fs").watch,
    });

    const starting = watcher.start();
    await attached;
    watcher.close();

    await expect(starting).resolves.toBe(false);
    expect(closeRoot).toHaveBeenCalledOnce();
    expect(closeWorkspaces).toHaveBeenCalledOnce();
  });

  test("closes the root watcher when recursive workspace watch creation fails", async () => {
    fixture = await makeLibraryFixture();
    const closeRoot = vi.fn();
    const rootWatcher = {
      close: closeRoot,
      on: vi.fn().mockReturnThis(),
    };
    const watchFileSystem = vi.fn()
      .mockReturnValueOnce(rootWatcher)
      .mockImplementationOnce(() => {
        throw new Error("recursive watch unavailable");
      });
    const watcher = new LibraryWatcher({
      rootPath: fixture.rootPath,
      onCatalogChange: () => undefined,
      watchFileSystem: watchFileSystem as unknown as typeof import("node:fs").watch,
    });

    await expect(watcher.start()).rejects.toThrow("recursive watch unavailable");
    expect(closeRoot).toHaveBeenCalledOnce();
    watcher.close();
    expect(closeRoot).toHaveBeenCalledOnce();
  });
});
