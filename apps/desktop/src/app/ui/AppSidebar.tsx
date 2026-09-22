/**
 * Workspace destinations return from Explore without changing the chat panel's state.
 */
import { InstrumentSidebar, type SidebarChat } from "@/widgets/sidebar";
import type { AgentChatController } from "@/features/agent-chat";
import type { CatalogResult, ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
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
  collapsed,
  onToggleSidebar,
  onOpenSettings,
  onSwitchMode,
  onOpenMarketplaceRoute,
  onOpenWorkspace,
  onOpenPage,
  onOpenProject,
  onRestoreProject = onOpenProject,
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
  chats: SidebarChat[];
  onBack(): void;
  onForward(): void;
  collapsed: boolean;
  onToggleSidebar(): void;
  onOpenSettings(page?: SettingsPageId): void;
  onSwitchMode(mode: AppMode): void;
  onOpenMarketplaceRoute(route: MarketplaceBrowseRoute): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenPage(page: WorkspacePage): void;
  onOpenProject(project: ProjectSummary): void;
  onRestoreProject?(project: ProjectSummary): void;
  onLens(lens: "desk" | "chat"): void;
}) {
  return <InstrumentSidebar
    collapsed={collapsed}
    mode={mode}
    lens={lens}
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
    onToggleSidebar={onToggleSidebar}
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
    projects={catalog?.projects ?? []}
    onOpenProject={(project) => { onSwitchMode("work"); onOpenProject(project); }}
    chats={chats}
    activeChatId={agentChat.activeChat?.id ?? null}
    onSelectChat={(chatId) => {
      const scope = chats.find((chat) => chat.id === chatId)?.project;
      const project = scope && catalog?.projects.find((item) => item.workspaceId === scope.workspaceId && item.projectId === scope.projectId);
      onSwitchMode("work");
      if (project) onRestoreProject(project);
      else if (scope && scope.workspaceId !== workspaceId) onOpenWorkspace(scope.workspaceId);
      onLens("chat");
      agentChat.selectChat(chatId);
    }}
    onRenameChat={agentChat.renameChat}
    onArchiveChat={agentChat.archiveChat}
    onNewProjectChat={(project) => {
      onSwitchMode("work"); onRestoreProject(project); onLens("chat");
      agentChat.newChat({ workspaceId: project.workspaceId, projectId: project.projectId });
    }}
  />;
}
