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
  workbenchReducer,
  writeWorkbenchPreferences,
} from "../src/state/workbench";

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

  test("defaults to an open sidebar, closed utility panels, and workspace grid", () => {
    const preferences = readWorkbenchPreferences({
      getItem: () => null,
      setItem: () => undefined,
    });

    expect(preferences).toMatchObject({
      sidebarVisible: true,
      rightPanelVisible: false,
      bottomPanelVisible: false,
      workspaceView: "grid",
      sidebarWidth: 288,
      rightPanelWidth: 336,
      bottomPanelHeight: 220,
    });
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
    expect(preferences.rightPanelWidth).toBe(280);
    expect(preferences.bottomPanelHeight).toBe(160);

    const compact = readWorkbenchPreferences({
      getItem: () => JSON.stringify({ sidebarWidth: 1 }),
      setItem: () => undefined,
    });
    expect(compact.sidebarWidth).toBe(288);
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
      rightPanelVisible: true,
      bottomPanelVisible: true,
      workspaceView: "list" as const,
      sidebarWidth: 320,
      rightPanelWidth: 400,
      bottomPanelHeight: 280,
    };

    writeWorkbenchPreferences(storage, preferences);
    expect(readWorkbenchPreferences(storage)).toEqual(preferences);
  });
});
