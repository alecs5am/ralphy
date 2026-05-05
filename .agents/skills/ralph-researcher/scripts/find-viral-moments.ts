// Find viral moments in a long video via Gemini-2.5-flash through OpenRouter
// (we have OPENROUTER_API_KEY). Port of mutonby/openshorts main.py:31-68
// Gemini prompt — adapted to our env (no Google AI Studio key, no Apify).
//
// Pipeline:
//   1. Transcribe audio via local whisper.cpp (cli/lib/transcribe.ts) — free.
//   2. Extract sample frames every N seconds (default 5s).
//   3. Send transcript + frames to Gemini, ask for 3-15 viral clips.
//   4. Save JSON: { clips: [{start, end, viral_hook_text, reason}] }.
//
// Use case: take a 60-min podcast / livestream / talking-head video and pull
// the top moments worth turning into shorts. Combine with `cli/lib/face-bbox.ts`
// + smart-crop for full repurposing.
//
// Usage:
//   bunx tsx .agents/skills/ralph-researcher/scripts/find-viral-moments.ts \
//     --video workspace/references/<handle>/long-video.mp4 \
//     --output workspace/references/<handle>/moments.json \
//     --language ru
//   # or, with caching:
//   --transcript-cache workspace/references/<handle>/captions.json

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { transcribe, captionsToSegments } from "../../../../cli/lib/transcribe.js";
import { ensureFfmpeg } from "../../../../cli/lib/ffmpeg-recipes.js";
import { callLLM, type LLMContent } from "../../../../cli/lib/providers/llm.js";

type ViralMoment = {
  start: number;
  end: number;
  viral_hook_text: string;
  reason: string;
  angle?: "gatekeep" | "skeptic" | "fail" | "visual-shock" | string;
};

type Result = {
  videoPath: string;
  durationSec: number;
  language: string;
  clips: ViralMoment[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? undefined : args[idx + 1];
  };
  const video = get("--video");
  const output = get("--output");
  if (!video || !output) {
    console.error("Usage: --video <path> --output <json> [--language ru|en|auto] [--frame-interval 5]");
    process.exit(1);
  }
  return {
    video: path.resolve(video),
    output: path.resolve(output),
    language: (get("--language") ?? "auto") as "ru" | "en" | "auto",
    frameInterval: Number(get("--frame-interval") ?? 5),
    transcriptCache: get("--transcript-cache"),
  };
}

// LLM provider is resolved at call time via callLLM() — supports Vercel AI
// Gateway, OpenRouter, or OpenAI. callLLM() throws a clean error if none set.

function probeDuration(videoPath: string): number {
  ensureFfmpeg();
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
    { encoding: "utf-8" }
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return parseFloat(r.stdout.trim());
}

async function extractFrames(videoPath: string, intervalSec: number, outDir: string): Promise<{ path: string; sec: number }[]> {
  ensureFfmpeg();
  await fs.mkdir(outDir, { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-i", videoPath,
      "-vf", `fps=1/${intervalSec},scale=512:-2`,
      "-q:v", "5",
      path.join(outDir, "frame-%04d.jpg"),
    ],
    { stdio: "ignore" }
  );
  if (r.status !== 0) throw new Error("ffmpeg frame extract failed");
  const files = (await fs.readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  return files.map((f, i) => ({
    path: path.join(outDir, f),
    sec: i * intervalSec,
  }));
}

async function transcribeOrCache(
  videoPath: string,
  language: "ru" | "en" | "auto",
  cachePath: string | undefined
) {
  if (cachePath) {
    try {
      const txt = await fs.readFile(cachePath, "utf-8");
      const arr = JSON.parse(txt);
      // Captions[] format check
      if (Array.isArray(arr) && arr[0]?.startMs != null) {
        return captionsToSegments(arr);
      }
      // Already in {text, segments} shape
      if (typeof arr.text === "string" && Array.isArray(arr.segments)) return arr;
    } catch {
      /* miss */
    }
  }

  // Extract audio first (whisper expects audio file).
  const tmpAudio = videoPath.replace(/\.[^.]+$/, "") + ".extracted.mp3";
  ensureFfmpeg();
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", tmpAudio],
    { stdio: "ignore" }
  );
  if (r.status !== 0) throw new Error("audio extract failed");
  try {
    const result = await transcribe({ audioPath: tmpAudio, language });
    if (cachePath) {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(result.captions, null, 2));
    }
    return captionsToSegments(result.captions);
  } finally {
    await fs.unlink(tmpAudio).catch(() => {});
  }
}

