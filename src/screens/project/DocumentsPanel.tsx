import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Braces, FileText, Pilcrow, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DocumentDetailDto, DocumentDto, DocumentSearchDto } from "../../../electron/ralphy/types";
import { JsonDocumentView } from "../../components/JsonDocumentView";
import { MarkdownView, PLAIN_TEXT_VIEW } from "../../components/MarkdownView";
import { GooeyTabs } from "../../components/ui/GooeyTabs";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "../../instrument/screen-state-registry";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";

type DocumentRow =
  | { type: "document"; value: DocumentDto }
  | { type: "search"; value: DocumentSearchDto };

const LIST_EDGE = 4;
const ROW_GAP = 6;
const ROW_SIZE = 54;

const formatLabel = (format: string | null): string => format === "markdown" ? "MD" : format === "json" ? "JSON" : format === "text" ? "TXT" : "—";
const documentDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const documentViewTabs = [{ value: "render", label: "Render" }, { value: "source", label: "Source" }] as const;

// The reading canvas the document detail gives every view it mounts: markdown, JSON and plain
// text. It is stated on the detail because the canvas is the detail's decision, not the view's —
// the same components render at their own width inside a unit preview or an artifact preview.
// The reading canvas the document detail gives every view it mounts: markdown, JSON and plain
// text. It is stated on the detail because the canvas is the detail's decision, not the view's --
// the same components render at their own width inside a unit preview or an artifact preview.
// The three selectors are written out: Tailwind reads class names from the source text, so an
// interpolated variant prefix would never reach the generated stylesheet.
const DOCUMENT_CANVAS = [
  "[&_.markdown-view]:mx-auto [&_.markdown-view]:w-[calc(100%_-_48px)] [&_.markdown-view]:max-w-document-canvas [&_.markdown-view]:pt-7 [&_.markdown-view]:pb-16 [&_.markdown-view]:text-left [&_.markdown-view]:type-md",
  "[&_.json-document-view]:mx-auto [&_.json-document-view]:w-[calc(100%_-_48px)] [&_.json-document-view]:max-w-document-canvas [&_.json-document-view]:pt-7 [&_.json-document-view]:pb-16 [&_.json-document-view]:text-left",
  "[&_.plain-text-view]:mx-auto [&_.plain-text-view]:w-[calc(100%_-_48px)] [&_.plain-text-view]:max-w-document-canvas [&_.plain-text-view]:pt-7 [&_.plain-text-view]:pb-16 [&_.plain-text-view]:text-left",
].join(" ");

export const documentsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "project.documents",
  states: ["loading", "ready", "empty", "partial", "error", "selected", "editing", "conflict"],
  rootMarker: "project-documents",
  landmarks: ["Documents", "Document detail"],
} as const);

export function documentsInstrumentState(page: DomainPage, snapshot: ProjectScreenSnapshot): InstrumentScenarioState {
  if (snapshot.documentConflict) return "conflict";
  if (snapshot.documentMode === "edit") return "editing";
  if (snapshot.selectedDocument) return "selected";
  const search = snapshot.documentSearch;
  if (search.query && search.status === "loading" && search.items.length === 0) return "loading";
  if (search.query && search.status === "error" && search.items.length === 0) return "error";
  if (page.status === "loading" && page.items.length === 0) return "loading";
  if (page.status === "error" && page.items.length === 0) return "error";
  if (page.items.length === 0) return "empty";
  return page.status === "loading" || page.status === "error" ? "partial" : "ready";
}

function formatDocumentDate(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown date";
  return documentDate.format(new Date(value < 1_000_000_000_000 ? value * 1000 : value));
}

function currentFormat(document: DocumentDto): DocumentSearchDto["format"] | null {
  return (document as Partial<DocumentDetailDto>).currentRevision?.format ?? null;
}

function FormatIcon({ format }: { format: string | null }) {
  if (format === "json") return <Braces size={17} aria-hidden="true" />;
  if (format === "text") return <Pilcrow size={17} aria-hidden="true" />;
  return <FileText size={17} aria-hidden="true" />;
}

function FormatBadge({ format, row = false }: { format: string | null; row?: boolean }) {
  return <span className={`document-format-badge format-${format ?? "unknown"} inline-flex items-center justify-center gap-1 rounded-full bg-surface px-1.5 font-code type-meta text-muted ${row ? "h-7 w-full min-w-0" : "h-6 min-w-9"}`}><FormatIcon format={format} />{formatLabel(format)}</span>;
}

