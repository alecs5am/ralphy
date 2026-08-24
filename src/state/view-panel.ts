import {
  HOME_TAB_ID,
  VIEW_PANEL_DEFAULT,
  capChatPanels,
  VIEW_PANEL_MIN,
  VIEW_PANEL_STORED_MAX,
  WORKSPACE_PAGE_LABELS,
  normalizeTabSet,
  type ViewChatPanel,
  type ViewPanelPreferences,
  type ViewTab,
  type ViewTabSet,
  type ViewTabType,
  type WorkspacePage,
} from "./workbench";

/* Re-exported so a component reaches for one module: the shapes are persisted state and live
   beside the other preferences, but the panel is one idea and this is where it is named. */
export { HOME_TAB_ID, VIEW_PANEL_DEFAULT, VIEW_PANEL_MIN, VIEW_PANEL_STORED_MAX, capChatPanels };
export type { ViewChatPanel, ViewPanelPreferences, ViewTab, ViewTabSet, ViewTabType };

/**
 * The chat lens' view panel: a tab strip over the work route.
 *
 * Handoff 14 called a view "a place, not a message" and gave the tab set to the workspace, so it
 * survived switching chats. The 2026-08-24 review reverses that half: a chat is a piece of work,
 * and the places open beside it -- and the width it stands at -- are part of that work, so both
 * are keyed by chat. What has not changed is that the panel is navigation *for the work route*
 * and not a second render tree: a tab holds what the route needs to be restored, activating a tab
 * moves the route, and the route's own screen fills the page card. A second tree would mean two
 * mounted copies of every screen and two sources of truth for where you are.
 *
 * The one page that is not a route is the home tab, which is the panel's own workspace hub.
 */

/** The type catalogue the `+` menu, the tab strip and the hub tiles all read. */
export interface ViewTypeDescriptor {
  type: Exclude<ViewTabType, "home">;
  label: string;
  /** A singleton raises its existing tab; a document opens its own. */
  singleton: boolean;
  /** The command id whose chord opens this type, when one is bound. */
  command: string | null;
}

export const VIEW_TYPES: readonly ViewTypeDescriptor[] = [
  { type: "overview", label: WORKSPACE_PAGE_LABELS.overview, singleton: true, command: null },
  { type: "projects", label: WORKSPACE_PAGE_LABELS.projects, singleton: true, command: null },
  { type: "units", label: WORKSPACE_PAGE_LABELS.units, singleton: true, command: "view.units" },
  { type: "calendar", label: WORKSPACE_PAGE_LABELS.calendar, singleton: true, command: "view.calendar" },
  { type: "shared", label: WORKSPACE_PAGE_LABELS.shared, singleton: true, command: "view.shared" },
  { type: "memory", label: WORKSPACE_PAGE_LABELS.memory, singleton: true, command: "view.memory" },
  { type: "project", label: "Project", singleton: false, command: null },
  /* One browser per chat, not one per page: a second blank tab is a tab you have to name before
     it is worth anything, and the strip already has the chat's places on it. */
  { type: "browser", label: "Browser", singleton: true, command: null },
];

/**
 * The handoff's catalogue is wider than the app: Renders, Compare and Side chat have no
 * runtime behind them, and the omnibox needs a cross-workspace search index that does not exist.
 * They are named here rather than drawn as menu rows that cannot open anything — the same
 * decision the settings pages make for a contract Core does not serve yet.
 */
export const VIEW_TYPES_UNAVAILABLE = ["Renders", "Compare", "Side chat"] as const;

const WORKSPACE_PAGE_BY_TYPE: Partial<Record<ViewTabType, WorkspacePage>> = {
  overview: "overview",
  projects: "projects",
  units: "units",
  shared: "shared",
  memory: "memory",
  calendar: "calendar",
};

/**
 * The types that are workspace pages. The `+` menu opens everything a panel can hold, including
 * the browser, which is not a page of the workspace at all; the hub's tiles are about the
 * workspace, so they read this list instead of "every singleton".
 */
export const WORKSPACE_VIEW_TYPES = VIEW_TYPES.filter(({ type }) => WORKSPACE_PAGE_BY_TYPE[type]);

