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
import { MigrationRecoveryScreen } from "./screens/MigrationRecoveryScreen";
import {
  createInitialWorkbenchState,
  mostRecentWorkspaceId,
  PANEL_SIZE_LIMITS,
  readWorkbenchPreferences,
  workbenchReducer,
  writeWorkbenchPreferences,
  type WorkspaceView,
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
  const [state, dispatch] = useReducer(
    workbenchReducer,
    initialPreferences.current,
    createInitialWorkbenchState,
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
  const [bottomPanelVisible, setBottomPanelVisible] = useState(
    initialPreferences.current.bottomPanelVisible,
  );
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(
    initialPreferences.current.workspaceView,
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    initialPreferences.current.sidebarWidth,
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(
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
  const restorationStarted = useRef(false);
  const welcomeStartedAt = useRef(Date.now());

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
    enabled: rightPanelVisible,
  });
  const showRightPanel = catalog !== null && rightPanelVisible;
  const sidebarMax = Math.max(
    PANEL_SIZE_LIMITS.sidebar.min,
    Math.min(
      PANEL_SIZE_LIMITS.sidebar.max,
      viewport.width - (showRightPanel ? rightPanelWidth : 0) - 440,
    ),
  );
  const rightPanelMax = Math.max(
    PANEL_SIZE_LIMITS.right.min,
    Math.min(
      PANEL_SIZE_LIMITS.right.max,
      viewport.width - (sidebarVisible ? sidebarWidth : 0) - 440,
    ),
  );
  const bottomPanelMax = Math.max(
    PANEL_SIZE_LIMITS.bottom.min,
    Math.min(PANEL_SIZE_LIMITS.bottom.max, Math.floor(viewport.height * 0.5)),
  );

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
      void bridge
        .restoreLibrary()
        .then((result) => {
          if (!result) return;
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
          dispatch({
            type: "library-opened",
            catalog: result.catalog,
            workspaceId,
          });
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
              project: {
                workspaceId,
                projectId: saved.projectId,
              },
            });
          }
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => setRestoring(false));
    }

    return unsubscribe;
  }, []);

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

  useEffect(
    () => bridge.onToggleRightPanel(() =>
      setRightPanelVisible((visible) => !visible)),
    [],
  );

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
    setSidebarWidth((value) => Math.min(value, sidebarMax));
    setRightPanelWidth((value) => Math.min(value, rightPanelMax));
    setBottomPanelHeight((value) => Math.min(value, bottomPanelMax));
  }, [bottomPanelMax, rightPanelMax, sidebarMax]);

  useEffect(() => {
    const workspaceId = state.route.kind === "library" ? null : state.route.workspaceId;
    const projectId = state.route.kind === "project" ? state.route.projectId : null;
    const timer = window.setTimeout(() => {
      writeWorkbenchPreferences(localStorage, {
        rootPath: rootIdentity?.storeId ?? null,
        workspaceId,
        projectId,
        pinnedWorkspaceIds: state.pinnedWorkspaceIds,
        pinnedProjectIds: state.pinnedProjectIds,
        sidebarVisible,
        rightPanelVisible,
        bottomPanelVisible,
        workspaceView,
        sidebarWidth,
        rightPanelWidth,
        bottomPanelHeight,
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    bottomPanelHeight,
    bottomPanelVisible,
    rootIdentity?.storeId,
    rightPanelWidth,
    rightPanelVisible,
    sidebarWidth,
    sidebarVisible,
    state.pinnedProjectIds,
    state.pinnedWorkspaceIds,
    state.route,
    workspaceView,
  ]);

  const chooseLibrary = useCallback(async () => {
    setError(null);
    try {
      const result = await bridge.chooseLibrary();
      if (result) {
        dispatch({
          type: "library-opened",
          catalog: result.catalog,
          workspaceId: mostRecentWorkspaceId(result.catalog.workspaces),
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const navigateBack = useCallback(() => {
    dispatch({ type: "back" });
  }, []);

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
        dispatch({ type: "forward" });
      } else if (command && key === "f") {
        event.preventDefault();
        setSidebarSearchRequest((request) => request + 1);
      } else if (command && key === "j") {
        event.preventDefault();
        setBottomPanelVisible((visible) => !visible);
      } else if (command && key === "b") {
        event.preventDefault();
        setSidebarVisible((visible) => !visible);
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
      if (event.button === 4) dispatch({ type: "forward" });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [navigateBack, settingsVisible]);

  const openProject = (project: ProjectSummary) => {
    dispatch({
      type: "open-project",
      project: {
        workspaceId: project.workspaceId,
        projectId: project.projectId,
      },
    });
  };

  const breadcrumbs = selectedProject
    ? [
        {
          label: selectedWorkspace?.name ?? "Workspace",
          onClick: () => dispatch({
            type: "open-workspace",
            workspaceId: selectedProject.workspaceId,
          }),
        },
        { label: selectedProject.name },
      ]
    : selectedWorkspace
      ? [{ label: selectedWorkspace.name }]
      : [{ label: "Workspaces" }];

  if (migrationRecovery) {
    return (
      <MigrationRecoveryScreen
        recovery={migrationRecovery}
        onCopyCommand={() => {
          void bridge.copyMigrationRecoveryCommand().catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
          });
        }}
        onChooseLibrary={() => void chooseLibrary()}
      />
    );
  }

  if (welcomeVisible) {
    return <WelcomeScreen exiting={welcomeExiting} restoring={restoring} />;
  }

  let content = (
    <LibraryScreen
      catalog={catalog}
      pinnedWorkspaceIds={state.pinnedWorkspaceIds}
      onChooseLibrary={chooseLibrary}
      onOpenWorkspace={(workspaceId) => dispatch({ type: "open-workspace", workspaceId })}
      onOpenProject={openProject}
    />
  );
  if (state.route.kind === "workspace" && selectedWorkspace) {
    content = (
      <WorkspaceScreen
        key={`workspace:${rootIdentity?.rootEpoch ?? 0}:${selectedWorkspace.id}`}
        workspaceId={selectedWorkspace.id}
        rootEpoch={rootIdentity?.rootEpoch ?? 0}
        activitySequence={rootIdentity?.activitySequence ?? 0}
        catalogProjects={projects.filter((project) => project.workspaceId === selectedWorkspace.id)}
        view={workspaceView}
        onViewChange={setWorkspaceView}
        onOpenProject={openProject}
      />
    );
  } else if (state.route.kind === "project" && selectedProject) {
    content = (
      <Suspense
        fallback={
          <main className="main-region project-region">
            <div className="project-indexing">
              <span className="loading-line" />
              <span>Opening project…</span>
            </div>
          </main>
        }
      >
        <ProjectScreen
          key={`project:${rootIdentity?.rootEpoch ?? 0}:${selectedProject.workspaceId}:${selectedProject.projectId}`}
          project={selectedProject}
          rootEpoch={rootIdentity?.rootEpoch ?? 0}
          activitySequence={rootIdentity?.activitySequence ?? 0}
        />
      </Suspense>
    );
  }

  const canGoBack = state.historyIndex > 0;
  const canGoForward = state.historyIndex < state.history.length - 1;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="asset-workbench">
        <motion.div
          className={[
            "workbench",
            !sidebarVisible ? " sidebar-collapsed" : "",
            showRightPanel ? " has-right-panel" : "",
            bottomPanelVisible ? " has-bottom-panel" : "",
            isResizing ? " is-resizing" : "",
          ].join("")}
          style={{
            "--sidebar-w": `${sidebarWidth}px`,
            "--inspector-w": `${rightPanelWidth}px`,
          } as CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 }}
        >
          <AnimatePresence initial={false}>
            {catalog && sidebarVisible && (
              <ContextSidebar
                route={state.route}
                rootPath={rootIdentity?.storeId ?? catalog.rootPath}
                workspaces={workspaces}
                projects={projects}
                pinnedWorkspaceIds={state.pinnedWorkspaceIds}
                pinnedProjectIds={state.pinnedProjectIds}
                searchRequest={sidebarSearchRequest}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onBack={navigateBack}
                onForward={() => dispatch({ type: "forward" })}
                onToggleSidebar={() => setSidebarVisible(false)}
                onOpenSettings={() => setSettingsVisible(true)}
                onOpenWorkspace={(workspaceId) =>
                  dispatch({ type: "open-workspace", workspaceId })
                }
                onOpenProject={openProject}
                onToggleProjectPin={(projectId) =>
                  dispatch({ type: "toggle-project-pin", projectId })
                }
              />
            )}
          </AnimatePresence>
          {catalog && sidebarVisible && (
            <ResizeHandle
              ariaLabel="Resize sidebar"
              orientation="vertical"
              value={sidebarWidth}
              min={PANEL_SIZE_LIMITS.sidebar.min}
              max={sidebarMax}
              defaultValue={PANEL_SIZE_LIMITS.sidebar.default}
              direction={1}
              className="resize-sidebar"
              onChange={setSidebarWidth}
              onActiveChange={setIsResizing}
            />
          )}
          <motion.section className="main-shell">
            <MainHeader
              breadcrumbs={breadcrumbs}
              sidebarVisible={sidebarVisible}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              rightPanelVisible={rightPanelVisible}
              bottomPanelVisible={bottomPanelVisible}
              showChooseLibrary={!catalog}
              onBack={navigateBack}
              onForward={() => dispatch({ type: "forward" })}
              onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
              onChooseLibrary={chooseLibrary}
              onToggleRightPanel={() =>
                setRightPanelVisible((visible) => !visible)
              }
              onToggleBottomPanel={() =>
                setBottomPanelVisible((visible) => !visible)
              }
            />
            <div className="main-content-stage">{content}</div>
            {bottomPanelVisible && (
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
            )}
            <BottomPanel
              height={bottomPanelHeight}
              visible={bottomPanelVisible}
              rootPath={rootIdentity?.storeId ?? null}
            />
          </motion.section>
          {showRightPanel && (
            <ResizeHandle
              ariaLabel="Resize right panel"
              orientation="vertical"
              value={rightPanelWidth}
              min={PANEL_SIZE_LIMITS.right.min}
              max={rightPanelMax}
              defaultValue={PANEL_SIZE_LIMITS.right.default}
              direction={-1}
              className="resize-right"
              onChange={setRightPanelWidth}
              onActiveChange={setIsResizing}
            />
          )}
          <AnimatePresence initial={false}>
            {showRightPanel ? (
              <AgentChatPanel
                key="agent-chat"
                chat={agentChat}
                workspace={selectedWorkspace}
                project={selectedProject}
                onClose={() => setRightPanelVisible(false)}
              />
            ) : null}
          </AnimatePresence>
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
                  onBack={() => setSettingsVisible(false)}
                  onChooseLibrary={() => void chooseLibrary()}
                />
              </Suspense>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}
