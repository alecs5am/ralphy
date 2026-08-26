import { AlertCircle, Check, Copy, ExternalLink, Eye, FolderOpen, GalleryHorizontalEnd, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectMediaFilter, ProjectMediaKind } from "../../../electron/media/types";
import type { MediaCardDto, MediaProvenance } from "../../../electron/ralphy/types";
import type { ProjectSummary } from "../../lib/ipc";
import { VirtualAssetGrid } from "../../components/VirtualAssetGrid";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { SnappySlider } from "../../components/ui/SnappySlider";
import { bridge } from "../../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "../../instrument/screen-state-registry";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { Keycap } from "../../components/ui/Keycap";
import { useMediaReview } from "./media-review-menu";
import { COMMAND_BUTTON, EMPTY_SECTION, PROJECT_LOCAL_ERROR, PROJECT_LOCAL_ERROR_ROW, PROJECT_SKELETON } from "../route-chrome";

const lifecycleOptions: Array<SelectMenuOption<ProjectMediaFilter>> = [
  ["all", "All"], ["references", "References"], ["working", "Working"], ["candidate", "Candidate"],
  ["approved", "Approved"], ["rejected", "Rejected"], ["superseded", "Superseded"],
  ["run-diagnostics", "Run diagnostics"], ["run-cache-temp", "Cache/temp"], ["advanced-objects", "Advanced objects"],
].map(([value, label]) => ({ value, label } as SelectMenuOption<ProjectMediaFilter>));
const kindOptions: Array<SelectMenuOption<"all" | ProjectMediaKind>> = [
  { value: "all", label: "All" }, { value: "image", label: "Images" }, { value: "video", label: "Video" },
  { value: "audio", label: "Audio" }, { value: "document", label: "Documents" }, { value: "other", label: "Other" },
];
const provenanceOptions: Array<SelectMenuOption<"all" | MediaProvenance>> = [
  { value: "all", label: "All" }, { value: "generation", label: "Generated" },
  { value: "not-generation", label: "Not generated" }, { value: "unknown", label: "Unknown" },
];
// Density is a target tile width, so a hard 4-column cap swallowed the whole slider:
// every stop below 290 still resolved to 4 columns. The default stop keeps the approved
// 4-column mosaic at 1440 and the slider now walks 3 to 7 columns around it.
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
  const [density, setDensity] = useState(230);
  const [context, setContext] = useState<ContextState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const review = useMediaReview({ workspaceName, project, rootEpoch });
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
  const query = snapshot.domain.media;
  return <InstrumentScreenRoot descriptor={mediaInstrumentStates} state={mediaInstrumentState(page, snapshot)}><section className="media-panel relative flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden bg-transparent p-0 type-base text-ink [&_.media-card-tile.is-selected]:bg-instrument-hover [&_.media-card-tile.is-selected]:shadow-none [&_.media-card-tile.is-selected_strong]:text-on-instrument [&_.media-card-tile.is-selected_small]:text-on-instrument-muted" aria-label="Project media">
    <div className="media-domain-toolbar m-0 flex min-h-11 w-full max-w-none flex-none flex-wrap items-center gap-2 rounded-cell bg-surface-sunken p-2 [&_.select-menu-trigger]:min-w-media-filter" aria-label="Media filters">
      <SelectMenu overlayOwner="project.media" value={query.filter} options={lifecycleOptions} ariaLabel="Lifecycle or source" prefix="Source" onValueChange={(filter) => { void controller.setMediaQuery({ filter }); }} />
      <SelectMenu overlayOwner="project.media" value={query.mediaKind ?? "all"} options={kindOptions} ariaLabel="Media type" prefix="Type" onValueChange={(mediaKind) => { void controller.setMediaQuery({ mediaKind: mediaKind === "all" ? undefined : mediaKind }); }} />
      <SelectMenu overlayOwner="project.media" value={query.provenance ?? "all"} options={provenanceOptions} ariaLabel="Generation provenance" prefix="Generation" onValueChange={(provenance) => { void controller.setMediaQuery({ provenance: provenance === "all" ? undefined : provenance }); }} />
      <span className="media-item-count ml-auto font-code type-xs whitespace-nowrap text-muted">{page.items.length.toLocaleString()} items</span>
      <div className="grid-size-control flex h-control-md min-w-32 flex-none items-center gap-2 rounded-control bg-surface-sunken px-2.75 type-sm text-muted [&_.snappy-slider]:w-grid-density" title="Grid density"><GalleryHorizontalEnd size={15} aria-hidden="true" /><SnappySlider value={density} min={150} max={310} step={20} values={densityStops} defaultValue={230} ariaLabel="Grid density" onValueChange={setDensity} /></div>
    </div>
    {actionError && <div className={`${PROJECT_LOCAL_ERROR_ROW} media-action-error mb-2 min-h-9`} role="alert">{actionError}</div>}
    {page.status === "error" && page.items.length > 0 && page.nextCursor === null && <div className={`${PROJECT_LOCAL_ERROR_ROW} media-action-error mb-2 min-h-9`} role="alert"><span>{page.error ?? "Media could not be updated."}</span><button className={COMMAND_BUTTON} type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className="project-media-grid flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent p-0 [&_.asset-grid-scroll]:min-h-90 [&_.asset-grid-scroll]:flex-1 [&_.asset-grid-scroll]:overflow-x-hidden [&_.asset-grid-scroll]:overflow-y-auto [&_.asset-grid-scroll]:p-0">
      {page.status === "loading" && page.items.length === 0 && <div className={PROJECT_SKELETON} role="status">Loading media…</div>}
      {page.status === "ready" && page.items.length === 0
        ? <div className={EMPTY_SECTION}>No media matches these filters.</div>
        : <VirtualAssetGrid key={scrollResetToken} items={page.items as MediaCardDto[]} project={snapshot.domain.project} rootEpoch={rootEpoch} selectedRef={snapshot.selectedMedia?.ref ?? null} resolvePreview={bridge.resolveProjectPreview} onSelect={(card) => controller.selectMedia(card)} onOpen={(card) => { void controller.openMediaViewer(card); }} onContextMenu={openContext} density={density} gap={10} hasMore={page.nextCursor !== null} loadingMore={page.status === "loading" && page.items.length > 0 && page.nextCursor !== null} appendError={page.status === "error" && page.items.length > 0 && page.nextCursor !== null ? page.error : null} onLoadMore={() => { void controller.loadMore("media"); }} onRetryAppend={() => { void controller.retryPage("media"); }} scrollMemory={scrollMemory} scrollKey="media" scrollResetToken={scrollResetToken} />}
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
          {row.active ? <Check size={15} aria-hidden="true" /> : <i aria-hidden="true" />}
          {row.label}
          <Keycap tokens={[row.hotkey]} tone="on-dark" />
          {row.disabled && <span id={reasonId} hidden>{review.note}</span>}
        </button>;
      })}
      <p className={`${MENU_NOTE} m-0`}>{review.note}</p>
    </div>}
    {review.dialog}
  </section></InstrumentScreenRoot>;
}
