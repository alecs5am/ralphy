import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ProjectControls } from "../components/ProjectControls";
import { InstrumentScreenRoot, type InstrumentScreenStateDescriptor } from "../instrument/screen-state-registry";
import { ActivityTimeline, activityInstrumentStates } from "./project/ActivityTimeline";
import { DocumentsPanel, documentsInstrumentStates } from "./project/DocumentsPanel";
import { MediaPanel } from "./project/MediaPanel";
import { MediaViewer } from "./project/MediaViewer";
import { UnitsPanel, unitsInstrumentStates } from "./project/UnitsPanel";
import { bridge, type ProjectSummary } from "../lib/ipc";
import type { DomainPage } from "../state/project-domain";
import { createProjectScreenController, type ProjectScreenApi, type ProjectScreenController, type ProjectScreenSnapshot } from "../state/project-screen-controller";

export { createProjectScreenController } from "../state/project-screen-controller";

function PageState({ descriptor, page, empty, onRetry, children }: { descriptor: InstrumentScreenStateDescriptor; page: DomainPage; empty: string; onRetry(): void; children: React.ReactNode }) {
  if (page.status === "loading" && page.items.length === 0) return <InstrumentScreenRoot descriptor={descriptor} state="loading"><div className="project-skeleton" role="status">Loading…</div></InstrumentScreenRoot>;
  if (page.status === "error" && page.items.length === 0) return <InstrumentScreenRoot descriptor={descriptor} state="error"><ProjectError error={page.error} onRetry={onRetry} /></InstrumentScreenRoot>;
  if (page.status === "ready" && page.items.length === 0) return <InstrumentScreenRoot descriptor={descriptor} state="empty"><div className="empty-section">{empty}</div></InstrumentScreenRoot>;
  return <>{children}</>;
}

function ProjectError({ error, onRetry }: { error: string | null; onRetry(): void }) {
  return <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error ?? "This section could not be loaded."}</span><button className="command-button" type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
}

export function ProjectScreenView({ project, workspaceName = null, rootEpoch = 0, controller, snapshot, targetUnitId, scrollMemory = new Map<string, number>(), documentsScrollMemory = scrollMemory, unitsScrollMemory = scrollMemory, activityScrollMemory = scrollMemory }: { project: ProjectSummary; workspaceName?: string | null; rootEpoch?: number; controller: ProjectScreenController; snapshot: ProjectScreenSnapshot; targetUnitId?: string | null; scrollMemory?: Map<string, number>; documentsScrollMemory?: Map<string, number>; unitsScrollMemory?: Map<string, number>; activityScrollMemory?: Map<string, number> }) {
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
  return <main className="main-region project-region flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 pb-6 type-base text-ink">
    <ProjectControls activeTab={activeTab} onSelect={selectTab} />
    <div className={`project-domain-body @container/project-domain w-full min-h-0 flex-1 overflow-hidden${activeTab === "media" ? " is-media flex flex-col" : activeTab === "documents" ? " is-documents pb-6" : activeTab === "units" ? " is-units pb-6" : activeTab === "activity" ? " is-activity pb-6" : ""}`} role="tabpanel" id={`project-panel-${activeTab}`} aria-labelledby={`project-tab-${activeTab}`}>
      {activeTab === "documents" && page && (page.status === "loading" && page.items.length === 0 ? <InstrumentScreenRoot descriptor={documentsInstrumentStates} state="loading"><div className="project-skeleton" role="status">Loading documents…</div></InstrumentScreenRoot> : page.status === "error" && page.items.length === 0 ? <InstrumentScreenRoot descriptor={documentsInstrumentStates} state="error"><ProjectError error={page.error} onRetry={retry} /></InstrumentScreenRoot> : <DocumentsPanel page={page} controller={controller} snapshot={snapshot} scrollMemory={documentsScrollMemory} resetToken={projectScrollToken} />)}
      {activeTab === "media" && page && <MediaPanel page={page} controller={controller} snapshot={snapshot} project={project} workspaceName={workspaceName} rootEpoch={rootEpoch} scrollMemory={scrollMemory} scrollResetToken={mediaScrollToken} />}
      {activeTab === "units" && page && <PageState descriptor={unitsInstrumentStates} page={page} empty="No units yet." onRetry={retry}><UnitsPanel page={page} controller={controller} snapshot={snapshot} targetUnitId={targetUnitId} scrollMemory={unitsScrollMemory} resetToken={projectScrollToken} /></PageState>}
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
): () => void {
  const controller = createProjectScreenController(api, project, activitySequence);
  setController(controller);
  void controller.start();
  return () => controller.dispose();
}

function ConnectedProjectScreen({ project, workspaceName, rootEpoch, controller, targetUnitId }: { project: ProjectSummary; workspaceName: string | null; rootEpoch: number; controller: ProjectScreenController; targetUnitId?: string | null }) {
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
  return <ProjectScreenView project={project} workspaceName={workspaceName} rootEpoch={rootEpoch} controller={controller} snapshot={snapshot} targetUnitId={targetUnitId} scrollMemory={currentScroll.media} documentsScrollMemory={currentScroll.documents} unitsScrollMemory={currentScroll.units} activityScrollMemory={currentScroll.activity} />;
}

export function ProjectScreen({
  project,
  workspaceName = null,
  rootEpoch,
  activitySequence,
  targetUnitId,
}: {
  project: ProjectSummary;
  workspaceName?: string | null;
  rootEpoch: number;
  activitySequence: number;
  targetUnitId?: string | null;
}) {
  const [controller, setController] = useState<ProjectScreenController | null>(null);
  useEffect(
    () => startProjectScreenController(bridge, project, activitySequence, setController),
    [project.projectId, project.workspaceId, rootEpoch],
  );
  useEffect(() => { void controller?.refresh(activitySequence); }, [activitySequence, controller]);
  useEffect(() => {
    if (controller && targetUnitId) void controller.selectTab("units");
  }, [controller, targetUnitId]);
  return controller
    ? <ConnectedProjectScreen project={project} workspaceName={workspaceName} rootEpoch={rootEpoch} controller={controller} targetUnitId={targetUnitId} />
    : <InstrumentScreenRoot descriptor={unitsInstrumentStates} state="loading"><main className="main-region project-region flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-transparent p-2 pb-6 type-base text-ink"><div className="project-skeleton" role="status">Loading project overview…</div></main></InstrumentScreenRoot>;
}
