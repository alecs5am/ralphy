import { PageHeader, PAGE_HEADER_BUTTON, PAGE_HEADER_PRIMARY } from "@/shared/ui/PageHeader";
import { AlertCircle, Boxes, Maximize2, Plus, Upload } from "@/shared/ui/icons";
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { MediaWorkbenchBridge } from "../../../../electron/media/types";
import { bridge } from "@/shared/api/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { InstrumentRightRailPortal, useOptionalInstrumentRightRail } from "@/shared/lib/instrument-rail";
import {
  createSharedLibraryController,
  type SharedLibraryController,
  type SharedLibrarySnapshot,
} from "../model/controller";
import { SharedArtifactPreview } from "./SharedArtifactPreview";
import { SharedArtifactInspector } from "./SharedArtifactInspector";
import { SharedArtifactViewer } from "./SharedArtifactViewer";
import { SharedLibraryToolbar } from "./SharedLibraryToolbar";
import type { Availability, SharedArtifactPresentation } from "../lib/presentation";
import { WINDOW, WINDOW_PLATE } from "@/shared/ui/Window";

type OpenCallback = (artifact: SharedArtifactPresentation) => void;

export const sharedLibraryInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.shared",
  states: ["loading", "ready", "empty", "partial", "error"],
  rootMarker: "workspace-shared-library",
  landmarks: ["Shared Library", "Reusable workspace artifacts for people and agents"],
} as const);

/* The screen is a column of widgets standing on the desk. The header and the cards are black
   widgets, so every control inside them keeps the on-instrument ink pair and the on-instrument
   focus ring in both themes: the theme's own ink is black on black in light, and the theme's
   hover surface turns white underneath it. Everything else is a light widget or sits directly on
   the desk, where the theme ink and the ring reset.css paints are the right ones. */
const SCREEN = "main-region shared-library-screen @container/main-region relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 type-base text-ink";
const TOOLBAR_SHELL = "shared-library-toolbar m-0 flex min-h-9 w-full max-w-none flex-none flex-wrap items-center gap-2 rounded-panel bg-surface p-2";
const DESK_ACTION = "inline-flex h-7 items-center gap-1.5 rounded-control bg-surface-sunken px-2.5 type-label text-muted transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 hover:bg-surface-hover hover:text-ink";
const NOTICE = "flex flex-none items-center gap-2.5 bg-surface type-label text-ink [&>span]:min-w-0 [&>span]:flex-1 [&>svg]:w-3.75";
const CELL = "min-w-0 truncate";
const IDENTITY = "shared-artifact-identity flex w-full min-w-0 items-center rounded-control bg-transparent px-1 py-2 text-left transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0";
const CARD_MEDIA = "[&>:is(.image-viewport,.custom-video-player,.audio-waveform-player)]:absolute [&>:is(.image-viewport,.custom-video-player,.audio-waveform-player)]:inset-0 [&_.image-viewport_.viewer-image]:size-full [&_.image-viewport_.viewer-image]:object-cover [&_.custom-video-player_.viewer-video]:object-cover [&_.audio-waveform-player]:bg-instrument";

