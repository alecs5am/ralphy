import { Boxes, Brain, CalendarDays, ChartNoAxesCombined, CircleAlert, Compass, Download, FolderOpen, Layers3, PackageCheck, Plus, Save, Sparkles, Store, UsersRound, WandSparkles, type LucideIcon } from "lucide-react";
import { useId, useMemo, type CSSProperties } from "react";
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
import { ProfileAvatar, profileIdentity } from "./ProfileAvatar";
import { WorkspacePicker } from "./WorkspacePicker";

export interface SidebarChat {
  id: string;
  title: string;
  busy: boolean;
  updatedAt: number;
}

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
  chats?: readonly SidebarChat[];
  activeChatId?: string | null;
  onSelectChat?(chatId: string): void;
  onNewChat?(): void;
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

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });

// A chat row carries one line of state under its title: what it is doing, or when it last did
// anything. Intl owns the wording so the unit thresholds stay the only decision here.
function chatDetail(chat: SidebarChat, now: number): string {
  if (chat.busy) return "Running";
  const minutes = Math.round((chat.updatedAt - now) / 60_000);
  if (minutes >= 0) return "Just now";
  if (minutes > -60) return RELATIVE_TIME.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return RELATIVE_TIME.format(hours, "hour");
  return RELATIVE_TIME.format(Math.round(hours / 24), "day");
}

function pageCount(page: WorkspacePage, workspace?: WorkspaceSummary): number | null {
  if (!workspace) return null;
  if (page === "projects") return workspace.projectCount;
  if (page === "units") return workspace.unitCount;
  if (page === "shared") return workspace.sharedCount;
  return null;
}

// Segments and rows are pills, matching the round geometry of the widget they sit in;
// selection is an inversion (white plate, ink text), never a tint. The mode switch paints
// its selection with the gooey travelling indicator instead of a per-button background.
const MODE_BUTTON = "sidebar-mode-button relative z-1 flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-transparent px-2 type-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-instrument";
const SIDEBAR_ROW = "sidebar-nav-row grid h-control-lg w-full shrink-0 grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-full px-3 text-left type-ui focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-instrument";
const SELECTED = "bg-selected text-selected-ink hover:bg-selected-hover hover:text-selected-ink";
const UNSELECTED = "bg-transparent text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument";

function modeButton(active: boolean) {
  return `${MODE_BUTTON} ${active ? "text-selected-ink" : "text-on-instrument-muted hover:text-on-instrument"}`;
}

function sidebarRow(active: boolean) {
  return `${SIDEBAR_ROW} ${active ? SELECTED : UNSELECTED}`;
}

function sidebarCount(active: boolean) {
  // Counters are copy, not decoration: the decorative muted ink reads at 3.4:1 on the widget.
  return `font-display type-sm leading-none font-extrabold ${active ? "text-selected-ink" : "text-on-instrument-muted"}`;
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
  chats = [],
  activeChatId = null,
  onSelectChat,
  onNewChat,
}: ContextSidebarProps) {
  const gooId = `mode-goo-${useId().replace(/:/g, "")}`;
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const now = Date.now();
  const orderedWorkspaces = useMemo(
    () => sortWorkspaces(workspaces, pinnedWorkspaceIds),
    [pinnedWorkspaceIds, workspaces],
  );
  return (
    <aside className="context-sidebar flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden bg-transparent text-ink">
      <nav
        className="sidebar-mode-switch relative flex h-11 shrink-0 gap-0.5 overflow-hidden rounded-full bg-instrument p-1 isolate"
        style={{ "--mode-index": mode === "work" ? 0 : 1, "--mode-count": 2 } as CSSProperties}
        aria-label="Application mode"
      >
        <svg className="mode-goo-filter" aria-hidden="true">
          <defs>
            <filter id={gooId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </defs>
        </svg>
        <span className="mode-goo" style={{ filter: `url(#${gooId})` }} aria-hidden="true">
          <span className="mode-goo-blob mode-goo-blob-leading" />
          <span className="mode-goo-blob mode-goo-blob-trailing" />
        </span>
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

      {mode === "work" && workspace && <div className="sidebar-context">
        <WorkspacePicker value={workspace.id} workspaces={orderedWorkspaces} onValueChange={onOpenWorkspace} />
      </div>}

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mode === "work" && workspace && <nav className="sidebar-nav flex flex-col gap-0.5 rounded-panel bg-instrument p-2" aria-label="Workspace pages">
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
                <small className={sidebarCount(active)}>{count ?? ""}</small>
              </button>
            );
          })}
        </nav>}

        {mode === "work" && workspace && chats.length > 0 && <section className="sidebar-chats mt-2">
          <div className="sidebar-section-label flex h-7 items-center gap-1.5 px-2.5 font-code type-mono-xs tracking-mono text-muted">
            <span>CHATS</span>
            <small className="font-display type-xs leading-none font-extrabold">{chats.length}</small>
            {onNewChat && <button
              className="ml-auto grid size-5 place-items-center rounded-full text-muted hover:bg-instrument-hover hover:text-on-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-instrument"
              type="button"
              title="New chat"
              aria-label="New chat"
              onClick={onNewChat}
            ><Plus size={12} strokeWidth={1.8} aria-hidden="true" /></button>}
          </div>
          <nav className="sidebar-nav flex flex-col gap-0.5 rounded-panel bg-instrument p-2" aria-label="Chats">
            {chats.map((item) => {
              const active = item.id === activeChatId;
              return <button
                className={`sidebar-chat-row ${active ? SELECTED : UNSELECTED}`}
                type="button"
                key={item.id}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelectChat?.(item.id)}
              >
                <i className={`sidebar-chat-dot ${item.busy ? "is-busy" : ""}`} aria-hidden="true" />
                <span className="min-w-0 truncate type-ui">{item.title}</span>
                <small className="col-start-2 min-w-0 truncate font-code type-mono-xs tracking-mono uppercase opacity-70">{chatDetail(item, now)}</small>
              </button>;
            })}
          </nav>
        </section>}

        {mode === "marketplace" && <div className="grid gap-2">
          <section>
            <div className="sidebar-section-label flex h-7 items-center px-2.5 font-code type-mono-xs tracking-mono text-muted"><span>MARKETPLACE</span></div>
            <nav className="sidebar-nav flex flex-col gap-0.5 rounded-panel bg-instrument p-2" aria-label="Marketplace categories">
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
            <div className="sidebar-section-label flex h-7 items-center px-2.5 font-code type-mono-xs tracking-mono text-muted"><span>MY LIBRARY</span></div>
            <nav className="sidebar-nav flex flex-col gap-0.5 rounded-panel bg-instrument p-2" aria-label="My Library">
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

      {rootPath && <div className="sidebar-footer h-12 shrink-0 rounded-full bg-instrument text-on-instrument [&_.instrument-profile-control]:h-full [&_.instrument-profile-control]:w-full">
        <InstrumentProfileControl
          identity={{ displayName: profileIdentity(rootPath), initials: profileIdentity(rootPath).slice(0, 2).toUpperCase(), avatarUrl: null }}
          avatar={<ProfileAvatar rootPath={rootPath} size={32} round />}
          variant="pill"
          onOpenSettings={onOpenSettings}
        />
      </div>}
    </aside>
  );
}
