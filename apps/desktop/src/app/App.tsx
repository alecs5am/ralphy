import { useInterfaceMotion } from "./model/use-interface-motion";
import { useMemo, useState, type CSSProperties } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { AgentChatPanel } from "@/widgets/utility-panels";
import { WelcomeScreen } from "@/widgets/welcome";
import { useAgentChat, type Attachment } from "@/features/agent-chat";
import { bridge } from "@/shared/api/ipc";
import { MigrationRecoveryScreen } from "@/pages/migration-recovery";
import { browserLabel, retargetViewTab, unitViewRequest, ViewBrowser, ViewPanel } from "@/widgets/view-panel";
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
  const reducedMotion = useInterfaceMotion();
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
    restoreHomeLibrary,
  } = useAppSession(theme);
  const {
    marketplace,
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
  } = useShellPreferences(initialPreferences.current, { restoring, rootIdentity, state, dispatch });
  const { settingsVisible, setSettingsVisible, settingsEntry, openSettings } = useSettingsDialog();
  const [canvasRequest, setCanvasRequest] = useState<{ prompt: string; attachment: Attachment; id: string; chatId: string | null } | null>(null);
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
  } = useWorkspaceNavigation({ setWorkspacePage, dispatch, selectedWorkspace, workspaces });
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
      .sort((left, right) => right.updatedAt - left.updatedAt),
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
    setWorkspacePage: (page) => openView({ type: page, label: WORKSPACE_PAGE_LABELS[page] }),
    setSidebarSearchRequest,
    setSidebarVisible,
    setLens: (next) => next === "chat" ? revealCanvasChat() : setLens(next),
    toggleAgent: () => { if (lens === "chat" && !viewExpanded) setLens("desk"); else revealCanvasChat(); },
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
    agentRequest,
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
    viewChatReady: agentChat.historyReady,
    viewScopeKey: JSON.stringify([rootIdentity?.storeId, selectedWorkspace?.id]),
    route: state.route,
    projects,
    workspacePage,
    settingsVisible,
    onOpenWorkspacePage: openWorkspacePage,
    onOpenProject: openProject,
  });
  const canvasView = !!selectedWorkspace && (viewFrameActive ? viewTab.type === "canvas" : state.route.kind === "workspace" && workspacePage === "canvas");
  const fillDesk = marketplace.mode === "work" && (
    canvasView || (viewFrameActive && viewTab.type === "unit")
    || (viewFrameActive ? viewTab.type === "project" : state.route.kind === "project")
    || (!!selectedWorkspace && (viewFrameActive ? viewTab.type === "generation" : state.route.kind === "workspace" && workspacePage === "generation"))
  );
  const activeSidebarVisible = sidebarVisible;
  const workspacePickerVisible = isWorkspacePickerVisible({ mode: marketplace.mode, workspaceId: selectedWorkspace?.id ?? null });
  const requestAgentDraft = agentChat.historyReady ? (request: { prompt: string; attachment: Attachment }) => {
    revealCanvasChat();
    setCanvasRequest({ ...request, id: crypto.randomUUID(), chatId: viewChatId });
  } : undefined;

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
    onOpenWorkspace={openWorkspace} onOpenUnitView={(reference, unitId, label, revisionId) => openView(unitViewRequest(reference, unitId, label, revisionId))}
    onOpenProject={(project, unitId) => viewFrameActive && state.route.kind !== "library" ? openView(unitId ? unitViewRequest(project, unitId, "Unit") : { type: "project", targetId: project.projectId, label: project.name }) : openProject(project, unitId)}
    onOpenWorkspacePage={openWorkspacePage}
    onNavigateFromOverview={navigateFromOverview}
    onToggleProjectPin={(projectId) => dispatch({ type: "toggle-project-pin", projectId })}
    onOpenProviders={() => openSettings("providers")}
    onRequestVideoAgent={requestAgentDraft}
  />;

  if (workspaceDestination && overviewReturnState?.originWorkspaceId === selectedWorkspace?.id && state.route.kind === "workspace" && workspacePage === workspaceDestination.page) {
    workContent = <WorkspaceDestinationFrame destination={workspaceDestination} onBack={backToOverview}>{workContent}</WorkspaceDestinationFrame>;
  }

  if (canvasView && selectedWorkspace) {
    workContent = <AppCanvas onOpenUnit={(reference, unitId, label, revisionId) => openView(unitViewRequest(reference, unitId, label, revisionId))} embedded={viewFrameActive} expanded={viewExpanded} onToggleExpanded={toggleViewExpanded} key={`${rootIdentity?.storeId}:${selectedWorkspace.id}`} workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name} storageScope={rootIdentity?.storeId ?? "local"} agentBusy={!!agentChat.state.runningChatId}
      onOpenProviders={() => openSettings("providers")} onOpenAgents={() => openSettings("agents")}
      onRequestAgent={requestAgentDraft} />;
  }

  /* The guest is mounted while the tab exists rather than while it is active: the panel hides it
     behind the card, so switching to Units and back keeps the page the operator opened. */
  const browserTab = tabSet.tabs.find(({ type }) => type === "browser") ?? null;
  const viewBrowser = browserTab && <ViewBrowser
    key={`${viewChatId}:${browserTab.id}`}
    url={browserTab.targetId}
    onNavigate={(url, title) => updateTabs((set) => retargetViewTab(set, browserTab.id, url, browserLabel(url, title)))}
  />;

  const { canGoBack, canGoForward } = historyEdges(marketplace, state);
  const scrollKey = canvasView && marketplace.mode === "work" ? `canvas:${selectedWorkspace!.id}` : routeScrollKey(marketplace, state, workspacePage);
  return (
    <MotionConfig reducedMotion={reducedMotion}>
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
              collapsed={!activeSidebarVisible}
              onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
              onOpenSettings={openSettings}
              onSwitchMode={switchAppMode}
              onOpenMarketplaceRoute={openMarketplaceRoute}
              onOpenWorkspace={openWorkspace}
              onOpenProject={(project) => openView({ type: "project", targetId: project.projectId, label: project.name })}
              onRestoreProject={openProject}
              onOpenPage={(page) => openView({ type: page, label: WORKSPACE_PAGE_LABELS[page] })}
              onLens={(next) => next === "chat" ? revealCanvasChat() : setLens(next)}
            />}
            desk={<AppDesk
              mode={marketplace.mode}
              fillHeight={fillDesk} pageHeaderHost={pageHeaderHost}
              catalog={catalog}
              workRoute={state.route}
              location={marketplace.location}
              marketplaceSidebarVisible={false}
              onBack={navigateBack}
              onNavigate={navigateMarketplace}
              onRememberLocation={rememberMarketplace}
              onRequestAgent={requestAgentDraft}
            >{workContent}</AppDesk>}
            chat={<AgentChatPanel
              onOpenUnit={(ref, unitId, label, revisionId) => { if (ref.workspaceId === selectedWorkspace?.id) { switchAppMode("work"); openView(unitViewRequest(ref, unitId, label, revisionId)); } }}
              onToggleView={marketplace.mode === "work" ? toggleViewPanel : undefined}
              draftRequest={canvasRequest}
              onDraftRequestHandled={() => setCanvasRequest(null)}
              onClose={() => setLens("desk")}
              onOpenSettings={openSettings}
              /* Keep Context beside the active chat. */
              onOpenContext={() => { switchAppMode("work"); openView({ type: "context", label: WORKSPACE_PAGE_LABELS.context }); }}
              chat={agentChat}
              workspace={selectedWorkspace}
              project={projects.find((project) => project.workspaceId === agentChat.activeChat.project?.workspaceId && project.projectId === agentChat.activeChat.project?.projectId) ?? null}
            />}
            island={<AppIsland
              feed={island.feed}
              context={island.context}
              projectName={selectedProject?.name ?? null}
              mock={island.mock}
              onSwitchMode={switchAppMode}
              onOpenWorkspace={openWorkspace}
              onNavigateMarketplace={navigateMarketplace}
              dispatch={dispatch}
            />}
            viewOpen={marketplace.mode === "marketplace" || viewPanel.open} deskFill={fillDesk}
            pageHeaderRef={marketplace.mode === "marketplace" || (lens !== "chat" || viewPanel.open) && !(viewFrameActive && viewTab.type === "browser") ? setPageHeaderHost : undefined}
            viewExpanded={marketplace.mode === "work" && viewExpanded}
            agentRequest={agentRequest}
            viewWidth={viewWidth}
            onViewWidthChange={(width) => updateChatPanel((panel) => ({ ...panel, width }))}
            viewPanelFrame={(page, compact, measuredWidth) => <ViewPanel
                set={tabSet}
                width={measuredWidth || viewWidth}
                chromeVisible={marketplace.mode === "work" && viewFrameActive}
                expanded={viewExpanded || compact} compact={compact}
                onToggleExpanded={compact ? toggleViewPanel : toggleViewExpanded}
                chords={viewChords}
                onSelect={selectView}
                onClose={closeView}
                onOpen={openView}
                browser={viewBrowser}
              >{page}</ViewPanel>}
            routeScrollKey={scrollKey}
            leftVisible={activeSidebarVisible}
            leftWidth={sidebarWidth}
            onLeftWidthChange={setSidebarWidth}
            rightWidth={rightPanelWidth}
            onRightWidthChange={setRightPanelWidth}
            lens={lens}
            onLensChange={(next) => next === "chat" ? revealCanvasChat() : setLens(next)}
            rightPreference={rightPanelVisible}
            rightOverlayOpen={rightOverlayOpen}
            topChrome={{
              canGoBack,
              canGoForward,
              onBack: navigateBack,
              onForward: navigateForward,
            }}
            onToggleRightPreference={() => setRightPanelVisible((visible) => !visible)}
            onRightOverlayOpenChange={setRightOverlayOpen}
          />
          {error && <AppErrorBanner message={error} onDismiss={() => setError(null)} />}
          {/* No exit animation: the overlay lives in a portal, so AnimatePresence never sees
              the nested motion element finish and leaves an invisible surface over the app. */}
          {settingsVisible && <AppSettings
            workspace={selectedWorkspace}
            rootPath={rootIdentity?.storeId ?? null}
            theme={theme}
            resolvedTheme={resolvedTheme}
            entryPage={settingsEntry}
            onThemeChange={setTheme}
            onClose={() => setSettingsVisible(false)}
            onOpenWorkspaceSettings={(page) => { setSettingsVisible(false); switchAppMode("work"); openView({ type: page, label: WORKSPACE_PAGE_LABELS[page] }); }}
          />}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
