import { Boxes, Brain, CalendarDays, ChartNoAxesCombined, CircleAlert, Compass, Download, FolderOpen, Layers3, PackageCheck, PanelLeft, Plus, Save, Search, Sparkles, Store, UsersRound, WandSparkles, type LucideIcon } from "lucide-react";

import { Keycap } from "./ui/Keycap";
import { useId, useMemo, useState, type CSSProperties } from "react";
import type { WorkspaceSummary } from "../lib/ipc";
import {
  sortWorkspaces,
  WORKSPACE_PAGE_LABELS,
  WORKSPACE_PAGES,
  type WorkbenchRoute,
  type WorkspacePage,
} from "../state/workbench";
import type { WorkbenchLens } from "../state/workbench";
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
  /* The lens decides what the sidebar is *for*. Under the desk lens it is navigation and the
     chats are not here at all; under the chat lens it is the conversation list, and the
     navigation moves to the auxiliary sidebar the handoff has yet to specify. */
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

/* Handoff 13 makes the sidebar one card instead of a stack of separate widgets: the density it
   asks for comes from removing edges, not from shrinking gaps. Two dark widgets still stand on
   that card -- the place switch and the workspace hero -- and they keep the on-dark ink family,
   because they are black in both themes. Everything else on the card takes the theme pair. */
const SECTION_LABEL = "sidebar-section-label flex h-6.5 shrink-0 items-center gap-1.5 px-4 pb-1.5 font-code type-meta tracking-mono text-muted";
/* Segments and rows are pills, matching the round geometry of the widget they sit in;
   selection is an inversion (white plate, ink text), never a tint. The mode switch paints
   its selection with the gooey travelling indicator instead of a per-button background. */
const MODE_BUTTON = "sidebar-mode-button relative z-1 flex h-8.5 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-transparent px-2 type-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-instrument";
const SIDEBAR_ROW = "sidebar-nav-row grid h-10 w-full shrink-0 grid-cols-(--sidebar-nav-columns) items-center gap-2.75 rounded-row px-3 text-left type-ui focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
/* A chat row carries a title and its state, so it is two lines inside one row rather than the
   single-line grid the page rows use. Geometry only: the pair comes from SELECTED/UNSELECTED. */
const CHAT_ROW = "sidebar-chat-row grid grid-cols-(--sidebar-chat-columns) items-center gap-x-2.25 gap-y-0 rounded-row px-2.75 py-1.75 text-left";
/* On the card, a selected row is the field recess and a resting row is nothing at all. The
   handoff gives hover and selection the same surface for nav rows and a lighter one for lists. */
const SELECTED = "bg-field text-ink hover:bg-field hover:text-ink";
const UNSELECTED = "bg-transparent text-muted hover:bg-field hover:text-ink";
const CHAT_UNSELECTED = "bg-transparent text-muted hover:bg-row-hover hover:text-ink";
/* A ghost circle on the card: no surface until the cursor is on it, and the field is what it takes. */
const GHOST = "grid place-items-center rounded-full text-muted hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function modeButton(active: boolean) {
  return `${MODE_BUTTON} ${active ? "text-selected-ink" : "text-on-instrument-muted hover:text-on-instrument"}`;
}

function sidebarRow(active: boolean) {
  return `${SIDEBAR_ROW} ${active ? SELECTED : UNSELECTED}`;
}

function sidebarCount(active: boolean) {
  // Counters are copy, not decoration: the decorative muted ink reads at 3.4:1 on the card.
  return `font-display type-sm leading-none font-extrabold ${active ? "text-ink" : "text-muted"}`;
}

// The search field filters what the sidebar itself holds -- its pages and its chats. It is not a
// catalogue search: nothing else in the sidebar is searchable, so a needle that matches neither
// list simply empties both and says so.
function matches(needle: string, haystack: string): boolean {
  return !needle || haystack.toLocaleLowerCase().includes(needle);
}

