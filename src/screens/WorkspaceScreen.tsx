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
import { COMMAND_BUTTON, PROJECT_LOCAL_ERROR } from "./route-chrome";

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

/* The route surface. `main-region` and `workspace-overview` stay as the hooks instrument.css
   names and the geometry harness selects; the route declares its own content row so the row
   collapses below read a container this component owns. */
const ROUTE = "main-region workspace-overview @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 type-base text-ink";
/* The desk grid the sections stand on. The desk is the only scroll owner here, so this row
   keeps its own overflow visible and only guards its flex geometry. */
const OVERVIEW_GRID = "workspace-overview-scroll grid min-h-0 w-full flex-1 grid-cols-12 items-start gap-2 overflow-visible p-0";
/* The black header the three states share. `screen-header` and `workspace-overview-header`
   are hooks; the layout, surface and on-instrument ink are stated here. */
const STATE_HEADER = "screen-header workspace-overview-header workspace-overview-loading-header m-0 flex min-h-28 w-full max-w-none flex-col justify-center gap-1 rounded-panel bg-instrument px-5 py-4 text-on-instrument";
const STATE_KICKER = "screen-kicker mb-1 type-xs uppercase tracking-wide text-on-instrument-muted";
const STATE_TITLE = "m-0 type-xl font-normal text-on-instrument";
const STATE_COPY = "m-0 type-base leading-5 text-on-instrument-muted";
const SKELETON_SECTION = "workspace-overview-skeleton-section col-span-12 min-h-44 rounded-panel bg-surface p-4 @min-workspace-section/instrument-desk:col-span-6";
const SKELETON_BAR = "mt-3 block h-4.5 rounded-chip bg-surface-sunken";

function WorkspaceOverviewLoading({ workspaceName, workspaceDescription }: { workspaceName: string; workspaceDescription: string }) {
  return <InstrumentScreenRoot descriptor={workspaceOverviewInstrumentStates} state="loading"><main className={`${ROUTE} workspace-overview-loading`} aria-busy="true">
    <header className={STATE_HEADER}>
      <div className={STATE_KICKER}>Workspace overview</div>
      <h1 className={STATE_TITLE}>{workspaceName || "Loading workspace overview…"}</h1>
      {workspaceDescription && <p className={STATE_COPY}>{workspaceDescription}</p>}
    </header>
    <div className={OVERVIEW_GRID} role="status" aria-label="Loading workspace overview">
      {["Performance", "Planning", "Insights", "Operations"].map((label) => <section key={label} className={SKELETON_SECTION} aria-hidden="true">
        <span className="type-xs text-muted">{label}</span>
        <i className={`${SKELETON_BAR} w-full`} />
        <i className={`${SKELETON_BAR} w-(--workspace-skeleton-mid)`} />
        <i className={`${SKELETON_BAR} w-(--workspace-skeleton-short)`} />
      </section>)}
    </div>
  </main></InstrumentScreenRoot>;
}

function WorkspaceOverviewError({ error, workspaceName, workspaceDescription, onRetry }: { error: string | null; workspaceName: string; workspaceDescription: string; onRetry(): void }) {
  return <InstrumentScreenRoot descriptor={workspaceOverviewInstrumentStates} state="error"><main className={`${ROUTE} workspace-overview-error`}>
    <header className={STATE_HEADER}>
      <div className={STATE_KICKER}>Workspace overview</div>
      <h1 className={STATE_TITLE}>{workspaceName || "Workspace overview"}</h1>
      {workspaceDescription && <p className={STATE_COPY}>{workspaceDescription}</p>}
      <strong className="type-sm font-normal text-on-instrument">Workspace overview could not be loaded</strong>
    </header>
    <div className={PROJECT_LOCAL_ERROR} role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{error ?? "Core did not return workspace data."}</span>
      <button className={COMMAND_BUTTON} type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button>
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
  return <InstrumentScreenRoot descriptor={workspaceOverviewInstrumentStates} state={snapshot.error ? "partial" : "ready"}><main className={ROUTE} aria-busy={snapshot.refreshing || undefined}>
    <WorkspaceOverviewHeader
      value={presentation.header}
      criticalCount={criticalCount}
      refreshing={snapshot.refreshing}
      lastSuccessfulRefreshAt={snapshot.lastSuccessfulRefreshAt ?? null}
      error={snapshot.error}
      onRefresh={() => { void controller.retry(); }}
    />
    {snapshot.error && <div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.error}</span><button className={COMMAND_BUTTON} type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className={OVERVIEW_GRID} ref={scrollRef}>
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
