/**
 * Which screen the work surface shows.
 *
 * One route, one screen, and the order matters: a workspace page wins over the library, and the
 * library is what falls out when nothing else claims the route. This was a cascade of
 * reassignments inside `App.tsx`, which is why a reader had to run the whole chain in their head
 * to answer "what renders here" -- the branches are the same, stated as what each one returns.
 *
 * The props are the app's state, unchanged: this component decides nothing, it only routes.
 */
import { Suspense, lazy } from "react";

import type { AgentChatUsage } from "@/features/agent-chat";
import type { VideoAgentRequest } from "@/features/video-workspace";
import { CalendarScreen } from "@/pages/calendar";
import { ContextScreen } from "@/pages/context";
import { LibraryScreen } from "@/pages/library";
import { MemoryScreen } from "@/pages/memory";
import { SharedLibraryScreen } from "@/pages/shared-library";
import { WorkspaceScreen } from "@/pages/workspace";
import { WorkspaceProjectsScreen } from "@/pages/workspace-projects";
import { WorkspaceUnitsScreen } from "@/pages/workspace-units";
import { readUnitViewTarget, type ViewTab } from "@/widgets/view-panel";
import type { AgentProvider, CatalogResult, ProjectReference, ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import type { WorkbenchRoute, WorkspaceDestination, WorkspaceOverviewReturnState, WorkspacePage } from "@/shared/model/workbench";

import { ProjectScreenLoadingFallback } from "./app-frames";

/* The project screen is the app's heaviest route and the only one that is never the first paint,
   so it arrives on demand. The loader is named because the tests assert it stays lazy. */
const loadProjectScreen = () =>
  import("@/pages/project").then((module) => ({ default: module.ProjectScreen }));
const ProjectScreen = lazy(loadProjectScreen);
const UnitView = lazy(() => import("@/pages/project").then((module) => ({ default: module.UnitView })));
const GenerationScreen = lazy(() => import("@/pages/generation").then((module) => ({ default: module.GenerationScreen })));

export interface WorkRouteProps {
  viewTab?: ViewTab | null;
  onCloseUnitView?(): void;
  catalog: CatalogResult | null;
  error: string | null;
  restoring: boolean;
  route: WorkbenchRoute;
  pinnedWorkspaceIds: string[];
  pinnedProjectIds: string[];
  rootEpoch: number;
  activitySequence: number;
  workspaces: readonly WorkspaceSummary[];
  projects: readonly ProjectSummary[];
  selectedWorkspace: WorkspaceSummary | null;
  selectedProject: ProjectSummary | null;
  workspacePage: WorkspacePage;
  overviewReturnState: WorkspaceOverviewReturnState | null;
  workspaceDestination: WorkspaceDestination | null;
  sidebarSearchRequest: number;
  targetUnitId: string | null;
  onTargetUnitOpened?(): void;
  /* The Context page reads the active chat's own provider and its measured usage: context is a
     property of a chat, not of a workspace, and a figure from another chat would be the wrong
     number. There is no chat before the feature is enabled, and then there is no page. */
  chat: { provider: AgentProvider; usage: AgentChatUsage | null } | null;
  onRetryLibrary(): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenProject(project: ProjectSummary, unitId?: string | null): void;
  onOpenUnitView?(reference: ProjectReference, unitId: string, label: string, revisionId?: string): void;
  onOpenWorkspacePage(page: WorkspacePage): void;
  onNavigateFromOverview(destination: WorkspaceDestination, returnState: WorkspaceOverviewReturnState): void;
  onToggleProjectPin(projectId: string): void;
  onOpenProviders?(): void;
  onRequestVideoAgent?(request: VideoAgentRequest): void;
}

export function WorkRoute({
  viewTab,
  onCloseUnitView,
  catalog,
  error,
  restoring,
  route,
  pinnedWorkspaceIds,
  pinnedProjectIds,
  rootEpoch,
  activitySequence,
  workspaces,
  projects,
  selectedWorkspace,
  selectedProject,
  workspacePage,
  overviewReturnState,
  workspaceDestination,
  sidebarSearchRequest,
  targetUnitId,
  onTargetUnitOpened,
  chat,
  onRetryLibrary,
  onOpenWorkspace,
  onOpenProject,
  onOpenWorkspacePage,
  onNavigateFromOverview,
  onToggleProjectPin,
  onOpenProviders,
  onRequestVideoAgent,
  onOpenUnitView,
}: WorkRouteProps) {
  if (viewTab?.type === "unit") {
    const target = readUnitViewTarget(viewTab.targetId);
    const project = target?.workspaceId === selectedWorkspace?.id
      ? projects.find((project) => project.workspaceId === target?.workspaceId && project.projectId === target?.projectId) : null;
    const reference = project ?? (target && target.workspaceId === selectedWorkspace?.id && target.projectId === null ? { workspaceId: target.workspaceId, projectId: null } : null);
    return target && reference ? <Suspense fallback={<p role="status">Opening Unit…</p>}><UnitView key={`${rootEpoch}:${viewTab.id}`} project={reference} unitId={target.unitId} revisionId={target.revisionId} rootEpoch={rootEpoch} onClose={() => onCloseUnitView?.()} onRequestAgent={onRequestVideoAgent} /></Suspense>
      : <p role="alert">This Unit is not available in the current workspace.</p>;
  }
  const library = (
    <LibraryScreen
      catalog={catalog}
      error={catalog ? undefined : error}
      restoring={restoring}
      pinnedWorkspaceIds={pinnedWorkspaceIds}
      onRetry={() => onRetryLibrary()}
      onOpenWorkspace={onOpenWorkspace}
      onOpenProject={onOpenProject}
    />
  );
  if (route.kind === "workspace" && selectedWorkspace && workspacePage === "generation") {
    return <Suspense fallback={<p className="m-auto type-sm text-muted" role="status">Opening Create…</p>}>
      <GenerationScreen
        key={`generation:${rootEpoch}:${selectedWorkspace.id}`}
        workspaceId={selectedWorkspace.id}
        workspaceName={selectedWorkspace.name}
        rootEpoch={rootEpoch}
        onOpenProviders={onOpenProviders}
        onOpenUnit={onOpenUnitView}
      />
    </Suspense>;
  }
  if (catalog && route.kind === "workspace" && selectedWorkspace && workspacePage === "overview") {
    return (
      <WorkspaceScreen
        workspaceId={selectedWorkspace.id}
        rootEpoch={rootEpoch}
        activitySequence={activitySequence}
        catalogProjects={projects.filter((project) => project.workspaceId === selectedWorkspace.id)}
        workspaceName={selectedWorkspace.name}
        workspaceDescription={selectedWorkspace.description}
        overviewReturnState={overviewReturnState?.originWorkspaceId === selectedWorkspace.id ? overviewReturnState : null}
        onOpenPage={onOpenWorkspacePage}
        onNavigate={onNavigateFromOverview}
        onOpenUnit={(projectId, unitId, unitLabel, returnState) => {
          const project = projects.find((candidate) => (
            candidate.workspaceId === selectedWorkspace.id && candidate.projectId === projectId
          ));
          if (project) onOpenProject(project, unitId);
          else if (returnState) onNavigateFromOverview(
            { page: "units", returnFocusId: returnState.returnFocusId, context: { label: `${unitLabel} is not present in the current project catalog` } },
            returnState,
          );
        }}
        onOpenProject={onOpenProject}
      />
    );
  }
  if (route.kind === "workspace" && selectedWorkspace && workspacePage === "projects") {
    return (
      <WorkspaceProjectsScreen
        workspaceId={selectedWorkspace.id}
        workspaceName={selectedWorkspace.name}
        workspaceDescription={selectedWorkspace.description}
        projects={projects.filter((project) => project.workspaceId === selectedWorkspace.id)}
        rootEpoch={rootEpoch}
        pinnedProjectIds={pinnedProjectIds}
        searchRequest={sidebarSearchRequest}
        onOpenProject={onOpenProject}
        onToggleProjectPin={(projectId) => onToggleProjectPin(projectId)}
      />
    );
  }
  if (route.kind === "workspace" && selectedWorkspace && workspacePage === "memory") {
    return <MemoryScreen workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name} />;
  }
  if (route.kind === "workspace" && selectedWorkspace && chat && workspacePage === "context") {
    return <ContextScreen
      key={`context:${selectedWorkspace.id}:${chat.provider}`}
      provider={chat.provider}
      project={selectedProject}
      workspaceId={selectedWorkspace.id}
      usage={chat.usage}
      onOpenMemory={() => onOpenWorkspacePage("memory")}
    />;
  }
  if (route.kind === "workspace" && selectedWorkspace && workspacePage === "shared") {
    return <SharedLibraryScreen
      key={`shared:${rootEpoch}:${selectedWorkspace.id}`}
      workspaceId={selectedWorkspace.id}
      workspaceName={selectedWorkspace.name}
      rootEpoch={rootEpoch}
    />;
  }
  if (route.kind === "workspace" && selectedWorkspace && workspacePage === "calendar") {
    const calendarContext = overviewReturnState?.originWorkspaceId === selectedWorkspace.id && workspaceDestination?.page === "calendar"
      ? workspaceDestination.context
      : undefined;
    return <CalendarScreen workspaceId={selectedWorkspace.id} workspaceName={selectedWorkspace.name}
      initialDate={calendarContext?.date === undefined ? undefined : new Date(calendarContext.date)}
      navigationContext={calendarContext}
      onOpenProject={(projectId, unitId) => {
      if (onOpenUnitView) { onOpenUnitView({ workspaceId: selectedWorkspace.id, projectId }, unitId, "Unit"); return; }
      const project = projects.find((item) => item.projectId === projectId && item.workspaceId === selectedWorkspace.id);
      if (project) onOpenProject(project, unitId);
    }} />;
  }
  if (route.kind === "workspace" && selectedWorkspace && workspacePage === "units") {
    return <WorkspaceUnitsScreen
      key={`workspace-units:${rootEpoch}:${selectedWorkspace.id}`}
      workspaceId={selectedWorkspace.id}
      workspaceName={selectedWorkspace.name}
      projects={projects.filter((project) => project.workspaceId === selectedWorkspace.id)}
      rootEpoch={rootEpoch}
      activitySequence={activitySequence}
      onOpenUnit={(reference, unitId, label) => {
        if (onOpenUnitView) onOpenUnitView(reference, unitId, label);
        else { const project = projects.find((item) => item.projectId === reference.projectId && item.workspaceId === reference.workspaceId); if (project) onOpenProject(project, unitId); }
      }}
    />;
  }
  if (route.kind === "project" && selectedProject) {
    return (
      <Suspense
        fallback={<ProjectScreenLoadingFallback />}
      >
        <ProjectScreen
          onOpenUnit={viewTab ? (unitId) => onOpenProject(selectedProject, unitId) : undefined}
          onRequestAgent={onRequestVideoAgent}
          key={`project:${rootEpoch}:${selectedProject.workspaceId}:${selectedProject.projectId}`}
          project={selectedProject}
          workspaceName={workspaces.find(({ id }) => id === selectedProject.workspaceId)?.name ?? null}
          rootEpoch={rootEpoch}
          activitySequence={activitySequence}
          targetUnitId={targetUnitId}
          onTargetUnitOpened={onTargetUnitOpened}
        />
      </Suspense>
    );
  }
  return library;
}

export { loadProjectScreen };
