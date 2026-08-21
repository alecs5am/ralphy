import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps,
} from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { ContextSidebar } from "./components/ContextSidebar";
import { MainHeader } from "./components/Titlebar";
import { AgentChatPanel, BottomPanel } from "./components/UtilityPanels";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ResizeHandle } from "./components/ui/ResizeHandle";
import { useAgentChat } from "./chat/useAgentChat";
import {
  bridge,
  type ActivityRefreshEvent,
  type MigrationRecovery,
  type ProjectSummary,
  type RootIdentity,
} from "./lib/ipc";
import { LibraryScreen } from "./screens/LibraryScreen";
import { WorkspaceScreen } from "./screens/WorkspaceScreen";
import { WorkspacePagePlaceholder, WorkspaceProjectsScreen } from "./screens/WorkspaceProjectsScreen";
import { MigrationRecoveryScreen } from "./screens/MigrationRecoveryScreen";
import { MemoryScreen } from "./screens/MemoryScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { SharedLibraryScreen } from "./screens/SharedLibraryScreen";
import { MarketplaceScreen } from "./screens/MarketplaceScreen";
import { InstrumentScreenRoot } from "./instrument/screen-state-registry";
import { InstrumentShell, useInstrumentRightRail } from "./instrument/InstrumentShell";
import { useTheme } from "./instrument/ThemeProvider";
import { unitsInstrumentStates } from "./screens/project/unit-instrument-state";
import {
  MARKETPLACE_SIDEBAR_WIDTH,
  marketplaceReducer,
  readMarketplaceNavigation,
  writeMarketplaceNavigation,
  type AppMode,
  type MarketplaceBrowseRoute,
  type MarketplaceLocation,
  type MarketplaceMemoryPatch,
} from "./state/marketplace-navigation";
import {
  createInitialWorkbenchState,
  mostRecentWorkspaceId,
  PANEL_SIZE_LIMITS,
  readWorkbenchPreferences,
  updateWorkbenchPreferences,
  workbenchReducer,
  type WorkspaceDestination,
  type WorkspaceOverviewReturnState,
  type WorkspacePage,
} from "./state/workbench";

const loadProjectScreen = () =>
  import("./screens/ProjectScreen").then(({ ProjectScreen }) => ({
    default: ProjectScreen,
  }));
const ProjectScreen = lazy(loadProjectScreen);
const loadSettingsScreen = () =>
  import("./screens/SettingsScreen").then(({ SettingsScreen }) => ({
    default: SettingsScreen,
  }));
const SettingsScreen = lazy(loadSettingsScreen);
const WELCOME_MINIMUM_MS = 1_200;
const WELCOME_EXIT_MS = 300;
const INSTRUMENT_SIDEBAR_WIDTH = 240;

export function ProjectScreenLoadingFallback() {
  return (
    <InstrumentScreenRoot descriptor={unitsInstrumentStates} state="loading">
      <main className="main-region project-region">
        <div className="project-indexing">
          <span className="loading-line" />
          <span>Opening project…</span>
        </div>
      </main>
    </InstrumentScreenRoot>
  );
}

export function isWorkspacePickerVisible({ mode, sidebarVisible, workspaceId }: {
  mode: AppMode;
  sidebarVisible: boolean;
  workspaceId: string | null;
}): boolean {
  return mode === "work" && sidebarVisible && workspaceId !== null;
}

export function isChatRailVisible({ workbenchVisible, rightPanelVisible }: {
  workbenchVisible: boolean;
  rightPanelVisible: boolean;
}): boolean {
  return workbenchVisible && rightPanelVisible;
}

function InstrumentWorkbenchHeader(props: ComponentProps<typeof MainHeader>) {
  const rail = useInstrumentRightRail();
  const toggleRightRail = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    const opener = active?.getAttribute("aria-label") === "Toggle right panel"
      ? active
      : document.querySelector<HTMLElement>('button[aria-label="Toggle right panel"]');
    if (rail.mode === "closed") rail.open(opener);
    else rail.close();
  }, [rail]);
  useEffect(() => bridge.onToggleRightPanel(toggleRightRail), [toggleRightRail]);
  return <MainHeader {...props} rightPanelVisible={rail.mode !== "closed"} onToggleRightPanel={toggleRightRail} />;
}

