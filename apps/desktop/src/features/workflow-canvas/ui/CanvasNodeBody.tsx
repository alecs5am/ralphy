import { ArrowRight, GitMerge, Plus, WandSparkles } from "@/shared/ui/icons";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import type { CanvasNodeData } from "./canvas-node-types";
import { NODE_FIELD } from "./canvas-node-chrome";
import { CanvasModelNode } from "./CanvasModelNode";
import { CanvasMediaNode, CanvasNodeResults } from "./CanvasNodeMedia";

const CONNECTOR_OPERATIONS = [
  { value: "collect", label: "All results", description: "Combine into one collection", output: "Collection", note: "Pass every incoming image, clip or text onward." },
  { value: "join-text", label: "Joined text", description: "Merge into one prompt", output: "Joined text", note: "Join incoming text in connection order." },
  { value: "select-first", label: "First only", description: "Use the first incoming result", output: "First result", note: "Pass only the first incoming result onward." },
  { value: "save-output", label: "Keep outputs", description: "Keep results in run history", output: "Saved outputs", note: "Keep every result available in run history." },
];

export function CanvasNodeBody({ data }: { data: CanvasNodeData }) {
  const { node } = data;
  if (node.kind === "media") return <CanvasMediaNode data={data} />;
  if (node.kind === "model") return <CanvasModelNode data={data} />;
  if (node.kind === "output" || node.kind === "variation") return <CanvasNodeResults data={data} />;
  if (node.kind === "connector") {
    const operation = CONNECTOR_OPERATIONS.find((item) => item.value === node.config?.operation) ?? CONNECTOR_OPERATIONS[0]!;
    return <div className="flex min-w-0 flex-col gap-2">
      <span className="canvas-node-meta">Pass to the next step</span>
      <fieldset className="nodrag nopan m-0 min-w-0 border-0 p-0 disabled:opacity-50" disabled={data.disabled}>
        <SelectMenu ariaLabel={`${node.title} operation`} overlayOwner="canvas.connector" tone="caller" className="h-11 w-full rounded-field bg-field px-3 type-sm text-ink hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" value={operation.value} options={CONNECTOR_OPERATIONS} onValueChange={(value) => data.onPatch(node.id, { config: { ...node.config, operation: value } })} />
      </fieldset>
      <div className="canvas-connector-flow" aria-label="Connector data flow">
        <div className="flex min-w-0 flex-col gap-2"><span className="canvas-node-meta">{data.inputs?.length ?? 0} sources</span><ul>{data.inputs?.length ? data.inputs.map((input, index) => <li key={`${input.port}:${index}`} title={input.source}>{input.source}</li>) : <li>Connect an output</li>}</ul></div>
        <ArrowRight size={14} className="text-muted" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-2"><GitMerge size={16} className="text-canvas-node-accent" aria-hidden="true" /><strong className="type-xs font-medium">{operation.output}</strong>{data.run?.status === "succeeded" && <span className="canvas-node-meta">Last run · {data.results?.length ?? 0} results</span>}</div>
      </div>
      <p className="m-0 px-1 type-xs leading-relaxed text-muted">{operation.note}</p>
    </div>;
  }
  const note = node.kind === "note";
  return <div className="flex flex-col gap-2"><textarea rows={4} className={`${NODE_FIELD} min-h-24 ${note ? "bg-transparent" : ""} resize-y leading-relaxed`} aria-label={`${node.title} ${note ? "note" : "instructions"}`} value={node.value} maxLength={20_000} disabled={data.disabled} placeholder={note ? "A thought, a reference, a reminder…" : node.kind === "prompt" ? "Describe what you want to create. Be specific about subject, style and mood…" : "Describe what this production step should do…"} onChange={(event) => data.onPatch(node.id, { value: event.currentTarget.value })} /><span className="flex items-center gap-1.5 type-xs text-muted">{note ? <Plus size={11} /> : <WandSparkles size={11} />}{note ? "A note for your future self" : node.kind === "prompt" ? "Text source · connect to a prompt input" : "Instructions for your agent"}</span></div>;
}
