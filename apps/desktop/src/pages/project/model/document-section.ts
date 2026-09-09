/**
 * Documents: the open-and-read path, the search that finds one, and the draft the editor holds.
 *
 * The draft's base is the revision it was opened from, kept beside the draft rather than inside
 * the snapshot: dirtiness is a comparison against what the server last confirmed, not a flag a
 * keystroke sets. A save that loses a conflict reloads the head and keeps the draft, which is
 * why `loadDocument` takes one.
 */
import type { JsonValue } from "../../../../electron/ralphy/types";
import { errorMessage, idleDocument, isConflict, type DocumentDraft, type ProjectScreenController } from "./screen-state";
import type { ProjectScreenSection, ProjectScreenStore } from "./screen-store";

export type DocumentActions = Pick<ProjectScreenController,
  "openDocument" | "openDocumentById" | "searchDocuments" | "clearDocumentSearch"
  | "loadMoreDocumentSearch" | "retryDocumentSearchAppend" | "openSearchResult"
  | "beginDocumentEdit" | "cancelDocumentEdit" | "setDocumentDraftBody" | "setDocumentDraftTitle"
  | "setDocumentDraftFormat" | "saveDocument">;

function revisionBody(format: DocumentDraft["format"], body: string): JsonValue {
  if (format !== "json") return body;
  try { return JSON.parse(body) as JsonValue; }
  catch { throw new Error("Document body must be valid JSON."); }
}

const sameDraft = (left: DocumentDraft, right: DocumentDraft): boolean => (
  left.format === right.format && left.title === right.title && left.body === right.body
);


