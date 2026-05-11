// Aggregate raw measurements into actionable findings + a verdict score.
//
// Two stages:
//   1. Rule-based findings — deterministic checks against the metadata,
//      audio stats, structure, and (when available) the declared
//      scenario. These produce most of the warnings the fixer agent
//      cares about (loudness off-target, dead-air, duration drift,
//      thin caption density, etc.).
//   2. Vision-derived findings — one Finding per VisionIssue, lifted
//      verbatim with scene-index and timestamp attached.
//
// Score is computed by stacking penalties on a 100-point base. The
// weights are tuned so a clean video clears 85+, a working draft with
// a couple of warns lands 65-80, and a video with any "fail" finding
// drops below 60.

import type {
  AudioStats,
  CaptionStats,
  DeclaredMeta,
  Finding,
  ScoringBreakdown,
  Scene,
  SceneVision,
  Severity,
  VideoMeta,
  Verdict,
} from "./types.js";

const TARGET_LUFS = -16;
const LUFS_WARN_DELTA = 1.5;
const LUFS_FAIL_DELTA = 3;
const TP_WARN_OVER = 0.0;
// Dead-air severity ladder. Sub-0.8s pauses are filtered upstream in
// audio.ts (normal speech cadence); these thresholds only apply to gaps
// that reached us.
const DEAD_AIR_INFO_SEC = 0.8;
const DEAD_AIR_WARN_SEC = 1.5;
const DEAD_AIR_FAIL_SEC = 2.5;
const HOOK_ZONE_SEC = 3;
const MIN_HOOK_WORDS = 4;
const MIN_WPS = 1.5;
const MAX_WPS = 4.5;
const DURATION_DRIFT_WARN_PCT = 0.10;
const DURATION_DRIFT_FAIL_PCT = 0.25;

const PENALTY: Record<Severity, number> = { info: 1, warn: 6, fail: 18 };

