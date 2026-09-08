import { NodeResizeControl, NodeResizer, NodeToolbar, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { ArrowDownToLine, Copy, Lock, Maximize2, MoveDiagonal2, Pencil, SlidersHorizontal, Trash2, Unlock, Unplug } from "lucide-react";
import { CANVAS_NODE_MIN_WIDTH, CANVAS_NODE_MAX_WIDTH } from "../../../../shared/workflow-canvas";
import { canvasNodePorts } from "../../../../shared/canvas-ports";
import { canvasModelIssues } from "../../../../shared/canvas-readiness";
import { canvasNodeAspect } from "../model/node-layout";
import { nodeIdentity } from "./canvas-node-chrome";
import { CanvasNodeFrame, CanvasVariations } from "./CanvasNodeFrame";
import { CanvasNodePorts } from "./CanvasNodePorts";
import type { CanvasFlowNode } from "./canvas-node-types";
export type { CanvasFlowNode, CanvasNodeData } from "./canvas-node-types";

export function CanvasNodeCard({ id, data, selected, isConnectable }: NodeProps<CanvasFlowNode>) {
  const { node, run } = data;
  const [rename, setRename] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string>();
  const results = data.results ?? run?.results ?? [];
  const result = results.find((item) => item.id === (node.kind === "variation" ? node.config?.selectedResultId : resultId)) ?? results[0];
  const finishRename = () => {
    if (rename?.trim() && rename.trim() !== node.title && !data.disabled) data.onPatch(id, { title: rename.trim() });
    setRename(null);
  };
  const identity = nodeIdentity(node), Icon = identity.icon;
  const updateInternals = useUpdateNodeInternals();
  const portKey = JSON.stringify(canvasNodePorts(node));
  useEffect(() => { updateInternals(id); }, [id, portKey, node.width, updateInternals]);
  const issues = data.readiness?.issues ?? (node.kind === "model" ? canvasModelIssues(node, !!data.inputs?.some((input) => input.port === "prompt" && input.preview.trim()), data.model) : []);
  const configured = data.readiness?.ready ?? !issues.length;
  const state = run?.status && run.status !== "succeeded" ? run.status : !configured ? "empty" : run?.status ?? "ready";
  const stateLabel = state === "running" ? data.runMode === "preview" ? "Previewing" : "Running" : state === "succeeded" ? data.runMode === "preview" ? "Preview ready" : "Completed" : state === "failed" ? "Failed" : state === "cancelled" ? "Cancelled" : state === "pending" ? "Queued" : state === "ready" ? "Ready" : "Needs input";
  const aspect = canvasNodeAspect(node);
  const resize = { minWidth: CANVAS_NODE_MIN_WIDTH, maxWidth: CANVAS_NODE_MAX_WIDTH, minHeight: CANVAS_NODE_MIN_WIDTH / aspect, maxHeight: CANVAS_NODE_MAX_WIDTH / aspect, keepAspectRatio: true, autoScale: false, onResizeEnd: (_event: unknown, size: { width: number; x: number; y: number }) => data.onPatch(id, { width: Math.round(size.width), x: Math.round(size.x), y: Math.round(size.y) }) };
  return <article className="canvas-rich-node" data-node-kind={node.kind} data-modality={node.config?.asset?.kind ?? node.config?.modality} data-selected={selected} data-state={state} data-execution={data.execution} data-locked={!!node.locked} aria-label={`${identity.label}: ${node.title}`}>
    <NodeResizer {...resize} isVisible={!!selected && !node.locked && !data.disabled} handleClassName="canvas-resize-handle" lineClassName="canvas-resize-line" />
    {!node.locked && !data.disabled && node.kind === "model" && <NodeResizeControl {...resize} position="bottom-right" className="canvas-frame-resize" ><MoveDiagonal2 size={12} aria-label="Resize frame" /></NodeResizeControl>}
    <NodeToolbar position={Position.Top} offset={40} className="canvas-node-toolbar nodrag nopan" aria-label={`${node.title} actions`}>
      <button type="button" title="Edit settings" aria-label={`Inspect ${node.title}`} onClick={() => data.onInspect?.(id)}><SlidersHorizontal size={14} /></button>
      <button type="button" title="Open preview" aria-label={`Open ${node.title} preview`} disabled={!result && !node.config?.asset && !node.value} onClick={() => data.onPreview?.(id, result)}><Maximize2 size={14} /></button>
      {result && data.onSelectResult && node.kind !== "variation" && <button type="button" title="Use result as a reference" aria-label={`Use ${node.title} result as reference`} disabled={data.disabled} onClick={() => data.onSelectResult?.(id, result.id)}><ArrowDownToLine size={14} /></button>}
      <i />
      <button type="button" title="Duplicate" aria-label={`Duplicate ${node.title}`} disabled={data.disabled} onClick={() => data.onDuplicate?.(id)}><Copy size={14} /></button>
      <button type="button" title={node.locked ? "Unlock position" : "Lock position"} aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.title}`} disabled={data.disabled} onClick={() => data.onPatch(id, { locked: !node.locked })}>{node.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
      <i />
      <button className="canvas-node-delete" type="button" title="Delete" aria-label={`Delete ${node.title}`} disabled={data.disabled} onClick={() => data.onDelete?.(id)}><Trash2 size={14} /></button>
    </NodeToolbar>
    <header className="canvas-node-header canvas-node-drag"><Icon size={12} strokeWidth={1.8} aria-hidden="true" /><span className="canvas-node-type">{identity.label}</span>{rename === null ? <span className="canvas-node-title" title={node.title}>{node.title}</span> : <input autoFocus className="nodrag nopan" aria-label={`${node.title} title`} maxLength={160} value={rename} disabled={data.disabled} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setRename(event.currentTarget.value)} onBlur={finishRename} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); finishRename(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRename(null); } }} />}{rename === null && <button className="canvas-node-rename nodrag nopan" type="button" aria-label={`Rename ${node.title}`} title="Rename node" disabled={data.disabled} onClick={() => setRename(node.title)}><Pencil size={10} /></button>}{node.locked && <Lock size={10} aria-label="Position locked" />}{data.execution && data.execution !== "included" && node.kind !== "note" && <Unplug size={11} aria-label={data.execution === "outside" ? "Outside run · no path to Output" : "Skipped · saved result reused"} />}<span className="canvas-node-status" data-state={state} title={issues.join(" · ") || stateLabel} aria-label={stateLabel}><span /></span></header>
    <CanvasNodeFrame data={data} result={result} state={state} ready={configured} />
    <CanvasNodePorts node={node} connectable={isConnectable && !data.disabled} />
    {selected && <CanvasVariations data={data} result={result} onSelect={(value) => { setResultId(value); if (node.kind === "variation") data.onSelectResult?.(id, value); }} />}
  </article>;
}
