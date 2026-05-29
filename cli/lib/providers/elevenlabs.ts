// ElevenLabs connector — the default voice / music / sfx engine.
//
// Implements the `RalphyConnector` contract (cli/lib/providers/types.ts). One
// ElevenLabs key unlocks TTS voiceover (eleven_multilingual_v2 / eleven_v3),
// the Music endpoint (instrumental beds), and Sound Generation (sfx). Gates on
// its OWN env var — the call path doesn't hardcode an ElevenLabs capability id.

import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { logGeneration } from "../gen-log.js";
import {
  assetPath,
  protectExistingAsset,
  logFailure,
  requireProviderKey,
  retryTransient,
  TerminalProviderError,
  TransientPayloadError,
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

// ─── per-slot file lock + ffprobe-verify (#039) ──────────────────────────────
//
// Background: even with the #007 semaphore in place (TTS capped at 3
// in-process), two parallel `generateVoiceover` calls that target the SAME
// destination path (same project + same slot — e.g. an external batcher firing
// `ralphy generate voiceover ...` twice for `scene-01-vo`) can race the
// `fs.writeFile` step and leave a corrupted mp3 on disk (ffprobe sees empty
// duration; ElevenLabs Scribe rejects it as "File is corrupted"). The semaphore
// throttles NETWORK calls, not local writes — and two same-path writers were
// previously unprotected.
//
// Strategy: in-process per-destination-path serialization. Second caller awaits
// the first via a Map keyed by absolute destination path. After the (now
// serialized) write completes, ffprobe asserts duration > 0 and a readable
// audio codec. A 0-byte / unreadable result throws TransientPayloadError so
// the outer retryTransient() loop retries once before giving up.
//
// ffprobe missing on the host: verify is a graceful no-op (one-shot stderr
// warning). The lock still runs — that's the load-bearing half of the fix.

/** In-process write locks keyed by absolute destination path. */
const slotWriteLocks = new Map<string, Promise<unknown>>();

/** Reset the slot-lock map. Tests use this to start from a clean slate. */
export function _resetSlotWriteLocks(): void {
  slotWriteLocks.clear();
}

/**
 * Serialize concurrent writes to the same destination path. Second caller
 * awaits the first; on completion (success OR failure) the lock is cleared so
 * the next caller starts fresh.
 */
async function withSlotLock<T>(destPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = slotWriteLocks.get(destPath);
  if (prev) {
    // Wait for the in-flight write to complete (or fail) before we start ours.
    try {
      await prev;
    } catch {
      /* The prior write's error belongs to its own caller — we just need the slot freed. */
    }
  }
  const run = (async () => fn())();
  slotWriteLocks.set(destPath, run);
  try {
    return await run;
  } finally {
    // Clear only if our run is still the registered one — a later caller may have
    // already chained onto a successor.
    if (slotWriteLocks.get(destPath) === run) {
      slotWriteLocks.delete(destPath);
    }
  }
}

let ffprobeMissingWarned = false;

/**
 * Verify an audio file on disk via ffprobe. Returns:
 *  - `{ ok: true }` when ffprobe reports duration > 0 and an audio codec.
 *  - `{ ok: false, reason }` when ffprobe ran and rejected the file.
 *  - `{ ok: true, skipped: true }` when ffprobe is missing (graceful skip + warn once).
 *
 * Called after the mp3 lands on disk. A `false` result triggers a
 * TransientPayloadError so retryTransient retries once before failing hard.
 */
export function verifyAudioFile(
  filePath: string,
): { ok: true; skipped?: boolean } | { ok: false; reason: string } {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name:format=duration",
      "-of",
      "default=nw=1:nk=0",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    if (!ffprobeMissingWarned) {
      ffprobeMissingWarned = true;
      // eslint-disable-next-line no-console
      console.error(
        "ralphy: ffprobe not found — skipping voiceover audio-verify pass. " +
          "Install ffmpeg (which bundles ffprobe) to catch corrupted mp3 writes.",
      );
    }
    return { ok: true, skipped: true };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    return {
      ok: false,
      reason: stderr.slice(0, 200) || `ffprobe exit ${result.status}`,
    };
  }
  const stdout = (result.stdout ?? "").trim();
  const codecMatch = stdout.match(/codec_name=(\S+)/);
  const durationMatch = stdout.match(/duration=([0-9.]+)/);
  if (!codecMatch) {
    return { ok: false, reason: `no audio codec stream found (probe: ${stdout.slice(0, 120)})` };
  }
  if (!durationMatch || Number(durationMatch[1]) <= 0) {
    return {
      ok: false,
      reason: `duration <= 0 (probe: ${stdout.slice(0, 120)})`,
    };
  }
  return { ok: true };
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

  const localPath = assetPath(input.projectId, "voiceover", `${input.slot}.mp3`);

  // #039: per-slot file lock — two parallel calls targeting the same dest path
  // serialize their write+verify pass. The lock wraps the ENTIRE retryTransient
  // loop because a partial write from caller A would otherwise be observed by
  // caller B's verify pass mid-flight. The #007 concurrency semaphore inside
  // retryTransient handles cross-slot fan-out independently.
  const tts = await withSlotLock(localPath, () =>
    // #005: wrap the TTS POST in transient-error retry. 4xx → terminal, 5xx /
    // TLS / ECONNRESET → 2-retry exponential backoff. Voice-existence preflight
    // is OUTSIDE this loop on purpose — a 404 voice id is a terminal config
    // error, not a network blip.
    //
    // #039: write + ffprobe-verify happen INSIDE the retry loop so a corrupted
    // mp3 (0-duration / unreadable codec) throws TransientPayloadError and gets
    // one retry before failing hard. The existing-asset auto-archive happens
    // ONCE outside the loop — otherwise a retry would v-bump the same archive
    // every attempt.
    (async () => {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await protectExistingAsset(localPath, input.overwrite);
      return retryTransient<{ buf: Buffer; attempt: number }>(
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
          const buf = Buffer.from(await resp.arrayBuffer());

          // Write to disk THEN verify. Write-then-verify (vs. verify-buf-in-memory)
          // catches partial-flush / filesystem-truncation classes too — the
          // failure mode in #039 is a corrupted file on disk, not a corrupted
          // buffer.
          await fs.writeFile(localPath, buf);
          const verify = verifyAudioFile(localPath);
          if (!verify.ok) {
            throw new TransientPayloadError(
              `ElevenLabs TTS returned audio that ffprobe rejected at ${localPath}: ${verify.reason}. ` +
                `Bytes written: ${buf.length}. Treating as transient and retrying once.`,
            );
          }
          return { buf, attempt };
        },
        {
          noRetry: input.noRetry,
          onTransientFailure: async (err, attempt) => {
            await logFailure(input, ID, modelId, "voiceover", body, err, t0, attempt);
          },
        },
      );
    })(),
  );
  const buf = tts.buf;

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
        // #006: parse the ToS rejection envelope. Real shape from the wire is
        // `{detail:{message,data:{prompt_suggestion}}}` (HTTP 400 `bad_prompt`).
        // Some adjacent 4xx responses use the same envelope without
        // `prompt_suggestion`, so missing-field is normal — leave it undefined.
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
          throw new TerminalProviderError(message, { promptSuggestion });
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
