import type { ArtifactMediaCardDto, ArtifactRevisionDto, DocumentDetailDto, DocumentDto, DocumentSearchDto, JsonValue, MediaCardDto, MediaGenerationDetailDto, MediaGenerationTarget } from "../../electron/ralphy/types";
import type { CompositionAggregate, CompositionOutputPreview } from "../../electron/ralphy/project-reader";
import type { MediaWorkbenchBridge, ProjectMediaFilter, ProjectSummary, ProjectTab } from "../../electron/media/types";
import { createProjectDomainState, projectDomainReducer, type DomainRow, type ProjectDomainState } from "./project-domain";

export type ProjectView = "overview" | ProjectTab;
export interface DocumentPreview {
  status: "idle" | "loading" | "ready" | "error";
  value: { revisionId: string; format: string; text: string; truncated: boolean } | null;
  error: string | null;
}
export interface DocumentDraft {
  format: "markdown" | "text" | "json";
  title: string | null;
  body: string;
}
export interface ProjectScreenSnapshot {
  domain: ProjectDomainState;
  activeTab: ProjectView;
  selectedDocument: DocumentDetailDto | null;
  documentPreview: DocumentPreview;
  documentSearch: { query: string; results: DocumentSearchDto[]; status: "idle" | "loading" | "ready" | "error"; error: string | null };
  documentDraft: DocumentDraft | null;
  documentConflict: string | null;
  selectedMedia: MediaCardDto | null;
  mediaViewerOpen: boolean;
  mediaGeneration: { status: "idle" | "loading" | "ready" | "error"; value: MediaGenerationDetailDto | null; error: string | null };
  mediaRevisions: { status: "idle" | "loading" | "ready" | "error"; items: ArtifactRevisionDto[]; error: string | null };
  compositionId: string | null;
  composition: { status: "idle" | "loading" | "ready" | "error"; value: CompositionAggregate | null; error: string | null };
  inspectedCompositionRevisionId: string | null;
  compositionPreview: { status: "idle" | "loading" | "ready" | "error"; value: CompositionOutputPreview | null; error: string | null; artifactRevisionId: string | null };
  compositionMutation: "idle" | "revise" | "select" | "build";
  compositionConflict: string | null;
  compositionMutationError: string | null;
}
export type ProjectScreenApi = Pick<MediaWorkbenchBridge, "loadProjectOverview" | "loadProjectPage" | "loadProjectMediaCard" | "loadProjectGeneration" | "loadProjectMediaRevisions" | "selectProjectMediaRevision" | "loadDocumentPreview" | "searchProjectDocuments" | "showProjectDocument" | "reviseProjectDocument" | "resolveProjectPreview" | "loadProjectComposition" | "reviseProjectComposition" | "selectProjectCompositionRevision" | "buildProjectComposition" | "resolveCompositionOutputPreview">;
export interface ProjectScreenController {
  getSnapshot(): ProjectScreenSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  refresh(sequence: number): Promise<void>;
  selectTab(tab: ProjectView): Promise<void>;
  loadMore(): Promise<void>;
  retry(): Promise<void>;
  openDocument(document: DocumentDto): Promise<void>;
  searchDocuments(query: string): Promise<void>;
  openSearchResult(result: DocumentSearchDto): Promise<void>;
  setDocumentDraft(body: string): void;
  saveDocument(): Promise<void>;
  openMedia(card: MediaCardDto): Promise<void>;
  openMediaViewer(card: MediaCardDto): Promise<void>;
  closeMediaViewer(): void;
  navigateMediaViewer(delta: number): Promise<void>;
  retryMediaPreview(): Promise<void>;
  retryMediaGeneration(): Promise<void>;
  retryMediaRevisions(): Promise<void>;
  selectMediaRevision(revisionId: string): Promise<void>;
  setMediaFilter(filter: ProjectMediaFilter): Promise<void>;
  openComposition(compositionId: string): Promise<void>;
  inspectCompositionRevision(revisionId: string): void;
  previewCompositionOutput(artifactRevisionId: string): Promise<void>;
  selectInspectedCompositionRevision(): Promise<void>;
  reviseSelectedComposition(): Promise<void>;
  buildInspectedCompositionRevision(): Promise<void>;
  dispose(): void;
}

