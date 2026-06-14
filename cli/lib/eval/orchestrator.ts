// Orchestrator — runs the full eval pipeline on a single mp4.

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { projectDir, projectIdFromPath } from "../paths.js";
import { probeVideo } from "./probe.js";
import { detectScenes } from "./scenes.js";
import { analyzeAudio } from "./audio.js";
import { extractKeyframes } from "./keyframes.js";
import { analyzeScenes } from "./vision.js";
import { buildFindings, score } from "./findings.js";
import { writeReport } from "./report.js";
import { deepVisionEvaluate, type DeepVisionResult } from "./deep-vision.js";
import { resolveGate, resolveMode, hasModelCredentials } from "./gate.js";
import type {
  CaptionStats,
  DeclaredMeta,
  EvalMode,
  EvalReport,
  Scene,
  SceneVision,
} from "./types.js";

/**
 * Injectable pipeline steps (#411). Tests substitute these to drive the
 * orchestrator's mode-selection + gate logic WITHOUT ffmpeg or a model call —
 * no `mock.module` on a shared lib (forbidden per #072). Production leaves them
 * unset and the real implementations run.
 */
export interface EvaluateDeps {
  probeVideo?: typeof probeVideo;
  detectScenes?: typeof detectScenes;
  analyzeAudio?: typeof analyzeAudio;
  extractKeyframes?: typeof extractKeyframes;
  analyzeScenes?: typeof analyzeScenes;
  deepVisionEvaluate?: typeof deepVisionEvaluate;
  /** Override the model-credentials probe (default reads the provider registry). */
  hasModelCredentials?: () => boolean;
}

export interface EvaluateInput {
  videoPath: string;
  /** Explicit validation mode (#411): structure | keyframe | native-video | deep-style.
   *  When omitted, the orchestrator resolves the default final gate (native-video,
   *  or deep-style if a style lock / brief is discoverable) — see `resolveMode`. */
  mode?: EvalMode | null;
  /** Override auto-detected project (or pass null to skip context). */
  projectId?: string | null;
  /** Legacy alias for `--mode structure` — skip every model pass. Mapped to
   *  `mode: "structure"` when no explicit `mode` is given. */
  noVision?: boolean;
  /** Where to write eval.json + eval-report.md. Defaults to project dir or alongside the video. */
  outDir?: string;
  /** Per-scene vision concurrency (default 3). */
  visionConcurrency?: number;
  /** Path to a style-sheet.md (e.g. from `ralphy research scrape-profile`).
   *  Presence implies the deep-style mode (full-mp4 style-conformance pass). */
  styleSheetPath?: string | null;
  /** Path to a BRIEF.md (or the project's own BRIEF.md). Sent to the
   *  deep-style pass to score intent conformance. */
  briefPath?: string | null;
  /** Reference video URLs the creator's catalog used — for deep-style
   *  benchmark context. */
  referenceUrls?: string[];
  /** Override deep-vision model. */
  deepVisionModel?: string;
  /** Legacy alias: when true, never run the full-mp4 pass even if a style
   *  sheet/brief is present. Caps the effective mode at `keyframe`. */
  noDeepVision?: boolean;
  /** Test seam — injectable pipeline steps. Unset in production. */
  deps?: EvaluateDeps;
}

export interface EvaluateResult {
  report: EvalReport;
  jsonPath: string;
  mdPath: string;
}

