import type { GenerationCatalog, GenerationField, GenerationInputSpec } from "../../shared/generation-studio";
import type { CanvasModelDescriptor } from "../../shared/canvas-runtime";
import { DEFAULT_CONTENT_ASPECT_RATIO } from "../../shared/content-format";
import { loadCanvasModelCatalog } from "./runtime-catalog";
import type { CanvasCli } from "./runtime-cli";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 100) : [];
const choice = (id: string, label: string, values: (string | number)[], preferred?: string): GenerationField => ({ id, label, type: "choice", options: values.map((item) => ({ value: String(item), label: String(item) })), default: preferred && values.map(String).includes(preferred) ? preferred : String(values[0]), required: true });
const number = (id: string, label: string, min: number, max: number, step: number, initial: number): GenerationField => ({ id, label, type: "number", min, max, step, default: initial });
const toggle = (id: string, label: string, initial = false): GenerationField => ({ id, label, type: "toggle", default: initial });
const input = (id: string, label: string, kind: "image" | "video", maxCount = 1): GenerationInputSpec => ({ id, label, kind, maxCount });
const names: Record<string, string> = {
  eleven_multilingual_v2: "Eleven Multilingual v2", eleven_v3: "Eleven v3", "elevenlabs-music": "ElevenLabs Music", "elevenlabs-sfx": "ElevenLabs Sound Effects",
  "bytedance/seedance-2.0/reference-to-video": "Seedance 2.0 · Reference video", "fal-ai/kling-video/o3/pro/reference-to-video": "Kling O3 Pro · Reference video",
};

function modelFields(model: CanvasModelDescriptor, supported: string[]): GenerationField[] {
  if (model.modality === "image") return [choice("aspectRatio", "Aspect ratio", model.parameters.aspects ?? [DEFAULT_CONTENT_ASPECT_RATIO], DEFAULT_CONTENT_ASPECT_RATIO), ...(supported.includes("negativePrompt") ? [{ id: "negative", label: "Avoid", type: "text" as const, description: "Describe anything to leave out of the image." }] : [])];
  const fields: GenerationField[] = [];
  const { durations, resolutions, aspects } = model.parameters;
  if (durations?.length) fields.push(choice("duration", "Duration (seconds)", durations, "5"));
  if (resolutions?.length && model.id !== "fal-ai/kling-video/o3/pro/reference-to-video") fields.push(choice("resolution", "Resolution", resolutions, "720p"));
  if (aspects?.length) fields.push(choice("aspectRatio", "Aspect ratio", aspects, DEFAULT_CONTENT_ASPECT_RATIO));
  if (supported.includes("generateAudio")) fields.push(toggle("audio", "Generate audio"));
  return fields;
}

function voiceFields(id: string): GenerationField[] {
  const voice: GenerationField = { id: "voice", label: "Voice ID", type: "text", required: true, description: "Use a voice from your ElevenLabs account." };
  // Provider docs narrow the installed matrix: v3 uses delivery modes; the other knobs are unavailable.
  // https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech
  if (id === "eleven_v3") return [voice, { id: "stability", label: "Delivery", type: "choice", options: [{ value: "0", label: "Creative" }, { value: "0.5", label: "Natural" }, { value: "1", label: "Robust" }], default: "0.5", required: true }];
  return [voice, number("stability", "Stability", 0, 1, 0.01, 0.55), number("similarityBoost", "Similarity", 0, 1, 0.01, 0.8), number("style", "Style", 0, 1, 0.01, 0.25), number("speed", "Speed", 0.7, 1.2, 0.05, 1), toggle("speakerBoost", "Speaker boost", true)];
}

/** The CLI matrix describes connector coverage; public model discovery alone cannot promise it. */
export async function loadGenerationCatalog(cli: CanvasCli, fetcher: typeof fetch): Promise<GenerationCatalog> {
  const coverageRequest = cli(["provider", "matrix"]);
  const [base, matrix] = await Promise.allSettled([loadCanvasModelCatalog(cli, fetcher, coverageRequest), coverageRequest]);
  const catalog: GenerationCatalog = base.status === "fulfilled" ? { models: [], providers: base.value.providers, errors: [...base.value.errors] } : { models: [], providers: [], errors: ["Model discovery is unavailable."] };
  const entries = matrix.status === "fulfilled" && Array.isArray(record(matrix.value).entries) ? (record(matrix.value).entries as unknown[]).slice(0, 1500).map(record) : [];
  if (matrix.status === "rejected") catalog.errors.push("Provider parameter discovery is unavailable.");
  const coverage = (provider: string, id: string) => entries.find((row) => row.provider === provider && row.model === id);
  const candidates = base.status === "fulfilled" ? base.value.models.filter((model) => model.modality === "image" || model.modality === "video") : [];
  for (const model of candidates) {
    // Specialized editing/upscaling models need input contracts this CLI does not expose.
    if (model.modality === "video" && (!model.parameters.durations?.length || !model.parameters.resolutions?.length || !model.parameters.aspects?.length)) continue;
    const supported = strings(coverage(model.provider, model.id)?.supportedParams);
    const inputs: GenerationInputSpec[] = [];
    if (supported.includes("refs") || model.modality === "image" && model.inputModalities?.includes("image")) inputs.push(input("refs", "Reference images", "image", model.id.includes("seedance") ? 9 : 4));
    if (model.modality === "video") {
      if (model.parameters.frames?.includes("first_frame")) inputs.push(input("firstFrame", "First frame", "image"));
      if (model.parameters.frames?.includes("last_frame")) inputs.push(input("lastFrame", "Last frame", "image"));
      // The installed fal connector requires a project to preprocess local video references.
      // Studio uses workspace assets; keep that unsupported route out of its input contract.
    }
    catalog.models.push({ id: model.id, provider: model.provider, name: names[model.id] ?? model.name, kind: model.modality as "image" | "video", description: model.description, available: model.available, inputs, fields: modelFields(model, supported), previewSupported: true });
  }
  for (const row of entries) {
    if (row.provider !== "elevenlabs" || typeof row.model !== "string" || !names[row.model]) continue;
    const kind = row.capability === "voice" ? "voiceover" : row.capability;
    if (kind !== "voiceover" && kind !== "music" && kind !== "sfx") continue;
    const fields: GenerationField[] = kind === "voiceover" ? voiceFields(row.model) : kind === "music" ? [number("duration", "Duration (seconds)", 3, 600, 1, 30), toggle("withVocals", "Allow vocals")] : [number("duration", "Duration (seconds)", 0.5, 22, 0.5, 4), number("promptInfluence", "Prompt influence", 0, 1, 0.01, 0.4)];
    catalog.models.push({ id: row.model, provider: "elevenlabs", name: names[row.model]!, kind, description: kind === "voiceover" ? "Turn your script into speech." : kind === "music" ? "Create an original music track." : "Create a sound from a description.", available: catalog.providers.some((item) => item.id === "elevenlabs" && item.available), inputs: [], fields, previewSupported: kind !== "sfx" });
  }
  return catalog;
}
