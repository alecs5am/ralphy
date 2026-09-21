import { AlertCircle, Check, Copy, ExternalLink, Eye, FileText, Film, FolderOpen, GalleryHorizontalEnd, Image, LayoutGrid, MoreHorizontal, Music2, RefreshCw, Search } from "@/shared/ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectMediaFilter, ProjectMediaKind, ProjectMediaQuery } from "../../../../electron/media/types";
import type { MediaCardDto, MediaProvenance } from "../../../../electron/ralphy/types";
import type { ProjectSummary } from "@/shared/api/ipc";
import { MediaGallery } from "./MediaGallery";
import { VirtualAssetGrid } from "./VirtualAssetGrid";
import { SelectMenu, type SelectMenuOption } from "@/shared/ui/SelectMenu";
import { SegmentedControl, type SegmentedControlOption } from "@/shared/ui/SegmentedControl";
import { SnappySlider } from "@/shared/ui/SnappySlider";
import { bridge } from "@/shared/api/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "@/shared/instrument/screen-state-registry";
import type { DomainPage } from "@/entities/project";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../model/screen-controller";
import { Keycap } from "@/shared/ui/Keycap";
import { useMediaReview } from "@/features/media-review";
import { COMMAND_BUTTON, EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_LOCAL_ERROR_ROW, PROJECT_SKELETON } from "@/shared/ui/route-chrome";

