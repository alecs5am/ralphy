import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, Clock3, Copy, Image, LoaderCircle, Maximize2, Minimize2, RotateCcw, Scan, Square, X } from "lucide-react";
import type { CanvasRun, CanvasRunResult } from "../../../../shared/canvas-runtime";
import { generationDraftFromRun, type GenerationDraft, type GenerationKind, type GenerationModel } from "../../../../shared/generation-studio";
import { MediaPreview } from "@/shared/ui/MediaPreview";
import { ICON_BUTTON } from "@/shared/ui/IconButton";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import { estimateLabel, generationCost, generationParameterLabel, generationTab, running } from "../lib/generation-presentation";
import { GenerationEmpty } from "./GenerationEmpty";
import { studioSelection, STUDIO_BUTTON, STUDIO_ICON } from "@/entities/generation"

interface ResultsProps {
  runs: CanvasRun[]; kind: GenerationKind; model?: GenerationModel; models?: GenerationModel[]; draft: GenerationDraft;
  lastStartedId?: string | null;
  expanded: boolean; onExpand(): void; onPrompt(prompt: string): void;
  onRestore(run: CanvasRun): void; onCancel(id: string): void; onExport(result: CanvasRunResult): void;
  onReference(role: string, result: CanvasRunResult): void;
}
const statusLabel = (run: CanvasRun) => run.status === "succeeded" ? run.mode === "preview" ? "Estimated" : "Complete" : run.status === "pending" ? "Queued" : run.status === "running" ? run.mode === "preview" ? "Estimating" : "Generating" : run.status === "cancelled" ? "Stopped" : "Failed";

function RunStatus({ run }: { run: CanvasRun }) {
  const Icon = running(run) ? LoaderCircle : run.status === "succeeded" ? run.mode === "preview" ? Scan : Check : run.status === "failed" ? X : Square;
  return <span className="inline-flex items-center gap-1.5 type-xs text-muted"><Icon size={11} className={running(run) ? "animate-spin motion-reduce:animate-none" : ""} />{statusLabel(run)}</span>;
}

