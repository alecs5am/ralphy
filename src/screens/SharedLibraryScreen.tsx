import { AlertCircle, Maximize2, Plus, Upload } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { MediaWorkbenchBridge } from "../../electron/media/types";
import { bridge } from "../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { InstrumentRightRailPortal, useOptionalInstrumentRightRail } from "../instrument/InstrumentShell";
import {
  createSharedLibraryController,
  type SharedLibraryController,
  type SharedLibrarySnapshot,
} from "../state/shared-library-controller";
import { SharedArtifactPreview } from "./shared-library/SharedArtifactPreview";
import { SharedArtifactInspector } from "./shared-library/SharedArtifactInspector";
import { SharedArtifactViewer } from "./shared-library/SharedArtifactViewer";
import { SharedLibraryToolbar } from "./shared-library/SharedLibraryToolbar";
import { SharedLibraryWorkflows, type SharedLibrarySuggestion, type SharedLibraryWorkflowKind } from "./shared-library/SharedLibraryWorkflows";
import type { Availability, SharedArtifactPresentation } from "./shared-library/presentation";

type OpenCallback = (artifact: SharedArtifactPresentation) => void;
const unavailableSuggestions = { status: "unavailable", reason: "Metadata suggestions are unavailable from this Core version because Core exposes no suggestion evidence." } satisfies Availability<SharedLibrarySuggestion[]>;

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
const SCREEN = "main-region shared-library-screen @container/main-region relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 type-base text-ink";
const TOOLBAR_SHELL = "shared-library-toolbar m-0 flex min-h-9 w-full max-w-none flex-none flex-wrap items-center gap-2 rounded-panel bg-surface p-2";
/* Geometry and behaviour only: a surface or an ink here would compete with the pair a caller
   states, and two utilities of one property are resolved by the generated stylesheet's order
   rather than by the class string. */
const HEADER_ACTION = "inline-flex min-h-9 items-center gap-2 rounded-control px-3 type-sm transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 focus-visible:outline-focus-on-instrument disabled:cursor-not-allowed disabled:opacity-50";
const HEADER_ACTION_GHOST = "bg-instrument-raised text-on-instrument-muted hover:bg-ghost-hover hover:text-on-instrument";
/* Primary is the inversion of its context, and the context here is a black widget. */
const HEADER_ACTION_PRIMARY = "bg-on-instrument text-instrument hover:bg-selected-hover hover:text-instrument";
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

const availabilityReason = (value: Availability<unknown>) => value.status === "ready" ? "Available from Core." : value.reason;

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
    : "Title unavailable — Core does not return artifact titles";
  const reason = artifact.title.status === "ready" ? "Title returned by Core." : artifact.title.reason;
  return <>
    <button
      className={audit
        // In the audit list the row stands on the desk, so the identity takes the theme ink.
        ? `${IDENTITY} is-audit flex-1 gap-2 text-ink`
        : `${IDENTITY} mt-2 gap-1.75 text-on-instrument focus-visible:outline-focus-on-instrument focus-visible:-outline-offset-2`}
      type="button"
      aria-label={`Select ${artifact.slug} identity and open inspector`}
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
        <small className={`block truncate font-code type-meta ${audit ? "text-muted" : "text-on-instrument-muted"}`}>SLUG · {artifact.slug}</small>
      </span>
    </button>
    <span className="sr-only" id={instructionsId}>Click or press Space to select this slug identity and open the inspector. Press Enter or double-click to open the viewer.</span>
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
    className={`shared-artifact-card flex min-w-0 flex-col overflow-hidden rounded-panel p-2 text-on-instrument ${selected ? "is-selected bg-instrument-hover" : "bg-instrument"}`}
  >
    <div className={`shared-artifact-frame relative grid aspect-shared-tile min-h-0 w-full place-items-center overflow-hidden rounded-cell bg-instrument-raised transition-shadow duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 ${CARD_MEDIA} ${selected ? "inset-ring-2 inset-ring-on-instrument" : ""}`}>
      <SharedArtifactPreview artifact={artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} />
      {artifact.preview === "no-target" && <span className="pointer-events-none absolute top-1/2 z-2 mt-6 type-mono-md text-on-instrument-muted">No preview target</span>}
      <div className="shared-artifact-chrome hidden">
        <span title={referencedAs(artifact)}>{artifact.referencedAs.length > 0 ? artifact.referencedAs[0] : "REFERENCED AS —"}</span>
        <span title={availabilityReason(artifact.canonicalStatus)}>STATUS UNAVAILABLE</span>
      </div>
      <span className="pointer-events-none absolute bottom-2 left-2 z-3 h-5 rounded-chip bg-media-plate px-1.75 py-1 font-code type-mono-sm text-on-instrument">{artifact.mime?.split("/").at(-1)?.toLocaleUpperCase() ?? artifact.kind.toLocaleUpperCase()}</span>
      <button className="absolute right-2 bottom-2 z-4 inline-flex h-6 items-center gap-1.25 rounded-control bg-media-plate px-2 type-mono-md text-on-instrument transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 hover:bg-frame focus-visible:outline-focus-on-instrument [&_svg]:size-2.75" type="button" aria-label={`Preview ${artifact.slug}`} onClick={(event) => onViewer(event.currentTarget)}><Maximize2 aria-hidden="true" />Preview</button>
    </div>
    <ArtifactIdentity artifact={artifact} selected={selected} onSelect={onSelect} onViewer={onViewer} />
    <small className="mt-0.75 ml-3.5 block truncate px-1 pb-1 font-code type-meta leading-4 text-on-instrument-muted">{artifactFacts(artifact)}</small>
    <span className="shared-artifact-referenced hidden"><b>Referenced as</b> {referencedAs(artifact)}</span>
  </article>;
}