const lifecycleOptions: Array<SelectMenuOption<ProjectMediaFilter>> = [
  ["all", "All"], ["references", "References"], ["working", "Working"], ["candidate", "Candidate"],
  ["approved", "Approved"], ["rejected", "Rejected"], ["superseded", "Superseded"],
  ["run-diagnostics", "Run diagnostics"], ["run-cache-temp", "Cache/temp"], ["advanced-objects", "Advanced objects"],
].map(([value, label]) => ({ value, label } as SelectMenuOption<ProjectMediaFilter>));
const kindOptions: Array<SegmentedControlOption<"all" | ProjectMediaKind>> = [
  { value: "all", label: "All", icon: <LayoutGrid size={14} aria-hidden="true" /> },
  { value: "image", label: "Images", icon: <Image size={14} aria-hidden="true" /> },
  { value: "video", label: "Video", icon: <Film size={14} aria-hidden="true" /> },
  { value: "audio", label: "Audio", icon: <Music2 size={14} aria-hidden="true" /> },
  { value: "document", label: "Documents", icon: <FileText size={14} aria-hidden="true" /> },
  { value: "other", label: "Other", icon: <MoreHorizontal size={14} aria-hidden="true" /> },
];
const provenanceOptions: Array<SelectMenuOption<"all" | MediaProvenance>> = [
  { value: "all", label: "All" }, { value: "generation", label: "Generated" },
  { value: "not-generation", label: "Not generated" }, { value: "unknown", label: "Unknown" },
];
const sortOptions: Array<SelectMenuOption<NonNullable<ProjectMediaQuery["sort"]>>> = [
  { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
  { value: "selected", label: "Recently selected" }, { value: "name", label: "Name" }, { value: "size", label: "Largest first" },
];
const viewOptions: Array<SegmentedControlOption<"grid" | "gallery">> = [
  { value: "grid", label: "Grid view", icon: <LayoutGrid size={14} aria-hidden="true" /> },
  { value: "gallery", label: "Gallery view", icon: <GalleryHorizontalEnd size={14} aria-hidden="true" /> },
];
const SELECT = "flex h-8 items-center gap-1.5 rounded-control bg-surface-sunken px-2 type-xs text-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const densityStops = [150, 170, 190, 210, 230, 250, 270, 290, 310];

type ContextState = { card: MediaCardDto; x: number; y: number; opener: HTMLElement } | null;

/* The asset context menu. It is positioned against the window rather than mounted in a portal, but
   it stands on the same black plate every menu in the app does, so its rows keep the on-dark pair
   in both themes: the sheet reached for `--control-hover` / `--control-text-hover`, which resolve
   to the light-widget family inside `.app-mode-work` and painted a white pill with a #4A4A48 rest
   ink -- 2.08:1 -- on a #141414 menu. Rows are pills, not the R10 the sheet gave them: R999 is the
   radius the design assigns a control. `corner-shape` has no utility form. */
const MENU = "asset-context-menu fixed z-popover grid w-54 rounded-menu bg-instrument p-1.5 [corner-shape:squircle]";
const MENU_NOTE = "px-2 pb-1 pt-1.5 font-code type-mono-sm leading-row tracking-mono text-on-instrument-muted-decorative";
const MENU_RULE = "mx-2 my-1 h-px bg-on-instrument/12";
const MENU_ROW = "grid h-control-md w-full grid-cols-(--asset-menu-row-columns) items-center gap-2 rounded-control px-2 text-left text-on-instrument-muted hover:bg-instrument-hover hover:text-on-instrument focus-visible:bg-instrument-hover focus-visible:text-on-instrument focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument";

export const mediaInstrumentStates = defineInstrumentScreenStates({
  routeKey: "project.media",
  states: ["loading", "ready", "empty", "partial", "error", "selected", "viewer"],
  rootMarker: "project-media",
  landmarks: ["Project media", "Media filters"],
} as const);

export function mediaInstrumentState(page: DomainPage, snapshot: ProjectScreenSnapshot): InstrumentScenarioState {
  if (snapshot.mediaViewerOpen) return "viewer";
  if (snapshot.selectedMedia) return "selected";
  if (page.status === "loading" && page.items.length === 0) return "loading";
  if (page.status === "error" && page.items.length === 0) return "error";
  if (page.items.length === 0) return "empty";
  return page.status === "loading" || page.status === "error" ? "partial" : "ready";
}

export function MediaPanel({ page, controller, snapshot, project, workspaceName, rootEpoch, scrollMemory, scrollResetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  project: ProjectSummary;
  workspaceName: string | null;
  rootEpoch: number;
  scrollMemory: Map<string, number>;
  scrollResetToken: string;
}) {
  const [density, setDensity] = useState(190);
  const [view, setView] = useState<"grid" | "gallery">("grid");
  const query = snapshot.domain.media;
  const [search, setSearch] = useState(query.search ?? "");
  useEffect(() => setSearch(controller.getSnapshot().domain.media.search ?? ""), [controller]);
  useEffect(() => {
    if (search.trim() === (query.search ?? "")) return;
    const timer = window.setTimeout(() => { void controller.setMediaQuery({ search: search.trim() || undefined }); }, 250);
    return () => window.clearTimeout(timer);
  }, [controller, query.search, search]);
  const [context, setContext] = useState<ContextState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const review = useMediaReview({ workspaceName, project, rootEpoch, onSaved: () => { void controller.retry(); } });
  const menuRef = useRef<HTMLDivElement>(null);
  const closeContext = useCallback((restore = true) => {
    setContext((current) => {
      if (restore && current?.opener.isConnected) queueMicrotask(() => current.opener.focus({ preventScroll: true }));
      return null;
    });
  }, []);

  useEffect(() => {
    if (!context) return;
    queueMicrotask(() => menuRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }));
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) closeContext(); };
    const focusChanged = (event: FocusEvent) => { if (!menuRef.current?.contains(event.target as Node)) closeContext(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeContext(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("focusin", focusChanged);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("focusin", focusChanged);
      document.removeEventListener("keydown", escape);
    };
  }, [closeContext, context]);

  const openContext = (card: MediaCardDto, point: { x: number; y: number }) => {
    const opener = document.activeElement;
    if (!(opener instanceof HTMLElement)) return;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    setActionError(null);
    setContext({
      card,
      x: Math.max(8, Math.min(point.x, viewportWidth - 224)),
      y: Math.max(8, Math.min(point.y, viewportHeight - 148)),
      opener,
    });
  };
  const action = async (kind: "preview" | "open" | "finder" | "copy") => {
    if (!context) return;
    const { card, opener } = context;
    setContext(null);
    if (opener.isConnected) opener.focus({ preventScroll: true });
    if (kind === "preview") { await controller.openMediaViewer(card); return; }
    try { await bridge.performProjectMediaAction(snapshot.domain.project, card.ref, kind); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Media action could not be completed."); }
  };

  if (page.status === "error" && page.items.length === 0) return <InstrumentScreenRoot descriptor={mediaInstrumentStates} state="error"><div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{page.error ?? "Media could not be loaded."}</span><button className={COMMAND_BUTTON} type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div></InstrumentScreenRoot>;
  return <InstrumentScreenRoot descriptor={mediaInstrumentStates} state={mediaInstrumentState(page, snapshot)}><section className="media-panel relative flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1 overflow-hidden bg-transparent p-0 type-base text-ink [&_.media-card-tile.is-selected]:bg-chip [&_.media-card-tile.is-selected]:shadow-none" aria-label="Project media">
    <div className="media-domain-toolbar m-0 flex min-h-8 w-full min-w-0 flex-none flex-wrap items-center gap-1" aria-label="Media filters">
      <label className="flex h-8 min-w-32 flex-1 items-center gap-2 rounded-control bg-surface-sunken px-2 text-muted">
        <Search size={14} aria-hidden="true" />
        <input className="min-w-0 flex-1 border-0 bg-transparent type-base text-ink placeholder:text-muted" type="search" data-media-focus-fallback="true" maxLength={256} aria-label="Search project media" placeholder="Search media" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
      </label>
      <SegmentedControl value={query.mediaKind ?? "all"} options={kindOptions} ariaLabel="Media type" onValueChange={(mediaKind) => { void controller.setMediaQuery({ mediaKind: mediaKind === "all" ? undefined : mediaKind }); }} />
      <SelectMenu tone="caller" className={SELECT} overlayOwner="project.media" value={query.sort ?? "newest"} options={sortOptions} ariaLabel="Sort media" onValueChange={(sort) => { void controller.setMediaQuery({ sort }); }} />
      <details className="relative shrink-0" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
        <summary className={`${SELECT} cursor-pointer list-none`}>Filters{query.filter !== "all" || query.provenance ? " · Active" : ""}</summary>
        <div className="absolute right-0 top-full z-popover mt-1 grid min-w-media-filter gap-2 rounded-menu bg-card p-2">
          <div className="grid gap-1"><span className="type-xs text-muted">Lifecycle or source</span><SelectMenu tone="caller" className={`${SELECT} w-full min-w-media-filter`} overlayOwner="project.media" value={query.filter} options={lifecycleOptions} ariaLabel="Lifecycle or source" onValueChange={(filter) => { void controller.setMediaQuery({ filter }); }} /></div>
          <div className="grid gap-1"><span className="type-xs text-muted">Generation</span><SelectMenu tone="caller" className={`${SELECT} w-full min-w-media-filter`} overlayOwner="project.media" value={query.provenance ?? "all"} options={provenanceOptions} ariaLabel="Generation provenance" onValueChange={(provenance) => { void controller.setMediaQuery({ provenance: provenance === "all" ? undefined : provenance }); }} /></div>
          {(query.filter !== "all" || query.provenance) && <button type="button" className={SELECT} onClick={() => { void controller.setMediaQuery({ filter: "all", provenance: undefined }); }}>Clear filters</button>}
        </div>
      </details>
      <SegmentedControl<"grid" | "gallery"> value={view} options={viewOptions} ariaLabel="Media view" onValueChange={setView} />
      {view === "grid" && <div className="grid-size-control flex h-8 flex-none items-center gap-2 rounded-control bg-surface-sunken px-2 type-sm text-muted [&_.snappy-slider]:w-grid-density" title="Grid density"><LayoutGrid size={15} aria-hidden="true" /><SnappySlider value={density} min={150} max={310} step={20} values={densityStops} defaultValue={190} ariaLabel="Grid density" onValueChange={setDensity} /></div>}
    </div>
    {actionError && <div className={`${PROJECT_LOCAL_ERROR_ROW} media-action-error mb-2 min-h-9`} role="alert">{actionError}</div>}
    {page.status === "error" && page.items.length > 0 && page.nextCursor === null && <div className={`${PROJECT_LOCAL_ERROR_ROW} media-action-error mb-2 min-h-9`} role="alert"><span>{page.error ?? "Media could not be updated."}</span><button className={COMMAND_BUTTON} type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className="project-media-grid flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent p-0">
      {page.status === "loading" && page.items.length === 0 && <div className={PROJECT_SKELETON} role="status">Loading media…</div>}
      {page.status === "loading" && page.items.length === 0 ? null : page.status === "ready" && page.items.length === 0
        ? <div className={EMPTY_SECTION}>No media matches these filters.</div>
        : view === "grid"
          ? <VirtualAssetGrid key={scrollResetToken} items={page.items as MediaCardDto[]} project={snapshot.domain.project} rootEpoch={rootEpoch} selectedRef={snapshot.selectedMedia?.ref ?? null} resolvePreview={bridge.resolveProjectPreview} onSelect={(card) => controller.selectMedia(card)} onOpen={(card) => { void controller.openMediaViewer(card); }} onContextMenu={openContext} density={density} gap={4} hasMore={page.nextCursor !== null} loadingMore={page.status === "loading" && page.items.length > 0 && page.nextCursor !== null} appendError={page.status === "error" && page.items.length > 0 && page.nextCursor !== null ? page.error : null} onLoadMore={() => { void controller.loadMore("media"); }} onRetryAppend={() => { void controller.retryPage("media"); }} scrollMemory={scrollMemory} scrollKey="media" scrollResetToken={scrollResetToken} />
          : <MediaGallery items={page.items as MediaCardDto[]} project={snapshot.domain.project} rootEpoch={rootEpoch} selectedRef={snapshot.selectedMedia?.ref ?? null} resolvePreview={bridge.resolveProjectPreview} onSelect={(card) => controller.selectMedia(card)} onOpen={(card) => { void controller.openMediaViewer(card); }} onContextMenu={openContext} hasMore={page.nextCursor !== null} loadingMore={page.status === "loading" && page.items.length > 0 && page.nextCursor !== null} appendError={page.status === "error" && page.items.length > 0 && page.nextCursor !== null ? page.error : null} onLoadMore={() => { void controller.loadMore("media"); }} onRetryAppend={() => { void controller.retryPage("media"); }} />}
    </div>
    {context && <div ref={menuRef} className={MENU} data-instrument-overlay="media-context-menu" aria-label="Media actions" style={{ left: context.x, top: context.y }}>
      <button className={MENU_ROW} type="button" onClick={() => { void action("preview"); }}><Eye size={15} aria-hidden="true" />Preview</button>
      <button className={MENU_ROW} type="button" onClick={() => { void action("open"); }}><ExternalLink size={15} aria-hidden="true" />Open externally</button>
      <button className={MENU_ROW} type="button" onClick={() => { void action("finder"); }}><FolderOpen size={15} aria-hidden="true" />Reveal in Finder</button>
      <button className={MENU_ROW} type="button" onClick={() => { void action("copy"); }}><Copy size={15} aria-hidden="true" />Copy file</button>
      <i className={MENU_RULE} aria-hidden="true" />
      <p className={`${MENU_NOTE} m-0`}>REVIEW · {review.status(context.card).toUpperCase()}</p>
      {review.rows(context.card).map((row) => {
        const reasonId = `media-review-${row.verdict}-reason`;
        return <button
          className={`${MENU_ROW} grid-cols-(--asset-menu-verdict-columns) ${row.active ? "is-active text-on-instrument" : ""}`}
          type="button"
          key={row.verdict}
          aria-pressed={row.active}
          aria-disabled={row.disabled || undefined}
          aria-describedby={row.disabled ? reasonId : undefined}
          onClick={(event) => { if (row.disabled) { event.preventDefault(); return; } setContext(null); review.choose(context.card, row.verdict); }}
        >
          <span className="truncate">{row.label}</span>
          <span className="flex items-center gap-1.5">{row.active && <Check size={15} aria-hidden="true" />}<Keycap tokens={[row.hotkey]} tone="on-dark" /></span>
          {row.disabled && <span id={reasonId} hidden>{review.note}</span>}
        </button>;
      })}
      <p className={`${MENU_NOTE} m-0`}>{review.note}</p>
    </div>}
    {review.dialog}
  </section></InstrumentScreenRoot>;
}
