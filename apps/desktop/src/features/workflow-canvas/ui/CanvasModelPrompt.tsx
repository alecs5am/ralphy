import { Check, Cable } from "@/shared/ui/icons";
import type { CanvasNodeData } from "./canvas-node-types";
import { STUDIO_FIELD, STUDIO_LABEL } from "@/entities/generation";

export function CanvasModelPrompt({ data }: { data: CanvasNodeData }) {
  const { node } = data;
  const entered = !!node.value.trim();
  const promptSources = data.inputs?.filter((input) => input.port === "prompt") ?? [];
  const connected = promptSources.length > 0;
  return <div className="canvas-model-prompt generation-parameter">
    <label htmlFor={`canvas-prompt-${node.id}`} className={STUDIO_LABEL}><span>Prompt</span><span className="flex items-center gap-1 text-muted">{connected ? <Cable size={11} /> : entered ? <Check size={11} /> : null}{connected ? "Connected" : entered ? "Entered" : "Required"}</span></label>
    {promptSources.map((input, index) => <div className="canvas-wire-input" key={`${input.source}:${index}`}><span className="canvas-wire-source"><Cable size={11} /><span className="truncate">{input.source}</span></span></div>)}
    <textarea id={`canvas-prompt-${node.id}`} rows={3} className={`${STUDIO_FIELD} generation-prompt min-h-20 resize-y disabled:opacity-50 disabled:cursor-not-allowed`} aria-label={`${node.title} prompt`} aria-describedby={`canvas-prompt-help-${node.id}`} aria-required={!connected} aria-invalid={!entered && !connected} value={connected ? promptSources.map((input) => input.preview).filter(Boolean).join("\n\n") : node.value} maxLength={20_000} placeholder={connected ? "Using the connected prompt" : "Write a prompt, or connect a text output…"} disabled={data.disabled || connected} onChange={(event) => data.onPatch(node.id, { value: event.currentTarget.value })} />
    <span id={`canvas-prompt-help-${node.id}`} className="type-xs text-muted">{connected ? "Using connected text. Disconnect to restore your manual prompt." : entered ? "Using your prompt" : "Required · enter text or connect a text output"}</span>
  </div>;
}
