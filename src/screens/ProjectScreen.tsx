import { AlertCircle, FileText, ImageOff, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ActivityDto, DocumentDto, MediaCardDto, ProjectOverviewDto, RunObjectMediaCardDto, UnitDto } from "../../electron/ralphy/types";
import { VirtualAssetGrid, mediaCardName } from "../components/VirtualAssetGrid";
import { MarkdownView } from "../components/MarkdownView";
import { ProjectControls } from "../components/ProjectControls";
import { ProjectHeader } from "../components/ProjectHeader";
import { AudioWaveform } from "../components/media/AudioWaveform";
import { ImageViewport } from "../components/media/ImageViewport";
import { VideoPlayer } from "../components/media/VideoPlayer";
import { CompositionsPanel } from "./project/CompositionsPanel";
import { MediaViewer } from "./project/MediaViewer";
import { useRememberedScroll } from "./project/scroll-memory";
import { bridge, type ProjectMediaFilter, type ProjectSummary } from "../lib/ipc";
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

function RecentSection({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return <section className="content-section project-domain-card"><div className="section-heading"><h3>{title}</h3><span>Recent records (bounded)</span></div>{empty ? <div className="empty-section">None returned.</div> : <div className="project-domain-list overview-records">{children}</div>}</section>;
}

function Overview({ value }: { value: ProjectOverviewDto }) {
  const documents = value.documents?.items ?? [];
  const iterations = value.iterations?.items ?? [];
  const feedback = value.feedback?.items ?? [];
  const stages = value.stages?.items ?? [];
  const compositions = value.compositions?.items ?? [];
  const builds = value.builds?.items ?? [];
  const units = value.units?.items ?? [];
  const runs = value.runs?.items ?? [];
  const activity = value.activity?.items ?? [];
  const publications = value.publications?.items ?? [];
  const metrics = value.metrics;
  return <div className="project-overview">
    <section className="content-section project-domain-card"><div className="section-heading"><h3>Current state</h3><span>{value.project.state}</span></div><dl className="overview-facts"><div><dt>Project ID</dt><dd>{value.project.id}</dd></div><div><dt>Purpose</dt><dd>{value.project.purpose ?? "Purpose not provided"}</dd></div><div><dt>Updated</dt><dd>{formatTime(value.project.updatedAt)}</dd></div><div><dt>Current iteration</dt><dd>{iterations.find((item) => item.state === "active")?.title ?? "None returned"}</dd></div></dl></section>
    <section className="content-section project-domain-card"><div className="section-heading"><h3>Media totals</h3><span>Complete domain counts</span></div><div className="overview-counts"><div><strong>{value.mediaCounts?.artifacts ?? 0}</strong><span>Artifacts</span></div><div><strong>{value.mediaCounts?.runObjects ?? 0}</strong><span>Run objects</span></div><div><strong>{value.mediaCounts?.objects ?? 0}</strong><span>Objects</span></div></div></section>
    <section className="content-section project-domain-card"><div className="section-heading"><h3>Publication metrics</h3><span>Complete domain totals</span></div><div className="metrics-band project-metrics" aria-label="Project metrics"><div className="metric"><span className="metric-value">{metrics?.publicationCount ?? "—"}</span><span className="metric-label">Publications</span></div><div className="metric"><span className="metric-value">{metrics?.views ?? "—"}</span><span className="metric-label">Views</span></div><div className="metric"><span className="metric-value">{metrics?.likes ?? "—"}</span><span className="metric-label">Likes</span></div><div className="metric"><span className="metric-value">{metrics?.comments ?? "—"}</span><span className="metric-label">Comments</span></div><div className="metric"><span className="metric-value">{metrics?.shares ?? "—"}</span><span className="metric-label">Shares</span></div><div className="metric"><span className="metric-value">{metrics?.watchTimeMs ?? "—"}</span><span className="metric-label">Watch time (ms)</span></div></div></section>
    <RecentSection title="Iterations and feedback" empty={iterations.length + feedback.length === 0}>
      {iterations.map((item) => <article key={item.id}><strong>Iteration {item.number} · {item.title}</strong><span>{item.state}</span><small>{item.priorIterationChanges ?? "No prior iteration changes"}</small><small>Created {formatTime(item.createdAt)}{item.closedAt ? ` · Closed ${formatTime(item.closedAt)}` : ""}</small></article>)}
      {feedback.map((item) => <article key={item.id}><strong>Feedback · {item.status}</strong><span>{item.targetType && item.targetId ? `${item.targetType} · ${item.targetId}` : "Project feedback"}</span><small>Iteration {item.iterationId} · {formatTime(item.createdAt)}</small></article>)}
    </RecentSection>
    <RecentSection title="Stages" empty={stages.length === 0}>{stages.map((item) => <article key={item.id}><strong>{item.stage} · {item.state}</strong><span>{item.entityType && item.entityId ? `${item.entityType} · ${item.entityId}` : "No bound entity"}</span><small>Updated {formatTime(item.updatedAt)} · revision {item.rowVersion}</small></article>)}</RecentSection>
    <RecentSection title="Documents" empty={documents.length === 0}>{documents.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.kind} · Current {item.currentRevisionId ?? "None"}</span><small>{item.binding ? `Bound ${item.binding.boundRevisionId} · Current ${item.binding.currentHeadRevisionId ?? "None"}${item.binding.hasNewerHead ? " · Newer head available" : ""}` : "Not bound"}</small></article>)}</RecentSection>
    <RecentSection title="Compositions and builds" empty={compositions.length + builds.length === 0}>
      {compositions.map((item) => <article key={item.id}><strong>{item.slug}</strong><span>{item.kind}</span><small>Selected {item.selectedRevisionId ?? "None"} · Latest {item.latestRevisionId ?? "None"}</small></article>)}
      {builds.map((item) => <article key={item.id}><strong>Build {item.id}</strong><span>{item.state}</span><small>Composition {item.compositionRevisionId} · Run {item.runId ?? "None"}</small></article>)}
    </RecentSection>
    <RecentSection title="Units" empty={units.length === 0}>{units.map((item) => <article key={item.id}><strong>{item.slug}</strong><span>{item.format}</span><small>Selected {item.selectedRevisionId ?? "None"} · Latest {item.latestRevisionId ?? "None"}</small></article>)}</RecentSection>
    <RecentSection title="Working runs" empty={runs.length === 0}>{runs.map((item) => <article key={item.id}><strong>{item.label ?? item.id} · {item.kind} · {item.state}</strong><span>Run {item.id}</span><small>Created {formatTime(item.createdAt)}{item.startedAt ? ` · Started ${formatTime(item.startedAt)}` : ""}</small></article>)}</RecentSection>
    <section className="content-section project-domain-card"><div className="section-heading"><h3>Publications</h3><span>Recent publications (bounded)</span></div>{publications.length === 0 ? <div className="empty-section">No publications returned.</div> : <div className="project-domain-list overview-records">{publications.map((item) => <article key={item.id}><strong>{item.platform} · {item.state}</strong><span>{item.rail}</span><small>{item.url ?? "No URL returned"}</small><small>Created {formatTime(item.createdAt)} · Updated {formatTime(item.updatedAt)}{item.scheduledAt ? ` · Scheduled ${formatTime(item.scheduledAt)}` : ""}{item.submittedAt ? ` · Submitted ${formatTime(item.submittedAt)}` : ""}{item.publishedAt ? ` · Published ${formatTime(item.publishedAt)}` : ""}</small></article>)}</div>}</section>
    <RecentSection title="Activity" empty={activity.length === 0}>{activity.map((item) => <article key={item.sequence}><strong>#{item.sequence} · {item.action}</strong><span>{item.entityType} · {item.entityId}</span><time dateTime={new Date(item.createdAt).toISOString()}>{formatTime(item.createdAt)}</time></article>)}</RecentSection>
  </div>;
}

function RunObjectEvidence({ card }: { card: RunObjectMediaCardDto }) {
  return <section className="run-object-evidence" aria-label="RunObject evidence"><h3>RunObject evidence</h3><dl><div><dt>Run ID</dt><dd>{card.runId}</dd></div><div><dt>Attempt</dt><dd>Unlinked</dd></div><div><dt>Purpose</dt><dd>{card.purpose}</dd></div><div><dt>State</dt><dd>{card.state}</dd></div><div><dt>Retention</dt><dd>{card.retention}</dd></div><div><dt>Logical path</dt><dd>{card.logicalPath}</dd></div><div><dt>Location class</dt><dd>{card.locationClass}</dd></div><div><dt>Object ID</dt><dd>{card.objectId ?? "Not promoted"}</dd></div></dl></section>;
}

function isRunObjectMediaCard(card: MediaCardDto): card is RunObjectMediaCardDto {
  return card.ref.type === "run-object";
}

function MediaPreview({ snapshot }: { snapshot: ProjectScreenSnapshot }) {
  const { selectedMedia } = snapshot;
  const preview = snapshot.domain.preview;
  if (!selectedMedia) return <div className="empty-section">Select media to preview it.</div>;
  const evidence = isRunObjectMediaCard(selectedMedia) ? <RunObjectEvidence card={selectedMedia} /> : null;
  let content: React.ReactNode = null;
  if (preview.status === "loading") content = <div className="project-skeleton" role="status">Loading preview…</div>;
  else if (preview.status === "error") content = <div className="preview-unavailable" role="alert"><ImageOff size={24} aria-hidden="true" /><strong>Preview unavailable</strong><span>{preview.error}</span></div>;
  else if (preview.status === "ready" && preview.value === null) content = <div className="preview-unavailable"><ImageOff size={24} aria-hidden="true" /><strong>Preview needs review</strong><span>{selectedMedia.ref.type === "artifact" ? "Select an Artifact revision before previewing it." : "No preview target is available for this record."}</span></div>;
  else if (preview.status === "ready" && preview.value) {
    const name = mediaCardName(selectedMedia);
    if (selectedMedia.mime?.startsWith("image/")) content = <ImageViewport src={preview.value.url} name={name} />;
    else if (selectedMedia.mime?.startsWith("video/")) content = <VideoPlayer src={preview.value.url} name={name} />;
    else if (selectedMedia.mime?.startsWith("audio/")) content = <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} />;
    else content = <a href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
  }
  return <>{evidence}{content}</>;
}

