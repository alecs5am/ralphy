import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Layers3 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { JsonValue, UnitDto, UnitPresentationDto } from "../../../electron/ralphy/types";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot, UnitPage } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString();
const json = (value: JsonValue | null) => value === null ? "None" : JSON.stringify(value, null, 2);

function Tail({ root, page, load }: { root: HTMLElement | null; page: UnitPage<{ id: string }>; load(): Promise<void> }) {
  return <AutoCursorTail
    root={root}
    hasMore={page.nextCursor !== null}
    loading={page.status === "loading" && page.items.length > 0}
    error={page.status === "error" && page.items.length > 0 ? page.error : null}
    onLoadMore={() => { void load(); }}
    onRetry={() => { void load(); }}
  />;
}

function Badges({ unit }: { unit: UnitDto }) {
  return <span className="unit-badges">
    {unit.selectedRevisionId && <span>Selected</span>}
    {unit.latestRevisionId && <span>Latest</span>}
  </span>;
}

function RevisionRail({ root, setRoot, unit, snapshot, controller, onInspect }: {
  root: HTMLDivElement | null;
  setRoot(node: HTMLDivElement | null): void;
  unit: UnitDto;
  snapshot: ProjectScreenSnapshot;
  controller: ProjectScreenController;
  onInspect(revisionId: string): Promise<void>;
}) {
  const revisions = useMemo(() => {
    const exact = snapshot.inspectedUnitRevision.value;
    const rows = exact && !snapshot.unitRevisions.items.some(({ id }) => id === exact.id)
      ? [...snapshot.unitRevisions.items, exact]
      : snapshot.unitRevisions.items;
    return [...rows].sort((a, b) => b.revisionNo - a.revisionNo);
  }, [snapshot.inspectedUnitRevision.value, snapshot.unitRevisions.items]);
  return <div className="unit-revision-rail" aria-label="Unit revisions" ref={setRoot}>
    {revisions.map((revision) => <button
      type="button"
      className={snapshot.inspectedUnitRevisionId === revision.id ? "is-selected" : ""}
      aria-pressed={snapshot.inspectedUnitRevisionId === revision.id}
      disabled={snapshot.unitMutation !== "idle"}
      key={revision.id}
      onClick={() => { void onInspect(revision.id); }}
    >
      <strong>R{revision.revisionNo}</strong>
      <span>{revision.sealedAt === null ? "Draft" : "Sealed"}</span>
      {revision.id === unit.selectedRevisionId && <small>Selected</small>}
      {revision.id === unit.latestRevisionId && <small>Latest</small>}
    </button>)}
    <Tail root={root} page={snapshot.unitRevisions} load={controller.loadMoreUnitRevisions} />
  </div>;
}

function Presentations({ items }: { items: UnitPresentationDto[] }) {
  const groups = useMemo(() => {
    const values = new Map<string, UnitPresentationDto[]>();
    for (const item of [...items].sort((a, b) => a.platform.localeCompare(b.platform) || a.position - b.position)) {
      values.set(item.platform, [...(values.get(item.platform) ?? []), item]);
    }
    return [...values];
  }, [items]);
  if (groups.length === 0) return <p className="empty-section">No presentations.</p>;
  return <>{groups.map(([platform, rows]) => <section className="unit-platform" data-platform={platform} key={platform}>
    <h5>{platform}</h5>
    {rows.map((item) => <article className="unit-presentation" key={item.id}><strong>Position {item.position}</strong><span>{item.effectiveCaptionRevisionId ? "Effective caption" : "No effective caption"}{item.coverArtifactRevisionId ? " · Cover assigned" : ""}</span></article>)}
  </section>)}</>;
}

