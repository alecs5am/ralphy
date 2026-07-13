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
import { generationDestination } from "../generation-destination.js";
import { loadConfig, getNestedValue } from "../config.js";
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
import { voiceoverCostUsd } from "./voice-pricing.js";
import { compressVoiceSample } from "../ffmpeg-recipes.js";
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
const DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1";
const UA = "Mozilla/5.0 (compatible; ralphy/1.0)";

function requireKey(): void {
  requireProviderKey({ envVar: ENV_VAR, label: LABEL, signupUrl: SIGNUP_URL });
}

// ─── base-URL resolver (#121) ─────────────────────────────────────────────────
//
// From a geo-blocked region the ElevenLabs API returns HTTP 200 with an HTML
// body (no 403). The fix has two halves: a guard that refuses to write a
// non-audio body (assertAudioResponse below), and a transport swap so a user in
// a blocked region can route every call through a non-blocked proxy WITHOUT a
// new code path — same verbs, same artifact paths, same gen-log rows.
//
// Resolution order mirrors the repo's existing override convention
// (`RALPHY_LIBRARY_URL` in library/client.ts, `RALPHY_ASSETS_MANIFEST_URL` in
// assets-repo.ts — env override → default), extended with a persisted
// config.json key so `ralphy config set elevenlabsBaseUrl <url>` sticks:
//   1. RALPHY_ELEVENLABS_BASE_URL env var  (per-session / CI override)
//   2. config.json `elevenlabsBaseUrl`     (persisted user setting)
//   3. https://api.elevenlabs.io/v1        (default)
//
// The proxy host / credentials live ONLY in user config — never committed.
// Trailing slashes are trimmed so callers can append `/text-to-speech/...` etc.
export async function elevenLabsBaseUrl(): Promise<string> {
  const fromEnv = process.env.RALPHY_ELEVENLABS_BASE_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/+$/, "");
  try {
    const cfg = await loadConfig();
    const fromCfg = getNestedValue(cfg, "elevenlabsBaseUrl");
    if (typeof fromCfg === "string" && fromCfg.trim()) {
      return fromCfg.trim().replace(/\/+$/, "");
    }
  } catch {
    /* config unreadable — fall through to default */
  }
  return DEFAULT_BASE_URL;
}

/** True when a non-default (proxy) base URL is configured — used to tailor the geoblock message. */
async function proxyConfigured(): Promise<boolean> {
  return (await elevenLabsBaseUrl()) !== DEFAULT_BASE_URL;
}

// ─── geo-block guard (#121) ───────────────────────────────────────────────────
//
// Error thrown when an audio endpoint returns a non-audio body. Carries
// `code: "E_GEOBLOCK"` so the top-level handler in cli/index.ts maps it to the
// catalog error (cf. the E_LEGACY_LAYOUT pattern). Extends TerminalProviderError
// so `retryTransient()` does NOT retry — a geo-block won't resolve on retry, and
// retrying would only burn time and re-trigger the guard.
export class GeoblockError extends TerminalProviderError {
  readonly code = "E_GEOBLOCK" as const;
  /** Provider label, surfaced into the catalog message. */
  readonly provider: string;
  /** Short reason string (content-type / magic-byte mismatch), surfaced into the message. */
  readonly reason: string;
  constructor(provider: string, reason: string, message: string) {
    super(message);
    this.name = "GeoblockError";
    this.provider = provider;
    this.reason = reason;
  }
}

/** Audio container magic bytes we accept: ID3 / mp3 frame-sync / RIFF (wav) / OggS / fLaC. */
function looksLikeAudio(buf: Buffer): boolean {
  if (buf.length < 2) return false;
  // ID3v2 tag ("ID3") — typical for ElevenLabs mp3 output.
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // Raw MPEG audio frame sync: 0xFF followed by 0xE_/0xF_ (11 sync bits set).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // "RIFF" (wav).
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  // "OggS".
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;
  // "fLaC".
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) return true;
  return false;
}

/**
 * Guard EVERY audio response BEFORE it touches disk (#121). From a geo-blocked
 * region ElevenLabs answers 200 with an HTML/JSON body; the old code wrote that
 * to a corrupt `.mp3` and reported success. This refuses any response whose
 * `Content-Type` is non-audio OR whose leading bytes are not a known audio
 * container, throwing GeoblockError (→ E_GEOBLOCK) so NOTHING is written.
 *
 * One helper, called at all four audio-write sites (TTS, audio-isolation,
 * music, sfx) — do not inline the check per site.
 */
