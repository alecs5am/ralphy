import type { GenerationVoice } from "../../shared/generation-studio";
import type { CanvasCli } from "./runtime-cli";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 160) : "";

export async function loadGenerationVoices(cli: CanvasCli): Promise<GenerationVoice[]> {
  const providers = record(await cli(["provider", "list", "--capability", "voice"])).providers;
  if (!Array.isArray(providers) || !providers.some((value) => record(value).id === "elevenlabs" && record(value).available === true)) throw new Error("Connect ElevenLabs in provider settings to load your voices");
  const response = record(await cli(["voice", "list"]));
  if (!Array.isArray(response.voices)) throw new Error("The runtime did not return a voice list");
  // Verified 0.3.0 CLI shape: { count, voices: [{ voice_id, name, category, labels }] }.
  // The command strips provider preview URLs, so there is no preview URL to expose safely.
  return response.voices.slice(0, 1500).flatMap((value): GenerationVoice[] => {
    const row = record(value), id = text(row.voice_id);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return [];
    const labels = Object.values(record(row.labels)).slice(0, 8).map(text).filter(Boolean);
    return [{ id, name: text(row.name) || id, description: [text(row.category), ...labels].filter(Boolean).join(" · ") }];
  });
}
