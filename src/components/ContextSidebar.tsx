import { Boxes, Brain, CalendarDays, FolderOpen, UsersRound, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { WorkspaceSummary } from "../lib/ipc";
import {
  sortWorkspaces,
  WORKSPACE_PAGE_LABELS,
  WORKSPACE_PAGES,
  type WorkbenchMode,
  type WorkspacePage,
} from "../state/workbench";
import { ProfileMenu } from "./ProfileMenu";
import { WorkspacePicker } from "./WorkspacePicker";

interface ContextSidebarProps {
  page: WorkspacePage;
  pageActive: boolean;
  mode: WorkbenchMode;
  rootPath: string;
  workspaces: WorkspaceSummary[];
  workspaceId: string | null;
  pinnedWorkspaceIds: string[];
  onModeChange(mode: WorkbenchMode): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenPage(page: WorkspacePage): void;
}

const PAGE_ICONS: Record<WorkspacePage, LucideIcon> = {
  projects: FolderOpen,
  units: UsersRound,
  shared: Boxes,
  memory: Brain,
  calendar: CalendarDays,
};

function initials(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

function pageCount(page: WorkspacePage, workspace?: WorkspaceSummary): number | null {
  if (!workspace) return null;
  if (page === "projects") return workspace.projectCount;
  if (page === "units") return workspace.unitCount;
  if (page === "shared") return workspace.sharedCount;
  return null;
}

export function ContextSidebar({
  page,
  pageActive,
  mode,
  rootPath,
  workspaces,
  workspaceId,
  pinnedWorkspaceIds,
  onModeChange,
  onOpenWorkspace,
  onOpenPage,
}: ContextSidebarProps) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const orderedWorkspaces = useMemo(
    () => sortWorkspaces(workspaces, pinnedWorkspaceIds),
    [pinnedWorkspaceIds, workspaces],
  );
  const contextName = workspace?.name ?? "Workspaces";

  return (
    <motion.aside
      className="context-sidebar panel-blur"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.2, 1] }}
    >
      <nav className="sidebar-mode-switch" aria-label="Workbench mode">
        <button type="button" aria-pressed={mode === "work"} onClick={() => onModeChange("work")}>My Work</button>
        <button type="button" aria-pressed={mode === "marketplace"} onClick={() => onModeChange("marketplace")}>Marketplace</button>
      </nav>

      <div className="sidebar-context">
        {workspace ? (
          <WorkspacePicker value={workspace.id} workspaces={orderedWorkspaces} onValueChange={onOpenWorkspace} />
        ) : (
          <div className="sidebar-context-button">
            <span className="sidebar-monogram">{initials(contextName)}</span>
            <span>{contextName}</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Workspace pages">
        {WORKSPACE_PAGES.map((item) => {
          const Icon = PAGE_ICONS[item];
          const count = pageCount(item, workspace);
          const active = pageActive && page === item;
          return (
            <button
              className={`sidebar-nav-row${active ? " is-selected" : ""}`}
              type="button"
              key={item}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenPage(item)}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>{WORKSPACE_PAGE_LABELS[item]}</span>
              <small>{count ?? ""}</small>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <ProfileMenu rootPath={rootPath} />
      </div>
    </motion.aside>
  );
}
