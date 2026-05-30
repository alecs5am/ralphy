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
// Hard rules (from editor playbook SKILL.md):
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
import { protectExistingAsset } from "./providers/shared.js";

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

type FFmpegLogKind = "video" | "audio";

async function runFfmpeg(
  args: string[],
  meta: { endpoint: string; input: Record<string, unknown>; opts?: FFmpegOptions; kind?: FFmpegLogKind }
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
          model: meta.endpoint,
          endpoint: meta.endpoint,
          kind: meta.kind ?? "video",
          input: { project: meta.opts.projectId, ...meta.input },
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
  // Codec is auto-picked by ffmpeg from the output extension. Bitrate fixed
  // at 192k — fine for both libmp3lame (.mp3) and aac (.m4a / .aac).
  await runFfmpeg(
    ["-i", src, "-af", filter, "-b:a", "192k", dst],
    {
      endpoint: "ffmpeg/loudnorm",
      input: { src, dst, target, truePeak, loudnessRange },
      opts,
      kind: "audio",
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
  /**
   * Optional EBU R128 loudnorm pass on the mixed output. When set, the
   * filter graph chains a `loudnorm=I=<target>:TP=-1.5:LRA=11` step after
   * the amix label so the final file lands on-target. Common targets:
   *   -16 LUFS (TikTok / Reels / Shorts default)
   *   -14 LUFS (Spotify / YouTube)
   *   -23 LUFS (EBU broadcast)
   * Pass a number to enable, omit/undefined to skip.
   */
  loudnorm?: number;
} & FFmpegOptions;

/**
 * Build the filter_complex string used by `sidechainCompress`. Exported so
 * unit tests can assert label correctness without spawning ffmpeg.
 *
 * Hard-won detail (#011): internal filter labels MUST be multi-char.
 * Single-letter labels like `[v]` / `[m]` get parsed by ffmpeg's stream
 * specifier grammar before they reach the filtergraph parser, causing
 * `Stream specifier 'v' matches no streams` and exit 234. Use `[voice]`,
 * `[music]`, `[mducked]`, `[mixed]` — verified accepted by ffmpeg 7.1+.
 */
export function buildSidechainFilter(opts: {
  threshold: number;
  ratio: number;
  mix: [number, number];
  loudnorm?: number;
}): string {
  const { threshold, ratio, mix, loudnorm: lufs } = opts;
  const chain = [
    `[0:a]volume=${mix[0]}[voice]`,
    `[1:a]volume=${mix[1]}[music]`,
    `[music][voice]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=10:release=250[mducked]`,
  ];
  if (typeof lufs === "number" && Number.isFinite(lufs)) {
    chain.push(
      `[voice][mducked]amix=inputs=2:duration=longest:dropout_transition=2[premix]`,
      `[premix]loudnorm=I=${lufs}:TP=-1.5:LRA=11[mixed]`,
    );
  } else {
    chain.push(
      `[voice][mducked]amix=inputs=2:duration=longest:dropout_transition=2[mixed]`,
    );
  }
  return chain.join(";");
}

export async function sidechainCompress(input: SidechainCompressInput): Promise<string> {
  const {
    voice,
    music,
    dst,
    threshold = 0.05,
    ratio = 8,
    mix = [1, 0.6] as [number, number],
    loudnorm: loudnormTarget,
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });

  // Filter graph:
  //   [music] sidechain'd by [voice] → ducked music
  //   [voice] + ducked music → mixed (optionally loudnorm'd)
  const filter = buildSidechainFilter({
    threshold,
    ratio,
    mix,
    loudnorm: loudnormTarget,
  });
  await runFfmpeg(
    [
      "-i", voice,
      "-i", music,
      "-filter_complex", filter,
      "-map", "[mixed]",
      "-b:a", "192k",
      dst,
    ],
    {
      endpoint: "ffmpeg/sidechain-compress",
      input: { voice, music, dst, threshold, ratio, mix, loudnorm: loudnormTarget },
      opts,
      kind: "audio",
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

// --- Recipe 7: optimize / re-encode -----------------------------------------
//
// Lossy re-encode tuned for noise/grain-heavy content (analog-horror, VHS
// effects, snow). x264 `-tune grain` preserves random noise texture at lower
// bitrates instead of smearing it — perceptually identical to source on noisy
// content but 4–8× smaller files. For clean motion content prefer `--tune
// film` or omit `--tune`.

export type OptimizeInput = {
  src: string;
  dst: string;
  crf?: number; // 18 = visually lossless, 23 = high web quality, 28 = small
  preset?:
    | "ultrafast"
    | "superfast"
    | "veryfast"
    | "faster"
    | "fast"
    | "medium"
    | "slow"
    | "slower"
    | "veryslow";
  tune?: "grain" | "film" | "animation" | "stillimage" | "fastdecode";
  audioBitrate?: string; // e.g. "128k"
} & FFmpegOptions;

export async function optimizeReencode(input: OptimizeInput): Promise<string> {
  const {
    src,
    dst,
    crf = 23,
    preset = "slow",
    tune = "grain",
    audioBitrate = "128k",
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await runFfmpeg(
    [
      "-i", src,
      "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-tune", tune,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", audioBitrate,
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/optimize",
      input: { src, dst, crf, preset, tune, audioBitrate },
      opts,
    }
  );
  return dst;
}

function probeDurationSec(src: string): number {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", src],
    { encoding: "utf8" }
  );
  const v = parseFloat((r.stdout || "").trim());
  return Number.isFinite(v) ? v : 0;
}

function probeHasAudio(src: string): boolean {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", src],
    { encoding: "utf8" }
  );
  return (r.stdout || "").trim().length > 0;
}

// --- Recipe 8: add music bed over existing video audio -----------------

export type AddMusicBedInput = {
  /** Input video (with optional existing audio track) */
  src: string;
  /** Music audio file (mp3/m4a/wav) */
  music: string;
  /** Output video */
  dst: string;
  /** Music gain. Default 1.0 (full) */
  musicVol?: number;
  /** Existing-audio gain. Default 0.4 (background SFX) */
  sfxVol?: number;
  /** Music fade-out in seconds, anchored to video end. Default 1.5 */
  fadeOutSec?: number;
  /** Music fade-in in seconds. Default 0.0 */
  fadeInSec?: number;
  /** Sidechain duck music under SFX (music breathes when SFX hits). Default false (flat amix). */
  duck?: boolean;
  /** Sidechain compressor threshold, default 0.05 */
  duckThreshold?: number;
  /** Sidechain compressor ratio, default 8 */
  duckRatio?: number;
} & FFmpegOptions;

export async function addMusicBed(input: AddMusicBedInput): Promise<string> {
  const {
    src,
    music,
    dst,
    musicVol = 1.0,
    sfxVol = 0.4,
    fadeOutSec = 1.5,
    fadeInSec = 0,
    duck = false,
    duckThreshold = 0.05,
    duckRatio = 8,
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });

  const videoDurSec = probeDurationSec(src);
  if (videoDurSec <= 0) throw new Error(`Could not probe duration of ${src}`);
  const fadeOutStart = Math.max(0, videoDurSec - fadeOutSec);

  const musicChain =
    `volume=${musicVol}` +
    (fadeInSec > 0 ? `,afade=t=in:st=0:d=${fadeInSec}` : "") +
    (fadeOutSec > 0 ? `,afade=t=out:st=${fadeOutStart}:d=${fadeOutSec}` : "");

  const hasSourceAudio = probeHasAudio(src);

  // No-audio source (e.g. HyperFrames silent render): emit music-only audio.
  // amix with duration=first → output length = video audio length.
  // normalize=0 keeps explicit volumes (default amix normalize would halve them).
  // duck=true: route music through sidechaincompress keyed by SFX, then mix.
  // Multi-char labels everywhere (#011) — `[m]` collides with ffmpeg's
  // stream-specifier grammar and trips exit 234. Use `[music]` instead.
  const filter = !hasSourceAudio
    ? `[1:a]${musicChain}[mix]`
    : duck
      ? [
          `[0:a]volume=${sfxVol}[sfx]`,
          `[1:a]${musicChain}[music]`,
          `[music][sfx]sidechaincompress=threshold=${duckThreshold}:ratio=${duckRatio}:attack=10:release=250[mducked]`,
          `[sfx][mducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`,
        ].join(";")
      : [
          `[0:a]volume=${sfxVol}[sfx]`,
          `[1:a]${musicChain}[music]`,
          `[sfx][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`,
        ].join(";");

  await runFfmpeg(
    [
      "-i", src,
      "-i", music,
      "-filter_complex", filter,
      "-map", "0:v",
      "-map", "[mix]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/add-music-bed",
      input: { src, music, dst, musicVol, sfxVol, fadeOutSec, fadeInSec, duck, duckThreshold, duckRatio, videoDurSec, hasSourceAudio },
      opts,
    }
  );
  return dst;
}

// --- Recipe 9: color grade presets (#036) ------------------------------
//
// Four preset tables. Each maps to an ffmpeg -vf chain combining `eq`,
// `colorchannelmixer`, and `curves` to land the deliverable in a consistent
// register without per-project regrade. Validated against the venom-bodywash
// and analog-horror-fridge postmortems.

export type ColorGradePreset =
  | "tv-commercial-soft"
  | "tv-commercial-strong"
  | "cinematic-teal-orange"
  | "analog-horror";

/**
 * Build the -vf filter string for a named grade preset. Exported so unit
 * tests can assert each preset's chain verbatim without spawning ffmpeg.
 */
export function buildColorGradeFilter(preset: ColorGradePreset): string {
  switch (preset) {
    case "tv-commercial-soft":
      // Lifted shadows, +5% saturation, +3% brightness, subtle warm tint.
      return [
        "eq=contrast=1.05:brightness=0.03:saturation=1.05",
        "colorchannelmixer=rr=1.02:bb=0.98",
      ].join(",");
    case "tv-commercial-strong":
      // Higher contrast, +18% saturation, punchy commercial pop.
      return [
        "eq=contrast=1.15:brightness=0.02:saturation=1.18",
        "colorchannelmixer=rr=1.05:bb=0.95",
      ].join(",");
    case "cinematic-teal-orange":
      // Classic blockbuster: orange highlights, teal shadows, +10% sat.
      return [
        "eq=contrast=1.10:saturation=1.10",
        "colorchannelmixer=rr=1.08:gg=1.00:bb=0.92",
        "curves=r='0/0 0.5/0.55 1/1':b='0/0 0.5/0.45 1/1'",
      ].join(",");
    case "analog-horror":
      // Crushed blacks, desaturated, slight green-shift, low contrast.
      return [
        "eq=contrast=0.92:brightness=-0.04:saturation=0.78",
        "colorchannelmixer=rr=0.95:gg=1.05:bb=0.95",
        "curves=all='0/0.05 0.5/0.45 1/0.92'",
      ].join(",");
  }
}

export type ColorGradeInput = {
  src: string;
  dst: string;
  preset: ColorGradePreset;
  /** Pass true to skip the v2 collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

export async function colorGrade(input: ColorGradeInput): Promise<string> {
  const { src, dst, preset, forceOverwrite = false, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  const filter = buildColorGradeFilter(preset);
  await runFfmpeg(
    [
      "-i", src,
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "copy",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/color-grade",
      input: { src, dst, preset, filter },
      opts,
    }
  );
  return dst;
}

// --- Recipe 10: VHS post-process (#036) --------------------------------
//
// Lifted out of ralphy-vs-higgsfield-001 / analog-horror-fridge-001 raw chains.
// Combines chroma shift (RGB-channel offsets via rgbashift), low-amplitude
// sine drift (mirage), film grain, vignette, and a slight saturation/contrast
// nudge. Each layer is toggleable.

export type ApplyVhsInput = {
  src: string;
  dst: string;
  /** Sine-wave horizontal drift in pixels (0 = off). Default 2. */
  drift?: number;
  /** Grain strength 0..100 (0 = off). Default 8. */
  grain?: number;
  /** Chroma R/B horizontal shift in pixels (0 = off). Default 3. */
  chroma?: number;
  /** Pass true to skip the v2 collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

/**
 * Build the -vf filter string for the VHS chain. Exported for unit tests.
 */
export function buildVhsFilter(opts: {
  drift: number;
  grain: number;
  chroma: number;
}): string {
  const { drift, grain, chroma } = opts;
  const parts: string[] = [];
  if (chroma > 0) {
    // rgbashift offsets the R and B planes horizontally — visually identical
    // to the legacy chromashift / hstack workaround but built-in to ffmpeg.
    parts.push(`rgbashift=rh=${chroma}:bh=${-chroma}`);
  }
  if (drift > 0) {
    // 0.6 Hz sine wave on x for a slow tape-wobble. `t` is frame time.
    parts.push(`crop=in_w-${drift * 2}:in_h:${drift}+${drift}*sin(2*PI*0.6*t):0`);
  }
  if (grain > 0) {
    // noise=alls=N:allf=t adds temporal luma+chroma noise.
    parts.push(`noise=alls=${grain}:allf=t`);
  }
  // Always end with vignette + slight desat — a VHS deck never produced
  // pristine corners or full saturation.
  parts.push("vignette=PI/5");
  parts.push("eq=saturation=0.92:contrast=1.05");
  return parts.join(",");
}

export async function applyVhs(input: ApplyVhsInput): Promise<string> {
  const {
    src,
    dst,
    drift = 2,
    grain = 8,
    chroma = 3,
    forceOverwrite = false,
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  const filter = buildVhsFilter({ drift, grain, chroma });
  await runFfmpeg(
    [
      "-i", src,
      "-vf", filter,
      "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-c:a", "copy",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/apply-vhs",
      input: { src, dst, drift, grain, chroma, filter },
      opts,
    }
  );
  return dst;
}

// --- Recipe 11: mix-music (#036) ---------------------------------------
//
// Lighter-weight variant of addMusicBed for the common case: drop a music
// bed onto an existing video at a fixed volume, no ducking, no fades by
// default. Single-call CLI surface for the A/B/C music preview workflow
// (glitter-cream postmortem).

export type MixMusicInput = {
  src: string;
  music: string;
  dst: string;
  /** Music gain. Default 0.18 (background bed under VO). */
  volume?: number;
  /** Pass true to skip the v2 collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

/**
 * Build the -filter_complex string for mix-music. Multi-char labels per #011.
 */
export function buildMixMusicFilter(opts: {
  volume: number;
  hasSourceAudio: boolean;
}): string {
  const { volume, hasSourceAudio } = opts;
  if (!hasSourceAudio) {
    return `[1:a]volume=${volume}[mixed]`;
  }
  return [
    `[1:a]volume=${volume}[mbed]`,
    `[0:a][mbed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]`,
  ].join(";");
}

export async function mixMusic(input: MixMusicInput): Promise<string> {
  const { src, music, dst, volume = 0.18, forceOverwrite = false, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  const hasSourceAudio = probeHasAudio(src);
  const filter = buildMixMusicFilter({ volume, hasSourceAudio });
  await runFfmpeg(
    [
      "-i", src,
      "-i", music,
      "-filter_complex", filter,
      "-map", "0:v",
      "-map", "[mixed]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/mix-music",
      input: { src, music, dst, volume, hasSourceAudio, filter },
      opts,
      kind: "audio",
    }
  );
  return dst;
}

// --- Recipe 12: compress for social (#036) -----------------------------
//
// x264 CRF + faststart for shareable social deliverables. Default CRF 23
// (high-quality web) plus `+faststart` so the moov atom lands at the front
// of the file (required by every web player for progressive playback).
// `--social` is the explicit flag the issue mentions; it's the default mode.

export type CompressForSocialInput = {
  src: string;
  dst: string;
  /** x264 CRF. Default 23 (web). 18 = print, 12 = archive. */
  crf?: number;
  /** Pass true to skip the v2 collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

export async function compressForSocial(input: CompressForSocialInput): Promise<string> {
  const { src, dst, crf = 23, forceOverwrite = false, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  await runFfmpeg(
    [
      "-i", src,
      "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/compress-social",
      input: { src, dst, crf },
      opts,
    }
  );
  return dst;
}

/**
 * Map the `ralphy render --quality` enum to an x264 CRF value.
 *   web     → 23 (small, shareable on socials)
 *   print   → 18 (visually lossless, archival client deliverable)
 *   archive → 12 (near-mathematically-lossless master)
 */
export function qualityPresetToCrf(quality: "web" | "print" | "archive"): number {
  switch (quality) {
    case "web": return 23;
    case "print": return 18;
    case "archive": return 12;
  }
}

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

// --- Recipe 13: single-frame thumbnail extract (#049) ------------------
//
// `ffmpeg -ss <t> -i src -frames:v 1 dst`. Pre-seek (-ss BEFORE -i) is the
// fast path; for accuracy on inter-frame compressed inputs we re-encode the
// extracted frame as PNG. The CLI surface is `ralphy project thumbnail`.

export type ExtractFrameInput = {
  src: string;
  /** Timestamp in seconds (float ok). */
  atSec: number;
  dst: string;
} & FFmpegOptions;

export async function extractFrame(input: ExtractFrameInput): Promise<string> {
  const { src, atSec, dst, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await runFfmpeg(
    ["-ss", String(atSec), "-i", src, "-frames:v", "1", "-q:v", "2", dst],
    {
      endpoint: "ffmpeg/extract-frame",
      input: { src, atSec, dst },
      opts,
      kind: "video",
    },
  );
  return dst;
}

// --- Recipe 14: audio loudness probe (#049) ----------------------------
//
// Combines `volumedetect` (mean / peak in dBFS) and `ebur128` (integrated
// LUFS) into a single ffmpeg pass per file. Output is JSON-friendly,
// downstream is `ralphy project audio-stats`. No file is written — we read
// stderr only. ffmpeg writes the volumedetect + ebur128 summary to stderr at
// `-loglevel info`, so we override the global "error" level locally.

export type AudioStats = {
  path: string;
  mean_volume_db: number | null;
  max_volume_db: number | null;
  integrated_lufs: number | null;
  true_peak_db: number | null;
  loudness_range_lu: number | null;
};

export function parseAudioStats(path_: string, stderr: string): AudioStats {
  // volumedetect lines:
  //   [Parsed_volumedetect_0 @ ...] mean_volume: -23.4 dB
  //   [Parsed_volumedetect_0 @ ...] max_volume: -1.5 dB
  // ebur128 summary block:
  //     Integrated loudness:
  //         I:         -16.2 LUFS
  //         Threshold: -26.3 LUFS
  //     Loudness range:
  //         LRA:         8.3 LU
  //     True peak:
  //         Peak:       -1.4 dBFS
  const num = (re: RegExp): number | null => {
    const m = stderr.match(re);
    if (!m) return null;
    const v = parseFloat(m[1]!);
    return Number.isFinite(v) ? v : null;
  };
  return {
    path: path_,
    mean_volume_db: num(/mean_volume:\s*(-?[\d.]+)\s*dB/),
    max_volume_db: num(/max_volume:\s*(-?[\d.]+)\s*dB/),
    integrated_lufs: num(/I:\s*(-?[\d.]+)\s*LUFS/),
    true_peak_db: num(/Peak:\s*(-?[\d.]+)\s*dBFS/),
    loudness_range_lu: num(/LRA:\s*(-?[\d.]+)\s*LU/),
  };
}

export type AudioStatsInput = {
  src: string;
} & FFmpegOptions;

export async function audioStats(input: AudioStatsInput): Promise<AudioStats> {
  const { src, ...opts } = input;
  ensureFfmpeg();
  const t0 = Date.now();
  // Need stderr at info-level for volumedetect + ebur128 summary text.
  const { stderr, exitCode } = await new Promise<{ stderr: string; exitCode: number }>(
    (resolve) => {
      const proc = spawn("ffmpeg", [
        "-hide_banner",
        "-nostats",
        "-i", src,
        "-af", "volumedetect,ebur128=peak=true",
        "-f", "null", "-",
      ]);
      let buf = "";
      proc.stderr.on("data", (d) => (buf += d.toString()));
      proc.on("close", (code) => resolve({ stderr: buf, exitCode: code ?? 1 }));
    },
  );
  if (exitCode !== 0) {
    throw new Error(`ffmpeg audio-stats exit ${exitCode}: ${stderr.slice(0, 500)}`);
  }
  const stats = parseAudioStats(src, stderr);
  if (opts.projectId) {
    await logGeneration(opts.projectId, {
      provider: "ffmpeg",
      model: "ffmpeg/audio-stats",
      endpoint: "ffmpeg/audio-stats",
      kind: "audio",
      input: { project: opts.projectId, src },
      output: { local: src },
      status: "ok",
      latency_ms: Date.now() - t0,
      cost_usd: 0,
      note: opts.note,
    });
  }
  return stats;
}

// --- Recipe 15: contact-sheet grid (#049) ------------------------------
//
// Compose a grid of input images via `xstack` (rectangular grid) or `hstack`
// (single row, cols=N). Resolves rows from `Math.ceil(srcs.length / cols)`.
// Each tile is letterboxed to `tileW × tileH` (default 480×270) so mismatched
// aspect inputs still align.

export type ContactSheetInput = {
  srcs: string[];
  dst: string;
  cols?: number;
  tileW?: number;
  tileH?: number;
  /** Pass true to skip the v2 collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

/**
 * Build the `-filter_complex` chain for an `xstack` grid. Exported so unit
 * tests can pin the layout string without spawning ffmpeg.
 *
 * Layout grammar: `x0_y0|x1_y1|...` with one entry per tile, in row-major
 * order. ffmpeg's xstack requires every tile to share dimensions, so we
 * scale + pad each input first.
 */
export function buildContactSheetFilter(opts: {
  count: number;
  cols: number;
  tileW: number;
  tileH: number;
}): { filter: string; rows: number } {
  const { count, cols, tileW, tileH } = opts;
  if (count === 0) throw new Error("buildContactSheetFilter: count must be > 0");
  const rows = Math.ceil(count / cols);
  const labels: string[] = [];
  const chain: string[] = [];
  for (let i = 0; i < count; i++) {
    const label = `t${i}`;
    chain.push(
      `[${i}:v]scale=${tileW}:${tileH}:force_original_aspect_ratio=decrease,` +
        `pad=${tileW}:${tileH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[${label}]`,
    );
    labels.push(`[${label}]`);
  }
  // Build the xstack layout map.
  const positions: string[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col === 0 ? "0" : Array.from({ length: col }, () => "w0").join("+");
    const y = row === 0 ? "0" : Array.from({ length: row }, () => "h0").join("+");
    positions.push(`${x}_${y}`);
  }
  // Pad to a full rectangle if needed — xstack rejects ragged grids.
  while (labels.length < rows * cols) {
    const i = labels.length;
    const label = `t${i}`;
    chain.push(`color=black:size=${tileW}x${tileH}:duration=0.1[${label}]`);
    labels.push(`[${label}]`);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col === 0 ? "0" : Array.from({ length: col }, () => "w0").join("+");
    const y = row === 0 ? "0" : Array.from({ length: row }, () => "h0").join("+");
    positions.push(`${x}_${y}`);
  }
  const stack =
    `${labels.join("")}xstack=inputs=${labels.length}:layout=${positions.join("|")}[grid]`;
  chain.push(stack);
  return { filter: chain.join(";"), rows };
}

export async function contactSheet(input: ContactSheetInput): Promise<string> {
  const {
    srcs,
    dst,
    cols = 5,
    tileW = 480,
    tileH = 270,
    forceOverwrite = false,
    ...opts
  } = input;
  if (srcs.length === 0) throw new Error("contactSheet: srcs is empty");
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  const { filter, rows } = buildContactSheetFilter({
    count: srcs.length,
    cols,
    tileW,
    tileH,
  });
  const args: string[] = [];
  for (const s of srcs) args.push("-i", s);
  // Padding tiles (color=black) live inside the filter as virtual inputs via
  // the `color=` filter source; xstack reads them from labels, not -i flags.
  args.push(
    "-filter_complex", filter,
    "-map", "[grid]",
    "-frames:v", "1",
    dst,
  );
  await runFfmpeg(args, {
    endpoint: "ffmpeg/contact-sheet",
    input: { srcs, dst, cols, rows, tileW, tileH },
    opts,
    kind: "video",
  });
  return dst;
}
