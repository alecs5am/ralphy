import { Boxes, Brain, CalendarDays, ChartNoAxesCombined, CircleAlert, Compass, Download, FolderOpen, Layers3, PackageCheck, Plus, Save, SlidersHorizontal, Sparkles, Store, UsersRound, WandSparkles, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { WorkspaceSummary } from "../lib/ipc";
import {
  sortWorkspaces,
  WORKSPACE_PAGE_LABELS,
  WORKSPACE_PAGES,
  type WorkbenchRoute,
  type WorkspacePage,
} from "../state/workbench";
import type {
  AppMode,
  MarketplaceBrowseRoute,
  MarketplaceCategory,
  MarketplaceLibrarySection,
  MarketplaceRoute,
} from "../state/marketplace-navigation";
import { ProfileMenu } from "./ProfileMenu";
import { SidebarChrome } from "./Titlebar";
import { WorkspacePicker } from "./WorkspacePicker";

interface ContextSidebarProps {
  mode: AppMode;
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
}

const PAGE_ICONS: Record<WorkspacePage, LucideIcon> = {
  overview: ChartNoAxesCombined,
  projects: FolderOpen,
  units: UsersRound,
  shared: Boxes,
  memory: Brain,
  calendar: CalendarDays,
};

const MARKETPLACE_CATEGORIES: Array<{ id: MarketplaceCategory; label: string; icon: LucideIcon }> = [
  { id: "models", label: "Models", icon: Boxes },
  { id: "templates", label: "Templates", icon: Layers3 },
  { id: "recipes", label: "Recipes", icon: WandSparkles },
  { id: "prompts", label: "Prompts", icon: Sparkles },
  { id: "components", label: "Components & Effects", icon: PackageCheck },
  { id: "skills", label: "Skills", icon: Store },
];

const MARKETPLACE_LIBRARY: Array<{ id: MarketplaceLibrarySection; label: string; icon: LucideIcon }> = [
  { id: "installed", label: "Installed", icon: PackageCheck },
  { id: "saved", label: "Saved", icon: Save },
  { id: "added", label: "Added", icon: Plus },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "updates", label: "Updates", icon: Sparkles },
  { id: "attention", label: "Needs attention", icon: CircleAlert },
];

function pageCount(page: WorkspacePage, workspace?: WorkspaceSummary): number | null {
  if (!workspace) return null;
  if (page === "projects") return workspace.projectCount;
  if (page === "units") return workspace.unitCount;
  if (page === "shared") return workspace.sharedCount;
  return null;
}

export function ContextSidebar({
  mode,
  page,
  pageActive,
  marketplaceRoute = { kind: "discover" },
  rootPath,
  workspaces,
  workspaceId,
  pinnedWorkspaceIds,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onToggleSidebar,
  onOpenSettings,
  onSwitchMode,
  onOpenMarketplaceRoute,
  onOpenWorkspace,
  onOpenPage,
}: ContextSidebarProps) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const orderedWorkspaces = useMemo(
    () => sortWorkspaces(workspaces, pinnedWorkspaceIds),
    [pinnedWorkspaceIds, workspaces],
  );
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

      <nav className="sidebar-nav sidebar-mode-nav" aria-label="Application mode">
        <button
          id="app-mode-work"
          className={`sidebar-nav-row${mode === "work" ? " is-selected" : ""}`}
          type="button"
          aria-current={mode === "work" ? "page" : undefined}
          onClick={() => onSwitchMode("work")}
        >
          <FolderOpen size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>My Work</span>
          <small />
        </button>
        <button
          id="app-mode-marketplace"
          className={`sidebar-nav-row${mode === "marketplace" ? " is-selected" : ""}`}
          type="button"
          aria-current={mode === "marketplace" ? "page" : undefined}
          onClick={() => onSwitchMode("marketplace")}
        >
          <Store size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>Marketplace</span>
          <small />
        </button>
      </nav>

      {mode === "work" && workspace && <div className="sidebar-context">
        <WorkspacePicker value={workspace.id} workspaces={orderedWorkspaces} onValueChange={onOpenWorkspace} />
      </div>}

      {mode === "work" && workspace && <nav className="sidebar-nav" aria-label="Workspace pages">
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
      </nav>}

      {mode === "marketplace" && <>
        <div className="sidebar-section-label"><span>MARKETPLACE</span><i /></div>
        <nav className="sidebar-nav" aria-label="Marketplace categories">
          <button
            className={`sidebar-nav-row${marketplaceRoute.kind === "discover" ? " is-selected" : ""}`}
            type="button"
            aria-current={marketplaceRoute.kind === "discover" ? "page" : undefined}
            onClick={() => onOpenMarketplaceRoute({ kind: "discover" })}
          >
            <Compass size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>Discover</span>
            <small />
          </button>
          {MARKETPLACE_CATEGORIES.map(({ id, label, icon: Icon }) => {
            const active = marketplaceRoute.kind === "category" && marketplaceRoute.category === id;
            return <button
              className={`sidebar-nav-row${active ? " is-selected" : ""}`}
              type="button"
              key={id}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenMarketplaceRoute({ kind: "category", category: id })}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>{label}</span>
              <small />
            </button>;
          })}
        </nav>
        <div className="sidebar-section-label"><span>MY LIBRARY</span><i /></div>
        <nav className="sidebar-nav" aria-label="My Library">
          {MARKETPLACE_LIBRARY.map(({ id, label, icon: Icon }) => {
            const active = marketplaceRoute.kind === "library" && marketplaceRoute.section === id;
            return <button
              className={`sidebar-nav-row${active ? " is-selected" : ""}`}
              type="button"
              key={id}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenMarketplaceRoute({ kind: "library", section: id })}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>{label}</span>
              <small />
            </button>;
          })}
        </nav>
      </>}

      <div className="sidebar-section-label"><span>THIS COMPUTER</span><i /></div>
      <nav className="sidebar-nav sidebar-global-nav" aria-label="This computer">
        <button className="sidebar-nav-row" type="button" onClick={onOpenSettings}>
          <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>Settings</span>
          <small />
        </button>
      </nav>

      <div className="sidebar-spacer" />
      {rootPath && <div className="sidebar-footer">
        <ProfileMenu rootPath={rootPath} onOpenSettings={onOpenSettings} />
      </div>}
    </motion.aside>
  );
}
