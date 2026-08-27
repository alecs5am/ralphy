/**
 * The sidebar card: a place switch, the workspace it stands in, one search field and whichever
 * list the lens asks for.
 *
 * The card owns the search needle and filters its lists before handing them to the sections
 * beside this file -- a list never has to know why it is short. The chrome vocabulary and the two
 * route tables live in `sidebar-chrome`.
 */
import { PanelLeft, Plus, Search } from "lucide-react";

import { Keycap } from "@/shared/ui/Keycap";
import { useId, useMemo, useState } from "react";
import type { WorkspaceSummary } from "@/shared/api/ipc";
import {
  sortWorkspaces,
  WORKSPACE_PAGES,
  type WorkbenchRoute,
  type WorkspacePage,
} from "@/shared/model/workbench";
import { WORKSPACE_PAGE_LABELS } from "@/shared/model/workbench";
import type { WorkbenchLens } from "@/shared/model/workbench";
import type {
  AppMode,
  MarketplaceBrowseRoute,
  MarketplaceRoute,
} from "@/shared/model/routes";
import { InstrumentProfileControl } from "./InstrumentProfileControl";
import { ProfileAvatar, profileIdentity } from "@/shared/ui/ProfileAvatar";
import { WorkspacePicker } from "./WorkspacePicker";
import { GHOST, matches, type SidebarChat } from "./sidebar-chrome";
import {
  MarketplaceNav,
  SidebarChats,
  SidebarModeSwitch,
  WorkspacePagesNav,
} from "./sidebar-sections";

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
    <aside className="context-sidebar flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-window bg-panel px-0.5 pb-0.5 text-ink animate-sidebar-in motion-reduce:animate-none">
      {/* Handoff 16's frame: the zone is a panel with a 2px frame holding a card, and the chrome is
          the zone's own row in that frame above the card -- not a header inside it. This is the one
          zone whose chrome is also the window's chrome line, so the frame opens at the top to meet
          it: 32 on the window's 8 line puts its centre at 24, the line macOS itself puts the
          traffic lights on, and they are drawn into this row from the main process. The run at the
          left is the space macOS needs, never a control, and the app's name is not repeated inside
          its own window. */}
      <header className="sidebar-header flex h-8 flex-none items-center gap-2.5 px-3 [-webkit-app-region:drag]">
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

      <div className="sidebar-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-frame bg-card">

      <SidebarModeSwitch mode={mode} onSwitchMode={onSwitchMode} />


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
        {mode === "work" && workspace && deskLens && <WorkspacePagesNav pages={pages} page={page} pageActive={pageActive} workspace={workspace} onOpenPage={onOpenPage} />}

        {mode === "work" && workspace && chatLens && <SidebarChats chats={chats} activeChatId={activeChatId} now={now} onSelectChat={onSelectChat} />}

        {mode === "work" && workspace && deskLens && needle && pages.length === 0
          && <p className="m-0 px-4 py-2 type-sm text-muted">Nothing in the sidebar matches “{query}”.</p>}

        {mode === "marketplace" && <MarketplaceNav route={marketplaceRoute} onOpenRoute={onOpenMarketplaceRoute} />}
      </div>

      {/* The user row, inset by the card's own 12 on three sides. It used to sit flush against the
          card's bottom edge, where the card's corner radius clipped the hover surface -- a hover
          plate has to clear the curve it stands in, not race it. The profile control is a plain
          row on the card rather than a pill widget of its own. */}
      {rootPath && <div className="sidebar-footer flex h-15.5 flex-none items-stretch px-3 pb-3 [&_.instrument-profile-control]:h-full [&_.instrument-profile-control]:w-full">
        <InstrumentProfileControl
          identity={{ displayName: profileIdentity(rootPath), initials: profileIdentity(rootPath).slice(0, 2).toUpperCase(), avatarUrl: null }}
          avatar={<ProfileAvatar rootPath={rootPath} size={30} round />}
          variant="pill"
          onOpenSettings={onOpenSettings}
        />
      </div>}
      </div>
    </aside>
  );
}
