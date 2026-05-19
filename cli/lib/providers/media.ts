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
  /**
   * If true, overwrite an existing slot file in place (legacy behavior, data-destructive).
   * Default false → auto-archive the existing file to `<slot>.v{N}.<ext>` before writing the new
   * version. Closes AGENTS.md invariant #13 enforcement: 10/10 postmortems hit silent overwrite.
   */
  overwrite?: boolean;
  signal?: AbortSignal;
};

// ─────────────────────────────────────────────────────────────────────────────
// Image
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateImageInput = CommonInput & {
  /** OpenRouter model id, e.g. `openai/gpt-5.4-image-2` (default) or `google/gemini-3-pro-image-preview` for multi-ref consistency. */
  model?: string;
  prompt: string;
  /** Optional multi-ref URLs. Both gpt-5.4-image-2 and gemini-3-pro-image-preview accept image inputs; gemini is stronger at multi-ref character consistency. */
  refs?: string[];
  size?: Size9x16;
  /** Negative prompt where supported. */
  negativePrompt?: string;
};

// Default switched from gemini-3-pro to gpt-5.4-image-2 on 2026-05-12 — premium typography,
// label accuracy, and fewer hallucinations on small details (see docs/prompts/README.md).
// Pass --model google/gemini-3-pro-image-preview when multi-ref character consistency matters.
const DEFAULT_IMAGE_MODEL = "openai/gpt-5.4-image-2";

// Per-image cost lookup. OR bills per generation (one image per call); these are
// ballparks from MODELS.md until OR returns billed cost in the response payload.
// Add a row when a new model is used in production.
const IMAGE_PRICE_PER_GEN: Record<string, number> = {
  "openai/gpt-5.4-image-2": 0.20,             // premium tier
  "openai/gpt-5-image": 0.25,                 // most expensive OpenAI tier
  "openai/gpt-5-image-mini": 0.08,            // budget OpenAI
  "google/gemini-3-pro-image-preview": 0.15,  // nano-banana lineage, multi-ref champ
  "google/gemini-3.1-flash-image-preview": 0.04,
  "google/gemini-2.5-flash-image": 0.02,      // cheapest
  "recraft/recraft-v4.1-pro": 0.25,           // raster ~2K; image-only modality; max 1 ref
  "recraft/recraft-v4.1-pro-vector": 0.30,    // SVG vector output; image-only modality; max 1 ref
};
const IMAGE_PRICE_FALLBACK = 0.15;