export function buildFindings(input: {
  meta: VideoMeta;
  declared: DeclaredMeta | null;
  scenes: Scene[];
  audio: AudioStats;
  captions: CaptionStats;
  vision: SceneVision[];
  hookTranscript: string;
}): Finding[] {
  const f: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => f.push({ id: `F${nextId++}`, ...x });

  // — Resolution / orientation
  const { w, h } = input.meta.resolution;
  if (h <= w) {
    add({
      category: "format.aspect-ratio",
      severity: "fail",
      sceneIndex: null,
      timestampSec: null,
      message: `Video is landscape/square (${w}x${h}). TikTok/Reels/Shorts require 9:16 vertical.`,
      fixHint: "Re-render in 9:16 (1080x1920). For repurposing 16:9 source, use a smart-crop reframe pass.",
      fixCommand: null,
    });
  } else if (w !== 1080 || h !== 1920) {
    add({
      category: "format.resolution",
      severity: "warn",
      sceneIndex: null,
      timestampSec: null,
      message: `Resolution is ${w}x${h}. Recommended: 1080x1920.`,
      fixHint: "Re-render at 1080x1920 or scale via ffmpeg.",
      fixCommand: null,
    });
  }

  if (input.meta.fps < 24 || input.meta.fps > 60) {
    add({
      category: "format.fps",
      severity: "warn",
      sceneIndex: null,
      timestampSec: null,
      message: `Frame rate is ${input.meta.fps} fps. Expected 24-60.`,
      fixHint: "Re-render at 30 fps (the safe default for short-form UGC).",
      fixCommand: null,
    });
  }

  // — Duration vs declared
  if (input.declared?.durationSec) {
    const drift = (input.meta.durationSec - input.declared.durationSec) / input.declared.durationSec;
    if (Math.abs(drift) >= DURATION_DRIFT_FAIL_PCT) {
      add({
        category: "structure.duration-drift",
        severity: "fail",
        sceneIndex: null,
        timestampSec: null,
        message: `Rendered ${input.meta.durationSec.toFixed(1)}s vs declared ${input.declared.durationSec}s (${(drift * 100).toFixed(0)}% drift).`,
        fixHint: "Re-time the composition to actual VO duration via `ralphy project transcribe` (MODELS.md notes eleven_v3 runs ~15-25% longer than scripted).",
        fixCommand: input.meta.projectId ? `ralphy project transcribe ${input.meta.projectId}` : null,
      });
    } else if (Math.abs(drift) >= DURATION_DRIFT_WARN_PCT) {
      add({
        category: "structure.duration-drift",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Rendered ${input.meta.durationSec.toFixed(1)}s vs declared ${input.declared.durationSec}s (${(drift * 100).toFixed(0)}% drift).`,
        fixHint: "Update scenario.durationSec to actual rendered length, or re-time the composition.",
        fixCommand: null,
      });
    }
  }

  // — Audio loudness
  if (input.audio.integratedLufs !== null) {
    const delta = input.audio.integratedLufs - TARGET_LUFS;
    const abs = Math.abs(delta);
    if (abs >= LUFS_FAIL_DELTA) {
      add({
        category: "audio.loudness",
        severity: "fail",
        sceneIndex: null,
        timestampSec: null,
        message: `Integrated loudness ${input.audio.integratedLufs.toFixed(1)} LUFS, target ${TARGET_LUFS} LUFS (${delta > 0 ? "too loud" : "too quiet"} by ${abs.toFixed(1)} LU).`,
        fixHint: "Apply EBU R128 normalization to -16 LUFS / -1.5 dBTP / 11 LU range.",
        fixCommand: `ffmpeg -i <in> -af loudnorm=I=-16:TP=-1.5:LRA=11 <out>`,
      });
    } else if (abs >= LUFS_WARN_DELTA) {
      add({
        category: "audio.loudness",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Integrated loudness ${input.audio.integratedLufs.toFixed(1)} LUFS, target ${TARGET_LUFS} LUFS.`,
        fixHint: "Apply EBU R128 normalization.",
        fixCommand: `ffmpeg -i <in> -af loudnorm=I=-16:TP=-1.5:LRA=11 <out>`,
      });
    }
  }
  if (input.audio.truePeakDb !== null && input.audio.truePeakDb > TP_WARN_OVER) {
    add({
      category: "audio.true-peak",
      severity: "fail",
      sceneIndex: null,
      timestampSec: null,
      message: `True peak ${input.audio.truePeakDb.toFixed(2)} dBFS exceeds ceiling — clipping likely.`,
      fixHint: "Lower the master gain or apply true-peak limiter at -1.5 dBTP.",
      fixCommand: `ffmpeg -i <in> -af loudnorm=I=-16:TP=-1.5:LRA=11 <out>`,
    });
  }

  // — Dead air. Severity ladder so a fixer agent can prioritize:
  // info = noticeable pause, warn = drag, fail = retention killer.
  for (const seg of input.audio.deadAirSegments) {
    const sev: Severity =
      seg.durationSec >= DEAD_AIR_FAIL_SEC ? "fail" :
      seg.durationSec >= DEAD_AIR_WARN_SEC ? "warn" :
      seg.durationSec >= DEAD_AIR_INFO_SEC ? "info" : "info";
    add({
      category: "audio.dead-air",
      severity: sev,
      sceneIndex: null,
      timestampSec: seg.startSec,
      message: `Silence ${seg.durationSec.toFixed(2)}s from ${seg.startSec.toFixed(2)}s to ${seg.endSec.toFixed(2)}s.`,
      fixHint: "Trim the silent segment, layer in a music bed, or shorten the gap by re-cutting the timeline.",
      fixCommand: null,
    });
  }

  // — Hook zone
  if (input.scenes.length > 0) {
    const hookScenes = input.scenes.filter((s) => s.startSec < HOOK_ZONE_SEC);
    if (hookScenes.length === 0) {
      add({
        category: "structure.hook-zone-empty",
        severity: "fail",
        sceneIndex: null,
        timestampSec: 0,
        message: "No scene cut in first 3 seconds. Hook zone has no visual variation.",
        fixHint: "Add a cut or motion beat in the first 1-2s. Static openers lose >40% of viewers in 2s.",
        fixCommand: null,
      });
    } else if (hookScenes[0].durationSec > 2.5) {
      add({
        category: "structure.hook-zone-static",
        severity: "warn",
        sceneIndex: 0,
        timestampSec: 0,
        message: `First scene runs ${hookScenes[0].durationSec.toFixed(2)}s without a cut. Hooks under 1.5s read as more dynamic.`,
        fixHint: "Insert a sub-cut or pattern-interrupt within the first 2s.",
        fixCommand: null,
      });
    }

    const hookWords = countWords(input.hookTranscript);
    if (hookWords < MIN_HOOK_WORDS && input.captions.available) {
      add({
        category: "structure.hook-zone-thin-vo",
        severity: "warn",
        sceneIndex: null,
        timestampSec: 0,
        message: `Hook zone (0-3s) carries ${hookWords} words. A scroll-stopping hook is typically 5-9 words.`,
        fixHint: "Re-script the opening line so the verbal hook lands inside the first 3 seconds.",
        fixCommand: null,
      });
    }
  }

  // — Caption density
  if (input.captions.available && input.captions.wordsPerSecond !== null) {
    const wps = input.captions.wordsPerSecond;
    if (wps < MIN_WPS) {
      add({
        category: "captions.thin",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Caption density ${wps.toFixed(2)} words/sec — under the 1.5-4.5 readable band.`,
        fixHint: "Tighten the script or remove gaps. Sub-1.5 wps reads as draggy on shortform.",
        fixCommand: null,
      });
    } else if (wps > MAX_WPS) {
      add({
        category: "captions.dense",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Caption density ${wps.toFixed(2)} words/sec — over 4.5 wps is hard to read.`,
        fixHint: "Slow the VO, drop filler words, or split into more scenes.",
        fixCommand: null,
      });
    }
  } else if (!input.captions.available) {
    add({
      category: "captions.missing",
      severity: "info",
      sceneIndex: null,
      timestampSec: null,
      message: "No captions.json found alongside this video.",
      fixHint: "Generate captions to surface caption-density / readability findings.",
      fixCommand: input.meta.projectId
        ? `ralphy generate captions --project ${input.meta.projectId} --audio <vo.mp3> --language en`
        : null,
    });
  }

  // — Vision findings (one Finding per issue)
  for (const sv of input.vision) {
    for (const issue of sv.issues) {
      add({
        category: `vision.${issue.category}`,
        severity: issue.severity,
        sceneIndex: sv.sceneIndex,
        timestampSec: sv.timestampSec,
        message: issue.message,
        fixHint: defaultFixHint(issue.category),
        fixCommand: null,
      });
    }
  }

  return f;
}

