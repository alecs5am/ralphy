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
  retryTransient,
  TerminalProviderError,
} from "./shared.js";
import { withConcurrency } from "./concurrency.js";
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

// ─── voice-exists pre-flight (#051) ───────────────────────────────────────────
//
// `analog-horror-fridge-001` postmortem: a community voice id silently
// disappeared between sessions; the next `generate voiceover` call returned 404
// mid-batch and the loudnorm step then double-normed old files because regen
// failed silently. The fix: fetch GET /v1/voices/<id> before submitting a TTS
// request, throw a clean error if 404. Cached per-process to avoid hammering
// the endpoint on a batch of N clips that share one voice id.

const voiceExistsCache = new Map<string, boolean>();

/** Reset the in-process voice-exists cache. Tests use this. */
export function _resetVoiceExistsCache(): void {
  voiceExistsCache.clear();
}

export async function ensureVoiceExists(voiceId: string, signal?: AbortSignal): Promise<void> {
  if (voiceExistsCache.get(voiceId) === true) return;
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const resp = await fetch(`${BASE_URL}/voices/${encodeURIComponent(voiceId)}`, {
    method: "GET",
    headers: { "xi-api-key": apiKey, "User-Agent": UA },
    signal,
  });
  if (resp.status === 404) {
    throw new Error(
      `ElevenLabs voice not in library: ${voiceId}. Run \`ralphy voice list\` for your voices, or \`ralphy voice exists ${voiceId}\` for a one-shot probe.`,
    );
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs voices ${resp.status}: ${body.slice(0, 400)}`);
  }
  voiceExistsCache.set(voiceId, true);
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

  // #051: voice-existence pre-flight. Fail fast with a clean error if the voice
  // id no longer resolves (community-voice deletion, typo, library wipe).
  await ensureVoiceExists(input.voiceId, input.signal);

  const body = {
    text: input.text,
    model_id: modelId,
    voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...input.voiceSettings },
    output_format: "mp3_44100_128",
  };

  // #005: wrap the TTS POST in transient-error retry. 4xx → terminal, 5xx /
  // TLS / ECONNRESET → 2-retry exponential backoff. Voice-existence preflight
  // is OUTSIDE this loop on purpose — a 404 voice id is a terminal config
  // error, not a network blip.
  const tts = await retryTransient<{ buf: Buffer; attempt: number }>(
    async (attempt) => {
      let resp: Response;
      try {
        // #007: hold a concurrency slot for the network call only. ElevenLabs
        // TTS free/starter caps at 3 concurrent; choose-your-guide-001 hit 6
        // hard-failed 429s with 9 parallel calls. Semaphore key is "tts" so
        // every voice / model on the TTS endpoint shares one cap.
        resp = await withConcurrency(ID, "tts", "voice", () =>
          fetch(`${BASE_URL}/text-to-speech/${input.voiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
              "User-Agent": UA,
            },
            body: JSON.stringify(body),
            signal: input.signal,
          }),
        );
      } catch (err) {
        throw err;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const message = `ElevenLabs TTS ${resp.status}: ${text.slice(0, 500)}`;
        if (resp.status >= 400 && resp.status < 500) {
          throw new TerminalProviderError(message);
        }
        throw new Error(message);
      }
      return { buf: Buffer.from(await resp.arrayBuffer()), attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, modelId, "voiceover", body, err, t0, attempt);
      },
    },
  );
  const buf = tts.buf;
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
    model: modelId,
    endpoint: `tts/${modelId}`,
    kind: "voiceover",
    input: { slot: input.slot, project: input.projectId, voice_id: input.voiceId, text_chars: input.text.length, model_id: modelId },
    output: { local: localPath, bytes: buf.length },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: 0,
    attempt: tts.attempt,
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

  // #005: wrap the Music POST in transient-error retry. 4xx (including 422
  // `bad_prompt` ToS — #006 owns the auto-resubmit) → terminal. 5xx / TLS /
  // socket → 2-retry backoff. The `promptSuggestion` rewrite stays on the
  // terminal-error path so callers see it on the first refusal.
  const music = await retryTransient<{ buf: Buffer; attempt: number }>(
    async (attempt) => {
      let resp: Response;
      try {
        // #007: ElevenLabs Music caps at 2 concurrent per subscription
        // (tokyo-y2k-001: 3 parallel → 1 hard-failed 429
        // `concurrent_limit_exceeded`). Semaphore key is the modelId so a
        // future `music_v2` gets its own cap entry in MODELS.md.
        resp = await withConcurrency(ID, modelId, "music", () =>
          fetch(`${BASE_URL}/music`, {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
              "User-Agent": UA,
            },
            body: JSON.stringify(body),
            signal: input.signal,
          }),
        );
      } catch (err) {
        throw err;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
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
        const message =
          `ElevenLabs Music ${resp.status}: ${text.slice(0, 500)}` +
          (promptSuggestion ? `\n  prompt_suggestion: ${promptSuggestion}` : "");
        if (resp.status >= 400 && resp.status < 500) {
          const err = new TerminalProviderError(message);
          if (promptSuggestion) {
            (err as Error & { promptSuggestion?: string }).promptSuggestion = promptSuggestion;
          }
          throw err;
        }
        const err = new Error(message);
        if (promptSuggestion) {
          (err as Error & { promptSuggestion?: string }).promptSuggestion = promptSuggestion;
        }
        throw err;
      }
      return { buf: Buffer.from(await resp.arrayBuffer()), attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, modelId, "music", body, err, t0, attempt);
      },
    },
  );
  const buf = music.buf;
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
    model: modelId,
    endpoint: "music",
    kind: "music",
    input: { slot: input.slot, project: input.projectId, prompt: input.prompt, music_length_ms: musicLengthMs, force_instrumental: body.force_instrumental },
    output: { local: localPath, bytes: buf.length },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: 0,
    attempt: music.attempt,
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
    model: modelId,
    endpoint: "sound-generation",
    kind: "sfx",
    input: { slot: input.slot, project: input.projectId, prompt: input.prompt, duration_seconds: duration, prompt_influence: body.prompt_influence },
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
