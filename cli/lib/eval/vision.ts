// Per-scene vision analysis via OpenRouter Gemini.
//
// We send the keyframe + a focused prompt asking for a one-sentence
// summary plus a list of issues with severity. The fixer agent
// downstream only needs the issues array — the summary is for the human
// scanning the markdown report.

import fs from "node:fs/promises";
import { callLLM } from "../providers/llm.js";
import type { Scene, SceneVision, VisionIssue, Severity } from "./types.js";

const VISION_MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You evaluate single keyframes from short-form vertical UGC videos (TikTok / Reels / Shorts).
Your output is consumed by an automated fixer agent — be specific and actionable.

For each frame, look for:
- AI-generation artefacts: warped fingers, distorted faces, broken hands, anatomy errors, glitched text
- Text overlay issues: cut off, illegible, low contrast, outside the safe-zone (Y outside 210-1480 or X outside 60-960 of a 1080x1920 frame)
- Composition issues: mis-cropped subject, off-center key element, distracting empty space
- Brand / safety issues: unintended logos, NSFW, watermarks from other platforms, copyright concerns
- Visual quality: heavy compression artefacts, severe blur, exposure problems

Return JSON only — no prose around it:
{
  "summary": "one sentence describing the frame",
  "issues": [
    { "category": "ai-artifacts|text|composition|brand|quality", "severity": "info|warn|fail", "message": "specific actionable description with location if applicable" }
  ]
}

If no issues, return an empty issues array. Don't invent issues to fill the array.`;

export async function analyzeScene(
  scene: Scene,
  context: { template: string | null; totalScenes: number; totalDurationSec: number; projectId: string | null },
): Promise<SceneVision> {
  if (!scene.firstFramePath) {
    return {
      sceneIndex: scene.index,
      timestampSec: scene.startSec + scene.durationSec / 2,
      framePath: "",
      summary: "no keyframe extracted",
      issues: [],
    };
  }

  const dataUri = await fileToDataUri(scene.firstFramePath);
  const userText = `Scene ${scene.index + 1} of ${context.totalScenes} | timestamp ${(scene.startSec + scene.durationSec / 2).toFixed(2)}s | scene duration ${scene.durationSec.toFixed(2)}s | total video ${context.totalDurationSec.toFixed(1)}s${context.template ? ` | template "${context.template}"` : ""}.`;

  let parsed: { summary?: string; issues?: VisionIssue[] } = {};
  try {
    const r = await callLLM({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      jsonMode: true,
      maxTokens: 800,
      projectId: context.projectId ?? undefined,
      endpoint: "openrouter/eval-vision",
    });
    parsed = safeParseJson(r.text);
  } catch (e) {
    return {
      sceneIndex: scene.index,
      timestampSec: scene.startSec + scene.durationSec / 2,
      framePath: scene.firstFramePath,
      summary: `vision-analysis failed: ${(e as Error).message}`,
      issues: [],
    };
  }

  return {
    sceneIndex: scene.index,
    timestampSec: scene.startSec + scene.durationSec / 2,
    framePath: scene.firstFramePath,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    issues: Array.isArray(parsed.issues) ? parsed.issues.filter(isValidIssue) : [],
  };
}

export async function analyzeScenes(
  scenes: Scene[],
  context: { template: string | null; totalDurationSec: number; projectId: string | null },
  concurrency = 3,
): Promise<SceneVision[]> {
  const out: SceneVision[] = [];
  const queue = [...scenes];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const sc = queue.shift();
      if (!sc) break;
      const r = await analyzeScene(sc, { ...context, totalScenes: scenes.length });
      out.push(r);
    }
  });
  await Promise.all(workers);
  return out.sort((a, b) => a.sceneIndex - b.sceneIndex);
}

async function fileToDataUri(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  const ext = file.toLowerCase().endsWith(".png") ? "png" : "jpeg";
  return `data:image/${ext};base64,${buf.toString("base64")}`;
}

function safeParseJson(text: string): { summary?: string; issues?: VisionIssue[] } {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function isValidIssue(x: unknown): x is VisionIssue {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.category === "string" &&
    typeof o.message === "string" &&
    (["info", "warn", "fail"] as Severity[]).includes(o.severity as Severity)
  );
}
