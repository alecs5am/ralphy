import { AlertCircle, Plus, Upload } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { MediaWorkbenchBridge } from "../../electron/media/types";
import { bridge } from "../lib/ipc";
import {
  createSharedLibraryController,
  type SharedLibraryController,
  type SharedLibrarySnapshot,
} from "../state/shared-library-controller";
import { SharedArtifactPreview } from "./shared-library/SharedArtifactPreview";
import { SharedArtifactInspector } from "./shared-library/SharedArtifactInspector";
import { SharedLibraryToolbar } from "./shared-library/SharedLibraryToolbar";
import type { Availability, SharedArtifactPresentation } from "./shared-library/presentation";

type OpenCallback = (artifact: SharedArtifactPresentation) => void;

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

function ArtifactIdentity({ artifact, audit = false, onSelect, onViewer }: {
  artifact: SharedArtifactPresentation;
  audit?: boolean;
  onSelect(origin: HTMLButtonElement): void;
  onViewer(): void;
}) {
  const instructionsId = `shared-artifact-${artifact.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${audit ? "audit" : "grid"}-instructions`;
  const title = artifact.title.status === "ready" || artifact.title.status === "partial"
    ? artifact.title.value
    : "Title unavailable — Core does not return artifact titles";
  const reason = artifact.title.status === "ready" ? "Title returned by Core." : artifact.title.reason;
  return <>
    <button
      className={`shared-artifact-identity${audit ? " is-audit" : ""}`}
      type="button"
      aria-label={`Select ${artifact.slug} identity and open inspector`}
      aria-describedby={instructionsId}
      title={reason}
      onClick={(event) => { event.stopPropagation(); onSelect(event.currentTarget); }}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onViewer(); }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        onViewer();
      }}
    >
      {!audit && <span className="shared-canonical-dot" title={availabilityReason(artifact.canonicalStatus)} aria-hidden="true" />}
      <span><strong>{title}</strong><small>SLUG · {artifact.slug}</small></span>
    </button>
    <span className="shared-visually-hidden" id={instructionsId}>Click or press Space to select this slug identity and open the inspector. Press Enter or double-click to open the viewer.</span>
  </>;
}

function SharedArtifactCard({ artifact, selected, workspaceId, rootEpoch, resolvePreview, onSelect, onViewer }: {
  artifact: SharedArtifactPresentation;
  selected: boolean;
  workspaceId: string;
  rootEpoch: number;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
  onSelect(origin: HTMLButtonElement): void;
  onViewer(): void;
}) {
  return <article
    className={`shared-artifact-card${selected ? " is-selected" : ""}`}
  >
    <div className="shared-artifact-frame">
      <SharedArtifactPreview artifact={artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} />
      <div className="shared-artifact-chrome">
        <span title={referencedAs(artifact)}>{artifact.referencedAs.length > 0 ? artifact.referencedAs[0] : "REFERENCED AS —"}</span>
        <span title={availabilityReason(artifact.canonicalStatus)}>STATUS UNAVAILABLE</span>
      </div>
      <span className="shared-artifact-format">{artifact.mime?.split("/").at(-1)?.toLocaleUpperCase() ?? artifact.kind.toLocaleUpperCase()}</span>
    </div>
    <ArtifactIdentity artifact={artifact} onSelect={onSelect} onViewer={onViewer} />
    <small>{artifactFacts(artifact)}</small>
    <span className="shared-artifact-referenced"><b>Referenced as</b> {referencedAs(artifact)}</span>
  </article>;
}

const futureCell = (reason: string) => <span className="shared-unavailable-cell" title={reason}>Unavailable</span>;

