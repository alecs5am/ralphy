import type { CatalogResult, ProjectReference } from "../../../electron/media/types";
import type { ThemePreference } from "../instrument/types";
import type { WorkspacePage, WorkspaceView } from "./workspace-pages";
import { mostRecentWorkspaceId } from "./workbench-sorting";
import type { ViewPanelPreferences } from "./view-panel-state";

/* The workbench's model is four files: this one holds the state and the reducer, and the other
   three hold the pages, the view panel's stored shapes, the ordering and the preference store.
   They are re-exported here because `@/shared/model/workbench` is the address the app knows. */
export * from "./workspace-pages";
export * from "./view-panel-state";
export * from "./workbench-sorting";
export * from "./workbench-preferences-store";

export type WorkbenchRoute =
  | { kind: "library" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; workspaceId: string; projectId: string };


export interface WorkspaceCalendarNavigationContext {
  label: string;
  date?: number;
  unitId?: string;
  accountId?: string;
  accountLabel?: string;
}

export type WorkspaceDestination = (
  | { page: "calendar"; context?: WorkspaceCalendarNavigationContext }
  | { page: Exclude<WorkspacePage, "calendar">; context?: { label: string } }
) & { returnFocusId: string };

export interface WorkspaceOverviewReturnState {
  originWorkspaceId: string;
  scrollTop: number;
  attentionExpanded: boolean;
  returnFocusId: string;
}



export interface WorkbenchPreferences {
  theme: ThemePreference;
  rootPath: string | null;
  workspaceId: string | null;
  projectId: string | null;
  pinnedWorkspaceIds: string[];
  pinnedProjectIds: string[];
  workspacePage: WorkspacePage;
  sidebarVisible: boolean;
  /* Handoff 13's lens: how you are working inside My Work, as against `AppMode`, which is where
     you are. The desk lens gives the route the wide column; the chat lens swaps them, so the
     agent takes the centre and the route stands beside it as a view panel. */
  lens: WorkbenchLens;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  workspaceView: WorkspaceView;
  sidebarWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  viewPanel: ViewPanelPreferences;
}

export type WorkbenchLens = "desk" | "chat";

export interface WorkbenchState {
  route: WorkbenchRoute;
  history: WorkbenchRoute[];
  historyIndex: number;
  catalog: CatalogResult | null;
  catalogGeneration: number;
  pinnedWorkspaceIds: string[];
  pinnedProjectIds: string[];
  tabs: ProjectReference[];
}

export type WorkbenchAction =
  | { type: "library-opened"; catalog: CatalogResult; workspaceId: string | null }
  | { type: "catalog-received"; catalog: CatalogResult }
  | { type: "open-library" }
  | { type: "open-workspace"; workspaceId: string }
  | { type: "open-project"; project: ProjectReference }
  | { type: "close-project-tab"; project: ProjectReference }
  | { type: "back" }
  | { type: "forward" }
  | { type: "toggle-workspace-pin"; workspaceId: string }
  | { type: "toggle-project-pin"; projectId: string };


export const PANEL_SIZE_LIMITS = {
  sidebar: { min: 216, max: 420, default: 260 },
  right: { min: 292, max: 1_000, default: 292 },
  bottom: { min: 160, max: 720, default: 220 },
} as const;

export function createInitialWorkbenchState(
  preferences?: Partial<WorkbenchPreferences>,
): WorkbenchState {
  return {
    route: { kind: "library" },
    history: [{ kind: "library" }],
    historyIndex: 0,
    catalog: null,
    catalogGeneration: -1,
    pinnedWorkspaceIds: preferences?.pinnedWorkspaceIds ?? [],
    pinnedProjectIds: preferences?.pinnedProjectIds ?? [],
    tabs: [],
  };
}

