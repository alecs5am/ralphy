/**
 * The sidebar folded: the same destinations, as icons, drawn straight onto the window's chrome.
 *
 * Collapsing used to remove the sidebar and hand its reveal control to the top row. A rail keeps
 * every destination one click away, which is why the top row no longer carries that control -- a
 * reveal button belongs to whichever chrome is on screen, and this one always is.
 *
 * Folding is meant to ask for less, not for a dead end: the two things the expanded sidebar can
 * do that a list of pages cannot -- switch workspace, and reach a project -- are both here. The
 * workspace is the avatar the rail ends in, and it opens the same picker the footer opens.
 * Projects are a destination rather than a tree: a tree needs names beside it, and a name is the
 * one thing a 44px column has no room for.
 *
 * Counts do not appear here either, for the same reason: a figure with no label beside it says
 * nothing, and the rail is the state where the operator has asked for less rather than the same
 * thing smaller.
 */
import { Compass, FolderOpen, PanelLeft, Settings } from "@/shared/ui/icons";

import type { AppMode } from "@/shared/model/routes";
import type { WorkspaceSummary } from "@/shared/api/ipc";
import { WORKSPACE_PAGE_LABELS, type WorkspacePage } from "@/shared/model/workbench";

import { WorkspacePicker } from "./WorkspacePicker";
import { PAGE_ICONS, RAIL_GHOST, railRow } from "./sidebar-chrome";

export interface SidebarRailProps {
  mode: AppMode;
  page: WorkspacePage;
  pageActive: boolean;
  pages: readonly WorkspacePage[];
  /** A project is open, or the projects page is. One destination covers both. */
  projectsActive: boolean;
  workspaces: readonly WorkspaceSummary[];
  workspaceId: string | null;
  onExpand(): void;
  onSwitchMode(mode: AppMode): void;
  onOpenPage(page: WorkspacePage): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenSettings(): void;
}

export function SidebarRail({
  mode,
  page,
  pageActive,
  pages,
  projectsActive,
  workspaces,
  workspaceId,
  onExpand,
  onSwitchMode,
  onOpenPage,
  onOpenWorkspace,
  onOpenSettings,
}: SidebarRailProps) {
  return (
    <div className="sidebar-rail flex h-full min-h-0 w-full flex-col items-center pb-3 text-ink">
      {/* The same 32px row the top row keeps beside it, so the two reveal states do not shift
          the chrome line the window is read along. */}
      <header className="sidebar-rail-header flex h-8 flex-none items-center [-webkit-app-region:drag]">
        <button
          className={`sidebar-collapse ${RAIL_GHOST} [-webkit-app-region:no-drag]`}
          type="button"
          title="Show sidebar"
          aria-label="Toggle sidebar"
          aria-pressed="false"
          onClick={onExpand}
        ><PanelLeft size={15} strokeWidth={1.8} aria-hidden="true" /></button>
      </header>

      <nav className="flex flex-none flex-col gap-2 pt-3" aria-label="Workspace pages">
        <button
          className={railRow(projectsActive)}
          type="button"
          title="Projects"
          aria-label="Projects"
          aria-current={projectsActive ? "page" : undefined}
          onClick={() => onOpenPage("projects")}
        ><FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" /></button>
        {pages.map((item) => {
          const Icon = PAGE_ICONS[item];
          const active = pageActive && mode === "work" && page === item;
          return <button
            className={railRow(active)}
            type="button"
            key={item}
            title={WORKSPACE_PAGE_LABELS[item]}
            aria-label={WORKSPACE_PAGE_LABELS[item]}
            aria-current={active ? "page" : undefined}
            onClick={() => onOpenPage(item)}
          ><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></button>;
        })}
      </nav>

      <nav className="mt-4 flex flex-none flex-col gap-2" aria-label="Explore">
        <button
          id="sidebar-explore"
          className={railRow(mode === "marketplace")}
          type="button"
          title="Explore"
          aria-label="Explore"
          aria-current={mode === "marketplace" ? "page" : undefined}
          onClick={() => onSwitchMode("marketplace")}
        ><Compass size={16} strokeWidth={1.8} aria-hidden="true" /></button>
      </nav>

      <footer className="sidebar-rail-footer mt-auto flex flex-none flex-col items-center gap-2">
        <button
          className={RAIL_GHOST}
          type="button"
          title="Settings"
          aria-label="Open settings"
          onClick={onOpenSettings}
        ><Settings size={16} strokeWidth={1.8} aria-hidden="true" /></button>
        {workspaceId && <WorkspacePicker variant="avatar" value={workspaceId} workspaces={[...workspaces]} onValueChange={onOpenWorkspace} onOpenOverview={() => onOpenPage("overview")} />}
      </footer>
    </div>
  );
}
