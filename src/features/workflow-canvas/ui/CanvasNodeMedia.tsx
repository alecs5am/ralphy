import { useState } from "react";
import { ArrowDownToLine, Check, Copy, FileText, Images, Upload } from "@/shared/ui/icons";
import { MediaPreview as CanvasMediaPreview } from "@/shared/ui/MediaPreview";
import type { CanvasNodeData } from "./canvas-node-types";
import { NODE_ACTION } from "./canvas-node-chrome";

export function CanvasMediaNode({ data }: { data: CanvasNodeData }) {
  const asset = data.node.config?.asset;
  return <div className="flex min-w-0 flex-col gap-3">
    {asset ? <><div className="overflow-hidden rounded-field bg-frame text-on-instrument"><CanvasMediaPreview url={data.mediaUrl} posterUrl={data.posterUrl} kind={asset.kind} label={asset.name} /></div><span className="flex min-w-0 items-center gap-2 type-xs text-muted"><FileText size={12} className="shrink-0" /><span className="truncate" title={asset.name}>{asset.name}</span></span></>
      : <button className="nodrag nopan flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-field bg-field p-4 text-center text-muted hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" disabled={!data.onChooseAsset || data.disabled} type="button" onClick={() => data.onChooseAsset?.(data.node.id)}><Upload size={24} strokeWidth={1.3} /><strong className="type-sm font-normal text-ink">Add a reference</strong><span className="type-xs">Choose an image, video, audio or text file</span></button>}
    {asset && <span className="type-xs leading-relaxed text-muted">Static reference · connect to one or more inputs</span>}
    {asset && <button className={NODE_ACTION} type="button" disabled={!data.onChooseAsset || data.disabled} onClick={() => data.onChooseAsset?.(data.node.id)}><Upload size={12} />Replace media</button>}
  </div>;
}

export function CanvasNodeResults({ data }: { data: CanvasNodeData }) {
  const results = data.results ?? data.run?.results ?? [];
  const [localSelection, setLocalSelection] = useState<string>();
  const [copyState, setCopyState] = useState("");
  const choose = (id: string) => data.onSelectResult ? data.onSelectResult(data.node.id, id) : data.onPatch(data.node.id, { config: { ...data.node.config, selectedResultId: id } });
  if (!results.length) return <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-field bg-field p-3 text-center">{data.node.kind === "variation" ? <Images size={20} strokeWidth={1.3} /> : <ArrowDownToLine size={20} strokeWidth={1.3} />}<strong className="type-xs font-medium">{data.node.kind === "variation" ? "Review & choose" : "Final destination"}</strong><p className="m-0 type-xs leading-relaxed text-muted">{data.node.kind === "variation" ? "Receive variations. Choose one to pass onward." : "Connect a result. Real outputs appear here after a run."}</p></div>;
  const selectedId = data.node.kind === "variation" ? data.node.config?.selectedResultId : localSelection;
  const selected = results.find((result) => result.id === selectedId) ?? results[0]!;
  const selectedIndex = results.indexOf(selected) + 1;
  return <div className="flex min-w-0 flex-col gap-2">
    <div className={`canvas-node-results grid min-w-0 gap-1.5 ${results.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{results.map((result, index) => <div className="canvas-node-result min-w-0" data-selected={selected.id === result.id} data-kind={result.kind} key={result.id}>
      <div className="canvas-node-result-frame overflow-hidden rounded-field bg-frame text-on-instrument"><CanvasMediaPreview url={result.previewUrl} kind={result.kind} label={result.label} text={result.text} /></div>
      <button className="nodrag nopan canvas-result-choice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" type="button" aria-label={`Select variation ${index + 1}: ${result.label}`} aria-pressed={selected.id === result.id} disabled={data.disabled} onClick={() => { setLocalSelection(result.id); if (data.node.kind === "variation") choose(result.id); }}><span>V{index + 1}</span><span className="canvas-result-check">{selected.id === result.id ? <Check size={11} /> : index + 1}</span></button>
    </div>)}</div>
    <div className="flex items-center justify-between gap-2"><span className="canvas-node-meta">{results.length} {results.length === 1 ? "result" : "variations"} · V{selectedIndex} selected</span>{data.node.kind !== "variation" && <button className={NODE_ACTION} type="button" disabled={data.disabled} onClick={() => choose(selected.id)}>Use V{selectedIndex}</button>}</div>
    {selected.kind === "text" && <div className="flex items-center justify-between gap-2"><span className="canvas-node-meta">{selected.text?.length.toLocaleString() ?? 0} characters</span><button className={NODE_ACTION} type="button" onClick={() => { void navigator.clipboard.writeText(selected.text ?? "").then(() => setCopyState("Copied"), () => setCopyState("Could not copy text")); }} aria-label="Copy result text"><Copy size={12} />Copy</button></div>}
    {copyState && <span className="type-xs text-muted" role="status">{copyState}</span>}
  </div>;
}
