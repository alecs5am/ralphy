// Shared types for the eval pipeline.
//
// The eval report is the single source of truth handed to a downstream
// "fixer" agent. Findings are the actionable unit: each one names a
// category, severity, optional scene/timestamp, and a copy-pasteable fix
// command when one exists.

export type Severity = "info" | "warn" | "fail";
export type Verdict = "pass" | "warn" | "fail";

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
}
