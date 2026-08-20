import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectSummary } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import {
  createWorkspaceScreenController,
  type WorkspaceScreenApi,
  type WorkspaceScreenController,
  type WorkspaceScreenSnapshot,
} from "../state/workspace-screen-controller";
import {
  WORKSPACE_PAGE_LABELS,
  type WorkspaceCalendarNavigationContext,
  type WorkspaceDestination,
  type WorkspaceOverviewReturnState,
  type WorkspacePage,
} from "../state/workbench";
import {
  presentWorkspaceOverview,
  type WorkspaceOverviewPresentation,
} from "./workspace/overview-presentation";
import { WorkspaceOverviewHeader } from "./workspace/WorkspaceOverviewHeader";
import { WorkspaceInsights } from "./workspace/WorkspaceInsights";
import { WorkspaceOperations } from "./workspace/WorkspaceOperations";
import { WorkspacePerformance } from "./workspace/WorkspacePerformance";
import { WorkspacePlanAndOutcomes } from "./workspace/WorkspacePlanAndOutcomes";

export { createWorkspaceScreenController } from "../state/workspace-screen-controller";

export function startWorkspaceScreenController(
  api: WorkspaceScreenApi,
  workspaceId: string,
  activitySequence: number,
  setController: (controller: WorkspaceScreenController) => void,
): () => void {
  const controller = createWorkspaceScreenController(api, workspaceId, activitySequence);
  setController(controller);
  void controller.start();
  return () => controller.dispose();
}

function WorkspaceOverviewShell({ value, onOpenPage, onOpenCalendar, onOpenUnit, onOpenProject, onRetry, attentionExpanded, onAttentionExpandedChange }: {
  value: WorkspaceOverviewPresentation;
  onOpenPage(page: WorkspacePage): void;
  onOpenCalendar(context?: WorkspaceCalendarNavigationContext): void;
  onOpenUnit(projectId: string, unitId: string): void;
  onOpenProject(project: ProjectSummary): void;
  onRetry(): void;
  attentionExpanded: boolean;
  onAttentionExpandedChange(expanded: boolean): void;
}) {
  return <>
    <WorkspacePerformance value={value} onOpenCalendar={onOpenCalendar} />
    <WorkspacePlanAndOutcomes value={value} onOpenPage={onOpenPage} onOpenCalendar={onOpenCalendar} onOpenUnit={onOpenUnit} />
    <WorkspaceInsights value={value} onOpenPage={onOpenPage} />
    <WorkspaceOperations value={value} onOpenProject={onOpenProject} onOpenPage={onOpenPage} onRetry={onRetry} attentionExpanded={attentionExpanded} onAttentionExpandedChange={onAttentionExpandedChange} />
  </>;
}

function WorkspaceOverviewLoading({ workspaceName, workspaceDescription }: { workspaceName: string; workspaceDescription: string }) {
  return <main className="main-region workspace-overview workspace-overview-loading" aria-busy="true">
    <header className="screen-header workspace-overview-header workspace-overview-loading-header">
      <div className="screen-kicker">Workspace overview</div>
      <h1>{workspaceName || "Loading workspace overview…"}</h1>
      {workspaceDescription && <p>{workspaceDescription}</p>}
    </header>
    <div className="workspace-overview-scroll" role="status" aria-label="Loading workspace overview">
      {["Performance", "Planning", "Insights", "Operations"].map((label) => <section key={label} className="workspace-overview-skeleton-section" aria-hidden="true">
        <span>{label}</span><i /><i /><i />
      </section>)}
    </div>
  </main>;
}

function WorkspaceOverviewError({ error, workspaceName, workspaceDescription, onRetry }: { error: string | null; workspaceName: string; workspaceDescription: string; onRetry(): void }) {
  return <main className="main-region workspace-overview workspace-overview-error">
    <header className="screen-header workspace-overview-header workspace-overview-loading-header">
      <div className="screen-kicker">Workspace overview</div>
      <h1>{workspaceName || "Workspace overview"}</h1>
      {workspaceDescription && <p>{workspaceDescription}</p>}
      <strong>Workspace overview could not be loaded</strong>
    </header>
    <div className="project-local-error" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{error ?? "Core did not return workspace data."}</span>
      <button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button>
    </div>
  </main>;
}

interface WorkspaceScreenViewProps {
  controller: WorkspaceScreenController;
  snapshot: WorkspaceScreenSnapshot;
  catalogProjects: ProjectSummary[];
  workspaceDescription: string;
  workspaceName?: string;
  onOpenPage(page: WorkspacePage): void;
  onNavigate?(destination: WorkspaceDestination, returnState: WorkspaceOverviewReturnState): void;
  overviewReturnState?: WorkspaceOverviewReturnState | null;
  onOpenUnit(projectId: string, unitId: string, returnState?: WorkspaceOverviewReturnState): void;
  onOpenProject(project: ProjectSummary): void;
}