function SharedLibraryAuditList({ artifacts, selectedId, selectedRows, workspaceId, rootEpoch, resolvePreview, onToggle, onSelect, onViewer }: {
  artifacts: SharedArtifactPresentation[];
  selectedId: string | null;
  selectedRows: Set<string>;
  workspaceId: string;
  rootEpoch: number;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
  onToggle(id: string): void;
  onSelect(artifact: SharedArtifactPresentation, origin: HTMLElement): void;
  onViewer(artifact: SharedArtifactPresentation): void;
}) {
  const columns = ["", "ARTIFACT", "KIND", "REFERENCED AS", "CANONICAL", "REVISION", "REVISION COUNT", "USED BY", "RIGHTS", "LAST USED", "ATTENTION"];
  return <div className="shared-library-audit" role="table" aria-label="Shared Library audit list">
    <div className="shared-library-audit-header" role="row">{columns.map((column, index) => <span role="columnheader" key={`${column}:${index}`}>{column}</span>)}</div>
    {artifacts.map((artifact) => <div
      className={`shared-library-audit-row${selectedId === artifact.id ? " is-selected" : ""}`}
      role="row"
      key={artifact.id}
      onClick={(event) => { if (!interactiveChild(event)) onSelect(artifact, event.currentTarget.querySelector<HTMLElement>(".shared-artifact-identity") ?? event.currentTarget); }}
      onDoubleClick={(event) => { if (!interactiveChild(event)) onViewer(artifact); }}
    >
      <span role="cell"><input type="checkbox" aria-label={`Select ${artifact.slug}`} checked={selectedRows.has(artifact.id)} onClick={(event) => event.stopPropagation()} onChange={() => onToggle(artifact.id)} /></span>
      <span className="shared-library-audit-artifact" role="cell"><i><SharedArtifactPreview artifact={artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} list /></i><ArtifactIdentity artifact={artifact} audit onSelect={(origin) => onSelect(artifact, origin)} onViewer={() => onViewer(artifact)} /></span>
      <span role="cell">{artifact.kind}</span>
      <span role="cell" title={referencedAs(artifact)}>{referencedAs(artifact)}</span>
      <span role="cell">{futureCell(availabilityReason(artifact.canonicalStatus))}</span>
      <span className="shared-library-revision" role="cell"><strong title={artifact.selectedRevisionId ?? "Core returned no selected revision."}>{artifact.selectedRevisionId ?? "Unselected"}</strong><small>{artifact.selectedState ?? "STATE UNAVAILABLE"}</small></span>
      <span role="cell">{artifact.revisionCount} {artifact.revisionCount === 1 ? "revision" : "revisions"}</span>
      <span role="cell">{futureCell(availabilityReason(artifact.usageBacklinks))}</span>
      <span role="cell">{futureCell(availabilityReason(artifact.rights))}</span>
      <span role="cell">{futureCell(availabilityReason(artifact.usageBacklinks))}</span>
      <span role="cell">{futureCell(availabilityReason(artifact.attention))}</span>
    </div>)}
  </div>;
}

function ScreenHeader({ workspaceName, totals, onAdd, onPromote }: {
  workspaceName: string;
  totals?: { count: Availability<number>; bytes: Availability<number> };
  onAdd(): void;
  onPromote(): void;
}) {
  return <header className="shared-library-header">
    <div><div className="screen-kicker">{workspaceName}</div><h1>Shared Library</h1><p>Reusable workspace artifacts for people and agents</p></div>
    <div className="shared-library-header-side">
      {totals && <div className="shared-library-totals"><span>{countLabel(totals.count)}</span><span>{bytesLabel(totals.bytes)}</span></div>}
      <div className="shared-library-actions"><button type="button" onClick={onPromote}><Upload size={13} aria-hidden="true" />Promote from project</button><button className="shared-library-primary" type="button" onClick={onAdd}><Plus size={13} aria-hidden="true" />Add artifact</button></div>
    </div>
  </header>;
}

