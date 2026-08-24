import { describe, expect, test } from "vitest";
import type {
  CatalogResult,
  ProjectSummary,
  WorkspaceSummary,
} from "../electron/media/types";
import {
  createInitialWorkbenchState,
  mostRecentWorkspaceId,
  readWorkbenchPreferences,
  sortProjects,
  sortWorkspaces,
  updateWorkbenchPreferences,
  workbenchReducer,
  writeWorkbenchPreferences,
} from "../src/state/workbench";
import {
  marketplaceReducer,
  readMarketplaceNavigation,
  writeMarketplaceNavigation,
} from "../src/state/marketplace-navigation";

const rootPath = "/tmp/demo/.ralphy";

function workspace(
  id: string,
  recentActivity: string,
): WorkspaceSummary {
  return {
    id,
    name: id,
    description: "",
    absolutePath: `${rootPath}/workspaces/${id}`,
    projectCount: 1,
    sharedCount: 0,
    unitCount: 0,
    finalCount: 0,
    recentActivity,
  };
}

function project(
  workspaceId: string,
  projectId: string,
  recentActivity: string,
): ProjectSummary {
  return {
    id: `${workspaceId}/${projectId}`,
    workspaceId,
    projectId,
    name: projectId,
    brief: "",
    status: "assets",
    phase: "production",
    finalState: "review",
    platform: null,
    aspectRatio: null,
    spendUsd: null,
    finalCount: 0,
    sharedCount: 0,
    unitCount: 0,
    recentActivity,
  };
}

const workspaces = [
  workspace("older", "2026-07-20T00:00:00.000Z"),
  workspace("newer", "2026-07-30T00:00:00.000Z"),
];
const projects = [
  project("newer", "older-project", "2026-07-21T00:00:00.000Z"),
  project("newer", "newer-project", "2026-07-29T00:00:00.000Z"),
];
const catalog: CatalogResult = {
  rootPath,
  generation: 4,
  workspaces,
  projects,
  mediaItemCount: 0,
  completedAt: "2026-07-30T00:00:01.000Z",
};

