import { Cable, CircleAlert, Unplug } from "lucide-react";
import { Window, WindowBody, WindowClose, WindowTitlebar } from "@/shared/ui/Window";
import { canvasNodePorts } from "../../../../shared/canvas-ports";
import { CanvasNodeBody } from "./CanvasNodeBody";
import { SocketGlyph } from "./CanvasNodePorts";
import { nodeIdentity } from "./canvas-node-chrome";
import type { CanvasNodeData } from "./canvas-node-types";

export function CanvasNodeInspector({ data, onClose, onDisconnect }: { data: CanvasNodeData; onClose(): void; onDisconnect(port: string): void }) {
  const { node } = data, identity = nodeIdentity(node), Icon = identity.icon;
  const ports = canvasNodePorts(node);
  const outputState = node.kind === "prompt" ? node.value.trim() ? "Available" : "Enter text" : node.kind === "media" ? node.config?.asset ? "Available" : "Add a reference" : data.run?.status === "succeeded" ? "Available" : "Available after this step runs";
  return <Window className="canvas-node-inspector nodrag nopan nowheel" data-node-kind={node.kind} data-modality={node.config?.asset?.kind ?? node.config?.modality} role="complementary" aria-label={`${node.title} inspector`}>
    <WindowTitlebar className="canvas-inspector-titlebar"><span className="canvas-inspector-type-icon"><Icon size={16} /></span><span className="flex min-w-0 flex-1 flex-col"><small className="canvas-node-type">{identity.label}</small><strong className="truncate type-sm font-medium" title={node.title}>{node.title}</strong></span><WindowClose label="Close node inspector" onClick={onClose} /></WindowTitlebar>
    <WindowBody className="overflow-y-auto p-3 gap-4">
      <CanvasNodeBody data={data} />
      {data.run?.error && <p className="m-0 rounded-field bg-field p-3 type-xs text-muted">{data.run.error}</p>}
      {data.execution && data.execution !== "included" && node.kind !== "note" && <p className="m-0 flex items-start gap-2 type-xs text-muted"><Unplug size={13} className="shrink-0" />{data.execution === "outside" ? "Outside Run. Connect this branch to an Output, or run this step individually." : "This step is skipped because a saved variation supplies its result."}</p>}
      {!!ports.inputs.length && <section className="canvas-inspector-ports" aria-label="Node inputs"><h3>Inputs</h3>{ports.inputs.map((port) => {
        const sources = data.inputs?.filter((input) => input.port === port.id) ?? [];
        const required = node.kind === "model" && port.id === "prompt" || port.id === "input";
        const entered = port.id === "prompt" && !!node.value.trim();
        return <div key={port.id}><span className="canvas-inspector-socket" data-port-type={port.type}><SocketGlyph type={port.type} /></span><span><strong>{port.label}<small>{required ? "Required" : "Optional"}</small></strong><small>{sources.length ? sources.map((input) => input.source).join(", ") : entered ? "Manual prompt" : "Not connected"}</small></span>{sources.length ? <button type="button" aria-label={`Disconnect ${port.label} from ${node.title}`} title="Disconnect input · restore manual value" disabled={data.disabled} onClick={() => onDisconnect(port.id)}><Cable size={13} /></button> : required && !entered ? <CircleAlert size={13} aria-label="Needs input" /> : null}</div>;
      })}</section>}
      {!!ports.outputs.length && <section className="canvas-inspector-ports" aria-label="Node outputs"><h3>Outputs</h3>{ports.outputs.map((port) => <div key={port.id}><span className="canvas-inspector-socket" data-port-type={port.type}><SocketGlyph type={port.type} /></span><span><strong>{port.label}</strong><small>{port.type} · {outputState}</small></span></div>)}</section>}
    </WindowBody>
  </Window>;
}
