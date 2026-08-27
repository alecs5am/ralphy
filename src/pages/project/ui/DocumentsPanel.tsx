import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Braces, FileText, Pilcrow, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DocumentDetailDto, DocumentDto, DocumentSearchDto } from "../../../../electron/ralphy/types";
import { entityDragProps } from "@/features/agent-chat";
import { JsonDocumentView } from "@/shared/ui/JsonDocumentView";
import { MarkdownView, PLAIN_TEXT_VIEW } from "@/shared/ui/MarkdownView";
import { GooeyTabs } from "@/shared/ui/GooeyTabs";
import { WINDOW, WINDOW_TITLEBAR } from "@/shared/ui/Window";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "@/shared/instrument/screen-state-registry";
import type { DomainPage } from "@/entities/project";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../model/screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "../lib/scroll-memory";
import { COMMAND_BUTTON, EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_SKELETON, STATE_BOX, STATE_INK } from "@/shared/ui/route-chrome";

type DocumentRow =
  | { type: "document"; value: DocumentDto }
  | { type: "search"; value: DocumentSearchDto };

const LIST_EDGE = 4;
const ROW_GAP = 4;
const ROW_SIZE = 48;

/**
 * A row in the list, and the pair that says which one is open.
 *
 * The selected row is the desk's own inversion rather than the fixed black widget it used to
 * paint: `bg-instrument` is black in both themes, so in the dark theme the open document was a
 * plate two steps off the ground it stood on and the ink was the same near-white as every
 * resting row. `desk-primary` flips -- black plate under the light theme, white under the dark
 * one -- and it is #141414 in the light theme, which is what the row already drew there. Every
 * ink inside the row has to travel with the plate, or a half-override paints invisible text --
 * the focus ring included. Each branch names its own, and only one of the two ever lands on the
 * element: reset.css paints the legacy near-white ring, which is invisible on a light ground and
 * invisible again on the pale plate the inversion becomes under the dark theme.
 */
const ROW = "document-row absolute top-0 left-0 grid w-full grid-cols-(--project-document-row-columns) items-center gap-2.5 rounded-row px-2.5 py-1.5 text-left type-sm focus-visible:-outline-offset-2";
const ROW_SELECTED = "is-selected bg-desk-primary text-desk-primary-ink focus-visible:outline-desk-primary-ink [&_.document-format-badge]:text-desk-primary-ink [&_small]:text-desk-primary-ink [&_strong]:text-desk-primary-ink";
const ROW_RESTING = "bg-transparent text-ink hover:bg-surface focus-visible:outline-ink";

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

/**
 * The format, twice over in two shapes.
 *
 * In a row it is a bare mono word: the plated pill it used to be put a second object in every
 * row, 62px wide, saying what the row's own meta line said again three words later. In the
 * titlebar it keeps the pill and the glyph -- there is one of them, it stands for the document,
 * and it is the only thing on that line that is not text.
 */
