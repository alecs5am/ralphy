// Research helpers — the operations a researcher does on a reference URL,
// hoisted out of "agent writes a .ts script in their head" and into reusable
// CLI primitives.
//
// Surface:
//   pullReference()    — yt-dlp wrap; downloads mp4 + meta + mono mp3 audio
//   sampleFrames()     — ffmpeg sampler; writes JPEG frames at fps interval
//   transcribeRef()    — runs cli/lib/transcribe.ts on the ref's audio
//   analyzeFrames()    — vision LLM over the ref's frames
//   audioDescribeRef() — Gemini-audio LLM (non-speech / tonal description)
//   synthesizeBlueprint() — builds blueprint.md from {meta, transcript, analysis}
//
// All operations are scoped to `workspace/references/<slug>/`. Each step
// updates a small `state.json` so subsequent runs can detect what's already
// done and skip work. Logs go to gen-log when a `projectId` is supplied;
// research-only invocations are logged to a synthetic "research" project for
// observability.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import type { Caption } from "@remotion/captions";
import { referencesDir } from "./paths.js";
import { transcribe, type TranscribeBackend, type TranscribeLanguage } from "./transcribe.js";
import { callLLM } from "./providers/llm.js";
import { logGeneration } from "./gen-log.js";

// ─────────────────────────────────────────────────────────────────────────────
// Slug + paths
// ─────────────────────────────────────────────────────────────────────────────

export function refDir(slug: string): string {
  return path.join(referencesDir(), slug);
}

export function refPaths(slug: string) {
  const dir = refDir(slug);
  return {
    dir,
    sourceMp4: path.join(dir, "source.mp4"),
    meta: path.join(dir, "meta.info.json"),
    audio: path.join(dir, "source.mp3"),
    framesDir: path.join(dir, "frames"),
    transcript: path.join(dir, "transcript.json"),
    analysis: path.join(dir, "analysis.json"),
    audioAnalysis: path.join(dir, "audio-analysis.json"),
    blueprint: path.join(dir, "blueprint.md"),
    state: path.join(dir, "state.json"),
  };
}