function navigate(state: WorkbenchState, route: WorkbenchRoute): WorkbenchState {
  const current = state.history[state.historyIndex];
  if (JSON.stringify(current) === JSON.stringify(route)) return state;
  const history = [...state.history.slice(0, state.historyIndex + 1), route];
  return {
    ...state,
    route,
    history,
    historyIndex: history.length - 1,
  };
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function validRouteForCatalog(
  route: WorkbenchRoute,
  catalog: CatalogResult,
): WorkbenchRoute {
  const fallbackWorkspaceId = mostRecentWorkspaceId(catalog.workspaces);
  const fallback: WorkbenchRoute = fallbackWorkspaceId
    ? { kind: "workspace", workspaceId: fallbackWorkspaceId }
    : { kind: "library" };
  if (route.kind === "library") return fallback;
  if (!catalog.workspaces.some((workspace) => workspace.id === route.workspaceId)) {
    return fallback;
  }
  if (route.kind === "workspace") return route;
  return catalog.projects.some(
    (project) =>
      project.workspaceId === route.workspaceId &&
      project.projectId === route.projectId,
  )
    ? route
    : { kind: "workspace", workspaceId: route.workspaceId };
}

export function workbenchReducer(
  state: WorkbenchState,
  action: WorkbenchAction,
): WorkbenchState {
  switch (action.type) {
    case "library-opened": {
      const route: WorkbenchRoute = action.workspaceId
        ? { kind: "workspace", workspaceId: action.workspaceId }
        : { kind: "library" };
      return {
        ...state,
        route,
        history: [route],
        historyIndex: 0,
        catalog: action.catalog,
        catalogGeneration: action.catalog.generation,
        tabs: [],
      };
    }
    case "catalog-received":
      if (action.catalog.generation < state.catalogGeneration) return state;
      {
        const catalog = action.catalog;
        const route = validRouteForCatalog(state.route, catalog);
        const routeChanged = JSON.stringify(route) !== JSON.stringify(state.route);
        const tabs = state.tabs.filter((tab) => catalog.projects.some(
          (project) => project.workspaceId === tab.workspaceId && project.projectId === tab.projectId,
        ));
        return {
          ...state,
          route,
          history: routeChanged
            ? [...state.history.slice(0, state.historyIndex), route]
            : state.history,
          catalog,
          catalogGeneration: action.catalog.generation,
          tabs,
        };
      }
    case "open-library":
      return {
        ...state,
        route: { kind: "library" },
        historyIndex: 0,
      };
    case "open-workspace":
      return navigate(state, { kind: "workspace", workspaceId: action.workspaceId });
    case "open-project":
      return {
        ...navigate(state, { kind: "project", ...action.project }),
        tabs: state.tabs.some((tab) => (
          tab.workspaceId === action.project.workspaceId && tab.projectId === action.project.projectId
        )) ? state.tabs : [...state.tabs, action.project],
      };
    case "close-project-tab": {
      const index = state.tabs.findIndex((tab) => (
        tab.workspaceId === action.project.workspaceId && tab.projectId === action.project.projectId
      ));
      if (index < 0) return state;
      const tabs = state.tabs.filter((_, tabIndex) => tabIndex !== index);
      const active = state.route.kind === "project"
        && state.route.workspaceId === action.project.workspaceId
        && state.route.projectId === action.project.projectId;
      if (!active) return { ...state, tabs };
      const next = tabs[Math.min(index, tabs.length - 1)];
      return {
        ...navigate(
          { ...state, tabs },
          next ? { kind: "project", ...next } : { kind: "workspace", workspaceId: action.project.workspaceId },
        ),
        tabs,
      };
    }
    case "back": {
      if (state.historyIndex === 0) return state;
      const historyIndex = state.historyIndex - 1;
      return {
        ...state,
        route: state.history[historyIndex],
        historyIndex,
      };
    }
    case "forward": {
      if (state.historyIndex >= state.history.length - 1) return state;
      const historyIndex = state.historyIndex + 1;
      return {
        ...state,
        route: state.history[historyIndex],
        historyIndex,
      };
    }
    case "toggle-workspace-pin":
      return {
        ...state,
        pinnedWorkspaceIds: toggle(state.pinnedWorkspaceIds, action.workspaceId),
      };
    case "toggle-project-pin":
      return {
        ...state,
        pinnedProjectIds: toggle(state.pinnedProjectIds, action.projectId),
      };
  }
}