/** The work page a tab lands on, or null when the tab is the hub, a project or the browser. */
export function workspacePageForTab(tab: ViewTab): WorkspacePage | null {
  return WORKSPACE_PAGE_BY_TYPE[tab.type] ?? null;
}

export function tabSetFor(record: ViewPanelPreferences, chatId: string | null): ViewTabSet {
  return normalizeTabSet(chatId ? record.byChat[chatId] : undefined);
}

/** How wide the panel stands beside this chat, falling back to the width a new chat inherits. */
export function panelWidthFor(record: ViewPanelPreferences, chatId: string | null): number {
  return (chatId ? record.byChat[chatId]?.width : undefined) ?? record.width;
}

export interface OpenViewRequest {
  type: Exclude<ViewTabType, "home">;
  targetId?: string | null;
  label: string;
}

/**
 * Opening a view: raise the tab this place already has, or append one. A singleton matches on its
 * type, a document on its type and target, so a place is on the strip exactly once.
 *
 * The handoff's ⌘-click rule -- a second tab for the same target -- is not here. It exists for
 * opening a chat result beside the one you are reading, and nothing in the chat opens views yet;
 * with two tabs for one target, "raise the tab this place has" stops having one answer, and the
 * strip could show a tab that clicking cannot reach.
 */
export function openViewTab(set: ViewTabSet, request: OpenViewRequest): ViewTabSet {
  const targetId = request.targetId ?? null;
  const existing = set.tabs.find((tab) => (
    tab.type === request.type && (VIEW_TYPES.find(({ type }) => type === request.type)?.singleton
      ? true
      : tab.targetId === targetId)
  ));
  if (existing) {
    return existing.id === set.activeTabId && existing.label === request.label
      ? set
      : {
        tabs: set.tabs.map((tab) => tab.id === existing.id ? { ...tab, label: request.label } : tab),
        activeTabId: existing.id,
      };
  }
  const id = `${request.type}:${targetId ?? "self"}:${set.tabs.length}:${set.tabs.reduce((sum, tab) => sum + tab.id.length, 0)}`;
  const tab: ViewTab = { id, type: request.type, targetId, label: request.label };
  return { tabs: [...set.tabs, tab], activeTabId: id };
}

/** Closing a tab. Home cannot be closed; the neighbour to the left takes over. */
export function closeViewTab(set: ViewTabSet, id: string): ViewTabSet {
  if (id === HOME_TAB_ID) return set;
  const index = set.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return set;
  const tabs = set.tabs.filter((tab) => tab.id !== id);
  const activeTabId = set.activeTabId === id ? tabs[Math.max(0, index - 1)]!.id : set.activeTabId;
  return { tabs, activeTabId };
}

/** ⌥⌘←/→: the strip wraps, so the shortcut never dead-ends on the first or last tab. */
export function stepViewTab(set: ViewTabSet, delta: 1 | -1): ViewTabSet {
  const index = set.tabs.findIndex((tab) => tab.id === set.activeTabId);
  const next = (index + delta + set.tabs.length) % set.tabs.length;
  return next === index ? set : { ...set, activeTabId: set.tabs[next]!.id };
}

/**
 * A browser tab is the one tab whose place moves under it: its page is its own state rather than
 * a route, so following a link renames the tab and re-targets it. Every other type is re-targeted
 * by being opened again.
 */
export function retargetViewTab(set: ViewTabSet, id: string, targetId: string, label: string): ViewTabSet {
  const tab = set.tabs.find((candidate) => candidate.id === id);
  if (!tab || (tab.targetId === targetId && tab.label === label)) return set;
  return {
    ...set,
    tabs: set.tabs.map((candidate) => candidate.id === id ? { ...candidate, targetId, label } : candidate),
  };
}

export function selectViewTab(set: ViewTabSet, id: string): ViewTabSet {
  return set.activeTabId === id || !set.tabs.some((tab) => tab.id === id) ? set : { ...set, activeTabId: id };
}

export function activeViewTab(set: ViewTabSet): ViewTab {
  return set.tabs.find(({ id }) => id === set.activeTabId) ?? set.tabs[0]!;
}
