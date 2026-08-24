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
  type ReactNode,
} from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { InstrumentSidebar } from "./instrument/InstrumentSidebar";
import { AgentChatPanel } from "./components/UtilityPanels";
import { WelcomeScreen } from "./components/WelcomeScreen";
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
import { readCommandBindings, resolveCommand } from "./screens/settings/commands";
import { InstrumentScreenRoot } from "./instrument/screen-state-registry";
import { InstrumentShell } from "./instrument/InstrumentShell";
import { DynamicIsland } from "./instrument/DynamicIsland";
import { projectDynamicIslandFeed, type DynamicIslandFeed, type IslandContext } from "./instrument/dynamic-island-feed";
import { InstrumentOverlay } from "./instrument/overlay-registry";
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
  readWorkbenchPreferences,
  updateWorkbenchPreferences,
  workbenchReducer,
  WORKSPACE_PAGE_LABELS,
  type WorkspaceDestination,
  type WorkspaceOverviewReturnState,
  type WorkspacePage,
} from "./state/workbench";
import { COMMAND_BUTTON } from "./screens/route-chrome";

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

export function ProjectScreenLoadingFallback() {
  return (
    <InstrumentScreenRoot descriptor={unitsInstrumentStates} state="loading">
      <main className="main-region project-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden bg-desk p-2 pb-6">
        <div className="project-indexing flex min-h-0 flex-1 flex-col items-center justify-center gap-1 type-xs text-muted">
          {/* The indeterminate run is a real child, not a `::after`: a pseudo-element needs a
              `content: ""` that no named utility states, and the plate has room for the span. */}
          <span className="loading-line h-0.5 w-27.5 overflow-hidden bg-ink/8">
            <span className="block h-full w-2/5 animate-indexing bg-ink motion-reduce:animate-none" />
          </span>
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

/* The main process forwards a "show me the chat" shortcut. That used to mean "open the rail",
   but the chat rail is unavailable under the desk lens on purpose, so the shortcut now means the
   same thing the lens pair means: it toggles the lens. Opening a dock the lens immediately closes
   again would have made the OS-level affordance dead. */
function InstrumentRightRailShortcut({ onToggle, children }: { onToggle(): void; children: ReactNode }) {
  useEffect(() => bridge.onToggleRightPanel(onToggle), [onToggle]);
  return children;
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
  /* The destination frame is a column that hands its whole remaining height to the route it
     wraps, whichever route that is — so the child's own flex guard is stated here. */
  return <div className="workspace-destination flex min-h-0 flex-1 flex-col [&>.main-region]:min-h-0 [&>.main-region]:flex-1" ref={root}>
    <div className="workspace-return-bar flex min-h-9.5 flex-none items-center gap-3 bg-surface px-4 py-2 type-xs text-muted">
      <button className="rounded-control bg-transparent type-xs text-muted" type="button" onClick={onBack}>Back to Overview</button>
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
  const { preference: theme, resolved: resolvedTheme, setPreference: setTheme } = useTheme();
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
  const [lens, setLens] = useState(initialPreferences.current.lens);
  const toggleLens = useCallback(() => setLens((current) => current === "chat" ? "desk" : "chat"), []);
  const [rightOverlayOpen, setRightOverlayOpen] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>(
    initialPreferences.current.workspacePage,
  );
  const [workspaceDestination, setWorkspaceDestination] = useState<WorkspaceDestination | null>(null);
  const [overviewReturnState, setOverviewReturnState] = useState<WorkspaceOverviewReturnState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(
    initialPreferences.current.sidebarWidth,
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(
    initialPreferences.current.rightPanelWidth,
  );
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
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
  const liveIslandFeed = useMemo(() => projectDynamicIslandFeed({
    rootEpoch: rootIdentity?.rootEpoch ?? 0,
    agentState: agentChat.state ?? { chats: [], activeChatId: "", runningChatId: null },
    appError: error,
  }), [agentChat.state, error, rootIdentity?.rootEpoch]);
  // The island is the only chrome left that says where you are, so it always has a
  // context: workspace plus page, project plus phase, or the marketplace section. The
  // project's own section is the dock's job, one row below.
  const islandContext = useMemo<IslandContext>(() => {
    if (marketplace.mode === "marketplace") {
      const route = marketplace.location.route;
      const detail = route.kind === "category" ? route.category
        : route.kind === "library" ? route.section
          : route.kind;
      return { identity: null, label: "Marketplace", detail, count: null };
    }
    if (selectedProject) return { identity: selectedProject.name, label: selectedProject.name, detail: selectedProject.phase || selectedProject.status || null, count: null };
    if (selectedWorkspace) {
      const count = workspacePage === "projects" ? selectedWorkspace.projectCount
        : workspacePage === "units" ? selectedWorkspace.unitCount
          : workspacePage === "shared" ? selectedWorkspace.sharedCount
            : null;
      return { identity: selectedWorkspace.name, label: selectedWorkspace.name, detail: WORKSPACE_PAGE_LABELS[workspacePage], count };
    }
    return { identity: null, label: "Library", detail: null, count: null };
  }, [marketplace.location.route, marketplace.mode, selectedProject, selectedWorkspace, workspacePage]);
  const [mockIslandFeed, setMockIslandFeed] = useState<DynamicIslandFeed | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMockIslandFeed(null);
    if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS !== "true" || selectedWorkspace?.name !== "UX Testing Lab") return;
    void import("./instrument/dynamic-island-mock").then(({ projectMockDynamicIslandFeed }) => {
      if (!cancelled) setMockIslandFeed(projectMockDynamicIslandFeed({ rootEpoch: rootIdentity?.rootEpoch ?? 0, workspace: selectedWorkspace, project: selectedProject }));
    });
    return () => { cancelled = true; };
  }, [rootIdentity?.rootEpoch, selectedProject?.projectId, selectedProject?.workspaceId, selectedWorkspace?.id, selectedWorkspace?.name]);
  const marketplaceSidebarVisible = marketplace.sidebarVisible && viewport.width > 1_280;
  const activeSidebarVisible = marketplace.mode === "work" ? sidebarVisible : marketplaceSidebarVisible;
  const activeSidebarWidth = sidebarWidth;
  const workspacePickerVisible = isWorkspacePickerVisible({
    mode: marketplace.mode,
    sidebarVisible: activeSidebarVisible,
    workspaceId: selectedWorkspace?.id ?? null,
  });
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
        lens,
        rightPanelVisible,
        sidebarWidth,
        rightPanelWidth,
      }));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    rootIdentity?.storeId,
    lens,
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
      if (settingsVisible && event.key === "Escape") {
        event.preventDefault();
        setSettingsVisible(false);
        return;
      }
      // Bindings are read per keystroke so a rebinding made in Settings is live at once.
      const command = resolveCommand(event, readCommandBindings(localStorage));
      if (!command) return;
      event.preventDefault();
      if (command.id === "nav.back") navigateBack();
      else if (command.id === "nav.forward") navigateForward();
      else if (command.id === "nav.findProjects") {
        const workspaceId = state.route.kind === "library"
          ? mostRecentWorkspaceId(workspaces)
          : state.route.workspaceId;
        if (workspaceId && state.route.kind !== "workspace") {
          openWorkspace(workspaceId);
        } else clearOverviewNavigation();
        setWorkspacePage("projects");
        setSidebarSearchRequest((request) => request + 1);
      } else if (command.id === "app.sidebar") {
        if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "toggle-sidebar" });
        else setSidebarVisible((visible) => !visible);
      } else if (command.id === "chat.new") { setLens("chat"); agentChat.newChat(); }
      else if (command.id === "view.desk") setLens("desk");
      else if (command.id === "view.chat") setLens("chat");
      else if (command.id === "app.marketplace") switchAppMode("marketplace");
      else if (command.id === "app.settings") setSettingsVisible(true);
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
  }, [agentChat, clearOverviewNavigation, marketplace.mode, navigateBack, navigateForward, openWorkspace, settingsVisible, state.route, switchAppMode, workspaces]);

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
          workspaceName={workspaces.find(({ id }) => id === selectedProject.workspaceId)?.name ?? null}
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
          className="workbench instrument-shell-frame"
          style={{
            "--sidebar-w": `${activeSidebarWidth}px`,
          } as CSSProperties}
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 }}
        >
          <InstrumentShell
            sidebar={<>
              <InstrumentSidebar
                mode={marketplace.mode}
                lens={marketplace.mode === "work" ? lens : "desk"}
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
                chats={sidebarChats}
                activeChatId={agentChat.activeChat?.id ?? null}
                onSelectChat={(chatId) => { setLens("chat"); agentChat.selectChat(chatId); }}
                onNewChat={() => { setLens("chat"); agentChat.newChat(); }}
              />
            </>}
            desk={<div className="main-content-stage flex min-w-0 flex-1">
              <div className={`app-mode-surface app-mode-work min-h-0 min-w-0 flex-1 bg-desk text-ink ${marketplace.mode === "work" ? "flex" : "hidden"}`} hidden={marketplace.mode !== "work"} inert={marketplace.mode !== "work"}>
                {workContent}
              </div>
              <div
                className={`app-mode-surface app-mode-marketplace min-h-0 min-w-0 flex-1 ${marketplace.mode === "marketplace" ? "flex" : "hidden"}`}
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
            /* Closing the chat is a lens decision now, not a dock one: the panel's close control
               puts the desk lens back rather than leaving a chat lens with an empty main column. */
            chat={<AgentChatPanel
              onClose={() => setLens("desk")}
              chat={agentChat}
              workspace={selectedWorkspace}
              project={selectedProject}
            />}
            island={<InstrumentRightRailShortcut onToggle={toggleLens}><DynamicIsland
              feed={mockIslandFeed ?? liveIslandFeed}
              context={islandContext}
              projectName={selectedProject?.name ?? null}
              mock={mockIslandFeed !== null}
              onNavigate={(destination) => {
                if ("kind" in destination) {
                  switchAppMode("work");
                  if (destination.kind === "library") dispatch({ type: "open-library" });
                  else if (destination.kind === "workspace") openWorkspace(destination.workspaceId);
                  else dispatch({ type: "open-project", project: destination });
                } else {
                  switchAppMode("marketplace");
                  navigateMarketplace(destination);
                }
              }}
            /></InstrumentRightRailShortcut>}
            routeScrollKey={routeScrollKey}
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
          {error && (
            /* The sheet gave this plate a surface, a radius and a layer and no ink and no
               air at all, so the copy sat flush against a rounded corner. Surface and ink
               travel as a pair, and the plate keeps one gutter. */
            <div className="error-banner z-banner flex items-center justify-between gap-3 rounded-field bg-surface-sunken px-3 py-2 type-sm text-ink" role="alert">
              <span className="min-w-0">{error}</span>
              <button className={COMMAND_BUTTON} type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}
          {/* No exit animation: the overlay lives in a portal, so AnimatePresence never sees
              the nested motion element finish and leaves an invisible surface over the app. */}
          {settingsVisible && (
              <Suspense fallback={null}>
                {/* Settings is a mode, not a floating card: it owns the whole window so the app
                    never peeks around its edges, and its own desk padding lives on the screen.
                    `focus-visible:outline-none` is the landing ring declined: the overlay focuses
                    its own surface on open, which matches `:focus-visible`, and `reset.css` would
                    then trace a 2px ring around the whole viewport, cutting across the window's
                    rounding. The page heading carries the landing focus instead. Measured: with
                    this utility off the surface paints outline 2px solid #F2F2F0. */}
                <InstrumentOverlay id="settings" open label="Settings" description="Application settings" opener={null} onOpenChange={(open) => { if (!open) setSettingsVisible(false); }} localScroll surfaceClassName="fixed inset-0 z-overlay-surface overflow-hidden focus-visible:outline-none">
                <SettingsScreen
                  rootPath={rootIdentity?.storeId ?? null}
                  theme={theme}
                  resolvedTheme={resolvedTheme}
                  onThemeChange={setTheme}
                  onBack={() => setSettingsVisible(false)}
                />
                </InstrumentOverlay>
              </Suspense>
          )}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
