import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, X } from "@/shared/ui/icons";
import { CANVAS_LIMIT, type CanvasNode, type WorkflowCanvas } from "../../../../shared/workflow-canvas";
import { canvasNodePorts } from "../../../../shared/canvas-ports";
import { CANVAS_CREATION_CHOICES, connectionToNewNode, createNodeFromChoice, type CanvasWireOrigin } from "../model/node-creation";
import { nodeIdentity } from "./canvas-node-chrome";

export interface CanvasCreateAt { x: number; y: number; point: { x: number; y: number }; origin?: CanvasWireOrigin; from?: { x: number; y: number } }

export function CanvasCreateMenu({ canvas, at, onCreate, onClose, actions }: { canvas: WorkflowCanvas; at: CanvasCreateAt; onCreate(node: CanvasNode): void; onClose(): void; actions?: { label: string; shortcut?: string; icon: ReactNode; disabled?: boolean; run(): void }[] }) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => CANVAS_CREATION_CHOICES.map((choice) => ({ choice, node: createNodeFromChoice(choice, at.point, at.origin?.direction) })), [at]);
  const source = canvas.nodes.find((node) => node.id === at.origin?.nodeId);
  const sourcePort = source && (at.origin?.direction === "output" ? canvasNodePorts(source).outputs : canvasNodePorts(source).inputs).find((port) => port.id === at.origin?.portId);
  const options = candidates.map((item) => {
    const edge = at.origin ? connectionToNewNode(canvas, item.node, at.origin) : null;
    const port = edge && (at.origin?.direction === "output" ? canvasNodePorts(item.node).inputs.find((port) => port.id === edge.targetPort) : canvasNodePorts(item.node).outputs.find((port) => port.id === edge.sourcePort));
    return { ...item, compatible: !at.origin || !!edge, hint: port?.label ?? (at.origin ? `No ${sourcePort?.type ?? "matching"} ${at.origin.direction === "output" ? "in" : "out"}` : nodeIdentity(item.node).label) };
  }).filter(({ choice }) => choice.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onClose]);
  return <div ref={root} className="canvas-create-menu nodrag nopan nowheel" style={{ left: at.x, top: at.y, maxHeight: `calc(100% - ${at.y + 8}px)` }} role="dialog" aria-label={actions ? "Canvas context menu" : "Create connected node"} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onClose(); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const choices = [...(root.current?.querySelectorAll<HTMLButtonElement>(".canvas-create-option:not(:disabled)") ?? [])]; const index = choices.indexOf(document.activeElement as HTMLButtonElement); choices[(index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length]?.focus(); } }}>
    <div className="canvas-create-search"><Search size={13} /><input autoFocus aria-label="Search nodes" placeholder="Search nodes…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Close node menu" onClick={onClose}><X size={13} /></button></div>
    <div className="canvas-create-options">{actions && !query && <div className="canvas-create-actions">{actions.map((action) => <button className="canvas-create-option" key={action.label} type="button" disabled={action.disabled} onClick={() => { action.run(); onClose(); }}>{action.icon}<span>{action.label}</span><small>{action.shortcut}</small></button>)}</div>}{[true, false].map((compatible) => {
      const rows = options.filter((item) => item.compatible === compatible);
      return rows.length ? <section key={String(compatible)}><h3>{compatible ? at.origin ? `${at.origin.direction === "output" ? "Takes" : "Outputs"} ${sourcePort?.type ?? "any"}` : "Add node" : "Other"}</h3>{rows.map(({ choice, node, hint }) => { const Icon = nodeIdentity(node).icon; return <button className="canvas-create-option" key={choice.id} type="button" disabled={!compatible || canvas.nodes.length >= CANVAS_LIMIT} title={!compatible ? hint : `Add ${choice.label}`} onClick={() => onCreate(node)}><Icon size={14} /><span>{choice.label}</span><small>{hint}</small></button>; })}</section> : null;
    })}{!options.length && <p>No matching nodes</p>}</div>
  </div>;
}