export async function evaluateVideo(input: EvaluateInput): Promise<EvaluateResult> {
  const videoPath = path.resolve(input.videoPath);
  if (!existsSync(videoPath)) throw new Error(`video not found: ${videoPath}`);

  // Resolve injectable steps (production uses the real implementations).
  const d = input.deps ?? {};
  const _probeVideo = d.probeVideo ?? probeVideo;
  const _detectScenes = d.detectScenes ?? detectScenes;
  const _analyzeAudio = d.analyzeAudio ?? analyzeAudio;
  const _extractKeyframes = d.extractKeyframes ?? extractKeyframes;
  const _analyzeScenes = d.analyzeScenes ?? analyzeScenes;
  const _deepVisionEvaluate = d.deepVisionEvaluate ?? deepVisionEvaluate;
  const _hasModelCredentials = d.hasModelCredentials ?? hasModelCredentials;

  const projectId = input.projectId === undefined ? autoDetectProjectId(videoPath) : input.projectId;
  const projectRoot = projectId ? projectDir(projectId) : null;
  const outDir = input.outDir ?? (projectRoot ?? path.dirname(videoPath));

  // — Resolve the effective validation mode + ship-ready gate (#411).
  const briefDefault = projectRoot ? path.join(projectRoot, "BRIEF.md") : null;
  const briefResolved = input.briefPath ?? (briefDefault && existsSync(briefDefault) ? briefDefault : null);
  const styleContextAvailable = !!(input.styleSheetPath || briefResolved || (input.referenceUrls ?? []).length > 0);

  // Map the explicit mode + the legacy flags to a single requested mode.
  //   --mode wins. Else: --no-vision ⇒ structure; a style sheet/brief ⇒
  //   deep-style; --no-deep-vision caps native off (⇒ keyframe). When none of
  //   these are set, `requested` stays null and the default final gate fires.
  let requested: EvalMode | null = input.mode ?? null;
  if (!requested) {
    if (input.noVision) {
      requested = "structure";
    } else if (input.noDeepVision) {
      // Legacy: keep the cheap keyframe pass, never escalate to native.
      requested = "keyframe";
    } else if (styleContextAvailable) {
      requested = "deep-style";
    }
  }

  const resolved = resolveMode({
    requested,
    modelCredentials: _hasModelCredentials(),
    styleContextAvailable,
  });
  const mode = resolved.mode;
  const runKeyframe = mode === "keyframe" || mode === "native-video" || mode === "deep-style";
  const runFullMp4 = mode === "native-video" || mode === "deep-style";

  const probe = _probeVideo(videoPath);
  const evaluatedAt = new Date().toISOString();

  const declared = projectRoot ? await readDeclared(projectRoot) : null;
  const captionsRaw = projectRoot ? await readCaptions(projectRoot) : null;

  const rawScenes = await _detectScenes(videoPath, probe.durationSec);
  const framesDir = path.join(outDir, "eval-frames");
  // Keyframe extraction only matters for the per-scene vision pass.
  const scenes: Scene[] = runKeyframe
    ? await _extractKeyframes(videoPath, rawScenes, framesDir)
    : rawScenes;

  const audio = await _analyzeAudio(videoPath, probe.durationSec);

  const vision: SceneVision[] = runKeyframe
    ? await _analyzeScenes(scenes, {
        template: declared?.template ?? null,
        totalDurationSec: probe.durationSec,
        projectId,
      }, input.visionConcurrency ?? 3)
    : [];

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

  // Surface a mode-downgrade (e.g. requested native but no credentials) as a
  // finding so the report is honest about what actually ran.
  if (resolved.downgradeNote) {
    findings.push({
      id: "MODE-DOWNGRADE",
      category: "eval.mode-downgrade",
      severity: "info",
      sceneIndex: null,
      timestampSec: null,
      message: resolved.downgradeNote,
      fixHint: "Configure a model provider (OPENROUTER_API_KEY) and re-run for the native-video final gate.",
      fixCommand: null,
    });
  }

  // Full-mp4 deep-vision pass (#411): native-video (no style sheet required) or
  // deep-style (style lock / brief / reference comparison). Both send the WHOLE
  // mp4 to gemini-3.1-pro-preview and emit the SAME schema, so the #409 repair
  // loop reads `what_to_redo` identically. native-video is the default final
  // gate; deep-style adds the style-conformance critique on top.
  let deepVision: DeepVisionResult | null = null;
  if (runFullMp4) {
    try {
      deepVision = await _deepVisionEvaluate(videoPath, {
        mode: mode === "deep-style" ? "deep-style" : "native-video",
        styleSheetPath: mode === "deep-style" ? (input.styleSheetPath ?? null) : null,
        briefPath: mode === "deep-style" ? briefResolved : null,
        referenceUrls: mode === "deep-style" ? (input.referenceUrls ?? []) : [],
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
        fixHint: "Inspect deep-vision.ts logs; re-run with --mode keyframe to skip the full-mp4 pass.",
        fixCommand: null,
      });
    }
  }

  const scoring = score(findings);
  const gate = resolveGate({ mode, explicit: resolved.explicit, verdict: scoring.verdict });

  const sceneDurations = scenes.map((s) => s.durationSec);
  const report: EvalReport = {
    schemaVersion: "1.0",
    gate,
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
          // The validation mode that produced this report (#411). Additive —
          // #409's repair loop reads `parsed.what_to_redo` / `parsed.overall_verdict`,
          // both unchanged.
          mode,
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

/**
 * Auto-detect the project a video belongs to (#411). Delegates to the
 * registry-backed `projectIdFromPath`, which:
 *   1. prefers a registered project whose resolved dir contains the path
 *      (respects `ralphy project move`);
 *   2. falls back to the CURRENT `.ralphy/workspaces/<ws>/projects/<id>/` layout
 *      regex (the old `/workspace/projects/<id>/` regex was stale — #411);
 *   3. then the legacy `workspace/projects/<id>/` shape.
 * Returns null for a path outside any recognizable project tree.
 */
function autoDetectProjectId(videoPath: string): string | null {
  return projectIdFromPath(videoPath);
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
