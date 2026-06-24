// Shared types for the eval pipeline.
//
// The eval report is the single source of truth handed to a downstream
// "fixer" agent. Findings are the actionable unit: each one names a
// category, severity, optional scene/timestamp, and a copy-pasteable fix
// command when one exists.

import type { MetricResult } from "./metrics/types.js";

export type Severity = "info" | "warn" | "fail";
export type Verdict = "pass" | "warn" | "fail";

/**
 * Explicit validation modes (#411). Ordered cheapest → most thorough:
 *   • `structure`    — deterministic only (ffprobe, scene durations, loudness,
 *                      silence, caption density). NO model calls.
 *   • `keyframe`     — structure + the cheap per-scene keyframe vision pass. A
 *                      smoke check; one still per scene, model is gemini-flash.
 *   • `native-video` — structure + a full-mp4 model pass (gemini-3.1-pro-preview)
 *                      for temporal continuity, audio-picture alignment, pacing,
 *                      caption sync, and format fit. No style sheet required.
 *   • `deep-style`   — native-video PLUS style-lock / brief / reference
 *                      comparison (the harsher style-conformance prompt).
 */
export type EvalMode = "structure" | "keyframe" | "native-video" | "deep-style";

export const EVAL_MODES: readonly EvalMode[] = [
  "structure",
  "keyframe",
  "native-video",
  "deep-style",
] as const;

/**
 * The strength of the gate the report was produced under (#411). Only a report
 * produced by a full-mp4 native pass (`native-video` / `deep-style`) is allowed
 * to mark a Unit ship-ready. A `structure` / `keyframe` report is a cheap
 * diagnostic — `shipReady` is forced false on it unless the user explicitly
 * asked for that cheap mode (`explicitCheapMode`).
 */
export interface GateInfo {
  mode: EvalMode;
  /** True when `mode` ran a full-mp4 native model pass (native-video|deep-style). */
  nativeVideo: boolean;
  /** True when the user explicitly selected a non-native mode (so a non-ship
   *  verdict off keyframes is intended, not an accidental cheap gate). */
  explicitCheapMode: boolean;
  /** The single allow/deny on Unit readiness. False whenever the gate is
   *  non-native (keyframe / structure) regardless of score. */
  shipReady: boolean;
  /** Human-readable reason for the shipReady decision. */
  reason: string;
}

export interface VideoMeta {
  video: string;
  projectId: string | null;
  template: string | null;
  evaluatedAt: string;
  durationSec: number;
  resolution: { w: number; h: number };
  fps: number;
  codec: { video: string; audio: string };
  bitrateKbps: number;
}

export interface DeclaredMeta {
  durationSec: number | null;
  sceneCount: number | null;
  hookText: string | null;
  angle: string | null;
  captionStyle: string | null;
  template: string | null;
}

export interface Scene {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  firstFramePath: string | null;
}

export interface DeadAirSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface AudioStats {
  integratedLufs: number | null;
  truePeakDb: number | null;
  loudnessRangeLu: number | null;
  deadAirSegments: DeadAirSegment[];
  voicePresentPct: number;
}

export interface CaptionStats {
  available: boolean;
  wordCount: number | null;
  wordsPerSecond: number | null;
  densityWarn: boolean | null;
}

export interface VisionIssue {
  category: string;
  severity: Severity;
  message: string;
}

export interface SceneVision {
  sceneIndex: number;
  timestampSec: number;
  framePath: string;
  summary: string;
  issues: VisionIssue[];
}

export interface Finding {
  id: string;
  category: string;
  severity: Severity;
  sceneIndex: number | null;
  timestampSec: number | null;
  message: string;
  fixHint: string;
  fixCommand: string | null;
}

export interface ScoringBreakdown {
  weights: Record<string, number>;
  penalties: Record<string, number>;
  score: number;
  verdict: Verdict;
}

export interface EvalReport {
  schemaVersion: "1.0";
  /** Which validation mode produced this report + the ship-ready gate (#411). */
  gate: GateInfo;
  meta: VideoMeta;
  declared: DeclaredMeta | null;
  structure: {
    scenes: Scene[];
    sceneCount: number;
    avgSceneDurationSec: number;
    minSceneDurationSec: number;
    maxSceneDurationSec: number;
    hookZone: {
      durationSec: number;
      sceneCount: number;
      transcript: string;
      wordCount: number;
    };
  };
  audio: AudioStats;
  captions: CaptionStats;
  vision: { sceneFindings: SceneVision[] };
  findings: Finding[];
  scoring: ScoringBreakdown;
  /**
   * OPTIONAL specialized media metric-adapter results (#485). Absent on every
   * report produced before the metrics enrichment ran — consumers MUST tolerate
   * its absence. These ENRICH the report (note-only); they never change the
   * `scoring.verdict` or the `gate`.
   */
  metrics?: MetricResult[];
}
