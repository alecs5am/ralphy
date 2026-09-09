/**
 * The view panel's stored shapes, and the reads that make a stored value safe to use.
 *
 * Nothing here does anything to the panel -- `state/view-panel.ts` owns that. This is the shape
 * on disk plus the parse that turns whatever was on disk into that shape.
 */
import { WORKSPACE_PAGES } from "./workspace-pages";

/**
 * Handoff 14's view panel, as stored state. The shapes live here beside the other persisted
 * preferences; `state/view-panel.ts` owns what you can *do* to them.
 *
 * `open` is one window-level decision. The width is not: the 2026-08-24 review asks for the tab
 * set *and* the width to follow the chat, so the width lives in each chat's record and the
 * top-level `width` is only what a chat that has never been sized inherits.
 */
export const VIEW_TAB_TYPES = ["home", ...WORKSPACE_PAGES, "project", "browser"] as const;
export type ViewTabType = (typeof VIEW_TAB_TYPES)[number];
export const HOME_TAB_ID = "home";
export const VIEW_PANEL_MIN = 380;
export const VIEW_PANEL_DEFAULT = 440;
/* There is no design maximum any more: the panel may take the window, and what stops it is the
   chat's own floor, which the shell computes from the live frame. This is only a sanity bound on a
   stored number -- a width wider than any display is a corrupt record, not a preference. */
export const VIEW_PANEL_STORED_MAX = 4_000;

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

/* One chat's panel: what it has open and how wide it stands. */
export interface ViewChatPanel extends ViewTabSet {
  width: number;
}

export interface ViewPanelPreferences {
  open: boolean;
  /* The width a chat that has never been sized inherits. */
  width: number;
  /* Keyed by chat, not by workspace. A chat is a piece of work, and what stands beside it -- the
     tabs and the panel's width -- is part of that work: switching chats used to leave the previous
     chat's places open beside the new one. A chat belongs to exactly one workspace, so keying by
     chat is also keying by workspace. */
  byChat: Record<string, ViewChatPanel>;
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
  byChat: {},
};

const isViewTab = (value: unknown): value is ViewTab => {
  const candidate = value as Partial<ViewTab> | null;
  return !!candidate
    && typeof candidate.id === "string"
    && typeof candidate.label === "string"
    && VIEW_TAB_TYPES.includes(candidate.type as ViewTabType);
};

/* A chat that is gone leaves its panel behind, and nothing here knows which chats still exist --
   the chat list is the agent's own state and is itself capped. So the record is capped too, at the
   same order of magnitude, oldest first. Without it every chat ever opened stays in the
   preferences blob forever. */
const MAX_CHAT_PANELS = 40;

export function capChatPanels(byChat: Record<string, ViewChatPanel>): Record<string, ViewChatPanel> {
  const keys = Object.keys(byChat);
  return keys.length <= MAX_CHAT_PANELS
    ? byChat
    : Object.fromEntries(keys.slice(keys.length - MAX_CHAT_PANELS).map((key) => [key, byChat[key]!]));
}

export function readViewPanelWidth(value: unknown, fallback = VIEW_PANEL_DEFAULT): number {
  return Number.isFinite(value)
    ? Math.min(VIEW_PANEL_STORED_MAX, Math.max(VIEW_PANEL_MIN, Math.round(value as number)))
    : fallback;
}

/** A stored panel is user state, not a contract, so every field is read defensively. */
export function readViewPanel(value: unknown): ViewPanelPreferences {
  const record = (value ?? {}) as Partial<ViewPanelPreferences>;
  const stored = (record.byChat ?? {}) as Record<string, unknown>;
  const width = readViewPanelWidth(record.width);
  return {
    open: record.open !== false,
    width,
    byChat: capChatPanels(Object.fromEntries(Object.entries(stored).flatMap(([chatId, entry]) => {
      const candidate = entry as Partial<ViewChatPanel> | null;
      const tabs = Array.isArray(candidate?.tabs) ? candidate!.tabs.filter(isViewTab) : [];
      return tabs.length ? [[chatId, {
        ...normalizeTabSet({ tabs, activeTabId: candidate?.activeTabId }),
        width: readViewPanelWidth(candidate?.width, width),
      }]] : [];
    }))),
  };
}