export function WorkspaceScreenView(props: WorkspaceScreenViewProps) {
  const { controller, snapshot, catalogProjects, workspaceDescription } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredState = useRef<WorkspaceOverviewReturnState | null>(null);
  const [attentionExpanded, setAttentionExpanded] = useState(props.overviewReturnState?.attentionExpanded ?? false);
  useEffect(() => {
    const state = props.overviewReturnState;
    if (snapshot.status !== "ready" || !state || restoredState.current === state) return;
    restoredState.current = state;
    if (scrollRef.current) scrollRef.current.scrollTop = state.scrollTop;
    if (state.focusId) document.getElementById(state.focusId)?.focus({ preventScroll: true });
  }, [props.overviewReturnState, snapshot.status]);
  if (snapshot.status === "loading" || snapshot.status === "idle") {
    return <WorkspaceOverviewLoading workspaceName={props.workspaceName ?? ""} workspaceDescription={workspaceDescription} />;
  }
  if (snapshot.status === "error") {
    return <WorkspaceOverviewError error={snapshot.error} workspaceName={props.workspaceName ?? ""} workspaceDescription={workspaceDescription} onRetry={() => { void controller.retry(); }} />;
  }
  if (!snapshot.value) return null;
  const presentation = presentWorkspaceOverview({
    overview: snapshot.value,
    catalogProjects,
    description: workspaceDescription,
  });
  const criticalCount = presentation.attention.status === "ready" || presentation.attention.status === "partial"
    ? presentation.attention.value.criticalCount
    : presentation.attention;
  const returnState = (): WorkspaceOverviewReturnState => ({
    scrollTop: scrollRef.current?.scrollTop ?? 0,
    attentionExpanded,
    focusId: document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute("id") : null,
  });
  const navigate = (destination: WorkspaceDestination) => props.onNavigate
    ? props.onNavigate(destination, returnState())
    : props.onOpenPage(destination.page);
  return <main className="main-region workspace-overview" aria-busy={snapshot.refreshing || undefined}>
    <WorkspaceOverviewHeader
      value={presentation.header}
      criticalCount={criticalCount}
      refreshing={snapshot.refreshing}
      lastSuccessfulRefreshAt={snapshot.lastSuccessfulRefreshAt ?? null}
      onRefresh={() => { void controller.retry(); }}
    />
    {snapshot.error && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.error}</span><button type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className="workspace-overview-scroll" ref={scrollRef}>
      <WorkspaceOverviewShell
        value={presentation}
        onOpenPage={(page) => navigate({ page, context: { label: WORKSPACE_PAGE_LABELS[page] } } as WorkspaceDestination)}
        onOpenCalendar={(context) => navigate({ page: "calendar", context })}
        onOpenUnit={(projectId, unitId) => props.onOpenUnit(projectId, unitId, returnState())}
        onOpenProject={props.onOpenProject}
        onRetry={() => { void controller.retry(); }}
        attentionExpanded={attentionExpanded}
        onAttentionExpandedChange={setAttentionExpanded}
      />
    </div>
  </main>;
}

function ConnectedWorkspaceScreen(props: Omit<WorkspaceScreenViewProps, "snapshot">) {
  const snapshot = useSyncExternalStore(
    props.controller.subscribe,
    props.controller.getSnapshot,
    props.controller.getSnapshot,
  );
  return <WorkspaceScreenView {...props} snapshot={snapshot} />;
}

interface WorkspaceScreenProps extends Omit<WorkspaceScreenViewProps, "controller" | "snapshot"> {
  workspaceId: string;
  rootEpoch: number;
  activitySequence: number;
}

export function WorkspaceScreen(props: WorkspaceScreenProps) {
  const { workspaceId, rootEpoch, activitySequence } = props;
  const [controller, setController] = useState<WorkspaceScreenController | null>(null);
  useEffect(
    () => startWorkspaceScreenController(bridge, workspaceId, activitySequence, setController),
    [rootEpoch, workspaceId],
  );
  useEffect(() => { void controller?.refresh(activitySequence); }, [activitySequence, controller]);
  return controller
    ? <ConnectedWorkspaceScreen
        controller={controller}
        catalogProjects={props.catalogProjects}
        workspaceDescription={props.workspaceDescription}
        workspaceName={props.workspaceName}
        onOpenPage={props.onOpenPage}
        onNavigate={props.onNavigate}
        overviewReturnState={props.overviewReturnState}
        onOpenUnit={props.onOpenUnit}
        onOpenProject={props.onOpenProject}
      />
    : <WorkspaceOverviewLoading workspaceName={props.workspaceName ?? ""} workspaceDescription={props.workspaceDescription} />;
}
