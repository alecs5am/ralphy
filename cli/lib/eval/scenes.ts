// Scene boundary detection via ffmpeg's content-difference filter.
//
// We use `select='gt(scene,0.4)',metadata=print` which writes a pts_time
// for every frame where the inter-frame content delta exceeds 0.4. The
// 0.4 threshold matches PySceneDetect's default `ContentDetector` and is
// the field-tested sweet spot for short-form UGC: lower picks up camera
// micro-jitter on handheld footage, higher misses slow whip-pans.
//
// We also enforce a 0.4s minimum scene duration to suppress flicker
// artefacts (a single-frame flash counted as its own scene).
//
// #557 adds a per-frame score PROFILE (`sceneScoreProfile`) so one ffmpeg
// pass yields both the cut list (`cutsFromProfile`) and a per-shot motion
// estimate for the reference digest's cut-adaptive sampler. The boundary
// merge rule lives in the pure `scenesFromCuts` so both paths share it.

import { spawn } from "node:child_process";
import type { Scene } from "./types.js";

export const SCENE_THRESHOLD = 0.4;
export const MIN_SCENE_SEC = 0.4;

export async function detectScenes(file: string, totalDurationSec: number): Promise<Scene[]> {
  const cuts = await runSceneDetect(file);
  return scenesFromCuts(cuts, totalDurationSec);
}

/**
 * Turn raw cut timestamps into scenes. Cuts outside (0, duration) are dropped;
 * a scene shorter than `minSceneSec` (except the last one) is merged into the
 * next scene. Pure — exported for the digest sampler and unit tests.
 */
export function scenesFromCuts(
  cuts: number[],
  totalDurationSec: number,
  minSceneSec: number = MIN_SCENE_SEC,
): Scene[] {
  const sorted = [...cuts].sort((a, b) => a - b);
  const boundaries = [0, ...sorted.filter((t) => t > 0 && t < totalDurationSec), totalDurationSec];

  const scenes: Scene[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startSec = boundaries[i]!;
    const endSec = boundaries[i + 1]!;
    const durationSec = endSec - startSec;
    if (durationSec < minSceneSec && i < boundaries.length - 2) {
      // Merge sub-threshold scene into the next boundary by skipping it.
      boundaries[i + 1] = startSec;
      continue;
    }
    scenes.push({
      index: scenes.length,
      startSec: round3(startSec),
      endSec: round3(endSec),
      durationSec: round3(durationSec),
      firstFramePath: null,
    });
  }
  return scenes;
}

/** One decoded frame's ffmpeg scene score (0..1, delta vs the previous frame). */
export interface SceneScorePoint {
  t: number;
  score: number;
}

/**
 * Per-frame scene-score profile. `scaleWidth` downsizes before scoring, which
 * keeps a 4K source fast; the default 270 px keeps hard cuts above the 0.4
 * threshold on the material #557 measured. Pass 0 to score at full size.
 */
export function sceneScoreProfile(
  file: string,
  opts: { scaleWidth?: number } = {},
): Promise<SceneScorePoint[]> {
  const scaleWidth = opts.scaleWidth ?? 270;
  const vf = [
    ...(scaleWidth > 0 ? [`scale=${scaleWidth}:-2`] : []),
    "select='gte(scene,0)'",
    "metadata=print:file=-",
  ].join(",");
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-i", file, "-vf", vf, "-an", "-f", "null", "-"]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg scene profile failed: ${stderr.slice(-500)}`));
      resolve(parseSceneScoreProfile(stdout));
    });
  });
}

/** Parse `metadata=print` output (`frame:N pts:… pts_time:T` + `lavfi.scene_score=S`). */
export function parseSceneScoreProfile(text: string): SceneScorePoint[] {
  const points: SceneScorePoint[] = [];
  let pending: number | null = null;
  for (const line of text.split("\n")) {
    const tm = line.match(/pts_time:([0-9.eE+-]+)/);
    if (tm) {
      pending = parseFloat(tm[1]!);
      continue;
    }
    const sm = line.match(/lavfi\.scene_score=([0-9.eE+-]+)/);
    if (sm && pending !== null) {
      points.push({ t: pending, score: parseFloat(sm[1]!) });
      pending = null;
    }
  }
  return points;
}

/** Cut timestamps = frames whose score exceeds `threshold` (the first frame never counts). */
export function cutsFromProfile(profile: SceneScorePoint[], threshold: number = SCENE_THRESHOLD): number[] {
  return profile.filter((p, i) => i > 0 && p.score > threshold).map((p) => round3(p.t));
}

function runSceneDetect(file: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", file,
      "-vf", `select='gt(scene,${SCENE_THRESHOLD})',metadata=print:file=-`,
      "-an", "-f", "null", "-",
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg scene-detect failed: ${stderr.slice(-500)}`));
      const cuts: number[] = [];
      for (const line of stdout.split("\n")) {
        const m = line.match(/pts_time:([0-9.]+)/);
        if (m) cuts.push(parseFloat(m[1]));
      }
      resolve(cuts);
    });
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
