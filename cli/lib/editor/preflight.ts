// Pure helpers for `ralphy editor preflight` — extracted from
// cli/commands/editor.ts so the aggregation logic is unit-testable without
// spawning ffprobe (#034).

import type { ProbeResult } from "../ffprobe.js";

/** One clip row in the preflight table (the "what we have on disk" view). */
export type PreflightClipRow = {
  slot: string;
  path: string;
  exists: boolean;
  durationSec?: number;
  fps?: number;
  codec?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  sizeBytes?: number;
  aspect?: string;
  width?: number;
  height?: number;
  error?: string;
};

/** Lightweight scene shape — accepts both record and array scenario layouts. */
export type ScenarioScene = {
  id?: string;
  /** Slot or asset key the scene expects to find on disk. */
  slot?: string;
  /** Optional duration target — used for music-gap math when present. */
  durationSec?: number;
};

export type ScenarioLike = {
  scenes?: Record<string, ScenarioScene> | ScenarioScene[];
};

/** Music-gap result, used by both the JSON payload and the pretty printer. */
export type MusicGap = {
  /** Sum of all clip durations (sec). */
  totalClipSec: number;
  /** Longest music track (sec) — the cut budget. */
  musicSec: number;
  /** clipSec - musicSec. Positive = clips exceed music; negative = music exceeds clips. */
  deltaSec: number;
  /** Tolerance the user specified. */
  toleranceSec: number;
  /** True if |delta| > tolerance. */
  exceedsTolerance: boolean;
};

/** Completeness result against scenario.json. */
export type CompletenessResult = {
  /** True when every scene has a matching clip on disk. */
  ok: boolean;
  /** Scene ids that have no matching clip on disk. */
  missingScenes: string[];
  /** Clip slots that don't correspond to any scene (informational, not a failure). */
  unmatchedClips: string[];
  /** Total scene count in the scenario. */
  totalScenes: number;
};

/**
 * Build the per-clip preflight row from a `ProbeResult` + the slot id derived
 * from its filename. Pure function — easy to unit-test with a synthetic probe.
 */
export function buildPreflightRow(slot: string, probe: ProbeResult): PreflightClipRow {
  // Aspect ratio (reduced GCD) when both dims are present.
  let aspect: string | undefined;
  if (probe.width && probe.height) {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(probe.width, probe.height);
    aspect = `${probe.width / g}:${probe.height / g}`;
  }
  // codec_name on the video stream first, fall back to first codec in the list.
  const codec = probe.codecs && probe.codecs.length > 0 ? probe.codecs[0] : undefined;
  return {
    slot,
    path: probe.path,
    exists: probe.exists,
    durationSec: probe.duration_s,
    fps: probe.fps,
    codec,
    hasAudio: probe.has_audio,
    hasVideo: probe.has_video,
    sizeBytes: probe.size_bytes,
    aspect,
    width: probe.width,
    height: probe.height,
    error: probe.error,
  };
}

/**
 * Music-gap math: total clip duration vs longest music track. We use the max
 * music length (not sum) because the editor typically picks ONE bed; multiple
 * tracks in `artifacts/music/` are alternates, not stems to be concatenated.
 */
export function computeMusicGap(
  clipDurationsSec: number[],
  musicDurationsSec: number[],
  toleranceSec: number,
): MusicGap | null {
  if (clipDurationsSec.length === 0 || musicDurationsSec.length === 0) return null;
  const totalClipSec = clipDurationsSec.reduce((a, b) => a + b, 0);
  const musicSec = Math.max(...musicDurationsSec);
  const deltaSec = totalClipSec - musicSec;
  return {
    totalClipSec: Math.round(totalClipSec * 1000) / 1000,
    musicSec: Math.round(musicSec * 1000) / 1000,
    deltaSec: Math.round(deltaSec * 1000) / 1000,
    toleranceSec,
    exceedsTolerance: Math.abs(deltaSec) > toleranceSec,
  };
}

/**
 * Completeness check: every scenario scene must have a matching clip on disk.
 * Matching rule: scene id (or scene.slot) appears as a prefix of the clip slot.
 *   - scene "scene-01" matches "scene-01-vid", "scene-01-anchor", etc.
 *   - scene "intro" matches "intro" or "intro-vid".
 */
export function checkCompleteness(
  scenario: ScenarioLike | null | undefined,
  clipSlots: string[],
): CompletenessResult {
  const scenes: Array<{ id: string }> = [];
  if (scenario && scenario.scenes) {
    const s = scenario.scenes;
    if (Array.isArray(s)) {
      for (const sc of s) {
        const id = sc?.slot ?? sc?.id;
        if (typeof id === "string" && id) scenes.push({ id });
      }
    } else if (typeof s === "object") {
      for (const [key, sc] of Object.entries(s)) {
        const id = (sc as ScenarioScene | undefined)?.slot ?? (sc as ScenarioScene | undefined)?.id ?? key;
        if (typeof id === "string" && id) scenes.push({ id });
      }
    }
  }
  const matched = new Set<string>();
  const missingScenes: string[] = [];
  for (const sc of scenes) {
    const hit = clipSlots.find((cs) => cs === sc.id || cs.startsWith(`${sc.id}-`));
    if (hit) matched.add(hit);
    else missingScenes.push(sc.id);
  }
  const unmatchedClips = clipSlots.filter((cs) => !matched.has(cs));
  return {
    ok: missingScenes.length === 0,
    missingScenes,
    unmatchedClips,
    totalScenes: scenes.length,
  };
}
