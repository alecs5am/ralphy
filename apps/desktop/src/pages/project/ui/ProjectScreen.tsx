import { AlertCircle, RefreshCw } from "@/shared/ui/icons";
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { ProjectControls } from "@/widgets/project-header";
import { InstrumentScreenRoot, type InstrumentScreenStateDescriptor } from "@/shared/instrument/screen-state-registry";
import { ActivityTimeline, activityInstrumentStates } from "./ActivityTimeline";
import { DocumentsPanel, documentsInstrumentStates } from "./DocumentsPanel";
import { MediaPanel, mediaInstrumentStates } from "./MediaPanel";
import { MediaViewer } from "./MediaViewer";
import { UnitsPanel, unitsInstrumentStates } from "./UnitsPanel";
import { bridge, type ProjectSummary } from "@/shared/api/ipc";
import type { DomainPage } from "@/entities/project";
import { createProjectScreenController, type ProjectScreenApi, type ProjectScreenController, type ProjectScreenSnapshot } from "../model/screen-controller";
import { COMMAND_BUTTON, EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "@/shared/ui/route-chrome";

import type { VideoAgentRequest } from "@/features/video-workspace";
const VideoWorkspace = lazy(() => import("@/features/video-workspace").then((module) => ({ default: module.VideoWorkspace })));

export { createProjectScreenController } from "../model/screen-controller";

function PageState({ descriptor, page, empty, onRetry, children }: { descriptor: InstrumentScreenStateDescriptor; page: DomainPage; empty: string; onRetry(): void; children: React.ReactNode }) {
  if (page.status === "loading" && page.items.length === 0) return <InstrumentScreenRoot descriptor={descriptor} state="loading"><div className={PROJECT_SKELETON} role="status">Loading…</div></InstrumentScreenRoot>;
  if (page.status === "error" && page.items.length === 0) return <InstrumentScreenRoot descriptor={descriptor} state="error"><ProjectError error={page.error} onRetry={onRetry} /></InstrumentScreenRoot>;
  if (page.status === "ready" && page.items.length === 0) return <InstrumentScreenRoot descriptor={descriptor} state="empty"><div className={EMPTY_SECTION}>{empty}</div></InstrumentScreenRoot>;
  return <>{children}</>;
}

function ProjectError({ error, onRetry }: { error: string | null; onRetry(): void }) {
  return <div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error ?? "This section could not be loaded."}</span><button className={COMMAND_BUTTON} type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
}

export function ProjectScreenView({ project, workspaceName = null, rootEpoch = 0, controller, snapshot, targetUnitId, onTargetUnitOpened, scrollMemory = new Map<string, number>(), documentsScrollMemory = scrollMemory, unitsScrollMemory = scrollMemory, activityScrollMemory = scrollMemory, onRequestAgent, onOpenUnit, onOpenCreate }: { project: ProjectSummary; workspaceName?: string | null; rootEpoch?: number; controller: ProjectScreenController; snapshot: ProjectScreenSnapshot; targetUnitId?: string | null; onTargetUnitOpened?(): void; scrollMemory?: Map<string, number>; documentsScrollMemory?: Map<string, number>; unitsScrollMemory?: Map<string, number>; activityScrollMemory?: Map<string, number>; onOpenUnit?(unitId: string): void; onRequestAgent?(request: VideoAgentRequest): void; onOpenCreate?(): void }) {
  const [video, setVideo] = useState<{ unitId: string; title: string } | null>(null);
  useEffect(() => setVideo(null), [project.workspaceId, project.projectId]);
  const state = snapshot.domain;
  const activeTab = snapshot.activeTab;
  const page = state.pages[activeTab];
  const projectScrollToken = JSON.stringify([rootEpoch, state.project.workspaceId, state.project.projectId]);
  const mediaScrollToken = JSON.stringify([projectScrollToken, state.media]);
  const retry = () => { void controller.retry(); };
  const selectTab = (tab: Parameters<ProjectScreenController["selectTab"]>[0]) => {
    if (activeTab === "documents" && tab !== "documents" && snapshot.documentSaving) return;
    if (activeTab === "documents" && tab !== "documents" && snapshot.documentDirty) {
      if (!window.confirm("Discard unsaved document changes?")) return;
      controller.cancelDocumentEdit();
    }
    void controller.selectTab(tab);
  };
  if (video) return <Suspense fallback={<p role="status">Opening video editor…</p>}><VideoWorkspace reference={{ workspaceId: project.workspaceId, projectId: project.projectId, unitId: video.unitId }} title={video.title} onClose={() => { setVideo(null); void controller.openUnit(video.unitId); }} onRequestAgent={onRequestAgent} /></Suspense>;
  /* No wash of its own. The mode surface above already paints the desk when the route is the
     elastic column, and inside the view panel it deliberately does not -- the page card paints
     there. A second `bg-desk` here repainted the same colour in the desk lens and painted over
     the panel's white card in the chat lens. */
  return <main className="main-region project-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden p-1 type-base text-ink">
    <ProjectControls title={project.name} activeTab={activeTab} onSelect={selectTab} />
    <div className={`project-domain-body @container/project-domain w-full min-h-0 flex-1 overflow-hidden${activeTab === "media" ? " is-media flex flex-col" : activeTab === "documents" ? " is-documents pb-6" : activeTab === "units" ? " is-units pb-6" : activeTab === "activity" ? " is-activity pb-6" : ""}`} id={`project-panel-${activeTab}`}>
      {activeTab === "documents" && page && (page.status === "loading" && page.items.length === 0 ? <InstrumentScreenRoot descriptor={documentsInstrumentStates} state="loading"><div className={PROJECT_SKELETON} role="status">Loading documents…</div></InstrumentScreenRoot> : page.status === "error" && page.items.length === 0 ? <InstrumentScreenRoot descriptor={documentsInstrumentStates} state="error"><ProjectError error={page.error} onRetry={retry} /></InstrumentScreenRoot> : <DocumentsPanel page={page} controller={controller} snapshot={snapshot} scrollMemory={documentsScrollMemory} resetToken={projectScrollToken} />)}
      {activeTab === "media" && page && <MediaPanel page={page} controller={controller} snapshot={snapshot} project={project} workspaceName={workspaceName} rootEpoch={rootEpoch} scrollMemory={scrollMemory} scrollResetToken={mediaScrollToken} onOpenCreate={onOpenCreate} />}
      {activeTab === "units" && page && <PageState descriptor={unitsInstrumentStates} page={page} empty="No units yet." onRetry={retry}><UnitsPanel onOpenUnit={onOpenUnit} onEditVideo={(unitId, title) => setVideo({ unitId, title })} page={page} controller={controller} snapshot={snapshot} targetUnitId={targetUnitId} onTargetUnitOpened={onTargetUnitOpened} scrollMemory={unitsScrollMemory} resetToken={projectScrollToken} /></PageState>}
      {activeTab === "activity" && page && <PageState descriptor={activityInstrumentStates} page={page} empty="No activity yet." onRetry={retry}><ActivityTimeline page={page} controller={controller} scrollMemory={activityScrollMemory} resetToken={projectScrollToken} /></PageState>}
    </div>
    <MediaViewer controller={controller} snapshot={snapshot} />
  </main>;
}

