import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Braces, FileText, Pilcrow, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DocumentDetailDto, DocumentDto, DocumentSearchDto } from "../../../electron/ralphy/types";
import { JsonDocumentView } from "../../components/JsonDocumentView";
import { MarkdownView } from "../../components/MarkdownView";
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

function FormatBadge({ format }: { format: string | null }) {
  return <span className={`document-format-badge format-${format ?? "unknown"} inline-flex min-w-9 items-center justify-center gap-1 rounded-full bg-surface px-1.5 py-1 type-meta text-muted`}><FormatIcon format={format} />{formatLabel(format)}</span>;
}

export function DocumentContent({ format, text }: { format: string; text: string }) {
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
  return <InstrumentScreenRoot descriptor={documentsInstrumentStates} state={documentsInstrumentState(page, snapshot)}><div className="documents-workbench">
    <div className="documents-master min-h-0 overflow-auto bg-transparent p-2" role="region" aria-label="Documents" ref={attachMaster} onScroll={masterScroll.onScroll}>
      <div className="document-search rounded-control bg-surface px-3">
        <Search aria-hidden="true" size={13} />
        <label className="sr-only" htmlFor="document-search">Search documents</label>
        <input id="document-search" type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search documents" />
      </div>
      {searchActive && search.status === "loading" && search.items.length === 0 && <div className="project-skeleton" role="status">Searching…</div>}
      {searchActive && search.status === "error" && search.items.length === 0 && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{search.appendError}</span><button className="command-button" type="button" onClick={() => { void controller.retryDocumentSearchAppend(); }}>Retry</button></div>}
      {rows.length === 0 && !(searchActive && search.status === "loading") && <div className="empty-section">{searchActive ? "No documents match this search." : "No documents yet."}</div>}
      <div className="documents-virtual-list" style={{ height: virtualizer.getTotalSize() + LIST_EDGE * 2 }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          const documentId = row.type === "search" ? row.value.documentId : row.value.id;
          const title = row.type === "search" ? row.value.documentTitle : row.value.title;
          const format = row.type === "search" ? row.value.format : currentFormat(row.value);
          const meta = row.type === "search"
            ? `${row.value.kind} · Revision ${row.value.revisionNo}`
            : `${formatLabel(format)} · ${row.value.kind} · ${formatDocumentDate(row.value.updatedAt)}`;
          return <button
            className={`document-row w-full rounded-control px-2 text-left type-sm ${selected?.id === documentId ? "is-selected bg-instrument text-on-instrument [&_small]:text-on-instrument-muted [&_strong]:text-on-instrument" : "bg-transparent text-ink hover:bg-surface"}`}
            type="button"
            disabled={snapshot.documentSaving}
            aria-pressed={selected?.id === documentId}
            aria-label={`Open ${title}`}
            key={item.key}
            onClick={() => { void open(row); }}
            style={{ transform: `translateY(${item.start + LIST_EDGE}px)`, height: item.size - ROW_GAP }}
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
    <section className="documents-detail document-preview min-h-0 overflow-auto rounded-cell bg-surface-sunken" aria-label="Document detail" ref={detailScroll.ref} onScroll={detailScroll.onScroll}>
      {!selected && <div className="empty-section">Select a document to open it.</div>}
      {selected && <>
        <header className="document-detail-header bg-surface px-4 py-3">
          <div className="document-detail-identity">
            <FormatBadge format={displayFormat} />
            <div><h2 className="document-detail-heading" tabIndex={-1} ref={detailHeading}>{displayTitle}</h2><p>{selected.kind}{revision ? ` · Revision ${revision.revisionNo}` : " · No revision"}{snapshot.documentDirty ? " · Unsaved" : ""}</p></div>
          </div>
          <div className="document-header-actions">
            <GooeyTabs<"render" | "source"> tabs={documentViewTabs} value={documentView} onValueChange={setDocumentView} size="s" ariaLabel="Document view" />
            {snapshot.documentMode === "read"
              ? <button className="command-button" type="button" disabled={snapshot.documentSaving || Boolean(selected.currentRevisionId && (snapshot.documentPreview.status !== "ready" || !snapshot.documentPreview.value || snapshot.documentPreview.value.truncated))} aria-describedby={snapshot.documentPreview.value?.truncated ? "document-truncated-note" : undefined} onClick={() => controller.beginDocumentEdit()}>Edit</button>
              : <div className="document-actions"><button className="command-button" type="button" disabled={snapshot.documentSaving} onClick={() => controller.cancelDocumentEdit()}>Cancel</button><button className="command-button" type="button" disabled={snapshot.documentSaving || !snapshot.documentDirty} onClick={() => { void controller.saveDocument(); }}>{snapshot.documentSaving ? "Saving…" : "Save"}</button></div>}
          </div>
          {draft && <div className="document-edit-fields"><label>Title<input disabled={snapshot.documentSaving} value={draft.title ?? ""} onChange={(event) => controller.setDocumentDraftTitle(event.currentTarget.value)} /></label><fieldset className="document-format-options" disabled={snapshot.documentSaving}><legend>Format</legend>{(["markdown", "json", "text"] as const).map((format) => <button className="command-button" type="button" disabled={snapshot.documentSaving} aria-pressed={draft.format === format} key={format} onClick={() => controller.setDocumentDraftFormat(format)}>{formatLabel(format)}</button>)}</fieldset></div>}
        </header>
        {snapshot.documentConflict && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentConflict}</span>{snapshot.documentConflictReview && snapshot.documentPreview.value && <button className="command-button" type="button" onClick={() => setReviewCurrent(true)}>Review current</button>}</div>}
        {snapshot.documentPreview.status === "loading" && <div className="project-skeleton" role="status">Loading document…</div>}
        {snapshot.documentPreview.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentPreview.error}</span><button className="command-button" type="button" onClick={() => { void controller.openDocument(selected); }}>Retry</button></div>}
        {draft && reviewCurrent && snapshot.documentPreview.value && <div className="document-current-review bg-transparent"><button className="command-button" type="button" onClick={() => setReviewCurrent(false)}>Back to edit</button><DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} /></div>}
        {draft && !reviewCurrent && documentView === "source" && <textarea className="document-editor m-3 min-h-80 w-[calc(100%_-_1.5rem)] resize-y rounded-control bg-surface px-3 py-2 type-base text-ink outline-none" aria-label="Document body" disabled={snapshot.documentSaving} value={draft.body} onChange={(event) => controller.setDocumentDraftBody(event.currentTarget.value)} />}
        {draft && !reviewCurrent && documentView === "render" && <DocumentContent format={draft.format} text={draft.body} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && documentView === "render" && <DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && documentView === "source" && <pre className="plain-text-view document-source-view">{snapshot.documentPreview.value.text}</pre>}
        {snapshot.documentPreview.value?.truncated && <p id="document-truncated-note">This bounded preview is read-only because the complete document was not loaded.</p>}
      </>}
    </section>
  </div></InstrumentScreenRoot>;
}
