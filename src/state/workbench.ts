import type {
  CatalogResult,
  ProjectReference,
  ProjectSummary,
  WorkspaceSummary,
} from "../../electron/media/types";
import { parseThemePreference } from "../instrument/theme";
import type { ThemePreference } from "../instrument/types";

export type WorkbenchRoute =
  | { kind: "library" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; workspaceId: string; projectId: string };

export type WorkspaceView = "grid" | "list";
export const WORKSPACE_PAGES = ["overview", "projects", "units", "shared", "memory", "calendar"] as const;
export type WorkspacePage = (typeof WORKSPACE_PAGES)[number];

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

/**
 * Handoff 14's view panel, as stored state. The shapes live here beside the other persisted
 * preferences; `state/view-panel.ts` owns what you can *do* to them.
 *
 * `open` and `width` are one window-level decision -- you size the panel once and it stays that
 * width wherever you are -- so they sit beside the tab sets rather than inside each of them. The
 * handoff's own shape nests width per workspace; a panel that resized itself when you switched
 * workspace would read as a bug, and its "memory per workspace" rule names the tab set, the
 * active tab and the scroll, not the chrome.
 */
export const VIEW_TAB_TYPES = ["home", ...WORKSPACE_PAGES, "project"] as const;
export type ViewTabType = (typeof VIEW_TAB_TYPES)[number];
export const HOME_TAB_ID = "home";
export const VIEW_PANEL_MIN = 380;
export const VIEW_PANEL_MAX = 560;
export const VIEW_PANEL_DEFAULT = 440;

export interface ViewTab {
  id: string;
  type: ViewTabType;
  /** A document tab's target. Null for the home tab and for the workspace singletons. */
  targetId: string | null;
  label: string;
}

export interface ViewTabSet {
  tabs: ViewTab[];
  activeTabId: string;
}

export interface ViewPanelPreferences {
  open: boolean;
  width: number;
  tabsByWorkspace: Record<string, ViewTabSet>;
}

export function homeTab(): ViewTab {
  return { id: HOME_TAB_ID, type: "home", targetId: null, label: "Workspace" };
}

/** Home is always first and always present, however the stored record got there. */
export function normalizeTabSet(value: Partial<ViewTabSet> | undefined): ViewTabSet {
  const rest = (value?.tabs ?? []).filter((tab) => tab.type !== "home" && tab.id !== HOME_TAB_ID);
  const tabs = [homeTab(), ...rest];
  const activeTabId = tabs.some(({ id }) => id === value?.activeTabId) ? value!.activeTabId! : HOME_TAB_ID;
  return { tabs, activeTabId };
}

export const EMPTY_VIEW_PANEL: ViewPanelPreferences = {
  open: true,
  width: VIEW_PANEL_DEFAULT,
  tabsByWorkspace: {},
};

const isViewTab = (value: unknown): value is ViewTab => {
  const candidate = value as Partial<ViewTab> | null;
  return !!candidate
    && typeof candidate.id === "string"
    && typeof candidate.label === "string"
    && VIEW_TAB_TYPES.includes(candidate.type as ViewTabType);
};

/** A stored panel is user state, not a contract, so every field is read defensively. */
export function readViewPanel(value: unknown): ViewPanelPreferences {
  const record = (value ?? {}) as Partial<ViewPanelPreferences>;
  const stored = (record.tabsByWorkspace ?? {}) as Record<string, unknown>;
  return {
    open: record.open !== false,
    width: Number.isFinite(record.width)
      ? Math.min(VIEW_PANEL_MAX, Math.max(VIEW_PANEL_MIN, Math.round(record.width as number)))
      : VIEW_PANEL_DEFAULT,
    tabsByWorkspace: Object.fromEntries(Object.entries(stored).flatMap(([workspaceId, entry]) => {
      const candidate = entry as Partial<ViewTabSet> | null;
      const tabs = Array.isArray(candidate?.tabs) ? candidate!.tabs.filter(isViewTab) : [];
      return tabs.length ? [[workspaceId, normalizeTabSet({ tabs, activeTabId: candidate?.activeTabId })]] : [];
    })),
  };
}

export const WORKSPACE_PAGE_LABELS: Record<WorkspacePage, string> = {
  overview: "Overview",
  projects: "Projects",
  units: "Units",
  shared: "Shared library",
  memory: "Memory",
  calendar: "Calendar",
};

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

