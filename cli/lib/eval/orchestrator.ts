// Orchestrator — runs the full eval pipeline on a single mp4.

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { projectsDir } from "../paths.js";
import { probeVideo } from "./probe.js";
import { detectScenes } from "./scenes.js";
import { analyzeAudio } from "./audio.js";
import { extractKeyframes } from "./keyframes.js";
import { analyzeScenes } from "./vision.js";
import { buildFindings, score } from "./findings.js";
import { writeReport } from "./report.js";
import { deepVisionEvaluate, type DeepVisionResult } from "./deep-vision.js";
import type {
  CaptionStats,
  DeclaredMeta,
  EvalReport,
  Scene,
  SceneVision,
} from "./types.js";

export interface EvaluateInput {
  videoPath: string;
  /** Override auto-detected project (or pass null to skip context). */
  projectId?: string | null;
  /** Skip the standard per-scene vision pass — useful for fast smoke tests. */
  noVision?: boolean;
  /** Where to write eval.json + eval-report.md. Defaults to project dir or alongside the video. */
  outDir?: string;
  /** Per-scene vision concurrency (default 3). */
  visionConcurrency?: number;
  /** Path to a style-sheet.md (e.g. from `ralphy research scrape-profile`).
   *  When set, runs the deep-vision pass against the full mp4 using
   *  google/gemini-3.1-pro-preview and appends style-conformance findings. */
  styleSheetPath?: string | null;
  /** Path to a BRIEF.md (or the project's own BRIEF.md). Sent to the
   *  deep-vision pass to score intent conformance. */
  briefPath?: string | null;
  /** Reference video URLs the creator's catalog used — for deep-vision
   *  benchmark context. */
  referenceUrls?: string[];
  /** Override deep-vision model. */
  deepVisionModel?: string;
  /** Skip the deep-vision pass even when context is available. */
  noDeepVision?: boolean;
}

export interface EvaluateResult {
  report: EvalReport;
  jsonPath: string;
  mdPath: string;
}

