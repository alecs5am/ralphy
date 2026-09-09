/**
 * Reading and writing the workbench's preferences, and refusing whatever the storage returns that
 * does not fit.
 *
 * Every read is defensive: a preference file is edited by hand, survives a downgrade, and is the
 * one input the app cannot validate at its source. A bad value falls back to the default rather
 * than reaching the reducer.
 */
import { parseThemePreference } from "../lib/theme";
import { EMPTY_VIEW_PANEL, readViewPanel } from "./view-panel-state";
import { PANEL_SIZE_LIMITS, type WorkbenchPreferences } from "./workbench";
import { WORKSPACE_PAGES, type WorkspacePage } from "./workspace-pages";

const PREFERENCES_KEY = "ralphy-media-workbench-v1";

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
