import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, FileVideo, ImageOff } from "lucide-react";
import { useRef, useState } from "react";

import type { CompositionDto, EvaluationDto } from "../../../electron/ralphy/types";
import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import { buildLabel, sortBuilds, sortEvaluations, sortPositioned } from "../../lib/compositions";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot, UnitPage } from "../../state/project-screen-controller";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "./scroll-memory";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString();

function Evaluations({ items }: { items: EvaluationDto[] }) {
  if (items.length === 0) return <p className="composition-empty">No evaluations.</p>;
  return <div className="composition-evaluations">{sortEvaluations(items).map((item) => <p key={item.id}><strong>{item.kind}</strong> · {item.verdict ?? "No verdict"}{item.rating === null ? "" : ` · ${item.rating}/5`}{item.note ? ` · ${item.note}` : ""}</p>)}</div>;
}

function PageTail({ root, page, load }: { root: HTMLElement | null; page: UnitPage<unknown>; load(): void }) {
  return <AutoCursorTail root={root} hasMore={page.nextCursor !== null} loading={page.status === "loading" && page.items.length > 0} error={page.status === "error" ? page.error : null} onLoadMore={load} onRetry={load} />;
}

function OutputPreview({ snapshot, retry }: { snapshot: ProjectScreenSnapshot; retry(): void }) {
  const preview = snapshot.compositionPreview;
  if (preview.status === "idle") return null;
  if (preview.status === "loading") return <div className="project-skeleton" role="status">Loading output preview…</div>;
  if (preview.status === "error") return <div className="preview-unavailable" role="alert"><ImageOff size={20} aria-hidden="true" /><strong>Preview unavailable</strong><span>{preview.error}</span><button className="command-button" type="button" onClick={retry}>Retry</button></div>;
  if (!preview.value) return null;
  const name = preview.artifactRevisionId ?? "Build output";
  if (preview.value.mime?.startsWith("image/")) return <ImageViewport src={preview.value.url} name={name} />;
  if (preview.value.mime?.startsWith("video/")) return <VideoPlayer src={preview.value.url} name={name} />;
  if (preview.value.mime?.startsWith("audio/")) return <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} />;
  return <a href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
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
  const rows = useVirtualizer({ count: compositions.length, getScrollElement: () => master, estimateSize: () => 64, overscan: 6, initialRect: { width: 320, height: 640 } });
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

  return <div className="composition-workbench">
    <div className="composition-master" aria-label="Compositions" ref={bindMaster} onScroll={masterScroll.onScroll}>
      <div className="composition-master-virtual" style={{ height: rows.getTotalSize() }}>
        {rows.getVirtualItems().map((virtual) => {
          const item = compositions[virtual.index]!;
          return <button type="button" key={item.id} className={`composition-master-row${snapshot.compositionId === item.id ? " is-selected" : ""}`} aria-pressed={snapshot.compositionId === item.id} style={{ transform: `translateY(${virtual.start}px)` }} onClick={() => { void open(item.id); }}>
            <FileVideo size={17} aria-hidden="true" /><span><strong>{item.slug}</strong><small>{item.kind} · {item.selectedRevisionId ? "Selected" : "No selection"} · {item.latestRevisionId ? "Latest available" : "No revisions"}</small></span>
          </button>;
        })}
      </div>
      <AutoCursorTail root={master} hasMore={page.nextCursor !== null} loading={page.status === "loading" && page.items.length > 0} error={page.status === "error" && page.items.length > 0 ? page.error : null} onLoadMore={() => { void controller.loadMore("compositions"); }} onRetry={() => { void controller.retryPage("compositions"); }} />
    </div>
    <section className="composition-detail" aria-label="Composition detail" ref={bindDetail} onScroll={detailScroll.onScroll}>
      {snapshot.composition.status === "loading" && <div className="project-skeleton" role="status">Loading Composition…</div>}
      {snapshot.composition.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.composition.error}</span><button className="command-button" type="button" onClick={() => { if (snapshot.compositionId) void controller.openComposition(snapshot.compositionId); }}>Retry</button></div>}
      {composition && <>
        <header className="composition-heading"><div><h3 ref={heading} tabIndex={-1}>{composition.slug}</h3><p>{composition.kind} · {revision ? `${revision.engine}${revision.engineVersion ? ` ${revision.engineVersion}` : ""}` : "Loading revision"}</p></div><button className="command-button" type="button" disabled={pending || composition.latestRevisionId === null} onClick={() => { void controller.reviseSelectedComposition(); }}>{snapshot.compositionMutation === "revise" ? "Creating draft…" : "New draft"}</button></header>
        {snapshot.compositionConflict && <p className="project-local-error" role="alert">{snapshot.compositionConflict}</p>}
        {snapshot.compositionMutationError && <p className="project-local-error" role="alert">{snapshot.compositionMutationError}</p>}
        <div className="composition-revision-rail" ref={setRail} aria-label="Revision history">
          <div style={{ width: revisionRail.getTotalSize() }}>
            {revisionRail.getVirtualItems().map((virtual) => {
              const item = revisions[virtual.index]!;
              return <button type="button" key={item.id} className={snapshot.inspectedCompositionRevisionId === item.id ? "is-selected" : ""} aria-pressed={snapshot.inspectedCompositionRevisionId === item.id} style={{ transform: `translateX(${virtual.start}px)`, width: virtual.size }} onClick={() => { void controller.inspectCompositionRevision(item.id); }}><strong>R{item.revisionNo}</strong><span>{item.state}</span><small>{item.id === composition.selectedRevisionId ? "selected · " : ""}{item.id === composition.latestRevisionId ? "latest · " : ""}{formatTime(item.createdAt)}</small></button>;
            })}
            <div className="composition-rail-tail" style={{ transform: `translateX(${Math.max(0, revisionRail.getTotalSize() - 1)}px)` }}><PageTail root={rail} page={snapshot.compositionRevisions} load={() => { void controller.loadMoreCompositionRevisions(); }} /></div>
          </div>
        </div>
        {snapshot.inspectedCompositionRevision.status === "loading" && <div className="project-skeleton" role="status">Loading revision…</div>}
        {snapshot.inspectedCompositionRevision.status === "error" && <div className="project-local-error" role="alert"><span>{snapshot.inspectedCompositionRevision.error}</span><button className="command-button" type="button" onClick={() => { if (snapshot.inspectedCompositionRevisionId) void controller.inspectCompositionRevision(snapshot.inspectedCompositionRevisionId); }}>Retry</button></div>}
        {revision && <div className="composition-revision-detail">
          <header><div><h4>Revision {revision.revisionNo}</h4><p>{revision.state} · {formatTime(revision.createdAt)}</p></div><div className="composition-actions"><button className="command-button" type="button" disabled={pending || revision.state !== "sealed" || revision.id === composition.selectedRevisionId} onClick={() => { void controller.selectInspectedCompositionRevision(); }}>{snapshot.compositionMutation === "select" ? "Selecting…" : "Make selected"}</button><button className="command-button" type="button" disabled={pending || revision.state !== "draft" || revision.id !== composition.latestRevisionId} onClick={() => { void controller.buildInspectedCompositionRevision(); }}>{snapshot.compositionMutation === "build" ? "Building…" : buildLabel(composition.kind)}</button></div></header>
          <section className="composition-primary"><h5>{buildLabel(composition.kind)}</h5>{snapshot.compositionBuilds.status === "error" ? <div className="project-local-error" role="alert"><span>{snapshot.compositionBuilds.error}</span><button className="command-button" type="button" onClick={() => { void controller.loadMoreCompositionBuilds(); }}>Retry</button></div> : snapshot.inspectedCompositionBuild.status === "loading" ? <div role="status">Loading latest build…</div> : snapshot.inspectedCompositionBuild.status === "error" ? <div className="project-local-error" role="alert"><span>{snapshot.inspectedCompositionBuild.error}</span><button className="command-button" type="button" onClick={() => { void controller.inspectCompositionRevision(revision.id); }}>Retry</button></div> : build ? <><div className="composition-build-summary"><strong>{build.state}</strong><span>{formatTime(build.createdAt)}</span></div><Evaluations items={snapshot.compositionBuildEvaluations.items} /><PageTail root={detail} page={snapshot.compositionBuildEvaluations} load={() => { void controller.loadMoreCompositionBuildEvaluations(); }} /><ul>{sortPositioned(snapshot.compositionBuildOutputs.items).map((output) => <li key={output.id}><span>#{output.position} · {output.role ?? "output"}</span><button className="command-button" type="button" onClick={() => { void controller.previewCompositionOutput(output.artifactRevisionId); }}>Preview</button></li>)}</ul><PageTail root={detail} page={snapshot.compositionBuildOutputs} load={() => { void controller.loadMoreCompositionBuildOutputs(); }} /></> : <p>No builds yet.</p>}</section>
          <section className="composition-output-preview" aria-label="Build output preview"><OutputPreview snapshot={snapshot} retry={() => { if (snapshot.compositionPreview.artifactRevisionId) void controller.previewCompositionOutput(snapshot.compositionPreview.artifactRevisionId); }} /></section>
          <details className="composition-technical"><summary>Technical details</summary>
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
