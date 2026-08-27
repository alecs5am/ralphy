import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { AgentChatPanel } from "@/widgets/utility-panels";
import { WelcomeScreen } from "@/widgets/welcome";
import { useAgentChat } from "@/features/agent-chat";
import { bridge } from "@/shared/api/ipc";
import { MigrationRecoveryScreen } from "@/pages/migration-recovery";
import type { SettingsPageId as SettingsCategory } from "@/pages/settings";
import { browserLabel, retargetViewTab, ViewBrowser, ViewPanel, ViewPanelHub } from "@/widgets/view-panel";
import { InstrumentShell } from "./layout/InstrumentShell";
import { useTheme } from "@/shared/lib/ThemeProvider";
import { WORKSPACE_PAGE_LABELS } from "@/shared/model/workbench";
import { isWorkspacePickerVisible } from "./model/app-visibility";
import { historyEdges, routeScrollKey } from "./model/route-identity";
import { useAppCommands } from "./model/use-app-commands";
import { useAppSession } from "./model/use-app-session";
import { useShellPreferences } from "./model/use-shell-preferences";
import { useWorkspaceNavigation } from "./model/use-workspace-navigation";
import { useMarketplaceNavigation } from "./model/use-marketplace-navigation";
import { useIslandFeed } from "./model/use-island-feed";
import { useViewTabs } from "./model/use-view-tabs";
import { AppErrorBanner, WorkspaceDestinationFrame } from "./ui/app-frames";
import { AppDesk } from "./ui/AppDesk";
import { AppIsland } from "./ui/AppIsland";
import { AppSettings } from "./ui/AppSettings";
import { AppSidebar } from "./ui/AppSidebar";
import { WorkRoute } from "./ui/WorkRoute";

