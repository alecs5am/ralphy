// Synthetic near-duplicate media for the originality tests (#561). Every clip
// is generated locally with ffmpeg lavfi sources in a temp dir: no downloads,
// no providers. The BASE clip is four visually distinct 2 s segments over a
// stepped-tone melody; the variants are the cosmetic edits the research note
// calls out (mirror, speed, grade, crop + trim) and two genuinely different
// pieces (a re-edit that reorders the segments under a new soundtrack, and an
// unrelated clip).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SIZE = "320x180";
const RATE = 15;
const SEGMENT_SEC = 2;

const SEGMENTS = [
  `testsrc2=s=${SIZE}:r=${RATE}`,
  `mandelbrot=s=${SIZE}:r=${RATE}`,
  `colorspectrum=s=${SIZE}:r=${RATE}:type=all,rotate=a=0.4*t`,
  `sierpinski=s=${SIZE}:r=${RATE}:jump=40:seed=11`,
];

const MELODY = "aevalsrc='0.5*sin(2*PI*t*(220+110*mod(floor(t*3),7)))':s=16000";
const NEW_VO = "aevalsrc='0.5*sin(2*PI*t*(523+90*mod(floor(t*5),4)))*(0.6+0.4*sin(2*PI*t*1.3))':s=16000";
const OTHER_TRACK = "aevalsrc='0.4*sin(2*PI*t*(330+70*mod(floor(t*2),9)))+0.2*sin(2*PI*t*97)':s=16000";

export interface SyntheticSet {
  dir: string;
  base: string;
  mirrored: string;
  sped: string;
  regraded: string;
  croppedTrimmed: string;
  reordered: string;
  unrelated: string;
  still: string;
  stillMirrored: string;
  stillUnrelated: string;
}

function ffmpeg(args: string[]): void {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr}`);
}

/** Concatenate lavfi segments (in the given order) over one audio source. */
function composite(out: string, order: number[], audio: string): void {
  const inputs: string[] = [];
  for (const index of order) inputs.push("-f", "lavfi", "-t", String(SEGMENT_SEC), "-i", SEGMENTS[index]!);
  const total = order.length * SEGMENT_SEC;
  inputs.push("-f", "lavfi", "-t", String(total), "-i", audio);
  const labels = order.map((_, i) => `[${i}:v]format=yuv420p,setsar=1[v${i}]`).join(";");
  const concat = `${order.map((_, i) => `[v${i}]`).join("")}concat=n=${order.length}:v=1:a=0[v]`;
  ffmpeg([
    ...inputs,
    "-filter_complex", `${labels};${concat}`,
    "-map", "[v]", "-map", `${order.length}:a`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-shortest",
    out,
  ]);
}

/** Generate the full synthetic set into `dir` (created when missing). */
export function buildSyntheticSet(dir: string): SyntheticSet {
  fs.mkdirSync(dir, { recursive: true });
  const p = (name: string) => path.join(dir, name);
  const set: SyntheticSet = {
    dir,
    base: p("base.mp4"),
    mirrored: p("mirrored.mp4"),
    sped: p("sped.mp4"),
    regraded: p("regraded.mp4"),
    croppedTrimmed: p("cropped-trimmed.mp4"),
    reordered: p("reordered.mp4"),
    unrelated: p("unrelated.mp4"),
    still: p("still.png"),
    stillMirrored: p("still-mirrored.png"),
    stillUnrelated: p("still-unrelated.png"),
  };
  composite(set.base, [0, 1, 2, 3], MELODY);
  const enc = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k"];
  ffmpeg(["-i", set.base, "-vf", "hflip", ...enc, set.mirrored]);
  ffmpeg(["-i", set.base, "-vf", "setpts=PTS/1.2", "-af", "atempo=1.2", ...enc, set.sped]);
  ffmpeg([
    "-i", set.base,
    "-vf", "eq=contrast=1.25:saturation=1.6:gamma=0.85,colorbalance=rs=0.25:bs=-0.2",
    ...enc, set.regraded,
  ]);
  ffmpeg(["-ss", "0.7", "-i", set.base, "-vf", `crop=iw*0.9:ih*0.9,scale=${SIZE.replace("x", ":")}`, ...enc, set.croppedTrimmed]);
  // A re-edit: the same four shots in a new order, under a new voice track.
  composite(set.reordered, [2, 0, 3, 1], NEW_VO);
  // Unrelated: different generators and a different track.
  const unrelatedSources = [`life=s=${SIZE}:r=${RATE}:seed=3:mold=10`, `cellauto=s=${SIZE}:r=${RATE}:rule=30:seed=5`];
  ffmpeg([
    "-f", "lavfi", "-t", "4", "-i", unrelatedSources[0]!,
    "-f", "lavfi", "-t", "4", "-i", unrelatedSources[1]!,
    "-f", "lavfi", "-t", "8", "-i", OTHER_TRACK,
    "-filter_complex", "[0:v]format=yuv420p,setsar=1[a];[1:v]format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]",
    "-map", "[v]", "-map", "2:a", ...enc, "-shortest", set.unrelated,
  ]);
  ffmpeg(["-f", "lavfi", "-i", `testsrc2=s=${SIZE}:r=1`, "-frames:v", "1", set.still]);
  ffmpeg(["-i", set.still, "-vf", "hflip,eq=brightness=0.06", "-frames:v", "1", set.stillMirrored]);
  ffmpeg(["-f", "lavfi", "-i", `mandelbrot=s=${SIZE}:r=1`, "-frames:v", "1", set.stillUnrelated]);
  return set;
}

/** True when ffmpeg is on PATH (the tests skip cleanly otherwise). */
export function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}
