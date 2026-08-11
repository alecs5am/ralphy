import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ActivityDto, ProjectOverviewDto } from "../../electron/ralphy/types";
import { ProjectControls } from "../components/ProjectControls";
import { ProjectHeader } from "../components/ProjectHeader";
import { CompositionsPanel } from "./project/CompositionsPanel";
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

function formatTime(value: number): string {
  return new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString();
}

function PageState({ page, empty, onRetry, children }: { page: DomainPage; empty: string; onRetry(): void; children: React.ReactNode }) {
  if (page.status === "loading" && page.items.length === 0) return <div className="project-skeleton" role="status">Loading…</div>;
  if (page.status === "error" && page.items.length === 0) return <ProjectError error={page.error} onRetry={onRetry} />;
  if (page.status === "ready" && page.items.length === 0) return <div className="empty-section">{empty}</div>;
  return <>{children}</>;
}

function ProjectError({ error, onRetry }: { error: string | null; onRetry(): void }) {
  return <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error ?? "This section could not be loaded."}</span><button className="command-button" type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
}

function Pagination({ page, onLoad, onRetry }: { page: DomainPage; onLoad(): void; onRetry(): void }) {
  if (page.status === "error") return <ProjectError error={page.error} onRetry={onRetry} />;
  if (page.nextCursor === null) return null;
  return <button className="command-button load-more" type="button" disabled={page.status === "loading"} onClick={onLoad}>{page.status === "loading" ? "Loading…" : "Load more"}</button>;
}

type ScrollBinding = ReturnType<typeof useRememberedScroll>;

export function ProjectScreenView({ project, rootEpoch = 0, controller, snapshot, scrollMemory = new Map<string, number>(), documentsScrollMemory = scrollMemory, compositionsScrollMemory = scrollMemory, unitsScrollMemory = scrollMemory, overviewScroll }: { project: ProjectSummary; rootEpoch?: number; controller: ProjectScreenController; snapshot: ProjectScreenSnapshot; scrollMemory?: Map<string, number>; documentsScrollMemory?: Map<string, number>; compositionsScrollMemory?: Map<string, number>; unitsScrollMemory?: Map<string, number>; overviewScroll?: ScrollBinding }) {
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
  const openOverviewComposition = (compositionId: string) => { void controller.selectTab("compositions").then(() => controller.openComposition(compositionId)); };
  const openOverviewUnit = (unitId: string) => { void controller.selectTab("units").then(() => controller.openUnit(unitId)); };
  return <main className="main-region project-region">
    <ProjectHeader project={project} />
    <ProjectControls activeTab={activeTab} onSelect={selectTab} />
    <div className={`project-domain-body${activeTab === "media" ? " is-media" : activeTab === "documents" ? " is-documents" : activeTab === "compositions" ? " is-compositions" : activeTab === "units" ? " is-units" : ""}`} role="tabpanel" id={`project-panel-${activeTab}`} aria-labelledby={`project-tab-${activeTab}`} ref={activeTab === "overview" ? overviewScroll?.ref : undefined} onScroll={activeTab === "overview" ? overviewScroll?.onScroll : undefined}>
      {activeTab === "overview" && (state.overview.status === "loading" ? <div className="project-skeleton" role="status">Loading project overview…</div> : state.overview.status === "error" ? <ProjectError error={state.overview.error} onRetry={retry} /> : state.overview.value ? <OverviewPanel value={state.overview.value as ProjectOverviewDto} onViewTab={selectTab} onOpenDocument={openOverviewDocument} onOpenComposition={openOverviewComposition} onOpenUnit={openOverviewUnit} /> : null)}
      {activeTab === "documents" && page && (page.status === "loading" && page.items.length === 0 ? <div className="project-skeleton" role="status">Loading documents…</div> : page.status === "error" && page.items.length === 0 ? <ProjectError error={page.error} onRetry={retry} /> : <DocumentsPanel page={page} controller={controller} snapshot={snapshot} scrollMemory={documentsScrollMemory} resetToken={projectScrollToken} />)}
      {activeTab === "media" && page && <MediaPanel page={page} controller={controller} snapshot={snapshot} rootEpoch={rootEpoch} scrollMemory={scrollMemory} scrollResetToken={mediaScrollToken} />}
      {activeTab === "compositions" && page && <PageState page={page} empty="No compositions yet." onRetry={retry}><CompositionsPanel page={page} controller={controller} snapshot={snapshot} scrollMemory={compositionsScrollMemory} resetToken={projectScrollToken} /></PageState>}
      {activeTab === "units" && page && <PageState page={page} empty="No units yet." onRetry={retry}><UnitsPanel page={page} controller={controller} snapshot={snapshot} scrollMemory={unitsScrollMemory} resetToken={projectScrollToken} /></PageState>}
      {activeTab === "activity" && page && <PageState page={page} empty="No activity yet." onRetry={retry}><div className="project-domain-list">{(page.items as ActivityDto[]).map((event) => <article key={event.sequence}><strong>#{event.sequence} · {event.action}</strong><span>{event.entityType} · {event.entityId}</span><time dateTime={new Date(event.createdAt).toISOString()}>{formatTime(event.createdAt)}</time></article>)}<Pagination page={page} onLoad={() => { void controller.loadMore("activity"); }} onRetry={() => { void controller.retryPage("activity"); }} /></div></PageState>}
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

function ConnectedProjectScreen({ project, rootEpoch, controller }: { project: ProjectSummary; rootEpoch: number; controller: ProjectScreenController }) {
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
    compositions: new Map<string, number>(),
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
      compositions: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.compositions : new Map<string, number>(),
    };
    setOwnedScroll(currentScroll);
  }
  const overviewScroll = useRememberedScroll(currentScroll.overview, "overview", projectScrollToken);
  return <ProjectScreenView project={project} rootEpoch={rootEpoch} controller={controller} snapshot={snapshot} scrollMemory={currentScroll.media} documentsScrollMemory={currentScroll.documents} compositionsScrollMemory={currentScroll.compositions} unitsScrollMemory={currentScroll.units} overviewScroll={overviewScroll} />;
}

export function ProjectScreen({
  project,
  rootEpoch,
  activitySequence,
}: {
  project: ProjectSummary;
  rootEpoch: number;
  activitySequence: number;
}) {
  const [controller, setController] = useState<ProjectScreenController | null>(null);
  useEffect(
    () => startProjectScreenController(bridge, project, activitySequence, setController),
    [project.projectId, project.workspaceId, rootEpoch],
  );
  useEffect(() => { void controller?.refresh(activitySequence); }, [activitySequence, controller]);
  return controller
    ? <ConnectedProjectScreen project={project} rootEpoch={rootEpoch} controller={controller} />
    : <main className="main-region project-region"><div className="project-skeleton" role="status">Loading project overview…</div></main>;
}
