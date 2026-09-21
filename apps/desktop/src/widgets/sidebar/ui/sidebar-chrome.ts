/* Sidebar row geometry and its paired surface and ink. */
import {
  Boxes, Brain, CalendarDays, ChartNoAxesCombined, FolderOpen, Layers,
  Images, WandSparkles, Workflow,
  type AppIcon,
} from "@/shared/ui/icons";

import type { WorkspaceSummary } from "@/shared/api/ipc";
import type { WorkspacePage } from "@/shared/model/workbench";

/* Transcripts are searched, never rendered inside a sidebar row. */
export interface SidebarChat {
  id: string;
  title: string;
  busy: boolean;
  updatedAt: number;
  archived?: boolean;
  project?: { workspaceId: string; projectId: string } | null;
  entries?: readonly { kind: string; text?: string }[];
}

export const PAGE_ICONS: Record<WorkspacePage, AppIcon> = {
  overview: ChartNoAxesCombined,
  generation: WandSparkles,
  projects: FolderOpen,
  canvas: Workflow,
  units: Images,
  shared: Boxes,
  memory: Brain,
  context: Layers,
  calendar: CalendarDays,
};

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

export const SECTION_LABEL = "sidebar-section-label flex h-7.5 shrink-0 items-center gap-1.5 px-3 type-xs font-medium text-muted";

export const SIDEBAR_NAV = "sidebar-nav flex shrink-0 flex-col gap-0.5 px-3";
export const SIDEBAR_ROW = "sidebar-nav-row grid h-7.5 w-full shrink-0 grid-cols-(--sidebar-nav-columns) items-center gap-2 rounded-row px-3 text-left type-ui focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
export const CHAT_ROW = "sidebar-chat-row relative flex h-7.5 items-center gap-2 rounded-row pr-3 text-left";
/* On the card, a selected row is the field recess and a resting row is nothing at all. The
   handoff gives hover and selection the same surface for nav rows and a lighter one for lists. */
export const SELECTED = "bg-field text-ink hover:bg-field hover:text-ink";
export const UNSELECTED = "bg-transparent text-muted hover:bg-field hover:text-ink";
export const CHAT_UNSELECTED = "bg-transparent text-muted hover:bg-row-hover hover:text-ink";
/* A ghost circle on the card: no surface until the cursor is on it, and the field is what it takes. */
export const GHOST = "grid place-items-center rounded-full text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function sidebarRow(active: boolean) {
  return `${SIDEBAR_ROW} ${active ? SELECTED : UNSELECTED}`;
}

export function sidebarCount(active: boolean) {
  // Counters are copy, not decoration: the decorative muted ink reads at 3.4:1 on the card.
  return `type-xs leading-none tabular-nums ${active ? "text-ink" : "text-muted"}`;
}

// Search only covers the project names and conversations shown in the sidebar.
export function matches(needle: string, haystack: string): boolean {
  return !needle || haystack.toLocaleLowerCase().includes(needle);
}

export function chatMatches(chat: SidebarChat, needle: string): boolean {
  return matches(needle, chat.title) || Boolean(chat.entries?.some((entry) =>
    (entry.kind === "user" || entry.kind === "assistant") && matches(needle, entry.text ?? "")));
}