export function UnitsPanel({ page, controller, snapshot, scrollMemory, resetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  scrollMemory: Map<string, number>;
  resetToken: string;
}) {
  const units = page.items as UnitDto[];
  const masterRef = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const [masterRoot, setMasterRoot] = useState<HTMLDivElement | null>(null);
  const [detailRoot, setDetailRoot] = useState<HTMLElement | null>(null);
  const [revisionRoot, setRevisionRoot] = useState<HTMLDivElement | null>(null);
  const masterScroll = useRememberedScroll(scrollMemory, "units-master", resetToken);
  const detailScroll = useRememberedScroll(scrollMemory, "units-detail", resetToken);
  const attachMaster = useCallback((node: HTMLDivElement | null) => {
    masterRef.current = node;
    masterScroll.ref(node);
    setMasterRoot((current) => current === node ? current : node);
  }, [masterScroll.ref]);
  const attachDetail = useCallback((node: HTMLElement | null) => {
    detailScroll.ref(node);
    setDetailRoot((current) => current === node ? current : node);
  }, [detailScroll.ref]);
  const virtualizer = useVirtualizer({
    count: units.length,
    getScrollElement: () => masterRef.current,
    getItemKey: (index) => units[index]?.id ?? index,
    estimateSize: () => 72,
    initialOffset: () => scrollMemory.get("units-master") ?? 0,
    initialRect: { width: 320, height: 600 },
    overscan: 5,
  });
  const selected = snapshot.unit.value;
  const inspected = snapshot.inspectedUnitRevision.value;
  const pending = snapshot.unitMutation !== "idle";
  const open = async (unitId: string) => {
    const position = masterRef.current?.scrollTop ?? 0;
    await controller.openUnit(unitId);
    if (masterRef.current) masterRef.current.scrollTop = position;
    detailHeading.current?.focus({ preventScroll: true });
  };
  const inspect = async (revisionId: string) => {
    const position = masterRef.current?.scrollTop ?? 0;
    await controller.inspectUnitRevision(revisionId);
    if (masterRef.current) masterRef.current.scrollTop = position;
    detailHeading.current?.focus({ preventScroll: true });
  };

  return <div className="units-workbench">
    <div className="units-master" role="region" aria-label="Units" ref={attachMaster} onScroll={masterScroll.onScroll}>
      <div className="units-virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = units[row.index];
          return <button
            className={`unit-row${snapshot.unitId === item.id ? " is-selected" : ""}`}
            type="button"
            disabled={snapshot.unitMutation !== "idle"}
            aria-pressed={snapshot.unitId === item.id}
            key={row.key}
            onClick={() => { void open(item.id); }}
            style={{ height: row.size, transform: `translateY(${row.start}px)` }}
          ><Layers3 size={18} aria-hidden="true" /><span><strong>{item.slug}</strong><small>{item.format} · Updated {formatTime(item.updatedAt)}</small></span><Badges unit={item} /></button>;
        })}
      </div>
      <AutoCursorTail
        root={masterRoot}
        hasMore={page.nextCursor !== null}
        loading={page.status === "loading" && page.items.length > 0}
        error={page.status === "error" && page.items.length > 0 ? page.error : null}
        onLoadMore={() => { void controller.loadMore("units"); }}
        onRetry={() => { void controller.retryPage("units"); }}
      />
    </div>
    <section className="units-detail" aria-label="Unit detail" ref={attachDetail} onScroll={detailScroll.onScroll}>
      {!snapshot.unitId && <div className="empty-section">Select a Unit to inspect it.</div>}
      {snapshot.unit.status === "loading" && <div className="project-skeleton" role="status">Loading Unit…</div>}
      {snapshot.unit.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.unit.error}</span><button className="command-button" type="button" onClick={() => { if (snapshot.unitId) void controller.openUnit(snapshot.unitId); }}>Retry</button></div>}
      {selected && <>
        <header className="unit-detail-header"><div><h2 className="unit-detail-heading" tabIndex={-1} ref={detailHeading}>{selected.slug}</h2><p>{selected.format} · Updated {formatTime(selected.updatedAt)}</p></div><Badges unit={selected} /></header>
        {snapshot.unitConflict && <p className="project-local-error" role="alert">{snapshot.unitConflict}</p>}
        {snapshot.unitMutationError && <p className="project-local-error" role="alert">{snapshot.unitMutationError}</p>}
        {snapshot.unitRevisions.status === "loading" && snapshot.unitRevisions.items.length === 0 && <div className="project-skeleton" role="status">Loading revisions…</div>}
        {snapshot.unitRevisions.status === "error" && snapshot.unitRevisions.items.length === 0 && <div className="project-local-error" role="alert"><span>{snapshot.unitRevisions.error}</span><button className="command-button" type="button" onClick={() => { void controller.openUnit(selected.id); }}>Retry</button></div>}
        {(snapshot.unitRevisions.items.length > 0 || inspected) && <RevisionRail root={revisionRoot} setRoot={setRevisionRoot} unit={selected} snapshot={snapshot} controller={controller} onInspect={inspect} />}
        {snapshot.inspectedUnitRevision.status === "loading" && <div className="project-skeleton" role="status">Loading revision…</div>}
        {snapshot.inspectedUnitRevision.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.inspectedUnitRevision.error}</span></div>}
        {inspected && <div className="unit-revision-detail">
          <header><div><h3>Revision {inspected.revisionNo}</h3><p>{inspected.sealedAt === null ? "Draft" : `Sealed ${formatTime(inspected.sealedAt)}`}{inspected.note ? ` · ${inspected.note}` : ""}</p></div><button className="command-button" type="button" disabled={pending || snapshot.unitRevisions.status === "loading" || inspected.sealedAt === null || inspected.id === selected.selectedRevisionId} onClick={() => { void controller.selectInspectedUnitRevision(); }}>{pending ? "Selecting…" : "Make selected"}</button></header>
          <section className="unit-items" aria-label="Unit items"><h4>Items</h4>{snapshot.unitItems.status === "loading" && snapshot.unitItems.items.length === 0 ? <div className="project-skeleton" role="status">Loading items…</div> : snapshot.unitItems.status === "error" && snapshot.unitItems.items.length === 0 ? <div className="project-local-error" role="alert"><span>{snapshot.unitItems.error}</span><button className="command-button" type="button" onClick={() => { void controller.inspectUnitRevision(inspected.id); }}>Retry</button></div> : snapshot.unitItems.items.length === 0 ? <p className="empty-section">No items.</p> : [...snapshot.unitItems.items].sort((a, b) => a.position - b.position).map((item) => <article className="unit-item" key={item.id}><strong>#{item.position} · {item.role}</strong><span>{item.artifactRevisionId ? "Artifact source" : item.documentRevisionId ? "Document source" : "Unbound source"}</span></article>)}<Tail key={`items:${inspected.id}`} root={detailRoot} page={snapshot.unitItems} load={controller.loadMoreUnitItems} /></section>
          <section className="unit-presentations" aria-label="Unit presentations"><h4>Presentations</h4>{snapshot.unitPresentations.status === "loading" && snapshot.unitPresentations.items.length === 0 ? <div className="project-skeleton" role="status">Loading presentations…</div> : snapshot.unitPresentations.status === "error" && snapshot.unitPresentations.items.length === 0 ? <div className="project-local-error" role="alert"><span>{snapshot.unitPresentations.error}</span><button className="command-button" type="button" onClick={() => { void controller.inspectUnitRevision(inspected.id); }}>Retry</button></div> : <Presentations items={snapshot.unitPresentations.items} />}<Tail key={`presentations:${inspected.id}`} root={detailRoot} page={snapshot.unitPresentations} load={controller.loadMoreUnitPresentations} /></section>
          <details className="unit-technical"><summary>Technical details</summary><dl><div><dt>Unit ID</dt><dd>{selected.id}</dd></div><div><dt>Revision ID</dt><dd>{inspected.id}</dd></div><div><dt>Parent revision</dt><dd>{inspected.parentRevisionId ?? "None"}</dd></div><div><dt>Iteration</dt><dd>{inspected.iterationId ?? "None"}</dd></div><div><dt>Author session</dt><dd>{inspected.authoredBySessionId ?? "None"}</dd></div></dl><h4>Item configuration</h4>{snapshot.unitItems.items.map((item) => <pre key={item.id}>{item.id}{"\n"}{item.artifactRevisionId ?? item.documentRevisionId ?? "No source"}{"\n"}{json(item.config)}</pre>)}<h4>Presentation configuration</h4>{snapshot.unitPresentations.items.map((item) => <pre key={item.id}>{item.id}{"\n"}Caption {item.effectiveCaptionRevisionId ?? "None"}{"\n"}Cover {item.coverArtifactRevisionId ?? "None"}{"\n"}Crop {json(item.crop)}{"\n"}Safe area {json(item.safeArea)}{"\n"}Options {json(item.options)}</pre>)}</details>
        </div>}
      </>}
    </section>
  </div>;
}