function buildPrompt(
  durationSec: number,
  transcript: { text: string; segments: Array<{ start: number; end: number; text: string }> }
) {
  const segLines = transcript.segments
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
    .join("\n");

  return `You are a viral short-form video editor analyzing a ${durationSec.toFixed(0)}-second source video.

You have the full transcript with absolute-second timestamps and sample frames evenly spaced through the video.

## TRANSCRIPT (absolute seconds)
${segLines}

## YOUR TASK

Identify 3 to 15 short clips (15-60 seconds each) that have the highest potential to go viral as standalone TikTok / Reels / Shorts. Respect these rules:

1. **Cut on silence, never mid-word.** Use the silence gaps in the transcript to choose start/end timestamps. Look for natural pauses.
2. **Add 0.2-0.4 seconds of lead-in BEFORE the actual hook word starts.** This pre-hook breath gives the clip momentum and prevents abrupt openings. So if the hook word starts at 142.5s, set start to 142.1-142.3s.
3. **Each clip must be 15-60 seconds.** Shorter is usually better; 15-25s is the sweet spot for retention.
4. **Each clip must have a self-contained narrative arc** — hook, payoff, optional CTA. Don't pull a clip that ends mid-thought.
5. **viral_hook_text:** the EXACT first words of the clip, max 10 words, in the SAME LANGUAGE as the transcript. This is what becomes the burned-in caption hook.
6. **reason:** 1-2 sentences explaining why this clip would go viral (specific angle: gatekeep / skeptic / fail / visual-shock / curiosity-gap).
7. **angle:** classify the hook-angle (one of: "gatekeep", "skeptic", "fail", "visual-shock"). If unclear, omit.

Return ONLY a JSON object, no prose, no markdown fences. Schema:
{
  "clips": [
    {
      "start": 142.3,
      "end": 162.7,
      "viral_hook_text": "Nobody tells you why junior devs never level up",
      "angle": "gatekeep",
      "reason": "Strong gatekeep angle on a contested workplace topic. Specific over-the-shoulder POV from a senior engineer."
    }
  ]
}`;
}

async function callGemini(prompt: string, frames: { path: string; sec: number }[]): Promise<string> {
  // Sample at most 12 frames evenly spaced.
  const step = Math.max(1, Math.floor(frames.length / 12));
  const sampled = frames.filter((_, i) => i % step === 0).slice(0, 12);

  const imageContents: LLMContent[] = [];
  for (const f of sampled) {
    const data = await fs.readFile(f.path);
    imageContents.push({ type: "text", text: `[Frame at ${f.sec}s]` });
    imageContents.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${data.toString("base64")}` },
    });
  }

  const result = await callLLM({
    model: "google/gemini-2.5-flash",
    maxTokens: 4096,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContents],
      },
    ],
    endpoint: "find-viral-moments",
  });
  return result.text;
}

function parseClipsJson(text: string): ViralMoment[] {
  const cleaned = text
    .replace(/```(?:json)?\s*([\s\S]*?)```/, "$1")
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Could not parse JSON from Gemini response");
    parsed = JSON.parse(cleaned.substring(start, end + 1));
  }
  return (parsed.clips || []).map((c: any) => ({
    start: Number(c.start),
    end: Number(c.end),
    viral_hook_text: String(c.viral_hook_text || ""),
    reason: String(c.reason || ""),
    angle: c.angle ? String(c.angle) : undefined,
  }));
}

async function main() {
  const opts = parseArgs();
  console.log(`\n=== Finding viral moments in ${path.basename(opts.video)} ===\n`);

  const duration = probeDuration(opts.video);
  console.log(`Duration: ${duration.toFixed(1)}s`);

  console.log("[1/3] Transcribing (local whisper.cpp)...");
  const transcript = await transcribeOrCache(opts.video, opts.language, opts.transcriptCache);
  console.log(`  ${transcript.segments.length} segments, ${transcript.text.length} chars`);

  console.log("[2/3] Extracting frames...");
  const tmp = path.join(path.dirname(opts.output), `.frames-${Date.now()}`);
  const frames = await extractFrames(opts.video, opts.frameInterval, tmp);
  console.log(`  ${frames.length} frames @ ${opts.frameInterval}s interval`);

  try {
    console.log("[3/3] Asking Gemini for viral moments...");
    const prompt = buildPrompt(duration, transcript);
    const raw = await callGemini(prompt, frames);
    const clips = parseClipsJson(raw);
    console.log(`  ${clips.length} clips identified`);

    const result: Result = {
      videoPath: opts.video,
      durationSec: duration,
      language: opts.language,
      clips,
    };
    await fs.mkdir(path.dirname(opts.output), { recursive: true });
    await fs.writeFile(opts.output, JSON.stringify(result, null, 2));
    console.log(`\n=== Saved ${clips.length} clips → ${opts.output} ===\n`);
    for (const c of clips) {
      console.log(`  [${c.start.toFixed(1)}s-${c.end.toFixed(1)}s] (${(c.end - c.start).toFixed(1)}s) — ${c.viral_hook_text}`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error("Failed:", e?.message || e);
  process.exit(1);
});
