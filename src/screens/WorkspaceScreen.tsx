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
  type Availability,
  type WorkspaceOverviewPresentation,
} from "./workspace/overview-presentation";
import { WorkspaceOverviewHeader } from "./workspace/WorkspaceOverviewHeader";
import { WorkspaceInsights } from "./workspace/WorkspaceInsights";
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

function PlaceholderSection({
  title,
  value,
  ready,
}: {
  title: string;
  value: Availability<unknown>;
  ready: string;
}) {
  const id = `workspace-${title.toLowerCase().replaceAll(" ", "-")}`;
  return <section className="workspace-overview-section" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <p>{value.status === "ready" ? ready : value.reason}</p>
  </section>;
}

function WorkspaceOverviewShell({ value, onOpenPage, onOpenUnit }: {
  value: WorkspaceOverviewPresentation;
  onOpenPage(page: WorkspacePage): void;
  onOpenUnit(projectId: string, unitId: string): void;
}) {
  const attention = value.attention.status === "ready" || value.attention.status === "partial"
    ? `${value.attention.value.items.length} attention item${value.attention.value.items.length === 1 ? "" : "s"} available.`
    : "Attention data available.";
  const projects = value.projects.status === "ready" || value.projects.status === "partial"
    ? `${value.projects.value.length} active project${value.projects.value.length === 1 ? "" : "s"} available.`
    : "Project data available.";
  return <>
    <WorkspacePerformance value={value} onOpenCalendar={() => onOpenPage("calendar")} />
    <WorkspacePlanAndOutcomes value={value} onOpenPage={onOpenPage} onOpenUnit={onOpenUnit} />
    <WorkspaceInsights value={value} onOpenPage={onOpenPage} />
    <PlaceholderSection title="Attention" value={value.attention} ready={attention} />
    <PlaceholderSection title="Active projects" value={value.projects} ready={projects} />
  </>;
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
    return <main className="main-region"><div className="project-skeleton" role="status">Loading workspace overview…</div></main>;
  }
  if (snapshot.status === "error") {
    return <main className="main-region"><div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.error ?? "Workspace overview could not be loaded."}</span><button type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div></main>;
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
      <WorkspaceOverviewShell value={presentation} onOpenPage={props.onOpenPage} onOpenUnit={props.onOpenUnit} />
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
    : <main className="main-region"><div className="project-skeleton" role="status">Loading workspace overview…</div></main>;
}
