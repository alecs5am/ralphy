import { BaseEdge, Position, type ConnectionLineComponentProps, type Edge, type EdgeProps } from "@xyflow/react";
import { canvasNodePorts, type CanvasPortType } from "../../../../shared/canvas-ports";
import { SocketGlyph } from "./CanvasNodePorts";
import type { CanvasFlowNode } from "./canvas-node-types";

export function canvasWirePath(x1: number, y1: number, x2: number, y2: number, from = Position.Right, to = Position.Left) {
  const bend = Math.max(46, Math.abs(x2 - x1) * .45);
  return `M ${x1},${y1} C ${x1 + (from === Position.Left ? -bend : bend)},${y1} ${x2 + (to === Position.Right ? bend : -bend)},${y2} ${x2},${y2}`;
}

export function canvasWireType(source: CanvasPortType = "any", target: CanvasPortType = "any"): CanvasPortType {
  return source === "any" ? target : source;
}

export function CanvasWire({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, selected, data }: EdgeProps<Edge<{ portType: CanvasPortType }>>) {
  return <BaseEdge id={id} path={canvasWirePath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition)} style={style} data-port-type={data?.portType ?? "any"} className={selected ? "canvas-wire-selected" : undefined} interactionWidth={20} />;
}

export function CanvasConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition, fromNode, toNode, fromHandle, toHandle, connectionStatus }: ConnectionLineComponentProps<CanvasFlowNode>) {
  const sourcePorts = canvasNodePorts(fromNode.data.node);
  const targetPorts = toNode ? canvasNodePorts(toNode.data.node) : null;
  const source = (fromHandle.type === "source" ? sourcePorts.outputs : sourcePorts.inputs).find((port) => port.id === fromHandle.id);
  const target = (toHandle?.type === "target" ? targetPorts?.inputs : targetPorts?.outputs)?.find((port) => port.id === toHandle?.id);
  const mismatch = connectionStatus === "invalid" && source && target;
  return <g data-port-type={canvasWireType(source?.type, target?.type)}><path className="canvas-connection-line" fill="none" d={canvasWirePath(fromX, fromY, toX, toY, fromPosition, toPosition)} />{!toHandle && <foreignObject x={toX - 10} y={toY - 10} width={20} height={20}><span className="canvas-wire-end"><SocketGlyph type={source?.type ?? "any"} /></span></foreignObject>}{mismatch && <foreignObject x={toX + 18} y={toY - 38} width={250} height={36}><div className="canvas-connection-hint" role="status">{source.type !== target.type ? `${source.type} ≠ ${target.type}` : "Unavailable input"} · won't connect</div></foreignObject>}</g>;
}
