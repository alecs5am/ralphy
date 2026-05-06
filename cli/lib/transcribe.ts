// Cloud transcription via OpenRouter (openai/whisper-1).
//
// Why OpenRouter:
// - Uses the existing OPENROUTER_API_KEY — no extra setup, no 1.5GB local model
//   download, no per-machine binary builds.
// - whisper-1 with timestamp_granularities=word returns word-level timestamps,
//   the format our caption components in src/lib/components/captions/
//   (HormoziCaptions, TikTokCaptions, KaraokeCaptions, …) expect.
// - Endpoint is OpenAI-compatible: POST multipart to /api/v1/audio/transcriptions.
//
// Limits: OpenAI whisper-1 caps file size at 25MB. For longer files, compress
// to mp3 (~64kbps mono) before passing in, or split into chunks.
//
// Usage:
//   import { transcribe } from "./lib/transcribe.js";
//   const { captions, language } = await transcribe({ audioPath: "vo.mp3", language: "ru" });

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import type { Caption } from "@remotion/captions";

export const WHISPER_MODEL = "openai/whisper-1";
export const DEFAULT_MODEL = WHISPER_MODEL;
// Kept for backwards-compat with consumers that imported it; no longer meaningful.
export const WHISPER_VERSION = "openrouter";

// Per OpenAI whisper-1 spec.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
// $0.006 per minute of audio (OpenAI list price; OpenRouter passes through).
const COST_PER_MINUTE_USD = 0.006;

export type TranscribeLanguage = "ru" | "en" | "auto";

export type TranscribeOptions = {
  audioPath: string;
  language?: TranscribeLanguage;
  /** Ignored — whisper-1 is the only model exposed via OpenRouter today. Kept
   *  for CLI flag compatibility. */
  model?: string;
  signal?: AbortSignal;
};

export type TranscribeResult = {
  captions: Caption[];
  language: string;
  model: string;
  durationMs: number;
  audioDurationSec: number;
  costUsd: number;
};

type WhisperWord = { word: string; start: number; end: number };
type WhisperResponse = {
  language?: string;
  duration?: number;
  text?: string;
  words?: WhisperWord[];
  segments?: Array<{ start: number; end: number; text: string }>;
};

function wordsToCaptions(words: WhisperWord[]): Caption[] {
  return words.map((w) => {
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
}

export async function transcribe({
  audioPath,
  language = "ru",
  signal,
}: TranscribeOptions): Promise<TranscribeResult> {
  const t0 = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not set. Run `ralphy setup` to configure it."
    );
  }

  const abs = path.resolve(audioPath);
  if (!existsSync(abs)) throw new Error(`Audio not found: ${abs}`);

  const size = statSync(abs).size;
  if (size > MAX_FILE_BYTES) {
    throw new Error(
      `Audio file is ${(size / 1024 / 1024).toFixed(1)}MB — whisper-1 caps at 25MB. ` +
        `Re-encode at lower bitrate (e.g. \`ffmpeg -i ${path.basename(abs)} -ac 1 -b:a 64k out.mp3\`) ` +
        `or split into chunks.`
    );
  }

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
    captions = wordsToCaptions(json.words);
  } else if (json.segments && json.segments.length > 0) {
    // Fallback: provider didn't honor word-level — emit one Caption per segment.
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
  const costUsd = (audioDurationSec / 60) * COST_PER_MINUTE_USD;

  return {
    captions,
    language: json.language ?? language,
    model: WHISPER_MODEL,
    durationMs: Date.now() - t0,
    audioDurationSec,
    costUsd,
  };
}

// Convenience: collapse Caption[] to Whisper-style { text, segments: [{ start, end, text }] }
// for legacy consumers (analyze-video.ts builds this shape for Gemini prompts).
export function captionsToSegments(captions: Caption[]): {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
} {
  const text = captions.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
  const segments = captions.map((c) => ({
    start: c.startMs / 1000,
    end: c.endMs / 1000,
    text: c.text,
  }));
  return { text, segments };
}