export function startProjectScreenController(
  api: ProjectScreenApi,
  project: ProjectSummary,
  activitySequence: number,
  setController: (controller: ProjectScreenController) => void,
  rootEpoch = 0,
): () => void {
  const controller = createProjectScreenController(api, project, activitySequence, rootEpoch);
  setController(controller);
  void controller.start();
  return () => controller.dispose();
}

function ConnectedProjectScreen({ project, workspaceName, rootEpoch, controller, targetUnitId, onTargetUnitOpened, onRequestAgent, onOpenUnit, onOpenCreate }: { project: ProjectSummary; workspaceName: string | null; rootEpoch: number; controller: ProjectScreenController; targetUnitId?: string | null; onTargetUnitOpened?(): void; onOpenUnit?(unitId: string): void; onRequestAgent?(request: VideoAgentRequest): void; onOpenCreate?(): void }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const projectScrollToken = JSON.stringify([rootEpoch, snapshot.domain.project.workspaceId, snapshot.domain.project.projectId]);
  const mediaScrollToken = JSON.stringify([projectScrollToken, snapshot.domain.media]);
  const [ownedScroll, setOwnedScroll] = useState(() => ({
    projectScrollToken,
    mediaScrollToken,
    media: new Map<string, number>(),
    documents: new Map<string, number>(),
    units: new Map<string, number>(),
    activity: new Map<string, number>(),
  }));
  let currentScroll = ownedScroll;
  if (ownedScroll.projectScrollToken !== projectScrollToken || ownedScroll.mediaScrollToken !== mediaScrollToken) {
    currentScroll = {
      projectScrollToken,
      mediaScrollToken,
      media: new Map<string, number>(),
      documents: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.documents : new Map<string, number>(),
      units: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.units : new Map<string, number>(),
      activity: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.activity : new Map<string, number>(),
    };
    setOwnedScroll(currentScroll);
  }
  return <ProjectScreenView onOpenUnit={onOpenUnit} onOpenCreate={onOpenCreate} onRequestAgent={onRequestAgent} project={project} workspaceName={workspaceName} rootEpoch={rootEpoch} controller={controller} snapshot={snapshot} targetUnitId={targetUnitId} onTargetUnitOpened={onTargetUnitOpened} scrollMemory={currentScroll.media} documentsScrollMemory={currentScroll.documents} unitsScrollMemory={currentScroll.units} activityScrollMemory={currentScroll.activity} />;
}

export function ProjectScreen({
  project,
  workspaceName = null,
  rootEpoch,
  activitySequence,
  targetUnitId,
  onTargetUnitOpened,
  onRequestAgent,
  onOpenUnit,
  onOpenCreate,
}: {
  project: ProjectSummary;
  workspaceName?: string | null;
  rootEpoch: number;
  activitySequence: number;
  targetUnitId?: string | null;
  onTargetUnitOpened?(): void;
  onOpenUnit?(unitId: string): void; onRequestAgent?(request: VideoAgentRequest): void;
  /** Reaching Create is the workbench's business: it is a workspace page, not a project one. */
  onOpenCreate?(): void;
}) {
  const [controller, setController] = useState<ProjectScreenController | null>(null);
  useEffect(
    () => startProjectScreenController(bridge, project, activitySequence, setController, rootEpoch),
    [project.projectId, project.workspaceId, rootEpoch],
  );
  useEffect(() => { void controller?.refresh(activitySequence); }, [activitySequence, controller]);
  useEffect(() => {
    if (controller && targetUnitId) void controller.selectTab("units");
  }, [controller, targetUnitId]);
  return controller
    ? <ConnectedProjectScreen onOpenUnit={onOpenUnit} onOpenCreate={onOpenCreate} onRequestAgent={onRequestAgent} project={project} workspaceName={workspaceName} rootEpoch={rootEpoch} controller={controller} targetUnitId={targetUnitId} onTargetUnitOpened={onTargetUnitOpened} />
    : <InstrumentScreenRoot descriptor={mediaInstrumentStates} state="loading"><main className="main-region project-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden bg-transparent p-1 type-base text-ink"><div className={PROJECT_SKELETON} role="status">Loading project media…</div></main></InstrumentScreenRoot>;
}
