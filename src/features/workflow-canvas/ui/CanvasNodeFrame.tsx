import { useRef, useState } from "react";
import { ArrowDownToLine, AudioLines, Cable, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, FileText, Pause, Play, RotateCcw, Square, Upload } from "lucide-react";
import type { CanvasRunResult } from "../../../../shared/canvas-runtime";
import type { CanvasNodeData } from "./canvas-node-types";
import { nodeIdentity } from "./canvas-node-chrome";
import { ModelBrand } from "./CanvasModelNode";

export function CanvasFrameMedia({ result }: { result: Pick<CanvasRunResult, "kind" | "previewUrl" | "label" | "text"> }) {
  const [failed, setFailed] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  if (result.kind === "text") return <div className="canvas-frame-text nodrag nopan nowheel">{result.text || result.label}</div>;
  if (!result.previewUrl || failed === result.previewUrl) return <div className="canvas-frame-empty"><FileText size={24} /><span>Preview unavailable</span></div>;
  if (result.kind === "image") return <img className="canvas-frame-image" src={result.previewUrl} alt={result.label} draggable={false} onError={() => setFailed(result.previewUrl)} />;
  if (result.kind === "audio") return <div className="canvas-frame-audio nodrag nopan"><AudioLines size={32} strokeWidth={1} /><audio src={result.previewUrl} controls preload="metadata" aria-label={result.label} onError={() => setFailed(result.previewUrl)} /></div>;
  return <div className="canvas-frame-video nodrag nopan"><video ref={video} src={result.previewUrl} preload="metadata" controls={false} aria-label={result.label} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(result.previewUrl)} /><button className="canvas-frame-play" type="button" aria-label={`${playing ? "Pause" : "Play"} ${result.label}`} onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => setFailed(result.previewUrl)); }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button></div>;
}

