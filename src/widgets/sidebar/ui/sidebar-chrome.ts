/**
 * What the sidebar card is made of: its two route tables, its row vocabulary and the two readings
 * a row shows -- a page's count and a chat's last state.
 *
 * The strings live here rather than at the call sites because a row's surface and its ink are one
 * decision: assembled twice, they drift once.
 */
import {
  Boxes, Brain, CalendarDays, ChartNoAxesCombined, CircleAlert, Download, FolderOpen, Layers,
  Layers3, PackageCheck, Plus, Save, Sparkles, Store, UsersRound, WandSparkles,
  type LucideIcon,
} from "lucide-react";

import type { WorkspaceSummary } from "@/shared/api/ipc";
import type { WorkspacePage } from "@/shared/model/workbench";
import type { MarketplaceCategory, MarketplaceLibrarySection } from "@/shared/model/routes";

/* A conversation as the sidebar needs it: enough to draw a row and order the list, and nothing
   of the transcript -- the card must never hold a message. */
export interface SidebarChat {
  id: string;
  title: string;
  busy: boolean;
  updatedAt: number;
}

export const PAGE_ICONS: Record<WorkspacePage, LucideIcon> = {
  overview: ChartNoAxesCombined,
  projects: FolderOpen,
  units: UsersRound,
  shared: Boxes,
  memory: Brain,
  context: Layers,
  calendar: CalendarDays,
};

export const MARKETPLACE_CATEGORIES: Array<{ id: MarketplaceCategory; label: string; icon: LucideIcon }> = [
  { id: "models", label: "Models", icon: Boxes },
  { id: "templates", label: "Templates", icon: Layers3 },
  { id: "recipes", label: "Recipes", icon: WandSparkles },
  { id: "prompts", label: "Prompts", icon: Sparkles },
  { id: "components", label: "Components & Effects", icon: PackageCheck },
  { id: "skills", label: "Skills", icon: Store },
];

export const MARKETPLACE_LIBRARY: Array<{ id: MarketplaceLibrarySection; label: string; icon: LucideIcon }> = [
  { id: "installed", label: "Installed", icon: PackageCheck },
  { id: "saved", label: "Saved", icon: Save },
  { id: "added", label: "Added", icon: Plus },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "updates", label: "Updates", icon: Sparkles },
  { id: "attention", label: "Needs attention", icon: CircleAlert },
];

export const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });

// A chat row carries one line of state under its title: what it is doing, or when it last did
// anything. Intl owns the wording so the unit thresholds stay the only decision here.
export function chatDetail(chat: SidebarChat, now: number): string {
  if (chat.busy) return "Running";
  const minutes = Math.round((chat.updatedAt - now) / 60_000);
  if (minutes >= 0) return "Just now";
  if (minutes > -60) return RELATIVE_TIME.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return RELATIVE_TIME.format(hours, "hour");
  return RELATIVE_TIME.format(Math.round(hours / 24), "day");
}

export function pageCount(page: WorkspacePage, workspace?: WorkspaceSummary): number | null {
  if (!workspace) return null;
  if (page === "projects") return workspace.projectCount;
  if (page === "units") return workspace.unitCount;
  if (page === "shared") return workspace.sharedCount;
  return null;
}

/* Handoff 13 makes the sidebar one card instead of a stack of separate widgets: the density it
   asks for comes from removing edges, not from shrinking gaps. Two dark widgets still stand on
   that card -- the place switch and the workspace hero -- and they keep the on-dark ink family,
   because they are black in both themes. Everything else on the card takes the theme pair. */
export const SECTION_LABEL = "sidebar-section-label flex h-6.5 shrink-0 items-center gap-1.5 px-4 pb-1.5 font-code type-meta tracking-mono text-muted";
/* Segments and rows are pills, matching the round geometry of the widget they sit in;
   selection is an inversion (white plate, ink text), never a tint. The mode switch paints
   its selection with the gooey travelling indicator instead of a per-button background. */
export const MODE_BUTTON = "sidebar-mode-button relative z-surface-content flex h-8.5 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-transparent px-2 type-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-instrument";
export const SIDEBAR_ROW = "sidebar-nav-row grid h-10 w-full shrink-0 grid-cols-(--sidebar-nav-columns) items-center gap-2.75 rounded-row px-3 text-left type-ui focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
/* A chat row carries a title and its state, so it is two lines inside one row rather than the
   single-line grid the page rows use. Geometry only: the pair comes from SELECTED/UNSELECTED. */
export const CHAT_ROW = "sidebar-chat-row grid grid-cols-(--sidebar-chat-columns) items-center gap-x-2.25 gap-y-0 rounded-row px-2.75 py-1.75 text-left";
/* On the card, a selected row is the field recess and a resting row is nothing at all. The
   handoff gives hover and selection the same surface for nav rows and a lighter one for lists. */
export const SELECTED = "bg-field text-ink hover:bg-field hover:text-ink";
export const UNSELECTED = "bg-transparent text-muted hover:bg-field hover:text-ink";
export const CHAT_UNSELECTED = "bg-transparent text-muted hover:bg-row-hover hover:text-ink";
/* A ghost circle on the card: no surface until the cursor is on it, and the field is what it takes. */
export const GHOST = "grid place-items-center rounded-full text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function modeButton(active: boolean) {
  return `${MODE_BUTTON} ${active ? "text-selected-ink" : "text-on-instrument-muted hover:text-on-instrument"}`;
}

export function sidebarRow(active: boolean) {
  return `${SIDEBAR_ROW} ${active ? SELECTED : UNSELECTED}`;
}

export function sidebarCount(active: boolean) {
  // Counters are copy, not decoration: the decorative muted ink reads at 3.4:1 on the card.
  return `font-display type-sm leading-none font-extrabold ${active ? "text-ink" : "text-muted"}`;
}

// The search field filters what the sidebar itself holds -- its pages and its chats. It is not a
// catalogue search: nothing else in the sidebar is searchable, so a needle that matches neither
// list simply empties both and says so.
export function matches(needle: string, haystack: string): boolean {
  return !needle || haystack.toLocaleLowerCase().includes(needle);
}
