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

import { spawn } from "node:child_process";
import type { Scene } from "./types.js";

const SCENE_THRESHOLD = 0.4;
const MIN_SCENE_SEC = 0.4;

export async function detectScenes(file: string, totalDurationSec: number): Promise<Scene[]> {
  const cuts = await runSceneDetect(file);
  const boundaries = [0, ...cuts.filter((t) => t > 0 && t < totalDurationSec), totalDurationSec];

  const scenes: Scene[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startSec = boundaries[i];
    const endSec = boundaries[i + 1];
    const durationSec = endSec - startSec;
    if (durationSec < MIN_SCENE_SEC && i < boundaries.length - 2) {
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
