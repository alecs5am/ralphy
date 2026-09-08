import { Handle, Position, useConnection, useNodeConnections, useReactFlow } from "@xyflow/react";
import { AudioLines, Film, Image, Layers } from "@/shared/ui/icons";
import { canvasNodePorts, connectionProblem, type CanvasPort } from "../../../../shared/canvas-ports";
import type { CanvasFlowNode } from "./canvas-node-types";

export function SocketGlyph({ type }: { type: CanvasPort["type"] }) {
  if (type === "text") return <span className="canvas-socket-text" aria-hidden="true">T</span>;
  const Icon = type === "image" ? Image : type === "video" ? Film : type === "audio" ? AudioLines : Layers;
  return <Icon size={11} strokeWidth={1.6} aria-hidden="true" />;
}

function Port({ nodeId, port, direction, connectable, title, requirement }: { nodeId: string; port: CanvasPort; direction: "input" | "output"; connectable: boolean; title: string; requirement?: "required" | "optional" }) {
  const type = direction === "input" ? "target" : "source";
  const connections = useNodeConnections({ id: nodeId, handleType: type, handleId: port.id });
  const connection = useConnection<CanvasFlowNode>();
  const flow = useReactFlow<CanvasFlowNode>();
  const checking = connection.inProgress && connection.fromNode.id !== nodeId;
  let compatible = false;
  if (checking && connection.fromHandle.type !== type && connectable) {
    const edge = type === "target" ? { from: connection.fromNode.id, sourcePort: connection.fromHandle.id ?? undefined, to: nodeId, targetPort: port.id }
      : { from: nodeId, sourcePort: port.id, to: connection.fromNode.id, targetPort: connection.fromHandle.id ?? undefined };
    compatible = !connectionProblem({ version: 2, id: "connection", name: "Connection", nodes: flow.getNodes().map((node) => node.data.node), edges: flow.getEdges().map((wire) => ({ from: wire.source, to: wire.target, sourcePort: wire.sourceHandle ?? undefined, targetPort: wire.targetHandle ?? undefined })) }, edge);
  }
  const description = `${port.label} · ${port.type} · ${connections.length} ${connections.length === 1 ? "link" : "links"}${requirement === "required" ? (port.id === "prompt" ? " · Required: enter text or connect a text output" : " · Required: connect a compatible output") : requirement === "optional" ? " · Optional reference" : ""}`;
  return <span className="canvas-port" data-port-type={port.type} data-direction={direction} data-required={requirement === "required"} data-compatible={checking ? compatible : undefined}>
    <Handle type={type} id={port.id} position={type === "target" ? Position.Left : Position.Right} className="canvas-typed-handle" data-port-direction={direction} data-port-type={port.type} data-connected={connections.length > 0} isConnectable={connectable} aria-label={`${title}: ${port.label} ${direction} (${port.type})${requirement === "required" ? " · Required" : ""}`} title={description}><SocketGlyph type={port.type} /></Handle>
    <span className="canvas-port-tooltip" role="tooltip">{description}</span>
  </span>;
}

export function CanvasNodePorts({ node, connectable }: { node: CanvasFlowNode["data"]["node"]; connectable: boolean }) {
  const ports = canvasNodePorts(node);
  if (!ports.inputs.length && !ports.outputs.length) return null;
  return <div className="canvas-node-ports" aria-label={`${node.title} connections`}>
    <div className="canvas-port-column" aria-label="Inputs">{ports.inputs.map((port) => <Port key={port.id} nodeId={node.id} port={port} direction="input" connectable={connectable} title={node.title} requirement={node.kind === "model" && port.id !== "prompt" ? "optional" : "required"} />)}</div>
    <div className="canvas-port-column" aria-label="Outputs">{ports.outputs.map((port) => <Port key={port.id} nodeId={node.id} port={port} direction="output" connectable={connectable} title={node.title} />)}</div>
  </div>;
}
