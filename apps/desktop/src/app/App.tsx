import { useMemo, useState, type CSSProperties } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { AgentChatPanel } from "@/widgets/utility-panels";
import { WelcomeScreen } from "@/widgets/welcome";
import { useAgentChat } from "@/features/agent-chat";
import type { CanvasAgentRequest } from "@/features/workflow-canvas";
import { bridge } from "@/shared/api/ipc";
import { MigrationRecoveryScreen } from "@/pages/migration-recovery";
import { browserLabel, retargetViewTab, unitViewRequest, ViewBrowser, ViewPanel, ViewPanelHub } from "@/widgets/view-panel";
import { InstrumentShell } from "./layout/InstrumentShell";
import { useTheme } from "@/shared/lib/ThemeProvider";
import { WORKSPACE_PAGE_LABELS } from "@/shared/model/workbench";
import { isWorkspacePickerVisible } from "./model/app-visibility";
import { historyEdges, routeScrollKey } from "./model/route-identity";
import { useAppCommands } from "./model/use-app-commands";
import { useAppSession } from "./model/use-app-session";
import { useShellPreferences } from "./model/use-shell-preferences";
import { useSettingsDialog } from "./model/use-settings-dialog";
import { useWorkspaceNavigation } from "./model/use-workspace-navigation";
import { useMarketplaceNavigation } from "./model/use-marketplace-navigation";
import { useIslandFeed } from "./model/use-island-feed";
import { useViewTabs } from "./model/use-view-tabs";
import { AppErrorBanner, WorkspaceDestinationFrame } from "./ui/app-frames";
import { AppDesk } from "./ui/AppDesk";
import { AppCanvas } from "./ui/AppCanvas";
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
  const { settingsVisible, setSettingsVisible, settingsEntry, openSettings } = useSettingsDialog();
  const [canvasRequest, setCanvasRequest] = useState<(CanvasAgentRequest & { id: string; chatId: string | null }) | null>(null);
  const [sidebarSearchRequest, setSidebarSearchRequest] = useState(0);
  const [pageHeaderHost, setPageHeaderHost] = useState<HTMLDivElement | null>(null);
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
    targetUnitId, clearTargetUnit,
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
  const activeSidebarWidth = sidebarWidth;
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

  const viewChatId = agentChat.activeChat?.id ?? null;
  const {
    viewFrameActive,
    tabSet,
    viewTab,
    viewWidth,
    viewExpanded,
    toggleViewExpanded,
    revealCanvasChat,
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

  const canvasView = !!selectedWorkspace && marketplace.mode === "work" && (viewFrameActive ? viewTab.type === "canvas" : state.route.kind === "workspace" && workspacePage === "canvas");
  const fillDesk = canvasView || (viewFrameActive && viewTab.type === "unit") || (!!selectedWorkspace && marketplace.mode === "work" && (viewFrameActive ? viewTab.type === "generation" : state.route.kind === "workspace" && workspacePage === "generation"));
  const activeSidebarVisible = marketplace.mode === "work" ? sidebarVisible && !(canvasView && viewExpanded && (!viewFrameActive || viewPanel.open)) : marketplaceSidebarVisible;
  const workspacePickerVisible = isWorkspacePickerVisible({ mode: marketplace.mode, sidebarVisible: activeSidebarVisible, workspaceId: selectedWorkspace?.id ?? null });

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
    viewTab={viewFrameActive ? viewTab : null} onCloseUnitView={() => closeView(viewTab.id)}
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
    targetUnitId={targetUnitId} onTargetUnitOpened={clearTargetUnit}
    chat={agentChat.activeChat ?? null}
    onRetryLibrary={() => void restoreHomeLibrary()}
    onOpenWorkspace={openWorkspace}
    onOpenProject={(project, unitId) => viewFrameActive ? openView(unitId ? unitViewRequest(project, unitId, "Unit") : { type: "project", targetId: project.projectId, label: project.name }) : openProject(project, unitId)}
    onOpenWorkspacePage={openWorkspacePage}
    onNavigateFromOverview={navigateFromOverview}
    onToggleProjectPin={(projectId) => dispatch({ type: "toggle-project-pin", projectId })}
    onOpenProviders={() => openSettings("providers")}
    onRequestVideoAgent={(request) => { revealCanvasChat(); setCanvasRequest({ ...request, id: crypto.randomUUID(), chatId: viewChatId }); }}
  />;

  if (workspaceDestination && overviewReturnState?.originWorkspaceId === selectedWorkspace?.id && state.route.kind === "workspace" && workspacePage === workspaceDestination.page) {
    workContent = <WorkspaceDestinationFrame destination={workspaceDestination} onBack={backToOverview}>{workContent}</WorkspaceDestinationFrame>;
  }

  if (viewFrameActive && viewTab.type === "home") {
    workContent = <ViewPanelHub
      workspace={selectedWorkspace}
      projects={projects.filter((project) => project.workspaceId === selectedWorkspace?.id)}
      workspaces={workspaces}
      chords={viewChords}
      onOpen={openView}
      onOpenProject={(project) => openView({ type: "project", targetId: project.projectId, label: project.name })}
      onOpenWorkspace={(workspaceId) => { switchAppMode("work"); openWorkspace(workspaceId); }}
    />;
  }

  if (canvasView && selectedWorkspace) {
    workContent = <AppCanvas embedded={viewFrameActive} expanded={viewExpanded} onToggleExpanded={toggleViewExpanded} key={`${rootIdentity?.storeId}:${selectedWorkspace.id}`} workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name} storageScope={rootIdentity?.storeId ?? "local"} agentBusy={!!agentChat.state.runningChatId}
      onOpenProviders={() => openSettings("providers")}
      onRequestAgent={(request) => { revealCanvasChat(); setCanvasRequest({ ...request, id: crypto.randomUUID(), chatId: viewChatId }); }} />;
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
  const scrollKey = canvasView ? `canvas:${selectedWorkspace!.id}` : routeScrollKey(marketplace, state, workspacePage);
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
              viewFrameActive={viewFrameActive} fillHeight={fillDesk} pageHeaderHost={pageHeaderHost}
              catalog={catalog}
              workRoute={state.route}
              location={marketplace.location}
              marketplaceSidebarVisible={marketplaceSidebarVisible}
              onBack={navigateBack}
              onNavigate={navigateMarketplace}
              onRememberLocation={rememberMarketplace}
            >{workContent}</AppDesk>}
            chat={<AgentChatPanel
              onOpenUnit={(ref, unitId, label) => { if (ref.workspaceId === selectedWorkspace?.id) openView(unitViewRequest(ref, unitId, label)); }}
              onToggleView={toggleViewPanel}
              onOpenCanvas={() => openView({ type: "canvas", label: "Working canvases" })}
              draftRequest={canvasRequest}
              onDraftRequestHandled={() => setCanvasRequest(null)}
              onClose={() => setLens("desk")}
              onOpenSettings={openSettings}
              /* Keep Context beside the active chat. */
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
            viewOpen={viewPanel.open} deskFill={fillDesk}
            pageHeaderRef={marketplace.mode === "work" && !viewFrameActive ? setPageHeaderHost : undefined}
            viewExpanded={viewExpanded}
            viewWidth={viewWidth}
            onViewWidthChange={(width) => updateChatPanel((panel) => ({ ...panel, width }))}
            viewPanelFrame={viewFrameActive
              ? (page) => <ViewPanel
                set={tabSet}
                width={viewWidth}
                expanded={viewExpanded}
                onToggleExpanded={toggleViewExpanded}
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
              else if (canvasView && viewExpanded) toggleViewExpanded();
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