const PREFERENCES_KEY = "ralphy-media-workbench-v1";

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

function compareRecent<T extends { recentActivity: string; name: string }>(
  left: T,
  right: T,
): number {
  return (
    Date.parse(right.recentActivity) - Date.parse(left.recentActivity) ||
    left.name.localeCompare(right.name)
  );
}

function sortPinned<T extends { id: string; recentActivity: string; name: string }>(
  items: T[],
  pinnedIds: string[],
): T[] {
  const pinned = new Set(pinnedIds);
  return [...items].sort((left, right) => {
    const pinOrder = Number(pinned.has(right.id)) - Number(pinned.has(left.id));
    return pinOrder || compareRecent(left, right);
  });
}

export function sortWorkspaces(
  workspaces: WorkspaceSummary[],
  pinnedIds: string[],
): WorkspaceSummary[] {
  return sortPinned(workspaces, pinnedIds);
}

export function mostRecentWorkspaceId(
  workspaces: WorkspaceSummary[],
): string | null {
  return sortWorkspaces(workspaces, [])[0]?.id ?? null;
}

export function sortProjects(
  projects: ProjectSummary[],
  pinnedIds: string[],
): ProjectSummary[] {
  return sortPinned(projects, pinnedIds);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function panelSize(
  value: unknown,
  limits: { min: number; max: number; default: number },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

export function readWorkbenchPreferences(storage: StorageLike): WorkbenchPreferences {
  const empty: WorkbenchPreferences = {
    theme: "system",
    rootPath: null,
    workspaceId: null,
    projectId: null,
    pinnedWorkspaceIds: [],
    pinnedProjectIds: [],
    workspacePage: "overview",
    sidebarVisible: true,
    lens: "desk",
    rightPanelVisible: true,
    bottomPanelVisible: false,
    workspaceView: "grid",
    sidebarWidth: PANEL_SIZE_LIMITS.sidebar.default,
    rightPanelWidth: PANEL_SIZE_LIMITS.right.default,
    bottomPanelHeight: PANEL_SIZE_LIMITS.bottom.default,
    viewPanel: EMPTY_VIEW_PANEL,
  };
  try {
    const value = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return empty;
    const record = value as Record<string, unknown>;
    return {
      theme: parseThemePreference(record.theme),
      rootPath: typeof record.rootPath === "string" ? record.rootPath : null,
      workspaceId: typeof record.workspaceId === "string" ? record.workspaceId : null,
      projectId: typeof record.projectId === "string" ? record.projectId : null,
      pinnedWorkspaceIds: strings(record.pinnedWorkspaceIds),
      pinnedProjectIds: strings(record.pinnedProjectIds),
      workspacePage: WORKSPACE_PAGES.includes(record.workspacePage as WorkspacePage)
        ? record.workspacePage as WorkspacePage
        : "overview",
      sidebarVisible:
        typeof record.sidebarVisible === "boolean" ? record.sidebarVisible : true,
      lens: record.lens === "chat" ? "chat" : "desk",
      rightPanelVisible:
        typeof record.rightPanelVisible === "boolean" ? record.rightPanelVisible : true,
      bottomPanelVisible:
        typeof record.bottomPanelVisible === "boolean" ? record.bottomPanelVisible : false,
      workspaceView: record.workspaceView === "list" ? "list" : "grid",
      sidebarWidth: panelSize(record.sidebarWidth, PANEL_SIZE_LIMITS.sidebar),
      rightPanelWidth: panelSize(record.rightPanelWidth, PANEL_SIZE_LIMITS.right),
      bottomPanelHeight: panelSize(record.bottomPanelHeight, PANEL_SIZE_LIMITS.bottom),
      viewPanel: readViewPanel(record.viewPanel),
    };
  } catch {
    return empty;
  }
}

export function writeWorkbenchPreferences(
  storage: StorageLike,
  preferences: WorkbenchPreferences,
): boolean {
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function updateWorkbenchPreferences(
  storage: StorageLike,
  update: (current: WorkbenchPreferences) => WorkbenchPreferences,
): boolean {
  return writeWorkbenchPreferences(storage, update(readWorkbenchPreferences(storage)));
}