const idleDocument: DocumentPreview = { status: "idle", value: null, error: null };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isConflict = (error: unknown): boolean => error !== null && typeof error === "object" && (error as { code?: unknown }).code === "E_CONFLICT";

function revisionBody(format: DocumentDraft["format"], body: string): JsonValue {
  if (format !== "json") return body;
  return JSON.parse(body) as JsonValue;
}

export function createProjectScreenController(
  api: ProjectScreenApi,
  project: ProjectSummary,
  initialActivitySequence = 0,
): ProjectScreenController {
  let snapshot: ProjectScreenSnapshot = {
    domain: createProjectDomainState({ workspaceId: project.workspaceId, projectId: project.projectId }),
    activeTab: "overview",
    selectedDocument: null,
    documentPreview: idleDocument,
    documentSearch: { query: "", results: [], status: "idle", error: null },
    documentDraft: null,
    documentConflict: null,
    selectedMedia: null,
    mediaViewerOpen: false,
    mediaGeneration: { status: "idle", value: null, error: null },
    mediaRevisions: { status: "idle", items: [], error: null },
    compositionId: null,
    composition: { status: "idle", value: null, error: null },
    inspectedCompositionRevisionId: null,
    compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    compositionMutation: "idle",
    compositionConflict: null,
    compositionMutationError: null,
  };
  let disposed = false;
  let request = 0;
  let overviewRequest = 0;
  let coveredActivitySequence = initialActivitySequence;
  let documentRequest = 0;
  let searchRequest = 0;
  let saveRequest = 0;
  let compositionRequest = 0;
  let compositionPreviewRequest = 0;
  let compositionMutationRequest = 0;
  let mediaPreviewRequest = 0;
  let mediaGenerationRequest = 0;
  let mediaRevisionRequest = 0;
  const listeners = new Set<() => void>();
  const emit = (next: ProjectScreenSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const reduce = (action: Parameters<typeof projectDomainReducer>[1]) => emit({ ...snapshot, domain: projectDomainReducer(snapshot.domain, action) });

  const loadOverview = async () => {
    const generation = snapshot.domain.generation;
    const requestId = ++overviewRequest;
    const projectRef = snapshot.domain.project;
    reduce({ type: "overview-loading", generation });
    try {
      const value = await api.loadProjectOverview(projectRef);
      if (disposed || requestId !== overviewRequest) return;
      reduce({ type: "overview-ready", generation, value });
    } catch (error) {
      if (disposed || requestId !== overviewRequest) return;
      reduce({ type: "overview-failed", generation, error: errorMessage(error) });
    }
  };

  const loadPage = async (tab: ProjectTab, append = false) => {
    const generation = snapshot.domain.generation;
    const page = snapshot.domain.pages[tab];
    const requestId = `page-${++request}`;
    const mediaFilter = tab === "media" ? snapshot.domain.media.filter : undefined;
    const projectRef = snapshot.domain.project;
    reduce({ type: "page-loading", tab, generation, requestId, mediaFilter });
    try {
      const value = await api.loadProjectPage({ tab, project: projectRef, ...(append ? { cursor: page.nextCursor } : {}), ...(mediaFilter ? { mediaFilter } : {}) });
      if (disposed) return;
      reduce({ type: "page-ready", tab, generation, requestId, mediaFilter, append, page: value as { items: DomainRow[]; nextCursor: string | number | null } });
      if (tab === "compositions" && !append && snapshot.domain.pages.compositions.requestId === requestId) {
        const compositionId = snapshot.compositionId ?? (value.items[0] as { id?: string } | undefined)?.id ?? null;
        if (compositionId) await loadComposition(compositionId, snapshot.inspectedCompositionRevisionId);
      }
    } catch (error) {
      reduce({ type: "page-failed", tab, generation, requestId, mediaFilter, error: errorMessage(error) });
    }
  };

  const loadDocument = async (documentId: string, retainedDraft: DocumentDraft | null = null, conflict: string | null = null) => {
    const requestId = ++documentRequest;
    saveRequest += 1;
    const projectRef = snapshot.domain.project;
    try {
      const document = await api.showProjectDocument(projectRef, documentId);
      if (documentRequest !== requestId) return;
      const revisionId = document.currentRevision?.id ?? document.currentRevisionId;
      emit({
        ...snapshot,
        selectedDocument: document,
        documentPreview: revisionId ? { status: "loading", value: null, error: null } : idleDocument,
        documentDraft: retainedDraft ?? (revisionId ? null : { format: "markdown", title: null, body: "" }),
        documentConflict: conflict,
      });
      if (!revisionId) return;
      const value = await api.loadDocumentPreview(projectRef, revisionId);
      if (documentRequest === requestId) emit({
        ...snapshot,
        documentPreview: { status: "ready", value, error: null },
        documentDraft: retainedDraft ?? { format: value.format as DocumentDraft["format"], title: document.currentRevision?.title ?? null, body: value.text },
      });
    } catch (error) {
      if (documentRequest === requestId) emit({ ...snapshot, documentPreview: { status: "error", value: null, error: errorMessage(error) } });
    }
  };

  const loadComposition = async (compositionId: string, inspectedRevisionId: string | null = null, conflict: string | null = null) => {
    const requestId = ++compositionRequest;
    const projectRef = snapshot.domain.project;
    emit({
      ...snapshot,
      compositionId,
      composition: { status: "loading", value: null, error: null },
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
      compositionConflict: conflict,
      compositionMutationError: null,
    });
    try {
      const value = await api.loadProjectComposition(projectRef, compositionId);
      if (disposed || requestId !== compositionRequest || snapshot.compositionId !== compositionId) return;
      const preferred = inspectedRevisionId ?? value.selectedRevisionId ?? value.latestRevisionId;
      const inspected = preferred && value.revisions.some(({ id }) => id === preferred)
        ? preferred
        : value.revisions[0]?.id ?? null;
      emit({ ...snapshot, composition: { status: "ready", value, error: null }, inspectedCompositionRevisionId: inspected, compositionConflict: conflict });
    } catch (error) {
      if (disposed || requestId !== compositionRequest || snapshot.compositionId !== compositionId) return;
      emit({ ...snapshot, composition: { status: "error", value: null, error: errorMessage(error) } });
    }
  };

  const runCompositionMutation = async (kind: "revise" | "select" | "build", run: (value: CompositionAggregate) => Promise<unknown>) => {
    const value = snapshot.composition.value;
    if (!value || snapshot.compositionMutation !== "idle") return;
    const requestId = ++compositionMutationRequest;
    const compositionId = value.id;
    const inspected = snapshot.inspectedCompositionRevisionId;
    emit({ ...snapshot, compositionMutation: kind, compositionConflict: null, compositionMutationError: null });
    try {
      await run(value);
      if (disposed || requestId !== compositionMutationRequest || snapshot.compositionId !== compositionId) return;
      await loadComposition(compositionId, inspected);
      if (!disposed && requestId === compositionMutationRequest && snapshot.compositionId === compositionId) emit({ ...snapshot, compositionMutation: "idle" });
    } catch (error) {
      if (disposed || requestId !== compositionMutationRequest || snapshot.compositionId !== compositionId) return;
      if (isConflict(error)) {
        const conflict = kind === "select"
          ? "The selected revision changed elsewhere. Current pointer reloaded; click again to retry."
          : kind === "revise"
            ? "The latest revision changed elsewhere. Current pointer reloaded; click again to retry."
            : "The latest draft changed elsewhere. Current state reloaded; click again to retry.";
        await loadComposition(compositionId, inspected, conflict);
        if (!disposed && requestId === compositionMutationRequest && snapshot.compositionId === compositionId) emit({ ...snapshot, compositionMutation: "idle" });
        return;
      }
      if (kind === "build") {
        const message = errorMessage(error);
        await loadComposition(compositionId, inspected);
        if (!disposed && requestId === compositionMutationRequest && snapshot.compositionId === compositionId) {
          emit({ ...snapshot, compositionMutation: "idle", compositionMutationError: message });
        }
        return;
      }
      emit({ ...snapshot, compositionMutation: "idle", compositionMutationError: errorMessage(error) });
    }
  };

  const sameMedia = (left: MediaCardDto | null, right: MediaCardDto): boolean => left?.ref.type === right.ref.type && left.ref.id === right.ref.id;
  const isArtifactMedia = (card: MediaCardDto): card is ArtifactMediaCardDto => card.ref.type === "artifact";
  const loadedMedia = (card: MediaCardDto): MediaCardDto | null => (
    snapshot.domain.pages.media.items as MediaCardDto[]
  ).find((item) => sameMedia(item, card)) ?? null;
  const generationTarget = (card: MediaCardDto): MediaGenerationTarget | null => {
    if (isArtifactMedia(card)) return card.selectedRevisionId ? { type: "artifact-revision", id: card.selectedRevisionId } : null;
    if (card.ref.type === "run-object") return { type: "run-object", id: card.ref.id };
    return null;
  };
  const resetPreview = () => ({ ...snapshot.domain, preview: { status: "idle" as const, value: null, error: null, requestId: null } });
  const replaceLoadedMedia = (card: MediaCardDto) => {
    const page = snapshot.domain.pages.media;
    emit({
      ...snapshot,
      selectedMedia: card,
      domain: {
        ...snapshot.domain,
        pages: {
          ...snapshot.domain.pages,
          media: { ...page, items: (page.items as MediaCardDto[]).map((item) => sameMedia(item, card) ? card : item) },
        },
      },
    });
  };
  const loadMediaPreview = async (card: MediaCardDto) => {
    const requestId = ++mediaPreviewRequest;
    const generation = snapshot.domain.generation;
    reduce({ type: "preview-loading", generation, requestId: `viewer-preview-${requestId}` });
    try {
      const value = await api.resolveProjectPreview(snapshot.domain.project, card.ref);
      if (disposed || requestId !== mediaPreviewRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
      reduce({ type: "preview-ready", generation, requestId: `viewer-preview-${requestId}`, value });
    } catch (error) {
      if (disposed || requestId !== mediaPreviewRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
      reduce({ type: "preview-failed", generation, requestId: `viewer-preview-${requestId}`, error: errorMessage(error) });
    }
  };
  const loadMediaGeneration = async (card: MediaCardDto) => {
    const target = generationTarget(card);
    const requestId = ++mediaGenerationRequest;
    if (!target) {
      emit({ ...snapshot, mediaGeneration: { status: "ready", value: null, error: null } });
      return;
    }
    emit({ ...snapshot, mediaGeneration: { status: "loading", value: null, error: null } });
    try {
      const value = await api.loadProjectGeneration(snapshot.domain.project, target);
      if (disposed || requestId !== mediaGenerationRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
      emit({ ...snapshot, mediaGeneration: { status: "ready", value, error: null } });
    } catch (error) {
      if (disposed || requestId !== mediaGenerationRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
      emit({ ...snapshot, mediaGeneration: { status: "error", value: null, error: errorMessage(error) } });
    }
  };
  const loadMediaRevisions = async (card: MediaCardDto, conflict: string | null = null) => {
    const requestId = ++mediaRevisionRequest;
    if (!isArtifactMedia(card)) {
      emit({ ...snapshot, mediaRevisions: { status: "idle", items: [], error: null } });
      return;
    }
    emit({ ...snapshot, mediaRevisions: { status: "loading", items: [], error: conflict } });
    try {
      const page = await api.loadProjectMediaRevisions(snapshot.domain.project, card.ref.id);
      if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
      emit({ ...snapshot, mediaRevisions: { status: "ready", items: page.items, error: conflict } });
    } catch (error) {
      if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
      emit({ ...snapshot, mediaRevisions: { status: "error", items: [], error: errorMessage(error) } });
    }
  };
  const openLoadedMediaViewer = async (card: MediaCardDto) => {
    mediaPreviewRequest += 1;
    mediaGenerationRequest += 1;
    mediaRevisionRequest += 1;
    emit({
      ...snapshot,
      selectedMedia: card,
      mediaViewerOpen: true,
      mediaGeneration: { status: "idle", value: null, error: null },
      mediaRevisions: { status: "idle", items: [], error: null },
      domain: resetPreview(),
    });
    if (isArtifactMedia(card) && !card.selectedRevisionId) {
      await loadMediaRevisions(card);
      return;
    }
    await Promise.all([
      loadMediaPreview(card),
      loadMediaGeneration(card),
      ...(isArtifactMedia(card) ? [loadMediaRevisions(card)] : []),
    ]);
  };

  const controller: ProjectScreenController = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() { if (snapshot.domain.overview.status === "idle") await loadOverview(); },
    async refresh(sequence) {
      if (disposed || sequence <= coveredActivitySequence) return;
      coveredActivitySequence = sequence;
      const activeTab = snapshot.activeTab;
      await Promise.all([
        loadOverview(),
        ...(activeTab === "overview" ? [] : [loadPage(activeTab)]),
      ]);
    },
    async selectTab(tab) {
      emit({ ...snapshot, activeTab: tab });
      if (tab !== "overview" && snapshot.domain.pages[tab].status === "idle") await loadPage(tab);
    },
    async loadMore() {
      if (snapshot.activeTab !== "overview") await loadPage(snapshot.activeTab, snapshot.domain.pages[snapshot.activeTab].items.length > 0);
    },
    async retry() {
      if (snapshot.activeTab === "overview") await loadOverview();
      else await loadPage(snapshot.activeTab, snapshot.domain.pages[snapshot.activeTab].items.length > 0);
    },
    async openDocument(document) { await loadDocument(document.id); },
    async searchDocuments(query) {
      const requestId = ++searchRequest;
      const projectRef = snapshot.domain.project;
      emit({ ...snapshot, documentSearch: { query, results: [], status: "loading", error: null } });
      try {
        const page = await api.searchProjectDocuments(projectRef, query);
        if (searchRequest !== requestId) return;
        emit({ ...snapshot, documentSearch: { query, results: page.items, status: "ready", error: null } });
      } catch (error) {
        if (searchRequest !== requestId) return;
        emit({ ...snapshot, documentSearch: { query, results: [], status: "error", error: errorMessage(error) } });
      }
    },
    async openSearchResult(result) { await loadDocument(result.documentId); },
    setDocumentDraft(body) {
      if (snapshot.documentDraft) emit({ ...snapshot, documentDraft: { ...snapshot.documentDraft, body }, documentConflict: null });
    },
    async saveDocument() {
      const document = snapshot.selectedDocument;
      const draft = snapshot.documentDraft;
      if (!document || !draft) return;
      const requestId = ++saveRequest;
      const projectRef = snapshot.domain.project;
      try {
        const revision = await api.reviseProjectDocument(projectRef, {
          documentId: document.id,
          expectedHeadId: document.currentRevisionId,
          format: draft.format,
          ...(draft.title === null ? {} : { title: draft.title }),
          body: revisionBody(draft.format, draft.body),
        });
        if (saveRequest !== requestId || snapshot.selectedDocument?.id !== document.id) return;
        const selectedDocument = { ...document, currentRevisionId: revision.id, currentRevision: revision };
        emit({ ...snapshot, selectedDocument, documentPreview: { status: "ready", value: { revisionId: revision.id, format: revision.format, text: draft.body, truncated: false }, error: null }, documentConflict: null });
      } catch (error) {
        if (saveRequest !== requestId || snapshot.selectedDocument?.id !== document.id) return;
        if (isConflict(error)) {
          await loadDocument(document.id, draft, "The document changed elsewhere. Current head reloaded; your local draft was kept.");
          return;
        }
        emit({ ...snapshot, documentConflict: errorMessage(error) });
      }
    },
    async openMedia(card) {
      const generation = snapshot.domain.generation;
      const id = ++mediaPreviewRequest;
      const requestId = `preview-${id}`;
      emit({ ...snapshot, selectedMedia: card });
      reduce({ type: "preview-loading", generation, requestId });
      try {
        const value = await api.resolveProjectPreview(snapshot.domain.project, card.ref);
        if (disposed || id !== mediaPreviewRequest || !sameMedia(snapshot.selectedMedia, card)) return;
        reduce({ type: "preview-ready", generation, requestId, value });
      } catch (error) {
        if (disposed || id !== mediaPreviewRequest || !sameMedia(snapshot.selectedMedia, card)) return;
        reduce({ type: "preview-failed", generation, requestId, error: errorMessage(error) });
      }
    },
    async openMediaViewer(card) {
      const loaded = loadedMedia(card);
      if (loaded) await openLoadedMediaViewer(loaded);
    },
    closeMediaViewer() {
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
      mediaRevisionRequest += 1;
      emit({
        ...snapshot,
        mediaViewerOpen: false,
        mediaGeneration: { status: "idle", value: null, error: null },
        mediaRevisions: { status: "idle", items: [], error: null },
        domain: resetPreview(),
      });
    },
    async navigateMediaViewer(delta) {
      if (!snapshot.mediaViewerOpen || !snapshot.selectedMedia || delta === 0) return;
      const items = snapshot.domain.pages.media.items as MediaCardDto[];
      const index = items.findIndex((item) => sameMedia(item, snapshot.selectedMedia!));
      const next = items[index + Math.sign(delta)];
      if (next) await openLoadedMediaViewer(next);
    },
    async retryMediaPreview() {
      const card = snapshot.selectedMedia;
      if (snapshot.mediaViewerOpen && card && !(isArtifactMedia(card) && !card.selectedRevisionId)) await loadMediaPreview(card);
    },
    async retryMediaGeneration() {
      const card = snapshot.selectedMedia;
      if (snapshot.mediaViewerOpen && card && generationTarget(card)) await loadMediaGeneration(card);
    },
    async retryMediaRevisions() {
      const card = snapshot.selectedMedia;
      if (snapshot.mediaViewerOpen && card && isArtifactMedia(card)) await loadMediaRevisions(card);
    },
    async selectMediaRevision(revisionId) {
      const card = snapshot.selectedMedia;
      if (!snapshot.mediaViewerOpen || !card || !isArtifactMedia(card) || !snapshot.mediaRevisions.items.some(({ id }) => id === revisionId)) return;
      const requestId = ++mediaRevisionRequest;
      emit({ ...snapshot, mediaRevisions: { ...snapshot.mediaRevisions, status: "loading", error: null } });
      try {
        const refreshed = await api.selectProjectMediaRevision(snapshot.domain.project, card.ref.id, revisionId, card.selectedRevisionId);
        if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
        replaceLoadedMedia(refreshed);
        await openLoadedMediaViewer(refreshed);
      } catch (error) {
        if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
        if (!isConflict(error)) {
          emit({ ...snapshot, mediaRevisions: { ...snapshot.mediaRevisions, status: "error", error: errorMessage(error) } });
          return;
        }
        const conflict = "The selected revision changed elsewhere. Current card and revisions reloaded; select again to retry.";
        try {
          const [refreshed, revisions] = await Promise.all([
            api.loadProjectMediaCard(snapshot.domain.project, card.ref),
            api.loadProjectMediaRevisions(snapshot.domain.project, card.ref.id),
          ]);
          if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, card)) return;
          replaceLoadedMedia(refreshed);
          if (isArtifactMedia(refreshed) && refreshed.selectedRevisionId) {
            await Promise.all([loadMediaPreview(refreshed), loadMediaGeneration(refreshed)]);
          }
          if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen || !sameMedia(snapshot.selectedMedia, refreshed)) return;
          emit({ ...snapshot, mediaRevisions: { status: "ready", items: revisions.items, error: conflict } });
        } catch (reloadError) {
          if (disposed || requestId !== mediaRevisionRequest || !snapshot.mediaViewerOpen) return;
          emit({ ...snapshot, mediaRevisions: { status: "error", items: [], error: errorMessage(reloadError) } });
        }
      }
    },
    async setMediaFilter(filter) {
      if (filter === snapshot.domain.media.filter) return;
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
      mediaRevisionRequest += 1;
      emit({ ...snapshot, selectedMedia: null, mediaViewerOpen: false, mediaGeneration: { status: "idle", value: null, error: null }, mediaRevisions: { status: "idle", items: [], error: null } });
      reduce({ type: "media-filter", filter });
      if (snapshot.activeTab === "media") await loadPage("media");
    },
    async openComposition(compositionId) {
      compositionMutationRequest += 1;
      emit({ ...snapshot, compositionMutation: "idle", compositionConflict: null, compositionMutationError: null });
      await loadComposition(compositionId);
    },
    inspectCompositionRevision(revisionId) {
      const value = snapshot.composition.value;
      if (!value?.revisions.some(({ id }) => id === revisionId)) return;
      compositionPreviewRequest += 1;
      emit({ ...snapshot, inspectedCompositionRevisionId: revisionId, compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null }, compositionConflict: null, compositionMutationError: null });
    },
    async previewCompositionOutput(artifactRevisionId) {
      const value = snapshot.composition.value;
      const inspected = value?.revisions.find(({ id }) => id === snapshot.inspectedCompositionRevisionId);
      if (!value || !inspected?.builds.some((build) => build.outputs.some((output) => output.artifactRevisionId === artifactRevisionId))) return;
      const requestId = ++compositionPreviewRequest;
      const compositionId = value.id;
      emit({ ...snapshot, compositionPreview: { status: "loading", value: null, error: null, artifactRevisionId } });
      try {
        const preview = await api.resolveCompositionOutputPreview(snapshot.domain.project, artifactRevisionId);
        if (disposed || requestId !== compositionPreviewRequest || snapshot.compositionId !== compositionId) return;
        emit({ ...snapshot, compositionPreview: { status: "ready", value: preview, error: null, artifactRevisionId } });
      } catch (error) {
        if (disposed || requestId !== compositionPreviewRequest || snapshot.compositionId !== compositionId) return;
        emit({ ...snapshot, compositionPreview: { status: "error", value: null, error: errorMessage(error), artifactRevisionId } });
      }
    },
    async selectInspectedCompositionRevision() {
      const revisionId = snapshot.inspectedCompositionRevisionId;
      const value = snapshot.composition.value;
      const revision = value?.revisions.find(({ id }) => id === revisionId);
      if (!value || !revisionId || revision?.state !== "sealed" || revisionId === value.selectedRevisionId) return;
      await runCompositionMutation("select", () => api.selectProjectCompositionRevision(snapshot.domain.project, {
        compositionId: value.id,
        revisionId,
        expectedSelectedRevisionId: value.selectedRevisionId,
      }));
    },
    async reviseSelectedComposition() {
      const value = snapshot.composition.value;
      const latest = value?.revisions.find(({ id }) => id === value.latestRevisionId);
      if (!value || !latest) return;
      await runCompositionMutation("revise", () => api.reviseProjectComposition(snapshot.domain.project, {
        compositionId: value.id,
        expectedLatestRevisionId: value.latestRevisionId,
        parentRevisionId: latest.id,
        iterationId: latest.iterationId,
        engine: latest.engine,
        engineVersion: latest.engineVersion,
      }));
    },
    async buildInspectedCompositionRevision() {
      const value = snapshot.composition.value;
      const revision = value?.revisions.find(({ id }) => id === snapshot.inspectedCompositionRevisionId);
      if (!value || !revision || revision.id !== value.latestRevisionId || revision.state !== "draft") return;
      await runCompositionMutation("build", () => api.buildProjectComposition(snapshot.domain.project, revision.id));
    },
    dispose() {
      disposed = true;
      overviewRequest += 1;
      documentRequest += 1;
      searchRequest += 1;
      saveRequest += 1;
      compositionRequest += 1;
      compositionPreviewRequest += 1;
      compositionMutationRequest += 1;
      listeners.clear();
    },
  };
  return controller;
}
