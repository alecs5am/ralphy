// Local whisper.cpp transcription via @remotion/install-whisper-cpp.
//
// Why local whisper:
// - No paid API key required (project only has FAL/ElevenLabs/OpenRouter).
// - Returns word-level timestamps via --dtw + tokenLevelTimestamps:true.
// - Output Caption[] is the native input format for our 12 caption components
//   in src/lib/components/captions/ (HormoziCaptions, TikTokCaptions, etc.).
//
// Models live under workspace/.ralph/whisper/ (gitignored, per-machine).
// First call downloads whisper.cpp binary + model (~1.5GB for large-v3-turbo).
//
// Usage:
//   import { transcribe } from "./lib/transcribe.js";
//   const { captions, language } = await transcribe({ audioPath: "vo.mp3", language: "ru" });

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  installWhisperCpp,
  downloadWhisperModel,
  transcribe as whisperTranscribe,
  toCaptions,
  type WhisperModel,
} from "@remotion/install-whisper-cpp";
import type { Caption } from "@remotion/captions";
import { ralphDir } from "./paths.js";

export const WHISPER_VERSION = "1.5.5";
export const DEFAULT_MODEL: WhisperModel = "large-v3-turbo";

export type TranscribeLanguage = "ru" | "en" | "auto";

export type TranscribeOptions = {
  audioPath: string;
  language?: TranscribeLanguage;
  model?: WhisperModel;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
};

export type TranscribeResult = {
  captions: Caption[];
  language: string;
  model: WhisperModel;
  durationMs: number;
};

function whisperRoot(): string {
  return path.join(ralphDir(), "whisper");
}

async function ensureWhisperInstalled(model: WhisperModel): Promise<string> {
  const to = whisperRoot();
  await fs.mkdir(to, { recursive: true });
  await installWhisperCpp({ to, version: WHISPER_VERSION, printOutput: false });
  await downloadWhisperModel({ model, folder: to, printOutput: false });
  return to;
}

function ensureFfmpeg(): void {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error(
      "ffmpeg not found in PATH. Install via `brew install ffmpeg`."
    );
  }
}

// whisper.cpp expects 16kHz mono PCM WAV. Convert anything else.
async function convertTo16kWav(input: string): Promise<string> {
  ensureFfmpeg();
  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  const out = path.join(dir, `.${base}.16k.wav`);
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", out],
    { stdio: "ignore" }
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed converting ${input} → 16kHz wav`);
  }
  return out;
}

export async function transcribe({
  audioPath,
  language = "ru",
  model = DEFAULT_MODEL,
  signal,
  onProgress,
}: TranscribeOptions): Promise<TranscribeResult> {
  const t0 = Date.now();
  const abs = path.resolve(audioPath);
  if (!existsSync(abs)) throw new Error(`Audio not found: ${abs}`);

  const whisperPath = await ensureWhisperInstalled(model);

  const ext = path.extname(abs).toLowerCase();
  const inputPath = ext === ".wav" ? abs : await convertTo16kWav(abs);
  const cleanup = ext === ".wav" ? null : inputPath;

  try {
    const json = await whisperTranscribe({
      inputPath,
      whisperPath,
      whisperCppVersion: WHISPER_VERSION,
      model,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      language: language === "auto" ? null : language,
      printOutput: false,
      signal,
      onProgress,
    });

    const { captions } = toCaptions({ whisperCppOutput: json });
    return {
      captions,
      language: json.result?.language ?? language,
      model,
      durationMs: Date.now() - t0,
    };
  } finally {
    if (cleanup) {
      await fs.unlink(cleanup).catch(() => {});
    }
  }
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
