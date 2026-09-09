import type { CanvasModelCatalog, CanvasRun } from "./canvas-runtime";
import type { CanvasAsset } from "./workflow-canvas";

export type GenerationKind = "image" | "video" | "voiceover" | "music" | "sfx";
export interface GenerationField {
  id: string;
  label: string;
  type: "choice" | "number" | "text" | "toggle";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  default?: string | number | boolean;
  required?: boolean;
  description?: string;
}
export interface GenerationInputSpec {
  id: string;
  label: string;
  kind: "image" | "video" | "audio";
  required?: boolean;
  maxCount: number;
  description?: string;
}
export interface GenerationModel {
  id: string;
  provider: string;
  name: string;
  kind: GenerationKind;
  description: string;
  available: boolean;
  inputs: GenerationInputSpec[];
  fields: GenerationField[];
  previewSupported: boolean;
}
export interface GenerationDraft {
  kind: GenerationKind;
  modelId: string;
  provider: string;
  prompt: string;
  parameters: Record<string, string | number | boolean>;
  inputs: { role: string; asset: CanvasAsset }[];
  variants: 1 | 2 | 3 | 4;
}
export interface GenerationCatalog {
  models: GenerationModel[];
  providers: CanvasModelCatalog["providers"];
  errors: string[];
}
export interface GenerationVoice { id: string; name: string; description: string; previewUrl?: string }
export interface GenerationProviderStatus {
  id: "openrouter" | "elevenlabs" | "fal";
  name: string;
  capabilities: string[];
  configured: boolean;
  stored: boolean;
  inherited: boolean;
}
export const GENERATION_PROVIDERS_CHANGED_EVENT = "ralphy:generation-providers-changed";
export function isGenerationProviderId(value: unknown): value is GenerationProviderStatus["id"] {
  return value === "openrouter" || value === "elevenlabs" || value === "fal";
}
export interface GenerationBridge {
  loadGenerationProviders(): Promise<GenerationProviderStatus[]>;
  setGenerationProviderKey(provider: GenerationProviderStatus["id"], apiKey: string): Promise<GenerationProviderStatus[]>;
  clearGenerationProviderKey(provider: GenerationProviderStatus["id"]): Promise<GenerationProviderStatus[]>;
  loadGenerationCatalog(workspaceId: string): Promise<GenerationCatalog>;
  loadGenerationVoices(workspaceId: string): Promise<GenerationVoice[]>;
  loadGenerationDraft(workspaceId: string): Promise<GenerationDraft | null>;
  saveGenerationDraft(workspaceId: string, draft: GenerationDraft): Promise<void>;
  startGeneration(workspaceId: string, draft: GenerationDraft, mode: "preview" | "execute"): Promise<CanvasRun>;
  loadGenerationRuns(workspaceId: string): Promise<CanvasRun[]>;
  cancelGenerationRun(workspaceId: string, id: string): Promise<CanvasRun>;
  exportGenerationAsset(workspaceId: string, asset: CanvasAsset): Promise<boolean>;
}

export const GENERATION_CANVAS_ID = "generation-studio";
export const GENERATION_INPUT_ROLES = ["refs", "firstFrame", "lastFrame", "refVideos"] as const;

export function generationDraftFromRun(run: CanvasRun): GenerationDraft | null {
  if (run.canvasId !== GENERATION_CANVAS_ID) return null;
  const node = run.snapshot.nodes.find((item) => item.kind === "model");
  const config = node?.config;
  if (!node || !config?.modelId || !config.provider) return null;
  const kind = config.modality === "audio" ? config.operation : config.modality;
  if (!["image", "video", "voiceover", "music", "sfx"].includes(kind ?? "")) return null;
  return {
    kind: kind as GenerationKind, modelId: config.modelId, provider: config.provider, prompt: node.value,
    parameters: { ...config.parameters }, variants: (config.variants ?? 1) as GenerationDraft["variants"],
    inputs: run.snapshot.nodes.flatMap((item) => item.kind === "media" && item.config?.asset
      ? [{ role: item.config.operation ?? "refs", asset: item.config.asset }] : []),
  };
}