export async function assertAudioResponse(resp: Response, buf: Buffer): Promise<void> {
  const ctype = (resp.headers.get("content-type") ?? "").toLowerCase();
  const nonAudioCtype =
    ctype !== "" &&
    !ctype.startsWith("audio/") &&
    !ctype.startsWith("application/octet-stream") &&
    (ctype.includes("html") ||
      ctype.includes("text/") ||
      ctype.includes("json") ||
      ctype.includes("xml"));
  const badMagic = !looksLikeAudio(buf);

  if (!nonAudioCtype && !badMagic) return;

  const reasonParts: string[] = [];
  if (nonAudioCtype) reasonParts.push(`content-type ${ctype || "(empty)"}`);
  if (badMagic) {
    const head = buf.subarray(0, 4).toString("hex");
    reasonParts.push(`leading bytes 0x${head || "(empty)"} not an audio container`);
  }
  const reason = reasonParts.join("; ");

  const usingProxy = await proxyConfigured();
  const nextStep = usingProxy
    ? `The configured proxy (RALPHY_ELEVENLABS_BASE_URL / config key elevenlabsBaseUrl) itself returned a non-audio body — check that the proxy is reachable and forwarding to ElevenLabs.`
    : `This is the geo-block failure mode. Route through a non-blocked proxy by setting RALPHY_ELEVENLABS_BASE_URL=<proxy-base-url> (or persist it with \`ralphy config set elevenlabsBaseUrl <proxy-base-url>\`), then re-run. Proxy host / credentials live in your config only.`;

  throw new GeoblockError(
    LABEL,
    reason,
    `${LABEL} returned a non-audio response (${reason}); refusing to write a corrupt audio file. ${nextStep}`,
  );
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
  const baseUrl = await elevenLabsBaseUrl();
  const resp = await fetch(`${baseUrl}/voices/${encodeURIComponent(voiceId)}`, {
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

  const baseUrl = await elevenLabsBaseUrl();
  const localPath = assetPath(input, "voiceover", `${input.slot}.mp3`);

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
              fetch(`${baseUrl}/text-to-speech/${input.voiceId}`, {
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

          // #121: geo-block guard BEFORE any disk write — a non-audio body
          // (HTML/JSON from a geo-blocked region answering 200) throws
          // GeoblockError (→ E_GEOBLOCK) and writes nothing.
          await assertAudioResponse(resp, buf);

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

  // #030: best-effort per-call cost estimate. ElevenLabs bills via subscription
  // pool, NOT per-call invoice — this is the $/1k-chars-tier rate applied to
  // this call so VO rows are directly comparable to image/video rows in the
  // gen-log rollup. See voice-pricing.ts for the model→rate map.
  const costUsd = voiceoverCostUsd(input.text.length, modelId);

  const result: GenerateResult = {
    localPath,
    costUsd,
    latencyMs: Date.now() - t0,
    model: modelId,
  };
  await logGeneration(generationDestination(input), {
    slot: input.slot,
    provider: ID,
    model: modelId,
    endpoint: `tts/${modelId}`,
    kind: "voiceover",
    input: {
      slot: input.slot,
      project: input.projectId,
      voice_id: input.voiceId,
      text_chars: input.text.length,
      model_id: modelId,
      voice_settings: body.voice_settings,
    },
    output: { local: localPath, bytes: buf.length },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: costUsd,
    attempt: tts.attempt,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─── voice clone (Instant Voice Cloning) ─────────────────────────────────────
//
// Wraps `/v1/voices/add` (Instant Voice Cloning). Optional pre-pass through
// `/v1/audio-isolation` strips background music / noise so the voiceprint is
// clean. `remove_background_noise=true` is forced on the `voices/add` body by
// default — postmortem #030 (choose-your-guide-001 GAP-14) cites this as
// tribal knowledge agents kept missing when they fell back to raw curl.
//
// Concurrency: same `voice-clone` semaphore key for both the isolation and
// the add step. Cap = 2 — ElevenLabs doesn't document a hard cap on voice
// management endpoints but PUT /v1/voices/add is heavier than a TTS call
// (it kicks off a server-side fingerprint job) and 3+ in parallel has been
// observed to 429 occasionally.

/**
 * ElevenLabs `voices/add` rejects uploads over 11 MB with
 * `upload_file_size_exceeded`. An `/audio-isolation` pass on a long source can
 * balloon past this (#495), so we compress before submitting.
 */
const VOICE_ADD_MAX_BYTES = 11 * 1024 * 1024;

export type CloneVoiceInput = {
  projectId?: string;
  /** Local path to the source audio sample (mp3 / wav / m4a). */
  fromPath: string;
  /** Display name for the new voice. */
  name: string;
  /** Optional description stored on the ElevenLabs voice. */
  description?: string;
  /** Comma-separated labels (e.g. `accent=neutral,age=young`). */
  labels?: Record<string, string>;
  /**
   * Pre-process the source through `/v1/audio-isolation` to strip background
   * music / noise before submitting to `voices/add`. Off by default — the
   * `voices/add` endpoint already runs its own light denoiser via
   * `remove_background_noise=true`, so isolation is opt-in for the harder
   * cases (location recording, footage rip, podcast clip with bed music).
   */
  isolate?: boolean;
  /**
   * Force `remove_background_noise=false` on the `voices/add` request. Default
   * is true (server-side denoise on). Off only when the user explicitly wants
   * to preserve roomtone characteristics in the voiceprint.
   */
  denoise?: boolean;
  signal?: AbortSignal;
};

export type CloneVoiceResult = {
  voiceId: string;
  name: string;
  /** Path the isolated audio was written to (if --isolate). */
  isolatedPath?: string;
  latencyMs: number;
  costUsd: number;
};

export async function cloneVoice(input: CloneVoiceInput): Promise<CloneVoiceResult> {
  requireKey();
  const t0 = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY!;

  // Validate the input file exists and is non-empty before we burn an upload.
  const stat = await fs.stat(input.fromPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`voice clone: source audio not found at ${input.fromPath}`);
  }
  if (stat.size === 0) {
    throw new Error(`voice clone: source audio at ${input.fromPath} is 0 bytes`);
  }

  const baseUrl = await elevenLabsBaseUrl();
  let uploadPath = input.fromPath;
  let isolatedPath: string | undefined;

  // Optional pre-pass: /v1/audio-isolation strips background music / noise.
  // Output goes next to the source as `<basename>.isolated.mp3`.
  if (input.isolate) {
    const sourceBuf = await fs.readFile(input.fromPath);
    const form = new FormData();
    form.append(
      "audio",
      new Blob([sourceBuf], { type: "audio/mpeg" }),
      path.basename(input.fromPath),
    );
    const isoResp = await withConcurrency(ID, "voice-clone", "voice", () =>
      fetch(`${baseUrl}/audio-isolation`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "User-Agent": UA,
        },
        body: form,
        signal: input.signal,
      }),
    );
    if (!isoResp.ok) {
      const text = await isoResp.text().catch(() => "");
      throw new Error(`ElevenLabs audio-isolation ${isoResp.status}: ${text.slice(0, 400)}`);
    }
    const isoBuf = Buffer.from(await isoResp.arrayBuffer());
    // #121: guard the isolated audio body before writing it to disk.
    await assertAudioResponse(isoResp, isoBuf);
    const ext = path.extname(input.fromPath) || ".mp3";
    const base = path.basename(input.fromPath, ext);
    isolatedPath = path.join(path.dirname(input.fromPath), `${base}.isolated${ext}`);
    await fs.writeFile(isolatedPath, isoBuf);
    uploadPath = isolatedPath;
  }

  // #495: if the file we're about to upload exceeds the voices/add limit,
  // derive a compliant sample (≤90s of speech, mono, low-bitrate MP3) and
  // submit THAT. Append-only: the compressed sample is a NEW path, the source
  // and isolated artifacts are untouched. Under-limit files pass through as-is.
  let compressedPath: string | undefined;
  const uploadStat = await fs.stat(uploadPath).catch(() => null);
  if (uploadStat && uploadStat.size > VOICE_ADD_MAX_BYTES) {
    const ext = path.extname(uploadPath);
    const base = path.basename(uploadPath, ext);
    compressedPath = path.join(path.dirname(uploadPath), `${base}.clone-sample.mp3`);
    await compressVoiceSample({
      src: uploadPath,
      dst: compressedPath,
      projectId: input.projectId,
      note: `voice-clone sample compressed under ${VOICE_ADD_MAX_BYTES}-byte voices/add limit (#495)`,
    });
    uploadPath = compressedPath;
  }

  // POST /v1/voices/add — multipart form with files[], name, description,
  // labels (JSON), remove_background_noise.
  const removeNoise = input.denoise === false ? false : true;
  const sampleBuf = await fs.readFile(uploadPath);
  const addForm = new FormData();
  addForm.append("name", input.name);
  if (input.description) addForm.append("description", input.description);
  if (input.labels) addForm.append("labels", JSON.stringify(input.labels));
  addForm.append("remove_background_noise", String(removeNoise));
  addForm.append(
    "files",
    new Blob([sampleBuf], { type: "audio/mpeg" }),
    path.basename(uploadPath),
  );

  const resp = await withConcurrency(ID, "voice-clone", "voice", () =>
    fetch(`${baseUrl}/voices/add`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "User-Agent": UA,
      },
      body: addForm,
      signal: input.signal,
    }),
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs voices/add ${resp.status}: ${text.slice(0, 400)}`);
  }
  const json = (await resp.json()) as { voice_id?: string; requires_verification?: boolean };
  if (!json.voice_id) {
    throw new Error(`ElevenLabs voices/add returned no voice_id: ${JSON.stringify(json).slice(0, 300)}`);
  }

  // Invalidate the in-process voice-exists cache so subsequent
  // `generateVoiceover` calls don't have a stale-miss on the new voice id.
  voiceExistsCache.set(json.voice_id, true);

  const result: CloneVoiceResult = {
    voiceId: json.voice_id,
    name: input.name,
    isolatedPath,
    latencyMs: Date.now() - t0,
    costUsd: 0, // clone is a one-shot setup, not metered per-call
  };

  // Log to the project's gen-log when a projectId is supplied. Without a
  // project the clone is a one-off setup action — still useful in stderr,
  // just not append-only-logged.
  if (input.projectId) {
    await logGeneration(generationDestination(input), {
      slot: `voice-clone-${json.voice_id}`,
      provider: ID,
      model: "voices/add",
      endpoint: "voices/add",
      kind: "audio",
      input: {
        project: input.projectId,
        from_path: input.fromPath,
        name: input.name,
        isolate: !!input.isolate,
        remove_background_noise: removeNoise,
        isolated_sample: isolatedPath,
        compressed_sample: compressedPath,
      },
      output: { local: uploadPath },
      status: "ok",
      latency_ms: result.latencyMs,
      cost_usd: 0,
      request_id: json.voice_id,
      note: `voice clone: ${input.name}`,
    });
  }

  return result;
}

// ─── voice design (text-to-voice) ─────────────────────────────────────────────
//
// Wraps POST /v1/text-to-voice/design (generate a preview SET from a text
// description) + POST /v1/text-to-voice (freeze one preview into a permanent
// library voice). Training-path-only by design: a HUMAN picks the preview by
// EAR (memory feedback_character_voice_design_previews_user_pick), so there is
// deliberately only the `ralphy voice design` / `ralphy voice create` verb pair.

export type DesignVoiceInput = {
  /** Voice description, 20-1000 chars (accent, age, tone, pacing, vibe). */
  description: string;
  /** Sample text the previews read, 100-1000 chars. Omitted → auto-generated to match the description. */
  text?: string;
  /** TTV model id. */
  model?: string;
  /** Directory the preview mp3s are written to. */
  outDir: string;
  /** Filename stem for the previews (`<stem>-1.mp3` …). */
  stem?: string;
  projectId?: string;
  signal?: AbortSignal;
};

export type DesignVoicePreview = {
  generatedVoiceId: string;
  path: string;
  durationSecs?: number;
};

export type DesignVoiceResult = {
  previews: DesignVoicePreview[];
  /** The text the previews actually read (auto-generated when input.text was omitted). */
  text?: string;
  latencyMs: number;
};

export async function designVoice(input: DesignVoiceInput): Promise<DesignVoiceResult> {
  requireKey();
  const t0 = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const baseUrl = await elevenLabsBaseUrl();

  const resp = await withConcurrency(ID, "voice-design", "voice", () =>
    fetch(`${baseUrl}/text-to-voice/design`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        voice_description: input.description,
        model_id: input.model ?? "eleven_multilingual_ttv_v2",
        ...(input.text ? { text: input.text } : { auto_generate_text: true }),
      }),
      signal: input.signal,
    }),
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs text-to-voice/design ${resp.status}: ${text.slice(0, 400)}`);
  }
  const json = (await resp.json()) as {
    previews?: Array<{ audio_base_64?: string; generated_voice_id?: string; duration_secs?: number }>;
    text?: string;
  };
  if (!json.previews?.length) {
    throw new Error(`ElevenLabs text-to-voice/design returned no previews: ${JSON.stringify(json).slice(0, 300)}`);
  }

  await fs.mkdir(input.outDir, { recursive: true });
  const stem = input.stem ?? "voice-design-preview";
  const previews: DesignVoicePreview[] = [];
  for (const [i, p] of json.previews.entries()) {
    if (!p.audio_base_64 || !p.generated_voice_id) continue;
    const buf = Buffer.from(p.audio_base_64, "base64");
    const dst = path.join(input.outDir, `${stem}-${i + 1}.mp3`);
    await fs.writeFile(dst, buf);
    previews.push({ generatedVoiceId: p.generated_voice_id, path: dst, durationSecs: p.duration_secs });
  }
  if (!previews.length) {
    throw new Error("ElevenLabs text-to-voice/design previews carried no audio/generated_voice_id");
  }

  const result: DesignVoiceResult = { previews, text: json.text, latencyMs: Date.now() - t0 };
  if (input.projectId) {
    await logGeneration(generationDestination(input), {
      slot: `voice-design-${stem}`,
      provider: ID,
      model: input.model ?? "eleven_multilingual_ttv_v2",
      endpoint: "text-to-voice/design",
      kind: "audio",
      input: {
        project: input.projectId,
        voice_description: input.description,
        text: input.text,
        preview_ids: previews.map((p) => p.generatedVoiceId),
        preview_paths: previews.map((p) => p.path),
      },
      output: { local: previews[0].path },
      status: "ok",
      latency_ms: result.latencyMs,
      cost_usd: 0,
      note: `voice design: ${input.description.slice(0, 120)}`,
    });
  }
  return result;
}

export type CreateVoiceFromPreviewInput = {
  /** `generated_voice_id` of the picked preview (from designVoice). */
  generatedVoiceId: string;
  /** Display name for the new library voice. */
  name: string;
  /** Voice description — required by the ElevenLabs create endpoint. */
  description: string;
  projectId?: string;
  signal?: AbortSignal;
};

export async function createVoiceFromPreview(
  input: CreateVoiceFromPreviewInput,
): Promise<{ voiceId: string; name: string; latencyMs: number }> {
  requireKey();
  const t0 = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const baseUrl = await elevenLabsBaseUrl();

  const resp = await withConcurrency(ID, "voice-design", "voice", () =>
    fetch(`${baseUrl}/text-to-voice`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        voice_name: input.name,
        voice_description: input.description,
        generated_voice_id: input.generatedVoiceId,
      }),
      signal: input.signal,
    }),
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs text-to-voice (create from preview) ${resp.status}: ${text.slice(0, 400)}`);
  }
  const json = (await resp.json()) as { voice_id?: string };
  if (!json.voice_id) {
    throw new Error(`ElevenLabs text-to-voice returned no voice_id: ${JSON.stringify(json).slice(0, 300)}`);
  }
  voiceExistsCache.set(json.voice_id, true);

  if (input.projectId) {
    await logGeneration(generationDestination(input), {
      slot: `voice-create-${json.voice_id}`,
      provider: ID,
      model: "text-to-voice",
      endpoint: "text-to-voice",
      kind: "audio",
      input: { project: input.projectId, generated_voice_id: input.generatedVoiceId, name: input.name },
      status: "ok",
      latency_ms: Date.now() - t0,
      cost_usd: 0,
      request_id: json.voice_id,
      note: `voice create from preview: ${input.name}`,
    });
  }
  return { voiceId: json.voice_id, name: input.name, latencyMs: Date.now() - t0 };
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

  const baseUrl = await elevenLabsBaseUrl();

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
          fetch(`${baseUrl}/music`, {
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
      const buf = Buffer.from(await resp.arrayBuffer());
      // #121: geo-block guard before the buffer escapes the response context.
      await assertAudioResponse(resp, buf);
      return { buf, attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, modelId, "music", body, err, t0, attempt);
      },
    },
  );
  const buf = music.buf;
  const localPath = assetPath(input, "music", `${input.slot}.mp3`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await protectExistingAsset(localPath, input.overwrite);
  await fs.writeFile(localPath, buf);

  const result: GenerateResult = {
    localPath,
    costUsd: 0, // subscription billing
    latencyMs: Date.now() - t0,
    model: modelId,
  };
  await logGeneration(generationDestination(input), {
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

  const baseUrl = await elevenLabsBaseUrl();
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/sound-generation`, {
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
  // #121: geo-block guard BEFORE any disk write. Log the failure row (matching
  // the other sfx error paths) then rethrow so nothing is written.
  try {
    await assertAudioResponse(resp, buf);
  } catch (err) {
    await logFailure(input, ID, modelId, "sfx", body, err, t0);
    throw err;
  }
  const localPath = assetPath(input, "sfx", `${input.slot}.mp3`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await protectExistingAsset(localPath, input.overwrite);
  await fs.writeFile(localPath, buf);

  const result: GenerateResult = {
    localPath,
    costUsd: 0,
    latencyMs: Date.now() - t0,
    model: modelId,
  };
  await logGeneration(generationDestination(input), {
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