export function ContextSidebar({
  mode,
  lens,
  page,
  pageActive,
  marketplaceRoute = { kind: "discover" },
  rootPath,
  workspaces,
  workspaceId,
  pinnedWorkspaceIds,
  onToggleSidebar,
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
  const searchId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const now = Date.now();
  const orderedWorkspaces = useMemo(
    () => sortWorkspaces(workspaces, pinnedWorkspaceIds),
    [pinnedWorkspaceIds, workspaces],
  );
  const deskLens = lens === "desk";
  const chatLens = lens === "chat";
  const pages = WORKSPACE_PAGES.filter((item) => matches(needle, WORKSPACE_PAGE_LABELS[item]));
  return (
    /* The slide-in belongs on the element: instrument.css declared the animation *after* its own
       reduced-motion cancel, so the cancel never applied and the sidebar slid in regardless of
       the operator's motion preference. */
    <aside className="context-sidebar flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-sidebar bg-card text-ink animate-sidebar-in motion-reduce:animate-none">
      {/* Header 32, the one chrome line the whole window shares: the topbar beside it is 32 on the
          same 8 line, so its centre is 24 -- the line macOS itself puts the traffic lights on, and
          they are drawn into this row from the main process. The run before the wordmark is
          reserved space, never a control. */}
      <header className="sidebar-header flex h-8 flex-none items-center gap-2.5 px-3.5 [-webkit-app-region:drag]">
        <div className="w-traffic-sidebar h-px flex-none" aria-hidden="true" />
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

      <nav
        className="sidebar-mode-switch relative mx-3 mt-2 mb-2.5 flex h-10.5 shrink-0 gap-0.5 overflow-hidden rounded-full bg-instrument p-1 isolate"
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

      {mode === "work" && workspace && <div className="sidebar-context h-workspace-card mx-3 mb-2.5 flex-none overflow-hidden rounded-hero">
        <WorkspacePicker value={workspace.id} workspaces={orderedWorkspaces} onValueChange={onOpenWorkspace} />
      </div>}

      {deskLens && <div className="sidebar-search mx-3 mb-3 flex h-10 flex-none items-center gap-2.5 rounded-full bg-field px-3.25">
        <Search className="flex-none text-muted" size={15} strokeWidth={1.8} aria-hidden="true" />
        <input
          id={searchId}
          className="min-w-0 flex-1 bg-transparent type-base text-ink outline-none placeholder:text-muted"
          type="search"
          value={query}
          placeholder="Search…"
          aria-label="Search the sidebar"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query
          ? <button className={`${GHOST} size-5 flex-none`} type="button" title="Clear search" aria-label="Clear search" onClick={() => setQuery("")}>
            <Plus className="rotate-45" size={12} strokeWidth={2} aria-hidden="true" />
          </button>
          : <Keycap tokens={["⌘", "K"]} />}
      </div>}

      {chatLens && workspace && onNewChat && <button
        /* The one filled control on the card: starting a conversation is what this lens is for. */
        className="sidebar-new-chat mx-3 mb-2 flex h-9.5 flex-none items-center justify-center gap-2 rounded-full bg-instrument px-3 type-ui text-on-instrument hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        type="button"
        onClick={onNewChat}
      >
        <Plus size={13} strokeWidth={1.8} aria-hidden="true" />
        <span>New chat</span>
        <Keycap tokens={["⌘", "N"]} tone="on-dark" className="ml-1" />
      </button>}

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mode === "work" && workspace && deskLens && <>
          <div className={SECTION_LABEL}><span>MAIN MENU</span></div>
          <nav className="sidebar-nav flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="Workspace pages">
            {pages.map((item) => {
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
                  <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span className="min-w-0 truncate">{WORKSPACE_PAGE_LABELS[item]}</span>
                  <small className={sidebarCount(active)}>{count ?? ""}</small>
                </button>
              );
            })}
          </nav>
        </>}

        {mode === "work" && workspace && chatLens && <section className="sidebar-chats">
          {/* No `+` here: the filled New chat control stands directly above this label. */}
          <div className={SECTION_LABEL}>
            <span>CHATS</span>
            <small className="font-display type-sm leading-none font-extrabold">{chats.length}</small>
          </div>
          <nav className="sidebar-nav flex shrink-0 flex-col gap-0.25 px-2.5" aria-label="Chats">
            {chats.map((item) => {
              const active = item.id === activeChatId;
              return <button
                className={`${CHAT_ROW} ${active ? SELECTED : CHAT_UNSELECTED}`}
                type="button"
                key={item.id}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelectChat?.(item.id)}
              >
                <i className={`sidebar-chat-dot size-1.75 rounded-full bg-current ${item.busy ? "is-busy opacity-100 animate-sidebar-chat-pulse motion-reduce:animate-none" : "opacity-45"}`} aria-hidden="true" />
                <span className="min-w-0 truncate type-ui">{item.title}</span>
                <small className="col-start-2 min-w-0 truncate font-code type-mono-xs tracking-mono uppercase opacity-70">{chatDetail(item, now)}</small>
              </button>;
            })}
          </nav>
          {chats.length === 0 && <p className="m-0 px-4 py-2 type-sm text-muted">No conversations in this workspace yet.</p>}
        </section>}

        {mode === "work" && workspace && deskLens && needle && pages.length === 0
          && <p className="m-0 px-4 py-2 type-sm text-muted">Nothing in the sidebar matches “{query}”.</p>}

        {mode === "marketplace" && <>
          <div className={SECTION_LABEL}><span>MARKETPLACE</span></div>
          <nav className="sidebar-nav flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="Marketplace categories">
            <button
              className={sidebarRow(marketplaceRoute.kind === "discover")}
              type="button"
              aria-current={marketplaceRoute.kind === "discover" ? "page" : undefined}
              onClick={() => onOpenMarketplaceRoute({ kind: "discover" })}
            >
              <Compass size={16} strokeWidth={1.8} aria-hidden="true" />
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
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span className="min-w-0 truncate">{label}</span>
                <small />
              </button>;
            })}
          </nav>
          <div className={`${SECTION_LABEL} mt-3`}><span>MY LIBRARY</span></div>
          <nav className="sidebar-nav flex shrink-0 flex-col gap-0.5 px-2.5" aria-label="My Library">
            {MARKETPLACE_LIBRARY.map(({ id, label, icon: Icon }) => {
              const active = marketplaceRoute.kind === "library" && marketplaceRoute.section === id;
              return <button
                className={sidebarRow(active)}
                type="button"
                key={id}
                aria-current={active ? "page" : undefined}
                onClick={() => onOpenMarketplaceRoute({ kind: "library", section: id })}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span className="min-w-0 truncate">{label}</span>
                <small />
              </button>;
            })}
          </nav>
        </>}
      </div>

      {/* User row 56. The profile control is a plain row on the card now rather than a pill
          widget of its own -- one card, and the settings glyph is the only control on it. */}
      {rootPath && <div className="sidebar-footer flex h-14 flex-none items-stretch px-1.5 [&_.instrument-profile-control]:h-full [&_.instrument-profile-control]:w-full">
        <InstrumentProfileControl
          identity={{ displayName: profileIdentity(rootPath), initials: profileIdentity(rootPath).slice(0, 2).toUpperCase(), avatarUrl: null }}
          avatar={<ProfileAvatar rootPath={rootPath} size={30} round />}
          variant="pill"
          onOpenSettings={onOpenSettings}
        />
      </div>}
    </aside>
  );
}
