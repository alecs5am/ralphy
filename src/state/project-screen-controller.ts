import type { ActivityDto, ArtifactMediaCardDto, ArtifactRevisionDto, BuildDto, BuildOutputDto, CompositionDto, CompositionInputDto, CompositionRevisionDto, CompositionSourceDto, DocumentDetailDto, DocumentDto, DocumentSearchDto, EvaluationDto, JsonValue, MediaCardDto, MediaGenerationDetailDto, MediaGenerationTarget, UnitDto, UnitItemDto, UnitPresentationDto, UnitRevisionDto } from "../../electron/ralphy/types";
import type { CompositionOutputPreview } from "../../electron/ralphy/project-reader";
import type { MediaWorkbenchBridge, ProjectMediaQuery, ProjectSummary, ProjectTab } from "../../electron/media/types";
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
export type UnitLoad<T> = {
  status: "idle" | "loading" | "ready" | "error";
  value: T | null;
  error: string | null;
};
export type UnitPage<T> = {
  status: "idle" | "loading" | "ready" | "error";
  items: T[];
  nextCursor: string | null;
  requestedCursor: string | null;
  error: string | null;
};
export interface ProjectScreenSnapshot {
  domain: ProjectDomainState;
  activeTab: ProjectView;
  selectedDocument: DocumentDetailDto | null;
  documentPreview: DocumentPreview;
  documentMode: "read" | "edit";
  documentSearch: { query: string; items: DocumentSearchDto[]; nextCursor: string | null; status: "idle" | "loading" | "ready" | "error"; appendError: string | null };
  documentDraft: DocumentDraft | null;
  documentDirty: boolean;
  documentSaving: boolean;
  documentConflict: string | null;
  documentConflictReview: boolean;
  selectedMedia: MediaCardDto | null;
  mediaViewerOpen: boolean;
  mediaGeneration: { status: "idle" | "loading" | "ready" | "error"; value: MediaGenerationDetailDto | null; error: string | null };
  mediaRevisions: { status: "idle" | "loading" | "ready" | "error"; items: ArtifactRevisionDto[]; error: string | null };
  compositionId: string | null;
  composition: UnitLoad<CompositionDto>;
  compositionRevisions: UnitPage<CompositionRevisionDto>;
  inspectedCompositionRevisionId: string | null;
  inspectedCompositionRevision: UnitLoad<CompositionRevisionDto>;
  compositionSources: UnitPage<CompositionSourceDto>;
  compositionInputs: UnitPage<CompositionInputDto>;
  compositionRevisionEvaluations: UnitPage<EvaluationDto>;
  compositionBuilds: UnitPage<BuildDto>;
  inspectedCompositionBuildId: string | null;
  inspectedCompositionBuild: UnitLoad<BuildDto>;
  compositionBuildOutputs: UnitPage<BuildOutputDto>;
  compositionBuildEvaluations: UnitPage<EvaluationDto>;
  compositionPreview: { status: "idle" | "loading" | "ready" | "error"; value: CompositionOutputPreview | null; error: string | null; artifactRevisionId: string | null };
  compositionMutation: "idle" | "revise" | "select" | "build";
  compositionConflict: string | null;
  compositionMutationError: string | null;
  unitId: string | null;
  unit: UnitLoad<UnitDto>;
  unitRevisions: UnitPage<UnitRevisionDto>;
  inspectedUnitRevisionId: string | null;
  inspectedUnitRevision: UnitLoad<UnitRevisionDto>;
  unitItems: UnitPage<UnitItemDto>;
  unitPresentations: UnitPage<UnitPresentationDto>;
  unitMutation: "idle" | "select";
  unitConflict: string | null;
  unitMutationError: string | null;
}
export type ProjectScreenApi = Pick<MediaWorkbenchBridge, "loadProjectOverview" | "loadProjectPage" | "loadProjectMediaCard" | "loadProjectGeneration" | "loadProjectMediaRevisions" | "selectProjectMediaRevision" | "loadDocumentPreview" | "searchProjectDocuments" | "showProjectDocument" | "reviseProjectDocument" | "resolveProjectPreview" | "loadProjectComposition" | "loadProjectCompositionRevision" | "loadProjectCompositionBuild" | "loadProjectCompositionPage" | "reviseProjectComposition" | "selectProjectCompositionRevision" | "buildProjectComposition" | "resolveCompositionOutputPreview" | "loadProjectUnit" | "loadProjectUnitRevision" | "loadProjectUnitPage" | "selectProjectUnitRevision">;
export interface ProjectScreenController {
  getSnapshot(): ProjectScreenSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  refresh(sequence: number): Promise<void>;
  selectTab(tab: ProjectView): Promise<void>;
  loadMore(tab: ProjectTab): Promise<void>;
  retryPage(tab: ProjectTab): Promise<void>;
  retry(): Promise<void>;
  openDocument(document: DocumentDto): Promise<void>;
  openDocumentById(documentId: string): Promise<void>;
  searchDocuments(query: string): Promise<void>;
  clearDocumentSearch(): void;
  loadMoreDocumentSearch(): Promise<void>;
  retryDocumentSearchAppend(): Promise<void>;
  openSearchResult(result: DocumentSearchDto): Promise<void>;
  beginDocumentEdit(): void;
  cancelDocumentEdit(): void;
  setDocumentDraftBody(body: string): void;
  setDocumentDraftTitle(title: string): void;
  setDocumentDraftFormat(format: DocumentDraft["format"]): void;
  saveDocument(): Promise<void>;
  selectMedia(card: MediaCardDto): void;
  openMediaViewer(card: MediaCardDto): Promise<void>;
  closeMediaViewer(): void;
  navigateMediaViewer(delta: number): Promise<void>;
  retryMediaPreview(): Promise<void>;
  retryMediaGeneration(): Promise<void>;
  retryMediaRevisions(): Promise<void>;
  selectMediaRevision(revisionId: string): Promise<void>;
  setMediaQuery(patch: Partial<ProjectMediaQuery>): Promise<void>;
  openComposition(compositionId: string): Promise<void>;
  inspectCompositionRevision(revisionId: string): Promise<void>;
  loadMoreCompositionRevisions(): Promise<void>;
  loadMoreCompositionSources(): Promise<void>;
  loadMoreCompositionInputs(): Promise<void>;
  loadMoreCompositionRevisionEvaluations(): Promise<void>;
  loadMoreCompositionBuilds(): Promise<void>;
  loadMoreCompositionBuildOutputs(): Promise<void>;
  loadMoreCompositionBuildEvaluations(): Promise<void>;
  previewCompositionOutput(artifactRevisionId: string): Promise<void>;
  selectInspectedCompositionRevision(): Promise<void>;
  reviseSelectedComposition(): Promise<void>;
  buildInspectedCompositionRevision(): Promise<void>;
  openUnit(unitId: string): Promise<void>;
  loadMoreUnitRevisions(): Promise<void>;
  inspectUnitRevision(revisionId: string): Promise<void>;
  loadMoreUnitItems(): Promise<void>;
  loadMoreUnitPresentations(): Promise<void>;
  selectInspectedUnitRevision(): Promise<void>;
  dispose(): void;
}

