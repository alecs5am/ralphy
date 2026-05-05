// FFmpeg recipes — production-correctness primitives ported from
// browser-use/video-use (helpers/render.py + helpers/grade.py).
//
// All functions:
// - Use system `ffmpeg` (Homebrew on macOS). Verify with ensureFfmpeg().
// - Are async + return the output path.
// - Throw on non-zero exit code with stderr.
// - Optional projectId logs to workspace/projects/<id>/logs/generations.jsonl
//   via gen-log.ts (provider: "ffmpeg", cost_usd: 0).
//
// Hard rules (from /ralph-editor SKILL.md):
// - Subtitles last (after all video filtering)
// - Per-segment extract before concat (no in-place trim of concat'd file)
// - 30ms fades around cut boundaries to prevent click pops
// - PTS-shifted overlays
// - Word-boundary cuts (caller's responsibility — feed honest start/end)
// - 30-200ms padding around speech to avoid clipping consonants
// - MarginV=90 safe-zone for burned-in subtitles

import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { logGeneration } from "./gen-log.js";

export type FFmpegOptions = {
  projectId?: string;
  note?: string;
};

export function ensureFfmpeg(): void {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error("ffmpeg not found in PATH (install via `brew install ffmpeg`)");
  }
}

async function runFfmpeg(
  args: string[],
  meta: { endpoint: string; input: Record<string, unknown>; opts?: FFmpegOptions }
): Promise<{ stderr: string; durationMs: number }> {
  ensureFfmpeg();
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", async (code) => {
      const durationMs = Date.now() - t0;
      if (meta.opts?.projectId) {
        await logGeneration(meta.opts.projectId, {
          provider: "ffmpeg",
          endpoint: meta.endpoint,
          kind: "video",
          input: meta.input,
          status: code === 0 ? "ok" : "error",
          error: code === 0 ? undefined : stderr.slice(0, 500),
          latency_ms: durationMs,
          cost_usd: 0,
          note: meta.opts.note,
        });
      }
      if (code === 0) resolve({ stderr, durationMs });
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}

// --- Recipe 1: per-segment extract -------------------------------------

export type ExtractSegmentInput = {
  src: string;
  startSec: number;
  endSec: number;
  dst: string;
  /** Re-encode with explicit codec. Default true (safer, exact frame). */
  reencode?: boolean;
} & FFmpegOptions;