export interface SharedLibraryScreenProps {
  workspaceId: string;
  workspaceName: string;
  rootEpoch: number;
  onAdd?(): void;
  onPromote?(): void;
  onOpenInspector?: OpenCallback;
  onOpenViewer?: OpenCallback;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

function countLabel(value: Availability<number>): string {
  if (value.status === "ready") return `${value.value} ARTIFACT${value.value === 1 ? "" : "S"}`;
  if (value.status === "partial") return `SHOWING ${value.value} LOADED ARTIFACT${value.value === 1 ? "" : "S"}`;
  return value.reason;
}

function bytesLabel(value: Availability<number>): string {
  if (value.status === "ready") return formatBytes(value.value).toLocaleUpperCase();
  if (value.status === "partial") return `${formatBytes(value.value).toLocaleUpperCase()} LOADED`;
  return value.reason;
}

function artifactFacts(artifact: SharedArtifactPresentation): string {
  return [artifact.kind, artifact.mime, artifact.bytes === null ? "SIZE UNAVAILABLE" : formatBytes(artifact.bytes), `REVISION COUNT ${artifact.revisionCount}`]
    .filter(Boolean).join(" · ");
}

function referencedAs(artifact: SharedArtifactPresentation): string {
  return artifact.referencedAs.length > 0 ? artifact.referencedAs.join(" · ") : "No referenced roles returned";
}

const availabilityReason = (value: Availability<unknown>) => value.status === "ready" ? "Available." : value.reason;

function interactiveChild(event: MouseEvent<HTMLElement>): boolean {
  return event.target !== event.currentTarget && !!(event.target as HTMLElement).closest("button,input,select,a,[role=slider]");
}

function ArtifactIdentity({ artifact, selected = false, audit = false, onSelect, onViewer }: {
  artifact: SharedArtifactPresentation;
  selected?: boolean;
  audit?: boolean;
  onSelect(origin: HTMLButtonElement): void;
  onViewer(origin: HTMLButtonElement): void;
}) {
  const instructionsId = `shared-artifact-${artifact.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${audit ? "audit" : "grid"}-instructions`;
  const title = artifact.title.status === "ready" || artifact.title.status === "partial"
    ? artifact.title.value
    : artifact.slug;
  const reason = artifact.title.status === "ready" ? "Item name." : artifact.title.reason;
  return <>
    <button
      className={audit
        // In the audit list the row stands on the desk, so the identity takes the theme ink.
        ? `${IDENTITY} is-audit flex-1 gap-2 text-ink`
        : `${IDENTITY} mt-1.5 gap-1.75 px-1 text-ink focus-visible:outline-ink focus-visible:-outline-offset-2`}
      type="button"
      aria-label={`Select ${artifact.slug} and open inspector`}
      aria-describedby={instructionsId}
      aria-pressed={audit ? undefined : selected}
      title={reason}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail > 1) return;
        onSelect(event.currentTarget);
      }}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onViewer(event.currentTarget); }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        onViewer(event.currentTarget);
      }}
    >
      {!audit && <span className="shared-canonical-dot size-1.75 flex-none rounded-full inset-ring inset-ring-on-instrument-muted" title={availabilityReason(artifact.canonicalStatus)} aria-hidden="true" />}
      <span className="flex min-w-0 flex-col">
        <strong className={`block truncate type-base font-semibold ${audit ? "text-ink" : "text-on-instrument"}`}>{title}</strong>
        <small className={`block truncate font-code type-meta ${audit ? "text-muted" : "text-on-instrument-muted"}`}>ASSET · {artifact.slug}</small>
      </span>
    </button>
    <span className="sr-only" id={instructionsId}>Click or press Space to select this asset and open the inspector. Press Enter or double-click to open the viewer.</span>
  </>;
}

function SharedArtifactCard({ artifact, selected, workspaceId, rootEpoch, resolvePreview, onSelect, onViewer }: {
  artifact: SharedArtifactPresentation;
  selected: boolean;
  workspaceId: string;
  rootEpoch: number;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
  onSelect(origin: HTMLButtonElement): void;
  onViewer(origin: HTMLElement): void;
}) {
  return <article
    className={`shared-artifact-card min-w-0 text-ink ${WINDOW}${selected ? " is-selected bg-chip" : ""}`}
  >
    <div className={`shared-artifact-frame relative grid aspect-shared-tile min-h-0 w-full place-items-center ${WINDOW_PLATE} transition-shadow duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${CARD_MEDIA} ${selected ? "inset-ring-2 inset-ring-on-instrument" : ""}`}>
      <SharedArtifactPreview artifact={artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} />
      {artifact.preview === "no-target" && <span className="pointer-events-none absolute top-1/2 z-surface-note mt-6 type-mono-md text-muted">No preview target</span>}
      <div className="shared-artifact-chrome hidden">
        <span title={referencedAs(artifact)}>{artifact.referencedAs.length > 0 ? artifact.referencedAs[0] : "REFERENCED AS —"}</span>
        <span title={availabilityReason(artifact.canonicalStatus)}>STATUS UNAVAILABLE</span>
      </div>
      <span className="pointer-events-none absolute bottom-2 left-2 z-surface-chip h-5 rounded-chip bg-media-plate px-1.75 py-1 font-code type-mono-sm text-on-instrument">{artifact.mime?.split("/").at(-1)?.toLocaleUpperCase() ?? artifact.kind.toLocaleUpperCase()}</span>
      <button className="absolute right-2 bottom-2 z-surface-overlay inline-flex h-6 items-center gap-1.25 rounded-control bg-media-plate px-2 type-mono-md text-on-instrument transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 hover:bg-frame focus-visible:outline-focus-on-instrument [&_svg]:size-2.75" type="button" aria-label={`Preview ${artifact.slug}`} onClick={(event) => onViewer(event.currentTarget)}><Maximize2 aria-hidden="true" />Preview</button>
    </div>
    <ArtifactIdentity artifact={artifact} selected={selected} onSelect={onSelect} onViewer={onViewer} />
    <small className="ml-3.5 block truncate px-1 pb-1.5 font-code type-meta leading-4 text-muted">{artifactFacts(artifact)}</small>
    <span className="shared-artifact-referenced hidden"><b>Referenced as</b> {referencedAs(artifact)}</span>
  </article>;
}

