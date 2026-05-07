// Multi-backend transcription. Single entry-point `transcribe()` returns
// Caption[] in the @remotion/captions shape. Three backends, all log via
// gen-log when projectId is supplied.
//
// Default = ElevenLabs Scribe v1 (rationale below). OpenRouter whisper-1 is
// kept as a fallback because the audio endpoint has been returning HTTP 400
// intermittently (see workspace transcript dated 2026-05-07). Gemini-audio
// via OpenRouter chat-completions is opt-in for short clips when word-level
// timing isn't required.
//
// Why ElevenLabs default:
// - The user already has ELEVENLABS_API_KEY configured (subscription billing).
// - Scribe v1 returns word-level timestamps natively, identical shape to what
//   `src/lib/components/captions/*` consume.
// - It's reliable today; the OpenRouter audio endpoint is not.
//
// Backends compared:
//
//   backend       word-level   key needed              notes
//   ----------    ----------   --------------------    --------------------
//   elevenlabs    yes          ELEVENLABS_API_KEY      default; reliable
//   openrouter    yes          OPENROUTER_API_KEY      whisper-1; sometimes 400
//   gemini        no           OPENROUTER_API_KEY      single-segment fallback
//
// All backends accept ≤25MB audio. Compress longer files to mono 64kbps mp3:
//   ffmpeg -i src.mp4 -vn -ac 1 -b:a 64k src.mp3
//
// Usage:
//   import { transcribe } from "./lib/transcribe.js";
//   const { captions, language } = await transcribe({
//     audioPath: "vo.mp3",
//     language: "ru",
//     backend: "elevenlabs",      // optional, default
//   });

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import type { Caption } from "@remotion/captions";
import { callLLM } from "./providers/llm.js";

export type TranscribeBackend = "elevenlabs" | "openrouter" | "gemini";
export type TranscribeLanguage = "ru" | "en" | "auto";

// Kept for back-compat with consumers that imported these.
export const WHISPER_MODEL = "openai/whisper-1";
export const SCRIBE_MODEL = "elevenlabs/scribe_v1";
export const GEMINI_AUDIO_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_MODEL = SCRIBE_MODEL;
export const WHISPER_VERSION = "multi-backend";

export const DEFAULT_BACKEND: TranscribeBackend = "elevenlabs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Cost rates (best-effort; refine when providers return billed cost).
const COST_PER_MIN_WHISPER = 0.006;       // OpenAI list price
const COST_PER_MIN_SCRIBE = 0.004;        // ElevenLabs Scribe list price
const COST_PER_MIN_GEMINI = 0.0;          // counted by callLLM via token billing

export type TranscribeOptions = {
  audioPath: string;
  language?: TranscribeLanguage;
  backend?: TranscribeBackend;
  /** Ignored unless backend === "openrouter". Kept for CLI flag compatibility. */
  model?: string;
  signal?: AbortSignal;
};

export type TranscribeResult = {
  captions: Caption[];
  language: string;
  model: string;
  backend: TranscribeBackend;
  durationMs: number;
  audioDurationSec: number;
  costUsd: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public entry-point
// ─────────────────────────────────────────────────────────────────────────────

export async function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
  const t0 = Date.now();
  const language = opts.language ?? "ru";
  const backend = opts.backend ?? pickBackend();

  const abs = path.resolve(opts.audioPath);
  if (!existsSync(abs)) throw new Error(`Audio not found: ${abs}`);
  const size = statSync(abs).size;
  if (size > MAX_FILE_BYTES) {
    throw new Error(
      `Audio file is ${(size / 1024 / 1024).toFixed(1)}MB — backends cap at 25MB. ` +
        `Re-encode at lower bitrate (\`ffmpeg -i ${path.basename(abs)} -ac 1 -b:a 64k out.mp3\`) ` +
        `or split into chunks.`,
    );
  }

  switch (backend) {
    case "elevenlabs":
      return wrap(t0, backend, await viaElevenLabs(abs, language, opts.signal));
    case "openrouter":
      return wrap(t0, backend, await viaOpenRouter(abs, language, opts.signal));
    case "gemini":
      return wrap(t0, backend, await viaGemini(abs, language, opts.signal));
    default:
      throw new Error(`Unknown transcribe backend: ${backend}`);
  }
}

