import { AlertCircle, FileVideo, ImageOff } from "lucide-react";
import type { ReactNode } from "react";

import type { CompositionDto, EvaluationDto } from "../../../electron/ralphy/types";
import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import { buildLabel, sortBuilds, sortCompositionRevisions, sortEvaluations, sortPositioned } from "../../lib/compositions";
import type { DomainPage } from "../../state/project-domain";
import type { ProjectScreenController, ProjectScreenSnapshot } from "../../state/project-screen-controller";

const formatTime = (value: number) => new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString();

function Evaluations({ items }: { items: EvaluationDto[] }) {
  if (items.length === 0) return null;
  return <div className="composition-evaluations" aria-label="Evaluations">{sortEvaluations(items).map((item) => <p key={item.id}><strong>{item.kind}</strong> · {item.verdict ?? "No verdict"}{item.rating === null ? "" : ` · ${item.rating}/5`}{item.note ? ` · ${item.note}` : ""}</p>)}</div>;
}

function OutputPreview({ snapshot }: { snapshot: ProjectScreenSnapshot }) {
  const preview = snapshot.compositionPreview;
  if (preview.status === "idle") return null;
  if (preview.status === "loading") return <div className="project-skeleton" role="status">Loading output preview…</div>;
  if (preview.status === "error") return <div className="preview-unavailable" role="alert"><ImageOff size={20} aria-hidden="true" /><strong>Preview unavailable</strong><span>{preview.error}</span></div>;
  if (!preview.value) return null;
  const name = preview.artifactRevisionId ?? "Build output";
  if (preview.value.mime?.startsWith("image/")) return <ImageViewport src={preview.value.url} name={name} />;
  if (preview.value.mime?.startsWith("video/")) return <VideoPlayer src={preview.value.url} name={name} />;
  if (preview.value.mime?.startsWith("audio/")) return <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} />;
  return <a href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
}

export function CompositionsPanel({ page, controller, snapshot, pagination }: {
  page: DomainPage;
  controller: ProjectScreenController;
  snapshot: ProjectScreenSnapshot;
  pagination: ReactNode;
}) {
  const aggregate = snapshot.composition.value;
  const inspected = aggregate?.revisions.find(({ id }) => id === snapshot.inspectedCompositionRevisionId) ?? null;
  const pending = snapshot.compositionMutation !== "idle";
  return <div className="project-split-view composition-panel">
    <div className="project-domain-list composition-list" aria-label="Compositions">
      {(page.items as CompositionDto[]).map((item) => <button type="button" key={item.id} className={snapshot.compositionId === item.id ? "is-selected" : ""} aria-pressed={snapshot.compositionId === item.id} onClick={() => { void controller.openComposition(item.id); }}><FileVideo size={16} aria-hidden="true" /><span><strong>{item.slug}</strong><small>{item.kind} · Selected {item.selectedRevisionId ?? "None"} · Latest {item.latestRevisionId ?? "None"}</small></span></button>)}
      {pagination}
    </div>
    <section className="project-preview composition-detail" aria-label="Composition detail">
      {snapshot.composition.status === "loading" && <div className="project-skeleton" role="status">Loading Composition…</div>}
      {snapshot.composition.status === "error" && <div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.composition.error}</span><button className="command-button" type="button" onClick={() => { if (snapshot.compositionId) void controller.openComposition(snapshot.compositionId); }}>Retry</button></div>}
      {aggregate && <>
        <header className="composition-heading"><div><h3>{aggregate.slug}</h3><p>{aggregate.kind} · ID {aggregate.id}</p><p><strong>Selected {aggregate.selectedRevisionId ?? "None"}</strong> · <strong>Latest {aggregate.latestRevisionId ?? "None"}</strong></p></div><button className="command-button" type="button" disabled={pending || aggregate.latestRevisionId === null} onClick={() => { void controller.reviseSelectedComposition(); }}>{snapshot.compositionMutation === "revise" ? "Creating draft…" : "New draft"}</button></header>
        {snapshot.compositionConflict && <p className="project-local-error" role="alert">{snapshot.compositionConflict}</p>}
        {snapshot.compositionMutationError && <p className="project-local-error" role="alert">{snapshot.compositionMutationError}</p>}
        <div className="composition-revisions" aria-label="Revision history">{sortCompositionRevisions(aggregate.revisions).map((revision) => <button type="button" key={revision.id} className={inspected?.id === revision.id ? "is-selected" : ""} aria-pressed={inspected?.id === revision.id} onClick={() => controller.inspectCompositionRevision(revision.id)}><strong>Revision {revision.revisionNo}</strong><span>{revision.id}</span><small>{revision.state}{revision.id === aggregate.selectedRevisionId ? " · selected" : ""}{revision.id === aggregate.latestRevisionId ? " · latest" : ""}</small></button>)}</div>
        {inspected && <div className="composition-revision-detail">
          <header><div><h4>Revision {inspected.revisionNo}</h4><p>ID {inspected.id} · Parent {inspected.parentRevisionId ?? "None"} · Iteration {inspected.iterationId ?? "None"}</p><p>{inspected.engine}{inspected.engineVersion ? ` ${inspected.engineVersion}` : ""} · {inspected.state} · {inspected.authoredBySessionId ?? "No author Session"} · {formatTime(inspected.createdAt)}</p></div><div className="composition-actions"><button className="command-button" type="button" disabled={pending || inspected.state !== "sealed" || inspected.id === aggregate.selectedRevisionId} onClick={() => { void controller.selectInspectedCompositionRevision(); }}>{snapshot.compositionMutation === "select" ? "Selecting…" : "Make selected"}</button><button className="command-button" type="button" disabled={pending || inspected.state !== "draft" || inspected.id !== aggregate.latestRevisionId} onClick={() => { void controller.buildInspectedCompositionRevision(); }}>{snapshot.compositionMutation === "build" ? "Building…" : buildLabel(aggregate.kind)}</button></div></header>
          <Evaluations items={inspected.evaluations} />
          <section><h5>Sources</h5>{inspected.sources.length === 0 ? <p>None.</p> : <ul>{sortPositioned(inspected.sources).map((source) => <li key={source.id}>#{source.position} · Object {source.objectId}</li>)}</ul>}</section>
          <section><h5>Inputs</h5>{inspected.inputs.length === 0 ? <p>None.</p> : <ul>{sortPositioned(inspected.inputs).map((input) => <li key={input.id}>#{input.position} · {input.role} · Artifact revision {input.artifactRevisionId}</li>)}</ul>}</section>
          <section><h5>{buildLabel(aggregate.kind)}s</h5>{inspected.builds.length === 0 ? <p>No Builds yet.</p> : sortBuilds(inspected.builds).map((build) => <article className="composition-build" key={build.id}><header><strong>{buildLabel(aggregate.kind)} {build.id}</strong><span>{build.state} · Run {build.runId ?? "None"}</span><small>Created {formatTime(build.createdAt)}{build.finishedAt ? ` · Finished ${formatTime(build.finishedAt)}` : ""}</small></header><Evaluations items={build.evaluations} /><ul>{sortPositioned(build.outputs).map((output) => <li key={output.id}><span>#{output.position} · {output.role ?? "output"} · Artifact revision {output.artifactRevisionId}</span><button className="command-button" type="button" onClick={() => { void controller.previewCompositionOutput(output.artifactRevisionId); }}>Preview</button></li>)}</ul></article>)}</section>
          <section className="composition-output-preview" aria-label="Build output preview"><OutputPreview snapshot={snapshot} /></section>
        </div>}
      </>}
    </section>
  </div>;
}