describe("workbench navigation", () => {
  test("opening another library resets route history", () => {
    let state = createInitialWorkbenchState();
    state = workbenchReducer(state, { type: "catalog-received", catalog });
    state = workbenchReducer(state, { type: "open-workspace", workspaceId: "newer" });
    state = workbenchReducer(state, {
      type: "open-project",
      project: { workspaceId: "newer", projectId: "newer-project" },
    });

    state = workbenchReducer(state, {
      type: "library-opened",
      catalog: { ...catalog, rootPath: "/tmp/other/.ralphy", generation: 1 },
      workspaceId: "newer",
    });

    expect(state.route).toEqual({ kind: "workspace", workspaceId: "newer" });
    expect(state.history).toEqual([{ kind: "workspace", workspaceId: "newer" }]);
  });

  test("moves Workspace -> Project and back without losing workspace context", () => {
    let state = createInitialWorkbenchState();
    state = workbenchReducer(state, { type: "catalog-received", catalog });
    state = workbenchReducer(state, { type: "open-workspace", workspaceId: "newer" });
    expect(state.route).toEqual({ kind: "workspace", workspaceId: "newer" });

    state = workbenchReducer(state, {
      type: "open-project",
      project: { workspaceId: "newer", projectId: "newer-project" },
    });
    expect(state.route).toEqual({
      kind: "project",
      workspaceId: "newer",
      projectId: "newer-project",
    });

    state = workbenchReducer(state, { type: "back" });
    expect(state.route).toEqual({ kind: "workspace", workspaceId: "newer" });
    state = workbenchReducer(state, { type: "forward" });
    expect(state.route).toEqual({
      kind: "project",
      workspaceId: "newer",
      projectId: "newer-project",
    });
  });

  test("rejects stale catalog results", () => {
    let state = createInitialWorkbenchState();
    state = workbenchReducer(state, { type: "catalog-received", catalog });
    state = workbenchReducer(state, {
      type: "catalog-received",
      catalog: { ...catalog, generation: 3, workspaces: [] },
    });
    expect(state.catalog?.workspaces).toHaveLength(2);

  });

  test("keeps catalog refreshes on the nearest valid workspace route", () => {
    let state = createInitialWorkbenchState();
    state = workbenchReducer(state, {
      type: "library-opened",
      catalog,
      workspaceId: "newer",
    });
    state = workbenchReducer(state, {
      type: "open-project",
      project: { workspaceId: "newer", projectId: "newer-project" },
    });

    state = workbenchReducer(state, {
      type: "catalog-received",
      catalog: {
        ...catalog,
        generation: 5,
        projects: projects.filter((item) => item.projectId !== "newer-project"),
      },
    });
    expect(state.route).toEqual({ kind: "workspace", workspaceId: "newer" });
    expect(state.history[state.historyIndex]).toEqual(state.route);

    state = workbenchReducer(state, {
      type: "catalog-received",
      catalog: {
        ...catalog,
        generation: 6,
        workspaces: [workspaces[0]],
        projects: [],
      },
    });
    expect(state.route).toEqual({ kind: "workspace", workspaceId: "older" });

    state = workbenchReducer(state, {
      type: "catalog-received",
      catalog: {
        ...catalog,
        generation: 7,
        workspaces: [],
        projects: [],
      },
    });
    expect(state.route).toEqual({ kind: "library" });
  });

  test("opens each project once and closes the active tab to its workspace", () => {
    let state = createInitialWorkbenchState();
    state = workbenchReducer(state, { type: "library-opened", catalog, workspaceId: "newer" });
    const projectRef = { workspaceId: "newer", projectId: "newer-project" };

    state = workbenchReducer(state, { type: "open-project", project: projectRef });
    state = workbenchReducer(state, { type: "open-project", project: projectRef });

    expect((state as unknown as { tabs: unknown[] }).tabs).toEqual([projectRef]);
    expect(state.route).toEqual({ kind: "project", ...projectRef });

    state = workbenchReducer(state, {
      type: "close-project-tab",
      project: projectRef,
    } as never);

    expect((state as unknown as { tabs: unknown[] }).tabs).toEqual([]);
    expect(state.route).toEqual({ kind: "workspace", workspaceId: "newer" });
  });

});

