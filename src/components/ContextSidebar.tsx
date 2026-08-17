import {
  Boxes,
  CircleDollarSign,
  Pin,
  Search,
  UsersRound,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectSummary,
  WorkspaceSummary,
} from "../lib/ipc";
import {
  sortProjects,
  sortWorkspaces,
  type WorkbenchRoute,
} from "../state/workbench";
import { projectGlyphSlot, projectGlyphVars } from "../lib/project-glyph";
import { ProfileMenu } from "./ProfileMenu";
import { SidebarChrome } from "./Titlebar";
import { WorkspacePicker } from "./WorkspacePicker";

interface ContextSidebarProps {
  route: WorkbenchRoute;
  rootPath: string;
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  pinnedWorkspaceIds: string[];
  pinnedProjectIds: string[];
  searchRequest: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onToggleSidebar(): void;
  onOpenSettings(): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenProject(project: ProjectSummary): void;
  onToggleProjectPin(projectId: string): void;
}

function includesQuery(query: string, ...values: string[]): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || values.some((value) => value.toLocaleLowerCase().includes(needle));
}

function relativeActivity(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : new Date(value).toLocaleDateString();
}

function initials(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

function PinButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      className={`row-pin${active ? " is-pinned" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Pin size={13} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

export function ContextSidebar({
  route,
  rootPath,
  workspaces,
  projects,
  pinnedWorkspaceIds,
  pinnedProjectIds,
  searchRequest,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onToggleSidebar,
  onOpenSettings,
  onOpenWorkspace,
  onOpenProject,
  onToggleProjectPin,
}: ContextSidebarProps) {
  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(12);
  const searchRef = useRef<HTMLInputElement>(null);
  const workspaceId =
    route.kind === "library" ? workspaces[0]?.id ?? null : route.workspaceId;
  const workspace = workspaces.find((item) => item.id === workspaceId);

  useEffect(() => {
    setQuery("");
    setSearchVisible(false);
    setVisibleLimit(12);
  }, [workspaceId]);

  useEffect(() => {
    if (searchVisible) searchRef.current?.focus();
  }, [searchVisible]);

  useEffect(() => {
    if (searchRequest === 0) return;
    setSearchVisible(true);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [searchRequest]);

  const orderedWorkspaces = useMemo(
    () => sortWorkspaces(workspaces, pinnedWorkspaceIds),
    [pinnedWorkspaceIds, workspaces],
  );
  const visibleProjects = useMemo(
    () =>
      sortProjects(
        projects.filter(
          (item) =>
            item.workspaceId === workspaceId &&
            includesQuery(query, item.name, item.brief, item.status, item.phase ?? ""),
        ),
        pinnedProjectIds,
      ),
    [pinnedProjectIds, projects, query, workspaceId],
  );
  const visibleItems = visibleProjects;
  const shownProjects = visibleProjects.slice(0, visibleLimit);
  const contextName = workspace?.name ?? "Workspaces";
  return (
    <motion.aside
      className="context-sidebar panel-blur"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.2, 1] }}
    >
      <SidebarChrome
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={onBack}
        onForward={onForward}
        onToggleSidebar={onToggleSidebar}
      />

      <div className="sidebar-context">
        {workspace ? (
          <WorkspacePicker
            value={workspace.id}
            workspaces={orderedWorkspaces}
            onValueChange={onOpenWorkspace}
          />
        ) : (
          <div className="sidebar-context-button">
            <span className="sidebar-monogram">{initials(contextName)}</span>
            <span>{contextName}</span>
          </div>
        )}
      </div>

      {(searchVisible || query) && (
        <label className="sidebar-search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Filter projects"
            aria-label="Filter projects"
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleLimit(12);
            }}
          />
          <kbd>⌘F</kbd>
        </label>
      )}

      {workspace && (
        <div className="sidebar-nav">
          <div className="sidebar-nav-row">
            <UsersRound size={16} strokeWidth={1.5} />
            <span>Units</span>
            <small>{workspace.unitCount}</small>
          </div>
          <div className="sidebar-nav-row">
            <Boxes size={16} strokeWidth={1.5} />
            <span>Shared library</span>
            <small>{workspace.sharedCount}</small>
          </div>
        </div>
      )}

      <div className="sidebar-section-label">
        <span>Projects</span>
        <span className="sidebar-section-actions">
          <span>{visibleItems.length}</span>
        </span>
      </div>

      <div className="sidebar-list">
        {shownProjects.map((project) => {
          const active =
            route.kind === "project" && route.projectId === project.projectId;
          const pinned = pinnedProjectIds.includes(project.id);
          return (
            <div
              role="button"
              tabIndex={0}
              className={`sidebar-row${active ? " is-selected" : ""}`}
              style={projectGlyphVars(project.name)}
              key={project.id}
              onClick={() => onOpenProject(project)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProject(project);
                }
              }}
            >
              {active && <span className="sidebar-row-field" aria-hidden="true" />}
              <span
                className="project-glyph"
                data-glyph={projectGlyphSlot(project.name)}
                aria-hidden="true"
              >
                <span className="project-glyph-mark" />
              </span>
              <span className="sidebar-row-copy">
                <span className="sidebar-row-title">{project.name}</span>
                <span className="sidebar-row-meta">
                  {project.phase ?? project.status}
                  <span aria-hidden="true">·</span>
                  {relativeActivity(project.recentActivity)}
                  {project.spendUsd !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <CircleDollarSign size={11} aria-hidden="true" />
                      {project.spendUsd.toFixed(2)}
                    </>
                  )}
                </span>
              </span>
              <PinButton
                active={pinned}
                label={pinned ? "Unpin project" : "Pin project"}
                onClick={() => onToggleProjectPin(project.id)}
              />
            </div>
          );
        })}
        {visibleItems.length === 0 && (
          <div className="sidebar-empty">No matching results</div>
        )}
        {visibleLimit < visibleItems.length && (
          <button
            className="sidebar-show-more"
            type="button"
            onClick={() => setVisibleLimit((limit) => limit + 24)}
          >
            Show more
          </button>
        )}
      </div>

      <div className="sidebar-footer">
        <ProfileMenu rootPath={rootPath} onOpenSettings={onOpenSettings} />
      </div>
    </motion.aside>
  );
}