export function slugFromUrl(url: string): string {
  // tiktok.com/@cataiseries/video/7630... → cataiseries-7630
  // youtube.com/watch?v=ABC123 → youtube-ABC123
  // instagram.com/reel/XYZ → instagram-XYZ
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    const parts = u.pathname.split("/").filter(Boolean);
    const tail = parts[parts.length - 1] || u.searchParams.get("v") || Date.now().toString(36);
    const handle = parts.find((p) => p.startsWith("@"))?.replace("@", "");
    const idLike = tail.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12);
    return [handle ?? host, idLike].filter(Boolean).join("-").toLowerCase();
  } catch {
    return `ref-${Date.now().toString(36)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State (small per-ref bookkeeping file)
// ─────────────────────────────────────────────────────────────────────────────

export type RefState = {
  slug: string;
  url?: string;
  pulledAt?: string;
  framesAt?: string;
  framesCount?: number;
  transcribedAt?: string;
  analyzedAt?: string;
  audioDescribedAt?: string;
  blueprintAt?: string;
};

async function readState(slug: string): Promise<RefState> {
  const p = refPaths(slug).state;
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as RefState;
  } catch {
    return { slug };
  }
}

async function writeState(slug: string, patch: Partial<RefState>): Promise<RefState> {
  const cur = await readState(slug);
  const next = { ...cur, ...patch, slug };
  await fs.mkdir(path.dirname(refPaths(slug).state), { recursive: true });
  await fs.writeFile(refPaths(slug).state, JSON.stringify(next, null, 2) + "\n");
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Process helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureBin(bin: string, brewHint?: string): void {
  // Use `which` so we don't depend on the bin's specific --version / -version
  // flag (ffmpeg uses single-dash, yt-dlp uses double-dash).
  const r = spawnSync("which", [bin], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error(
      `${bin} not found in PATH${brewHint ? ` (install via \`${brewHint}\`)` : ""}`,
    );
  }
}

function run(
  bin: string,
  args: string[],
  opts: { stdout?: "inherit" | "pipe" } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ["ignore", opts.stdout ?? "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// pullReference — yt-dlp + meta + audio extraction
// ─────────────────────────────────────────────────────────────────────────────

export type PullOptions = {
  url: string;
  slug?: string;
  /** Skip the video, fetch only metadata. */
  metaOnly?: boolean;
  /** Skip the video stream, only grab audio (mp3). */
  audioOnly?: boolean;
  /** Skip auto-extraction of mono 64kbps mp3 from the mp4 (default: extract). */
  noAudioExtract?: boolean;
};

export type PullResult = {
  slug: string;
  dir: string;
  videoPath?: string;
  audioPath?: string;
  metaPath: string;
  meta: Record<string, unknown>;
};

export async function pullReference(opts: PullOptions): Promise<PullResult> {
  ensureBin("yt-dlp", "brew install yt-dlp");
  const slug = opts.slug ?? slugFromUrl(opts.url);
  const paths = refPaths(slug);
  await fs.mkdir(paths.dir, { recursive: true });

  // 1. metadata (cheap, always)
  const metaR = await run("yt-dlp", [
    "--dump-single-json",
    "--no-download",
    opts.url,
  ]);
  if (metaR.code !== 0) {
    throw new Error(`yt-dlp metadata failed: ${metaR.stderr.slice(0, 500)}`);
  }
  const meta = JSON.parse(metaR.stdout) as Record<string, unknown>;
  await fs.writeFile(paths.meta, JSON.stringify(meta, null, 2) + "\n");

  let videoPath: string | undefined;
  let audioPath: string | undefined;

  if (!opts.metaOnly) {
    if (opts.audioOnly) {
      // download audio-only as mp3
      const r = await run("yt-dlp", [
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "-o",
        path.join(paths.dir, "source.%(ext)s"),
        opts.url,
      ]);
      if (r.code !== 0) {
        throw new Error(`yt-dlp audio download failed: ${r.stderr.slice(0, 500)}`);
      }
      audioPath = paths.audio;
    } else {
      // download mp4
      const r = await run("yt-dlp", [
        "-f",
        "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
        "--merge-output-format",
        "mp4",
        "-o",
        paths.sourceMp4,
        opts.url,
      ]);
      if (r.code !== 0) {
        throw new Error(`yt-dlp video download failed: ${r.stderr.slice(0, 500)}`);
      }
      videoPath = paths.sourceMp4;

      // extract mono 64k mp3 for transcription (≤25MB hard limit)
      if (!opts.noAudioExtract && existsSync(paths.sourceMp4)) {
        ensureBin("ffmpeg", "brew install ffmpeg");
        const fa = await run("ffmpeg", [
          "-y",
          "-loglevel",
          "error",
          "-i",
          paths.sourceMp4,
          "-vn",
          "-ac",
          "1",
          "-b:a",
          "64k",
          paths.audio,
        ]);
        if (fa.code !== 0) {
          throw new Error(`ffmpeg audio-extract failed: ${fa.stderr.slice(0, 500)}`);
        }
        audioPath = paths.audio;
      }
    }
  }

  await writeState(slug, {
    url: opts.url,
    pulledAt: new Date().toISOString(),
  });

  return {
    slug,
    dir: paths.dir,
    videoPath,
    audioPath,
    metaPath: paths.meta,
    meta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// sampleFrames — ffmpeg keyframe sampler
// ─────────────────────────────────────────────────────────────────────────────

export type FramesOptions = {
  slug: string;
  /** Frames per second to sample. Default 1 frame every 6s (1/6). */
  fps?: number;
  /** Max frames to emit. Default 24 (covers a 144s clip @ fps=1/6). */
  max?: number;
  /** Width to scale to (height auto). Default 540. */
  width?: number;
};

export type FramesResult = {
  slug: string;
  dir: string;
  count: number;
  paths: string[];
};

export async function sampleFrames(opts: FramesOptions): Promise<FramesResult> {
  ensureBin("ffmpeg", "brew install ffmpeg");
  const paths = refPaths(opts.slug);
  if (!existsSync(paths.sourceMp4)) {
    throw new Error(
      `No source.mp4 in ${paths.dir} — run \`ralphy ref pull <url> --slug ${opts.slug}\` first.`,
    );
  }
  await fs.mkdir(paths.framesDir, { recursive: true });
  const fps = opts.fps ?? 1 / 6;
  const max = opts.max ?? 24;
  const width = opts.width ?? 540;

  const r = await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    paths.sourceMp4,
    "-vf",
    `fps=${fps},scale=${width}:-2`,
    "-frames:v",
    String(max),
    "-q:v",
    "4",
    path.join(paths.framesDir, "frame-%02d.jpg"),
  ]);
  if (r.code !== 0) {
    throw new Error(`ffmpeg frames failed: ${r.stderr.slice(0, 500)}`);
  }
  const files = (await fs.readdir(paths.framesDir))
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(paths.framesDir, f));

  await writeState(opts.slug, {
    framesAt: new Date().toISOString(),
    framesCount: files.length,
  });

  return { slug: opts.slug, dir: paths.framesDir, count: files.length, paths: files };
}

