import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Braces, FileText, Pilcrow } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DocumentDto, DocumentSearchDto } from "../../../electron/ralphy/types";
import { JsonDocumentView } from "../../components/JsonDocumentView";
import { MarkdownView } from "../../components/MarkdownView";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";

type DocumentRow =
  | { type: "document"; value: DocumentDto }
  | { type: "search"; value: DocumentSearchDto };

const formatLabel = (format: string | null): string => format === "markdown" ? "MD" : format === "json" ? "JSON" : format === "text" ? "TXT" : "DOC";

function listedDocumentFormat(document: DocumentDto): DocumentSearchDto["format"] | null {
  const names = [document.slug, document.title].filter((name): name is string => typeof name === "string").map((name) => name.toLowerCase());
  if (names.some((name) => name.endsWith(".md") || name.endsWith(".markdown"))) return "markdown";
  if (names.some((name) => name.endsWith(".json"))) return "json";
  if (names.some((name) => name.endsWith(".txt"))) return "text";
  return null;
}

function FormatIcon({ format }: { format: string | null }) {
  if (format === "json") return <Braces size={17} aria-hidden="true" />;
  if (format === "text") return <Pilcrow size={17} aria-hidden="true" />;
  return <FileText size={17} aria-hidden="true" />;
}

function FormatBadge({ format }: { format: string | null }) {
  return <span className={`document-format-badge format-${format ?? "unknown"}`}><FormatIcon format={format} />{formatLabel(format)}</span>;
}

function DocumentContent({ format, text }: { format: string; text: string }) {
  if (format === "markdown") return <MarkdownView markdown={text} />;
  if (format === "json") return <JsonDocumentView text={text} />;
  return <pre className="plain-text-view">{text}</pre>;
}

