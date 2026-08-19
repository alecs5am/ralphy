import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ProjectOverviewDto } from "../../electron/ralphy/types";
import { ProjectControls } from "../components/ProjectControls";
import { ActivityTimeline } from "./project/ActivityTimeline";
import { DocumentsPanel } from "./project/DocumentsPanel";
import { MediaPanel } from "./project/MediaPanel";
import { MediaViewer } from "./project/MediaViewer";
import { OverviewPanel } from "./project/OverviewPanel";
import { UnitsPanel } from "./project/UnitsPanel";
import { useRememberedScroll } from "./project/scroll-memory";
import { bridge, type ProjectSummary } from "../lib/ipc";
import type { DomainPage } from "../state/project-domain";
import { createProjectScreenController, type ProjectScreenApi, type ProjectScreenController, type ProjectScreenSnapshot } from "../state/project-screen-controller";

export { createProjectScreenController } from "../state/project-screen-controller";

function PageState({ page, empty, onRetry, children }: { page: DomainPage; empty: string; onRetry(): void; children: React.ReactNode }) {
  if (page.status === "loading" && page.items.length === 0) return <div className="project-skeleton" role="status">Loading…</div>;
  if (page.status === "error" && page.items.length === 0) return <ProjectError error={page.error} onRetry={onRetry} />;
  if (page.status === "ready" && page.items.length === 0) return <div className="empty-section">{empty}</div>;
  return <>{children}</>;
}

function ProjectError({ error, onRetry }: { error: string | null; onRetry(): void }) {
  return <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error ?? "This section could not be loaded."}</span><button className="command-button" type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
}

type ScrollBinding = ReturnType<typeof useRememberedScroll>;

export function ProjectScreenView({ project: _project, rootEpoch = 0, controller, snapshot, targetUnitId, scrollMemory = new Map<string, number>(), documentsScrollMemory = scrollMemory, unitsScrollMemory = scrollMemory, activityScrollMemory = scrollMemory, overviewScroll }: { project: ProjectSummary; rootEpoch?: number; controller: ProjectScreenController; snapshot: ProjectScreenSnapshot; targetUnitId?: string | null; scrollMemory?: Map<string, number>; documentsScrollMemory?: Map<string, number>; unitsScrollMemory?: Map<string, number>; activityScrollMemory?: Map<string, number>; overviewScroll?: ScrollBinding }) {
  const state = snapshot.domain;
  const activeTab = snapshot.activeTab;
  const page = activeTab === "overview" ? null : state.pages[activeTab];
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
  const openOverviewDocument = (documentId: string) => { void controller.selectTab("documents").then(() => controller.openDocumentById(documentId)); };
  const openOverviewUnit = (unitId: string) => { void controller.selectTab("units").then(() => controller.openUnit(unitId)); };
  return <main className="main-region project-region">
    <ProjectControls activeTab={activeTab} onSelect={selectTab} />
    <div className={`project-domain-body${activeTab === "media" ? " is-media" : activeTab === "documents" ? " is-documents" : activeTab === "units" ? " is-units" : activeTab === "activity" ? " is-activity" : ""}`} role="tabpanel" id={`project-panel-${activeTab}`} aria-labelledby={`project-tab-${activeTab}`} ref={activeTab === "overview" ? overviewScroll?.ref : undefined} onScroll={activeTab === "overview" ? overviewScroll?.onScroll : undefined}>
      {activeTab === "overview" && (state.overview.status === "loading" ? <div className="project-skeleton" role="status">Loading project overview…</div> : state.overview.status === "error" ? <ProjectError error={state.overview.error} onRetry={retry} /> : state.overview.value ? <OverviewPanel value={state.overview.value as ProjectOverviewDto} onViewTab={selectTab} onOpenDocument={openOverviewDocument} onOpenUnit={openOverviewUnit} /> : null)}
      {activeTab === "documents" && page && (page.status === "loading" && page.items.length === 0 ? <div className="project-skeleton" role="status">Loading documents…</div> : page.status === "error" && page.items.length === 0 ? <ProjectError error={page.error} onRetry={retry} /> : <DocumentsPanel page={page} controller={controller} snapshot={snapshot} scrollMemory={documentsScrollMemory} resetToken={projectScrollToken} />)}
      {activeTab === "media" && page && <MediaPanel page={page} controller={controller} snapshot={snapshot} rootEpoch={rootEpoch} scrollMemory={scrollMemory} scrollResetToken={mediaScrollToken} />}
      {activeTab === "units" && page && <PageState page={page} empty="No units yet." onRetry={retry}><UnitsPanel page={page} controller={controller} snapshot={snapshot} targetUnitId={targetUnitId} scrollMemory={unitsScrollMemory} resetToken={projectScrollToken} /></PageState>}
      {activeTab === "activity" && page && <PageState page={page} empty="No activity yet." onRetry={retry}><ActivityTimeline page={page} controller={controller} scrollMemory={activityScrollMemory} resetToken={projectScrollToken} /></PageState>}
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

function ConnectedProjectScreen({ project, rootEpoch, controller, targetUnitId }: { project: ProjectSummary; rootEpoch: number; controller: ProjectScreenController; targetUnitId?: string | null }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const projectScrollToken = JSON.stringify([rootEpoch, snapshot.domain.project.workspaceId, snapshot.domain.project.projectId]);
  const mediaScrollToken = JSON.stringify([projectScrollToken, snapshot.domain.media]);
  const [ownedScroll, setOwnedScroll] = useState(() => ({
    projectScrollToken,
    mediaScrollToken,
    overview: new Map<string, number>(),
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
      overview: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.overview : new Map<string, number>(),
      media: new Map<string, number>(),
      documents: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.documents : new Map<string, number>(),
      units: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.units : new Map<string, number>(),
      activity: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.activity : new Map<string, number>(),
    };
    setOwnedScroll(currentScroll);
  }
  const overviewScroll = useRememberedScroll(currentScroll.overview, "overview", projectScrollToken);
  return <ProjectScreenView project={project} rootEpoch={rootEpoch} controller={controller} snapshot={snapshot} targetUnitId={targetUnitId} scrollMemory={currentScroll.media} documentsScrollMemory={currentScroll.documents} unitsScrollMemory={currentScroll.units} activityScrollMemory={currentScroll.activity} overviewScroll={overviewScroll} />;
}

export function ProjectScreen({
  project,
  rootEpoch,
  activitySequence,
  targetUnitId,
}: {
  project: ProjectSummary;
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
    ? <ConnectedProjectScreen project={project} rootEpoch={rootEpoch} controller={controller} targetUnitId={targetUnitId} />
    : <main className="main-region project-region"><div className="project-skeleton" role="status">Loading project overview…</div></main>;
}
