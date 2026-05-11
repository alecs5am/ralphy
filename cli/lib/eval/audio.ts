// Audio analysis — loudness (ebur128) + dead-air detection (silencedetect).
//
// Targets are TikTok / Reels / Shorts norm:
//   I  = -16 LUFS  (integrated)
//   TP = -1.5 dBFS (true peak)
//   LRA ≤ 11 LU
// See docs/playbooks/editor.md → "Loudness target".
//
// Dead-air threshold: 0.5s of audio below -35 dBFS. For short-form UGC,
// silence longer than 0.5s reads as a glitch; longer than 1.0s actively
// kills retention.

import { spawn } from "node:child_process";
import type { AudioStats, DeadAirSegment } from "./types.js";

const SILENCE_THRESHOLD_DB = -35;
// Anything shorter than 0.8s is normal speech pause / breath, not dead-air.
// We surface from 0.8s up so the fixer agent isn't drowned in cadence noise.
const SILENCE_MIN_SEC = 0.8;

export async function analyzeAudio(file: string, totalDurationSec: number): Promise<AudioStats> {
  const stderr = await runFilter(file, [
    "-af", `ebur128=peak=true,silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:duration=${SILENCE_MIN_SEC}`,
    "-f", "null", "-",
  ]);

  const loudness = parseLoudness(stderr);
  const deadAir = parseSilences(stderr);
  const deadAirTotal = deadAir.reduce((s, d) => s + d.durationSec, 0);
  const voicePresentPct = totalDurationSec > 0 ? round3(1 - deadAirTotal / totalDurationSec) : 0;

  return {
    integratedLufs: loudness.integrated,
    truePeakDb: loudness.truePeak,
    loudnessRangeLu: loudness.range,
    deadAirSegments: deadAir,
    voicePresentPct,
  };
}

interface ParsedLoudness {
  integrated: number | null;
  truePeak: number | null;
  range: number | null;
}

function parseLoudness(stderr: string): ParsedLoudness {
  const summaryStart = stderr.lastIndexOf("Summary:");
  const tail = summaryStart >= 0 ? stderr.slice(summaryStart) : stderr;
  const i = tail.match(/I:\s*(-?[\d.]+)\s*LUFS/);
  const tp = tail.match(/Peak:\s*(-?[\d.]+)\s*dBFS/);
  const lra = tail.match(/LRA:\s*(-?[\d.]+)\s*LU/);
  return {
    integrated: i ? parseFloat(i[1]) : null,
    truePeak: tp ? parseFloat(tp[1]) : null,
    range: lra ? parseFloat(lra[1]) : null,
  };
}

function parseSilences(stderr: string): DeadAirSegment[] {
  const segments: DeadAirSegment[] = [];
  const startRe = /silence_start:\s*([\d.]+)/g;
  const endRe = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(stderr)) !== null) starts.push(parseFloat(m[1]));
  let i = 0;
  while ((m = endRe.exec(stderr)) !== null) {
    const endSec = parseFloat(m[1]);
    const durationSec = parseFloat(m[2]);
    const startSec = starts[i] ?? round3(endSec - durationSec);
    segments.push({ startSec: round3(startSec), endSec: round3(endSec), durationSec: round3(durationSec) });
    i++;
  }
  return segments;
}

function runFilter(file: string, filterArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-i", file, ...filterArgs]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg audio analysis failed: ${stderr.slice(-500)}`));
      else resolve(stderr);
    });
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
