import type { CanvasModelCatalog, CanvasModelDescriptor, CanvasModality } from "../../shared/canvas-runtime";
import type { CanvasCli } from "./runtime-cli";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value.slice(0, 2000) : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 1500) : [];
const comma = (value: unknown) => text(value).split(",").filter(Boolean);

export async function loadCanvasModelCatalog(cli: CanvasCli, fetcher: typeof fetch): Promise<CanvasModelCatalog> {
  const catalog: CanvasModelCatalog = { models: [], providers: [], errors: [] };
  const [providers, videos, router] = await Promise.allSettled([
    cli(["provider", "list"]), cli(["models", "list"]),
    fetcher("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20_000) }).then(async (response) => {
      if (!response.ok) throw new Error("Model catalog could not be loaded");
      const body = await response.text();
      if (body.length > 8 * 1024 * 1024) throw new Error("Model catalog is too large");
      return JSON.parse(body) as unknown;
    }),
  ]);
  if (providers.status === "fulfilled") catalog.providers = list(record(providers.value).providers).map((value) => {
    const row = record(value);
    return { id: text(row.id), label: text(row.label), available: row.available === true, capabilities: list(row.capabilities).map((item) => text(item)).filter(Boolean) };
  }).filter((provider) => provider.id);
  else catalog.errors.push("Provider availability could not be checked.");
  const available = (provider: string) => catalog.providers.find((item) => item.id === provider)?.available === true;
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
  // These are the installed runtime's documented voice models, not a live provider inventory.
  if (catalog.providers.some(({ id }) => id === "elevenlabs")) catalog.models.push({ id: "eleven_multilingual_v2", name: "Eleven Multilingual v2", provider: "elevenlabs", modality: "audio", description: "Voiceover · requires a voice ID", available: available("elevenlabs"), parameters: {} });
  catalog.models = [...new Map(catalog.models.map((item: CanvasModelDescriptor) => [`${item.provider}:${item.modality}:${item.id}`, item])).values()];
  return catalog;
}
