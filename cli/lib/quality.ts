// Quality refusal engine — gate before handoffs and final render.
//
// Three checks, all returning { passed, failures, warnings }:
//
//   scoreScenario  — non-LLM structural checklist (mirrored from score.ts).
//   scoreImage     — LLM-vision via callLLM (gemini-2.5-flash) on a single image.
//   scoreVideo     — LLM-vision on 3 sampled frames (start/middle/end) via ffmpeg.
//
// "If unsure, refuse" — see AGENTS.md hard rule #4. After two consecutive
// failures the calling skill must stop and surface concrete options to the
// user, not silently retry forever.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { callLLM } from "./providers/llm.js";

export {
  scoreScenario,
  scoreTikTok,
  type ScenarioCheck,
  type Scenario,
  type TikTokScore,
  type TikTokMetrics,
} from "./score.js";

// ─── shared shape ───────────────────────────────────────────────────────────

export type AssetCheck = {
  passed: boolean;
  failures: string[];
  warnings: string[];
  scores: {
    clarity: number;       // 1-10 sharpness, no artifacts
    composition: number;   // 1-10 framing, no awkward crops
    fidelity: number;      // 1-10 matches the prompt
    motion?: number;       // 1-10 video only — stable, no morphing
  };
  comment: string;
  model: string;
  costUsd: number;
};

const PASS_THRESHOLD = 7;

// ─── image vision check ─────────────────────────────────────────────────────

export type ScoreImageInput = {
  /** Local path or http URL to the image. Local paths are encoded as data URLs. */
  imagePath: string;
  /** Original prompt used to generate this image (fed into fidelity scoring). */
  prompt: string;
  /** Project ID for log line (optional). */
  projectId?: string;
};

export async function scoreImage(input: ScoreImageInput): Promise<AssetCheck> {
  const imageUrl = await toImageUrl(input.imagePath);

  const sys =
    "You are a strict creative director rating an AI-generated image for a vertical short-form UGC video. " +
    "Output JSON only.";
  const user = `Rate this image on three axes 1-10:
- clarity: sharpness, no artifacts, no morphing of faces/hands.
- composition: subject framed well, no awkward crops, vertical 9:16 friendly.
- fidelity: how well it matches this prompt.

Original prompt: """${input.prompt}"""

Return strict JSON: { "clarity": int, "composition": int, "fidelity": int, "comment": string }.`;

  const result = await callLLM({
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    model: "google/gemini-2.5-flash",
    jsonMode: true,
    projectId: input.projectId,
    endpoint: "openrouter/score-image",
  });

  const parsed = parseScoreJSON(result.text);
  const scores = {
    clarity: clampScore(parsed.clarity),
    composition: clampScore(parsed.composition),
    fidelity: clampScore(parsed.fidelity),
  };
  const avg = (scores.clarity + scores.composition + scores.fidelity) / 3;
  const failures: string[] = [];
  const warnings: string[] = [];
  if (avg < PASS_THRESHOLD) {
    failures.push(
      `Image avg ${avg.toFixed(1)}/10 < threshold ${PASS_THRESHOLD} ` +
        `(clarity ${scores.clarity}, composition ${scores.composition}, fidelity ${scores.fidelity})`
    );
  }
  for (const [k, v] of Object.entries(scores)) {
    if (v >= PASS_THRESHOLD - 2 && v < PASS_THRESHOLD) {
      warnings.push(`${k} is ${v}/10 — borderline`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    scores,
    comment: typeof parsed.comment === "string" ? parsed.comment : "",
    model: result.model,
    costUsd: 0.001, // gemini-2.5-flash vision ballpark per call
  };
}

// ─── video vision check ─────────────────────────────────────────────────────

export type ScoreVideoInput = {
  videoPath: string;
  prompt: string;
  projectId?: string;
};

export async function scoreVideo(input: ScoreVideoInput): Promise<AssetCheck> {
  const abs = path.resolve(input.videoPath);
  if (!existsSync(abs)) throw new Error(`Video not found: ${abs}`);

  // Sample 3 frames: 10%, 50%, 90% of duration. ffprobe → ffmpeg seek.
  const duration = await ffprobeDuration(abs);
  const ts = [duration * 0.1, duration * 0.5, duration * 0.9];
  const frameDir = await fs.mkdtemp(path.join(tmpdir(), "ralphy-vidframes-"));
  const frameUrls: string[] = [];
  try {
    for (let i = 0; i < ts.length; i++) {
      const out = path.join(frameDir, `frame-${i}.jpg`);
      await ffmpegExtractFrame(abs, ts[i], out);
      frameUrls.push(await toImageUrl(out));
    }

    const sys =
      "You are rating a single AI-generated video clip on a vertical 9:16 canvas. " +
      "Three frames are provided (start / middle / end). Output JSON only.";
    const user = `Rate this clip on four axes 1-10:
- clarity: sharpness, no severe compression, no morphing.
- composition: subject framed well across the clip, vertical 9:16.
- fidelity: matches this prompt.
- motion: stable motion (no flicker, no warping limbs/faces, no jump-frames).

Original prompt: """${input.prompt}"""

Return strict JSON: { "clarity": int, "composition": int, "fidelity": int, "motion": int, "comment": string }.`;

    const result = await callLLM({
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: user },
            ...frameUrls.map((u) => ({ type: "image_url" as const, image_url: { url: u } })),
          ],
        },
      ],
      model: "google/gemini-2.5-flash",
      jsonMode: true,
      projectId: input.projectId,
      endpoint: "openrouter/score-video",
    });

    const parsed = parseScoreJSON(result.text);
    const scores = {
      clarity: clampScore(parsed.clarity),
      composition: clampScore(parsed.composition),
      fidelity: clampScore(parsed.fidelity),
      motion: clampScore(parsed.motion),
    };
    const avg = (scores.clarity + scores.composition + scores.fidelity + scores.motion) / 4;
    const failures: string[] = [];
    const warnings: string[] = [];
    if (avg < PASS_THRESHOLD) {
      failures.push(
        `Video avg ${avg.toFixed(1)}/10 < threshold ${PASS_THRESHOLD} ` +
          `(c=${scores.clarity}, comp=${scores.composition}, f=${scores.fidelity}, m=${scores.motion})`
      );
    }
    if (scores.motion < 5) {
      failures.push(`Motion stability ${scores.motion}/10 — likely warping/morphing`);
    }
    for (const [k, v] of Object.entries(scores)) {
      if (v >= PASS_THRESHOLD - 2 && v < PASS_THRESHOLD) {
        warnings.push(`${k} is ${v}/10 — borderline`);
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      warnings,
      scores,
      comment: typeof parsed.comment === "string" ? parsed.comment : "",
      model: result.model,
      costUsd: 0.003, // 3 frames × flash vision ballpark
    };
  } finally {
    await fs.rm(frameDir, { recursive: true, force: true });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function parseScoreJSON(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Extract first {...} block.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* fall-through */
      }
    }
  }
  return {};
}

async function toImageUrl(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const abs = path.resolve(pathOrUrl);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).slice(1).toLowerCase() || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function ffprobeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => (stdout += c.toString()));
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      const n = parseFloat(stdout.trim());
      if (!isFinite(n)) {
        reject(new Error(`ffprobe returned non-numeric duration: ${stdout}`));
        return;
      }
      resolve(n);
    });
  });
}

async function ffmpegExtractFrame(file: string, timestampSec: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      ["-y", "-ss", String(timestampSec), "-i", file, "-frames:v", "1", "-q:v", "3", outPath],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      resolve();
    });
  });
}
