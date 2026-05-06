// Capability registry — maps env vars to pipeline features.
//
// Why this exists: not every user has every API key. The pipeline should
// degrade gracefully — skip lipsync if no FAL_KEY, fall back to OpenRouter
// if VERCEL_AI_GATEWAY_KEY is missing, refuse cleanly with a useful message
// instead of a stack trace 200 lines deep into a script.
//
// Usage:
//   import { requireCapability, hasCapability, getCapabilityStatus } from "./capabilities.js";
//
//   requireCapability("voiceover-elevenlabs");          // throws clean error if missing
//   if (hasCapability("video-fal")) { ... lipsync ... } // optional path
//   getCapabilityStatus()                                // for `ralph setup --no-tui` and dashboard

export type CapabilityId =
  | "image-fal"
  | "video-fal"
  | "music-fal"
  | "voiceover-elevenlabs"
  | "llm-vercel"
  | "llm-openrouter"
  | "llm-openai"
  | "tiktok-scraper-playwright"
  | "lipsync-replicate";

export type CapabilityCategory = "media" | "voice" | "music" | "llm" | "scraper";

export type Capability = {
  id: CapabilityId;
  label: string;
  description: string;
  /** Env var that unlocks it. `null` = no key needed (e.g. local playwright). */
  envVar: string | null;
  category: CapabilityCategory;
  /** Where to obtain the key — shown in setup wizard. */
  signupUrl?: string;
  /** Required for the *core* pipeline? If false, optional / fallback. */
  required: boolean;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "image-fal",
    label: "fal.ai (image gen)",
    description: "Image generation — nano-banana-pro, flux-pro, seedream",
    envVar: "FAL_KEY",
    category: "media",
    signupUrl: "https://fal.ai/dashboard/keys",
    required: true,
  },
  {
    id: "video-fal",
    label: "fal.ai (video / lipsync)",
    description: "Video generation — kling, wan-25, sync-lipsync, veed",
    envVar: "FAL_KEY",
    category: "media",
    signupUrl: "https://fal.ai/dashboard/keys",
    required: true,
  },
  {
    id: "music-fal",
    label: "fal.ai (music)",
    description: "Music generation — Lyria2, MusicGen",
    envVar: "FAL_KEY",
    category: "music",
    signupUrl: "https://fal.ai/dashboard/keys",
    required: false,
  },
  {
    id: "voiceover-elevenlabs",
    label: "ElevenLabs",
    description: "Russian voiceover — eleven_multilingual_v2",
    envVar: "ELEVENLABS_API_KEY",
    category: "voice",
    signupUrl: "https://elevenlabs.io/app/settings/api-keys",
    required: true,
  },
  {
    id: "llm-vercel",
    label: "Vercel AI Gateway",
    description: "Unified LLM/vision (Gemini, Claude, GPT). Recommended over OpenRouter.",
    envVar: "VERCEL_AI_GATEWAY_KEY",
    category: "llm",
    signupUrl: "https://vercel.com/ai-gateway",
    required: false,
  },
  {
    id: "llm-openrouter",
    label: "OpenRouter",
    description: "Alt LLM provider. Either this or Vercel is enough for vision/scoring.",
    envVar: "OPENROUTER_API_KEY",
    category: "llm",
    signupUrl: "https://openrouter.ai/keys",
    required: false,
  },
  {
    id: "llm-openai",
    label: "OpenAI",
    description: "Optional fallback LLM (no Gemini — used as last resort).",
    envVar: "OPENAI_API_KEY",
    category: "llm",
    signupUrl: "https://platform.openai.com/api-keys",
    required: false,
  },
  {
    id: "lipsync-replicate",
    label: "Replicate",
    description: "Optional alt for some lipsync models. Fal.ai wan-25 is the default.",
    envVar: "REPLICATE_API_KEY",
    category: "media",
    signupUrl: "https://replicate.com/account/api-tokens",
    required: false,
  },
  {
    id: "tiktok-scraper-playwright",
    label: "Playwright (TikTok scraper)",
    description: "Local TikTok hashtag scraper — no key needed",
    envVar: null,
    category: "scraper",
    required: false,
  },
];

export function hasCapability(id: CapabilityId): boolean {
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (!cap) return false;
  if (cap.envVar === null) return true;
  return Boolean(process.env[cap.envVar]);
}

export function requireCapability(id: CapabilityId): void {
  if (hasCapability(id)) return;
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (!cap) throw new Error(`Unknown capability: ${id}`);
  throw new Error(
    `Capability "${cap.label}" is not configured.\n` +
      `  Required env var: ${cap.envVar}\n` +
      (cap.signupUrl ? `  Get a key at: ${cap.signupUrl}\n` : "") +
      `Run "bun run setup" to configure interactively.`,
  );
}

export type CapabilityStatus = Capability & { enabled: boolean };

export function getCapabilityStatus(): CapabilityStatus[] {
  return CAPABILITIES.map((c) => ({ ...c, enabled: hasCapability(c.id) }));
}

/**
 * Best LLM provider currently configured. Order: Vercel (preferred — unified gateway)
 * → OpenRouter → OpenAI. Returns null if none.
 */
export function bestLLM(): "vercel" | "openrouter" | "openai" | null {
  if (hasCapability("llm-vercel")) return "vercel";
  if (hasCapability("llm-openrouter")) return "openrouter";
  if (hasCapability("llm-openai")) return "openai";
  return null;
}
