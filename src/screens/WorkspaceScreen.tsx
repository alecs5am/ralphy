import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProjectSummary } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
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

export const workspaceOverviewInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.overview",
  states: ["loading", "ready", "partial", "error"],
  rootMarker: "workspace-overview",
  landmarks: ["Workspace overview", "Performance", "Operations"],
} as const);

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
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onOpenCalendar(context: WorkspaceCalendarNavigationContext | undefined, returnFocusId: string): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
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
  return <InstrumentScreenRoot descriptor={workspaceOverviewInstrumentStates} state="loading"><main className="main-region workspace-overview workspace-overview-loading flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 text-[13px] text-ink" aria-busy="true">
    <header className="screen-header workspace-overview-header workspace-overview-loading-header m-0 w-full max-w-none rounded-panel border-0 bg-instrument px-5 py-4 text-on-instrument shadow-none">
      <div className="screen-kicker">Workspace overview</div>
      <h1>{workspaceName || "Loading workspace overview…"}</h1>
      {workspaceDescription && <p>{workspaceDescription}</p>}
    </header>
    <div className="workspace-overview-scroll grid w-full max-w-none grid-cols-12 gap-2 overflow-visible p-0" role="status" aria-label="Loading workspace overview">
      {["Performance", "Planning", "Insights", "Operations"].map((label) => <section key={label} className="workspace-overview-skeleton-section col-span-12 m-0 min-h-44 w-full max-w-none rounded-panel border-0 bg-surface p-4 shadow-none xl:col-span-6" aria-hidden="true">
        <span>{label}</span><i /><i /><i />
      </section>)}
    </div>
  </main></InstrumentScreenRoot>;
}

function WorkspaceOverviewError({ error, workspaceName, workspaceDescription, onRetry }: { error: string | null; workspaceName: string; workspaceDescription: string; onRetry(): void }) {
  return <InstrumentScreenRoot descriptor={workspaceOverviewInstrumentStates} state="error"><main className="main-region workspace-overview workspace-overview-error flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 text-[13px] text-ink">
    <header className="screen-header workspace-overview-header workspace-overview-loading-header m-0 w-full max-w-none rounded-panel border-0 bg-instrument px-5 py-4 text-on-instrument shadow-none">
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
  </main></InstrumentScreenRoot>;
}

interface WorkspaceScreenViewProps {
  controller: WorkspaceScreenController;
  snapshot: WorkspaceScreenSnapshot;
  catalogProjects: ProjectSummary[];
  workspaceDescription: string;
  workspaceName?: string;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onNavigate?(destination: WorkspaceDestination, returnState: WorkspaceOverviewReturnState): void;
  overviewReturnState?: WorkspaceOverviewReturnState | null;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnState?: WorkspaceOverviewReturnState): void;
  onOpenProject(project: ProjectSummary): void;
}

export function WorkspaceScreenView(props: WorkspaceScreenViewProps) {
  const { controller, snapshot, catalogProjects, workspaceDescription } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredState = useRef<WorkspaceOverviewReturnState | null>(null);
  const restoredFocus = useRef<WorkspaceOverviewReturnState | null>(null);
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  useEffect(() => {
    const state = props.overviewReturnState;
    if (snapshot.status !== "ready" || !snapshot.value || !state || state.originWorkspaceId !== snapshot.value.workspace.id || restoredState.current === state) return;
    restoredState.current = state;
    setAttentionExpanded(state.attentionExpanded);
    if (scrollRef.current) scrollRef.current.scrollTop = state.scrollTop;
  }, [props.overviewReturnState, snapshot.status, snapshot.value]);
  useEffect(() => {
    const state = props.overviewReturnState;
    if (snapshot.status !== "ready" || !snapshot.value || !state || state.originWorkspaceId !== snapshot.value.workspace.id
      || restoredFocus.current === state || attentionExpanded !== state.attentionExpanded) return;
    const target = document.getElementById(state.returnFocusId);
    if (!target) return;
    target.focus({ preventScroll: true });
    if (document.activeElement === target) restoredFocus.current = state;
  }, [attentionExpanded, props.overviewReturnState, snapshot.status, snapshot.value]);
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
  const returnState = (returnFocusId: string): WorkspaceOverviewReturnState => ({
    originWorkspaceId: snapshot.value!.workspace.id,
    scrollTop: scrollRef.current?.scrollTop ?? 0,
    attentionExpanded,
    returnFocusId,
  });
  const navigate = (destination: WorkspaceDestination) => props.onNavigate
    ? props.onNavigate(destination, returnState(destination.returnFocusId))
    : props.onOpenPage(destination.page, destination.returnFocusId);
  return <InstrumentScreenRoot descriptor={workspaceOverviewInstrumentStates} state={snapshot.error ? "partial" : "ready"}><main className="main-region workspace-overview flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 text-[13px] text-ink" aria-busy={snapshot.refreshing || undefined}>
    <WorkspaceOverviewHeader
      value={presentation.header}
      criticalCount={criticalCount}
      refreshing={snapshot.refreshing}
      lastSuccessfulRefreshAt={snapshot.lastSuccessfulRefreshAt ?? null}
      error={snapshot.error}
      onRefresh={() => { void controller.retry(); }}
    />
    {snapshot.error && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.error}</span><button type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className="workspace-overview-scroll grid w-full max-w-none grid-cols-12 gap-2 overflow-visible p-0 [&_button]:text-[13px] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:text-[13px] [&_p]:leading-5" ref={scrollRef}>
      <WorkspaceOverviewShell
        value={presentation}
        onOpenPage={(page, returnFocusId) => navigate({ page, returnFocusId, context: { label: WORKSPACE_PAGE_LABELS[page] } } as WorkspaceDestination)}
        onOpenCalendar={(context, returnFocusId) => navigate({ page: "calendar", returnFocusId, context })}
        onOpenUnit={(projectId, unitId, unitLabel, returnFocusId) => props.onOpenUnit(projectId, unitId, unitLabel, returnState(returnFocusId))}
        onOpenProject={props.onOpenProject}
        onRetry={() => { void controller.retry(); }}
        attentionExpanded={attentionExpanded}
        onAttentionExpandedChange={setAttentionExpanded}
      />
    </div>
  </main></InstrumentScreenRoot>;
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