const futureCell = (label: string, reason: string) => <span className="text-muted" title={reason}>{label} evidence unavailable</span>;

function SharedLibraryAuditList({ artifacts, selectedId, selectedRows, workspaceId, rootEpoch, resolvePreview, onToggle, onSelect, onViewer }: {
  artifacts: SharedArtifactPresentation[];
  selectedId: string | null;
  selectedRows: Set<string>;
  workspaceId: string;
  rootEpoch: number;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
  onToggle(id: string): void;
  onSelect(artifact: SharedArtifactPresentation, origin: HTMLElement): void;
  onViewer(artifact: SharedArtifactPresentation, origin: HTMLElement): void;
}) {
  const columns = ["", "ARTIFACT", "KIND", "REFERENCED AS", "CANONICAL", "REVISION", "REVISION COUNT", "USED BY", "RIGHTS", "LAST USED", "ATTENTION"];
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
      <span className={CELL} role="cell"><input className="size-3.75 accent-ink" type="checkbox" aria-label={`Select ${artifact.slug}`} checked={selectedRows.has(artifact.id)} onClick={(event) => event.stopPropagation()} onChange={() => onToggle(artifact.id)} /></span>
      <span className={`${CELL} flex items-center gap-2`} role="cell"><i className="grid size-7.5 flex-none place-items-center overflow-hidden rounded-chip bg-instrument [&>*]:size-full [&>*]:object-cover"><SharedArtifactPreview artifact={artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} list /></i><ArtifactIdentity artifact={artifact} audit onSelect={(origin) => onSelect(artifact, origin)} onViewer={(origin) => onViewer(artifact, origin)} /></span>
      <span className={CELL} role="cell">{artifact.kind}</span>
      <span className={CELL} role="cell" title={referencedAs(artifact)}>{referencedAs(artifact)}</span>
      <span className={CELL} role="cell">{futureCell("Canonical", availabilityReason(artifact.canonicalStatus))}</span>
      <span className={`${CELL} flex flex-col`} role="cell"><strong className="truncate font-normal" title={artifact.selectedRevisionId ?? "Core returned no selected revision."}>{artifact.selectedRevisionId ?? "Unselected"}</strong><small className="truncate font-code type-mono-sm text-muted">{artifact.selectedState ?? "STATE UNAVAILABLE"}</small></span>
      <span className={CELL} role="cell">{artifact.revisionCount} {artifact.revisionCount === 1 ? "revision" : "revisions"}</span>
      <span className={CELL} role="cell">{futureCell("Usage", availabilityReason(artifact.usageBacklinks))}</span>
      <span className={CELL} role="cell">{futureCell("Rights", availabilityReason(artifact.rights))}</span>
      <span className={CELL} role="cell">{futureCell("Last-used", availabilityReason(artifact.usageBacklinks))}</span>
      <span className={CELL} role="cell">{futureCell("Attention", availabilityReason(artifact.attention))}</span>
    </div>)}
  </div></div>;
}

