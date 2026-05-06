// Capability registry — maps env vars to pipeline features.
//
// v2: only two keys are required. OPENROUTER_API_KEY covers image / video / LLM /
// vision / transcription. ELEVENLABS_API_KEY covers voice + music. Everything
// else (FAL/Vercel/OpenAI/Replicate) was removed per Sprint 2 OpenRouter
// consolidation. See AGENTS.md hard invariant #1 + MODELS.md.
//
// Usage:
//   import { requireCapability, hasCapability, getCapabilityStatus } from "./capabilities.js";
//
//   requireCapability("voiceover-elevenlabs");          // throws clean error if missing
//   if (hasCapability("llm-openrouter")) { ... }        // optional path

export type CapabilityId =
  | "voiceover-elevenlabs"
  | "llm-openrouter";

export type CapabilityCategory = "media" | "voice" | "music" | "llm";

export type Capability = {
  id: CapabilityId;
  label: string;
  description: string;
  /** Env var that unlocks it. */
  envVar: string;
  category: CapabilityCategory;
  /** Where to obtain the key — shown in setup wizard. */
  signupUrl: string;
  /** Required for the *core* pipeline? In v2 both are required. */
  required: true;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "llm-openrouter",
    label: "OpenRouter",
    description:
      "Unified key — covers image generation (gemini-3-pro-image-preview, gpt-5.4-image-2), " +
      "video (kling-v3.0-pro, veo-3.1, seedance-2.0), LLM/vision (gemini, claude, gpt), " +
      "and transcription (whisper-1).",
    envVar: "OPENROUTER_API_KEY",
    category: "llm",
    signupUrl: "https://openrouter.ai/keys",
    required: true,
  },
  {
    id: "voiceover-elevenlabs",
    label: "ElevenLabs",
    description:
      "Voiceover (eleven_multilingual_v2 RU, eleven_v3 EN premium) and music " +
      "(ElevenLabs Music — instrumental beds via /v1/music endpoint).",
    envVar: "ELEVENLABS_API_KEY",
    category: "voice",
    signupUrl: "https://elevenlabs.io/app/settings/api-keys",
    required: true,
  },
];

export function hasCapability(id: CapabilityId): boolean {
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (!cap) return false;
  return Boolean(process.env[cap.envVar]);
}

export function requireCapability(id: CapabilityId): void {
  if (hasCapability(id)) return;
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (!cap) throw new Error(`Unknown capability: ${id}`);
  throw new Error(
    `Capability "${cap.label}" is not configured.\n` +
      `  Required env var: ${cap.envVar}\n` +
      `  Get a key at: ${cap.signupUrl}\n` +
      `Run "ralphy setup" to configure interactively.`,
  );
}

export type CapabilityStatus = Capability & { enabled: boolean };

export function getCapabilityStatus(): CapabilityStatus[] {
  return CAPABILITIES.map((c) => ({ ...c, enabled: hasCapability(c.id) }));
}