export function DocumentContent({ format, text }: { format: string; text: string }) {
  if (format === "markdown") return <MarkdownView markdown={text} />;
  if (format === "json") return <JsonDocumentView text={text} />;
  return <pre className={`plain-text-view ${PLAIN_TEXT_VIEW} [overflow-wrap:anywhere]`}>{text}</pre>;
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
  const [documentView, setDocumentView] = useState<"render" | "source">(snapshot.documentMode === "edit" ? "source" : "render");
  const [reviewCurrent, setReviewCurrent] = useState(false);
  const masterRef = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const normalizedQuery = query.trim();
  const searchActive = normalizedQuery.length > 0;
  const rows = useMemo<DocumentRow[]>(() => searchActive
    ? snapshot.documentSearch.items.map((value) => ({ type: "search", value }))
    : (page.items as Array<DocumentDto | DocumentDetailDto>).map((value) => ({ type: "document", value })), [page.items, searchActive, snapshot.documentSearch.items]);
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
    estimateSize: () => ROW_SIZE,
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
  useEffect(() => setDocumentView(snapshot.documentMode === "edit" ? "source" : "render"), [snapshot.documentMode, snapshot.selectedDocument?.id]);
  useEffect(() => setReviewCurrent(false), [snapshot.documentConflict, snapshot.selectedDocument?.id]);

  const open = async (row: DocumentRow) => {
    const documentId = row.type === "search" ? row.value.documentId : row.value.id;
    if (snapshot.selectedDocument?.id !== documentId && snapshot.documentMode === "edit") {
      if (snapshot.documentDirty && !window.confirm("Discard unsaved document changes?")) return;
      controller.cancelDocumentEdit();
    }
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
  return <InstrumentScreenRoot descriptor={documentsInstrumentStates} state={documentsInstrumentState(page, snapshot)}><div className="documents-workbench grid h-full min-h-0 w-full min-w-0 grid-cols-(--project-documents-columns) gap-2 @max-project-split/project-domain:grid-cols-1 @max-project-stack/project-domain:grid-rows-(--project-split-rows)">
    <div className="documents-master relative min-h-0 min-w-0 overflow-auto overscroll-contain bg-transparent p-2 [scrollbar-gutter:stable]" role="region" aria-label="Documents" ref={attachMaster} onScroll={masterScroll.onScroll}>
      <div className="document-search sticky top-0 z-raised mb-3 flex h-control-md items-center gap-2 rounded-control bg-surface px-3 text-muted">
        <Search className="shrink-0" aria-hidden="true" size={13} />
        <label className="sr-only" htmlFor="document-search">Search documents</label>
        <input className="w-full min-w-0 border-0 bg-transparent type-sm text-ink" id="document-search" type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search documents" />
      </div>
      {searchActive && search.status === "loading" && search.items.length === 0 && <div className="project-skeleton" role="status">Searching…</div>}
      {searchActive && search.status === "error" && search.items.length === 0 && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{search.appendError}</span><button className="command-button" type="button" onClick={() => { void controller.retryDocumentSearchAppend(); }}>Retry</button></div>}
      {rows.length === 0 && !(searchActive && search.status === "loading") && <div className="empty-section">{searchActive ? "No documents match this search." : "No documents yet."}</div>}
      <div className="documents-virtual-list relative w-full" style={{ height: virtualizer.getTotalSize() + LIST_EDGE * 2 }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          const documentId = row.type === "search" ? row.value.documentId : row.value.id;
          const title = row.type === "search" ? row.value.documentTitle : row.value.title;
          const format = row.type === "search" ? row.value.format : currentFormat(row.value);
          const meta = row.type === "search"
            ? `${row.value.kind} · Revision ${row.value.revisionNo}`
            : `${formatLabel(format)} · ${row.value.kind} · ${formatDocumentDate(row.value.updatedAt)}`;
          return <button
            className={`document-row absolute top-0 left-0 grid w-full grid-cols-(--project-document-row-columns) items-center gap-3 rounded-control px-2 py-1.5 text-left type-sm focus-visible:-outline-offset-2 ${selected?.id === documentId ? "is-selected bg-instrument text-on-instrument [&_small]:text-on-instrument-muted [&_strong]:text-on-instrument" : "bg-transparent text-ink hover:bg-surface"}`}
            type="button"
            disabled={snapshot.documentSaving}
            aria-pressed={selected?.id === documentId}
            aria-label={`Open ${title}`}
            key={item.key}
            onClick={() => { void open(row); }}
            style={{ transform: `translateY(${item.start + LIST_EDGE}px)`, height: item.size - ROW_GAP }}
          ><FormatBadge format={format} row /><span className="min-w-0"><strong className="block truncate">{title}</strong><small className="mt-0.5 block truncate type-sm text-muted">{meta}</small></span></button>;
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
    <section className={`documents-detail document-preview min-h-0 min-w-0 overflow-auto overscroll-contain rounded-cell bg-surface-sunken [scrollbar-gutter:stable] has-[>.empty-section]:grid has-[>.empty-section]:place-items-center has-[>.empty-section]:bg-transparent ${DOCUMENT_CANVAS}`} aria-label="Document detail" ref={detailScroll.ref} onScroll={detailScroll.onScroll}>
      {!selected && <div className="empty-section w-project-plate rounded-cell bg-surface-sunken p-6 text-center">Select a document to open it.</div>}
      {selected && <>
        <header className="document-detail-header sticky top-0 z-raised flex min-h-document-header flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3">
          <div className="document-detail-identity flex min-w-0 items-center gap-2">
            <FormatBadge format={displayFormat} />
            <div className="min-w-0"><h2 className="document-detail-heading m-0 truncate type-lg font-normal focus-visible:-outline-offset-2" tabIndex={-1} ref={detailHeading}>{displayTitle}</h2><p className="m-0 mt-0.75 type-xs text-muted">{selected.kind}{revision ? ` · Revision ${revision.revisionNo}` : " · No revision"}{snapshot.documentDirty ? " · Unsaved" : ""}</p></div>
          </div>
          <div className="document-header-actions ml-auto flex min-w-0 items-center gap-2">
            <GooeyTabs<"render" | "source"> tabs={documentViewTabs} value={documentView} onValueChange={setDocumentView} size="s" ariaLabel="Document view" />
            {snapshot.documentMode === "read"
              ? <button className="command-button" type="button" disabled={snapshot.documentSaving || Boolean(selected.currentRevisionId && (snapshot.documentPreview.status !== "ready" || !snapshot.documentPreview.value || snapshot.documentPreview.value.truncated))} aria-describedby={snapshot.documentPreview.value?.truncated ? "document-truncated-note" : undefined} onClick={() => controller.beginDocumentEdit()}>Edit</button>
              : <div className="document-actions flex min-w-0 items-center gap-2"><button className="command-button" type="button" disabled={snapshot.documentSaving} onClick={() => controller.cancelDocumentEdit()}>Cancel</button><button className="command-button" type="button" disabled={snapshot.documentSaving || !snapshot.documentDirty} onClick={() => { void controller.saveDocument(); }}>{snapshot.documentSaving ? "Saving…" : "Save"}</button></div>}
          </div>
          {draft && <div className="document-edit-fields flex w-full min-w-0 items-center gap-2"><label className="grid min-w-0 flex-1 gap-1 type-xs text-muted">Title<input className="h-control-md w-full min-w-0 rounded-control bg-surface-sunken px-2.5 text-ink focus-visible:-outline-offset-2" disabled={snapshot.documentSaving} value={draft.title ?? ""} onChange={(event) => controller.setDocumentDraftTitle(event.currentTarget.value)} /></label><fieldset className="document-format-options flex min-w-0 items-end gap-1 border-0 p-0" disabled={snapshot.documentSaving}><legend className="sr-only">Format</legend>{(["markdown", "json", "text"] as const).map((format) => <button className={`command-button h-control-md w-full min-w-0 rounded-control focus-visible:-outline-offset-2 ${draft.format === format ? "bg-desk-primary text-desk-primary-ink" : "bg-surface-sunken text-ink"}`} type="button" disabled={snapshot.documentSaving} aria-pressed={draft.format === format} key={format} onClick={() => controller.setDocumentDraftFormat(format)}>{formatLabel(format)}</button>)}</fieldset></div>}
        </header>
        {snapshot.documentConflict && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentConflict}</span>{snapshot.documentConflictReview && snapshot.documentPreview.value && <button className="command-button" type="button" onClick={() => setReviewCurrent(true)}>Review current</button>}</div>}
        {snapshot.documentPreview.status === "loading" && <div className="project-skeleton" role="status">Loading document…</div>}
        {snapshot.documentPreview.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentPreview.error}</span><button className="command-button" type="button" onClick={() => { void controller.openDocument(selected); }}>Retry</button></div>}
        {draft && reviewCurrent && snapshot.documentPreview.value && <div className="document-current-review bg-transparent"><button className="command-button" type="button" onClick={() => setReviewCurrent(false)}>Back to edit</button><DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} /></div>}
        {draft && !reviewCurrent && documentView === "source" && <textarea className="document-editor m-3 min-h-80 w-[calc(100%_-_1.5rem)] resize-y rounded-control border-0 bg-surface px-3 py-2 type-base text-ink" aria-label="Document body" disabled={snapshot.documentSaving} value={draft.body} onChange={(event) => controller.setDocumentDraftBody(event.currentTarget.value)} />}
        {draft && !reviewCurrent && documentView === "render" && <DocumentContent format={draft.format} text={draft.body} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && documentView === "render" && <DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && documentView === "source" && <pre className={`plain-text-view document-source-view ${PLAIN_TEXT_VIEW} min-h-[calc(100%_-_74px)] [overflow-wrap:anywhere]`}>{snapshot.documentPreview.value.text}</pre>}
        {snapshot.documentPreview.value?.truncated && <p id="document-truncated-note">This bounded preview is read-only because the complete document was not loaded.</p>}
      </>}
    </section>
  </div></InstrumentScreenRoot>;
}