function SharedLibraryAuditList({ artifacts, selectedId, workspaceId, rootEpoch, resolvePreview, onSelect, onViewer }: {
  artifacts: SharedArtifactPresentation[];
  selectedId: string | null;
  workspaceId: string;
  rootEpoch: number;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
  onSelect(artifact: SharedArtifactPresentation, origin: HTMLElement): void;
  onViewer(artifact: SharedArtifactPresentation, origin: HTMLElement): void;
}) {
  const columns = ["ARTIFACT", "KIND", "REFERENCED AS", "REVISION", "REVISION COUNT"];
  return <div className="shared-library-audit-scroll w-full max-w-full overflow-x-auto p-0.5" role="region" aria-label="Scrollable Shared Library audit columns" tabIndex={0}><div className="shared-library-audit min-w-shared-audit" role="grid" aria-label="Shared Library audit list">
    <div className="shared-library-audit-header grid h-7 grid-cols-(--shared-library-audit-columns) items-center gap-2 px-2 font-code type-mono-sm tracking-caps text-muted" role="row">{columns.map((column, index) => <span role="columnheader" key={`${column}:${index}`}>{column}</span>)}</div>
    {artifacts.map((artifact) => <div
      className={`shared-library-audit-row mb-px grid h-11 grid-cols-(--shared-library-audit-columns) items-center gap-2 rounded-control px-2 type-xs transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 focus-visible:-outline-offset-2 ${selectedId === artifact.id ? "is-selected bg-instrument text-on-instrument [&_*]:text-inherit focus-visible:outline-focus-on-instrument" : "bg-transparent text-ink hover:bg-surface-sunken"}`}
      role="row"
      aria-selected={selectedId === artifact.id}
      key={artifact.id}
      onClick={(event) => { if (!interactiveChild(event)) onSelect(artifact, event.currentTarget.querySelector<HTMLElement>(".shared-artifact-identity") ?? event.currentTarget); }}
      onDoubleClick={(event) => { if (!interactiveChild(event)) onViewer(artifact, event.currentTarget.querySelector<HTMLElement>(".shared-artifact-identity") ?? event.currentTarget); }}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        const origin = event.currentTarget;
        if (event.key === "Enter") onViewer(artifact, origin); else onSelect(artifact, origin);
      }}
    >
      <span className={`${CELL} flex items-center gap-2`} role="cell"><i className="grid size-7.5 flex-none place-items-center overflow-hidden rounded-chip bg-instrument [&>*]:size-full [&>*]:object-cover"><SharedArtifactPreview artifact={artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} list /></i><ArtifactIdentity artifact={artifact} audit onSelect={(origin) => onSelect(artifact, origin)} onViewer={(origin) => onViewer(artifact, origin)} /></span>
      <span className={CELL} role="cell">{artifact.kind}</span>
      <span className={CELL} role="cell" title={referencedAs(artifact)}>{referencedAs(artifact)}</span>
      <span className={`${CELL} flex flex-col`} role="cell"><strong className="truncate font-normal" title={artifact.selectedRevisionId ?? "No revision selected."}>{artifact.selectedRevisionId ?? "Unselected"}</strong><small className="truncate font-code type-mono-sm text-muted">{artifact.selectedState ?? "STATE UNAVAILABLE"}</small></span>
      <span className={CELL} role="cell">{artifact.revisionCount} {artifact.revisionCount === 1 ? "revision" : "revisions"}</span>
    </div>)}
  </div></div>;
}

function ScreenHeader({ workspaceName, totals, onAdd, onPromote }: {
  workspaceName: string;
  totals?: { count: Availability<number>; bytes: Availability<number> };
  onAdd?(): void;
  onPromote?(): void;
}) {
  return <PageHeader title="Shared Library" icon={Boxes} meta={totals ? `${countLabel(totals.count)} · ${bytesLabel(totals.bytes)}` : workspaceName} description="Reusable workspace artifacts for people and agents">
    {onPromote && <button className={PAGE_HEADER_BUTTON} type="button" onClick={onPromote}><Upload size={13} /><span className="page-header-action-label">Promote from project</span></button>}
    {onAdd && <button className={`shared-library-primary ${PAGE_HEADER_PRIMARY}`} type="button" onClick={onAdd}><Plus size={13} /><span className="page-header-action-label">Add artifact</span></button>}
  </PageHeader>;
}

