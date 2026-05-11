// Per-scene keyframe extraction.
//
// We extract one frame near the *middle* of each scene (not the very
// first frame) — first-frame samples often catch transition artefacts
// from the previous scene, while a mid-scene frame is representative of
// what the viewer actually parses.

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import type { Scene } from "./types.js";

export async function extractKeyframes(
  file: string,
  scenes: Scene[],
  outDir: string,
): Promise<Scene[]> {
  await fs.mkdir(outDir, { recursive: true });
  const updated: Scene[] = [];
  for (const sc of scenes) {
    const ts = sc.startSec + sc.durationSec / 2;
    const dst = path.join(outDir, `scene-${String(sc.index).padStart(2, "0")}.jpg`);
    await extractOne(file, ts, dst);
    updated.push({ ...sc, firstFramePath: dst });
  }
  return updated;
}

function extractOne(file: string, atSec: number, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y", "-loglevel", "error",
      "-ss", String(atSec),
      "-i", file,
      "-frames:v", "1",
      "-q:v", "3",
      dst,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg keyframe extract failed at ${atSec}s: ${stderr.slice(-300)}`));
      else resolve();
    });
  });
}
