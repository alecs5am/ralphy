import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ProjectSummary } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import {
  createWorkspaceScreenController,
  type WorkspaceScreenApi,
  type WorkspaceScreenController,
  type WorkspaceScreenSnapshot,
} from "../state/workspace-screen-controller";
import type { WorkspacePage } from "../state/workbench";
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

function WorkspaceOverviewShell({ value, onOpenPage, onOpenUnit, onOpenProject, onRetry }: {
  value: WorkspaceOverviewPresentation;
  onOpenPage(page: WorkspacePage): void;
  onOpenUnit(projectId: string, unitId: string): void;
  onOpenProject(project: ProjectSummary): void;
  onRetry(): void;
}) {
  return <>
    <WorkspacePerformance value={value} onOpenCalendar={() => onOpenPage("calendar")} />
    <WorkspacePlanAndOutcomes value={value} onOpenPage={onOpenPage} onOpenUnit={onOpenUnit} />
    <WorkspaceInsights value={value} onOpenPage={onOpenPage} />
    <WorkspaceOperations value={value} onOpenProject={onOpenProject} onOpenPage={onOpenPage} onRetry={onRetry} />
  </>;
}

function WorkspaceOverviewLoading() {
  return <main className="main-region workspace-overview workspace-overview-loading" aria-busy="true">
    <header className="screen-header workspace-overview-header workspace-overview-loading-header">
      <div className="screen-kicker">Workspace overview</div>
      <h1>Loading workspace overview…</h1>
    </header>
    <div className="workspace-overview-scroll" role="status" aria-label="Loading workspace overview">
      {["Performance", "Planning", "Insights", "Operations"].map((label) => <section key={label} className="workspace-overview-skeleton-section" aria-hidden="true">
        <span>{label}</span><i /><i /><i />
      </section>)}
    </div>
  </main>;
}

function WorkspaceOverviewError({ error, onRetry }: { error: string | null; onRetry(): void }) {
  return <main className="main-region workspace-overview workspace-overview-error">
    <header className="screen-header workspace-overview-header workspace-overview-loading-header">
      <div className="screen-kicker">Workspace overview</div>
      <h1>Workspace overview could not be loaded</h1>
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
  onOpenPage(page: WorkspacePage): void;
  onOpenUnit(projectId: string, unitId: string): void;
  onOpenProject(project: ProjectSummary): void;
}

export function WorkspaceScreenView(props: WorkspaceScreenViewProps) {
  const { controller, snapshot, catalogProjects, workspaceDescription } = props;
  if (snapshot.status === "loading" || snapshot.status === "idle") {
    return <WorkspaceOverviewLoading />;
  }
  if (snapshot.status === "error") {
    return <WorkspaceOverviewError error={snapshot.error} onRetry={() => { void controller.retry(); }} />;
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
  return <main className="main-region workspace-overview" aria-busy={snapshot.refreshing || undefined}>
    <WorkspaceOverviewHeader
      value={presentation.header}
      criticalCount={criticalCount}
      refreshing={snapshot.refreshing}
      onRefresh={() => { void controller.retry(); }}
    />
    {snapshot.error && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.error}</span><button type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className="workspace-overview-scroll">
      <WorkspaceOverviewShell
        value={presentation}
        onOpenPage={props.onOpenPage}
        onOpenUnit={props.onOpenUnit}
        onOpenProject={props.onOpenProject}
        onRetry={() => { void controller.retry(); }}
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
        onOpenPage={props.onOpenPage}
        onOpenUnit={props.onOpenUnit}
        onOpenProject={props.onOpenProject}
      />
    : <WorkspaceOverviewLoading />;
}