export function App() {
  const { preference: theme, resolved: resolvedTheme, setPreference: setTheme } = useTheme();
  const {
    initialPreferences,
    state,
    dispatch,
    restoring,
    rootIdentity,
    migrationRecovery,
    error,
    setError,
    welcomeVisible,
    welcomeExiting,
    viewport,
    restoreHomeLibrary,
  } = useAppSession(theme);
  const {
    marketplace,
    dispatchMarketplace,
    switchAppMode,
    navigateMarketplace,
    rememberMarketplace,
    openMarketplaceRoute,
    navigateBack,
    navigateForward,
  } = useMarketplaceNavigation(dispatch);
  const {
    workspacePage,
    setWorkspacePage,
    sidebarVisible,
    setSidebarVisible,
    rightPanelVisible,
    setRightPanelVisible,
    lens,
    setLens,
    rightOverlayOpen,
    setRightOverlayOpen,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    viewPanel,
    setViewPanel,
  } = useShellPreferences(initialPreferences.current, { restoring, rootIdentity, state });
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsEntry, setSettingsEntry] = useState<SettingsCategory | undefined>(undefined);
  const openSettings = useCallback((page?: SettingsCategory) => {
    setSettingsEntry(page);
    setSettingsVisible(true);
  }, []);
  const [sidebarSearchRequest, setSidebarSearchRequest] = useState(0);

  const catalog = state.catalog;
  const workspaces = catalog?.workspaces ?? [];
  const projects = catalog?.projects ?? [];
  const selectedWorkspace = useMemo(() => {
    if (state.route.kind === "library") return null;
    const workspaceId = state.route.workspaceId;
    return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  }, [state.route, workspaces]);
  const selectedProject = useMemo(() => {
    if (state.route.kind !== "project") return null;
    const { workspaceId, projectId } = state.route;
    return projects.find(
      (project) =>
        project.workspaceId === workspaceId && project.projectId === projectId,
    ) ?? null;
  }, [projects, state.route]);
  const {
    workspaceDestination,
    overviewReturnState,
    targetUnitId,
    clearOverviewNavigation,
    openWorkspace,
    openProject,
    openWorkspacePage,
    navigateFromOverview,
    backToOverview,
  } = useWorkspaceNavigation({ setWorkspacePage, dispatch, selectedWorkspace, workspaces, setLens });
  const agentChat = useAgentChat({
    rootPath: rootIdentity?.storeId ?? null,
    workspaceId: selectedWorkspace?.id ?? null,
    project: selectedProject,
    /* The chat lens is what makes the agent live now: `rightPanelVisible` still resolves the dock
       for the review console and the shared inspector, but it no longer opens the chat. */
    enabled: lens === "chat",
  });
  const sidebarChats = useMemo(
    () => [...(agentChat.state?.chats ?? [])]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ id, title, busy, updatedAt }) => ({ id, title, busy, updatedAt })),
    [agentChat.state?.chats],
  );
  const island = useIslandFeed({
    mode: marketplace.mode,
    marketplaceRoute: marketplace.location.route,
    rootEpoch: rootIdentity?.rootEpoch ?? 0,
    agentState: agentChat.state,
    error,
    selectedWorkspace,
    selectedProject,
    workspacePage,
  });
  const marketplaceSidebarVisible = marketplace.sidebarVisible && viewport.width > 1_280;
  const activeSidebarVisible = marketplace.mode === "work" ? sidebarVisible : marketplaceSidebarVisible;
  const activeSidebarWidth = sidebarWidth;
  const workspacePickerVisible = isWorkspacePickerVisible({
    mode: marketplace.mode,
    sidebarVisible: activeSidebarVisible,
    workspaceId: selectedWorkspace?.id ?? null,
  });
  useAppCommands({
    settingsVisible,
    setSettingsVisible,
    mode: marketplace.mode,
    route: state.route,
    workspaces,
    navigateBack,
    navigateForward,
    openWorkspace,
    clearOverviewNavigation,
    setWorkspacePage,
    setSidebarSearchRequest,
    toggleMarketplaceSidebar: () => dispatchMarketplace({ type: "toggle-sidebar" }),
    setSidebarVisible,
    setLens,
    onNewChat: agentChat.newChat,
    switchAppMode,
  });

  /* ---- Handoff 14's view panel ----------------------------------------------------------- */

  /* The tab set and the width belong to the chat, so both swap when the chat does -- and because a
     chat belongs to one workspace, switching workspace swaps them too. `open` does not: that is one
     window-level decision. */
  const viewChatId = agentChat.activeChat?.id ?? null;
  const {
    viewFrameActive,
    tabSet,
    viewTab,
    viewWidth,
    viewChords,
    toggleViewPanel,
    updateChatPanel,
    updateTabs,
    openView,
    selectView,
    closeView,
  } = useViewTabs({
    viewPanel,
    setViewPanel,
    lens,
    setLens,
    mode: marketplace.mode,
    viewChatId,
    route: state.route,
    projects,
    workspacePage,
    settingsVisible,
    onOpenWorkspacePage: openWorkspacePage,
    onOpenProject: openProject,
  });

  if (migrationRecovery) {
    return (
      <MigrationRecoveryScreen
        recovery={migrationRecovery}
        onCopyCommand={() => {
          void bridge.copyMigrationRecoveryCommand().catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
          });
        }}
      />
    );
  }

  if (welcomeVisible) {
    return <WelcomeScreen exiting={welcomeExiting} restoring={restoring} />;
  }

  let workContent = <WorkRoute
    catalog={catalog}
    error={error}
    restoring={restoring}
    route={state.route}
    pinnedWorkspaceIds={state.pinnedWorkspaceIds}
    pinnedProjectIds={state.pinnedProjectIds}
    rootEpoch={rootIdentity?.rootEpoch ?? 0}
    activitySequence={rootIdentity?.activitySequence ?? 0}
    workspaces={workspaces}
    projects={projects}
    selectedWorkspace={selectedWorkspace}
    selectedProject={selectedProject}
    workspacePage={workspacePage}
    overviewReturnState={overviewReturnState}
    workspaceDestination={workspaceDestination}
    sidebarSearchRequest={sidebarSearchRequest}
    targetUnitId={targetUnitId}
    chat={agentChat.activeChat ?? null}
    onRetryLibrary={() => void restoreHomeLibrary()}
    onOpenWorkspace={openWorkspace}
    onOpenProject={openProject}
    onOpenWorkspacePage={openWorkspacePage}
    onNavigateFromOverview={navigateFromOverview}
    onToggleProjectPin={(projectId) => dispatch({ type: "toggle-project-pin", projectId })}
  />;

  if (workspaceDestination && overviewReturnState?.originWorkspaceId === selectedWorkspace?.id && state.route.kind === "workspace" && workspacePage === workspaceDestination.page) {
    workContent = <WorkspaceDestinationFrame destination={workspaceDestination} onBack={backToOverview}>{workContent}</WorkspaceDestinationFrame>;
  }

  /* The home tab is the one tab that is not a route, so it is the one place the panel puts its own
     page in front of the work content. Under the desk lens there is no panel and no home tab. */
  if (viewFrameActive && viewTab.type === "home") {
    workContent = <ViewPanelHub
      workspace={selectedWorkspace}
      projects={projects.filter((project) => project.workspaceId === selectedWorkspace?.id)}
      workspaces={workspaces}
      chords={viewChords}
      onOpen={openView}
      onOpenProject={openProject}
      onOpenWorkspace={(workspaceId) => { switchAppMode("work"); openWorkspace(workspaceId); }}
    />;
  }

  /* The guest is mounted while the tab exists rather than while it is active: the panel hides it
     behind the card, so switching to Units and back keeps the page the operator opened. */
  const browserTab = viewFrameActive ? tabSet.tabs.find(({ type }) => type === "browser") ?? null : null;
  const viewBrowser = browserTab && <ViewBrowser
    key={`${viewChatId}:${browserTab.id}`}
    url={browserTab.targetId}
    onNavigate={(url, title) => updateTabs((set) => retargetViewTab(set, browserTab.id, url, browserLabel(url, title)))}
  />;

  const { canGoBack, canGoForward } = historyEdges(marketplace, state);
  const scrollKey = routeScrollKey(marketplace, state, workspacePage);

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="asset-workbench">
        <motion.div
          className="workbench instrument-shell-frame"
          style={{
            "--sidebar-w": `${activeSidebarWidth}px`,
          } as CSSProperties}
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 }}
        >
          <InstrumentShell
            sidebar={<AppSidebar
              mode={marketplace.mode}
              lens={lens}
              route={state.route}
              page={workspacePage}
              marketplaceRoute={marketplace.location.route}
              catalog={catalog}
              workspaces={workspaces}
              workspaceId={workspacePickerVisible ? selectedWorkspace!.id : null}
              pinnedWorkspaceIds={state.pinnedWorkspaceIds}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              agentChat={agentChat}
              chats={sidebarChats}
              onBack={navigateBack}
              onForward={navigateForward}
              onCollapse={() => {
                if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
                else setSidebarVisible(false);
              }}
              onOpenSettings={openSettings}
              onSwitchMode={switchAppMode}
              onOpenMarketplaceRoute={openMarketplaceRoute}
              onOpenWorkspace={openWorkspace}
              onOpenPage={openWorkspacePage}
              onLens={setLens}
            />}
            desk={<AppDesk
              mode={marketplace.mode}
              viewFrameActive={viewFrameActive}
              catalog={catalog}
              workRoute={state.route}
              location={marketplace.location}
              marketplaceSidebarVisible={marketplaceSidebarVisible}
              onBack={navigateBack}
              onNavigate={navigateMarketplace}
              onRememberLocation={rememberMarketplace}
            >{workContent}</AppDesk>}
            /* Closing the chat is a lens decision now, not a dock one: the panel's close control
               puts the desk lens back rather than leaving a chat lens with an empty main column. */
            chat={<AgentChatPanel
              onClose={() => setLens("desk")}
              onOpenSettings={openSettings}
              /* The chat lens' Context is a view beside the chat, not a route change: the operator
                 is mid-message, and the point is to read what the turn carries without leaving it. */
              onOpenContext={() => openView({ type: "context", label: WORKSPACE_PAGE_LABELS.context })}
              chat={agentChat}
              workspace={selectedWorkspace}
              project={selectedProject}
            />}
            island={<AppIsland
              feed={island.feed}
              context={island.context}
              projectName={selectedProject?.name ?? null}
              mock={island.mock}
              onToggleViewPanel={toggleViewPanel}
              onSwitchMode={switchAppMode}
              onOpenWorkspace={openWorkspace}
              onNavigateMarketplace={navigateMarketplace}
              dispatch={dispatch}
            />}
            viewOpen={viewPanel.open}
            viewWidth={viewWidth}
            onViewWidthChange={(width) => updateChatPanel((panel) => ({ ...panel, width }))}
            /* The frame is a wrapper, not a sibling: the tab strip and the page card belong to the
               panel, and the desk's own scroller has to stay inside the card so scroll restoration
               and the desk container query keep working there. */
            viewPanelFrame={viewFrameActive
              ? (page) => <ViewPanel
                set={tabSet}
                width={viewWidth}
                chords={viewChords}
                onSelect={selectView}
                onClose={closeView}
                onOpen={openView}
                browser={viewBrowser}
              >{page}</ViewPanel>
              : undefined}
            routeScrollKey={scrollKey}
            leftVisible={activeSidebarVisible}
            leftWidth={sidebarWidth}
            onLeftWidthChange={setSidebarWidth}
            rightWidth={rightPanelWidth}
            onRightWidthChange={setRightPanelWidth}
            /* The lens is a My Work question: Marketplace has no chat of its own, so it keeps
               the desk lens and shows no pair. */
            lens={marketplace.mode === "work" ? lens : "desk"}
            onLensChange={marketplace.mode === "work" ? setLens : undefined}
            rightPreference={rightPanelVisible}
            rightOverlayOpen={rightOverlayOpen}
            topChrome={{
              canGoBack,
              canGoForward,
              onBack: navigateBack,
              onForward: navigateForward,
            }}
            onToggleLeft={() => {
              if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
              else setSidebarVisible((visible) => !visible);
            }}
            onToggleRightPreference={() => setRightPanelVisible((visible) => !visible)}
            onRightOverlayOpenChange={setRightOverlayOpen}
          />
          {error && <AppErrorBanner message={error} onDismiss={() => setError(null)} />}
          {/* No exit animation: the overlay lives in a portal, so AnimatePresence never sees
              the nested motion element finish and leaves an invisible surface over the app. */}
          {settingsVisible && <AppSettings
            rootPath={rootIdentity?.storeId ?? null}
            theme={theme}
            resolvedTheme={resolvedTheme}
            entryPage={settingsEntry}
            onThemeChange={setTheme}
            onClose={() => setSettingsVisible(false)}
          />}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