const idleDocument: DocumentPreview = { status: "idle", value: null, error: null };
const idleUnitLoad = <T>(): UnitLoad<T> => ({ status: "idle", value: null, error: null });
const idleUnitPage = <T>(): UnitPage<T> => ({ status: "idle", items: [], nextCursor: null, requestedCursor: null, error: null });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isConflict = (error: unknown): boolean => error !== null && typeof error === "object" && (error as { code?: unknown }).code === "E_CONFLICT";

function revisionBody(format: DocumentDraft["format"], body: string): JsonValue {
  if (format !== "json") return body;
  try { return JSON.parse(body) as JsonValue; }
  catch { throw new Error("Document body must be valid JSON."); }
}

const sameDraft = (left: DocumentDraft, right: DocumentDraft): boolean => (
  left.format === right.format && left.title === right.title && left.body === right.body
);

function appendUnique<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map(({ id }) => id));
  return [...current, ...incoming.filter(({ id }) => !seen.has(id) && !!seen.add(id))];
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
    documentMode: "read",
    documentSearch: { query: "", items: [], nextCursor: null, status: "idle", appendError: null },
    documentDraft: null,
    documentDirty: false,
    documentSaving: false,
    documentConflict: null,
    documentConflictReview: false,
    selectedMedia: null,
    mediaViewerOpen: false,
    mediaGeneration: { status: "idle", value: null, error: null },
    mediaRevisions: { status: "idle", items: [], error: null },
    compositionId: null,
    composition: idleUnitLoad(),
    compositionRevisions: idleUnitPage(),
    inspectedCompositionRevisionId: null,
    inspectedCompositionRevision: idleUnitLoad(),
    compositionSources: idleUnitPage(),
    compositionInputs: idleUnitPage(),
    compositionRevisionEvaluations: idleUnitPage(),
    compositionBuilds: idleUnitPage(),
    inspectedCompositionBuildId: null,
    inspectedCompositionBuild: idleUnitLoad(),
    compositionBuildOutputs: idleUnitPage(),
    compositionBuildEvaluations: idleUnitPage(),
    compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    compositionMutation: "idle",
    compositionConflict: null,
    compositionMutationError: null,
    unitId: null,
    unit: idleUnitLoad(),
    unitRevisions: idleUnitPage(),
    inspectedUnitRevisionId: null,
    inspectedUnitRevision: idleUnitLoad(),
    unitItems: idleUnitPage(),
    unitPresentations: idleUnitPage(),
    unitMutation: "idle",
    unitConflict: null,
    unitMutationError: null,
  };
  let disposed = false;
  let request = 0;
  let overviewRequest = 0;
  let coveredActivitySequence = initialActivitySequence;
  let highestActivityAnnouncement = initialActivitySequence;
  let activityCatchupRequest = 0;
  let activityCatchupInFlight = false;
  let activityPageReady = false;
  const pendingActivity = new Map<number, ActivityDto>();
  let documentRequest = 0;
  let searchRequest = 0;
  let saveRequest = 0;
  let documentDraftBase: DocumentDraft | null = null;
  let compositionRequest = 0;
  let compositionRevisionRequest = 0;
  let compositionBuildRequest = 0;
  const compositionPageRequests = {
    revisions: 0, sources: 0, inputs: 0, "revision-evaluations": 0, builds: 0,
    "build-outputs": 0, "build-evaluations": 0,
  };
  let compositionPreviewRequest = 0;
  let compositionMutationRequest = 0;
  let mediaPreviewRequest = 0;
  let mediaGenerationRequest = 0;
  let mediaRevisionRequest = 0;
  let unitRequest = 0;
  let unitRevisionPageRequest = 0;
  let unitExactRevisionRequest = 0;
  let unitItemsRequest = 0;
  let unitPresentationsRequest = 0;
  let unitMutationRequest = 0;
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
    const mediaQuery = tab === "media" ? snapshot.domain.media : undefined;
    const mediaFilter = mediaQuery?.filter;
    const projectRef = snapshot.domain.project;
    reduce({ type: "page-loading", tab, generation, requestId, mediaFilter });
    try {
      const value = await api.loadProjectPage({ tab, project: projectRef, ...(append ? { cursor: page.nextCursor } : {}), ...(mediaQuery ? { mediaQuery } : {}) });
      if (disposed) return;
      if (tab === "activity" && append && page.nextCursor !== null && value.nextCursor === page.nextCursor) {
        throw new Error("Activity page cursor did not advance");
      }
      reduce({ type: "page-ready", tab, generation, requestId, mediaFilter, append, page: value as { items: DomainRow[]; nextCursor: string | number | null } });
      if (tab === "activity" && !append && snapshot.domain.pages.activity.requestId === requestId) {
        activityPageReady = true;
        if (pendingActivity.size > 0) {
          reduce({ type: "activity-merge", generation, items: [...pendingActivity.values()] });
          pendingActivity.clear();
        }
      }
      if (tab === "compositions" && !append && snapshot.domain.pages.compositions.requestId === requestId) {
        const compositionId = snapshot.compositionId ?? (value.items[0] as { id?: string } | undefined)?.id ?? null;
        if (compositionId) await loadComposition(compositionId, snapshot.inspectedCompositionRevisionId);
      }
    } catch (error) {
      reduce({ type: "page-failed", tab, generation, requestId, mediaFilter, error: errorMessage(error) });
    }
  };

  const mergeActivity = (items: ActivityDto[], generation: number) => {
    if (activityPageReady) reduce({ type: "activity-merge", generation, items });
    else for (const item of items) pendingActivity.set(item.sequence, item);
  };

  const catchUpActivity = async (announcedSequence: number) => {
    const requestId = ++activityCatchupRequest;
    const generation = snapshot.domain.generation;
    const projectRef = snapshot.domain.project;
    let cursor = coveredActivitySequence;
    activityCatchupInFlight = true;
    try {
      while (!disposed && requestId === activityCatchupRequest && cursor < announcedSequence) {
        const page = await api.loadProjectPage({ tab: "activity", project: projectRef, cursor });
        if (disposed || requestId !== activityCatchupRequest || generation !== snapshot.domain.generation) return;
        const next = page.nextCursor;
        if (next !== null && (typeof next !== "number" || !Number.isSafeInteger(next) || next <= cursor)) return;
        mergeActivity(page.items as ActivityDto[], generation);
        if (next === null) {
          coveredActivitySequence = Math.max(announcedSequence, ...page.items.map((item) => (item as ActivityDto).sequence));
          return;
        }
        cursor = next;
        coveredActivitySequence = next;
      }
    } catch {
      // A later announcement retries from the last proven cursor.
    } finally {
      if (requestId === activityCatchupRequest) activityCatchupInFlight = false;
    }
  };

  const loadDocument = async (documentId: string, retainedDraft: DocumentDraft | null = null, conflict: string | null = null, conflictReview = false) => {
    const requestId = ++documentRequest;
    saveRequest += 1;
    if (!retainedDraft) documentDraftBase = null;
    const currentDraft = retainedDraft ? snapshot.documentDraft : null;
    emit({
      ...snapshot,
      documentPreview: { status: "loading", value: null, error: null },
      documentMode: currentDraft ? "edit" : "read",
      documentDraft: currentDraft,
      documentDirty: currentDraft ? snapshot.documentDirty : false,
      documentSaving: true,
      documentConflict: conflict,
      documentConflictReview: false,
    });
    const projectRef = snapshot.domain.project;
    try {
      const document = await api.showProjectDocument(projectRef, documentId);
      if (disposed || documentRequest !== requestId) return;
      const revisionId = document.currentRevision?.id ?? document.currentRevisionId;
      const currentDraft = retainedDraft ? snapshot.documentDraft : null;
      emit({
        ...snapshot,
        selectedDocument: document,
        documentPreview: revisionId ? { status: "loading", value: null, error: null } : idleDocument,
        documentMode: currentDraft ? "edit" : "read",
        documentDraft: currentDraft,
        documentDirty: currentDraft !== null,
        documentSaving: revisionId !== null,
        documentConflict: conflict,
        documentConflictReview: false,
      });
      if (!revisionId) return;
      const value = await api.loadDocumentPreview(projectRef, revisionId);
      if (!disposed && documentRequest === requestId) {
        const currentDraft = snapshot.documentDraft;
        if (currentDraft) {
          const format = value.format === "json" || value.format === "text" || value.format === "markdown" ? value.format : "markdown";
          documentDraftBase = { format, title: document.currentRevision?.title ?? null, body: value.text };
        }
        emit({
          ...snapshot,
          documentPreview: { status: "ready", value, error: null },
          documentDirty: currentDraft && documentDraftBase ? !sameDraft(currentDraft, documentDraftBase) : false,
          documentSaving: false,
          documentConflictReview: conflictReview,
        });
      }
    } catch (error) {
      if (!disposed && documentRequest === requestId) emit({ ...snapshot, documentPreview: { status: "error", value: null, error: errorMessage(error) }, documentSaving: false, documentConflictReview: conflictReview });
    }
  };

  const loadDocumentSearch = async (query: string, append: boolean) => {
    const current = snapshot.documentSearch;
    const cursor = append ? current.nextCursor : null;
    if (append && (current.status !== "ready" || cursor === null)) return;
    const requestId = ++searchRequest;
    const projectRef = snapshot.domain.project;
    emit({
      ...snapshot,
      documentSearch: {
        query,
        items: append ? current.items : [],
        nextCursor: append ? cursor : null,
        status: "loading",
        appendError: null,
      },
    });
    try {
      const page = cursor === null
        ? await api.searchProjectDocuments(projectRef, query)
        : await api.searchProjectDocuments(projectRef, query, cursor);
      if (disposed || searchRequest !== requestId || snapshot.documentSearch.query !== query) return;
      if (append && page.nextCursor === cursor) throw new Error("Document search cursor did not advance");
      const items = append
        ? [...current.items, ...page.items.filter((item) => !current.items.some(({ revisionId }) => revisionId === item.revisionId))]
        : page.items;
      emit({ ...snapshot, documentSearch: { query, items, nextCursor: page.nextCursor, status: "ready", appendError: null } });
    } catch (error) {
      if (disposed || searchRequest !== requestId || snapshot.documentSearch.query !== query) return;
      emit({
        ...snapshot,
        documentSearch: {
          query,
          items: append ? current.items : [],
          nextCursor: append ? cursor : null,
          status: "error",
          appendError: errorMessage(error),
        },
      });
    }
  };

  const compositionPageKeys = {
    revisions: "compositionRevisions",
    sources: "compositionSources",
    inputs: "compositionInputs",
    "revision-evaluations": "compositionRevisionEvaluations",
    builds: "compositionBuilds",
    "build-outputs": "compositionBuildOutputs",
    "build-evaluations": "compositionBuildEvaluations",
  } as const;
  type CompositionPageKind = keyof typeof compositionPageKeys;

  const compositionParentCurrent = (kind: CompositionPageKind, parentId: string): boolean => (
    kind === "revisions" ? snapshot.compositionId === parentId
      : kind === "build-outputs" || kind === "build-evaluations"
        ? snapshot.inspectedCompositionBuildId === parentId
        : snapshot.inspectedCompositionRevisionId === parentId
  );

  const domainWithComposition = (value: CompositionDto): ProjectDomainState => {
    const compositions = snapshot.domain.pages.compositions;
    return { ...snapshot.domain, pages: { ...snapshot.domain.pages, compositions: { ...compositions, items: compositions.items.map((item) => item.id === value.id ? value : item) } } };
  };

  async function loadCompositionBuild(buildId: string): Promise<void> {
    const revisionId = snapshot.inspectedCompositionRevisionId;
    if (!revisionId) return;
    const requestId = ++compositionBuildRequest;
    compositionPreviewRequest += 1;
    compositionPageRequests["build-outputs"] += 1;
    compositionPageRequests["build-evaluations"] += 1;
    emit({
      ...snapshot,
      inspectedCompositionBuildId: buildId,
      inspectedCompositionBuild: { status: "loading", value: null, error: null },
      compositionBuildOutputs: idleUnitPage(),
      compositionBuildEvaluations: idleUnitPage(),
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    });
    try {
      const value = await api.loadProjectCompositionBuild(snapshot.domain.project, buildId);
      if (disposed || requestId !== compositionBuildRequest || snapshot.inspectedCompositionRevisionId !== revisionId
        || snapshot.inspectedCompositionBuildId !== buildId) return;
      if (value.compositionRevisionId !== revisionId) throw new Error("Invalid Composition Build");
      emit({ ...snapshot, inspectedCompositionBuild: { status: "ready", value, error: null } });
      await Promise.all([
        loadCompositionPage("build-outputs", buildId),
        loadCompositionPage("build-evaluations", buildId),
      ]);
    } catch (error) {
      if (!disposed && requestId === compositionBuildRequest && snapshot.inspectedCompositionBuildId === buildId) {
        emit({ ...snapshot, inspectedCompositionBuild: { status: "error", value: null, error: errorMessage(error) } });
      }
    }
  }

  async function loadCompositionPage(kind: CompositionPageKind, parentId: string, append = false): Promise<void> {
    const key = compositionPageKeys[kind];
    const current = snapshot[key] as UnitPage<{ id: string }>;
    const cursor = append ? current.nextCursor : null;
    if (append && (current.status === "loading" || cursor === null)) return;
    const requestId = ++compositionPageRequests[kind];
    const requestInput = kind === "revisions" ? { kind, compositionId: parentId, ...(cursor ? { cursor } : {}) }
      : kind === "build-outputs" || kind === "build-evaluations" ? { kind, buildId: parentId, ...(cursor ? { cursor } : {}) }
        : { kind, revisionId: parentId, ...(cursor ? { cursor } : {}) };
    emit({ ...snapshot, [key]: { status: "loading", items: append ? current.items : [], nextCursor: cursor, requestedCursor: cursor, error: null } } as ProjectScreenSnapshot);
    try {
      const page = await api.loadProjectCompositionPage(snapshot.domain.project, requestInput);
      if (disposed || requestId !== compositionPageRequests[kind] || !compositionParentCurrent(kind, parentId)) return;
      if (append && page.nextCursor === cursor) throw new Error("Composition page cursor did not advance");
      const items = append ? appendUnique(current.items, page.items) : page.items;
      emit({ ...snapshot, [key]: { status: "ready", items, nextCursor: page.nextCursor, requestedCursor: null, error: null } } as ProjectScreenSnapshot);
      if (kind === "builds" && !append) {
        const newest = (items as BuildDto[])[0];
        if (newest) await loadCompositionBuild(newest.id);
      }
    } catch (error) {
      if (disposed || requestId !== compositionPageRequests[kind] || !compositionParentCurrent(kind, parentId)) return;
      emit({ ...snapshot, [key]: { status: "error", items: append ? current.items : [], nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } } as ProjectScreenSnapshot);
    }
  }

  async function loadCompositionRevision(revisionId: string): Promise<void> {
    const compositionId = snapshot.compositionId;
    if (!compositionId) return;
    const requestId = ++compositionRevisionRequest;
    compositionPreviewRequest += 1;
    compositionBuildRequest += 1;
    for (const kind of ["sources", "inputs", "revision-evaluations", "builds", "build-outputs", "build-evaluations"] as const) compositionPageRequests[kind] += 1;
    emit({
      ...snapshot,
      inspectedCompositionRevisionId: revisionId,
      inspectedCompositionRevision: { status: "loading", value: null, error: null },
      compositionSources: idleUnitPage(),
      compositionInputs: idleUnitPage(),
      compositionRevisionEvaluations: idleUnitPage(),
      compositionBuilds: idleUnitPage(),
      inspectedCompositionBuildId: null,
      inspectedCompositionBuild: idleUnitLoad(),
      compositionBuildOutputs: idleUnitPage(),
      compositionBuildEvaluations: idleUnitPage(),
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
    });
    try {
      const value = await api.loadProjectCompositionRevision(snapshot.domain.project, revisionId);
      if (disposed || requestId !== compositionRevisionRequest || snapshot.compositionId !== compositionId
        || snapshot.inspectedCompositionRevisionId !== revisionId) return;
      if (value.compositionId !== compositionId) throw new Error("Invalid Composition revision");
      emit({ ...snapshot, inspectedCompositionRevision: { status: "ready", value, error: null } });
      await Promise.all([
        loadCompositionPage("sources", revisionId),
        loadCompositionPage("inputs", revisionId),
        loadCompositionPage("revision-evaluations", revisionId),
        loadCompositionPage("builds", revisionId),
      ]);
    } catch (error) {
      if (!disposed && requestId === compositionRevisionRequest && snapshot.inspectedCompositionRevisionId === revisionId) {
        emit({ ...snapshot, inspectedCompositionRevision: { status: "error", value: null, error: errorMessage(error) } });
      }
    }
  }

  const loadComposition = async (compositionId: string, inspectedRevisionId: string | null = null, conflict: string | null = null) => {
    const requestId = ++compositionRequest;
    compositionPreviewRequest += 1;
    compositionRevisionRequest += 1;
    compositionBuildRequest += 1;
    for (const kind of Object.keys(compositionPageRequests) as CompositionPageKind[]) compositionPageRequests[kind] += 1;
    const projectRef = snapshot.domain.project;
    emit({
      ...snapshot,
      compositionId,
      composition: { status: "loading", value: null, error: null },
      compositionRevisions: idleUnitPage(),
      inspectedCompositionRevisionId: null,
      inspectedCompositionRevision: idleUnitLoad(),
      compositionSources: idleUnitPage(), compositionInputs: idleUnitPage(), compositionRevisionEvaluations: idleUnitPage(), compositionBuilds: idleUnitPage(),
      inspectedCompositionBuildId: null, inspectedCompositionBuild: idleUnitLoad(), compositionBuildOutputs: idleUnitPage(), compositionBuildEvaluations: idleUnitPage(),
      compositionPreview: { status: "idle", value: null, error: null, artifactRevisionId: null },
      compositionConflict: conflict,
      compositionMutationError: null,
    });
    try {
      const value = await api.loadProjectComposition(projectRef, compositionId);
      if (disposed || requestId !== compositionRequest || snapshot.compositionId !== compositionId) return;
      emit({ ...snapshot, composition: { status: "ready", value, error: null }, compositionConflict: conflict, domain: domainWithComposition(value) });
      await loadCompositionPage("revisions", compositionId);
      if (disposed || requestId !== compositionRequest || snapshot.compositionId !== compositionId) return;
      const revisions = snapshot.compositionRevisions.items;
      const preferred = inspectedRevisionId ?? value.selectedRevisionId ?? value.latestRevisionId;
      const revisionId = preferred && revisions.some(({ id }) => id === preferred) ? preferred : revisions[0]?.id ?? null;
      if (revisionId) await loadCompositionRevision(revisionId);
    } catch (error) {
      if (!disposed && requestId === compositionRequest && snapshot.compositionId === compositionId) {
        emit({ ...snapshot, composition: { status: "error", value: null, error: errorMessage(error) } });
      }
    }
  };

  const runCompositionMutation = async (kind: "revise" | "select" | "build", run: (value: CompositionDto) => Promise<unknown>) => {
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
      const conflict = isConflict(error)
        ? kind === "select"
          ? "The selected revision changed elsewhere. Current pointer reloaded; click again to retry."
          : kind === "revise"
            ? "The latest revision changed elsewhere. Current pointer reloaded; click again to retry."
            : "The latest draft changed elsewhere. Current state reloaded; click again to retry."
        : null;
      const message = conflict ? null : errorMessage(error);
      await loadComposition(compositionId, inspected, conflict);
      if (!disposed && requestId === compositionMutationRequest && snapshot.compositionId === compositionId) {
        emit({ ...snapshot, compositionMutation: "idle", compositionMutationError: message });
      }
    }
  };

  const domainWithUnit = (value: UnitDto): ProjectDomainState => {
    const units = snapshot.domain.pages.units;
    return {
      ...snapshot.domain,
      pages: {
        ...snapshot.domain.pages,
        units: {
          ...units,
          items: units.items.map((row) => row.id === value.id ? value : row),
        },
      },
    };
  };

  const loadUnitItems = async (unitId: string, revisionId: string, requestId: number) => {
    emit({ ...snapshot, unitItems: { status: "loading", items: [], nextCursor: null, requestedCursor: null, error: null } });
    try {
      const page = await api.loadProjectUnitPage(snapshot.domain.project, { kind: "items", revisionId });
      if (disposed || requestId !== unitItemsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, unitItems: { status: "ready", items: page.items, nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (disposed || requestId !== unitItemsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, unitItems: { status: "error", items: [], nextCursor: null, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const loadUnitPresentations = async (unitId: string, revisionId: string, requestId: number) => {
    emit({ ...snapshot, unitPresentations: { status: "loading", items: [], nextCursor: null, requestedCursor: null, error: null } });
    try {
      const page = await api.loadProjectUnitPage(snapshot.domain.project, { kind: "presentations", revisionId });
      if (disposed || requestId !== unitPresentationsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, unitPresentations: { status: "ready", items: page.items, nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (disposed || requestId !== unitPresentationsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, unitPresentations: { status: "error", items: [], nextCursor: null, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const loadUnitRevision = async (revisionId: string) => {
    const unitId = snapshot.unitId;
    if (!unitId || !revisionId) return;
    const requestId = ++unitExactRevisionRequest;
    const itemsRequestId = ++unitItemsRequest;
    const presentationsRequestId = ++unitPresentationsRequest;
    unitMutationRequest += 1;
    emit({
      ...snapshot,
      inspectedUnitRevisionId: revisionId,
      inspectedUnitRevision: { status: "loading", value: null, error: null },
      unitItems: idleUnitPage(),
      unitPresentations: idleUnitPage(),
      unitMutation: "idle",
      unitConflict: null,
      unitMutationError: null,
    });
    try {
      const value = await api.loadProjectUnitRevision(snapshot.domain.project, unitId, revisionId);
      if (disposed || requestId !== unitExactRevisionRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      if (value.id !== revisionId || value.unitId !== unitId) throw new Error("Invalid Unit revision");
      emit({ ...snapshot, inspectedUnitRevision: { status: "ready", value, error: null } });
      await Promise.all([
        loadUnitItems(unitId, revisionId, itemsRequestId),
        loadUnitPresentations(unitId, revisionId, presentationsRequestId),
      ]);
    } catch (error) {
      if (disposed || requestId !== unitExactRevisionRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, inspectedUnitRevision: { status: "error", value: null, error: errorMessage(error) } });
    }
  };

  const loadUnit = async (unitId: string) => {
    if (!unitId) return;
    const requestId = ++unitRequest;
    unitRevisionPageRequest += 1;
    unitExactRevisionRequest += 1;
    unitItemsRequest += 1;
    unitPresentationsRequest += 1;
    unitMutationRequest += 1;
    emit({
      ...snapshot,
      unitId,
      unit: { status: "loading", value: null, error: null },
      unitRevisions: idleUnitPage(),
      inspectedUnitRevisionId: null,
      inspectedUnitRevision: idleUnitLoad(),
      unitItems: idleUnitPage(),
      unitPresentations: idleUnitPage(),
      unitMutation: "idle",
      unitConflict: null,
      unitMutationError: null,
    });
    let value: UnitDto;
    try {
      value = await api.loadProjectUnit(snapshot.domain.project, unitId);
      if (disposed || requestId !== unitRequest || snapshot.unitId !== unitId) return;
      if (value.id !== unitId) throw new Error("Invalid Unit");
      emit({ ...snapshot, unit: { status: "ready", value, error: null }, domain: domainWithUnit(value) });
    } catch (error) {
      if (disposed || requestId !== unitRequest || snapshot.unitId !== unitId) return;
      emit({ ...snapshot, unit: { status: "error", value: null, error: errorMessage(error) } });
      return;
    }

    const revisionRequestId = ++unitRevisionPageRequest;
    let revisions: UnitRevisionDto[] = [];
    emit({ ...snapshot, unitRevisions: { status: "loading", items: [], nextCursor: null, requestedCursor: null, error: null } });
    try {
      const page = await api.loadProjectUnitPage(snapshot.domain.project, { kind: "revisions", unitId });
      if (disposed || requestId !== unitRequest || revisionRequestId !== unitRevisionPageRequest
        || snapshot.unitId !== unitId) return;
      revisions = page.items;
      emit({ ...snapshot, unitRevisions: { status: "ready", items: revisions, nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (disposed || requestId !== unitRequest || revisionRequestId !== unitRevisionPageRequest
        || snapshot.unitId !== unitId) return;
      emit({ ...snapshot, unitRevisions: { status: "error", items: [], nextCursor: null, requestedCursor: null, error: errorMessage(error) } });
    }
    const preferred = value.selectedRevisionId ?? value.latestRevisionId ?? revisions[0]?.id ?? null;
    if (preferred && !disposed && requestId === unitRequest && snapshot.unitId === unitId) {
      await loadUnitRevision(preferred);
    }
  };

  const appendUnitRevisions = async () => {
    const unitId = snapshot.unitId;
    const current = snapshot.unitRevisions;
    const cursor = current.nextCursor;
    if (!unitId || !cursor || current.status === "loading" || snapshot.unitMutation !== "idle") return;
    const requestId = ++unitRevisionPageRequest;
    emit({ ...snapshot, unitRevisions: { ...current, status: "loading", requestedCursor: cursor, error: null } });
    try {
      const page = await api.loadProjectUnitPage(snapshot.domain.project, { kind: "revisions", unitId, cursor });
      if (disposed || requestId !== unitRevisionPageRequest || snapshot.unitId !== unitId) return;
      if (page.nextCursor === cursor) throw new Error("Unit page cursor did not advance");
      emit({ ...snapshot, unitRevisions: { status: "ready", items: appendUnique(current.items, page.items), nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (disposed || requestId !== unitRevisionPageRequest || snapshot.unitId !== unitId) return;
      emit({ ...snapshot, unitRevisions: { status: "error", items: current.items, nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const appendUnitItems = async () => {
    const unitId = snapshot.unitId;
    const revisionId = snapshot.inspectedUnitRevisionId;
    const current = snapshot.unitItems;
    const cursor = current.nextCursor;
    if (!unitId || !revisionId || !cursor || current.status === "loading") return;
    const requestId = ++unitItemsRequest;
    emit({ ...snapshot, unitItems: { ...current, status: "loading", requestedCursor: cursor, error: null } });
    try {
      const page = await api.loadProjectUnitPage(snapshot.domain.project, { kind: "items", revisionId, cursor });
      if (disposed || requestId !== unitItemsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      if (page.nextCursor === cursor) throw new Error("Unit item cursor did not advance");
      emit({ ...snapshot, unitItems: { status: "ready", items: appendUnique(current.items, page.items), nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (disposed || requestId !== unitItemsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, unitItems: { status: "error", items: current.items, nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } });
    }
  };

  const appendUnitPresentations = async () => {
    const unitId = snapshot.unitId;
    const revisionId = snapshot.inspectedUnitRevisionId;
    const current = snapshot.unitPresentations;
    const cursor = current.nextCursor;
    if (!unitId || !revisionId || !cursor || current.status === "loading") return;
    const requestId = ++unitPresentationsRequest;
    emit({ ...snapshot, unitPresentations: { ...current, status: "loading", requestedCursor: cursor, error: null } });
    try {
      const page = await api.loadProjectUnitPage(snapshot.domain.project, { kind: "presentations", revisionId, cursor });
      if (disposed || requestId !== unitPresentationsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      if (page.nextCursor === cursor) throw new Error("Unit presentation cursor did not advance");
      emit({ ...snapshot, unitPresentations: { status: "ready", items: appendUnique(current.items, page.items), nextCursor: page.nextCursor, requestedCursor: null, error: null } });
    } catch (error) {
      if (disposed || requestId !== unitPresentationsRequest || snapshot.unitId !== unitId
        || snapshot.inspectedUnitRevisionId !== revisionId) return;
      emit({ ...snapshot, unitPresentations: { status: "error", items: current.items, nextCursor: cursor, requestedCursor: null, error: errorMessage(error) } });
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
      if (disposed || sequence <= coveredActivitySequence || sequence < highestActivityAnnouncement
        || (sequence === highestActivityAnnouncement && activityCatchupInFlight)) return;
      if (sequence > highestActivityAnnouncement) highestActivityAnnouncement = sequence;
      const activeTab = snapshot.activeTab;
      await Promise.all([
        loadOverview(),
        catchUpActivity(sequence),
        ...(activeTab === "overview" || activeTab === "activity" ? [] : [loadPage(activeTab)]),
      ]);
    },
    async selectTab(tab) {
      emit({ ...snapshot, activeTab: tab });
      if (tab !== "overview" && snapshot.domain.pages[tab].status === "idle") await loadPage(tab);
    },
    async loadMore(tab) {
      const page = snapshot.domain.pages[tab];
      if (disposed || snapshot.activeTab !== tab || page.status !== "ready" || page.nextCursor === null) return;
      await loadPage(tab, true);
    },
    async retryPage(tab) {
      const page = snapshot.domain.pages[tab];
      if (disposed || snapshot.activeTab !== tab || page.status !== "error" || page.items.length === 0 || page.nextCursor === null) return;
      await loadPage(tab, true);
    },
    async retry() {
      if (snapshot.activeTab === "overview") await loadOverview();
      else {
        const page = snapshot.domain.pages[snapshot.activeTab];
        if (page.status === "error" && page.items.length === 0) await loadPage(snapshot.activeTab);
      }
    },
    async openDocument(document) {
      const retained = snapshot.selectedDocument?.id === document.id ? snapshot.documentDraft : null;
      await loadDocument(document.id, retained, retained ? snapshot.documentConflict : null, retained ? snapshot.documentConflictReview : false);
    },
    async openDocumentById(documentId) {
      await loadDocument(documentId);
    },
    async searchDocuments(query) {
      const normalized = query.trim();
      if (!normalized) { controller.clearDocumentSearch(); return; }
      await loadDocumentSearch(normalized, false);
    },
    clearDocumentSearch() {
      searchRequest += 1;
      emit({ ...snapshot, documentSearch: { query: "", items: [], nextCursor: null, status: "idle", appendError: null } });
    },
    async loadMoreDocumentSearch() { await loadDocumentSearch(snapshot.documentSearch.query, true); },
    async retryDocumentSearchAppend() {
      const search = snapshot.documentSearch;
      if (search.status !== "error") return;
      if (search.items.length > 0 && search.nextCursor !== null) {
        emit({ ...snapshot, documentSearch: { ...search, status: "ready" } });
        await loadDocumentSearch(search.query, true);
      } else await loadDocumentSearch(search.query, false);
    },
    async openSearchResult(result) {
      const retained = snapshot.selectedDocument?.id === result.documentId ? snapshot.documentDraft : null;
      await loadDocument(result.documentId, retained, retained ? snapshot.documentConflict : null, retained ? snapshot.documentConflictReview : false);
    },
    beginDocumentEdit() {
      if (!snapshot.selectedDocument || snapshot.documentMode === "edit" || snapshot.documentSaving) return;
      const preview = snapshot.documentPreview.value;
      if (snapshot.selectedDocument.currentRevisionId && (!preview || preview.truncated || snapshot.documentPreview.status !== "ready")) return;
      const format = preview?.format;
      const base: DocumentDraft = {
        format: format === "json" || format === "text" || format === "markdown" ? format : "markdown",
        title: snapshot.selectedDocument.currentRevision?.title ?? null,
        body: preview?.text ?? "",
      };
      documentDraftBase = base;
      emit({ ...snapshot, documentMode: "edit", documentDraft: base, documentDirty: false, documentConflict: null, documentConflictReview: false });
    },
    cancelDocumentEdit() {
      if (snapshot.documentSaving) return;
      documentDraftBase = null;
      saveRequest += 1;
      emit({ ...snapshot, documentMode: "read", documentDraft: null, documentDirty: false, documentConflict: null, documentConflictReview: false });
    },
    setDocumentDraftBody(body) {
      if (snapshot.documentSaving || !snapshot.documentDraft || !documentDraftBase) return;
      const draft = { ...snapshot.documentDraft, body };
      emit({ ...snapshot, documentDraft: draft, documentDirty: !sameDraft(draft, documentDraftBase), documentConflict: null, documentConflictReview: false });
    },
    setDocumentDraftTitle(title) {
      if (snapshot.documentSaving || !snapshot.documentDraft || !documentDraftBase) return;
      const draft = { ...snapshot.documentDraft, title: title || null };
      emit({ ...snapshot, documentDraft: draft, documentDirty: !sameDraft(draft, documentDraftBase), documentConflict: null, documentConflictReview: false });
    },
    setDocumentDraftFormat(format) {
      if (snapshot.documentSaving || !snapshot.documentDraft || !documentDraftBase || !["markdown", "text", "json"].includes(format)) return;
      const draft = { ...snapshot.documentDraft, format };
      emit({ ...snapshot, documentDraft: draft, documentDirty: !sameDraft(draft, documentDraftBase), documentConflict: null, documentConflictReview: false });
    },
    async saveDocument() {
      const document = snapshot.selectedDocument;
      const draft = snapshot.documentDraft;
      if (!document || !draft || snapshot.documentSaving) return;
      const requestId = ++saveRequest;
      const projectRef = snapshot.domain.project;
      emit({ ...snapshot, documentSaving: true, documentConflict: null, documentConflictReview: false });
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
        documentDraftBase = null;
        emit({ ...snapshot, selectedDocument, documentPreview: { status: "ready", value: { revisionId: revision.id, format: revision.format, text: draft.body, truncated: false }, error: null }, documentMode: "read", documentDraft: null, documentDirty: false, documentSaving: false, documentConflict: null, documentConflictReview: false });
      } catch (error) {
        if (saveRequest !== requestId || snapshot.selectedDocument?.id !== document.id) return;
        if (isConflict(error)) {
          await loadDocument(document.id, draft, "The document changed elsewhere. Current head reloaded; your local draft was kept.", true);
          return;
        }
        emit({ ...snapshot, documentSaving: false, documentConflict: errorMessage(error), documentConflictReview: false });
      }
    },
    selectMedia(card) {
      const loaded = loadedMedia(card);
      if (loaded) emit({ ...snapshot, selectedMedia: loaded });
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
    async setMediaQuery(patch) {
      const query: ProjectMediaQuery = { ...snapshot.domain.media, ...patch, filter: patch.filter ?? snapshot.domain.media.filter };
      if (Object.hasOwn(patch, "mediaKind") && patch.mediaKind === undefined) delete query.mediaKind;
      if (Object.hasOwn(patch, "provenance") && patch.provenance === undefined) delete query.provenance;
      if (JSON.stringify(query) === JSON.stringify(snapshot.domain.media)) return;
      mediaPreviewRequest += 1;
      mediaGenerationRequest += 1;
      mediaRevisionRequest += 1;
      emit({ ...snapshot, selectedMedia: null, mediaViewerOpen: false, mediaGeneration: { status: "idle", value: null, error: null }, mediaRevisions: { status: "idle", items: [], error: null } });
      reduce({ type: "media-query", query });
      if (snapshot.activeTab === "media") await loadPage("media");
    },
    async openComposition(compositionId) {
      compositionMutationRequest += 1;
      emit({ ...snapshot, compositionMutation: "idle", compositionConflict: null, compositionMutationError: null });
      await loadComposition(compositionId);
    },
    async inspectCompositionRevision(revisionId) {
      if (!snapshot.compositionRevisions.items.some(({ id }) => id === revisionId)) return;
      emit({ ...snapshot, compositionConflict: null, compositionMutationError: null });
      await loadCompositionRevision(revisionId);
    },
    async loadMoreCompositionRevisions() { if (snapshot.compositionId) await loadCompositionPage("revisions", snapshot.compositionId, snapshot.compositionRevisions.items.length > 0); },
    async loadMoreCompositionSources() { if (snapshot.inspectedCompositionRevisionId) await loadCompositionPage("sources", snapshot.inspectedCompositionRevisionId, snapshot.compositionSources.items.length > 0); },
    async loadMoreCompositionInputs() { if (snapshot.inspectedCompositionRevisionId) await loadCompositionPage("inputs", snapshot.inspectedCompositionRevisionId, snapshot.compositionInputs.items.length > 0); },
    async loadMoreCompositionRevisionEvaluations() { if (snapshot.inspectedCompositionRevisionId) await loadCompositionPage("revision-evaluations", snapshot.inspectedCompositionRevisionId, snapshot.compositionRevisionEvaluations.items.length > 0); },
    async loadMoreCompositionBuilds() { if (snapshot.inspectedCompositionRevisionId) await loadCompositionPage("builds", snapshot.inspectedCompositionRevisionId, snapshot.compositionBuilds.items.length > 0); },
    async loadMoreCompositionBuildOutputs() { if (snapshot.inspectedCompositionBuildId) await loadCompositionPage("build-outputs", snapshot.inspectedCompositionBuildId, snapshot.compositionBuildOutputs.items.length > 0); },
    async loadMoreCompositionBuildEvaluations() { if (snapshot.inspectedCompositionBuildId) await loadCompositionPage("build-evaluations", snapshot.inspectedCompositionBuildId, snapshot.compositionBuildEvaluations.items.length > 0); },
    async previewCompositionOutput(artifactRevisionId) {
      const value = snapshot.composition.value;
      if (!value || !snapshot.compositionBuildOutputs.items.some((output) => output.artifactRevisionId === artifactRevisionId)) return;
      const requestId = ++compositionPreviewRequest;
      const compositionId = value.id;
      const revisionId = snapshot.inspectedCompositionRevisionId;
      const buildId = snapshot.inspectedCompositionBuildId;
      emit({ ...snapshot, compositionPreview: { status: "loading", value: null, error: null, artifactRevisionId } });
      try {
        const preview = await api.resolveCompositionOutputPreview(snapshot.domain.project, artifactRevisionId);
        if (disposed || requestId !== compositionPreviewRequest || snapshot.compositionId !== compositionId
          || snapshot.inspectedCompositionRevisionId !== revisionId || snapshot.inspectedCompositionBuildId !== buildId
          || !snapshot.compositionBuildOutputs.items.some((output) => output.artifactRevisionId === artifactRevisionId)) return;
        emit({ ...snapshot, compositionPreview: { status: "ready", value: preview, error: null, artifactRevisionId } });
      } catch (error) {
        if (disposed || requestId !== compositionPreviewRequest || snapshot.compositionId !== compositionId
          || snapshot.inspectedCompositionRevisionId !== revisionId || snapshot.inspectedCompositionBuildId !== buildId) return;
        emit({ ...snapshot, compositionPreview: { status: "error", value: null, error: errorMessage(error), artifactRevisionId } });
      }
    },
    async selectInspectedCompositionRevision() {
      const revisionId = snapshot.inspectedCompositionRevisionId;
      const value = snapshot.composition.value;
      const revision = snapshot.inspectedCompositionRevision.value;
      if (!value || !revisionId || revision?.state !== "sealed" || revisionId === value.selectedRevisionId) return;
      await runCompositionMutation("select", () => api.selectProjectCompositionRevision(snapshot.domain.project, {
        compositionId: value.id,
        revisionId,
        expectedSelectedRevisionId: value.selectedRevisionId,
      }));
    },
    async reviseSelectedComposition() {
      const value = snapshot.composition.value;
      const latest = snapshot.compositionRevisions.items.find(({ id }) => id === value?.latestRevisionId);
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
      const revision = snapshot.inspectedCompositionRevision.value;
      if (!value || !revision || revision.id !== value.latestRevisionId || revision.state !== "draft") return;
      await runCompositionMutation("build", () => api.buildProjectComposition(snapshot.domain.project, revision.id));
    },
    async openUnit(unitId) {
      await loadUnit(unitId);
    },
    async loadMoreUnitRevisions() {
      await appendUnitRevisions();
    },
    async inspectUnitRevision(revisionId) {
      await loadUnitRevision(revisionId);
    },
    async loadMoreUnitItems() {
      await appendUnitItems();
    },
    async loadMoreUnitPresentations() {
      await appendUnitPresentations();
    },
    async selectInspectedUnitRevision() {
      const unit = snapshot.unit.value;
      const revision = snapshot.inspectedUnitRevision.value;
      if (!unit || snapshot.unit.status !== "ready" || !revision
        || snapshot.inspectedUnitRevision.status !== "ready" || revision.sealedAt === null
        || revision.unitId !== unit.id || revision.id === unit.selectedRevisionId
        || snapshot.unitMutation !== "idle" || snapshot.unitRevisions.status === "loading") return;
      const requestId = ++unitMutationRequest;
      const unitId = unit.id;
      const revisionId = revision.id;
      emit({ ...snapshot, unitMutation: "select", unitConflict: null, unitMutationError: null });
      try {
        const selected = await api.selectProjectUnitRevision(
          snapshot.domain.project,
          unitId,
          revisionId,
          unit.selectedRevisionId,
        );
        if (disposed || requestId !== unitMutationRequest || snapshot.unitId !== unitId
          || snapshot.inspectedUnitRevisionId !== revisionId) return;
        if (selected.id !== unitId || selected.selectedRevisionId !== revisionId) {
          throw new Error("Invalid Unit selection");
        }
        emit({
          ...snapshot,
          unit: { status: "ready", value: selected, error: null },
          unitMutation: "idle",
          unitConflict: null,
          unitMutationError: null,
          domain: domainWithUnit(selected),
        });
      } catch (error) {
        if (disposed || requestId !== unitMutationRequest || snapshot.unitId !== unitId
          || snapshot.inspectedUnitRevisionId !== revisionId) return;
        if (!isConflict(error)) {
          emit({ ...snapshot, unitMutation: "idle", unitMutationError: errorMessage(error) });
          return;
        }
        const shellRequestId = ++unitRequest;
        const pageRequestId = ++unitRevisionPageRequest;
        try {
          const [authoritative, revisions] = await Promise.all([
            api.loadProjectUnit(snapshot.domain.project, unitId),
            api.loadProjectUnitPage(snapshot.domain.project, { kind: "revisions", unitId }),
          ]);
          if (disposed || requestId !== unitMutationRequest || shellRequestId !== unitRequest
            || pageRequestId !== unitRevisionPageRequest || snapshot.unitId !== unitId
            || snapshot.inspectedUnitRevisionId !== revisionId) return;
          if (authoritative.id !== unitId) throw new Error("Invalid Unit");
          emit({
            ...snapshot,
            unit: { status: "ready", value: authoritative, error: null },
            unitRevisions: { status: "ready", items: revisions.items, nextCursor: revisions.nextCursor, requestedCursor: null, error: null },
            unitMutation: "idle",
            unitConflict: "The selected revision changed elsewhere. Current pointer reloaded; click again to retry.",
            unitMutationError: null,
            domain: domainWithUnit(authoritative),
          });
        } catch (reloadError) {
          if (disposed || requestId !== unitMutationRequest || snapshot.unitId !== unitId) return;
          emit({ ...snapshot, unitMutation: "idle", unitMutationError: errorMessage(reloadError) });
        }
      }
    },
    dispose() {
      disposed = true;
      overviewRequest += 1;
      documentRequest += 1;
      searchRequest += 1;
      saveRequest += 1;
      compositionRequest += 1;
      compositionRevisionRequest += 1;
      compositionBuildRequest += 1;
      for (const kind of Object.keys(compositionPageRequests) as CompositionPageKind[]) compositionPageRequests[kind] += 1;
      compositionPreviewRequest += 1;
      compositionMutationRequest += 1;
      unitRequest += 1;
      unitRevisionPageRequest += 1;
      unitExactRevisionRequest += 1;
      unitItemsRequest += 1;
      unitPresentationsRequest += 1;
      unitMutationRequest += 1;
      listeners.clear();
    },
  };
  return controller;
}