export function SharedLibraryScreenView({ workspaceId, workspaceName, rootEpoch, controller, snapshot, resolvePreview, onAdd, onPromote, onOpenInspector, onOpenViewer }: SharedLibraryScreenProps & {
  controller: SharedLibraryController;
  snapshot: SharedLibrarySnapshot;
  resolvePreview: MediaWorkbenchBridge["resolveSharedLibraryPreview"];
}) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [openState, setOpenState] = useState<string | null>(null);
  const [inspector, setInspector] = useState<{ artifact: SharedArtifactPresentation; origin: HTMLElement | null } | null>(null);
  const add = () => onAdd ? onAdd() : setOpenState("Add artifact is unavailable until Core exposes a mutation contract.");
  const promote = () => onPromote ? onPromote() : setOpenState("Promote from project is unavailable until Core exposes a mutation contract.");
  const inspect = (artifact: SharedArtifactPresentation, origin: HTMLElement | null = null) => {
    controller.selectArtifact(artifact.id);
    if (onOpenInspector) onOpenInspector(artifact);
    else setInspector({ artifact, origin });
  };
  const view = (artifact: SharedArtifactPresentation) => {
    if (onOpenViewer) onOpenViewer(artifact);
    else setOpenState(`Viewer requested for slug identity ${artifact.slug}. Full content viewing arrives in the viewer task.`);
  };

  if (snapshot.status === "loading") return <main className="main-region shared-library-screen" aria-busy="true"><ScreenHeader workspaceName={workspaceName} onAdd={add} onPromote={promote} /><div className="shared-library-loading" role="status">Loading Shared Library…</div></main>;
  if (snapshot.status === "error") return <main className="main-region shared-library-screen"><ScreenHeader workspaceName={workspaceName} onAdd={add} onPromote={promote} /><div className="shared-library-error" role="alert"><AlertCircle aria-hidden="true" /><span>{snapshot.error}</span><button type="button" onClick={() => { void controller.refresh(); }}>Retry</button></div></main>;

  const { value } = snapshot;
  const queryDirty = snapshot.query.text !== "" || snapshot.query.mediaKind !== "all" || snapshot.query.provenance !== "all";
  const toggle = (id: string) => setSelectedRows((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <main className="main-region shared-library-screen" aria-busy={snapshot.refreshing || undefined}>
    <ScreenHeader workspaceName={workspaceName} totals={{ count: value.totalCount, bytes: value.totalSelectedBytes }} onAdd={add} onPromote={promote} />
    <SharedLibraryToolbar query={snapshot.query} controller={controller} />
    <div className="shared-library-grouping" role="note">Grouping by entity is unavailable from Core. Showing one flat collection.</div>
    {openState && <div className="shared-library-open-state" role="status"><span>{openState}</span><button type="button" aria-label="Close Shared Library state" onClick={() => setOpenState(null)}>Close</button></div>}
    {snapshot.refreshError && <div className="shared-library-error" role="alert"><AlertCircle aria-hidden="true" /><span>{snapshot.refreshError}</span><button type="button" onClick={() => { void controller.refresh(); }}>Retry refresh</button></div>}
    <div className="shared-library-content" data-inspector-open={inspector ? "true" : undefined}>
      <div className="shared-library-scroll">
        {value.artifacts.length === 0 ? <div className="shared-library-empty"><strong>{queryDirty ? "No artifacts match these filters" : "Build a reusable source of truth"}</strong><p>{queryDirty ? "Clear filters or search another returned field." : "Add canonical characters, locations, products, audio hooks, and brand assets for future projects."}</p></div>
          : snapshot.query.view === "grid" ? <div className="shared-library-grid">{value.artifacts.map((artifact) => <SharedArtifactCard key={artifact.id} artifact={artifact} selected={value.selectedArtifactId === artifact.id} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} onSelect={(origin) => inspect(artifact, origin)} onViewer={() => view(artifact)} />)}</div>
            : <SharedLibraryAuditList artifacts={value.artifacts} selectedId={value.selectedArtifactId} selectedRows={selectedRows} workspaceId={workspaceId} rootEpoch={rootEpoch} resolvePreview={resolvePreview} onToggle={toggle} onSelect={inspect} onViewer={view} />}
        {snapshot.pageError && <div className="shared-library-error shared-library-page-error" role="alert"><span>{snapshot.pageError}</span><button type="button" onClick={() => { void controller.loadMore(); }}>Retry</button></div>}
        {value.nextCursor && !snapshot.pageError && <button className="shared-library-load-more" type="button" disabled={snapshot.loadingMore} onClick={() => { void controller.loadMore(); }}>{snapshot.loadingMore ? "Loading…" : "Load more"}</button>}
      </div>
      {inspector && <SharedArtifactInspector artifact={inspector.artifact} workspaceId={workspaceId} rootEpoch={rootEpoch} returnFocus={inspector.origin} onClose={() => setInspector(null)} onReconcile={controller.reconcileArtifact} />}
    </div>
    {selectedRows.size > 0 && <div className="shared-library-bulk-bar"><strong>{selectedRows.size} SELECTED</strong>{["Assign role", "Tag", "Review metadata", "Archive"].map((label) => <button type="button" disabled title="This Core mutation is unavailable." key={label}>{label}</button>)}</div>}
  </main>;
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
    : <main className="main-region shared-library-screen" aria-busy="true"><ScreenHeader workspaceName={props.workspaceName} onAdd={props.onAdd ?? (() => undefined)} onPromote={props.onPromote ?? (() => undefined)} /><div className="shared-library-loading" role="status">Loading Shared Library…</div></main>;
}
