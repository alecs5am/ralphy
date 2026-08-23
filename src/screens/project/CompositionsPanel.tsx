import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, FileVideo } from "lucide-react";
import { useRef, useState } from "react";

import type { CompositionDto, EvaluationDto } from "../../../electron/ralphy/types";
import { buildLabel, sortBuilds, sortEvaluations, sortPositioned } from "../../lib/compositions";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot, UnitPage } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { ArtifactPreview } from "./ArtifactPreview";
import { useRememberedScroll } from "./scroll-memory";
import { COMMAND_BUTTON_SM, PROJECT_LOCAL_ERROR, PROJECT_SKELETON } from "../route-chrome";

const LIST_EDGE = 4;
const ROW_GAP = 6;
const ROW_SIZE = 52;

// The split's two panes are the scroll owners; the detail is the widget, the master is air.
const PANE = "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]";
const ROW = "absolute left-1.5 grid w-[calc(100%_-_12px)] grid-cols-(--project-glyph-row-columns) items-center gap-2.5 rounded-field px-2.5 py-1.5 text-left focus-visible:-outline-offset-2 [&>span]:min-w-0 [&_small]:mt-0.75 [&_small]:block [&_small]:truncate [&_small]:type-sm [&_strong]:block [&_strong]:truncate";
// The rail card states its ink only in its two states: a base descendant ink and a state
// descendant ink are the same specificity, so the state would lose by stylesheet order.
const RAIL_CARD = "absolute top-1 h-15 overflow-hidden rounded-control border-0 px-2.25 py-1.75 text-left focus-visible:-outline-offset-2 [&_small]:mt-0.75 [&_small]:block [&_small]:truncate [&_span]:mt-0.75 [&_span]:block [&_span]:truncate";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString();
const formatDate = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Evaluations({ items }: { items: EvaluationDto[] }) {
  if (items.length === 0) return <p className="composition-empty text-muted [overflow-wrap:anywhere]">No evaluations.</p>;
  return <div className="composition-evaluations">{sortEvaluations(items).map((item) => <p key={item.id}><strong>{item.kind}</strong> · {item.verdict ?? "No verdict"}{item.rating === null ? "" : ` · ${item.rating}/5`}{item.note ? ` · ${item.note}` : ""}</p>)}</div>;
}

function PageTail({ root, page, load }: { root: HTMLElement | null; page: UnitPage<unknown>; load(): void }) {
  return <AutoCursorTail root={root} hasMore={page.nextCursor !== null} loading={page.status === "loading" && page.items.length > 0} error={page.status === "error" ? page.error : null} onLoadMore={load} onRetry={load} />;
}