export function createDocumentSection(store: ProjectScreenStore): ProjectScreenSection<DocumentActions> {
  let documentRequest = 0;
  let searchRequest = 0;
  let saveRequest = 0;
  let documentDraftBase: DocumentDraft | null = null;

  const loadDocument = async (documentId: string, retainedDraft: DocumentDraft | null = null, conflict: string | null = null, conflictReview = false) => {
    const requestId = ++documentRequest;
    saveRequest += 1;
    if (!retainedDraft) documentDraftBase = null;
    const currentDraft = retainedDraft ? store.snapshot.documentDraft : null;
    store.patch({
      documentPreview: { status: "loading", value: null, error: null },
      documentMode: currentDraft ? "edit" : "read",
      documentDraft: currentDraft,
      documentDirty: currentDraft ? store.snapshot.documentDirty : false,
      documentSaving: true,
      documentConflict: conflict,
      documentConflictReview: false,
    });
    const projectRef = store.snapshot.domain.project;
    try {
      const document = await store.api.showProjectDocument(projectRef, documentId);
      if (store.disposed || documentRequest !== requestId) return;
      const revisionId = document.currentRevision?.id ?? document.currentRevisionId;
      const currentDraft = retainedDraft ? store.snapshot.documentDraft : null;
      store.patch({
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
      const value = await store.api.loadDocumentPreview(projectRef, revisionId);
      if (!store.disposed && documentRequest === requestId) {
        const currentDraft = store.snapshot.documentDraft;
        if (currentDraft) {
          const format = value.format === "json" || value.format === "text" || value.format === "markdown" ? value.format : "markdown";
          documentDraftBase = { format, title: document.currentRevision?.title ?? null, body: value.text };
        }
        store.patch({
          documentPreview: { status: "ready", value, error: null },
          documentDirty: currentDraft && documentDraftBase ? !sameDraft(currentDraft, documentDraftBase) : false,
          documentSaving: false,
          documentConflictReview: conflictReview,
        });
      }
    } catch (error) {
      if (!store.disposed && documentRequest === requestId) store.patch({ documentPreview: { status: "error", value: null, error: errorMessage(error) }, documentSaving: false, documentConflictReview: conflictReview });
    }
  };

  const loadDocumentSearch = async (query: string, append: boolean) => {
    const current = store.snapshot.documentSearch;
    const cursor = append ? current.nextCursor : null;
    if (append && (current.status !== "ready" || cursor === null)) return;
    const requestId = ++searchRequest;
    const projectRef = store.snapshot.domain.project;
    store.patch({
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
        ? await store.api.searchProjectDocuments(projectRef, query)
        : await store.api.searchProjectDocuments(projectRef, query, cursor);
      if (store.disposed || searchRequest !== requestId || store.snapshot.documentSearch.query !== query) return;
      if (append && page.nextCursor === cursor) throw new Error("Document search cursor did not advance");
      const items = append
        ? [...current.items, ...page.items.filter((item) => !current.items.some(({ revisionId }) => revisionId === item.revisionId))]
        : page.items;
      store.patch({ documentSearch: { query, items, nextCursor: page.nextCursor, status: "ready", appendError: null } });
    } catch (error) {
      if (store.disposed || searchRequest !== requestId || store.snapshot.documentSearch.query !== query) return;
      store.patch({
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

  const actions: DocumentActions = {
    async openDocument(document) {
      const retained = store.snapshot.selectedDocument?.id === document.id ? store.snapshot.documentDraft : null;
      await loadDocument(document.id, retained, retained ? store.snapshot.documentConflict : null, retained ? store.snapshot.documentConflictReview : false);
    },
    async openDocumentById(documentId) {
      await loadDocument(documentId);
    },
    async searchDocuments(query) {
      const normalized = query.trim();
      if (!normalized) { actions.clearDocumentSearch(); return; }
      await loadDocumentSearch(normalized, false);
    },
    clearDocumentSearch() {
      searchRequest += 1;
      store.patch({ documentSearch: { query: "", items: [], nextCursor: null, status: "idle", appendError: null } });
    },
    async loadMoreDocumentSearch() { await loadDocumentSearch(store.snapshot.documentSearch.query, true); },
    async retryDocumentSearchAppend() {
      const search = store.snapshot.documentSearch;
      if (search.status !== "error") return;
      if (search.items.length > 0 && search.nextCursor !== null) {
        store.patch({ documentSearch: { ...search, status: "ready" } });
        await loadDocumentSearch(search.query, true);
      } else await loadDocumentSearch(search.query, false);
    },
    async openSearchResult(result) {
      const retained = store.snapshot.selectedDocument?.id === result.documentId ? store.snapshot.documentDraft : null;
      await loadDocument(result.documentId, retained, retained ? store.snapshot.documentConflict : null, retained ? store.snapshot.documentConflictReview : false);
    },
    beginDocumentEdit() {
      if (!store.snapshot.selectedDocument || store.snapshot.documentMode === "edit" || store.snapshot.documentSaving) return;
      const preview = store.snapshot.documentPreview.value;
      if (store.snapshot.selectedDocument.currentRevisionId && (!preview || preview.truncated || store.snapshot.documentPreview.status !== "ready")) return;
      const format = preview?.format;
      const base: DocumentDraft = {
        format: format === "json" || format === "text" || format === "markdown" ? format : "markdown",
        title: store.snapshot.selectedDocument.currentRevision?.title ?? null,
        body: preview?.text ?? "",
      };
      documentDraftBase = base;
      store.patch({ documentMode: "edit", documentDraft: base, documentDirty: false, documentConflict: null, documentConflictReview: false });
    },
    cancelDocumentEdit() {
      if (store.snapshot.documentSaving) return;
      documentDraftBase = null;
      saveRequest += 1;
      store.patch({ documentMode: "read", documentDraft: null, documentDirty: false, documentConflict: null, documentConflictReview: false });
    },
    setDocumentDraftBody(body) {
      if (store.snapshot.documentSaving || !store.snapshot.documentDraft || !documentDraftBase) return;
      const draft = { ...store.snapshot.documentDraft, body };
      store.patch({ documentDraft: draft, documentDirty: !sameDraft(draft, documentDraftBase), documentConflict: null, documentConflictReview: false });
    },
    setDocumentDraftTitle(title) {
      if (store.snapshot.documentSaving || !store.snapshot.documentDraft || !documentDraftBase) return;
      const draft = { ...store.snapshot.documentDraft, title: title || null };
      store.patch({ documentDraft: draft, documentDirty: !sameDraft(draft, documentDraftBase), documentConflict: null, documentConflictReview: false });
    },
    setDocumentDraftFormat(format) {
      if (store.snapshot.documentSaving || !store.snapshot.documentDraft || !documentDraftBase || !["markdown", "text", "json"].includes(format)) return;
      const draft = { ...store.snapshot.documentDraft, format };
      store.patch({ documentDraft: draft, documentDirty: !sameDraft(draft, documentDraftBase), documentConflict: null, documentConflictReview: false });
    },
    async saveDocument() {
      const document = store.snapshot.selectedDocument;
      const draft = store.snapshot.documentDraft;
      if (!document || !draft || store.snapshot.documentSaving) return;
      const requestId = ++saveRequest;
      const projectRef = store.snapshot.domain.project;
      store.patch({ documentSaving: true, documentConflict: null, documentConflictReview: false });
      try {
        const revision = await store.api.reviseProjectDocument(projectRef, {
          documentId: document.id,
          expectedHeadId: document.currentRevisionId,
          format: draft.format,
          ...(draft.title === null ? {} : { title: draft.title }),
          body: revisionBody(draft.format, draft.body),
        });
        if (saveRequest !== requestId || store.snapshot.selectedDocument?.id !== document.id) return;
        const selectedDocument = { ...document, currentRevisionId: revision.id, currentRevision: revision };
        documentDraftBase = null;
        store.patch({ selectedDocument, documentPreview: { status: "ready", value: { revisionId: revision.id, format: revision.format, text: draft.body, truncated: false }, error: null }, documentMode: "read", documentDraft: null, documentDirty: false, documentSaving: false, documentConflict: null, documentConflictReview: false });
      } catch (error) {
        if (saveRequest !== requestId || store.snapshot.selectedDocument?.id !== document.id) return;
        if (isConflict(error)) {
          await loadDocument(document.id, draft, "The document changed elsewhere. Current head reloaded; your local draft was kept.", true);
          return;
        }
        store.patch({ documentSaving: false, documentConflict: errorMessage(error), documentConflictReview: false });
      }
    },
  };
  return {
    actions,
    dispose() {
      documentRequest += 1;
      searchRequest += 1;
      saveRequest += 1;
    },
  };
}
