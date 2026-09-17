import { CheckCircle2, ChevronDown, CircleAlert, Cpu, GitBranch, Scan, Sparkles, Square } from "@/shared/ui/icons";
import { GenerationParameter, GenerationStepper, GenerationVoicePicker, STUDIO_LABEL, STUDIO_BUTTON, STUDIO_PRIMARY } from "@/entities/generation";
import { AiBrandIcon } from "@/shared/ui/AiBrandIcon";
import type { CanvasNodeConfig } from "../../../../shared/workflow-canvas";
import { canvasModelIssues } from "../../../../shared/canvas-readiness";
import { canvasModelFields } from "../model/model-fields";
import type { CanvasNodeData } from "./canvas-node-types";
import { CanvasModelPrompt } from "./CanvasModelPrompt";
import { NODE_FIELD } from "./canvas-node-chrome";

export function CanvasModelNode({ data }: { data: CanvasNodeData }) {
  const { node, model } = data;
  const settings = node.config ?? {};
  const patch = (config: Partial<CanvasNodeConfig>) => data.onPatch(node.id, { config: { ...settings, ...config } });
  const parameter = (key: string, value: string | number | boolean | undefined) => {
    const parameters = { ...settings.parameters };
    if (value === undefined || value === "" || value === "auto") delete parameters[key];
    else parameters[key] = key === "duration" ? Number(value) : value;
    patch({ parameters });
  };
  const count = settings.variants ?? 1;
  const running = data.run?.status === "running" || data.run?.status === "pending";
  const connected = data.readiness ? data.readiness.prompt === "connected" : data.inputs?.some((input) => input.port === "prompt" && !!input.preview.trim()) ?? false;
  const issues = data.readiness?.issues ?? canvasModelIssues(node, connected, model);
  const ready = !issues.length;
  const StatusIcon = !ready ? CircleAlert : data.readiness?.runsUpstream ? GitBranch : CheckCircle2;
  return <div className="canvas-generation-controls">
    <fieldset className="generation-form-fields nodrag nopan" disabled={data.disabled}>
      <button className="generation-model-row" type="button" data-connected={model?.available} data-state={data.choosingModel ? "open" : "closed"} aria-label={`Choose generation model for ${node.title}`} disabled={!data.onChooseModel} onClick={(event) => data.onChooseModel?.(node.id, event.currentTarget)}>
        <span className="generation-model-tile"><ModelBrand modelId={settings.modelId} /></span><span className="generation-row-copy"><strong>{model?.name || settings.modelId || "Choose a model"}</strong><small>{model ? `${model.provider} · ${model.available ? "Key present" : "Connection needed"} · ${model.modality}` : "Browse your creative engines"}</small></span><ChevronDown size={12} />
      </button>
      <CanvasModelPrompt data={data} />
      {!!data.inputs?.some((input) => input.port !== "prompt") && <div className="canvas-wire-inputs">{data.inputs.filter((input) => input.port !== "prompt").map((input, index) => <div className="canvas-wire-input" key={`${input.source}-${index}`}><span className="canvas-wire-source"><i aria-hidden="true" /><span className="truncate">{input.source}</span><small>From wire · {input.port}</small></span>{input.previewUrl && input.kind === "image" && <img className="canvas-inspector-reference" src={input.previewUrl} alt={input.source} />}<p className="m-0 line-clamp-2 type-xs leading-relaxed text-muted">{input.preview || "Available after upstream run"}</p></div>)}</div>}
      {settings.modality === "audio" && (!settings.operation || settings.operation === "voiceover") && <div className="generation-parameter"><label className={STUDIO_LABEL}>Voice<small>Required</small></label>{data.workspaceId ? <GenerationVoicePicker workspaceId={data.workspaceId} connected={!!model?.available} value={String(settings.parameters?.voice ?? "")} onChange={(voice) => parameter("voice", voice)} /> : <input className={NODE_FIELD} aria-label={`${node.title} voice ID`} aria-required="true" value={String(settings.parameters?.voice ?? "")} onChange={(event) => parameter("voice", event.currentTarget.value)} />}</div>}
      <div className="generation-fields">{canvasModelFields(model).map((field) => <GenerationParameter key={field.id} field={field} value={settings.parameters?.[field.id]} onChange={(value) => parameter(field.id, value)} />)}
        <div className="generation-variations"><span className={STUDIO_LABEL}>Variations</span><GenerationStepper label={`${node.title} variations`} min={1} max={4} value={count} onChange={(value) => { if (value && Number.isInteger(value) && value >= 1 && value <= 4) patch({ variants: value }); }} /></div>
      </div>
    </fieldset>
    <div className="generation-footer">
      {!running && <div className="canvas-node-readiness flex items-start gap-1.5 type-xs text-muted" role="status" aria-label={`${node.title} readiness`} data-ready={ready}><StatusIcon size={13} className="mt-0.5 shrink-0" /><span>{!ready ? issues.join(" · ") : data.readiness?.runsUpstream ? "Ready · runs previous steps first" : "Ready to run"}</span></div>}
      {!model?.available && <div className="flex flex-wrap items-center gap-2 type-xs text-muted"><span>{model ? "Unavailable · check provider settings" : settings.modelId ? "Not checked" : "Not configured"}</span>{data.onOpenProviders && <button type="button" className={STUDIO_BUTTON} onClick={data.onOpenProviders}>Manage providers</button>}{settings.modality === "text" && data.onOpenAgents && <button type="button" className={STUDIO_BUTTON} onClick={data.onOpenAgents}>Agent setup</button>}</div>}
      <div className="generation-actions">{data.onEstimate && <button className={STUDIO_BUTTON} type="button" disabled={data.disabled || !ready} onClick={() => data.onEstimate?.(node.id)}><Scan size={14} />Estimate</button>}{data.onRun && !running && <button className={STUDIO_PRIMARY} type="button" disabled={data.disabled || !ready} onClick={() => data.onRun?.(node.id)}><Sparkles size={14} />Generate<span className="generation-generate-badge" aria-hidden="true">{count}</span></button>}
      {running && data.onStop && <button className={STUDIO_BUTTON} type="button" onClick={data.onStop}><Square size={12} />Stop run</button>}</div>
    </div>
  </div>;
}

export function ModelBrand({ modelId }: { modelId?: string }) {
  return modelId && /claude|anthropic|codex|openai|gpt|gemini|gemma|deepseek|qwen|mistral|grok|llama|kimi|minimax|command-r/i.test(modelId)
    ? <AiBrandIcon provider="openrouter" model={modelId} size={20} /> : <Cpu size={20} strokeWidth={1.4} aria-hidden="true" />;
}