export async function generateImage(input: GenerateImageInput): Promise<GenerateResult> {
  requireCapability("llm-openrouter");
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_IMAGE_MODEL;
  const size = input.size ?? "1080x1920";
  const apiKey = process.env.OPENROUTER_API_KEY!;

  // OpenRouter image-generation models (gemini-3-pro-image-preview,
  // gpt-5.4-image-2, …) are exposed via /api/v1/chat/completions with
  // `modalities: ["image", "text"]`. The legacy /api/v1/images/generations
  // path returns 404. Per OR docs the response carries the bytes on
  // `choices[0].message.images[].image_url.url` as a data: URL or http URL.
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
  ];
  if (input.negativePrompt) {
    userContent.push({
      type: "text",
      text: `Negative prompt — avoid: ${input.negativePrompt}`,
    });
  }
  userContent.push({
    type: "text",
    text: `Aspect/size hint: ${size} (vertical 9:16 if size is 1080x1920).`,
  });
  // Recraft constraint: only one input image is supported.
  const isRecraft = model.startsWith("recraft/");
  if (input.refs && input.refs.length > 0) {
    const refs = isRecraft ? input.refs.slice(0, 1) : input.refs;
    for (const ref of refs) {
      const url = await resolveImageRef(ref);
      userContent.push({ type: "image_url", image_url: { url } });
    }
  }

  // Recraft v4.1 vector is image-only — chat-completions rejects ["image","text"]
  // for it with 404 "No endpoints found that support the requested output modalities".
  const modalities = isRecraft ? ["image"] : ["image", "text"];

  const body: Record<string, unknown> = {
    model,
    modalities,
    messages: [{ role: "user", content: userContent }],
  };

  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{ image_url?: { url?: string }; url?: string }>;
      };
      finish_reason?: string;
    }>;
  };
  const imgEntry = json.choices?.[0]?.message?.images?.[0];
  const url = imgEntry?.image_url?.url ?? imgEntry?.url;
  if (!url) {
    const finish = json.choices?.[0]?.finish_reason ?? "unknown";
    const text = json.choices?.[0]?.message?.content ?? "";
    const rawDump = JSON.stringify(json).slice(0, 1500);
    const err = new Error(
      `OpenRouter image response had no images[0] (model=${model}, finish_reason=${finish}). Message text: ${text.slice(0, 600) || "<empty>"}. Raw response: ${rawDump}`
    );
    await logFailure(input, "openrouter", model, "image", body, err, t0);
    throw err;
  }

  const imgDest = assetPath(input.projectId, "images", `${input.slot}.png`);
  await protectExistingAsset(imgDest, input.overwrite);
  const localPath = await writeImageFromUrlOrDataUri(url, imgDest);

  const result: GenerateResult = {
    url,
    localPath,
    costUsd: IMAGE_PRICE_PER_GEN[model] ?? IMAGE_PRICE_FALLBACK,
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
  /** First-frame anchor — URL, local path, or data: URI. Alias for firstFrame. Kept for back-compat. */
  image?: string;
  /** First-frame anchor (URL / local path / data: URI). */
  firstFrame?: string;
  /** Last-frame anchor (URL / local path / data: URI). Some models only support first_frame — see catalog. */
  lastFrame?: string;
  prompt: string;
  durationSec: number;
  /** Enable model-native audio (Veo 3.x only). Default false. */
  generateAudio?: boolean;
  /** Aspect ratio. Default "9:16" (TikTok). Per-model `supported_aspect_ratios` may be narrower — see `ralphy models show`. */
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";
  /** Resolution. Default "720p". Per-model `supported_resolutions` may be narrower — see `ralphy models show`. */
  resolution?: "480p" | "720p" | "1080p" | "4K";
  /** Polling cadence in ms. Default 15000. Total budget = pollIntervalMs * pollMaxAttempts. */
  pollIntervalMs?: number;
  /** Max polling attempts. Default 80 (≈20 min at 15s cadence). */
  pollMaxAttempts?: number;
};