function InstrumentChat(props: Omit<ComponentProps<typeof AgentChatPanel>, "onClose">) {
  const rail = useInstrumentRightRail();
  return <AgentChatPanel {...props} onClose={rail.close} />;
}

function WorkspaceDestinationFrame({ destination, onBack, children }: {
  destination: WorkspaceDestination;
  onBack(): void;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = root.current?.querySelector<HTMLElement>("h1") ?? root.current?.querySelector<HTMLElement>("h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [destination]);
  const context = destination.context;
  return <div className="workspace-destination" ref={root}>
    <div className="workspace-return-bar">
      <button type="button" onClick={onBack}>Back to Overview</button>
      {context && <span>Context from Overview · {context.label}
        {destination.page === "calendar" && destination.context?.accountLabel ? ` · Account ${destination.context.accountLabel} (context preserved; account filtering unavailable)` : ""}
      </span>}
    </div>
    {children}
  </div>;
}

export function applyActivityRefresh(
  identity: RootIdentity | null,
  event: ActivityRefreshEvent,
): RootIdentity | null {
  if (
    !identity
    || event.storeId !== identity.storeId
    || event.rootEpoch !== identity.rootEpoch
    || event.sequence <= identity.activitySequence
  ) return identity;
  return { ...identity, activitySequence: event.sequence };
}

export function App() {
  const initialPreferences = useRef(readWorkbenchPreferences(localStorage));
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [state, dispatch] = useReducer(
    workbenchReducer,
    initialPreferences.current,
    createInitialWorkbenchState,
  );
  const [marketplace, dispatchMarketplace] = useReducer(
    marketplaceReducer,
    localStorage,
    readMarketplaceNavigation,
  );
  const [restoring, setRestoring] = useState(true);
  const [rootIdentity, setRootIdentity] = useState<RootIdentity | null>(null);
  const [migrationRecovery, setMigrationRecovery] = useState<MigrationRecovery | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [welcomeExiting, setWelcomeExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(
    initialPreferences.current.sidebarVisible,
  );
  const [rightPanelVisible, setRightPanelVisible] = useState(
    initialPreferences.current.rightPanelVisible,
  );
  const [rightOverlayOpen, setRightOverlayOpen] = useState(false);
  const [bottomPanelVisible, setBottomPanelVisible] = useState(
    initialPreferences.current.bottomPanelVisible,
  );
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>(
    initialPreferences.current.workspacePage,
  );
  const [workspaceDestination, setWorkspaceDestination] = useState<WorkspaceDestination | null>(null);
  const [overviewReturnState, setOverviewReturnState] = useState<WorkspaceOverviewReturnState | null>(null);
  const [sidebarWidth] = useState(
    initialPreferences.current.sidebarWidth,
  );
  const [rightPanelWidth] = useState(
    initialPreferences.current.rightPanelWidth,
  );
  const [bottomPanelHeight, setBottomPanelHeight] = useState(
    initialPreferences.current.bottomPanelHeight,
  );
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarSearchRequest, setSidebarSearchRequest] = useState(0);
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null);
  const restorationStarted = useRef(false);
  const welcomeStartedAt = useRef(Date.now());
  const previousAppMode = useRef(marketplace.mode);

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
  const agentChat = useAgentChat({
    rootPath: rootIdentity?.storeId ?? null,
    project: selectedProject,
    enabled: rightPanelVisible || rightOverlayOpen,
  });
  const marketplaceSidebarVisible = marketplace.sidebarVisible && viewport.width > 1_280;
  const activeSidebarVisible = marketplace.mode === "work" ? sidebarVisible : marketplaceSidebarVisible;
  const activeSidebarWidth = INSTRUMENT_SIDEBAR_WIDTH;
  const workspacePickerVisible = isWorkspacePickerVisible({
    mode: marketplace.mode,
    sidebarVisible: activeSidebarVisible,
    workspaceId: selectedWorkspace?.id ?? null,
  });
  const showBottomPanel = bottomPanelVisible;
  const bottomPanelMax = Math.max(
    PANEL_SIZE_LIMITS.bottom.min,
    Math.min(PANEL_SIZE_LIMITS.bottom.max, Math.floor(viewport.height * 0.5)),
  );

  const restoreHomeLibrary = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      const result = await bridge.restoreLibrary();
      if (!result) return;
      setRootIdentity(result.identity);
      const saved = initialPreferences.current;
      const savedWorkspace =
        saved.rootPath === result.identity.storeId &&
        saved.workspaceId &&
        result.catalog.workspaces.some(
          (workspace) => workspace.id === saved.workspaceId,
        )
          ? saved.workspaceId
          : null;
      const workspaceId =
        savedWorkspace ?? mostRecentWorkspaceId(result.catalog.workspaces);
      dispatch({ type: "library-opened", catalog: result.catalog, workspaceId });
      if (
        workspaceId &&
        saved.rootPath === result.identity.storeId &&
        saved.projectId &&
        result.catalog.projects.some(
          (project) =>
            project.workspaceId === workspaceId &&
            project.projectId === saved.projectId,
        )
      ) {
        dispatch({
          type: "open-project",
          project: { workspaceId, projectId: saved.projectId },
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRestoring(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = bridge.onMediaEvent((event) => {
      if (event.type === "root-ready") {
        setRootIdentity(event.identity);
        setMigrationRecovery(null);
      } else if (event.type === "activity-refresh") {
        setRootIdentity((identity) => applyActivityRefresh(identity, event));
      } else if (event.type === "migration-recovery") {
        setMigrationRecovery(event.recovery);
      } else if (event.type === "catalog-result") {
        dispatch({ type: "catalog-received", catalog: event.result });
      } else if (event.type === "error") {
        setError(event.message);
      }
    });

    if (!restorationStarted.current) {
      restorationStarted.current = true;
      void restoreHomeLibrary();
    }

    return unsubscribe;
  }, [restoreHomeLibrary]);

  useEffect(() => {
    if (restoring || !welcomeVisible) return;
    let exitTimer = 0;
    const remaining = Math.max(
      0,
      WELCOME_MINIMUM_MS - (Date.now() - welcomeStartedAt.current),
    );
    const revealTimer = window.setTimeout(() => {
      setWelcomeExiting(true);
      exitTimer = window.setTimeout(
        () => setWelcomeVisible(false),
        WELCOME_EXIT_MS,
      );
    }, remaining);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(exitTimer);
    };
  }, [restoring, welcomeVisible]);

  useEffect(() => {
    if (state.route.kind !== "workspace") return;
    const timer = window.setTimeout(() => void loadProjectScreen(), 700);
    return () => window.clearTimeout(timer);
  }, [state.route.kind]);

  useEffect(() => {
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setBottomPanelHeight((value) => Math.min(value, bottomPanelMax));
  }, [bottomPanelMax]);

  useEffect(() => {
    if (restoring) return;
    const timer = window.setTimeout(() => {
      updateWorkbenchPreferences(localStorage, (current) => ({
        ...current,
        theme,
      }));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [restoring, theme]);

  useEffect(() => {
    if (restoring || !rootIdentity || !state.catalog) return;
    const workspaceId = state.route.kind === "library" ? null : state.route.workspaceId;
    const projectId = state.route.kind === "project" ? state.route.projectId : null;
    const timer = window.setTimeout(() => {
      updateWorkbenchPreferences(localStorage, (current) => ({
        ...current,
        rootPath: rootIdentity.storeId,
        workspaceId,
        projectId,
        pinnedWorkspaceIds: state.pinnedWorkspaceIds,
        pinnedProjectIds: state.pinnedProjectIds,
        workspacePage,
        sidebarVisible,
        rightPanelVisible,
        bottomPanelVisible,
        sidebarWidth,
        rightPanelWidth,
        bottomPanelHeight,
      }));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    bottomPanelHeight,
    bottomPanelVisible,
    rootIdentity?.storeId,
    rightPanelWidth,
    rightPanelVisible,
    restoring,
    sidebarWidth,
    sidebarVisible,
    state.pinnedProjectIds,
    state.pinnedWorkspaceIds,
    state.catalog,
    state.route,
    workspacePage,
  ]);

  useEffect(() => {
    writeMarketplaceNavigation(localStorage, marketplace);
  }, [marketplace]);

  useEffect(() => {
    const previous = previousAppMode.current;
    previousAppMode.current = marketplace.mode;
    const focusId = previous === "marketplace" && marketplace.mode === "work"
      ? marketplace.workReturnFocusId
      : previous === "work" && marketplace.mode === "marketplace"
        ? marketplace.location.focusId ?? "marketplace-heading"
        : previous === "marketplace" && marketplace.mode === "marketplace"
          ? marketplace.location.focusId ?? "marketplace-heading"
          : null;
    if (!focusId) return;
    document.getElementById(focusId)?.focus({ preventScroll: true });
  }, [marketplace.location.focusId, marketplace.location.route, marketplace.mode, marketplace.workReturnFocusId]);

  const switchAppMode = useCallback((mode: AppMode) => {
    const returnFocusId = mode === "marketplace"
      ? (document.activeElement as HTMLElement | null)?.getAttribute("id") || null
      : null;
    dispatchMarketplace({ type: "switch-mode", mode, returnFocusId });
  }, []);

  const navigateMarketplace = useCallback((location: MarketplaceLocation) => {
    dispatchMarketplace({ type: "navigate", location });
  }, []);

  const rememberMarketplace = useCallback((patch: MarketplaceMemoryPatch) => {
    dispatchMarketplace({ type: "remember", patch });
  }, []);

  const openMarketplaceRoute = useCallback((route: MarketplaceBrowseRoute) => {
    dispatchMarketplace({
      type: "navigate",
      location: {
        ...marketplace.location,
        route,
        query: route.kind === "category"
          ? {
              ...marketplace.location.query,
              filters: { ...marketplace.location.query.filters, category: route.category },
            }
          : marketplace.location.query,
        selectedItemId: null,
        scrollTop: 0,
        focusId: null,
      },
    });
  }, [marketplace.location]);

  const navigateBack = useCallback(() => {
    if (marketplace.mode === "marketplace") {
      if (marketplace.historyIndex > 0) dispatchMarketplace({ type: "back" });
      else switchAppMode("work");
      return;
    }
    dispatch({ type: "back" });
  }, [marketplace.historyIndex, marketplace.mode, switchAppMode]);

  const navigateForward = useCallback(() => {
    if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "forward" });
    else dispatch({ type: "forward" });
  }, [marketplace.mode]);

  const clearOverviewNavigation = useCallback(() => {
    setWorkspaceDestination(null);
    setOverviewReturnState(null);
  }, []);

  const openWorkspace = useCallback((workspaceId: string) => {
    clearOverviewNavigation();
    dispatch({ type: "open-workspace", workspaceId });
  }, [clearOverviewNavigation]);

  useEffect(() => {
    if (overviewReturnState && overviewReturnState.originWorkspaceId !== selectedWorkspace?.id) clearOverviewNavigation();
  }, [clearOverviewNavigation, overviewReturnState, selectedWorkspace?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLocaleLowerCase();
      const command =
        event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
      if (command && event.key === "[") {
        event.preventDefault();
        navigateBack();
      } else if (command && event.key === "]") {
        event.preventDefault();
        navigateForward();
      } else if (command && key === "f") {
        event.preventDefault();
        const workspaceId = state.route.kind === "library"
          ? mostRecentWorkspaceId(workspaces)
          : state.route.workspaceId;
        if (workspaceId && state.route.kind !== "workspace") {
          openWorkspace(workspaceId);
        } else clearOverviewNavigation();
        setWorkspacePage("projects");
        setSidebarSearchRequest((request) => request + 1);
      } else if (command && key === "j") {
        event.preventDefault();
        setBottomPanelVisible((visible) => !visible);
      } else if (command && key === "b") {
        event.preventDefault();
        if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
        else setSidebarVisible((visible) => !visible);
      } else if (command && event.key === ",") {
        event.preventDefault();
        setSettingsVisible(true);
      } else if (settingsVisible && event.key === "Escape") {
        event.preventDefault();
        setSettingsVisible(false);
      }
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) navigateBack();
      if (event.button === 4) navigateForward();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [clearOverviewNavigation, marketplace.mode, navigateBack, navigateForward, openWorkspace, settingsVisible, state.route, workspaces]);

  const openProject = (project: ProjectSummary, unitId: string | null = null) => {
    setTargetUnitId(unitId);
    dispatch({
      type: "open-project",
      project: {
        workspaceId: project.workspaceId,
        projectId: project.projectId,
      },
    });
  };

  const openWorkspacePage = (page: WorkspacePage) => {
    clearOverviewNavigation();
    setWorkspacePage(page);
  };

  const navigateFromOverview = (destination: WorkspaceDestination, returnState: WorkspaceOverviewReturnState) => {
    setWorkspaceDestination(destination);
    setOverviewReturnState(returnState);
    setWorkspacePage(destination.page);
  };

  const backToOverview = () => {
    setWorkspaceDestination(null);
    setWorkspacePage("overview");
  };

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

  let workContent = (
    <LibraryScreen
      catalog={catalog}
      error={catalog ? undefined : error}
      restoring={restoring}
      pinnedWorkspaceIds={state.pinnedWorkspaceIds}
      onRetry={() => void restoreHomeLibrary()}
      onOpenWorkspace={openWorkspace}
      onOpenProject={openProject}
    />
  );
  if (catalog && state.route.kind === "workspace" && selectedWorkspace && workspacePage === "overview") {
    workContent = (
      <WorkspaceScreen
        workspaceId={selectedWorkspace.id}
        rootEpoch={rootIdentity?.rootEpoch ?? 0}
        activitySequence={rootIdentity?.activitySequence ?? 0}
        catalogProjects={projects.filter((project) => project.workspaceId === selectedWorkspace.id)}
        workspaceName={selectedWorkspace.name}
        workspaceDescription={selectedWorkspace.description}
        overviewReturnState={overviewReturnState?.originWorkspaceId === selectedWorkspace.id ? overviewReturnState : null}
        onOpenPage={openWorkspacePage}
        onNavigate={navigateFromOverview}
        onOpenUnit={(projectId, unitId, unitLabel, returnState) => {
          const project = projects.find((candidate) => (
            candidate.workspaceId === selectedWorkspace.id && candidate.projectId === projectId
          ));
          if (project) openProject(project, unitId);
          else if (returnState) navigateFromOverview(
            { page: "units", returnFocusId: returnState.returnFocusId, context: { label: `${unitLabel} is not present in the current project catalog` } },
            returnState,
          );
        }}
        onOpenProject={openProject}
      />
    );
  } else if (state.route.kind === "workspace" && selectedWorkspace && workspacePage === "projects") {
    workContent = (
      <WorkspaceProjectsScreen
        workspaceName={selectedWorkspace.name}
        workspaceDescription={selectedWorkspace.description}
        projects={projects.filter((project) => project.workspaceId === selectedWorkspace.id)}
        rootEpoch={rootIdentity?.rootEpoch ?? 0}
        pinnedProjectIds={state.pinnedProjectIds}
        searchRequest={sidebarSearchRequest}
        onOpenProject={openProject}
        onToggleProjectPin={(projectId) => dispatch({ type: "toggle-project-pin", projectId })}
      />
    );
  } else if (state.route.kind === "workspace" && selectedWorkspace && workspacePage === "memory") {
    workContent = <MemoryScreen workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name} />;
  } else if (state.route.kind === "workspace" && selectedWorkspace && workspacePage === "shared") {
    workContent = <SharedLibraryScreen
      key={`shared:${rootIdentity?.rootEpoch ?? 0}:${selectedWorkspace.id}`}
      workspaceId={selectedWorkspace.id}
      workspaceName={selectedWorkspace.name}
      rootEpoch={rootIdentity?.rootEpoch ?? 0}
    />;
  } else if (state.route.kind === "workspace" && selectedWorkspace && workspacePage === "calendar") {
    const calendarContext = overviewReturnState?.originWorkspaceId === selectedWorkspace.id && workspaceDestination?.page === "calendar"
      ? workspaceDestination.context
      : undefined;
    workContent = <CalendarScreen workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name}
      initialDate={calendarContext?.date === undefined ? undefined : new Date(calendarContext.date)}
      navigationContext={calendarContext}
      onOpenProject={(projectId, unitId) => {
      const project = projects.find((item) => item.projectId === projectId);
      if (project) openProject(project, unitId);
    }} />;
  } else if (state.route.kind === "workspace" && selectedWorkspace && workspacePage !== "projects") {
    workContent = <WorkspacePagePlaceholder workspaceName={selectedWorkspace.name} page={workspacePage} />;
  } else if (state.route.kind === "project" && selectedProject) {
    workContent = (
      <Suspense
        fallback={<ProjectScreenLoadingFallback />}
      >
        <ProjectScreen
          key={`project:${rootIdentity?.rootEpoch ?? 0}:${selectedProject.workspaceId}:${selectedProject.projectId}`}
          project={selectedProject}
          rootEpoch={rootIdentity?.rootEpoch ?? 0}
          activitySequence={rootIdentity?.activitySequence ?? 0}
          targetUnitId={targetUnitId}
        />
      </Suspense>
    );
  }


  if (workspaceDestination && overviewReturnState?.originWorkspaceId === selectedWorkspace?.id && state.route.kind === "workspace" && workspacePage === workspaceDestination.page) {
    workContent = <WorkspaceDestinationFrame destination={workspaceDestination} onBack={backToOverview}>{workContent}</WorkspaceDestinationFrame>;
  }

  const canGoBack = marketplace.mode === "marketplace" ? true : state.historyIndex > 0;
  const canGoForward = marketplace.mode === "marketplace"
    ? marketplace.historyIndex < marketplace.history.length - 1
    : state.historyIndex < state.history.length - 1;
  const routeScrollKey = marketplace.mode === "marketplace"
    ? `marketplace:${JSON.stringify(marketplace.location.route)}`
    : state.route.kind === "library"
      ? "work:library"
      : state.route.kind === "workspace"
        ? `work:workspace:${state.route.workspaceId}:${workspacePage}`
        : `work:project:${state.route.workspaceId}:${state.route.projectId}`;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="asset-workbench">
        <motion.div
          className={[
            "workbench instrument-shell-frame",
            showBottomPanel ? " has-bottom-panel" : "",
            isResizing ? " is-resizing" : "",
          ].join("")}
          style={{
            "--sidebar-w": `${activeSidebarWidth}px`,
          } as CSSProperties}
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 }}
        >
          <InstrumentShell
            sidebar={<>
              <ContextSidebar
                mode={marketplace.mode}
                route={state.route}
                page={workspacePage}
                pageActive={marketplace.mode === "work" && state.route.kind !== "project"}
                marketplaceRoute={marketplace.location.route}
                rootPath={catalog?.rootPath ?? null}
                workspaces={workspaces}
                workspaceId={workspacePickerVisible ? selectedWorkspace!.id : null}
                pinnedWorkspaceIds={state.pinnedWorkspaceIds}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onBack={navigateBack}
                onForward={navigateForward}
                onToggleSidebar={() => {
                  if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
                  else setSidebarVisible(false);
                }}
                onOpenSettings={() => setSettingsVisible(true)}
                onSwitchMode={switchAppMode}
                onOpenMarketplaceRoute={openMarketplaceRoute}
                onOpenWorkspace={(workspaceId) => {
                  switchAppMode("work");
                  openWorkspace(workspaceId);
                }}
                onOpenPage={(page) => {
                  switchAppMode("work");
                  openWorkspacePage(page);
                  const workspaceId = selectedWorkspace?.id ?? mostRecentWorkspaceId(workspaces);
                  if (workspaceId) openWorkspace(workspaceId);
                }}
              />
            </>}
            desk={<div className="main-content-stage">
              <div className="app-mode-surface app-mode-work" hidden={marketplace.mode !== "work"} inert={marketplace.mode !== "work"}>
                {workContent}
              </div>
              <div
                className="app-mode-surface app-mode-marketplace"
                hidden={marketplace.mode !== "marketplace"}
                inert={marketplace.mode !== "marketplace"}
                style={{ "--sidebar-w": `${MARKETPLACE_SIDEBAR_WIDTH}px` } as CSSProperties}
              >
                <MarketplaceScreen
                  catalog={catalog}
                  workRoute={state.route}
                  location={marketplace.location}
                  sidebarVisible={marketplaceSidebarVisible}
                  onBack={navigateBack}
                  onNavigate={navigateMarketplace}
                  onRememberLocation={rememberMarketplace}
                />
              </div>
            </div>}
            chat={<InstrumentChat
              chat={agentChat}
              workspace={selectedWorkspace}
              project={selectedProject}
            />}
            island={<InstrumentWorkbenchHeader
              sidebarVisible={activeSidebarVisible}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              rightPanelVisible={false}
              bottomPanelVisible={showBottomPanel}
              onBack={navigateBack}
              onForward={navigateForward}
              onHome={() => {
                if (marketplace.mode === "marketplace") {
                  openMarketplaceRoute({ kind: "discover" });
                  return;
                }
                openWorkspacePage("overview");
                const workspaceId = selectedWorkspace?.id ?? mostRecentWorkspaceId(workspaces);
                if (workspaceId) openWorkspace(workspaceId);
                else dispatch({ type: "open-library" });
              }}
              onToggleSidebar={() => {
                if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
                else setSidebarVisible((visible) => !visible);
              }}
              onToggleRightPanel={() => undefined}
              onToggleBottomPanel={() =>
                setBottomPanelVisible((visible) => !visible)
              }
            />}
            profile={null}
            routeScrollKey={routeScrollKey}
            leftVisible={activeSidebarVisible}
            rightPreference={rightPanelVisible}
            rightOverlayOpen={rightOverlayOpen}
            bottomPanel={<>
              <ResizeHandle
                ariaLabel="Resize bottom panel"
                orientation="horizontal"
                value={bottomPanelHeight}
                min={PANEL_SIZE_LIMITS.bottom.min}
                max={bottomPanelMax}
                defaultValue={PANEL_SIZE_LIMITS.bottom.default}
                direction={-1}
                className="resize-bottom"
                onChange={setBottomPanelHeight}
                onActiveChange={setIsResizing}
              />
              <BottomPanel
                height={bottomPanelHeight}
                visible={showBottomPanel}
                rootPath={rootIdentity?.storeId ?? null}
              />
            </>}
            bottomVisible={showBottomPanel}
            onToggleLeft={() => {
              if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
              else setSidebarVisible((visible) => !visible);
            }}
            onToggleRightPreference={() => setRightPanelVisible((visible) => !visible)}
            onRightOverlayOpenChange={setRightOverlayOpen}
          />
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}
          <AnimatePresence>
            {settingsVisible && (
              <Suspense fallback={null}>
                <SettingsScreen
                  rootPath={rootIdentity?.storeId ?? null}
                  theme={theme}
                  onThemeChange={setTheme}
                  onBack={() => setSettingsVisible(false)}
                />
              </Suspense>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
