// ElevenLabs connector — the default voice / music / sfx engine.
//
// Implements the `RalphyConnector` contract (cli/lib/providers/types.ts). One
// ElevenLabs key unlocks TTS voiceover (eleven_multilingual_v2 / eleven_v3),
// the Music endpoint (instrumental beds), and Sound Generation (sfx). Gates on
// its OWN env var — the call path doesn't hardcode an ElevenLabs capability id.

import path from "node:path";
import fs from "node:fs/promises";
import { logGeneration } from "../gen-log.js";
import {
  assetPath,
  protectExistingAsset,
  logFailure,
  requireProviderKey,
} from "./shared.js";
import type {
  RalphyConnector,
  GenerateVoiceoverInput,
  GenerateMusicInput,
  GenerateSfxInput,
  GenerateResult,
} from "./types.js";

const ID = "elevenlabs";
const LABEL = "ElevenLabs";
const ENV_VAR = "ELEVENLABS_API_KEY";
const SIGNUP_URL = "https://elevenlabs.io/app/settings/api-keys";
const BASE_URL = "https://api.elevenlabs.io/v1";
const UA = "Mozilla/5.0 (compatible; ralphy/1.0)";

function requireKey(): void {
  requireProviderKey({ envVar: ENV_VAR, label: LABEL, signupUrl: SIGNUP_URL });
}

// ─── voiceover (TTS) ──────────────────────────────────────────────────────────

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.25,
  use_speaker_boost: true,
};

export async function generateVoiceover(input: GenerateVoiceoverInput): Promise<GenerateResult> {
  requireKey();
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
    resp = await fetch(`${BASE_URL}/text-to-speech/${input.voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, ID, modelId, "voiceover", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`ElevenLabs TTS ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, ID, modelId, "voiceover", body, err, t0);
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
    slot: input.slot,
    provider: ID,
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

// ─── music (ElevenLabs Music) ─────────────────────────────────────────────────

export async function generateMusic(input: GenerateMusicInput): Promise<GenerateResult> {
  requireKey();
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
    resp = await fetch(`${BASE_URL}/music`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, ID, modelId, "music", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    // ElevenLabs Music returns 422 `bad_prompt` ToS rejections with a `detail.data.prompt_suggestion`
    // field carrying a model-cleaned rewrite. Surface it as a structured property on the thrown
    // error so callers (skill code, CLI retry loops) can resubmit programmatically rather than
    // hand-rewriting. Three postmortems (playdate / skater / glitter-cream) hit this and wasted
    // 3 manual rewrites per session.
    let promptSuggestion: string | undefined;
    try {
      const parsed = JSON.parse(text) as {
        detail?: { data?: { prompt_suggestion?: string } } | string;
      };
      if (parsed?.detail && typeof parsed.detail === "object") {
        promptSuggestion = parsed.detail.data?.prompt_suggestion;
      }
    } catch {
      /* not JSON — leave promptSuggestion undefined */
    }
    const err = new Error(
      `ElevenLabs Music ${resp.status}: ${text.slice(0, 500)}` +
        (promptSuggestion ? `\n  prompt_suggestion: ${promptSuggestion}` : ""),
    );
    if (promptSuggestion) {
      (err as Error & { promptSuggestion?: string }).promptSuggestion = promptSuggestion;
    }
    await logFailure(input, ID, modelId, "music", body, err, t0);
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
    slot: input.slot,
    provider: ID,
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

// ─── sfx (ElevenLabs Sound Generation) ────────────────────────────────────────

export async function generateSfx(input: GenerateSfxInput): Promise<GenerateResult> {
  requireKey();
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
    resp = await fetch(`${BASE_URL}/sound-generation`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (err) {
    await logFailure(input, ID, modelId, "sfx", body, err, t0);
    throw err;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`ElevenLabs Sound-Gen ${resp.status}: ${text.slice(0, 500)}`);
    await logFailure(input, ID, modelId, "sfx", body, err, t0);
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
    slot: input.slot,
    provider: ID,
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

// ─── connector object ──────────────────────────────────────────────────────

export const elevenlabsConnector: RalphyConnector = {
  id: ID,
  label: LABEL,
  envVar: ENV_VAR,
  signupUrl: SIGNUP_URL,
  capabilities: ["voice", "music", "sfx", "transcribe"],
  available: () => Boolean(process.env[ENV_VAR]),
  generateVoiceover,
  generateMusic,
  generateSfx,
};
