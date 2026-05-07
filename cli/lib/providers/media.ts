// Unified media provider — single entry-point for image / video / voiceover / music.
//
// All routes go through this module. Image + video → OpenRouter media endpoints.
// Voiceover + music → ElevenLabs. **No FAL_KEY, no direct openai.com, no Vercel.**
// See AGENTS.md hard invariant #1 + MODELS.md for model choice.
//
// Why centralized:
// - Every model call logs through gen-log.ts (provenance for cost rollups).
// - Single place to swap defaults / add retries / inject quality gates.
// - Skill code never touches raw fetch — keeps the runtime-no-scripts invariant honest.
//
// Usage:
//   import { generateImage, generateVideo, generateVoiceover, generateMusic } from "./providers/media.js";
//   const img = await generateImage({ projectId, slot, model, prompt, size: "1080x1920", refs: [refUrl] });

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { logGeneration } from "../gen-log.js";
import { hasCapability, requireCapability } from "../capabilities.js";
import { projectsDir } from "../paths.js";

// ─────────────────────────────────────────────────────────────────────────────
// Common types
// ─────────────────────────────────────────────────────────────────────────────

export type Size9x16 = "1080x1920" | "720x1280" | "540x960";

export type GenerateResult = {
  /** Remote URL returned by the provider, if any (may expire). */
  url?: string;
  /** Path under workspace/projects/<id>/assets/... where we saved the file. */
  localPath: string;
  /** Best-effort estimate; pulled from `MODELS.md` ratios when provider doesn't return it. */
  costUsd: number;
  /** End-to-end latency for the call. */
  latencyMs: number;
  /** Model id actually used (provider may resolve aliases). */
  model: string;
};

type CommonInput = {
  projectId: string;
  /** Slot id (e.g. `scene-01-bg-image`) — used in log notes + filenames. */
  slot: string;
  /** Free-form note for `generations.jsonl`. */
  note?: string;
  signal?: AbortSignal;
};

// ─────────────────────────────────────────────────────────────────────────────
// Image
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateImageInput = CommonInput & {
  /** OpenRouter model id, e.g. `google/gemini-3-pro-image-preview` (default) or `openai/gpt-5.4-image-2`. */
  model?: string;
  prompt: string;
  /** Optional multi-ref URLs (gemini-3-pro-image-preview supports `image_urls`). */
  refs?: string[];
  size?: Size9x16;
  /** Negative prompt where supported. */
  negativePrompt?: string;
};

const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image-preview";
const IMAGE_PRICE_USD = 0.15; // ballpark per MODELS.md; refine when OR returns billed cost.

