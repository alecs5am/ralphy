/**
 * The sidebar, wired to the app's two modes.
 *
 * Four of its controls mean "put the app in My Work and then go": a workspace, a page, a chat and
 * a new chat all imply a mode, and a chat also implies the lens it lives under. Those pairings are
 * what this component holds -- the sidebar itself only reports what was pressed.
 */
import { InstrumentSidebar } from "@/widgets/sidebar";
import type { AgentChatController } from "@/features/agent-chat";
import type { CatalogResult, WorkspaceSummary } from "@/shared/api/ipc";
import type { AppMode, MarketplaceBrowseRoute, MarketplaceRoute } from "@/shared/model/routes";
import type { SettingsPageId } from "@/pages/settings";
import type { WorkbenchRoute, WorkspacePage } from "@/shared/model/workbench";

export function AppSidebar({
  mode,
  lens,
  route,
  page,
  marketplaceRoute,
  catalog,
  workspaces,
  workspaceId,
  pinnedWorkspaceIds,
  canGoBack,
  canGoForward,
  agentChat,
  chats,
  onBack,
  onForward,
  onCollapse,
  onOpenSettings,
  onSwitchMode,
  onOpenMarketplaceRoute,
  onOpenWorkspace,
  onOpenPage,
  onLens,
}: {
  mode: AppMode;
  lens: "desk" | "chat";
  route: WorkbenchRoute;
  page: WorkspacePage;
  marketplaceRoute: MarketplaceRoute;
  catalog: CatalogResult | null;
  workspaces: WorkspaceSummary[];
  workspaceId: string | null;
  pinnedWorkspaceIds: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  agentChat: AgentChatController;
  chats: { id: string; title: string; busy: boolean; updatedAt: number }[];
  onBack(): void;
  onForward(): void;
  onCollapse(): void;
  onOpenSettings(page?: SettingsPageId): void;
  onSwitchMode(mode: AppMode): void;
  onOpenMarketplaceRoute(route: MarketplaceBrowseRoute): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenPage(page: WorkspacePage): void;
  onLens(lens: "desk" | "chat"): void;
}) {
  return <InstrumentSidebar
    mode={mode}
    lens={mode === "work" ? lens : "desk"}
    route={route}
    page={page}
    pageActive={mode === "work" && route.kind !== "project"}
    marketplaceRoute={marketplaceRoute}
    rootPath={catalog?.rootPath ?? null}
    workspaces={workspaces}
    workspaceId={workspaceId}
    pinnedWorkspaceIds={pinnedWorkspaceIds}
    canGoBack={canGoBack}
    canGoForward={canGoForward}
    onBack={onBack}
    onForward={onForward}
    onToggleSidebar={onCollapse}
    onOpenSettings={onOpenSettings}
    onSwitchMode={onSwitchMode}
    onOpenMarketplaceRoute={onOpenMarketplaceRoute}
    onOpenWorkspace={(id) => {
      onSwitchMode("work");
      onOpenWorkspace(id);
    }}
    onOpenPage={(next) => {
      onSwitchMode("work");
      onOpenPage(next);
    }}
    chats={chats}
    activeChatId={agentChat.activeChat?.id ?? null}
    onSelectChat={(chatId) => { onLens("chat"); agentChat.selectChat(chatId); }}
    onNewChat={() => { onLens("chat"); agentChat.newChat(); }}
  />;
}