function FormatBadge({ format, row = false }: { format: string | null; row?: boolean }) {
  const name = `document-format-badge format-${format ?? "unknown"}`;
  if (row) return <span className={`${name} truncate text-right font-code type-mono-sm text-muted`}>{formatLabel(format)}</span>;
  return <span className={`${name} inline-flex h-6 min-w-9 flex-none items-center justify-center gap-1 rounded-full bg-surface px-1.5 font-code type-meta text-muted`}><FormatIcon format={format} />{formatLabel(format)}</span>;
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
      {searchActive && search.status === "loading" && search.items.length === 0 && <div className={PROJECT_SKELETON} role="status">Searching…</div>}
      {searchActive && search.status === "error" && search.items.length === 0 && <div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{search.appendError}</span><button className={COMMAND_BUTTON} type="button" onClick={() => { void controller.retryDocumentSearchAppend(); }}>Retry</button></div>}
      {rows.length === 0 && !(searchActive && search.status === "loading") && <div className={EMPTY_SECTION}>{searchActive ? "No documents match this search." : "No documents yet."}</div>}
      <div className="documents-virtual-list relative w-full" style={{ height: virtualizer.getTotalSize() + LIST_EDGE * 2 }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          const documentId = row.type === "search" ? row.value.documentId : row.value.id;
          const title = row.type === "search" ? row.value.documentTitle : row.value.title;
          const format = row.type === "search" ? row.value.format : currentFormat(row.value);
          const meta = row.type === "search"
            ? `${row.value.kind} · Revision ${row.value.revisionNo}`
            : `${row.value.kind} · ${formatDocumentDate(row.value.updatedAt)}`;
          const slug = "slug" in row.value && typeof row.value.slug === "string" ? row.value.slug : documentId;
          return <button
            {...entityDragProps({ kind: "file", ref: slug, label: title })}
            className={`${ROW} ${selected?.id === documentId ? ROW_SELECTED : ROW_RESTING}`}
            type="button"
            disabled={snapshot.documentSaving}
            aria-pressed={selected?.id === documentId}
            aria-label={`Open ${title}`}
            key={item.key}
            onClick={() => { void open(row); }}
            style={{ transform: `translateY(${item.start + LIST_EDGE}px)`, height: item.size - ROW_GAP }}
          ><FormatBadge format={format} row /><span className="min-w-0"><strong className="block truncate font-normal">{title}</strong><small className="block truncate type-xs text-muted">{meta}</small></span></button>;
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
    {/* The detail is a window like every other reading surface in the app: the identity and the
        two view controls stand on the panel in one titlebar line, and the document itself is the
        card inside it. It used to be a sunken slab with a light band stuck to the top, which put
        the prose on the one surface the app uses for recesses. The edit fields moved off the
        titlebar and into the card with the work they belong to -- a titlebar is one line.
        `.documents-detail` stays the scroller, so it states `rounded-frame bg-card` rather than
        reading `WINDOW_PLATE`: the plate clips with `overflow-hidden`, and two `overflow`
        utilities on one element resolve by stylesheet order rather than markup order. */}
    <div className={`documents-detail-window ${WINDOW}`}>
      {selected && <header className={`document-detail-header ${WINDOW_TITLEBAR}`}>
        <FormatBadge format={displayFormat} />
        {/* Focus lands here when a row opens, so a reader is told which document it is -- and the
            focus contract wants that visible. It states the theme ink: this line stands on the
            panel now, where reset.css\'s legacy ring resolves to the near-white on-dark colour. */}
        <h2 className="document-detail-heading m-0 min-w-0 flex-none truncate type-lg font-normal focus-visible:outline-ink focus-visible:-outline-offset-2" tabIndex={-1} ref={detailHeading}>{displayTitle}</h2>
        <p className="m-0 min-w-0 flex-1 truncate type-xs text-muted">{selected.kind}{revision ? ` · Revision ${revision.revisionNo}` : " · No revision"}{snapshot.documentDirty ? " · Unsaved" : ""}</p>
        <div className="document-header-actions flex min-w-0 flex-none items-center gap-2">
          <GooeyTabs<"render" | "source"> tabs={documentViewTabs} value={documentView} onValueChange={setDocumentView} size="s" ariaLabel="Document view" />
          {snapshot.documentMode === "read"
            ? <button className={COMMAND_BUTTON} type="button" disabled={snapshot.documentSaving || Boolean(selected.currentRevisionId && (snapshot.documentPreview.status !== "ready" || !snapshot.documentPreview.value || snapshot.documentPreview.value.truncated))} aria-describedby={snapshot.documentPreview.value?.truncated ? "document-truncated-note" : undefined} onClick={() => controller.beginDocumentEdit()}>Edit</button>
            : <div className="document-actions flex min-w-0 items-center gap-2"><button className={COMMAND_BUTTON} type="button" disabled={snapshot.documentSaving} onClick={() => controller.cancelDocumentEdit()}>Cancel</button><button className={COMMAND_BUTTON} type="button" disabled={snapshot.documentSaving || !snapshot.documentDirty} onClick={() => { void controller.saveDocument(); }}>{snapshot.documentSaving ? "Saving…" : "Save"}</button></div>}
        </div>
      </header>}
      <section className={`documents-detail document-preview min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain rounded-frame bg-card [scrollbar-gutter:stable] has-[>.empty-section]:grid has-[>.empty-section]:place-items-center ${DOCUMENT_CANVAS}`} aria-label="Document detail" ref={detailScroll.ref} onScroll={detailScroll.onScroll}>
      {!selected && <div className={`empty-section ${STATE_BOX} min-h-24 ${STATE_INK} w-project-plate rounded-cell bg-surface p-6 text-center`}>Select a document to open it.</div>}
      {selected && <>
        {draft && <div className="document-edit-fields flex w-full min-w-0 items-center gap-2 px-3 pt-3"><label className="grid min-w-0 flex-1 gap-1 type-xs text-muted">Title<input className="h-control-md w-full min-w-0 rounded-control bg-surface-sunken px-2.5 text-ink focus-visible:-outline-offset-2" disabled={snapshot.documentSaving} value={draft.title ?? ""} onChange={(event) => controller.setDocumentDraftTitle(event.currentTarget.value)} /></label><fieldset className="document-format-options flex min-w-0 items-end gap-1 border-0 p-0" disabled={snapshot.documentSaving}><legend className="sr-only">Format</legend>{(["markdown", "json", "text"] as const).map((format) => <button className={`command-button h-control-md w-full min-w-0 rounded-control focus-visible:-outline-offset-2 ${draft.format === format ? "bg-desk-primary text-desk-primary-ink" : "bg-surface-sunken text-ink"}`} type="button" disabled={snapshot.documentSaving} aria-pressed={draft.format === format} key={format} onClick={() => controller.setDocumentDraftFormat(format)}>{formatLabel(format)}</button>)}</fieldset></div>}
        {snapshot.documentConflict && <div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentConflict}</span>{snapshot.documentConflictReview && snapshot.documentPreview.value && <button className={COMMAND_BUTTON} type="button" onClick={() => setReviewCurrent(true)}>Review current</button>}</div>}
        {snapshot.documentPreview.status === "loading" && <div className={PROJECT_SKELETON} role="status">Loading document…</div>}
        {snapshot.documentPreview.status === "error" && <div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.documentPreview.error}</span><button className={COMMAND_BUTTON} type="button" onClick={() => { void controller.openDocument(selected); }}>Retry</button></div>}
        {draft && reviewCurrent && snapshot.documentPreview.value && <div className="document-current-review bg-transparent"><button className={COMMAND_BUTTON} type="button" onClick={() => setReviewCurrent(false)}>Back to edit</button><DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} /></div>}
        {draft && !reviewCurrent && documentView === "source" && <textarea className="document-editor m-3 block min-h-80 w-auto resize-y rounded-field border-0 bg-surface-sunken px-3 py-2 type-base text-ink" aria-label="Document body" disabled={snapshot.documentSaving} value={draft.body} onChange={(event) => controller.setDocumentDraftBody(event.currentTarget.value)} />}
        {draft && !reviewCurrent && documentView === "render" && <DocumentContent format={draft.format} text={draft.body} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && documentView === "render" && <DocumentContent format={snapshot.documentPreview.value.format} text={snapshot.documentPreview.value.text} />}
        {snapshot.documentMode === "read" && snapshot.documentPreview.status === "ready" && snapshot.documentPreview.value && documentView === "source" && <pre className={`plain-text-view document-source-view ${PLAIN_TEXT_VIEW} min-h-full [overflow-wrap:anywhere]`}>{snapshot.documentPreview.value.text}</pre>}
        {snapshot.documentPreview.value?.truncated && <p id="document-truncated-note">This bounded preview is read-only because the complete document was not loaded.</p>}
      </>}
      </section>
    </div>
  </div></InstrumentScreenRoot>;
}