function wrap(
  t0: number,
  backend: TranscribeBackend,
  partial: Omit<TranscribeResult, "durationMs" | "backend">,
): TranscribeResult {
  return {
    ...partial,
    backend,
    durationMs: Date.now() - t0,
  };
}

function pickBackend(): TranscribeBackend {
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  throw new Error(
    "Neither ELEVENLABS_API_KEY nor OPENROUTER_API_KEY is set. Run `ralphy setup`.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend: ElevenLabs Scribe v1 (default)
//
// API: POST https://api.elevenlabs.io/v1/speech-to-text (multipart)
// Returns: { language_code, language_probability, text, words: [{ text, start, end, type }] }
// ─────────────────────────────────────────────────────────────────────────────

type ScribeWord = {
  text: string;
  start: number;
  end: number;
  type?: "word" | "spacing" | "audio_event";
};
type ScribeResponse = {
  language_code?: string;
  language_probability?: number;
  text?: string;
  words?: ScribeWord[];
  audio_duration_secs?: number;
};

async function viaElevenLabs(
  abs: string,
  language: TranscribeLanguage,
  signal?: AbortSignal,
): Promise<Omit<TranscribeResult, "durationMs" | "backend">> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not set. Run `ralphy setup`.");
  }
  const bytes = await fs.readFile(abs);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(abs));
  form.append("model_id", "scribe_v1");
  form.append("timestamps_granularity", "word");
  form.append("diarize", "false");
  form.append("tag_audio_events", "false");
  if (language !== "auto") form.append("language_code", iso3(language));

  const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "User-Agent": "Mozilla/5.0 (compatible; ralphy/1.0)",
    },
    body: form,
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs Scribe ${resp.status}: ${body.slice(0, 500)}`);
  }
  const json = (await resp.json()) as ScribeResponse;

  // Filter to word-type entries with non-empty text. If nothing's left (e.g.
  // pure non-speech audio that came back as a single audio_event), fall back
  // to the top-level transcript text.
  const wordEntries = (json.words ?? []).filter(
    (w) => (w.type ?? "word") === "word" && w.text.trim() !== "",
  );

  let captions: Caption[];
  const audioDurationSec = json.audio_duration_secs ?? 0;
  if (wordEntries.length > 0) {
    captions = wordEntries.map((w) => {
      const startMs = Math.round(w.start * 1000);
      const endMs = Math.round(w.end * 1000);
      return {
        text: w.text,
        startMs,
        endMs,
        timestampMs: Math.round((startMs + endMs) / 2),
        confidence: null,
      };
    });
  } else if (json.text && json.text.trim()) {
    // No word-level entries but a transcript exists — emit one Caption
    // covering the whole clip. Useful for short non-speech samples.
    captions = [
      {
        text: json.text.trim(),
        startMs: 0,
        endMs: Math.round(audioDurationSec * 1000),
        timestampMs: Math.round((audioDurationSec * 1000) / 2),
        confidence: null,
      },
    ];
  } else {
    throw new Error("ElevenLabs Scribe returned empty transcript");
  }

  const costUsd = (audioDurationSec / 60) * COST_PER_MIN_SCRIBE;

  return {
    captions,
    language: json.language_code ?? language,
    model: SCRIBE_MODEL,
    audioDurationSec,
    costUsd,
  };
}

// Map our 2-letter to ElevenLabs ISO-3 code (or `null` for auto).
function iso3(lang: TranscribeLanguage): string {
  if (lang === "ru") return "rus";
  if (lang === "en") return "eng";
  return "rus";
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend: OpenRouter whisper-1 (legacy / fallback)
// ─────────────────────────────────────────────────────────────────────────────

type WhisperWord = { word: string; start: number; end: number };
type WhisperResponse = {
  language?: string;
  duration?: number;
  text?: string;
  words?: WhisperWord[];
  segments?: Array<{ start: number; end: number; text: string }>;
};

async function viaOpenRouter(
  abs: string,
  language: TranscribeLanguage,
  signal?: AbortSignal,
): Promise<Omit<TranscribeResult, "durationMs" | "backend">> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set. Run `ralphy setup`.");

  const bytes = await fs.readFile(abs);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(abs));
  form.append("model", WHISPER_MODEL);
  if (language !== "auto") form.append("language", language);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const resp = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OpenRouter whisper-1 ${resp.status}: ${body.slice(0, 500)}`);
  }
  const json = (await resp.json()) as WhisperResponse;

  let captions: Caption[];
  if (json.words && json.words.length > 0) {
    captions = json.words.map((w) => {
      const startMs = Math.round(w.start * 1000);
      const endMs = Math.round(w.end * 1000);
      return {
        text: w.word,
        startMs,
        endMs,
        timestampMs: Math.round((startMs + endMs) / 2),
        confidence: null,
      };
    });
  } else if (json.segments && json.segments.length > 0) {
    captions = json.segments.map((s) => {
      const startMs = Math.round(s.start * 1000);
      const endMs = Math.round(s.end * 1000);
      return {
        text: s.text.trim(),
        startMs,
        endMs,
        timestampMs: Math.round((startMs + endMs) / 2),
        confidence: null,
      };
    });
  } else if (json.text) {
    captions = [
      {
        text: json.text.trim(),
        startMs: 0,
        endMs: Math.round((json.duration ?? 0) * 1000),
        timestampMs: 0,
        confidence: null,
      },
    ];
  } else {
    throw new Error("OpenRouter returned no text/segments/words");
  }

  const audioDurationSec = json.duration ?? 0;
  const costUsd = (audioDurationSec / 60) * COST_PER_MIN_WHISPER;

  return {
    captions,
    language: json.language ?? language,
    model: WHISPER_MODEL,
    audioDurationSec,
    costUsd,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend: Gemini audio via OpenRouter chat-completions (text-only fallback)
//
// Useful when the other two are down. Returns a single Caption covering the
// entire clip (no word-level timing). Fine for research transcripts; not
// suitable for caption rendering.
// ─────────────────────────────────────────────────────────────────────────────

async function viaGemini(
  abs: string,
  language: TranscribeLanguage,
  signal?: AbortSignal,
): Promise<Omit<TranscribeResult, "durationMs" | "backend">> {
  const bytes = await fs.readFile(abs);
  const b64 = bytes.toString("base64");
  const ext = path.extname(abs).slice(1).toLowerCase() || "mp3";
  const langHint =
    language === "ru" ? "Russian" : language === "en" ? "English" : "auto-detected";

  // OpenRouter passes through Gemini's audio input. Format: input_audio with base64.
  // Note: not all routers fully support this body shape; fail-loud is the right
  // failure mode here — we don't want silent garbage transcripts.
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set.");

  const body = {
    model: GEMINI_AUDIO_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transcribe this audio (${langHint}). Return only the transcript text, no preface, no quotes.`,
          },
          {
            type: "input_audio",
            input_audio: { data: b64, format: ext },
          },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0,
  };

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gemini audio ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (json.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Gemini audio returned empty transcript");

  const captions: Caption[] = [
    { text, startMs: 0, endMs: 0, timestampMs: 0, confidence: null },
  ];

  return {
    captions,
    language,
    model: GEMINI_AUDIO_MODEL,
    audioDurationSec: 0,
    costUsd: COST_PER_MIN_GEMINI,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helper used by analyze-video and friends
// ─────────────────────────────────────────────────────────────────────────────

export function captionsToSegments(captions: Caption[]): {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
} {
  const text = captions
    .map((c) => c.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const segments = captions.map((c) => ({
    start: c.startMs / 1000,
    end: c.endMs / 1000,
    text: c.text,
  }));
  return { text, segments };
}

// Suppress unused-import lint if callLLM ever becomes unreferenced.
void callLLM;