export function GenerationResults(props: ResultsProps) {
  const { runs, kind, expanded, onExpand } = props;
  const [filter, setFilter] = useState<"outputs" | "history">("outputs");
  const [selection, setSelection] = useState<{ runId: string; resultId?: string } | null>(null);
  const openedStart = useRef<string | null>(null);
  useEffect(() => {
    const id = props.lastStartedId;
    if (!id || id === openedStart.current) return;
    const run = runs.find((item) => item.id === id);
    if (!run) return;
    openedStart.current = id;
    if (run.mode === "execute") { setFilter("outputs"); setSelection({ runId: id }); }
  }, [props.lastStartedId, runs]);
  const allOutputs = runs.flatMap((run) => run.mode === "execute" ? run.nodes.flatMap((node) => node.results.filter((result) => result.asset).map((result) => ({ run, result }))) : []);
  const visibleRuns = runs.filter((run) => generationTab(generationDraftFromRun(run)?.kind ?? "image") === generationTab(kind));
  const selected = visibleRuns.find((run) => run.id === selection?.runId);
  const outputs = allOutputs.filter(({ run }) => visibleRuns.includes(run));
  const activeRuns = visibleRuns.filter(running);
  return <Window className="generation-results min-w-0">
    <WindowTitlebar className="generation-titlebar generation-result-titlebar"><span className="flex min-w-0 flex-1 items-center gap-1" role="group" aria-label="Generation result view">{(["outputs", "history"] as const).map((value) => <button key={value} type="button" className="generation-result-tab" aria-pressed={filter === value} onClick={() => { setFilter(value); setSelection(null); }}>{value === "outputs" ? "Creations" : "History"}<span className="generation-count">{value === "outputs" ? outputs.length : visibleRuns.length}</span></button>)}</span><button className={`${ICON_BUTTON} generation-result-expand`} type="button" onClick={onExpand} aria-label={expanded ? "Show generation controls" : "Expand creations"}>{expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button></WindowTitlebar>
    <WindowBody className="generation-gallery">
      {selected ? <GenerationDetail {...props} run={selected} resultId={selection?.resultId} onClose={() => setSelection(null)} /> : <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {activeRuns.map((run) => <div className="mx-4 mt-4 flex items-center gap-3 rounded-field bg-generation-tint p-3" role="status" key={run.id}><LoaderCircle size={17} className="shrink-0 animate-spin text-generation-accent motion-reduce:animate-none" /><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="type-sm font-medium">{run.mode === "preview" ? "Checking your generation" : "Your idea is taking shape"}</strong><span className="truncate type-xs text-muted">{generationDraftFromRun(run)?.prompt}</span></span><button className={STUDIO_BUTTON} type="button" onClick={() => props.onCancel(run.id)}><Square size={10} />Stop</button></div>)}
        {filter === "outputs" ? outputs.length ? <div className="generation-output-grid">{outputs.map(({ run, result }) => <div className="generation-output-card" key={`${run.id}:${result.id}`}>
          <div className="generation-tile-media"><MediaPreview url={result.previewUrl} kind={result.kind} label={result.label} /></div>
          <div className="generation-output-caption"><button className="focus-visible:outline-2 focus-visible:outline-ink" type="button" onClick={() => setSelection({ runId: run.id, resultId: result.id })}><strong><span>{generationDraftFromRun(run)?.prompt || result.label}</span></strong><small>{run.snapshot.nodes.find((node) => node.kind === "model")?.title} · {new Date(run.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></button><button className={STUDIO_ICON} type="button" aria-label={`Open ${result.label}`} onClick={() => setSelection({ runId: run.id, resultId: result.id })}><ArrowUpRight size={13} /></button></div>
        </div>)}</div> : <GenerationEmpty kind={kind} onPrompt={props.onPrompt} /> : visibleRuns.length ? <div className="flex flex-col gap-2 p-4">{visibleRuns.map((run) => <button className="generation-history-row focus-visible:outline-2 focus-visible:outline-ink" type="button" key={run.id} onClick={() => setSelection({ runId: run.id })}><span className="grid size-10 shrink-0 place-items-center rounded-field bg-card text-muted">{run.mode === "preview" ? <Scan size={17} /> : <Image size={17} />}</span><span className="flex min-w-0 flex-1 flex-col gap-1.5"><strong className="truncate type-sm font-medium">{generationDraftFromRun(run)?.prompt || "Generation"}</strong><span className="flex flex-wrap items-center gap-2"><RunStatus run={run} /><span className="type-xs text-muted">{run.snapshot.nodes.find((node) => node.kind === "model")?.title}</span></span></span><span className="flex shrink-0 flex-col items-end gap-1.5 type-xs text-muted"><span>{new Date(run.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>{generationCost(run) !== null && <span className="generation-count">{estimateLabel(run)}</span>}</span><ArrowUpRight size={12} className="shrink-0 text-muted" /></button>)}</div> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"><Clock3 size={26} strokeWidth={1.3} className="text-muted" /><strong className="type-sm font-medium">A fresh creative history</strong><p className="m-0 max-w-sm type-sm leading-relaxed text-muted">Generations and estimates stay here with the prompt, references and settings used.</p></div>}
      </div>}
    </WindowBody>
  </Window>;
}

function GenerationDetail({ run, resultId, onClose, ...props }: ResultsProps & { run: CanvasRun; resultId?: string; onClose(): void }) {
  const results = run.nodes.flatMap((node) => node.results.filter((result) => result.asset));
  const [selectedId, setSelectedId] = useState(resultId);
  const result = results.find((item) => item.id === selectedId) ?? results[0];
  const draft = generationDraftFromRun(run);
  const originalModel = (props.models ?? []).find((model) => model.id === draft?.modelId && model.provider === draft?.provider && model.kind === draft?.kind);
  const compatible = props.model?.inputs.filter((input) => input.kind === result?.asset?.kind) ?? [];
  const error = run.error ?? run.nodes.find((node) => node.error)?.error;
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-divider p-3"><button className={STUDIO_BUTTON} type="button" onClick={onClose}><ArrowLeft size={13} />Back</button><RunStatus run={run} /><span className="flex-1" />{running(run) && <button className={STUDIO_BUTTON} type="button" onClick={() => props.onCancel(run.id)}><Square size={10} />Stop</button>}<button className={STUDIO_BUTTON} type="button" onClick={() => { props.onRestore(run); if (props.expanded) props.onExpand(); }}><RotateCcw size={12} />Use settings</button>{result?.asset && <button className={STUDIO_BUTTON} type="button" onClick={() => props.onExport(result)}><ArrowDownToLine size={13} />Export</button>}</div>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {result ? <div className="generation-preview flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-frame text-on-instrument"><MediaPreview url={result.previewUrl} kind={result.kind} label={result.label} /></div> : <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 bg-generation-tint p-6 text-center"><Scan size={30} strokeWidth={1.3} className="text-generation-accent" /><strong className="font-code type-metric">{run.mode === "preview" && run.status === "succeeded" ? estimateLabel(run) : statusLabel(run)}</strong><span className="max-w-sm type-sm leading-relaxed text-muted">{running(run) ? "Your model is working. You can leave this page and come back to the result." : run.mode === "preview" ? "Estimate only. No media generated and no paid request submitted." : "No output was produced by this run."}</span></div>}
      {results.length > 1 && <div className="flex shrink-0 gap-2 border-b border-divider p-3" role="group" aria-label="Output variations">{results.map((item, index) => <button className={`${studioSelection(item.id === result?.id)}`} type="button" key={item.id} aria-pressed={item.id === result?.id} onClick={() => setSelectedId(item.id)}>Variation {index + 1}</button>)}</div>}
      <div className="flex shrink-0 flex-col gap-3 p-4">
        {error && <p className="m-0 rounded-field bg-field p-3 type-xs leading-relaxed whitespace-pre-wrap text-ink" role="alert">{error}</p>}
        <p className="m-0 type-sm leading-relaxed whitespace-pre-wrap text-ink">{draft?.prompt}</p>
        <div className="flex flex-wrap gap-1.5">{[run.snapshot.nodes.find((node) => node.kind === "model")?.title, draft?.provider, ...Object.entries(draft?.parameters ?? {}).map(([key, value]) => `${generationParameterLabel(key, originalModel)}: ${typeof value === "boolean" ? value ? "On" : "Off" : value}`)].filter(Boolean).map((value, index) => <span className="rounded-chip bg-field px-2 py-1 font-code type-mono-xs text-muted" key={index}>{value}</span>)}</div>
        {!!compatible.length && result && <div className="flex flex-wrap gap-2">{compatible.map((spec) => <button className={STUDIO_BUTTON} type="button" key={spec.id} disabled={props.draft.inputs.filter((input) => input.role === spec.id).length >= spec.maxCount} onClick={() => { props.onReference(spec.id, result); if (props.expanded) props.onExpand(); }}><Copy size={12} />Use as {spec.label.toLocaleLowerCase()}</button>)}</div>}
      </div>
    </div>
  </div>;
}