export function SharedLibraryScreenView({ workspaceId, workspaceName, rootEpoch, controller, snapshot, resolvePreview, onAdd, onPromote, onOpenInspector, onOpenViewer }: SharedLibraryScreenProps & {
  controller: SharedLibraryController;
  snapshot: SharedLibrarySnapshot;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
}) {
  const instrumentRail = useOptionalInstrumentRightRail();
  const [inspector, setInspector] = useState<{ artifact: SharedArtifactPresentation; origin: HTMLElement | null } | null>(null);
  const [viewer, setViewer] = useState<{ artifact: SharedArtifactPresentation; origin: HTMLElement | null } | null>(null);
  const add = onAdd, promote = onPromote;
  const inspect = (artifact: SharedArtifactPresentation, origin: HTMLElement | null = null) => {
    controller.selectArtifact(artifact.id);
    if (onOpenInspector) onOpenInspector(artifact);
    else setInspector({ artifact, origin });
  };
  const view = (artifact: SharedArtifactPresentation, origin: HTMLElement | null) => {
    controller.selectArtifact(artifact.id);
    setInspector(null);
    if (onOpenViewer) onOpenViewer(artifact);
    else setViewer({ artifact, origin });
  };

  if (snapshot.status === "loading") return <InstrumentScreenRoot descriptor={sharedLibraryInstrumentStates} state="loading"><main className={SCREEN} aria-busy="true">
    <ScreenHeader workspaceName={workspaceName} onAdd={add} onPromote={promote} />
    <SharedLibraryToolbar query={snapshot.query} controller={controller} />
    <div className="shared-library-skeleton grid min-h-0 flex-1 grid-cols-(--shared-library-tiles) items-start gap-3 pt-3.5" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <i className="aspect-shared-skeleton w-full rounded-row bg-surface-sunken" key={index} />)}</div>
    <div className="shared-library-loading grid min-h-8 flex-none place-items-center type-sm text-center text-muted" role="status">Loading Shared Library…</div>
  </main></InstrumentScreenRoot>;
  if (snapshot.status === "error") return <InstrumentScreenRoot descriptor={sharedLibraryInstrumentStates} state="error"><main className={SCREEN}><ScreenHeader workspaceName={workspaceName} onAdd={add} onPromote={promote} /><div className={`shared-library-error ${NOTICE} rounded-panel p-4`} role="alert"><AlertCircle aria-hidden="true" /><span>{snapshot.error}</span><button className={DESK_ACTION} type="button" onClick={() => { void controller.refresh(); }}>Retry</button></div></main></InstrumentScreenRoot>;

  const { value } = snapshot;
  const queryDirty = snapshot.query.text !== "" || snapshot.query.mediaKind !== "all" || snapshot.query.provenance !== "all";
  const instrumentState = value.artifacts.length === 0
    ? "empty"
    : snapshot.refreshError || snapshot.pageError || value.nextCursor
      ? "partial"
      : "ready";
  return <InstrumentScreenRoot descriptor={sharedLibraryInstrumentStates} state={instrumentState}><main className={SCREEN} aria-busy={snapshot.refreshing || undefined}>
    <ScreenHeader workspaceName={workspaceName} totals={{ count: value.totalCount, bytes: value.totalSelectedBytes }} onAdd={add} onPromote={promote} />
    <SharedLibraryToolbar query={snapshot.query} controller={controller} />
    {snapshot.refreshError && <div className={`shared-library-error ${NOTICE} mt-1 mb-2 rounded-field px-2.5 py-2`} role="alert"><AlertCircle aria-hidden="true" /><span>{snapshot.refreshError}</span><button className={DESK_ACTION} type="button" onClick={() => { void controller.refresh(); }}>Retry refresh</button></div>}
    {/* The content row is the container every width decision in this area is measured against:
        the inspector opening and the chat rail taking width both change it without the window
        moving. */}
    <div className="shared-library-content @container/shared-content relative m-0 flex min-h-0 w-full min-w-0 max-w-none flex-1 gap-3.5 bg-transparent p-0" data-inspector-open={inspector ? "true" : undefined}>
      <div className="shared-library-scroll min-h-0 flex-1 overflow-auto px-0.5 pt-1 pb-16" aria-busy={snapshot.loadingMore || undefined}>
        {value.artifacts.length === 0 ? <div className="shared-library-empty grid min-h-shared-state place-content-center place-items-center gap-1.25 type-sm text-center text-muted"><strong className="type-lg text-ink">{queryDirty ? "No artifacts match these filters" : "No shared media yet"}</strong><p className="m-0 max-w-shared-copy">{queryDirty ? "Try slug, kind, MIME, referenced role, or provenance." : "Workspace media created by your agent appears here for reuse across projects."}</p></div>
          : snapshot.query.view === "grid" ? <div className="shared-library-grid grid grid-cols-(--shared-library-tiles) items-start gap-x-3 gap-y-4.5">{value.artifacts.map((artifact) => <SharedArtifactCard key={artifact.id} artifact={artifact} selected={value.selectedArtifactId === artifact.id} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} onSelect={(origin) => inspect(artifact, origin)} onViewer={(origin) => view(artifact, origin)} />)}</div>
            : <SharedLibraryAuditList artifacts={value.artifacts} selectedId={value.selectedArtifactId} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} onSelect={inspect} onViewer={view} />}
        {value.nextCursor && <p className="mt-4 mb-0 font-code type-mono-sm text-center text-muted" role="note">Showing loaded artifacts · {value.artifacts.length} loaded; more are available.</p>}
        {snapshot.pageError && <div className={`shared-library-error ${NOTICE} mx-auto mt-4.5 max-w-shared-notice rounded-field px-2.5 py-2`} role="alert"><span>{snapshot.pageError}</span><button className={DESK_ACTION} type="button" onClick={() => { void controller.loadMore(); }}>Retry</button></div>}
        {value.nextCursor && !snapshot.pageError && <button className={`${DESK_ACTION} mx-auto mt-4.5`} type="button" disabled={snapshot.loadingMore} onClick={() => { void controller.loadMore(); }}>{snapshot.loadingMore ? "Loading more artifacts…" : "Load more"}</button>}
      </div>
      {inspector && (instrumentRail && instrumentRail.mode !== "closed"
        ? <InstrumentRightRailPortal owner="shared-inspector" label="Shared item inspector"><SharedArtifactInspector artifact={inspector.artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} returnFocus={inspector.origin} onClose={() => setInspector(null)} onReconcile={controller.reconcileArtifact} /></InstrumentRightRailPortal>
        : <SharedArtifactInspector artifact={inspector.artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} returnFocus={inspector.origin} onClose={() => setInspector(null)} onReconcile={controller.reconcileArtifact} />)}
    </div>
    {viewer && <SharedArtifactViewer
      artifact={viewer.artifact}
      artifacts={value.artifacts}
      workspaceId={workspaceId}
      rootEpoch={rootEpoch}
      returnFocus={viewer.origin}
      onClose={() => setViewer(null)}
      onNavigate={(artifact) => { controller.selectArtifact(artifact.id); setViewer((current) => current ? { ...current, artifact } : null); }}
      onReconcile={controller.reconcileArtifact}
      onOpenInspector={(artifact) => { setViewer(null); inspect(artifact, viewer.origin); }}
    />}
  </main></InstrumentScreenRoot>;
}

