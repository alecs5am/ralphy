import { AlertCircle, Copy, ExternalLink, Eye, FolderOpen, GalleryHorizontalEnd, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectMediaFilter, ProjectMediaKind } from "../../../electron/media/types";
import type { MediaCardDto, MediaProvenance } from "../../../electron/ralphy/types";
import { VirtualAssetGrid } from "../../components/VirtualAssetGrid";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { SnappySlider } from "../../components/ui/SnappySlider";
import { bridge } from "../../lib/ipc";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";

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
const densityStops = [150, 170, 190, 210, 230, 250, 270, 290, 310];

type ContextState = { card: MediaCardDto; x: number; y: number; opener: HTMLElement } | null;

export function MediaPanel({ page, controller, snapshot, rootEpoch, scrollMemory, scrollResetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  rootEpoch: number;
  scrollMemory: Map<string, number>;
  scrollResetToken: string;
}) {
  const [density, setDensity] = useState(190);
  const [context, setContext] = useState<ContextState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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

  if (page.status === "error" && page.items.length === 0) return <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{page.error ?? "Media could not be loaded."}</span><button className="command-button" type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>;
  const query = snapshot.domain.media;
  return <section className="media-panel" aria-label="Project media">
    <div className="media-domain-toolbar" aria-label="Media filters">
      <SelectMenu value={query.filter} options={lifecycleOptions} ariaLabel="Lifecycle or source" prefix="Source" onValueChange={(filter) => { void controller.setMediaQuery({ filter }); }} />
      <SelectMenu value={query.mediaKind ?? "all"} options={kindOptions} ariaLabel="Media type" prefix="Type" onValueChange={(mediaKind) => { void controller.setMediaQuery({ mediaKind: mediaKind === "all" ? undefined : mediaKind }); }} />
      <SelectMenu value={query.provenance ?? "all"} options={provenanceOptions} ariaLabel="Generation provenance" prefix="Generation" onValueChange={(provenance) => { void controller.setMediaQuery({ provenance: provenance === "all" ? undefined : provenance }); }} />
      <span className="media-item-count"><strong>{page.items.length.toLocaleString()}</strong><span>ITEMS</span></span>
      <div className="grid-size-control" title="Grid density"><GalleryHorizontalEnd size={15} aria-hidden="true" /><SnappySlider value={density} min={150} max={310} step={20} values={densityStops} defaultValue={190} ariaLabel="Grid density" onValueChange={setDensity} /></div>
    </div>
    {actionError && <div className="project-local-error media-action-error" role="alert">{actionError}</div>}
    {page.status === "error" && page.items.length > 0 && page.nextCursor === null && <div className="project-local-error media-action-error" role="alert"><span>{page.error ?? "Media could not be updated."}</span><button className="command-button" type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div>}
    <div className="project-media-grid">
      {page.status === "loading" && page.items.length === 0 && <div className="project-skeleton" role="status">Loading media…</div>}
      {page.status === "ready" && page.items.length === 0
        ? <div className="empty-section">No media matches these filters.</div>
        : <VirtualAssetGrid key={scrollResetToken} items={page.items as MediaCardDto[]} project={snapshot.domain.project} rootEpoch={rootEpoch} selectedRef={snapshot.selectedMedia?.ref ?? null} resolvePreview={bridge.resolveProjectPreview} onSelect={(card) => controller.selectMedia(card)} onOpen={(card) => { void controller.openMediaViewer(card); }} onContextMenu={openContext} density={density} hasMore={page.nextCursor !== null} loadingMore={page.status === "loading" && page.items.length > 0 && page.nextCursor !== null} appendError={page.status === "error" && page.items.length > 0 && page.nextCursor !== null ? page.error : null} onLoadMore={() => { void controller.loadMore("media"); }} onRetryAppend={() => { void controller.retryPage("media"); }} scrollMemory={scrollMemory} scrollKey="media" scrollResetToken={scrollResetToken} />}
    </div>
    {context && <div ref={menuRef} className="asset-context-menu" aria-label="Media actions" style={{ left: context.x, top: context.y }}>
      <button type="button" onClick={() => { void action("preview"); }}><Eye size={15} aria-hidden="true" />Preview</button>
      <button type="button" onClick={() => { void action("open"); }}><ExternalLink size={15} aria-hidden="true" />Open externally</button>
      <button type="button" onClick={() => { void action("finder"); }}><FolderOpen size={15} aria-hidden="true" />Reveal in Finder</button>
      <button type="button" onClick={() => { void action("copy"); }}><Copy size={15} aria-hidden="true" />Copy file</button>
    </div>}
  </section>;
}
