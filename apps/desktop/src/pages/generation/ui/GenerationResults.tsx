import { useEffect, useRef, useState } from "react";
import { Film, Image, LoaderCircle, Music2, RotateCcw, Scan, Square } from "@/shared/ui/icons";
import type { CanvasRunResult } from "../../../../shared/canvas-runtime";
import { generationDraftFromRun, generationOutputs, type GenerationDraft, type GenerationKind } from "../../../../shared/generation-studio";
import { STUDIO_BUTTON } from "@/entities/generation";
import { estimateLabel, generationTab, running } from "../lib/generation-presentation";
import { GenerationEmpty } from "./GenerationEmpty";
import { GenerationPreview, generationRunStatus, type GenerationPreviewProps } from "./GenerationPreview";

interface ResultsProps extends Omit<GenerationPreviewProps, "run" | "resultId" | "onClose"> {
  runs: GenerationPreviewProps["run"][]; kind: GenerationKind;
  launch?: { draft: GenerationDraft; mode: "preview" | "execute" } | null;
  hasOlder?: boolean; loadingOlder?: boolean; onLoadOlder?(): void;
}

/** Thumbnails have one click target; video transport belongs to the full preview. */
function Thumbnail({ result, previewOpen }: { result: CanvasRunResult; previewOpen: boolean }) {
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = video.current;
    if (previewOpen) media?.pause();
    return () => media?.pause();
  }, [previewOpen, result.previewUrl]);
  useEffect(() => setFailed(false), [result.previewUrl]);
  const Icon = result.kind === "video" ? Film : result.kind === "audio" ? Music2 : Image;
  const play = () => {
    if (!previewOpen && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) void video.current?.play().catch(() => {});
  };
  const pause = () => { if (video.current) { video.current.pause(); video.current.currentTime = 0; } };
  return <span className="generation-tile-media" onMouseEnter={play} onMouseLeave={pause}>
    {!failed && result.previewUrl && !result.unavailableReason && result.kind === "image" ? <img src={result.previewUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      : !failed && result.previewUrl && !result.unavailableReason && result.kind === "video" ? <video ref={video} src={result.previewUrl} muted loop playsInline preload="metadata" onError={() => setFailed(true)} />
        : <span className="generation-tile-placeholder"><Icon size={28} strokeWidth={1.4} /><span>{result.unavailableReason || (failed ? "Preview unavailable" : result.kind === "audio" ? result.label : "No preview yet")}</span></span>}
    {result.kind === "video" && <Film className="generation-tile-kind" size={14} />}
  </span>;
}

export function GenerationResults(props: ResultsProps) {
  const [selection, setSelection] = useState<{ runId: string; resultId?: string } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const gallery = useRef<HTMLElement | null>(null);
  useEffect(() => setSelection(null), [props.kind]);
  const visibleRuns = props.runs.filter((run) => run.mode === "execute" && generationTab(generationDraftFromRun(run)?.kind ?? "image") === generationTab(props.kind));
  const selected = visibleRuns.find((run) => run.id === selection?.runId);
  const launch = props.launch?.mode === "execute" && generationTab(props.launch.draft.kind) === generationTab(props.kind) ? props.launch : null;
  const open = (runId: string, resultId: string | undefined, element: HTMLElement) => { trigger.current = element; setSelection({ runId, resultId }); };
  const close = () => { setSelection(null); window.requestAnimationFrame(() => { const target = trigger.current?.isConnected ? trigger.current : gallery.current; if (target?.isConnected) target.focus(); }); };
  const restore = (run: GenerationPreviewProps["run"]) => { props.onRestore(run); document.getElementById("generation-prompt")?.focus(); };
  return <section ref={gallery} tabIndex={-1} className="generation-results min-w-0" aria-label="Generation results">
    <div className="generation-gallery"><div className="generation-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      {visibleRuns.length || launch ? <div className="generation-output-grid">
        {launch && <div className="generation-run-tile" data-status="pending" role="status" aria-label="Starting generation"><LoaderCircle size={22} className="animate-spin motion-reduce:animate-none" /><strong>{launch.mode === "preview" ? "Starting estimate…" : "Starting generation…"}</strong><p>{launch.draft.prompt}</p></div>}
        {visibleRuns.flatMap((run) => {
          const outputs = generationOutputs(run), active = running(run), draft = generationDraftFromRun(run);
          const error = run.error ?? run.nodes.find((node) => node.error)?.error;
          return [
            ...(active || !outputs.length ? [<div className="generation-run-tile" data-status={run.status} key={`${run.id}:status`}>
              <span className="generation-run-state" role="status">{active ? <LoaderCircle size={22} className="animate-spin motion-reduce:animate-none" /> : <Scan size={22} strokeWidth={1.4} />}<strong>{run.mode === "preview" && run.status === "succeeded" ? estimateLabel(run) : generationRunStatus(run)}</strong></span>
              <p>{draft?.prompt || "Generation"}</p>
              {error && <p className="generation-run-error">{error}</p>}
              <span className="flex flex-wrap justify-center gap-2">{active ? <button className={STUDIO_BUTTON} type="button" onClick={() => props.onCancel(run.id)}><Square size={10} />Stop</button> : <button className={STUDIO_BUTTON} type="button" onClick={() => restore(run)}><RotateCcw size={12} />Use settings</button>}<button className={STUDIO_BUTTON} type="button" aria-label={`Open ${draft?.prompt || "generation"}`} onClick={(event) => open(run.id, undefined, event.currentTarget)}>Details</button></span>
            </div>] : []),
            ...outputs.map((result) => <button className="generation-output-card" type="button" data-kind={result.kind} key={`${run.id}:${result.id}`} aria-label={`Open ${result.label}`} onClick={(event) => open(run.id, result.id, event.currentTarget)}>
              <Thumbnail result={result} previewOpen={!!selected} />
              <span className="generation-output-caption"><strong>{draft?.prompt || result.label}</strong><small>{run.snapshot.nodes.find((node) => node.kind === "model")?.title} · {new Date(run.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span>
              {run.status === "failed" && <span className="generation-tile-notice">Partial output</span>}
            </button>),
          ];
        })}
      </div> : <GenerationEmpty kind={props.kind} />}
      {props.hasOlder && <div className="flex items-center justify-center p-4"><button className={STUDIO_BUTTON} type="button" disabled={props.loadingOlder} onClick={props.onLoadOlder}>{props.loadingOlder ? "Loading older runs…" : "Load older runs"}</button></div>}
    </div></div>
    {selected && <GenerationPreview key={`${selected.id}:${selection?.resultId ?? ""}`} {...props} run={selected} resultId={selection?.resultId} onClose={close} />}
  </section>;
}