function documentText(format: string, text: string): string {
  if (format !== "json") return text;
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

function DocumentPreview({ controller, snapshot }: { controller: ProjectScreenController; snapshot: ProjectScreenSnapshot }) {
  const { selectedDocument, documentPreview, documentDraft } = snapshot;
  const revision = selectedDocument?.currentRevision;
  return <section className="project-preview document-preview" aria-label="Document content">
    {!selectedDocument && <div className="empty-section">Select a document to open it.</div>}
    {revision && <p className="document-revision-meta">Revision {revision.revisionNo} · Parent {revision.parentRevisionId ?? "None"}{revision.iterationId ? ` · Iteration ${revision.iterationId}` : ""}</p>}
    {documentPreview.status === "loading" && <div className="project-skeleton" role="status">Loading document…</div>}
    {documentPreview.status === "error" && <ProjectError error={documentPreview.error} onRetry={() => { if (selectedDocument) void controller.openDocument(selectedDocument); }} />}
    {documentPreview.status === "ready" && documentPreview.value && <>{documentPreview.value.format === "markdown" ? <MarkdownView markdown={documentPreview.value.text} /> : <pre>{documentText(documentPreview.value.format, documentPreview.value.text)}</pre>}{documentPreview.value.truncated && <p>Preview truncated.</p>}</>}
    {documentDraft && <><label htmlFor="document-draft">Draft</label><textarea className="document-editor" id="document-draft" value={documentDraft.body} onChange={(event) => controller.setDocumentDraft(event.target.value)} /><button className="command-button" type="button" onClick={() => { void controller.saveDocument(); }}>Save revision</button></>}
    {snapshot.documentConflict && <p className="project-local-error" role="alert">{snapshot.documentConflict}</p>}
  </section>;
}

type ScrollBinding = ReturnType<typeof useRememberedScroll>;

export function ProjectScreenView({ project, rootEpoch = 0, controller, snapshot, scrollMemory = new Map<string, number>(), overviewScroll }: { project: ProjectSummary; rootEpoch?: number; controller: ProjectScreenController; snapshot: ProjectScreenSnapshot; scrollMemory?: Map<string, number>; overviewScroll?: ScrollBinding }) {
  const state = snapshot.domain;
  const activeTab = snapshot.activeTab;
  const page = activeTab === "overview" ? null : state.pages[activeTab];
  const media = state.pages.media.items as MediaCardDto[];
  const projectScrollToken = JSON.stringify([rootEpoch, state.project.workspaceId, state.project.projectId]);
  const mediaScrollToken = JSON.stringify([projectScrollToken, state.media.filter]);
  const mediaFilters: Array<[ProjectMediaFilter, string]> = [["all", "All"], ["references", "References"], ["working", "Working"], ["candidate", "Candidate"], ["approved", "Approved"], ["rejected", "Rejected"], ["superseded", "Superseded"], ["run-diagnostics", "Run diagnostics"], ["run-cache-temp", "Cache/temp RunObjects"], ["advanced-objects", "Advanced Objects"]];
  const retry = () => { void controller.retry(); };
  return <main className="main-region project-region">
    <ProjectHeader project={project} />
    <ProjectControls activeTab={activeTab} onSelect={(tab) => { void controller.selectTab(tab); }} />
    <div className={`project-domain-body${activeTab === "media" ? " is-media" : ""}`} role="tabpanel" id={`project-panel-${activeTab}`} aria-labelledby={`project-tab-${activeTab}`} ref={activeTab === "overview" ? overviewScroll?.ref : undefined} onScroll={activeTab === "overview" ? overviewScroll?.onScroll : undefined}>
      {activeTab === "overview" && (state.overview.status === "loading" ? <div className="project-skeleton" role="status">Loading project overview…</div> : state.overview.status === "error" ? <ProjectError error={state.overview.error} onRetry={retry} /> : state.overview.value ? <Overview value={state.overview.value as ProjectOverviewDto} /> : null)}
      {activeTab === "documents" && page && <PageState page={page} empty="No documents yet." onRetry={retry}><div className="project-split-view"><div className="project-domain-list"><form className="document-search" onSubmit={(event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get("query"); if (typeof query === "string") void controller.searchDocuments(query); }}><label htmlFor="document-search">Search documents</label><input id="document-search" name="query" type="search" defaultValue={snapshot.documentSearch.query} /><button className="command-button" type="submit">Search</button></form>{snapshot.documentSearch.status === "error" && <ProjectError error={snapshot.documentSearch.error} onRetry={() => { void controller.searchDocuments(snapshot.documentSearch.query); }} />}{snapshot.documentSearch.results.map((result) => <button type="button" className={snapshot.selectedDocument?.id === result.documentId ? "is-selected" : ""} key={result.revisionId} onClick={() => { void controller.openSearchResult(result); }}><FileText size={16} aria-hidden="true" /><span><strong>{result.documentTitle}</strong><small>{result.kind} · Revision {result.revisionNo}</small></span></button>)}{(page.items as DocumentDto[]).map((document) => <button type="button" className={snapshot.selectedDocument?.id === document.id ? "is-selected" : ""} key={document.id} onClick={() => { void controller.openDocument(document); }}><FileText size={16} aria-hidden="true" /><span><strong>{document.title}</strong><small>{document.kind} · {document.currentRevisionId ?? "No revision"}</small></span></button>)}<Pagination page={page} onLoad={() => { void controller.loadMore("documents"); }} onRetry={() => { void controller.retryPage("documents"); }} /></div><DocumentPreview controller={controller} snapshot={snapshot} /></div></PageState>}
      {activeTab === "media" && page && <><div className="media-domain-toolbar" aria-label="Media filters">{mediaFilters.map(([value, label]) => <button className={`filter-chip${state.media.filter === value ? " is-active" : ""}`} type="button" aria-pressed={state.media.filter === value} key={value} onClick={() => { void controller.setMediaFilter(value); }}>{label}</button>)}</div><PageState page={page} empty="No media yet." onRetry={retry}><div className="project-split-view"><div className="project-media-grid"><VirtualAssetGrid items={media} project={state.project} rootEpoch={rootEpoch} selectedRef={snapshot.selectedMedia?.ref ?? null} resolvePreview={bridge.resolveProjectPreview} onSelect={(card) => { void controller.openMedia(card); }} onOpen={(card) => { void controller.openMediaViewer(card); }} hasMore={page.nextCursor !== null} loadingMore={page.status === "loading" && page.items.length > 0} appendError={page.status === "error" && page.items.length > 0 ? page.error : null} onLoadMore={() => { void controller.loadMore("media"); }} onRetryAppend={() => { void controller.retryPage("media"); }} scrollMemory={scrollMemory} scrollKey="media" scrollResetToken={mediaScrollToken} /></div><section className="project-preview" aria-label="Media preview"><MediaPreview snapshot={snapshot} /></section></div></PageState></>}
      {activeTab === "compositions" && page && <PageState page={page} empty="No compositions yet." onRetry={retry}><CompositionsPanel page={page} controller={controller} snapshot={snapshot} pagination={<Pagination page={page} onLoad={() => { void controller.loadMore("compositions"); }} onRetry={() => { void controller.retryPage("compositions"); }} />} /></PageState>}
      {activeTab === "units" && page && <PageState page={page} empty="No units yet." onRetry={retry}><div className="project-domain-list">{(page.items as UnitDto[]).map((item) => <article key={item.id}><strong>{item.slug}</strong><span>{item.format}</span><small>ID {item.id} · Selected {item.selectedRevisionId ?? "None"} · Latest {item.latestRevisionId ?? "None"}</small></article>)}<Pagination page={page} onLoad={() => { void controller.loadMore("units"); }} onRetry={() => { void controller.retryPage("units"); }} /></div></PageState>}
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
  const mediaScrollToken = JSON.stringify([projectScrollToken, snapshot.domain.media.filter]);
  const [ownedScroll, setOwnedScroll] = useState(() => ({
    projectScrollToken,
    mediaScrollToken,
    overview: new Map<string, number>(),
    media: new Map<string, number>(),
  }));
  let currentScroll = ownedScroll;
  if (ownedScroll.projectScrollToken !== projectScrollToken || ownedScroll.mediaScrollToken !== mediaScrollToken) {
    currentScroll = {
      projectScrollToken,
      mediaScrollToken,
      overview: ownedScroll.projectScrollToken === projectScrollToken ? ownedScroll.overview : new Map<string, number>(),
      media: new Map<string, number>(),
    };
    setOwnedScroll(currentScroll);
  }
  const overviewScroll = useRememberedScroll(currentScroll.overview, "overview", projectScrollToken);
  return <ProjectScreenView project={project} rootEpoch={rootEpoch} controller={controller} snapshot={snapshot} scrollMemory={currentScroll.media} overviewScroll={overviewScroll} />;
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
