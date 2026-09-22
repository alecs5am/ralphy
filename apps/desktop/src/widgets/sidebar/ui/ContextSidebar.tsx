/* Workspace navigation stays reachable while the center view or chat panel changes. */
import { Compass, PanelLeft, Settings } from "@/shared/ui/icons";

import { useMemo } from "react";
import type { ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import {
  sortWorkspaces,
  type WorkbenchRoute,
  type WorkspacePage,
} from "@/shared/model/workbench";
import type { WorkbenchLens } from "@/shared/model/workbench";
import type {
  AppMode,
  MarketplaceBrowseRoute,
  MarketplaceRoute,
} from "@/shared/model/routes";
import { WorkspacePicker } from "./WorkspacePicker";
import { GHOST, SIDEBAR_NAV, sidebarRow, type SidebarChat } from "./sidebar-chrome";
import { WorkspacePagesNav } from "./sidebar-sections";
import { SidebarProjectTree } from "./sidebar-projects";
import { SidebarRail } from "./SidebarRail";

/** The workspace destinations, so the rail and the expanded nav can never drift apart. */
export const SIDEBAR_PAGES: readonly WorkspacePage[] = ["generation", "units", "canvas", "calendar", "shared"];

export interface ContextSidebarProps {
  /** Folded to the icon rail. The sidebar is never absent now: less of it, never none of it. */
  collapsed?: boolean;
  mode: AppMode;
  lens: WorkbenchLens;
  route: WorkbenchRoute;
  page: WorkspacePage;
  pageActive: boolean;
  marketplaceRoute?: MarketplaceRoute;
  rootPath: string | null;
  workspaces: WorkspaceSummary[];
  workspaceId: string | null;
  pinnedWorkspaceIds: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onToggleSidebar(): void;
  onOpenSettings(): void;
  onSwitchMode(mode: AppMode): void;
  onOpenMarketplaceRoute(route: MarketplaceBrowseRoute): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenPage(page: WorkspacePage): void;
  projects?: readonly ProjectSummary[];
  onOpenProject?(project: ProjectSummary): void;
  chats?: readonly SidebarChat[];
  activeChatId?: string | null;
  onSelectChat?(chatId: string): void;
  onRenameChat?(chatId: string, title: string): void;
  onArchiveChat?(chatId: string, archived: boolean): void;
  onNewProjectChat?(project: ProjectSummary): void;
}

export function ContextSidebar({
  collapsed = false,
  mode,
  lens,
  route,
  page,
  pageActive,
  workspaces,
  workspaceId,
  pinnedWorkspaceIds,
  onToggleSidebar,
  onOpenSettings,
  onSwitchMode,
  onOpenWorkspace,
  onOpenPage,
  projects = [],
  onOpenProject,
  chats = [],
  activeChatId = null,
  onSelectChat,
  onRenameChat,
  onArchiveChat,
  onNewProjectChat,
}: ContextSidebarProps) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const now = Date.now();
  const orderedWorkspaces = useMemo(
    () => sortWorkspaces(workspaces, pinnedWorkspaceIds),
    [pinnedWorkspaceIds, workspaces],
  );
  const workspaceProjects = projects.filter((project) => project.workspaceId === workspaceId);
  const activeProjectId = mode === "work" && route.kind === "project"
    ? projects.find((project) => project.workspaceId === route.workspaceId && project.projectId === route.projectId)?.id ?? null
    : null;
  /* The rail draws no counts and no project names, but it does need the workspace: the avatar it
     ends in is the workspace, and reaching a project through it is one destination. */
  if (collapsed) return <SidebarRail
    mode={mode}
    page={page}
    pageActive={pageActive}
    pages={SIDEBAR_PAGES}
    projectsActive={mode === "work" && (route.kind === "project" || (pageActive && page === "projects"))}
    workspaces={orderedWorkspaces}
    workspaceId={workspace?.id ?? null}
    onExpand={onToggleSidebar}
    onSwitchMode={onSwitchMode}
    onOpenPage={onOpenPage}
    onOpenWorkspace={onOpenWorkspace}
    onOpenSettings={onOpenSettings}
  />;
  return (
    /* The slide-in belongs on the element: instrument.css declared the animation *after* its own
       reduced-motion cancel, so the cancel never applied and the sidebar slid in regardless of
       the operator's motion preference. */
    <aside className="context-sidebar flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden pb-3 text-ink animate-sidebar-in motion-reduce:animate-none">
      {/* The 32px row the top row keeps beside it. The window draws no controls here any more,
          so the run is the drag region and nothing else. */}
      <header className="sidebar-header flex h-8 flex-none items-center gap-2.5 px-3 [-webkit-app-region:drag]">
        <div className="min-w-0 flex-1" aria-hidden="true" />
        <button
          className={`sidebar-collapse ${GHOST} size-6.5 flex-none [-webkit-app-region:no-drag]`}
          type="button"
          title="Hide sidebar"
          aria-label="Toggle sidebar"
          aria-pressed="true"
          onClick={onToggleSidebar}
        ><PanelLeft size={15} strokeWidth={1.8} aria-hidden="true" /></button>
      </header>

      {/* The card is gone: the sidebar is drawn onto the window's backdrop, and the only surface
          in it is the one a row takes when it is selected or under the cursor. What is left is
          the column the scroller and the footer share, so the footer never scrolls away. */}
      <div className="sidebar-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3 pb-2">
        {workspace && <WorkspacePagesNav pages={SIDEBAR_PAGES} page={page} pageActive={pageActive} workspace={workspace} onOpenPage={onOpenPage} />}
        <nav className={`${SIDEBAR_NAV} mt-0.5`} aria-label="Explore">
          <button id="sidebar-explore" type="button" className={sidebarRow(mode === "marketplace")} aria-current={mode === "marketplace" ? "page" : undefined}
            onClick={() => onSwitchMode("marketplace")}>
            <Compass size={16} strokeWidth={1.8} aria-hidden="true" /><span>Explore</span>
          </button>
        </nav>
        {workspace && <SidebarProjectTree key={workspace.id} workspaceId={workspace.id} projects={workspaceProjects} activeProjectId={activeProjectId} onOpenProject={onOpenProject} onOpenProjects={() => onOpenPage("projects")} onNewProjectChat={onNewProjectChat}
          chats={chats} activeChatId={activeChatId} activeChatVisible={mode === "work" && lens === "chat"} now={now} onSelectChat={onSelectChat} onRenameChat={onRenameChat} onArchiveChat={onArchiveChat} />}
      </div>

      <footer className="sidebar-footer mx-3 mt-2 flex h-7.5 flex-none items-center gap-1">
        {workspace && <WorkspacePicker value={workspace.id} workspaces={orderedWorkspaces} onValueChange={onOpenWorkspace} onOpenOverview={() => onOpenPage("overview")} />}
        <button className={`${GHOST} ml-auto size-7.5 flex-none`} type="button" aria-label="Open settings" title="Settings" onClick={() => onOpenSettings()}><Settings size={16} strokeWidth={1.8} aria-hidden="true" /></button>
      </footer>
      </div>
    </aside>
  );
}