function ScreenHeader({ workspaceName, totals, actionsUnavailableReason, onAdd, onPromote }: {
  workspaceName: string;
  totals?: { count: Availability<number>; bytes: Availability<number> };
  actionsUnavailableReason?: string;
  onAdd(origin: HTMLButtonElement): void;
  onPromote(origin: HTMLButtonElement): void;
}) {
  return <header className="shared-library-header m-0 flex min-h-0 w-full max-w-none flex-none flex-wrap items-center justify-between gap-4 rounded-panel bg-instrument px-5 py-4 text-on-instrument">
    <div className="flex flex-col gap-1"><div className="screen-kicker mb-1 type-xs uppercase tracking-wide text-on-instrument-muted">{workspaceName}</div><h1 className="m-0 type-hero font-semibold leading-none tracking-tight text-on-instrument">Shared Library</h1><p className="m-0 type-base text-on-instrument-muted">Reusable workspace artifacts for people and agents</p></div>
    {/* The totals and the actions read as one line until the content row is narrow enough that
        they stack — measured against the row, never the window. */}
    <div className="flex flex-wrap items-center justify-end gap-2 @max-shared-header/main-region:flex-col-reverse @max-shared-header/main-region:items-end">
      {totals && <div className="flex flex-col items-center gap-2 font-code type-xs tracking-caps-tight whitespace-nowrap text-on-instrument-muted"><span>{countLabel(totals.count)}</span><span>{bytesLabel(totals.bytes)}</span></div>}
      <div className="flex items-center gap-2"><button className={`${HEADER_ACTION} ${HEADER_ACTION_GHOST}`} type="button" disabled={!!actionsUnavailableReason} aria-describedby={actionsUnavailableReason ? "shared-library-initializing-actions" : undefined} onClick={(event) => onPromote(event.currentTarget)}><Upload size={13} aria-hidden="true" />Promote from project</button><button className={`shared-library-primary ${HEADER_ACTION} ${HEADER_ACTION_PRIMARY}`} type="button" disabled={!!actionsUnavailableReason} aria-describedby={actionsUnavailableReason ? "shared-library-initializing-actions" : undefined} onClick={(event) => onAdd(event.currentTarget)}><Plus size={13} aria-hidden="true" />Add artifact</button></div>
      {actionsUnavailableReason && <p className="m-0 max-w-shared-reason type-mono-md leading-caption text-right text-on-instrument-muted" id="shared-library-initializing-actions">{actionsUnavailableReason}</p>}
    </div>
  </header>;
}