const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
// Per-second cost per-model. Empirically verified against OpenRouter billing on
// 2026-05-11 — see docs/render-test-2026-05-11.md §1.1. OR bills per-clip with
// a flat per-second rate per model; the per-second math here matches observed
// billing across duration parameters. Add a row whenever a new model is used,
// or `cli/lib/providers/media.ts:reportGenerationCost` reports null.
const VIDEO_PRICE_PER_SEC: Record<string, number> = {
  // kling family — both pro and std bill at the same per-second rate on OR
  "kwaivgi/kling-v3.0-pro": 0.14,
  "kwaivgi/kling-v3.0-std": 0.14,   // verified 2026-05-11: $0.70 / 5s clip (not "½ of pro" — same rate)
  "kwaivgi/kling-video-o1": 0.14,
  // veo family
  "google/veo-3.1": 0.5,             // full / 4K
  "google/veo-3.1-fast": 0.14,       // verified 2026-05-11: $1.12 / 8s clip
  "google/veo-3.1-lite": 0.0875,     // ballpark from MODELS.md; verify in next test-drive
  // seedance family
  "bytedance/seedance-2.0": 0.14,        // verified 2026-05-11 — match family rate, not earlier $0.10/s
  "bytedance/seedance-2.0-fast": 0.14,   // verified 2026-05-11: $0.56 / 4s clip
  // alibaba wan family — using MODELS.md ballparks, verify on first use
  "alibaba/wan-2.6": 0.10,
  "alibaba/wan-2.7": 0.10,
  // minimax
  "minimax/hailuo-2.3": 0.10,
};

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateResult> {
  requireCapability("llm-openrouter");
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_VIDEO_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const aspectRatio = input.aspectRatio ?? "9:16";
  const resolution = input.resolution ?? "720p";
  const pollIntervalMs = input.pollIntervalMs ?? 15_000;
  const pollMaxAttempts = input.pollMaxAttempts ?? 80;

  // OpenRouter video generation is async: POST /api/v1/videos returns a job
  // with `id` + `polling_url` + (eventually) `unsigned_urls`. The legacy
  // /api/v1/videos/generations path returns 404. See
  // https://openrouter.ai/docs/cookbook/video-generation/text-to-video
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    duration: Math.round(input.durationSec),
    aspect_ratio: aspectRatio,
    resolution,
    generate_audio: input.generateAudio ?? false,
  };
  const firstFrameRef = input.firstFrame ?? input.image;
  const frameImages: Array<Record<string, unknown>> = [];
  if (firstFrameRef) {
    const url = await resolveImageRef(firstFrameRef);
    frameImages.push({
      type: "image_url",
      image_url: { url },
      frame_type: "first_frame",
    });
  }
  if (input.lastFrame) {
    const url = await resolveImageRef(input.lastFrame);
    frameImages.push({
      type: "image_url",
      image_url: { url },
      frame_type: "last_frame",
    });
  }
  if (frameImages.length > 0) body.frame_images = frameImages;

  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/videos", {
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
    const err = new Error(`OpenRouter videos submit ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }

  type VideoJob = {
    id: string;
    status: string;
    polling_url?: string;
    unsigned_urls?: string[];
    error?: string | { message?: string };
  };

  let job = (await resp.json()) as VideoJob & Record<string, unknown>;
  if (!job.id) {
    const jobErr =
      typeof job.error === "string"
        ? job.error
        : (job.error as { message?: string } | undefined)?.message ?? "";
    const rawDump = JSON.stringify(job).slice(0, 1500);
    const err = new Error(
      `OpenRouter video submit had no job.id (model=${model}). Error field: ${jobErr || "<empty>"}. Raw response: ${rawDump}`
    );
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }

  const terminalErr = new Set(["failed", "cancelled", "expired"]);
  for (let attempt = 1; attempt <= pollMaxAttempts; attempt += 1) {
    if (job.status === "completed") break;
    if (terminalErr.has(job.status)) {
      const detail =
        typeof job.error === "string"
          ? job.error
          : job.error?.message ?? `video job ${job.status}`;
      const err = new Error(`OpenRouter video ${job.status}: ${detail}`);
      await logFailure(input, "openrouter", model, "video", body, err, t0);
      throw err;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollUrl = job.polling_url
      ? new URL(job.polling_url, "https://openrouter.ai").toString()
      : `https://openrouter.ai/api/v1/videos/${job.id}`;
    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: input.signal,
    });
    if (!pollResp.ok) {
      const text = await pollResp.text().catch(() => "");
      const err = new Error(`OpenRouter video poll ${pollResp.status}: ${text.slice(0, 500)}`);
      await logFailure(input, "openrouter", model, "video", body, err, t0);
      throw err;
    }
    job = (await pollResp.json()) as VideoJob;
  }

  if (job.status !== "completed") {
    const err = new Error(
      `OpenRouter video did not complete after ${pollMaxAttempts} polls (${pollIntervalMs}ms each); last status: ${job.status}`
    );
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }

  const dest = assetPath(input.projectId, "videos", `${input.slot}.mp4`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const downloadUrl =
    job.unsigned_urls?.[0] ??
    `https://openrouter.ai/api/v1/videos/${job.id}/content?index=0`;
  const dl = await fetch(downloadUrl, {
    headers: downloadUrl.startsWith("https://openrouter.ai/")
      ? { Authorization: `Bearer ${apiKey}` }
      : undefined,
    signal: input.signal,
  });
  if (!dl.ok) {
    const text = await dl.text().catch(() => "");
    const err = new Error(`OpenRouter video download ${dl.status}: ${text.slice(0, 200)}`);
    await logFailure(input, "openrouter", model, "video", body, err, t0);
    throw err;
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  await protectExistingAsset(dest, input.overwrite);
  await fs.writeFile(dest, buf);

  const pricePerSec = VIDEO_PRICE_PER_SEC[model] ?? 0.14;
  const result: GenerateResult = {
    url: downloadUrl,
    localPath: dest,
    costUsd: pricePerSec * input.durationSec,
    latencyMs: Date.now() - t0,
    model,
  };
  await logGeneration(input.projectId, {
    provider: "openrouter",
    endpoint: model,
    kind: "video",
    input: {
      prompt: input.prompt,
      duration_sec: input.durationSec,
      aspect_ratio: aspectRatio,
      resolution,
      image: input.image ? "[ref-supplied]" : undefined,
    },
    output: { url: downloadUrl, local: dest, job_id: job.id },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    note: input.note ?? input.slot,
  });
  return result;
}

async function resolveImageRef(ref: string): Promise<string> {
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("data:")) {
    return ref;
  }
  const buf = await fs.readFile(ref);
  const ext = path.extname(ref).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
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
  await protectExistingAsset(localPath, input.overwrite);
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
  await protectExistingAsset(localPath, input.overwrite);
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
// Sound effects (ElevenLabs Sound Generation)
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateSfxInput = CommonInput & {
  prompt: string;
  /** Length in seconds. ElevenLabs accepts 0.5–22s. Default 4. */
  durationSec?: number;
  /** Higher = stricter to prompt, lower = more creative variation. 0–1. */
  promptInfluence?: number;
};

export async function generateSfx(input: GenerateSfxInput): Promise<GenerateResult> {
  requireCapability("voiceover-elevenlabs");
  const t0 = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const modelId = "sound_generation_v2";
  const duration = Math.max(0.5, Math.min(22, input.durationSec ?? 4));

  const body: Record<string, unknown> = {
    text: input.prompt,
    duration_seconds: duration,
    prompt_influence: input.promptInfluence ?? 0.4,
    output_format: "mp3_44100_128",
  };

  let resp: Response;
  try {
    resp = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
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
    await logFailure(input, "elevenlabs", modelId, "sfx", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`ElevenLabs Sound-Gen ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, "elevenlabs", modelId, "sfx", body, err, t0);
    throw err;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const localPath = assetPath(input.projectId, "sfx", `${input.slot}.mp3`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await protectExistingAsset(localPath, input.overwrite);
  await fs.writeFile(localPath, buf);

  const result: GenerateResult = {
    localPath,
    costUsd: 0,
    latencyMs: Date.now() - t0,
    model: modelId,
  };
  await logGeneration(input.projectId, {
    provider: "elevenlabs",
    endpoint: "sound-generation",
    kind: "sfx",
    input: { prompt: input.prompt, duration_seconds: duration, prompt_influence: body.prompt_influence },
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

/**
 * Append-only protection for asset slots. Before any generator overwrites
 * `destPath`, archive the existing file to `<base>.v{N}<ext>` where N is the
 * next free version number. Caller passes `overwrite=true` to bypass.
 *
 * Returns the archived path (or null if nothing existed or overwrite was opted-in).
 * Emits a stderr line so the agent / user can see what happened.
 *
 * Cross-cutting fix: 6 of 10 postmortems traced lost artifacts to silent overwrite.
 */
async function protectExistingAsset(
  destPath: string,
  overwrite: boolean | undefined,
): Promise<string | null> {
  if (overwrite) return null;
  try {
    await fs.access(destPath);
  } catch {
    return null;
  }
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);
  // Find the highest existing <base>.v{N}<ext> so we don't clobber a previous archive.
  let maxV = 0;
  try {
    const siblings = await fs.readdir(dir);
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedExt = ext.replace(/\./g, "\\.");
    const rx = new RegExp(`^${escapedBase}\\.v(\\d+)${escapedExt}$`);
    for (const s of siblings) {
      const m = rx.exec(s);
      if (m) maxV = Math.max(maxV, Number(m[1]));
    }
  } catch {
    // dir doesn't exist? unreachable since destPath exists; defensive only.
  }
  const archivedPath = path.join(dir, `${base}.v${maxV + 1}${ext}`);
  await fs.rename(destPath, archivedPath);
  // eslint-disable-next-line no-console
  console.error(
    `ralphy: existing asset auto-archived → ${archivedPath} (pass --force-overwrite to disable)`,
  );
  return archivedPath;
}

async function downloadTo(url: string, dest: string): Promise<string> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download ${resp.status} on ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

async function writeImageFromUrlOrDataUri(
  urlOrDataUri: string,
  dest: string
): Promise<string> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (urlOrDataUri.startsWith("data:")) {
    const comma = urlOrDataUri.indexOf(",");
    if (comma === -1) throw new Error("Malformed data: URI in image response");
    const meta = urlOrDataUri.slice(5, comma);
    const payload = urlOrDataUri.slice(comma + 1);
    const isBase64 = /;base64$/i.test(meta);
    const buf = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    await fs.writeFile(dest, buf);
    return dest;
  }
  return downloadTo(urlOrDataUri, dest);
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
