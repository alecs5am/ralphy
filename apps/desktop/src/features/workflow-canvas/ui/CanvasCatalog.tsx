import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, RefreshCw } from "@/shared/ui/icons";
import { GenerationPickerMenu, STUDIO_ICON, STUDIO_BUTTON, studioSelection } from "@/entities/generation";
import type { CanvasMediaKind } from "../../../../shared/workflow-canvas";
import type { CanvasModelCatalog, CanvasModelDescriptor } from "../../../../shared/canvas-runtime";
import { ModelBrand } from "./CanvasModelNode";

export function filterCanvasModels(models: CanvasModelDescriptor[], query: string, modality: CanvasMediaKind | "all") {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return models.filter((model) => (modality === "all" || model.modality === modality) && words.every((word) => `${model.name} ${model.id} ${model.provider} ${model.description}`.toLocaleLowerCase().includes(word)));
}

export function CanvasCatalog({ catalog, loading, modality, selected, opener = null, onChoose, onClose, onRefresh, onOpenProviders, onOpenAgents }: {
  catalog: CanvasModelCatalog; loading: boolean; modality?: CanvasMediaKind; selected?: CanvasModelDescriptor; opener?: HTMLButtonElement | null;
  onChoose(model: CanvasModelDescriptor): void; onClose(): void; onRefresh(): void; onOpenProviders?(): void; onOpenAgents?(): void;
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const candidates = filterCanvasModels(catalog.models, query, modality ?? "all");
  const models = candidates.filter((model) => provider === "all" || model.provider === provider);
  return <Dialog.Root open modal={false} onOpenChange={(open) => { if (!open) onClose(); }}><GenerationPickerMenu kind="model" opener={opener} query={query} onQuery={setQuery} onClose={onClose}
    actions={<button className={STUDIO_ICON} type="button" aria-label="Refresh model catalog" disabled={loading} onClick={onRefresh}><RefreshCw size={13} /></button>}
    filters={<div className="flex flex-wrap gap-1" role="group" aria-label="Filter models by provider">{[{ id: "all", label: "All" }, ...catalog.providers.filter((item) => candidates.some((model) => model.provider === item.id))].map((item) => <button key={item.id} className={studioSelection(provider === item.id)} type="button" aria-pressed={provider === item.id} onClick={() => setProvider(item.id)}>{item.label}</button>)}</div>}
    footer={onOpenProviders || catalog.errors.length ? <div className="generation-picker-footer">{catalog.errors.map((error) => <span className="type-xs text-muted" key={error}>{error}</span>)}{onOpenProviders && <button className={STUDIO_BUTTON} type="button" onClick={onOpenProviders}>Manage providers</button>}{onOpenAgents && modality === "text" && <button className={STUDIO_BUTTON} type="button" onClick={onOpenAgents}>Agent setup</button>}</div> : undefined}>
      <div className="px-2 py-2 font-code type-mono-xs text-muted" role="status">{loading ? "Loading models…" : `${models.length} models`}</div>
      {models.map((model) => <button key={`${model.provider}:${model.modality}:${model.id}`} className="generation-model-option group" type="button" title={model.name} aria-pressed={selected?.id === model.id && selected.provider === model.provider} onClick={() => onChoose(model)}><span className="generation-model-tile"><ModelBrand modelId={model.id} /></span><span className="generation-row-copy"><strong>{model.name}</strong><small>{catalog.providers.find((item) => item.id === model.provider)?.label ?? model.provider} · {model.available ? "Key present" : "Connect to run"} · {model.modality}</small></span><Check size={12} className="shrink-0 opacity-0 group-aria-pressed:opacity-100" /></button>)}
      {!loading && !models.length && <p className="p-4 type-sm text-muted">No matching models. Try another name or provider.</p>}
  </GenerationPickerMenu></Dialog.Root>;
}