export function SharedLibraryScreenView({ workspaceId, workspaceName, rootEpoch, controller, snapshot, resolvePreview, onAdd, onPromote, onOpenInspector, onOpenViewer }: SharedLibraryScreenProps & {
  controller: SharedLibraryController;
  snapshot: SharedLibrarySnapshot;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
}) {
  const instrumentRail = useOptionalInstrumentRightRail();
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [inspector, setInspector] = useState<{ artifact: SharedArtifactPresentation; origin: HTMLElement | null } | null>(null);
  const [viewer, setViewer] = useState<{ artifact: SharedArtifactPresentation; origin: HTMLElement | null } | null>(null);
  const [workflow, setWorkflow] = useState<{ kind: SharedLibraryWorkflowKind; artifact?: SharedArtifactPresentation; origin: HTMLElement | null } | null>(null);
  const bulkReasonId = useId();
  const add = (origin: HTMLButtonElement) => onAdd ? onAdd() : setWorkflow({ kind: "add", origin });
  const promote = (origin: HTMLButtonElement) => onPromote ? onPromote() : setWorkflow({ kind: "promote", origin });
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
  const toggle = (id: string) => setSelectedRows((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const instrumentState = value.artifacts.length === 0
    ? "empty"
    : snapshot.refreshError || snapshot.pageError || value.nextCursor
      ? "partial"
      : "ready";
  return <InstrumentScreenRoot descriptor={sharedLibraryInstrumentStates} state={instrumentState}><main className={SCREEN} aria-busy={snapshot.refreshing || undefined}>
    <ScreenHeader workspaceName={workspaceName} totals={{ count: value.totalCount, bytes: value.totalSelectedBytes }} onAdd={add} onPromote={promote} />
    <SharedLibraryToolbar query={snapshot.query} controller={controller} />
    <div className="flex-none rounded-control bg-surface-sunken px-3 py-2 type-xs text-muted" role="note">Grouping by entity is unavailable from Core. Showing one flat collection.</div>
    <div className="mb-2 flex flex-none items-start gap-2 rounded-control bg-surface-sunken px-3 py-2 type-xs leading-4 text-muted" role="note"><AlertCircle className="mt-0.5 shrink-0" size={13} aria-hidden="true" /><span><strong className="text-ink">Attention evidence unavailable</strong> Missing-file evidence, broken-reference evidence, rights-unknown evidence, duplicate-candidate evidence, and revision-update evidence are unavailable from this Core version; no state is inferred.</span></div>
    {snapshot.refreshError && <div className={`shared-library-error ${NOTICE} mt-1 mb-2 rounded-field px-2.5 py-2`} role="alert"><AlertCircle aria-hidden="true" /><span>{snapshot.refreshError}</span><button className={DESK_ACTION} type="button" onClick={() => { void controller.refresh(); }}>Retry refresh</button></div>}
    {/* The content row is the container every width decision in this area is measured against:
        the inspector opening and the chat rail taking width both change it without the window
        moving. */}
    <div className="shared-library-content @container/shared-content relative m-0 flex min-h-0 w-full min-w-0 max-w-none flex-1 gap-3.5 bg-transparent p-0" data-inspector-open={inspector ? "true" : undefined}>
      <div className="shared-library-scroll min-h-0 flex-1 overflow-auto px-0.5 pt-1 pb-16" aria-busy={snapshot.loadingMore || undefined}>
        {value.artifacts.length === 0 ? <div className="shared-library-empty grid min-h-shared-state place-content-center place-items-center gap-1.25 type-sm text-center text-muted"><strong className="type-lg text-ink">{queryDirty ? "No artifacts match these filters" : "Build a reusable source of truth"}</strong><p className="m-0 max-w-shared-copy">{queryDirty ? "Try slug, kind, MIME, referenced role, or provenance." : "Add canonical characters, locations, products, audio hooks, and brand assets for future projects."}</p></div>
          : snapshot.query.view === "grid" ? <div className="shared-library-grid grid grid-cols-(--shared-library-tiles) items-start gap-x-3 gap-y-4.5">{value.artifacts.map((artifact) => <SharedArtifactCard key={artifact.id} artifact={artifact} selected={value.selectedArtifactId === artifact.id} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} onSelect={(origin) => inspect(artifact, origin)} onViewer={(origin) => view(artifact, origin)} />)}</div>
            : <SharedLibraryAuditList artifacts={value.artifacts} selectedId={value.selectedArtifactId} selectedRows={selectedRows} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} onToggle={toggle} onSelect={inspect} onViewer={view} />}
        {value.nextCursor && <p className="mt-4 mb-0 font-code type-mono-sm text-center text-muted" role="note">Showing loaded artifacts · {value.artifacts.length} loaded; more are available from Core.</p>}
        {snapshot.pageError && <div className={`shared-library-error ${NOTICE} mx-auto mt-4.5 max-w-shared-notice rounded-field px-2.5 py-2`} role="alert"><span>{snapshot.pageError}</span><button className={DESK_ACTION} type="button" onClick={() => { void controller.loadMore(); }}>Retry</button></div>}
        {value.nextCursor && !snapshot.pageError && <button className={`${DESK_ACTION} mx-auto mt-4.5`} type="button" disabled={snapshot.loadingMore} onClick={() => { void controller.loadMore(); }}>{snapshot.loadingMore ? "Loading more artifacts…" : "Load more"}</button>}
      </div>
      {inspector && (instrumentRail && instrumentRail.mode !== "closed"
        ? <InstrumentRightRailPortal owner="shared-inspector" label="Shared item inspector"><SharedArtifactInspector artifact={inspector.artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} returnFocus={inspector.origin} onClose={() => setInspector(null)} onReconcile={controller.reconcileArtifact} onOpenWorkflow={(kind, origin) => setWorkflow({ kind, artifact: inspector.artifact, origin })} /></InstrumentRightRailPortal>
        : <SharedArtifactInspector artifact={inspector.artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} returnFocus={inspector.origin} onClose={() => setInspector(null)} onReconcile={controller.reconcileArtifact} onOpenWorkflow={(kind, origin) => setWorkflow({ kind, artifact: inspector.artifact, origin })} />)}
    </div>
    {selectedRows.size > 0 && <div className="shared-library-bulk-bar absolute bottom-5.5 left-1/2 z-6 flex -translate-x-1/2 items-center gap-1 rounded-cell bg-surface py-1.25 pr-1.75 pl-3 text-ink"><strong className="mr-2 font-code type-mono-sm tracking-caps-tight text-muted">{selectedRows.size} SELECTED</strong>{["Assign role", "Tag", "Review metadata", "Archive"].map((label) => <button className="inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 type-label text-muted" type="button" aria-disabled="true" aria-describedby={bulkReasonId} key={label}>{label}</button>)}<p className="mx-1 my-0 max-w-shared-hint type-mono-md leading-title text-muted" id={bulkReasonId}>This Core mutation is unavailable.</p></div>}
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
    {workflow && <SharedLibraryWorkflows kind={workflow.kind} artifact={workflow.artifact} suggestions={unavailableSuggestions} returnFocus={workflow.origin} onClose={() => setWorkflow(null)} />}
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
      <ScreenHeader workspaceName={props.workspaceName} actionsUnavailableReason="Workflow previews are unavailable while the Shared Library is initializing." onAdd={() => props.onAdd?.()} onPromote={() => props.onPromote?.()} />
      <div className={TOOLBAR_SHELL} aria-hidden="true" />
      <div className="shared-library-skeleton grid min-h-0 flex-1 grid-cols-(--shared-library-tiles) items-start gap-3 pt-3.5" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <i className="aspect-shared-skeleton w-full rounded-row bg-surface-sunken" key={index} />)}</div>
      <div className="shared-library-loading grid min-h-8 flex-none place-items-center type-sm text-center text-muted" role="status">Loading Shared Library…</div>
    </main></InstrumentScreenRoot>;
}
