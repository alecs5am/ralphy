/**
 * The project screen's shape: what a render may read, what a caller may call, and the idle
 * values every section starts from.
 *
 * The controller behind it is split by domain -- documents, media, compositions, units -- around
 * one store. These types stay in one file so no section has to import another's to describe the
 * whole snapshot, and so the screen's state can be read in one sitting.
 */
import type { ArtifactRevisionDto, BuildDto, BuildOutputDto, CompositionDto, CompositionInputDto, CompositionRevisionDto, CompositionSourceDto, DocumentDetailDto, DocumentDto, DocumentSearchDto, EvaluationDto, MediaCardDto, MediaGenerationDetailDto, UnitDto, UnitItemDto, UnitPresentationDto, UnitRevisionDto } from "../../../../electron/ralphy/types";
import type { CompositionOutputPreview } from "../../../../electron/ralphy/project-reader";
import type { ActivityRunDetail, MediaWorkbenchBridge, ProjectMediaQuery, ProjectTab } from "../../../../electron/media/types";
import type { ProjectDomainState } from "@/entities/project";

import type { ProjectView } from "@/shared/model/routes";

export type { ProjectView };
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
  unitPreview: { status: "idle" | "loading" | "ready" | "error"; value: CompositionOutputPreview | NonNullable<DocumentPreview["value"]> | null; error: string | null; artifactRevisionId: string | null };
  unitMutation: "idle" | "select";
  unitConflict: string | null;
  unitMutationError: string | null;
}
export type ProjectScreenApi = Pick<MediaWorkbenchBridge, "loadProjectOverview" | "loadProjectPage" | "loadProjectActivityRun" | "loadProjectMediaCard" | "loadProjectGeneration" | "loadProjectMediaRevisions" | "selectProjectMediaRevision" | "loadDocumentPreview" | "searchProjectDocuments" | "showProjectDocument" | "reviseProjectDocument" | "resolveProjectPreview" | "loadProjectComposition" | "loadProjectCompositionRevision" | "loadProjectCompositionBuild" | "loadProjectCompositionPage" | "reviseProjectComposition" | "selectProjectCompositionRevision" | "buildProjectComposition" | "resolveCompositionOutputPreview" | "loadProjectUnit" | "loadProjectUnitRevision" | "loadProjectUnitPage" | "selectProjectUnitRevision">;
export interface ProjectScreenController {
  getSnapshot(): ProjectScreenSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  refresh(sequence: number): Promise<void>;
  selectTab(tab: ProjectView): Promise<void>;
  loadMore(tab: ProjectTab): Promise<void>;
  retryPage(tab: ProjectTab): Promise<void>;
  retry(): Promise<void>;
  loadActivityRun(runId: string): Promise<ActivityRunDetail>;
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


export const idleDocument: DocumentPreview = { status: "idle", value: null, error: null };
export const idleUnitLoad = <T>(): UnitLoad<T> => ({ status: "idle", value: null, error: null });
export const idleUnitPage = <T>(): UnitPage<T> => ({ status: "idle", items: [], nextCursor: null, requestedCursor: null, error: null });
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
export const isConflict = (error: unknown): boolean => error !== null && typeof error === "object" && (error as { code?: unknown }).code === "E_CONFLICT";

/** A page append that never duplicates a row the list already holds. */
export function appendUnique<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map(({ id }) => id));
  return [...current, ...incoming.filter(({ id }) => !seen.has(id) && !!seen.add(id))];
}
