import { Boxes, Brain, CalendarDays, ChartNoAxesCombined, CircleAlert, Compass, Download, FolderOpen, Layers3, PackageCheck, Plus, Save, Sparkles, Store, UsersRound, WandSparkles, type LucideIcon } from "lucide-react";
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
import { InstrumentProfileControl } from "../instrument/InstrumentProfileControl";
import { profileIdentity } from "./ProfileAvatar";
import { WorkspacePicker } from "./WorkspacePicker";

export interface ContextSidebarProps {
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

const MODE_BUTTON = "sidebar-mode-button flex h-9 min-w-0 items-center justify-center rounded-[18px] px-2 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-instrument";
const SIDEBAR_ROW = "sidebar-nav-row grid h-9 w-full shrink-0 grid-cols-[16px_minmax(0,1fr)_24px] items-center gap-2.5 rounded-2xl px-2.5 text-left text-[12px] text-on-instrument-muted hover:bg-instrument-raised hover:text-on-instrument focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-instrument";
const SIDEBAR_ROW_SELECTED = "bg-[var(--instrument-composer-surface)] text-[var(--instrument-alert-text)] hover:bg-[var(--instrument-composer-surface)] hover:text-[var(--instrument-alert-text)]";

function modeButton(active: boolean) {
  return `${MODE_BUTTON} ${active
    ? "bg-[var(--instrument-composer-surface)] text-[var(--instrument-alert-text)]"
    : "bg-transparent text-on-instrument-muted hover:bg-instrument-raised hover:text-on-instrument"}`;
}

function sidebarRow(active: boolean) {
  return `${SIDEBAR_ROW} ${active ? SIDEBAR_ROW_SELECTED : "bg-transparent"}`;
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
      className="context-sidebar flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden bg-transparent text-ink"
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0.2, 1] }}
    >
      <nav className="sidebar-mode-switch grid h-12 shrink-0 grid-cols-2 gap-0 rounded-[24px] bg-instrument p-1.5" aria-label="Application mode">
        <button
          id="app-mode-work"
          className={modeButton(mode === "work")}
          type="button"
          aria-current={mode === "work" ? "page" : undefined}
          onClick={() => onSwitchMode("work")}
        >
          <span>My Work</span>
        </button>
        <button
          id="app-mode-marketplace"
          className={modeButton(mode === "marketplace")}
          type="button"
          aria-current={mode === "marketplace" ? "page" : undefined}
          onClick={() => onSwitchMode("marketplace")}
        >
          <span>Marketplace</span>
        </button>
      </nav>

      {mode === "work" && workspace && <div className="sidebar-context h-[118px] shrink-0 overflow-hidden rounded-[24px] [&_.workspace-hero]:h-full [&_.workspace-hero]:border-0 [&_.workspace-hero]:shadow-none [&_.workspace-picker]:h-full">
        <WorkspacePicker value={workspace.id} workspaces={orderedWorkspaces} onValueChange={onOpenWorkspace} />
      </div>}

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mode === "work" && workspace && <nav className="sidebar-nav flex flex-col gap-0 rounded-[24px] bg-instrument p-2" aria-label="Workspace pages">
          {WORKSPACE_PAGES.map((item) => {
            const Icon = PAGE_ICONS[item];
            const count = pageCount(item, workspace);
            const active = pageActive && page === item;
            return (
              <button
                className={sidebarRow(active)}
                type="button"
                key={item}
                aria-current={active ? "page" : undefined}
                onClick={() => onOpenPage(item)}
              >
                <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                <span className="min-w-0 truncate">{WORKSPACE_PAGE_LABELS[item]}</span>
                <small className="w-6 text-right font-display text-[13px] leading-none text-current opacity-70">{count ?? ""}</small>
              </button>
            );
          })}
        </nav>}

        {mode === "marketplace" && <div className="grid gap-2">
          <section>
            <div className="sidebar-section-label flex h-7 items-center px-2.5 font-code text-[9px] tracking-[.11em] text-muted"><span>MARKETPLACE</span></div>
            <nav className="sidebar-nav flex flex-col gap-0 rounded-[24px] bg-instrument p-2" aria-label="Marketplace categories">
              <button
                className={sidebarRow(marketplaceRoute.kind === "discover")}
                type="button"
                aria-current={marketplaceRoute.kind === "discover" ? "page" : undefined}
                onClick={() => onOpenMarketplaceRoute({ kind: "discover" })}
              >
                <Compass size={14} strokeWidth={1.6} aria-hidden="true" />
                <span className="min-w-0 truncate">Discover</span>
                <small />
              </button>
              {MARKETPLACE_CATEGORIES.map(({ id, label, icon: Icon }) => {
                const active = marketplaceRoute.kind === "category" && marketplaceRoute.category === id;
                return <button
                  className={sidebarRow(active)}
                  type="button"
                  key={id}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenMarketplaceRoute({ kind: "category", category: id })}
                >
                  <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                  <span className="min-w-0 truncate">{label}</span>
                  <small />
                </button>;
              })}
            </nav>
          </section>
          <section>
            <div className="sidebar-section-label flex h-7 items-center px-2.5 font-code text-[9px] tracking-[.11em] text-muted"><span>MY LIBRARY</span></div>
            <nav className="sidebar-nav flex flex-col gap-0 rounded-[24px] bg-instrument p-2" aria-label="My Library">
              {MARKETPLACE_LIBRARY.map(({ id, label, icon: Icon }) => {
                const active = marketplaceRoute.kind === "library" && marketplaceRoute.section === id;
                return <button
                  className={sidebarRow(active)}
                  type="button"
                  key={id}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenMarketplaceRoute({ kind: "library", section: id })}
                >
                  <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                  <span className="min-w-0 truncate">{label}</span>
                  <small />
                </button>;
              })}
            </nav>
          </section>
        </div>}
      </div>

      {rootPath && <div className="sidebar-footer h-12 shrink-0 rounded-full bg-instrument p-0 text-on-instrument [&_.instrument-profile-control]:h-full [&_.instrument-profile-control]:w-full [&_.instrument-profile-trigger]:h-12 [&_.instrument-profile-trigger]:w-full [&_.instrument-profile-trigger]:rounded-full [&_.instrument-profile-trigger]:px-2 [&_.instrument-profile-trigger]:text-on-instrument [&_.instrument-profile-trigger:hover]:bg-instrument-hover">
        <InstrumentProfileControl identity={{ displayName: profileIdentity(rootPath), initials: profileIdentity(rootPath).slice(0, 2).toUpperCase(), avatarUrl: null }} onOpenSettings={onOpenSettings} />
      </div>}
    </motion.aside>
  );
}