export function score(findings: Finding[]): ScoringBreakdown {
  const penalties: Record<string, number> = { info: 0, warn: 0, fail: 0 };
  for (const f of findings) {
    penalties[f.severity] = (penalties[f.severity] ?? 0) + PENALTY[f.severity];
  }
  const total = penalties.info + penalties.warn + penalties.fail;
  const raw = 100 - total;
  const clamped = Math.max(0, Math.min(100, raw));
  const verdict: Verdict = penalties.fail > 0 ? "fail" : penalties.warn >= 12 ? "warn" : clamped < 70 ? "warn" : "pass";
  return {
    weights: { info: PENALTY.info, warn: PENALTY.warn, fail: PENALTY.fail },
    penalties,
    score: clamped,
    verdict,
  };
}

function countWords(s: string): number {
  return s.trim() === "" ? 0 : s.trim().split(/\s+/).length;
}

function defaultFixHint(category: string): string {
  switch (category) {
    case "ai-artifacts":
      return "Re-generate the affected keyframe with a tighter prompt or a different seed; consider switching to gpt-5.4-image-2 for hands/faces.";
    case "text":
      return "Move the overlay inside the safe-zone (Y 210-1480, X 60-960 of 1080x1920); raise contrast or font weight.";
    case "composition":
      return "Reframe the keyframe — recenter the subject for 9:16 or shift the focal element into the rule-of-thirds zone.";
    case "brand":
      return "Remove the offending element (logo, watermark, etc.) before re-publishing.";
    case "quality":
      return "Bump bitrate on render or re-generate the source clip — visible compression / blur reads as low-effort.";
    default:
      return "Review the flagged frame and address the issue described above.";
  }
}
