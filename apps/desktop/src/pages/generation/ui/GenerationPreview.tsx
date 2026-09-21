import { useState } from "react";
import { ArrowDownToLine, Copy, Info, LoaderCircle, RotateCcw, Scan, Square } from "@/shared/ui/icons";
import type { CanvasRun, CanvasRunResult } from "../../../../shared/canvas-runtime";
import { generationDraftFromRun, generationOutputs, type GenerationDraft, type GenerationModel } from "../../../../shared/generation-studio";
import { SaveGenerationToUnit, type OpenGeneratedUnit, studioSelection, STUDIO_BUTTON } from "@/entities/generation";
import { VideoPlayer } from "@/entities/media";
import { MediaPreview } from "@/shared/ui/MediaPreview";
import { Modal } from "@/shared/ui/Modal";
import { estimateLabel, generationParameterLabel, running } from "../lib/generation-presentation";

export interface GenerationPreviewProps {
  workspaceId: string; onOpenUnit?: OpenGeneratedUnit;
  actionError?: string | null;
  run: CanvasRun; resultId?: string; model?: GenerationModel; models?: GenerationModel[]; draft: GenerationDraft;
  onRestore(run: CanvasRun): void; onCancel(id: string): void; onExport(result: CanvasRunResult): void;
  onReference(role: string, result: CanvasRunResult): void; onClose(): void;
}

export const generationRunStatus = (run: CanvasRun) => run.status === "succeeded" ? run.mode === "preview" ? "Estimated" : "Complete" : run.status === "pending" ? "Queued" : run.status === "running" ? run.mode === "preview" ? "Estimating" : "Generating" : run.status === "cancelled" ? "Stopped" : "Failed";