export async function extractSegment(input: ExtractSegmentInput): Promise<string> {
  const { src, startSec, endSec, dst, reencode = true, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const args = reencode
    ? [
        "-ss", String(startSec),
        "-to", String(endSec),
        "-i", src,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        dst,
      ]
    : [
        // stream copy — fast but cuts on keyframe boundaries
        "-ss", String(startSec),
        "-to", String(endSec),
        "-i", src,
        "-c", "copy",
        dst,
      ];
  await runFfmpeg(args, {
    endpoint: "ffmpeg/extract-segment",
    input: { src, startSec, endSec, dst, reencode },
    opts,
  });
  return dst;
}

// --- Recipe 2: lossless concat -----------------------------------------

export type ConcatLosslessInput = {
  srcs: string[];
  dst: string;
} & FFmpegOptions;

export async function concatLossless(input: ConcatLosslessInput): Promise<string> {
  const { srcs, dst, ...opts } = input;
  if (srcs.length === 0) throw new Error("concatLossless: srcs is empty");
  await fs.mkdir(path.dirname(dst), { recursive: true });
  // ffmpeg concat demuxer needs an absolute-path list file
  const listFile = path.join(path.dirname(dst), `.concat-${Date.now()}.txt`);
  const lines = srcs.map((s) => `file '${path.resolve(s).replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listFile, lines);
  try {
    await runFfmpeg(
      ["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", dst],
      {
        endpoint: "ffmpeg/concat-lossless",
        input: { srcs, dst },
        opts,
      }
    );
  } finally {
    await fs.unlink(listFile).catch(() => {});
  }
  return dst;
}

// --- Recipe 3: EBU R128 loudnorm ---------------------------------------

export type LoudnormInput = {
  src: string;
  dst: string;
  /** Target integrated loudness, default -16 LUFS (TikTok / Reels) */
  target?: number;
  /** True peak ceiling, default -1.5 dBTP */
  truePeak?: number;
  /** Loudness range, default 11 LU */
  loudnessRange?: number;
} & FFmpegOptions;

export async function loudnorm(input: LoudnormInput): Promise<string> {
  const {
    src,
    dst,
    target = -16,
    truePeak = -1.5,
    loudnessRange = 11,
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const filter = `loudnorm=I=${target}:TP=${truePeak}:LRA=${loudnessRange}`;
  await runFfmpeg(
    ["-i", src, "-af", filter, "-c:a", "aac", "-b:a", "192k", dst],
    {
      endpoint: "ffmpeg/loudnorm",
      input: { src, dst, target, truePeak, loudnessRange },
      opts,
    }
  );
  return dst;
}

// --- Recipe 4: sidechain compress (duck music under voice) -------------

export type SidechainCompressInput = {
  voice: string;
  music: string;
  dst: string;
  /** Compression threshold, default 0.05 */
  threshold?: number;
  /** Compression ratio, default 8 (heavy duck) */
  ratio?: number;
  /** Mix volumes [voice, music]. Music is pre-duck, default [1, 0.6] */
  mix?: [number, number];
} & FFmpegOptions;

export async function sidechainCompress(input: SidechainCompressInput): Promise<string> {
  const {
    voice,
    music,
    dst,
    threshold = 0.05,
    ratio = 8,
    mix = [1, 0.6] as [number, number],
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });

  // Filter graph:
  //   [music] sidechain'd by [voice] → ducked music
  //   [voice] + ducked music → mixed
  const filter = [
    `[0:a]volume=${mix[0]}[v]`,
    `[1:a]volume=${mix[1]}[m]`,
    `[m][v]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=10:release=250[mducked]`,
    `[v][mducked]amix=inputs=2:duration=longest:dropout_transition=2[mixed]`,
  ].join(";");
  await runFfmpeg(
    [
      "-i", voice,
      "-i", music,
      "-filter_complex", filter,
      "-map", "[mixed]",
      "-c:a", "aac", "-b:a", "192k",
      dst,
    ],
    {
      endpoint: "ffmpeg/sidechain-compress",
      input: { voice, music, dst, threshold, ratio, mix },
      opts,
    }
  );
  return dst;
}

// --- Recipe 5: HDR HLG/PQ → Rec.709 tonemap ----------------------------

export type TonemapHDRInput = {
  src: string;
  dst: string;
  /** Tonemap algorithm. Default "hable" (good preservation of skin tones) */
  algorithm?: "hable" | "reinhard" | "mobius" | "clip";
} & FFmpegOptions;

export async function tonemapHDR(input: TonemapHDRInput): Promise<string> {
  const { src, dst, algorithm = "hable", ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  // Standard HDR → SDR chain via zscale + tonemap.
  const filter =
    `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,` +
    `tonemap=tonemap=${algorithm}:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`;
  await runFfmpeg(
    [
      "-i", src,
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "copy",
      dst,
    ],
    {
      endpoint: "ffmpeg/tonemap-hdr",
      input: { src, dst, algorithm },
      opts,
    }
  );
  return dst;
}

// --- Recipe 6: burn subtitles (last step!) -----------------------------

export type BurnSubtitlesInput = {
  src: string;
  srt: string;
  dst: string;
  /** Vertical margin from bottom in px. Default 90 (TikTok safe zone) */
  marginV?: number;
  /** Font size in px. Default 36 */
  fontSize?: number;
  /** Font name. Default "Inter" — must be installed system-wide */
  fontName?: string;
  /** Primary text color in &HBBGGRR& ASS format. Default white */
  primaryColor?: string;
  /** Outline color in ASS format. Default black */
  outlineColor?: string;
} & FFmpegOptions;

export async function burnSubtitles(input: BurnSubtitlesInput): Promise<string> {
  const {
    src,
    srt,
    dst,
    marginV = 90,
    fontSize = 36,
    fontName = "Inter",
    primaryColor = "&HFFFFFF&",
    outlineColor = "&H000000&",
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const force =
    `FontName=${fontName},FontSize=${fontSize},` +
    `PrimaryColour=${primaryColor},OutlineColour=${outlineColor},` +
    `BorderStyle=1,Outline=3,Shadow=0,Bold=-1,` +
    `Alignment=2,MarginV=${marginV}`;
  // Escape ASS path for ffmpeg subtitles filter (single quotes, colons).
  const escSrt = srt
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
  await runFfmpeg(
    [
      "-i", src,
      "-vf", `subtitles=${escSrt}:force_style='${force}'`,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "copy",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/burn-subtitles",
      input: { src, srt, dst, marginV, fontSize, fontName },
      opts,
    }
  );
  return dst;
}
