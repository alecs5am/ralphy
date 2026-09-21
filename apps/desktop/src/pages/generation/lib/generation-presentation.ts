import { AudioLines, Clapperboard, Image, Mic, Music2, Waves } from "@/shared/ui/icons";
import { generationDraftFromRun, type GenerationDraft, type GenerationKind, type GenerationModel } from "../../../../shared/generation-studio";
import type { CanvasRun } from "../../../../shared/canvas-runtime";

export const GENERATION_TABS = [
  { id: "image", label: "Images", icon: Image },
  { id: "video", label: "Video", icon: Clapperboard },
  { id: "audio", label: "Audio", icon: AudioLines },
] as const;
export const AUDIO_TASKS = [
  { id: "voiceover", label: "Voice", icon: Mic },
  { id: "music", label: "Music", icon: Music2 },
  { id: "sfx", label: "Sound effects", icon: Waves },
] as const;
export const generationTab = (kind: GenerationKind) => kind === "image" || kind === "video" ? kind : "audio";
export const running = (run: CanvasRun) => run.status === "pending" || run.status === "running";
export const emptyDraft = (): GenerationDraft => ({ kind: "image", modelId: "", provider: "", prompt: "", parameters: {}, inputs: [], variants: 1 });

export function defaultGenerationModel(models: GenerationModel[], kind: GenerationKind): GenerationModel | undefined {
  const matching = models.filter((model) => model.kind === kind);
  const connected = matching.filter((model) => model.available);
  const candidates = connected.length ? connected : matching;
  return candidates.find((model) => !model.id.startsWith("openrouter/auto")) ?? candidates[0];
}

export function generationParameterLabel(key: string, model?: GenerationModel): string {
  const label = model?.fields.find((field) => field.id === key)?.label;
  if (label) return label;
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLocaleLowerCase();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

export function chooseGenerationModel(draft: GenerationDraft, model: GenerationModel): GenerationDraft {
  return {
    ...draft, kind: model.kind, modelId: model.id, provider: model.provider,
    parameters: Object.fromEntries(model.fields.flatMap((field) => field.default === undefined ? [] : [[field.id, field.default]])),
    inputs: model.inputs.flatMap((spec) => draft.inputs.filter((input) => input.role === spec.id && input.asset.kind === spec.kind).slice(0, spec.maxCount)),
  };
}

export function generationProblem(draft: GenerationDraft, model?: GenerationModel): string | null {
  if (!model) return "Choose a model to continue.";
  if (!draft.prompt.trim()) return draft.kind === "voiceover" ? "Add the words you want to hear." : "Describe what you want to create.";
  for (const input of model.inputs) {
    if (input.required && !draft.inputs.some((item) => item.role === input.id)) return `Add ${input.label.toLocaleLowerCase()}.`;
  }
  for (const field of model.fields) {
    const value = draft.parameters[field.id];
    if (field.required && (value === undefined || String(value).trim() === "")) return `Add ${field.label.toLocaleLowerCase()}.`;
    if (value !== undefined && value !== "" && field.type === "number" && (!Number.isFinite(Number(value)) || (field.min !== undefined && Number(value) < field.min) || (field.max !== undefined && Number(value) > field.max))) return `Check ${field.label.toLocaleLowerCase()}${field.min !== undefined && field.max !== undefined ? ` (${field.min}–${field.max})` : ""}.`;
  }
  return null;
}

export function estimateLabel(run: CanvasRun): string {
  const costs = run.nodes.flatMap((node) => node.estimatedCostUsd === null ? [] : [node.estimatedCostUsd]);
  return costs.length ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(costs.reduce((sum, cost) => sum + cost, 0)) : "Cost unavailable";
}

export function generationEstimate(runs: CanvasRun[], draft: GenerationDraft, model?: GenerationModel): CanvasRun | undefined {
  const key = (value: GenerationDraft) => JSON.stringify({
    kind: value.kind, provider: value.provider, modelId: value.modelId, prompt: value.prompt, variants: value.variants,
    parameters: Object.entries({ ...Object.fromEntries((model?.fields ?? []).filter((field) => field.default !== undefined).map((field) => [field.id, field.default])), ...value.parameters }).sort(([a], [b]) => a.localeCompare(b)),
    inputs: value.inputs.map(({ role, asset }) => [role, asset.path, asset.kind]),
  });
  const current = key(draft);
  return runs.filter((run) => { const saved = generationDraftFromRun(run); return run.mode === "preview" && saved && key(saved) === current; }).sort((a, b) => b.startedAt - a.startedAt)[0];
}

export function generationCost(run?: CanvasRun): number | null {
  if (!run || run.status !== "succeeded") return null;
  const costs = run.nodes.flatMap((node) => typeof node.estimatedCostUsd === "number" && Number.isFinite(node.estimatedCostUsd) && node.estimatedCostUsd >= 0 ? [node.estimatedCostUsd] : []);
  return costs.length ? costs.reduce((total, cost) => total + cost, 0) : null;
}