export async function evaluateVideo(input: EvaluateInput): Promise<EvaluateResult> {
  const videoPath = path.resolve(input.videoPath);
  if (!existsSync(videoPath)) throw new Error(`video not found: ${videoPath}`);

  const projectId = input.projectId === undefined ? autoDetectProjectId(videoPath) : input.projectId;
  const projectRoot = projectId ? path.join(projectsDir(), projectId) : null;
  const outDir = input.outDir ?? (projectRoot ?? path.dirname(videoPath));

  const probe = probeVideo(videoPath);
  const evaluatedAt = new Date().toISOString();

  const declared = projectRoot ? await readDeclared(projectRoot) : null;
  const captionsRaw = projectRoot ? await readCaptions(projectRoot) : null;

  const rawScenes = await detectScenes(videoPath, probe.durationSec);
  const framesDir = path.join(outDir, "eval-frames");
  let scenes: Scene[];
  if (input.noVision) {
    scenes = rawScenes;
  } else {
    scenes = await extractKeyframes(videoPath, rawScenes, framesDir);
  }

  const audio = await analyzeAudio(videoPath, probe.durationSec);

  const vision: SceneVision[] = input.noVision
    ? []
    : await analyzeScenes(scenes, {
        template: declared?.template ?? null,
        totalDurationSec: probe.durationSec,
        projectId,
      }, input.visionConcurrency ?? 3);

  const captions = buildCaptionStats(captionsRaw, probe.durationSec);
  const hookTranscript = captionsToHookTranscript(captionsRaw, 3);

  const meta = {
    video: videoPath,
    projectId,
    template: declared?.template ?? null,
    evaluatedAt,
    ...probe,
  };

  const findings = buildFindings({
    meta,
    declared,
    scenes,
    audio,
    captions,
    vision,
    hookTranscript,
  });

  // Deep-vision pass: project-aware, full-mp4, gemini-3.1-pro-preview.
  // Runs in addition to the standard per-scene vision pass when a style
  // sheet or brief is available. Adds style-conformance findings to the
  // findings[] array — same shape as everything else, but harsher and
  // tied to specific rules from the project's source-of-truth style sheet.
  let deepVision: DeepVisionResult | null = null;
  const briefDefault = projectRoot ? path.join(projectRoot, "BRIEF.md") : null;
  const briefResolved = input.briefPath ?? (briefDefault && existsSync(briefDefault) ? briefDefault : null);
  if (!input.noDeepVision && (input.styleSheetPath || briefResolved)) {
    try {
      deepVision = await deepVisionEvaluate(videoPath, {
        styleSheetPath: input.styleSheetPath ?? null,
        briefPath: briefResolved,
        referenceUrls: input.referenceUrls ?? [],
        projectId,
        model: input.deepVisionModel,
      });
      findings.push(...deepVision.findings);
    } catch (e) {
      findings.push({
        id: "DEEP-ERR",
        category: "eval.deep-vision-error",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `deep-vision pass failed: ${(e as Error).message}`,
        fixHint: "Inspect deep-vision.ts logs; re-run with --no-deep-vision to skip.",
        fixCommand: null,
      });
    }
  }

  const scoring = score(findings);

  const sceneDurations = scenes.map((s) => s.durationSec);
  const report: EvalReport = {
    schemaVersion: "1.0",
    meta,
    declared,
    structure: {
      scenes,
      sceneCount: scenes.length,
      avgSceneDurationSec: avg(sceneDurations),
      minSceneDurationSec: sceneDurations.length ? Math.min(...sceneDurations) : 0,
      maxSceneDurationSec: sceneDurations.length ? Math.max(...sceneDurations) : 0,
      hookZone: {
        durationSec: 3,
        sceneCount: scenes.filter((s) => s.startSec < 3).length,
        transcript: hookTranscript,
        wordCount: countWords(hookTranscript),
      },
    },
    audio,
    captions,
    vision: { sceneFindings: vision },
    findings,
    scoring,
  };

  const { jsonPath, mdPath } = await writeReport(report, outDir);

  // If deep-vision ran, persist its raw + parsed output alongside the
  // standard report — the structured "what_to_redo" priority list is
  // easier for a downstream fixer agent to act on than the flattened
  // findings[].
  if (deepVision) {
    const deepJsonPath = path.join(outDir, "eval-deep-vision.json");
    await fs.writeFile(
      deepJsonPath,
      JSON.stringify(
        {
          model: deepVision.modelUsed,
          parsed: deepVision.parsed,
          raw: deepVision.raw,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  return { report, jsonPath, mdPath };
}

function autoDetectProjectId(videoPath: string): string | null {
  const m = videoPath.match(/[\\/]workspace[\\/]projects[\\/]([^\\/]+)[\\/]/);
  return m ? m[1] : null;
}

interface DeclaredScenarioFile {
  template?: string;
  duration?: number;
  format?: { durationSec?: number };
  hook?: { primary?: string };
  angle?: string;
  captionStyle?: string;
  scenes?: unknown[];
}

async function readDeclared(projectRoot: string): Promise<DeclaredMeta | null> {
  const file = path.join(projectRoot, "scenario.json");
  if (!existsSync(file)) return null;
  try {
    const raw = await fs.readFile(file, "utf8");
    const j = JSON.parse(raw) as DeclaredScenarioFile;
    return {
      template: j.template ?? null,
      durationSec: j.format?.durationSec ?? j.duration ?? null,
      sceneCount: Array.isArray(j.scenes) ? j.scenes.length : null,
      hookText: j.hook?.primary ?? null,
      angle: j.angle ?? null,
      captionStyle: j.captionStyle ?? null,
    };
  } catch {
    return null;
  }
}

interface CaptionEntry {
  text: string;
  startMs: number;
  endMs: number;
}

async function readCaptions(projectRoot: string): Promise<CaptionEntry[] | null> {
  const file = path.join(projectRoot, "captions.json");
  if (!existsSync(file)) return null;
  try {
    const raw = await fs.readFile(file, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return null;
    return j.filter(
      (e): e is CaptionEntry =>
        e !== null &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).text === "string" &&
        typeof (e as Record<string, unknown>).startMs === "number",
    );
  } catch {
    return null;
  }
}

function buildCaptionStats(captions: CaptionEntry[] | null, durationSec: number): CaptionStats {
  if (!captions) {
    return { available: false, wordCount: null, wordsPerSecond: null, densityWarn: null };
  }
  const wordCount = captions.length;
  const wps = durationSec > 0 ? wordCount / durationSec : 0;
  return {
    available: true,
    wordCount,
    wordsPerSecond: round3(wps),
    densityWarn: wps < 1.5 || wps > 4.5,
  };
}

function captionsToHookTranscript(captions: CaptionEntry[] | null, hookSec: number): string {
  if (!captions) return "";
  return captions
    .filter((c) => c.startMs / 1000 < hookSec)
    .map((c) => c.text)
    .join(" ");
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : round3(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function countWords(s: string): number {
  return s.trim() === "" ? 0 : s.trim().split(/\s+/).length;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