// ─────────────────────────────────────────────────────────────────────────────
// transcribeRef — runs cli/lib/transcribe.ts against the ref's audio
// ─────────────────────────────────────────────────────────────────────────────

export type TranscribeRefOptions = {
  slug: string;
  language?: TranscribeLanguage;
  backend?: TranscribeBackend;
};

export type TranscribeRefResult = {
  slug: string;
  path: string;
  count: number;
  language: string;
  backend: TranscribeBackend;
  audioDurationSec: number;
  costUsd: number;
};

export async function transcribeRef(opts: TranscribeRefOptions): Promise<TranscribeRefResult> {
  const paths = refPaths(opts.slug);
  if (!existsSync(paths.audio)) {
    throw new Error(
      `No source.mp3 in ${paths.dir} — run \`ralphy ref pull <url> --slug ${opts.slug}\` first.`,
    );
  }
  const result = await transcribe({
    audioPath: paths.audio,
    language: opts.language ?? "ru",
    backend: opts.backend,
  });
  await fs.writeFile(
    paths.transcript,
    JSON.stringify(result.captions, null, 2) + "\n",
  );

  // log to a synthetic project so `ralphy project log` can show research too
  await logGeneration("_research", {
    provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
    endpoint: result.model,
    kind: "text",
    input: { audio: paths.audio, language: opts.language ?? "ru", backend: result.backend },
    output: { local: paths.transcript },
    status: "ok",
    latency_ms: result.durationMs,
    cost_usd: result.costUsd,
    note: `ref:${opts.slug}`,
  });

  await writeState(opts.slug, { transcribedAt: new Date().toISOString() });

  return {
    slug: opts.slug,
    path: paths.transcript,
    count: result.captions.length,
    language: result.language,
    backend: result.backend,
    audioDurationSec: result.audioDurationSec,
    costUsd: result.costUsd,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeFrames — vision LLM (Gemini default) over sampled frames
// ─────────────────────────────────────────────────────────────────────────────

export type AnalyzeFramesOptions = {
  slug: string;
  /** Custom prompt. Defaults to a per-scene UGC blueprint prompt. */
  prompt?: string;
  /** Vision model. Default `google/gemini-2.5-flash` (cheap, fast). */
  model?: string;
};

export type AnalyzeFramesResult = {
  slug: string;
  path: string;
  text: string;
  /** When the model returned valid JSON, this is the parsed structure. */
  json?: unknown;
  model: string;
  latencyMs: number;
};

const DEFAULT_FRAMES_PROMPT = `You are a UGC-video format analyst. Given the sampled frames below (in order), return a JSON object with these keys:

{
  "format_label": "<one-line tag, e.g. AI-Drama, Talking-Head, Product-Demo>",
  "duration_estimate_sec": <number>,
  "scene_count_estimate": <number>,
  "aspect_ratio": "9:16" | "1:1" | "16:9",
  "subject": "<who/what is on screen>",
  "setting": "<where>",
  "captions_style": "<one-word, e.g. word-pop, hormozi, none>",
  "color_grade": "<one-line>",
  "hook": { "first_seconds": "<what grabs attention>", "why_it_works": "<1 sentence>" },
  "scenes": [
    { "approx_start_sec": <number>, "description": "<what happens>", "on_screen_text": "<verbatim if visible, or null>" }
  ],
  "viral_factors": [ "<bullet 1>", "<bullet 2>" ],
  "reproduction": { "difficulty": "easy"|"medium"|"hard", "key_assets": ["..."], "steps": ["..."] }
}

Output ONLY the JSON. No prose, no preface, no code fences.`;

export async function analyzeFrames(opts: AnalyzeFramesOptions): Promise<AnalyzeFramesResult> {
  const paths = refPaths(opts.slug);
  let frames: string[];
  try {
    frames = (await fs.readdir(paths.framesDir))
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .map((f) => path.join(paths.framesDir, f));
  } catch {
    throw new Error(
      `No frames in ${paths.framesDir} — run \`ralphy ref frames ${opts.slug}\` first.`,
    );
  }
  if (frames.length === 0) {
    throw new Error(
      `No frames in ${paths.framesDir} — run \`ralphy ref frames ${opts.slug}\` first.`,
    );
  }

  // Pack frames as data URLs into a single user message.
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: opts.prompt ?? DEFAULT_FRAMES_PROMPT }];
  for (const fp of frames) {
    const b64 = (await fs.readFile(fp)).toString("base64");
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    });
  }

  const r = await callLLM({
    messages: [{ role: "user", content }],
    model: opts.model ?? "google/gemini-2.5-flash",
    jsonMode: !opts.prompt, // only enforce JSON for the default prompt
    maxTokens: 4096,
    temperature: 0.2,
    projectId: "_research",
    endpoint: `vision/${opts.model ?? "gemini-2.5-flash"}`,
  });

  const text = r.text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  await fs.writeFile(
    paths.analysis,
    parsed !== undefined ? JSON.stringify(parsed, null, 2) + "\n" : text + "\n",
  );

  await writeState(opts.slug, { analyzedAt: new Date().toISOString() });

  return {
    slug: opts.slug,
    path: paths.analysis,
    text,
    json: parsed,
    model: r.model,
    latencyMs: r.latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// audioDescribeRef — Gemini-audio LLM over source.mp3 (tone / non-speech)
// ─────────────────────────────────────────────────────────────────────────────

export type AudioDescribeOptions = {
  slug: string;
  prompt?: string;
  model?: string;
};

export type AudioDescribeResult = {
  slug: string;
  path: string;
  text: string;
  json?: unknown;
  model: string;
};

const DEFAULT_AUDIO_PROMPT = `Analyze this clip's AUDIO (not the transcript words — the sonics). Return JSON:

{
  "language": "<rus|eng|...|null>",
  "speech_present": true|false,
  "non_speech": [ "music", "sfx", "ambience", ... ],
  "tone": "<one-line, e.g. dramatic-soap, deadpan-comedy, energetic-tutorial>",
  "music": { "present": true|false, "genre": "<one-line>", "energy": "low"|"med"|"high" },
  "vo_style": { "speakers": <number>, "delivery": "<one-line, e.g. whisper, shout, normal>", "pacing": "slow"|"normal"|"fast" },
  "loudness_feel": "<one-line, e.g. -16 LUFS-ish, hot, quiet>",
  "uses_native_model_audio": true|false|null
}

Output ONLY the JSON.`;

export async function audioDescribeRef(opts: AudioDescribeOptions): Promise<AudioDescribeResult> {
  const paths = refPaths(opts.slug);
  if (!existsSync(paths.audio)) {
    throw new Error(
      `No source.mp3 in ${paths.dir} — run \`ralphy ref pull <url> --slug ${opts.slug}\` first.`,
    );
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set. Run `ralphy setup`.");

  const bytes = await fs.readFile(paths.audio);
  const b64 = bytes.toString("base64");
  const model = opts.model ?? "google/gemini-2.5-flash";
  const t0 = Date.now();

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: opts.prompt ?? DEFAULT_AUDIO_PROMPT },
          { type: "input_audio", input_audio: { data: b64, format: "mp3" } },
        ],
      },
    ],
    response_format: opts.prompt ? undefined : { type: "json_object" },
    max_tokens: 2048,
    temperature: 0.1,
  };

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const latency = Date.now() - t0;

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    await logGeneration("_research", {
      provider: "openrouter",
      endpoint: `audio/${model}`,
      kind: "text",
      input: { audio: paths.audio },
      status: "error",
      error: `${resp.status}: ${txt.slice(0, 300)}`,
      latency_ms: latency,
      note: `ref:${opts.slug}`,
    });
    throw new Error(`Gemini audio ${resp.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (json.choices?.[0]?.message?.content ?? "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  await fs.writeFile(
    paths.audioAnalysis,
    parsed !== undefined ? JSON.stringify(parsed, null, 2) + "\n" : text + "\n",
  );

  await logGeneration("_research", {
    provider: "openrouter",
    endpoint: `audio/${model}`,
    kind: "text",
    input: { audio: paths.audio },
    output: { local: paths.audioAnalysis },
    status: "ok",
    latency_ms: latency,
    note: `ref:${opts.slug}`,
  });
  await writeState(opts.slug, { audioDescribedAt: new Date().toISOString() });

  return { slug: opts.slug, path: paths.audioAnalysis, text, json: parsed, model };
}

// ─────────────────────────────────────────────────────────────────────────────
// synthesizeBlueprint — flatten {meta, transcript, analysis, audio-analysis}
// into one human-readable markdown.
// ─────────────────────────────────────────────────────────────────────────────

export async function synthesizeBlueprint(slug: string): Promise<{ path: string; bytes: number }> {
  const paths = refPaths(slug);
  const meta = (await safeJson(paths.meta)) as Record<string, unknown> | null;
  const transcript = (await safeJson(paths.transcript)) as Caption[] | null;
  const analysis = (await safeJson(paths.analysis)) as Record<string, unknown> | null;
  const audioAnalysis = (await safeJson(paths.audioAnalysis)) as Record<string, unknown> | null;
  const state = (await safeJson(paths.state)) as RefState | null;

  const lines: string[] = [];
  const title = String(meta?.title ?? slug);
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- **slug:** \`${slug}\``);
  if (state?.url) lines.push(`- **url:** ${state.url}`);
  if (meta?.uploader) lines.push(`- **uploader:** ${meta.uploader}`);
  if (meta?.duration) lines.push(`- **duration:** ${meta.duration}s`);
  if (meta?.view_count) lines.push(`- **views:** ${meta.view_count}`);
  if (meta?.like_count) lines.push(`- **likes:** ${meta.like_count}`);
  if (meta?.comment_count) lines.push(`- **comments:** ${meta.comment_count}`);
  if (Array.isArray(meta?.tags)) lines.push(`- **tags:** ${(meta?.tags as unknown[]).join(", ")}`);
  lines.push("");

  if (analysis) {
    lines.push("## Visual blueprint");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(analysis, null, 2));
    lines.push("```");
    lines.push("");
  }
  if (audioAnalysis) {
    lines.push("## Audio blueprint");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(audioAnalysis, null, 2));
    lines.push("```");
    lines.push("");
  }
  if (transcript) {
    const flat = transcript.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
    lines.push("## Transcript");
    lines.push("");
    lines.push(flat);
    lines.push("");
  }

  if (meta?.description) {
    lines.push("## Original description");
    lines.push("");
    lines.push(String(meta.description).trim());
    lines.push("");
  }

  const text = lines.join("\n");
  await fs.writeFile(paths.blueprint, text);
  await writeState(slug, { blueprintAt: new Date().toISOString() });
  return { path: paths.blueprint, bytes: text.length };
}

async function safeJson(p: string): Promise<unknown | null> {
  try {
    if (!existsSync(p)) return null;
    if (statSync(p).size === 0) return null;
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}