export async function generateImage(input: GenerateImageInput): Promise<GenerateResult> {
  requireCapability("llm-openrouter");
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_IMAGE_MODEL;
  const size = input.size ?? "1080x1920";
  const apiKey = process.env.OPENROUTER_API_KEY!;

  // OpenRouter exposes OpenAI-compatible /images/generations.
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    size,
    response_format: "url",
    n: 1,
  };
  if (input.refs && input.refs.length > 0) body.image_urls = input.refs;
  if (input.negativePrompt) body.negative_prompt = input.negativePrompt;

  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, "openrouter", model, "image", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`OpenRouter images ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, "openrouter", model, "image", body, err, t0);
    throw err;
  }

  const json = (await resp.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const url = json.data?.[0]?.url;
  if (!url) {
    const err = new Error("OpenRouter image response had no url");
    await logFailure(input, "openrouter", model, "image", body, err, t0);
    throw err;
  }

  const localPath = await downloadTo(
    url,
    assetPath(input.projectId, "images", `${input.slot}.png`)
  );

  const result: GenerateResult = {
    url,
    localPath,
    costUsd: IMAGE_PRICE_USD,
    latencyMs: Date.now() - t0,
    model,
  };
  await logGeneration(input.projectId, {
    provider: "openrouter",
    endpoint: model,
    kind: "image",
    input: { prompt: input.prompt, size, refs: input.refs ?? [] },
    output: { url, local: localPath },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Video (image-to-video / text-to-video)
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateVideoInput = CommonInput & {
  /** OpenRouter model id, e.g. `kwaivgi/kling-v3.0-pro` (default), `google/veo-3.1`, `bytedance/seedance-2.0`. */
  model?: string;
  /** Reference image url (for i2v). Omit for t2v. */
  image?: string;
  prompt: string;
  durationSec: number;
  /** Enable model-native audio (Veo 3.x only). Default false. */
  generateAudio?: boolean;
};

const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
// Per-second cost per-model (ballpark from MODELS.md). Refine if provider returns billed cost.
const VIDEO_PRICE_PER_SEC: Record<string, number> = {
  "kwaivgi/kling-v3.0-pro": 0.14,
  "google/veo-3.1": 0.5,
  "bytedance/seedance-2.0": 0.1,
};

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateResult> {
  requireCapability("llm-openrouter");
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_VIDEO_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY!;

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    duration_sec: input.durationSec,
    generate_audio: input.generateAudio ?? false,
  };
  if (input.image) body.image = input.image;

  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/videos/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`OpenRouter videos ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }

  const json = (await resp.json()) as { data?: Array<{ url?: string }> };
  const url = json.data?.[0]?.url;
  if (!url) {
    const err = new Error("OpenRouter video response had no url");
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }

  const localPath = await downloadTo(
    url,
    assetPath(input.projectId, "videos", `${input.slot}.mp4`)
  );

  const pricePerSec = VIDEO_PRICE_PER_SEC[model] ?? 0.14;
  const result: GenerateResult = {
    url,
    localPath,
    costUsd: pricePerSec * input.durationSec,
    latencyMs: Date.now() - t0,
    model,
  };
  await logGeneration(input.projectId, {
    provider: "openrouter",
    endpoint: model,
    kind: "video",
    input: { prompt: input.prompt, duration_sec: input.durationSec, image: input.image },
    output: { url, local: localPath },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Voiceover (ElevenLabs TTS)
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateVoiceoverInput = CommonInput & {
  text: string;
  voiceId: string;
  /** Default eleven_multilingual_v2 (RU). */
  modelId?: string;
  /** Default tuned for deadpan young Russian — see MODELS.md. */
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
};

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.25,
  use_speaker_boost: true,
};

export async function generateVoiceover(input: GenerateVoiceoverInput): Promise<GenerateResult> {
  requireCapability("voiceover-elevenlabs");
  const t0 = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const modelId = input.modelId ?? "eleven_multilingual_v2";

  const body = {
    text: input.text,
    model_id: modelId,
    voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...input.voiceSettings },
    output_format: "mp3_44100_128",
  };

  let resp: Response;
  try {
    resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${input.voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ralphy/1.0)",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, "elevenlabs", modelId, "voiceover", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`ElevenLabs TTS ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, "elevenlabs", modelId, "voiceover", body, err, t0);
    throw err;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const localPath = assetPath(input.projectId, "voiceover", `${input.slot}.mp3`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buf);

  // ElevenLabs subscription billing — log "subscription" not a per-call price.
  const result: GenerateResult = {
    localPath,
    costUsd: 0,
    latencyMs: Date.now() - t0,
    model: modelId,
  };
  await logGeneration(input.projectId, {
    provider: "elevenlabs",
    endpoint: `tts/${modelId}`,
    kind: "voiceover",
    input: { voice_id: input.voiceId, text_chars: input.text.length, model_id: modelId },
    output: { local: localPath, bytes: buf.length },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: 0,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Music (ElevenLabs Music)
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateMusicInput = CommonInput & {
  prompt: string;
  durationSec: number;
  /** Default true — instrumental beds for UGC. */
  forceInstrumental?: boolean;
};

export async function generateMusic(input: GenerateMusicInput): Promise<GenerateResult> {
  requireCapability("voiceover-elevenlabs");
  const t0 = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const modelId = "music_v1";
  const musicLengthMs = Math.max(3000, Math.min(600000, Math.round(input.durationSec * 1000)));

  const body = {
    prompt: input.prompt,
    music_length_ms: musicLengthMs,
    force_instrumental: input.forceInstrumental ?? true,
    output_format: "mp3_44100_128",
    model_id: modelId,
  };

  let resp: Response;
  try {
    resp = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; ralphy/1.0)",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, "elevenlabs", modelId, "music", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`ElevenLabs Music ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, "elevenlabs", modelId, "music", body, err, t0);
    throw err;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const localPath = assetPath(input.projectId, "music", `${input.slot}.mp3`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buf);

  const result: GenerateResult = {
    localPath,
    costUsd: 0, // subscription billing
    latencyMs: Date.now() - t0,
    model: modelId,
  };
  await logGeneration(input.projectId, {
    provider: "elevenlabs",
    endpoint: "music",
    kind: "music",
    input: { prompt: input.prompt, music_length_ms: musicLengthMs, force_instrumental: body.force_instrumental },
    output: { local: localPath, bytes: buf.length },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: 0,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function assetPath(projectId: string, kind: string, filename: string): string {
  return path.join(projectsDir(), projectId, "assets", kind, filename);
}

async function downloadTo(url: string, dest: string): Promise<string> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download ${resp.status} on ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

async function logFailure(
  input: CommonInput,
  provider: "openrouter" | "elevenlabs",
  model: string,
  kind: "image" | "video" | "voiceover" | "music",
  body: Record<string, unknown>,
  err: unknown,
  t0: number,
): Promise<void> {
  await logGeneration(input.projectId, {
    provider,
    endpoint: model,
    kind,
    input: body,
    status: "error",
    error: err instanceof Error ? err.message : String(err),
    latency_ms: Date.now() - t0,
    cost_usd: 0,
    note: input.note ?? input.slot,
  });
}

/** Convenience — returns true when both required keys are present. */
export function mediaProvidersReady(): boolean {
  return hasCapability("llm-openrouter") && hasCapability("voiceover-elevenlabs");
}
