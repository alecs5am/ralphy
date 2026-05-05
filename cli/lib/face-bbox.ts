// Face bbox detection via Gemini Vision through callLLM().
//
// Provider routing is centralized in cli/lib/providers/llm.ts: Vercel AI Gateway
// (preferred), OpenRouter, or OpenAI. Whichever is configured wins.
//
// Input: a video file → output Array<FrameBboxes> at 1 fps (or configurable).
// Why Gemini: cheap vision pass, no MediaPipe/YOLOv8 native deps in Node.
// Cost: ~$0.001 per frame at gemini-2.5-flash. 60s video = ~$0.06.
//
// Bboxes are approximate (Gemini is not as precise as YOLOv8) but smart-crop
// math has 25% safe-zone radius + 30-frame switch cooldown — plenty of slack
// for sloppy bboxes. Enough for slow-pan reframing.

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureFfmpeg } from "./ffmpeg-recipes.js";
import { logGeneration } from "./gen-log.js";
import { callLLM, resolveLLMProvider } from "./providers/llm.js";
import type { Bbox, FrameBboxes } from "../../src/lib/utils/smart-crop.js";

export type DetectFacesOptions = {
  videoPath: string;
  /** Sample rate in frames per second. Default 1 (cheap) */
  fps?: number;
  /** Cache file. If exists, returns cached bboxes (skips Gemini calls) */
  cachePath?: string;
  /** Optional project ID for logging */
  projectId?: string;
};

export type DetectFacesResult = {
  source: { width: number; height: number; durationSec: number; fps: number };
  frames: FrameBboxes[];
};

function probeVideo(videoPath: string): { width: number; height: number; durationSec: number; fps: number } {
  ensureFfmpeg();
  const out = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate:format=duration",
      "-of", "default=noprint_wrappers=1:nokey=0",
      videoPath,
    ],
    { encoding: "utf-8" }
  );
  if (out.status !== 0) {
    throw new Error(`ffprobe failed: ${out.stderr}`);
  }
  const txt = out.stdout;
  const width = Number((txt.match(/width=(\d+)/) || [])[1]);
  const height = Number((txt.match(/height=(\d+)/) || [])[1]);
  const durationSec = Number((txt.match(/duration=([\d.]+)/) || [])[1]);
  const frameRate = (txt.match(/r_frame_rate=(\d+)\/(\d+)/) || []);
  const fps = frameRate.length === 3 ? Number(frameRate[1]) / Number(frameRate[2]) : 30;
  return { width, height, durationSec, fps };
}

async function extractFrames(videoPath: string, sampleFps: number, outDir: string): Promise<string[]> {
  ensureFfmpeg();
  await fs.mkdir(outDir, { recursive: true });
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-i", videoPath,
      "-vf", `fps=${sampleFps}`,
      "-q:v", "4",
      path.join(outDir, "frame-%04d.jpg"),
    ],
    { stdio: "ignore" }
  );
  if (r.status !== 0) throw new Error(`ffmpeg frame extract failed`);
  const files = (await fs.readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  return files.map((f) => path.join(outDir, f));
}

async function detectInFrame(
  framePath: string,
  source: { width: number; height: number }
): Promise<Bbox[]> {
  const data = await fs.readFile(framePath);
  const b64 = data.toString("base64");

  const prompt = `Detect every visible human face in this image.
Image dimensions: ${source.width}x${source.height}.
Return ONLY a JSON array, no prose, no markdown fences. Each element:
  {"x": <pixels from left>, "y": <pixels from top>, "width": <px>, "height": <px>, "score": <0..1>}
If no faces, return [].
Coordinates must be integers in pixel space of the image, not normalized.`;

  let content = "";
  try {
    const result = await callLLM({
      model: "google/gemini-2.5-flash",
      maxTokens: 1024,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
      endpoint: "face-bbox",
    });
    content = result.text;
  } catch {
    return [];
  }

  const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
  try {
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr.filter((b: any) => typeof b.x === "number" && typeof b.y === "number");
  } catch {
    return [];
  }
}

export async function detectFaces(opts: DetectFacesOptions): Promise<DetectFacesResult> {
  const { videoPath, fps: sampleFps = 1, cachePath, projectId } = opts;

  if (cachePath) {
    try {
      const txt = await fs.readFile(cachePath, "utf-8");
      const cached = JSON.parse(txt) as DetectFacesResult;
      return cached;
    } catch {
      /* not cached, proceed */
    }
  }

  const meta = probeVideo(videoPath);
  const tmpDir = path.join(path.dirname(videoPath), `.face-frames-${Date.now()}`);
  const framePaths = await extractFrames(videoPath, sampleFps, tmpDir);

  const t0 = Date.now();
  const frames: FrameBboxes[] = [];
  for (let i = 0; i < framePaths.length; i++) {
    const sec = i / sampleFps;
    const bboxes = await detectInFrame(framePaths[i], meta);
    frames.push({ frameSec: sec, bboxes });
  }

  // Cleanup frame jpegs.
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const result: DetectFacesResult = {
    source: meta,
    frames,
  };

  if (cachePath) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
  }

  if (projectId) {
    const cfg = resolveLLMProvider();
    await logGeneration(projectId, {
      provider: cfg.provider,
      endpoint: `${cfg.provider}/google/gemini-2.5-flash:vision/face-bbox`,
      kind: "text",
      input: { videoPath, sampleFps, frames: framePaths.length },
      output: cachePath ? { local: cachePath } : undefined,
      status: "ok",
      latency_ms: Date.now() - t0,
      cost_usd: framePaths.length * 0.001,
      note: `${framePaths.length} frames, ${frames.reduce((acc, f) => acc + f.bboxes.length, 0)} faces total`,
    });
  }

  return result;
}