function ConnectedSharedLibraryScreen(props: SharedLibraryScreenProps & { controller: SharedLibraryController }) {
  const snapshot = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot);
  return <SharedLibraryScreenView {...props} snapshot={snapshot} resolvePreview={bridge.resolveSharedLibraryPreview} />;
}

export function SharedLibraryScreen(props: SharedLibraryScreenProps) {
  const scope = `${props.rootEpoch}:${props.workspaceId}`;
  const [active, setActive] = useState<{ scope: string; controller: SharedLibraryController } | null>(null);
  useEffect(() => {
    const controller = createSharedLibraryController(bridge, props.workspaceId);
    setActive({ scope, controller });
    void controller.start();
    return () => controller.dispose();
  }, [props.workspaceId, props.rootEpoch, scope]);
  return active?.scope === scope
    ? <ConnectedSharedLibraryScreen {...props} controller={active.controller} />
    : <InstrumentScreenRoot descriptor={sharedLibraryInstrumentStates} state="loading"><main className={SCREEN} aria-busy="true">
      <ScreenHeader workspaceName={props.workspaceName} onAdd={props.onAdd} onPromote={props.onPromote} />
      <div className={TOOLBAR_SHELL} aria-hidden="true" />
      <div className="shared-library-skeleton grid min-h-0 flex-1 grid-cols-(--shared-library-tiles) items-start gap-3 pt-3.5" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <i className="aspect-shared-skeleton w-full rounded-row bg-surface-sunken" key={index} />)}</div>
      <div className="shared-library-loading grid min-h-8 flex-none place-items-center type-sm text-center text-muted" role="status">Loading Shared Library…</div>
    </main></InstrumentScreenRoot>;
}