export function DocumentsPanel({ page, controller, snapshot, scrollMemory, resetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  scrollMemory: Map<string, number>;
  resetToken: string;
}) {
  const [query, setQuery] = useState(snapshot.documentSearch.query);
  const [masterRoot, setMasterRoot] = useState<HTMLDivElement | null>(null);
  const [previewDraft, setPreviewDraft] = useState(false);
  const [reviewCurrent, setReviewCurrent] = useState(false);
  const masterRef = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const normalizedQuery = query.trim();
  const searchActive = normalizedQuery.length > 0;
  const rows = useMemo<DocumentRow[]>(() => searchActive
    ? snapshot.documentSearch.items.map((value) => ({ type: "search", value }))
    : (page.items as DocumentDto[]).map((value) => ({ type: "document", value })), [page.items, searchActive, snapshot.documentSearch.items]);
  const masterScroll = useRememberedScroll(scrollMemory, "documents-master", `${resetToken}:${normalizedQuery}`);
  const detailScroll = useRememberedScroll(scrollMemory, "documents-detail", resetToken);
  const attachMaster = useCallback((node: HTMLDivElement | null) => {
    masterRef.current = node;
    masterScroll.ref(node);
    setMasterRoot((current) => current === node ? current : node);
  }, [masterScroll.ref]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => masterRef.current,
    getItemKey: (index) => rows[index]?.type === "search" ? rows[index].value.revisionId : rows[index]?.value.id ?? index,
    estimateSize: () => 76,
    overscan: 5,
    initialRect: { width: 320, height: 600 },
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (normalizedQuery && normalizedQuery !== snapshot.documentSearch.query) void controller.searchDocuments(normalizedQuery);
      else if (!normalizedQuery && snapshot.documentSearch.query) controller.clearDocumentSearch();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [controller, normalizedQuery, snapshot.documentSearch.query]);
  useEffect(() => setPreviewDraft(false), [snapshot.documentMode, snapshot.selectedDocument?.id]);
  useEffect(() => setReviewCurrent(false), [snapshot.documentConflict, snapshot.selectedDocument?.id]);

  const open = async (row: DocumentRow) => {
    const documentId = row.type === "search" ? row.value.documentId : row.value.id;
    if (snapshot.selectedDocument?.id !== documentId && snapshot.documentDirty
      && !window.confirm("Discard unsaved document changes?")) return;
    const scrollTop = masterRef.current?.scrollTop ?? 0;
    if (row.type === "search") await controller.openSearchResult(row.value);
    else await controller.openDocument(row.value);
    if (masterRef.current) masterRef.current.scrollTop = scrollTop;
    detailHeading.current?.focus({ preventScroll: true });
  };
  const search = snapshot.documentSearch;
  const loadingMore = searchActive
    ? search.status === "loading" && search.items.length > 0
    : page.status === "loading" && page.items.length > 0;
  const appendError = searchActive
    ? search.status === "error" && search.items.length > 0 ? search.appendError : null
    : page.status === "error" && page.items.length > 0 ? page.error : null;
  const draft = snapshot.documentDraft;
  const selected = snapshot.selectedDocument;
  const revision = selected?.currentRevision;
  const displayTitle = revision?.title ?? selected?.title ?? "Document";
  const displayFormat = draft?.format ?? snapshot.documentPreview.value?.format ?? revision?.format ?? null;
  return <div className="documents-workbench">
    <div className="documents-master" aria-label="Documents" ref={attachMaster} onScroll={masterScroll.onScroll}>
      <div className="document-search">
        <label htmlFor="document-search">Search documents</label>
        <input id="document-search" type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Title or content" />
      </div>
      {searchActive && search.status === "loading" && search.items.length === 0 && <div className="project-skeleton" role="status">Searching…</div>}
      {searchActive && search.status === "error" && search.items.length === 0 && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{search.appendError}</span><button className="command-button" type="button" onClick={() => { void controller.retryDocumentSearchAppend(); }}>Retry</button></div>}
      {rows.length === 0 && !(searchActive && search.status === "loading") && <div className="empty-section">{searchActive ? "No documents match this search." : "No documents yet."}</div>}
      <div className="documents-virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          const documentId = row.type === "search" ? row.value.documentId : row.value.id;
          const title = row.type === "search" ? row.value.documentTitle : row.value.title;
          const format = row.type === "search" ? row.value.format : selected?.id === documentId ? displayFormat : listedDocumentFormat(row.value);
          const meta = row.type === "search"
            ? `${row.value.kind} · Revision ${row.value.revisionNo}`
            : `${row.value.kind} · ${row.value.currentRevisionId ? "Current revision" : "No revision"}`;
          return <button
            className={`document-row${selected?.id === documentId ? " is-selected" : ""}`}
            type="button"
            disabled={snapshot.documentSaving}
            aria-pressed={selected?.id === documentId}
            aria-label={`Open ${title}`}
            key={item.key}
            onClick={() => { void open(row); }}
            style={{ transform: `translateY(${item.start}px)`, height: item.size }}
          ><FormatBadge format={format} /><span><strong>{title}</strong><small>{meta}</small></span></button>;
        })}
      </div>
      <AutoCursorTail
        root={masterRoot}
        hasMore={searchActive ? search.nextCursor !== null : page.nextCursor !== null}
        loading={loadingMore}
        error={appendError}
        onLoadMore={() => { if (searchActive) void controller.loadMoreDocumentSearch(); else void controller.loadMore("documents"); }}
        onRetry={() => { if (searchActive) void controller.retryDocumentSearchAppend(); else void controller.retryPage("documents"); }}
      />
    </div>
    <section className="documents-detail document-preview" aria-label="Document detail" ref={detailScroll.ref} onScroll={detailScroll.onScroll}>
      {!selected && <div className="empty-section">Select a document to open it.</div>}
      {selected && <>
        <header className="document-detail-header">
          <div className="document-detail-identity">
            <FormatBadge format={displayFormat} />
            <div><h2 className="document-detail-heading" tabIndex={-1} ref={detailHeading}>{displayTitle}</h2><p>{selected.kind}{revision ? ` · Revision ${revision.revisionNo}` : " · No revision"}{snapshot.documentDirty ? " · Unsaved" : ""}</p></div>
          </div>
          {snapshot.documentMode === "read"
            ? <button className="command-button" type="button" onClick={() => controller.beginDocumentEdit()}>Edit</button>
            : <div className="document-actions"><button className="command-button" type="button" disabled={snapshot.documentSaving} aria-pressed={previewDraft} onClick={() => setPreviewDraft((value) => !value)}>Preview</button><button className="command-button" type="button" disabled={snapshot.documentSaving} onClick={() => controller.cancelDocumentEdit()}>Cancel</button><button className="command-button" type="button" disabled={snapshot.documentSaving || !snapshot.documentDirty} onClick={() => { void controller.saveDocument(); }}>{snapshot.documentSaving ? "Saving…" : "Save"}</button></div>}
          {draft && <div className="document-edit-fields"><label>Title<input disabled={snapshot.documentSaving} value={draft.title ?? ""} onChange={(event) => controller.setDocumentDraftTitle(event.currentTarget.value)} /></label><fieldset className="document-format-options" disabled={snapshot.documentSaving}><legend>Format</legend>{(["markdown", "json", "text"] as const).map((format) => <button className="command-button" type="button" disabled={snapshot.documentSaving} aria-pressed={draft.format === format} key={format} onClick={() => controller.setDocumentDraftFormat(format)}>{formatLabel(format)}</button>)}</fieldset></div>}
        </header>
        {snapshot.documentConflict && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentConflict}</span>{snapshot.documentConflictReview && snapshot.documentPreview.value && <button className="command-button" type="button" onClick={() => setReviewCurrent(true)}>Review current</button>}</div>}
        {snapshot.documentPreview.status === "loading" && <div className="project-skeleton" role="status">Loading document…</div>}
        {snapshot.documentPreview.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentPreview.error}</span><button className="command-button" type="button" onClick={() => { void controller.openDocument(selected); }}>Retry</button></div>}
        {draft && reviewCurrent && snapshot.documentPreview.value && <div className="document-current-review"><button className="command-button" type="button" onClick={() => setReviewCurrent(false)}>Back to edit</button><DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} /></div>}
        {draft && !reviewCurrent && !previewDraft && <textarea className="document-editor" aria-label="Document body" disabled={snapshot.documentSaving} value={draft.body} onChange={(event) => controller.setDocumentDraftBody(event.currentTarget.value)} />}
        {draft && !reviewCurrent && previewDraft && <DocumentContent format={draft.format} text={draft.body} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && <DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} />}
        {snapshot.documentPreview.value?.truncated && <p>Preview truncated.</p>}
      </>}
    </section>
  </div>;
}