export function CompositionsPanel({ page, controller, snapshot, scrollMemory, resetToken }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  scrollMemory: Map<string, number>;
  resetToken: string;
}) {
  const compositions = page.items as CompositionDto[];
  const [master, setMaster] = useState<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<HTMLElement | null>(null);
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const masterScroll = useRememberedScroll(scrollMemory, "compositions-master", resetToken);
  const detailScroll = useRememberedScroll(scrollMemory, "compositions-detail", resetToken);
  const rows = useVirtualizer({ count: compositions.length, getScrollElement: () => master, estimateSize: () => ROW_SIZE, overscan: 6, initialRect: { width: 320, height: 640 } });
  const revisions = snapshot.compositionRevisions.items;
  const revisionRail = useVirtualizer({ horizontal: true, count: revisions.length, getScrollElement: () => rail, estimateSize: () => 124, overscan: 4, initialRect: { width: 760, height: 88 } });
  const composition = snapshot.composition.value;
  const revision = snapshot.inspectedCompositionRevision.value;
  const build = snapshot.inspectedCompositionBuild.value;
  const pending = snapshot.compositionMutation !== "idle";
  const bindMaster = (node: HTMLDivElement | null) => { setMaster(node); masterScroll.ref(node); };
  const bindDetail = (node: HTMLElement | null) => { setDetail(node); detailScroll.ref(node); };
  const open = async (id: string) => {
    const top = master?.scrollTop ?? 0;
    await controller.openComposition(id);
    if (master) master.scrollTop = top;
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  };

  return <div className="composition-workbench grid h-full min-h-0 min-w-0 grid-cols-(--project-composition-columns) gap-4 @max-project-stack/project-domain:grid-cols-1 @max-project-stack/project-domain:grid-rows-(--project-split-rows)">
    <div className={`composition-master ${PANE}`} aria-label="Compositions" ref={bindMaster} onScroll={masterScroll.onScroll}>
      <div className="composition-master-virtual relative" style={{ height: rows.getTotalSize() + LIST_EDGE * 2 }}>
        {rows.getVirtualItems().map((virtual) => {
          const item = compositions[virtual.index]!;
          return <button type="button" key={item.id} className={`composition-master-row ${ROW} ${snapshot.compositionId === item.id ? "is-selected bg-desk-primary text-desk-primary-ink [&_small]:text-desk-primary-ink" : "bg-transparent text-ink hover:bg-surface-hover [&_small]:text-muted"}`} aria-pressed={snapshot.compositionId === item.id} style={{ height: virtual.size - ROW_GAP, transform: `translateY(${virtual.start + LIST_EDGE}px)` }} onClick={() => { void open(item.id); }}>
            <FileVideo size={17} aria-hidden="true" /><span><strong>{item.slug}</strong><small>{item.kind} · {item.selectedRevisionId ? "Selected" : "No selection"} · {item.latestRevisionId ? "Latest available" : "No revisions"}</small></span>
          </button>;
        })}
      </div>
      <AutoCursorTail root={master} hasMore={page.nextCursor !== null} loading={page.status === "loading" && page.items.length > 0} error={page.status === "error" && page.items.length > 0 ? page.error : null} onLoadMore={() => { void controller.loadMore("compositions"); }} onRetry={() => { void controller.retryPage("compositions"); }} />
    </div>
    <section className={`composition-detail ${PANE} block rounded-cell bg-surface-sunken px-4.5 pb-12 [&_.composition-empty]:text-muted [&_h4]:m-0 [&_h5]:m-0`} aria-label="Composition detail" ref={bindDetail} onScroll={detailScroll.onScroll}>
      {snapshot.composition.status === "loading" && <div className={PROJECT_SKELETON} role="status">Loading Composition…</div>}
      {snapshot.composition.status === "error" && <div className={PROJECT_LOCAL_ERROR} role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.composition.error}</span><button className={COMMAND_BUTTON_SM} type="button" onClick={() => { if (snapshot.compositionId) void controller.openComposition(snapshot.compositionId); }}>Retry</button></div>}
      {composition && <>
        <header className="composition-heading sticky top-0 z-raised flex items-start justify-between gap-3 bg-surface-sunken py-4 [&_h3]:m-0 [&_h3]:focus-visible:-outline-offset-2 [&_p]:m-0 [&_p]:text-muted [&_p]:[overflow-wrap:anywhere]"><div><h3 ref={heading} tabIndex={-1}>{composition.slug}</h3><p>{composition.kind} · {revision ? `${revision.engine}${revision.engineVersion ? ` ${revision.engineVersion}` : ""}` : "Loading revision"}</p></div><button className={COMMAND_BUTTON_SM} type="button" disabled={pending || composition.latestRevisionId === null} onClick={() => { void controller.reviseSelectedComposition(); }}>{snapshot.compositionMutation === "revise" ? "Creating draft…" : "New draft"}</button></header>
        {snapshot.compositionConflict && <p className={PROJECT_LOCAL_ERROR} role="alert">{snapshot.compositionConflict}</p>}
        {snapshot.compositionMutationError && <p className={PROJECT_LOCAL_ERROR} role="alert">{snapshot.compositionMutationError}</p>}
        <div className="composition-revision-rail relative mb-4.5 mt-2.5 min-h-revision-rail overflow-x-auto overflow-y-hidden px-1.5 [scrollbar-gutter:stable] [&_.auto-cursor-tail]:h-15 [&_.auto-cursor-tail]:w-0.5 [&_.auto-cursor-tail]:p-0" ref={setRail} aria-label="Revision history">
          <div className="relative h-18" style={{ width: revisionRail.getTotalSize() }}>
            {revisionRail.getVirtualItems().map((virtual) => {
              const item = revisions[virtual.index]!;
              const selected = item.id === composition.selectedRevisionId;
              const latest = item.id === composition.latestRevisionId;
              return <button type="button" title={`Revision ${item.revisionNo} · ${formatTime(item.createdAt)}`} key={item.id} className={`${RAIL_CARD} ${snapshot.inspectedCompositionRevisionId === item.id ? "is-selected bg-desk-primary text-desk-primary-ink [&_small]:text-desk-primary-ink [&_span]:text-desk-primary-ink" : "bg-transparent text-ink hover:bg-surface-hover [&_small]:text-muted [&_span]:text-muted"}`} aria-pressed={snapshot.inspectedCompositionRevisionId === item.id} style={{ transform: `translateX(${virtual.start}px)`, width: virtual.size - ROW_GAP }} onClick={() => { void controller.inspectCompositionRevision(item.id); }}><strong>R{item.revisionNo}</strong><span>{item.state}</span><small>{selected && latest ? "Selected · Latest" : selected ? "Selected" : latest ? "Latest" : formatDate(item.createdAt)}</small></button>;
            })}
            <div className="composition-rail-tail absolute top-1 h-15 w-0.5" style={{ transform: `translateX(${Math.max(0, revisionRail.getTotalSize() - 1)}px)` }}><PageTail root={rail} page={snapshot.compositionRevisions} load={() => { void controller.loadMoreCompositionRevisions(); }} /></div>
          </div>
        </div>
        {snapshot.inspectedCompositionRevision.status === "loading" && <div className={PROJECT_SKELETON} role="status">Loading revision…</div>}
        {snapshot.inspectedCompositionRevision.status === "error" && <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{snapshot.inspectedCompositionRevision.error}</span><button className={COMMAND_BUTTON_SM} type="button" onClick={() => { if (snapshot.inspectedCompositionRevisionId) void controller.inspectCompositionRevision(snapshot.inspectedCompositionRevisionId); }}>Retry</button></div>}
        {revision && <div className="composition-revision-detail [&>header]:flex [&>header]:items-start [&>header]:justify-between [&>header]:gap-3 [&>section]:mt-3 [&>section]:rounded-field [&>section]:bg-surface [&>section]:p-4 [&_p]:m-0 [&_p]:text-muted [&_p]:[overflow-wrap:anywhere]">
          <header><div><h4>Revision {revision.revisionNo}</h4><p>{revision.state} · {formatTime(revision.createdAt)}</p></div><div className="composition-actions flex gap-2"><button className={COMMAND_BUTTON_SM} type="button" disabled={pending || revision.state !== "sealed" || revision.id === composition.selectedRevisionId} onClick={() => { void controller.selectInspectedCompositionRevision(); }}>{snapshot.compositionMutation === "select" ? "Selecting…" : "Make selected"}</button><button className={COMMAND_BUTTON_SM} type="button" disabled={pending || revision.state !== "draft" || revision.id !== composition.latestRevisionId} onClick={() => { void controller.buildInspectedCompositionRevision(); }}>{snapshot.compositionMutation === "build" ? "Building…" : buildLabel(composition.kind)}</button></div></header>
          <section className="composition-output-section"><h5>Output preview</h5><div className="composition-output-preview mt-2.5 h-unit-preview min-h-65 overflow-hidden rounded-cell bg-surface has-[.preview-empty]:h-unit-preview-empty has-[.preview-empty]:min-h-unit-preview-empty [&>.preview-unavailable]:h-full [&>.project-skeleton]:h-full" aria-label="Build output preview"><ArtifactPreview preview={snapshot.compositionPreview} empty={build ? "No visual output in this build." : "No build output to preview."} retry={() => { if (snapshot.compositionPreview.artifactRevisionId) void controller.previewCompositionOutput(snapshot.compositionPreview.artifactRevisionId); }} /></div></section>
          <section className="composition-primary [&_li]:mt-2 [&_li]:flex [&_li]:items-start [&_li]:justify-between [&_li]:gap-3 [&_p]:m-0 [&_p]:text-muted [&_small]:text-muted [&_span]:text-muted"><h5>{buildLabel(composition.kind)}</h5>{snapshot.compositionBuilds.status === "error" ? <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{snapshot.compositionBuilds.error}</span><button className={COMMAND_BUTTON_SM} type="button" onClick={() => { void controller.loadMoreCompositionBuilds(); }}>Retry</button></div> : snapshot.inspectedCompositionBuild.status === "loading" ? <div role="status">Loading latest build…</div> : snapshot.inspectedCompositionBuild.status === "error" ? <div className={PROJECT_LOCAL_ERROR} role="alert"><span>{snapshot.inspectedCompositionBuild.error}</span><button className={COMMAND_BUTTON_SM} type="button" onClick={() => { void controller.inspectCompositionRevision(revision.id); }}>Retry</button></div> : build ? <><div className="composition-build-summary mb-2.5 flex items-baseline justify-between gap-3"><strong>{build.state}</strong><span>{formatTime(build.createdAt)}</span></div><Evaluations items={snapshot.compositionBuildEvaluations.items} /><PageTail root={detail} page={snapshot.compositionBuildEvaluations} load={() => { void controller.loadMoreCompositionBuildEvaluations(); }} /><ul>{sortPositioned(snapshot.compositionBuildOutputs.items).map((output) => <li key={output.id}><span>#{output.position} · {output.role ?? "output"}</span><button className={COMMAND_BUTTON_SM} type="button" onClick={() => { void controller.previewCompositionOutput(output.artifactRevisionId); }}>Preview</button></li>)}</ul><PageTail root={detail} page={snapshot.compositionBuildOutputs} load={() => { void controller.loadMoreCompositionBuildOutputs(); }} /></> : <p>No builds yet.</p>}</section>
          <details className="composition-technical mt-4 border-0 pt-4 [&>summary]:cursor-pointer [&>summary]:text-muted [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:font-code [&_dd]:[overflow-wrap:anywhere] [&_dl]:grid [&_dl]:gap-2 [&_dl>div]:grid [&_dl>div]:grid-cols-(--project-technical-columns) [&_dl>div]:gap-3 [&_dt]:text-muted"><summary>Technical details</summary>
            <dl><div><dt>Composition ID</dt><dd>{composition.id}</dd></div><div><dt>Revision ID</dt><dd>{revision.id}</dd></div><div><dt>Parent</dt><dd>{revision.parentRevisionId ?? "None"}</dd></div><div><dt>Iteration</dt><dd>{revision.iterationId ?? "None"}</dd></div><div><dt>Author Session</dt><dd>{revision.authoredBySessionId ?? "None"}</dd></div>{build && <><div><dt>Build ID</dt><dd>{build.id}</dd></div><div><dt>Run ID</dt><dd>{build.runId ?? "None"}</dd></div></>}</dl>
            <h5>Revision evaluations</h5><Evaluations items={snapshot.compositionRevisionEvaluations.items} /><PageTail root={detail} page={snapshot.compositionRevisionEvaluations} load={() => { void controller.loadMoreCompositionRevisionEvaluations(); }} />
            <h5>Sources</h5><ul>{sortPositioned(snapshot.compositionSources.items).map((source) => <li key={source.id}>#{source.position} · Object {source.objectId}</li>)}</ul><PageTail root={detail} page={snapshot.compositionSources} load={() => { void controller.loadMoreCompositionSources(); }} />
            <h5>Inputs</h5><ul>{sortPositioned(snapshot.compositionInputs.items).map((input) => <li key={input.id}>#{input.position} · {input.role} · Artifact revision {input.artifactRevisionId}</li>)}</ul><PageTail root={detail} page={snapshot.compositionInputs} load={() => { void controller.loadMoreCompositionInputs(); }} />
            <h5>Build history</h5>{sortBuilds(snapshot.compositionBuilds.items).map((item) => <p key={item.id}>{item.id} · {item.state} · {formatTime(item.createdAt)}</p>)}<PageTail root={detail} page={snapshot.compositionBuilds} load={() => { void controller.loadMoreCompositionBuilds(); }} />
          </details>
        </div>}
      </>}
    </section>
  </div>;
}
