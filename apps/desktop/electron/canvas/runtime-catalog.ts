import type { CanvasModelCatalog, CanvasModelDescriptor, CanvasModality } from "../../shared/canvas-runtime";
import type { CanvasCli } from "./runtime-cli";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value.slice(0, 2000) : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 1500) : [];
const comma = (value: unknown) => text(value).split(",").filter(Boolean);

export async function loadCanvasModelCatalog(cli: CanvasCli, fetcher: typeof fetch, matrix = cli(["provider", "matrix"])): Promise<CanvasModelCatalog> {
  const catalog: CanvasModelCatalog = { models: [], providers: [], errors: [] };
  const [providers, videos, router, coverage] = await Promise.allSettled([
    cli(["provider", "list"]), cli(["models", "list"]),
    fetcher("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20_000) }).then(async (response) => {
      if (!response.ok) throw new Error("Model catalog could not be loaded");
      const body = await response.text();
      if (body.length > 8 * 1024 * 1024) throw new Error("Model catalog is too large");
      return JSON.parse(body) as unknown;
    }), matrix,
  ]);
  if (providers.status === "fulfilled") catalog.providers = list(record(providers.value).providers).map((value) => {
    const row = record(value);
    return { id: text(row.id), label: text(row.label), available: row.available === true, capabilities: list(row.capabilities).map((item) => text(item)).filter(Boolean) };
  }).filter((provider) => provider.id);
  else catalog.errors.push("Provider availability could not be checked.");
  const available = (provider: string) => catalog.providers.find((item) => item.id === provider)?.available === true;
  const entries = coverage.status === "fulfilled" ? list(record(coverage.value).entries).map(record) : [];
  if (coverage.status === "rejected") catalog.errors.push("Provider-specific model discovery is unavailable.");
  if (router.status === "fulfilled") {
    for (const item of list(record(router.value).data)) {
      const row = record(item), id = text(row.id);
      if (!id) continue;
      const modalities = list(record(row.architecture).output_modalities);
      for (const modality of ["image", "text"] as CanvasModality[]) {
        if (!modalities.includes(modality)) continue;
        const inputModalities = list(record(row.architecture).input_modalities).filter((item): item is CanvasModality => ["text", "image", "video", "audio"].includes(String(item)));
        catalog.models.push({ id, name: text(row.name, id), description: text(row.description), provider: "openrouter", modality, inputModalities, available: available("openrouter"), parameters: modality === "image" ? { aspects: ["9:16", "16:9", "1:1", "3:4", "4:3", "2:3", "3:2"] } : {} });
      }
    }
  } else catalog.errors.push("OpenRouter text and image discovery is unavailable.");
  if (videos.status === "fulfilled") for (const item of list(record(videos.value).models)) {
    const row = record(item), id = text(row.id);
    if (!id) continue;
    catalog.models.push({ id, name: text(row.name, id), description: "Video generation", provider: "openrouter", modality: "video", available: available("openrouter"), parameters: {
      durations: comma(row.durations).map(Number).filter(Number.isFinite), resolutions: comma(row.resolutions), aspects: comma(row.aspects), frames: comma(row.frames),
    } });
  } else catalog.errors.push("Video model discovery is unavailable.");
  for (const row of entries) {
    if (row.provider !== "fal" || row.capability !== "video" || typeof row.model !== "string") continue;
    const seedance = row.model === "bytedance/seedance-2.0/reference-to-video";
    if (!seedance && row.model !== "fal-ai/kling-video/o3/pro/reference-to-video") continue;
    catalog.models.push({ id: row.model, provider: "fal", name: seedance ? "Seedance 2.0 · Reference video" : "Kling O3 Pro · Reference video", modality: "video", description: "Generate video with reference images.", available: available("fal"), parameters: { durations: Array.from({ length: seedance ? 12 : 13 }, (_, index) => index + (seedance ? 4 : 3)), resolutions: seedance ? ["480p", "720p", "1080p"] : ["720p", "1080p"], aspects: seedance ? ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] : ["16:9", "9:16", "1:1"], frames: seedance ? [] : ["first_frame", "last_frame"] } });
  }
  for (const row of entries) {
    if (row.provider !== "elevenlabs" || typeof row.model !== "string") continue;
    const operation = row.capability === "voice" ? "voiceover" : row.capability;
    if (operation !== "voiceover" && operation !== "music" && operation !== "sfx") continue;
    const names: Record<string, string> = { eleven_multilingual_v2: "Eleven Multilingual v2", eleven_v3: "Eleven v3", "elevenlabs-music": "ElevenLabs Music", "elevenlabs-sfx": "ElevenLabs Sound Effects" };
    if (!names[row.model]) continue;
    catalog.models.push({ id: row.model, name: names[row.model]!, provider: "elevenlabs", modality: "audio", operation, description: operation === "voiceover" ? "Voiceover · requires a voice ID" : operation === "music" ? "Original music" : "Sound effects", available: available("elevenlabs"), parameters: {} });
  }
  for (const model of catalog.models) {
    const row = entries.find((entry) => entry.provider === model.provider && entry.model === model.id);
    if (row) model.supportedParams = list(row.supportedParams).map((item) => text(item)).filter(Boolean);
  }
  catalog.models = [...new Map(catalog.models.map((item: CanvasModelDescriptor) => [`${item.provider}:${item.modality}:${item.id}`, item])).values()];
  return catalog;
}