export function CanvasNodeFrame({ data, result, state, ready }: { data: CanvasNodeData; result?: CanvasRunResult; state: string; ready: boolean }) {
  const { node } = data;
  const Icon = nodeIdentity(node).icon;
  const model = node.kind === "model";
  const text = node.kind === "prompt" || node.kind === "note" || node.kind === "step";
  const connected = data.inputs?.filter((input) => input.port === "prompt") ?? [];
  const prompt = connected.length ? connected.map((input) => input.preview).filter(Boolean).join("\n\n") : node.value;
  const reference = model ? data.inputs?.find((input) => (input.port === "reference" || input.port === "video") && input.previewUrl && input.kind) : undefined;
  const parameters = node.config?.parameters;
  const badges = [parameters?.resolution, parameters?.aspectRatio, parameters?.duration ? `${parameters.duration}s` : undefined].filter(Boolean);
  const running = state === "running" || state === "pending";
  const problem = data.readiness?.issues.join(" · ") ?? "";
  const estimate = data.run?.estimatedCostUsd;
  return <div className="canvas-node-frame canvas-node-drag" data-has-result={!!result || !!node.config?.asset || !!reference} data-has-composer={model} data-text={text}>
    {running ? <div className="canvas-frame-empty canvas-frame-running" role="status"><span className="canvas-progress-dots" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</span><strong>{state === "pending" ? "Queued" : data.runMode === "preview" ? "Previewing" : "Running"}</strong><span>{state === "pending" ? "Waiting for upstream steps" : "Waiting for provider result"}</span>{estimate != null && <span>${estimate.toFixed(4)} estimated · this step</span>}{data.onStop && <button type="button" className="canvas-frame-quiet nodrag nopan" onClick={data.onStop}><Square size={11} />Stop run</button>}</div>
      : data.run?.error ? <div className="canvas-frame-error" data-cancelled={state === "cancelled"} role={state === "cancelled" ? "status" : "alert"}><span>{state === "cancelled" ? "Run cancelled" : "Step failed"}</span><p>{data.run.error}</p><div>{model && data.onRun && <button className="nodrag nopan" type="button" disabled={data.disabled || !ready} onClick={() => data.onRun?.(node.id)}><RotateCcw size={12} />Retry</button>}{data.onShowLog && <button className="nodrag nopan" type="button" onClick={data.onShowLog}>Log</button>}</div></div>
      : text ? <textarea className="canvas-prompt-content nodrag nopan nowheel" aria-label={`${node.title} ${node.kind === "note" ? "note" : "instructions"}`} value={node.value} maxLength={20_000} disabled={data.disabled} placeholder={node.kind === "note" ? "A thought, a reference, a reminder…" : "Describe your idea…"} onChange={(event) => data.onPatch(node.id, { value: event.currentTarget.value })} />
      : result ? <CanvasFrameMedia key={result.id} result={result} />
      : reference ? <CanvasFrameMedia result={{ kind: reference.kind!, previewUrl: reference.previewUrl, label: reference.source }} />
      : node.config?.asset ? <CanvasFrameMedia result={{ kind: node.config.asset.kind, previewUrl: data.mediaUrl, label: node.config.asset.name }} />
      : <div className="canvas-frame-empty"><span className="canvas-frame-glyph"><Icon size={24} strokeWidth={1.3} /></span><span>{node.kind === "media" ? "Drop a reference · or choose a file" : node.kind === "output" ? "Connect a result" : node.kind === "connector" ? `${data.inputs?.length ?? 0} sources · ${node.config?.operation ?? "collect"}` : node.kind === "variation" ? "Connect results · choose a variation" : "Pull a wire · or describe"}</span>{node.kind === "media" && <button type="button" className="canvas-frame-quiet nodrag nopan" disabled={data.disabled || !data.onChooseAsset} onClick={() => data.onChooseAsset?.(node.id)}><Upload size={12} />Add reference</button>}</div>}
    {(!!badges.length || !!reference && !result) && <div className="canvas-frame-badges">{reference && !result && <span title={reference.source}>Input reference</span>}{badges.map((badge, index) => <span key={index}>{badge}</span>)}</div>}
    {model && <div className="canvas-frame-composer nodrag nopan">
      {connected.length > 0 && <span className="canvas-composer-source" title={connected.map((input) => input.source).join(", ")}><Cable size={10} />From wire · {connected.map((input) => input.source).join(", ")}</span>}
      <input className="canvas-composer-prompt" aria-label={`${node.title} prompt`} title={connected.length ? "Using the connected prompt. Disconnect to edit your saved prompt." : node.value || "Required · enter a prompt or connect a text output"} aria-required={!connected.length} aria-invalid={!connected.length && !node.value.trim()} placeholder={connected.length ? "Waiting for connected text…" : "Describe…"} value={prompt} maxLength={20_000} disabled={data.disabled || !!connected.length} onChange={(event) => data.onPatch(node.id, { value: event.currentTarget.value })} />
      <div className="canvas-composer-controls"><button className="canvas-composer-model" type="button" disabled={data.disabled || !data.onChooseModel} aria-label={`Choose model for ${node.title}`} title={data.model?.name ?? node.config?.modelId ?? "Choose a model"} onClick={() => data.onChooseModel?.(node.id)}><span><ModelBrand modelId={node.config?.modelId} /></span><strong>{data.model?.name ?? node.config?.modelId ?? "Choose a model"}</strong><ChevronDown size={11} /></button>
        <button className="canvas-composer-run" type="button" aria-label={`Run ${node.title}`} title={problem || (estimate != null ? `$${estimate.toFixed(4)} · last estimate for this step` : "Run this step and its required inputs")} disabled={data.disabled || !ready || !data.onRun} onClick={() => data.onRun?.(node.id)}>{result ? <RotateCcw size={12} /> : <Play size={12} />}{estimate != null ? <span className="font-display">${estimate.toFixed(2)}</span> : <span>Run</span>}</button>
      </div>
    </div>}
    {data.readiness && !data.readiness.ready && !running && !data.run?.error && <span className="canvas-frame-readiness" title={problem} role="status" aria-label={`${node.title} readiness`}><CircleAlert size={12} /><span>{problem}</span></span>}
    {node.kind === "media" && node.config?.asset && <span className="canvas-frame-asset-label" title={node.config.asset.name}>{node.config.asset.name}</span>}
  </div>;
}

export function CanvasVariations({ data, result, onSelect }: { data: CanvasNodeData; result?: CanvasRunResult; onSelect(id: string): void }) {
  const results = data.results ?? data.run?.results ?? [];
  if (!results.length) return null;
  const index = Math.max(0, results.findIndex((item) => item.id === result?.id));
  return <div className="canvas-variation-strip nodrag nopan nowheel" aria-label={`${data.node.title} variations`}><div><button type="button" aria-label="Previous variation" disabled={index === 0 || data.disabled} onClick={() => onSelect(results[index - 1]!.id)}><ChevronLeft size={13} /></button>{results.map((item, i) => <button className="canvas-variation-thumb" type="button" key={item.id} aria-label={`Select variation ${i + 1}: ${item.label}`} aria-pressed={item.id === result?.id} disabled={data.disabled} onClick={() => onSelect(item.id)}>{item.kind === "image" && item.previewUrl ? <img src={item.previewUrl} alt="" draggable={false} /> : item.kind === "video" && item.previewUrl ? <video src={item.previewUrl} preload="metadata" muted /> : item.kind === "audio" ? <AudioLines size={18} /> : <FileText size={18} />}</button>)}<button type="button" aria-label="Next variation" disabled={index >= results.length - 1 || data.disabled} onClick={() => onSelect(results[index + 1]!.id)}><ChevronRight size={13} /></button></div><span>V{index + 1} of {results.length} · Current</span>{data.node.kind !== "variation" && data.onSelectResult && <button className="canvas-variation-use" type="button" disabled={data.disabled} onClick={() => result && data.onSelectResult?.(data.node.id, result.id)}><ArrowDownToLine size={11} />Use V{index + 1}</button>}</div>;
}
