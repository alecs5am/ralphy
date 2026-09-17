import { useState } from "react";
import { AudioLines, Check, Cpu } from "@/shared/ui/icons";
import type { GenerationCatalog, GenerationDraft, GenerationModel } from "../../../../shared/generation-studio";
import { AiBrandIcon } from "@/shared/ui/AiBrandIcon";
import { studioSelection } from "@/entities/generation"
import { GenerationPickerMenu } from "@/entities/generation"

export function GenerationModelIcon({ model }: { model?: GenerationModel }) {
  if (model?.provider === "fal") return <span className="generation-monogram" aria-hidden="true">{model.id.includes("kling") ? "KL" : model.id.includes("seedance") ? "SE" : model.name.slice(0, 2).toLocaleUpperCase()}</span>;
  if (model?.provider === "elevenlabs") return <AudioLines size={20} strokeWidth={1.5} aria-hidden="true" />;
  if (model && /google|gemini|openai|gpt|grok|x-ai|qwen|minimax/.test(model.id)) return <AiBrandIcon provider="openrouter" model={model.id} size={20} />;
  return <Cpu size={20} strokeWidth={1.5} aria-hidden="true" />;
}

export function GenerationModels({ catalog, draft, opener, onChoose, onClose }: { catalog: GenerationCatalog; draft: GenerationDraft; opener: HTMLButtonElement | null; onChoose(model: GenerationModel): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const candidates = catalog.models.filter((model) => model.kind === draft.kind);
  const models = candidates.filter((model) => (provider === "all" || model.provider === provider) && query.toLocaleLowerCase().split(/\s+/).every((word) => `${model.name} ${model.id} ${model.provider} ${model.description}`.toLocaleLowerCase().includes(word)));
  return <GenerationPickerMenu kind="model" opener={opener} query={query} onQuery={setQuery} onClose={onClose} filters={
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter models by provider">{[{ id: "all", label: "All" }, ...catalog.providers.filter((item) => candidates.some((model) => model.provider === item.id))].map((item) => <button type="button" className={`${studioSelection(provider === item.id)} min-h-7 px-2`} aria-pressed={provider === item.id} key={item.id} onClick={() => setProvider(item.id)}>{item.label}</button>)}</div>
  }>
      <div className="px-2 py-2 font-code type-mono-xs text-muted" role="status">{models.length} {models.length === 1 ? "model" : "models"}</div>
      {models.map((model) => <button key={`${model.provider}:${model.id}`} type="button" title={model.name} aria-pressed={draft.modelId === model.id && draft.provider === model.provider} className="generation-model-option group" onClick={() => onChoose(model)}>
        <span className="generation-model-tile"><GenerationModelIcon model={model} /></span>
        <span className="generation-row-copy"><strong>{model.name}</strong><small>{catalog.providers.find((item) => item.id === model.provider)?.label ?? model.provider} · {model.available ? "Key present" : "Connection needed"} · {model.kind === "voiceover" ? "Voice" : model.kind}</small></span>
        <Check size={12} className="shrink-0 text-ink opacity-0 group-aria-pressed:opacity-100" aria-hidden="true" />
      </button>)}
      {!models.length && <p className="p-4 type-sm leading-relaxed text-muted">No matching models. Try another name or provider.</p>}
  </GenerationPickerMenu>;
}