describe("workbench ordering and preferences", () => {
  test("keeps pinned entries first and sorts each group by activity", () => {
    expect(sortWorkspaces(workspaces, ["older"]).map((item) => item.id)).toEqual([
      "older",
      "newer",
    ]);
    expect(sortProjects(projects, ["newer/newer-project"]).map((item) => item.id)).toEqual([
      "newer/newer-project",
      "newer/older-project",
    ]);
  });

  test("selects the newest workspace when no valid preference exists", () => {
    expect(mostRecentWorkspaceId(workspaces)).toBe("newer");
    expect(mostRecentWorkspaceId([])).toBeNull();
  });

  test("defaults to an open sidebar and preferred right rail while the terminal stays closed", () => {
    const preferences = readWorkbenchPreferences({
      getItem: () => null,
      setItem: () => undefined,
    });

    expect(preferences).toMatchObject({
      theme: "system",
      sidebarVisible: true,
      rightPanelVisible: true,
      bottomPanelVisible: false,
      workspaceView: "grid",
      sidebarWidth: 260,
      rightPanelWidth: 292,
      bottomPanelHeight: 220,
    });
  });

  test("falls back to the system theme for malformed or unsupported preferences", () => {
    const read = (value: string) => readWorkbenchPreferences({
      getItem: () => value,
      setItem: () => undefined,
    });

    expect(read(JSON.stringify({ theme: "sepia" })).theme).toBe("system");
    expect(read("not-json").theme).toBe("system");
  });

  test("falls back to complete defaults when preference reads are denied", () => {
    const preferences = readWorkbenchPreferences({
      getItem: () => { throw new DOMException("denied", "SecurityError"); },
      setItem: () => undefined,
    });

    expect(preferences).toMatchObject({
      theme: "system",
      rootPath: null,
      workspaceId: null,
      projectId: null,
      sidebarVisible: true,
      rightPanelVisible: true,
    });
  });

  test("preserves an explicit closed right-rail preference and repairs invalid values", () => {
    const read = (value: unknown) => readWorkbenchPreferences({
      getItem: () => JSON.stringify({ rightPanelVisible: value }),
      setItem: () => undefined,
    });

    expect(read(false).rightPanelVisible).toBe(false);
    expect(read(true).rightPanelVisible).toBe(true);
    expect(read("closed").rightPanelVisible).toBe(true);
    expect(read(null).rightPanelVisible).toBe(true);
  });

  test("reports denied preference writes without throwing", () => {
    const preferences = readWorkbenchPreferences({
      getItem: () => null,
      setItem: () => undefined,
    });
    const denied = {
      getItem: () => null,
      setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
    };

    expect(writeWorkbenchPreferences(denied, { ...preferences, theme: "dark" })).toBe(false);
  });

  test("functionally updates one preference without replacing sibling state", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const saved = {
      ...readWorkbenchPreferences(storage),
      rootPath,
      workspaceId: "newer",
      projectId: "newer-project",
      sidebarVisible: false,
      rightPanelVisible: true,
      sidebarWidth: 372,
    };
    writeWorkbenchPreferences(storage, saved);

    expect(updateWorkbenchPreferences(storage, (current) => ({ ...current, theme: "light" }))).toBe(true);
    expect(readWorkbenchPreferences(storage)).toEqual({ ...saved, theme: "light" });
  });

  test("clamps persisted panel sizes to usable bounds", () => {
    const preferences = readWorkbenchPreferences({
      getItem: () => JSON.stringify({
        sidebarWidth: 10_000,
        rightPanelWidth: 1,
        bottomPanelHeight: -40,
      }),
      setItem: () => undefined,
    });

    expect(preferences.sidebarWidth).toBe(420);
    expect(preferences.rightPanelWidth).toBe(292);
    expect(preferences.bottomPanelHeight).toBe(160);

    const compact = readWorkbenchPreferences({
      getItem: () => JSON.stringify({ sidebarWidth: 1 }),
      setItem: () => undefined,
    });
    expect(compact.sidebarWidth).toBe(216);
  });

  test("round-trips app-local navigation, panels, view, and pins", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preferences = {
      rootPath,
      workspaceId: "newer",
      projectId: "newer-project",
      pinnedWorkspaceIds: ["newer"],
      pinnedProjectIds: ["newer/newer-project"],
      workspacePage: "projects",
      sidebarVisible: false,
      lens: "desk" as const,
      rightPanelVisible: true,
      bottomPanelVisible: true,
      workspaceView: "list" as const,
      sidebarWidth: 320,
      rightPanelWidth: 400,
      bottomPanelHeight: 280,
      theme: "light" as const,
      /* Handoff 14's panel is stored state too, so the round trip has to carry it. */
      viewPanel: {
        open: false,
        width: 520,
        tabsByWorkspace: {
          newer: {
            tabs: [
              { id: "home", type: "home" as const, targetId: null, label: "Workspace" },
              { id: "calendar:self:1", type: "calendar" as const, targetId: null, label: "Calendar" },
            ],
            activeTabId: "calendar:self:1",
          },
        },
      },
    };

    writeWorkbenchPreferences(storage, preferences);
    expect(readWorkbenchPreferences(storage)).toEqual(preferences);
  });

  test("persists Marketplace and My Work sidebar memory independently", () => {
    const values = new Map<string, string>();
    const shared = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } satisfies Storage;
    const preferences = {
      ...readWorkbenchPreferences(shared),
      sidebarVisible: true,
      sidebarWidth: 372,
    };
    writeWorkbenchPreferences(shared, preferences);
    const marketplace = marketplaceReducer(
      readMarketplaceNavigation(shared),
      { type: "toggle-sidebar" },
    );
    writeMarketplaceNavigation(shared, marketplace);

    expect(readWorkbenchPreferences(shared).sidebarWidth).toBe(372);
    expect(readWorkbenchPreferences(shared).sidebarVisible).toBe(true);
    expect(readMarketplaceNavigation(shared).sidebarVisible).toBe(false);
  });
});