export function GenerationPreview({ run, resultId, ...props }: GenerationPreviewProps) {
  const results = generationOutputs(run);
  const references = run.nodes.filter((entry) => run.snapshot.nodes.some((node) => node.id === entry.nodeId && node.kind === "media")).flatMap((entry) => entry.results.filter((result) => result.asset));
  const [selectedId, setSelectedId] = useState(resultId);
  const [showInfo, setShowInfo] = useState(false);
  const [restored, setRestored] = useState(false);
  const result = results.find((item) => item.id === selectedId) ?? results[0];
  const draft = generationDraftFromRun(run);
  const originalModel = props.models?.find((model) => model.id === draft?.modelId && model.provider === draft?.provider && model.kind === draft?.kind);
  const compatible = props.model?.inputs.filter((input) => input.kind === result?.asset?.kind) ?? [];
  const error = run.error ?? run.nodes.find((node) => node.error)?.error;
  const available = !!result?.asset && !result.unavailableReason;
  return <Modal id="media-viewer" open onOpenChange={(open) => { if (!open) props.onClose(); }} title={result?.label ?? "Generation"}
    description={draft?.prompt || generationRunStatus(run)} descriptionClassName="sr-only" closeLabel="Close generation preview" layer="modal"
    className="generation-preview-modal" size="w-unit-viewer-width h-unit-viewer-height" card="raw" bodyClassName="generation-preview-body" titleClassName="m-0 min-w-0 flex-1 truncate type-sm font-medium text-ink" titlebarClassName="generation-preview-toolbar"
    onCloseAutoFocus={(event) => event.preventDefault()}
    actions={<>
      {running(run) && <button className={STUDIO_BUTTON} type="button" onClick={() => props.onCancel(run.id)}><Square size={10} />Stop</button>}
      <button className={STUDIO_BUTTON} type="button" onClick={() => { props.onRestore(run); setRestored(true); }}><RotateCcw size={12} />{restored ? "Settings restored" : "Use settings"}</button>
      {available && <>
        {!!compatible.length && <details className="generation-preview-reference"><summary className={STUDIO_BUTTON}><Copy size={12} />Reference</summary><div>{compatible.map((spec) => <button className={STUDIO_BUTTON} type="button" key={spec.id} disabled={props.draft.inputs.filter((input) => input.role === spec.id).length >= spec.maxCount} onClick={(event) => { props.onReference(spec.id, result); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Use as {spec.label.toLocaleLowerCase()}</button>)}</div></details>}
        <button className={STUDIO_BUTTON} type="button" onClick={() => props.onExport(result)}><ArrowDownToLine size={13} />Export</button>
        <div className="generation-preview-save"><SaveGenerationToUnit key={`${run.id}:${result.id}`} workspaceId={props.workspaceId} source={{ canvasId: run.canvasId, runId: run.id, resultId: result.id }} kind={result.kind} label={result.label} onOpenUnit={props.onOpenUnit ? (...args) => { props.onClose(); props.onOpenUnit?.(...args); } : undefined} /></div>
      </>}
      <button className={STUDIO_BUTTON} type="button" aria-label="Generation details" aria-pressed={showInfo} onClick={() => setShowInfo((value) => !value)}><Info size={14} /></button>
    </>}>
    <div className="generation-preview-stage">
      {(props.actionError || error) && <p className="generation-preview-error" role="alert">{props.actionError || error}</p>}
      <div className="generation-preview">
        {result ? result.unavailableReason ? <p className="p-4 type-sm" role="status">{result.unavailableReason}</p>
          : result.kind === "video" && result.previewUrl ? <VideoPlayer key={result.id} src={result.previewUrl} name={result.label} tone="instrument" autoPlay loop />
            : <MediaPreview key={result.id} url={result.previewUrl} kind={result.kind} label={result.label} text={result.text} />
          : <div className="generation-preview-state">{running(run) ? <LoaderCircle size={26} className="animate-spin motion-reduce:animate-none" /> : <Scan size={26} strokeWidth={1.3} />}<strong>{run.mode === "preview" && run.status === "succeeded" ? estimateLabel(run) : generationRunStatus(run)}</strong><p>{running(run) ? "Your model is working. You can close this preview and return to the result." : run.mode === "preview" ? "Estimate only. No media generated and no paid request submitted." : "No output was produced by this run."}</p></div>}
      </div>
      {results.length > 1 && <div className="generation-preview-variations" role="group" aria-label="Output variations">{results.map((item, index) => <button className={studioSelection(item.id === result?.id)} type="button" key={item.id} aria-pressed={item.id === result?.id} onClick={() => setSelectedId(item.id)}>Variation {index + 1}</button>)}</div>}
    </div>
    {showInfo && <aside className="generation-preview-info" aria-label="Generation information">
      <span className="type-xs text-muted">{generationRunStatus(run)} · {new Date(run.startedAt).toLocaleString()}</span>
      <p className="m-0 type-sm leading-relaxed whitespace-pre-wrap">{draft?.prompt}</p>
      <dl className="m-0 flex flex-col gap-2 type-xs">{[["Model", originalModel?.name ?? run.snapshot.nodes.find((node) => node.kind === "model")?.title], ["Provider", draft?.provider], ...Object.entries(draft?.parameters ?? {}).map(([key, value]) => [generationParameterLabel(key, originalModel), typeof value === "boolean" ? value ? "On" : "Off" : String(value)])].filter(([, value]) => value).map(([label, value]) => <div className="flex min-w-0 flex-wrap gap-1" key={label}><dt className="text-muted">{label}:</dt><dd className="m-0 break-words">{value}</dd></div>)}</dl>
      {references.length > 0 && <section aria-label="Input references" className="flex flex-col gap-2"><strong className="type-xs font-medium text-muted">Input references · source media</strong><div className="flex flex-wrap gap-2">{references.map((reference) => <figure className="m-0 flex w-24 flex-col gap-1" key={reference.id}><div className="h-20 overflow-hidden rounded-field bg-frame"><MediaPreview url={reference.previewUrl} kind={reference.kind} label={reference.label} /></div><figcaption className="truncate type-xs text-muted">{reference.label}</figcaption></figure>)}</div></section>}
    </aside>}
  </Modal>;
}
