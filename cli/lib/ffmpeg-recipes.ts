// FFmpeg recipes — production-correctness primitives ported from
// browser-use/video-use (helpers/render.py + helpers/grade.py).
//
// All functions:
// - Use system `ffmpeg` (Homebrew on macOS). Verify with ensureFfmpeg().
// - Are async + return the output path.
// - Throw on non-zero exit code with stderr.
// - Optional projectId logs to <project>/logs/generations.jsonl
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

// --- Recipe 2b: boomerang (ping-pong loop) -----------------------------
// Forward playback + the same clip reversed, concatenated → a seamless
// back-and-forth loop (the classic Instagram "boomerang"). Output is the
// video stream only (audio is dropped — boomeranged audio sounds wrong;
// a music bed is added later in the compose/render step). Output duration
// is ~2× the source.

export type BoomerangInput = {
  src: string;
  dst: string;
  /** Number of passes (traversals). 2 = forward+reverse (default). 3 = fwd+rev+fwd, etc. */
  passes?: number;
  /** Trim the source to its first N seconds per pass before ping-ponging. */
  seconds?: number;
} & FFmpegOptions;

/**
 * Build the boomerang filtergraph. Splits the (optionally trimmed) source into
 * `passes` copies, reverses every other one (odd index), and concatenates them
 * → forward, reverse, forward, … Total duration ≈ passes × seconds.
 * Exported for unit testing.
 */
export function buildBoomerangFilter(passes: number, seconds?: number): string {
  const n = Math.max(2, Math.floor(passes));
  const trim = seconds && seconds > 0 ? `trim=0:${seconds},setpts=PTS-STARTPTS,` : "";
  const labels = Array.from({ length: n }, (_, i) => `s${i}`);
  const parts = [`[0:v]${trim}split=${n}${labels.map((l) => `[${l}]`).join("")}`];
  const concatIns: string[] = [];
  labels.forEach((l, i) => {
    if (i % 2 === 1) {
      parts.push(`[${l}]reverse[r${i}]`);
      concatIns.push(`[r${i}]`);
    } else {
      concatIns.push(`[${l}]`);
    }
  });
  parts.push(`${concatIns.join("")}concat=n=${n}:v=1:a=0[v]`);
  return parts.join(";");
}

export async function boomerang(input: BoomerangInput): Promise<string> {
  const { src, dst, passes = 2, seconds, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  // reverse buffers each pass in memory — fine for short (≤15s) segments.
  const filter = buildBoomerangFilter(passes, seconds);
  await runFfmpeg(
    [
      "-i", src,
      "-filter_complex", filter,
      "-map", "[v]", "-an",
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/boomerang",
      input: { src, dst, passes, seconds: seconds ?? null },
      opts,
    }
  );
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
  /**
   * Measure first, then apply the measured values (default true). Single-pass
   * loudnorm runs in dynamic mode and misses the target on transient-dense
   * material — an SFX stem asked for -20 LUFS came out at -16.0. Pass false to
   * force the old one-shot behaviour.
   */
  twoPass?: boolean;
} & FFmpegOptions;

/** The five `measured_*` / offset values loudnorm's `print_format=json` emits. */
export type LoudnormMeasurement = {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
};

/**
 * Pull the loudnorm JSON summary out of ffmpeg stderr. Returns null when the
 * block is absent or carries a non-finite value (`-inf` on pure silence), which
 * is the caller's signal to fall back to a single pass. Exported for tests.
 */
export function parseLoudnormMeasurement(stderr: string): LoudnormMeasurement | null {
  const num = (key: string): number => {
    const m = stderr.match(new RegExp(`"${key}"\\s*:\\s*"?(-?[\\d.]+|-?inf)"?`));
    return m ? parseFloat(m[1]!) : NaN;
  };
  const out = {
    input_i: num("input_i"),
    input_tp: num("input_tp"),
    input_lra: num("input_lra"),
    input_thresh: num("input_thresh"),
    target_offset: num("target_offset"),
  };
  return Object.values(out).every((v) => Number.isFinite(v)) ? out : null;
}

/** First loudnorm pass: analyze only, no output file. */
async function measureLoudnorm(src: string, filter: string): Promise<LoudnormMeasurement | null> {
  ensureFfmpeg();
  const stderr = await new Promise<string>((resolve) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-nostats",
      "-i", src,
      "-af", `${filter}:print_format=json`,
      "-f", "null", "-",
    ]);
    let buf = "";
    proc.stderr.on("data", (d) => (buf += d.toString()));
    proc.on("close", () => resolve(buf));
  });
  return parseLoudnormMeasurement(stderr);
}

export async function loudnorm(input: LoudnormInput): Promise<string> {
  const {
    src,
    dst,
    target = -16,
    truePeak = -1.5,
    loudnessRange = 11,
    twoPass = true,
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const base = `loudnorm=I=${target}:TP=${truePeak}:LRA=${loudnessRange}`;
  // Pass 1 measures; pass 2 applies the measurement in linear mode, which is
  // what actually pins the integrated loudness to the target. A failed / silent
  // measurement degrades to the single-pass filter rather than erroring.
  const measured = twoPass ? await measureLoudnorm(src, base) : null;
  const filter = measured
    ? `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
      `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}` +
      `:offset=${measured.target_offset}:linear=true`
    : base;
  // Codec is auto-picked by ffmpeg from the output extension. Bitrate fixed
  // at 192k — fine for both libmp3lame (.mp3) and aac (.m4a / .aac).
  await runFfmpeg(
    ["-i", src, "-af", filter, "-b:a", "192k", dst],
    {
      endpoint: "ffmpeg/loudnorm",
      input: { src, dst, target, truePeak, loudnessRange, two_pass: Boolean(measured) },
      opts,
      kind: "audio",
    }
  );
  return dst;
}

// --- Recipe 3b: compress a voice-clone sample --------------------------

export type CompressVoiceSampleInput = {
  src: string;
  dst: string;
  /** Trim to at most this many seconds of speech. Default 90s. */
  maxSeconds?: number;
  /** Output MP3 bitrate (kbps). Default 64k — plenty for a voiceprint. */
  bitrateKbps?: number;
} & FFmpegOptions;

/**
 * Derive a compact voice-clone sample: trim to `maxSeconds`, downmix to mono,
 * re-encode as a low-bitrate MP3. Used to keep a `voices/add` upload under the
 * provider's file-size limit when an isolation pass balloons the file (#495).
 * Non-destructive: writes a NEW path, never touches the source.
 */
export async function compressVoiceSample(input: CompressVoiceSampleInput): Promise<string> {
  const { src, dst, maxSeconds = 90, bitrateKbps = 64, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await runFfmpeg(
    ["-t", String(maxSeconds), "-i", src, "-ac", "1", "-b:a", `${bitrateKbps}k`, dst],
    {
      endpoint: "ffmpeg/compress-voice-sample",
      input: { src, dst, maxSeconds, bitrateKbps },
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
  fps?: number;
  gop?: number;
} & FFmpegOptions;

export async function optimizeReencode(input: OptimizeInput): Promise<string> {
  const {
    src,
    dst,
    crf = 23,
    preset = "slow",
    tune = "grain",
    audioBitrate = "128k",
    fps,
    gop,
    ...opts
  } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const cadenceArgs = [
    ...(fps ? ["-r", String(fps)] : []),
    ...(gop ? ["-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0"] : []),
  ];
  await runFfmpeg(
    [
      "-i", src,
      "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-tune", tune,
      ...cadenceArgs,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", audioBitrate,
      "-movflags", "+faststart",
      dst,
    ],
    {
      endpoint: "ffmpeg/optimize",
      input: { src, dst, crf, preset, tune, audioBitrate, fps, gop },
      opts,
    }
  );
  return dst;
}

// --- Recipe 7b: clip cut (+ optional 9:16 vertical crop) (#436) ---------
//
// The deterministic primitive behind `ralphy clip` (personal-clipper mode).
// Cuts the [from, to) window out of a long-form source and optionally
// centre-crops it to a 9:16 vertical frame. This verb does NOT do "viral
// moment detection" — that is the agent's job (read the `ref transcribe`
// word-level transcript, pick the windows). The recipe only executes the cut,
// so AGENTS.md invariant #2 holds (no ad-hoc ffmpeg outside a verb's recipe).
//
// The window is re-encoded (not stream-copied) so the cut is frame-accurate at
// the requested timestamps rather than snapping to the nearest keyframe — clip
// boundaries chosen from a transcript must land on the spoken word.

/**
 * Parse a timestamp into seconds. Accepts a bare float (`"12.5"`), `MM:SS`
 * (`"1:30"`), or `HH:MM:SS` (`"1:02:03"`); fractional seconds allowed in the
 * last field (`"1:30.5"`). Returns NaN for anything unparseable so the caller
 * can reject it. Exported for unit testing.
 */
export function parseTimestampSec(ts: string): number {
  const raw = String(ts).trim();
  if (raw === "") return NaN;
  if (!raw.includes(":")) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }
  const parts = raw.split(":");
  if (parts.length > 3) return NaN;
  let total = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n) || n < 0) return NaN;
    total = total * 60 + n;
  }
  return total;
}

/**
 * The centre-crop vf chain for a 9:16 vertical frame from any-aspect source:
 * crop the largest centred 9:16 rectangle, then scale to a 1080x1920 canvas.
 * `min(iw,ih*9/16)` keeps the crop inside the frame for both landscape and
 * already-portrait inputs. Exported for unit testing.
 */
export const VERTICAL_916_VF =
  "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':(iw-ow)/2:(ih-oh)/2," +
  "scale=1080:1920:force_original_aspect_ratio=increase," +
  "crop=1080:1920,setsar=1";

/**
 * Build the ffmpeg argv for a clip cut. Pre-seek (`-ss`/`-to` before `-i`) for
 * speed, re-encoded for frame-accurate boundaries. When `vertical` is set, the
 * 9:16 centre-crop vf chain is applied. Exported so unit tests can pin the
 * exact argv without spawning ffmpeg.
 */
export function buildClipArgs(opts: {
  src: string;
  startSec: number;
  endSec: number;
  dst: string;
  vertical: boolean;
}): string[] {
  const { src, startSec, endSec, dst, vertical } = opts;
  const args = [
    "-ss", String(startSec),
    "-to", String(endSec),
    "-i", src,
  ];
  if (vertical) args.push("-vf", VERTICAL_916_VF);
  args.push(
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    dst,
  );
  return args;
}

export type ClipInput = {
  src: string;
  startSec: number;
  endSec: number;
  dst: string;
  /** Centre-crop to a 9:16 vertical frame. Default false (keep source aspect). */
  vertical?: boolean;
  /** Pass true to skip the v2 collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

export async function clip(input: ClipInput): Promise<string> {
  const { src, startSec, endSec, dst, vertical = false, forceOverwrite = false, ...opts } = input;
  if (!(endSec > startSec)) {
    throw new Error(`clip: --to (${endSec}s) must be greater than --from (${startSec}s)`);
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  await runFfmpeg(buildClipArgs({ src, startSec, endSec, dst, vertical }), {
    endpoint: "ffmpeg/clip",
    input: { src, startSec, endSec, dst, vertical },
    opts,
  });
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

// --- Recipe 13b: last-frame extract (#012) -----------------------------
//
// `ffmpeg -sseof -1 -i <src> -update 1 -frames:v 1 <dst.png>` grabs the LAST
// frame of an mp4 without us having to probe its duration first. The
// `-sseof -N` flag seeks to N seconds before EOF. `-update 1` tells ffmpeg to
// overwrite a single output image (the default with sequential filenames
// would emit `dst-001.png` etc.). Used as the anchor for `ralphy video extend`
// (multi-block i2v continuation chains, MEMORY: feedback_seedance_multiblock_i2v_extend).

export type ExtractLastFrameInput = {
  src: string;
  dst: string;
} & FFmpegOptions;

/**
 * Build the `-sseof` argv for last-frame extract. Exported so unit tests can
 * pin the exact shape without spawning ffmpeg.
 */
export function buildLastFrameArgs(src: string, dst: string): string[] {
  return ["-sseof", "-1", "-i", src, "-update", "1", "-frames:v", "1", "-q:v", "2", dst];
}

export async function extractLastFrame(input: ExtractLastFrameInput): Promise<string> {
  const { src, dst, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await runFfmpeg(buildLastFrameArgs(src, dst), {
    endpoint: "ffmpeg/extract-last-frame",
    input: { src, dst },
    opts,
    kind: "video",
  });
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

// --- Recipe 17: cue-sheet SFX stem (#554) ------------------------------
//
// Flatten N short SFX one-shots into ONE pre-mixed stem on a single track.
// Why a stem and not N <audio> tags: HyperFrames cannot overlap clips on the
// same track, and short same-track media is unreliable during capture (#047).
// One stem on one track is the correct shape — and it auditions outside the
// render.
//
// Filtergraph shape, one chain per cue:
//   [i:a]aformat=…,adelay=<ms>|<ms>,volume=<g>dB[cN]
// then amix (normalize=0 — cue gains are authored, not averaged), a limiter
// to catch stacked transients, and apad+atrim to pin the exact duration.

export type StemCue = {
  /** Cue time in seconds. Either `at` or `frame` is required. */
  at?: number;
  /** Cue time in frames — resolved against the sheet's `fps`. */
  frame?: number;
  /** SFX slot name, resolved to `<sfxDir>/<slot>.mp3` unless it carries an extension. */
  slot: string;
  /** Per-cue gain in dB. Default 0. */
  gainDb?: number;
};

/** A cue sheet on disk: a bare cue array, or `{ fps, cues }` for frame-authored timing. */
export type StemCueSheet = StemCue[] | { fps?: number; cues: StemCue[] };

export type ResolvedStemCue = { src: string; atSec: number; gainDb: number };

/**
 * Validate a cue sheet and resolve it into absolute-path + seconds cues.
 * Pure (no fs) so the frame→ms math is unit-testable. Throws on an empty sheet,
 * a cue with neither `at` nor `frame`, or `frame` without an `fps`.
 */
export function resolveCueSheet(sheet: StemCueSheet, sfxDir: string): ResolvedStemCue[] {
  const cues = Array.isArray(sheet) ? sheet : sheet?.cues;
  const fps = Array.isArray(sheet) ? undefined : sheet?.fps;
  if (!Array.isArray(cues) || cues.length === 0) {
    throw new Error("cue sheet is empty — expected a non-empty cue array or { fps, cues }");
  }
  return cues.map((c, i) => {
    if (!c?.slot) throw new Error(`cue ${i}: missing "slot"`);
    let atSec: number;
    if (typeof c.at === "number") atSec = c.at;
    else if (typeof c.frame === "number") {
      if (!fps) throw new Error(`cue ${i}: "frame" needs a top-level "fps" in the cue sheet`);
      atSec = c.frame / fps;
    } else throw new Error(`cue ${i}: needs "at" (seconds) or "frame" (+ sheet "fps")`);
    if (!(atSec >= 0)) throw new Error(`cue ${i}: cue time must be >= 0 (got ${atSec})`);
    const src = path.extname(c.slot)
      ? path.resolve(sfxDir, c.slot)
      : path.resolve(sfxDir, `${c.slot}.mp3`);
    return { src, atSec, gainDb: c.gainDb ?? 0 };
  });
}

/**
 * Build the `-filter_complex` for the stem. Input index == cue index, so the
 * caller passes one `-i` per cue in the same order. Exported for unit testing.
 */
export function buildStemFilter(
  cues: ResolvedStemCue[],
  opts: { limit?: number; durationSec?: number } = {},
): string {
  if (cues.length === 0) throw new Error("buildStemFilter: cues is empty");
  const { limit = 0.89, durationSec } = opts;
  const chain = cues.map((c, i) => {
    const ms = Math.round(c.atSec * 1000);
    return (
      `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
      `adelay=${ms}|${ms},volume=${c.gainDb}dB[c${i}]`
    );
  });
  const labels = cues.map((_, i) => `[c${i}]`).join("");
  chain.push(
    cues.length === 1
      ? `[c0]anull[mix]`
      : `${labels}amix=inputs=${cues.length}:normalize=0:dropout_transition=0[mix]`,
  );
  // level=disabled — auto-level would gain the whole stem up to the ceiling and
  // undo the authored cue gains.
  chain.push(`[mix]alimiter=limit=${limit}:level=disabled[lim]`);
  chain.push(
    durationSec && durationSec > 0
      ? `[lim]apad,atrim=0:${durationSec}[out]`
      : `[lim]anull[out]`,
  );
  return chain.join(";");
}

export type AudioStemInput = {
  cues: ResolvedStemCue[];
  dst: string;
  /** Pin the stem to exactly this many seconds (pad with silence / trim). */
  durationSec?: number;
  /** Chain a two-pass loudnorm to this integrated target. Omit to keep raw cue gains. */
  targetLufs?: number;
  /** alimiter ceiling (linear, not dB). Default 0.89. */
  limit?: number;
  /** Pass true to skip the .vN collision archive. Default false. */
  forceOverwrite?: boolean;
} & FFmpegOptions;

export async function audioStem(input: AudioStemInput): Promise<string> {
  const {
    cues, dst, durationSec, targetLufs, limit = 0.89, forceOverwrite = false, ...opts
  } = input;
  const filter = buildStemFilter(cues, { limit, durationSec });
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await protectExistingAsset(dst, forceOverwrite);
  // Loudness pass needs its own ffmpeg run (measure, then apply), so the mix
  // lands in a lossless temp first to avoid a double lossy encode.
  const needsLoudnorm = typeof targetLufs === "number" && Number.isFinite(targetLufs);
  const mixDst = needsLoudnorm
    ? path.join(path.dirname(dst), `.stem-mix-${path.basename(dst, path.extname(dst))}.wav`)
    : dst;
  const args: string[] = [];
  for (const c of cues) args.push("-i", c.src);
  args.push("-filter_complex", filter, "-map", "[out]");
  if (path.extname(mixDst) !== ".wav") args.push("-b:a", "192k");
  args.push(mixDst);
  await runFfmpeg(args, {
    endpoint: "ffmpeg/audio-stem",
    input: { dst, cues: cues.length, durationSec: durationSec ?? null, limit, filter },
    opts,
    kind: "audio",
  });
  if (needsLoudnorm) {
    try {
      await loudnorm({ src: mixDst, dst, target: targetLufs, ...opts });
    } finally {
      await fs.unlink(mixDst).catch(() => {});
    }
  }
  return dst;
}

// --- Recipe 16: letterbox auto-crop (video-composition black-bar heal) --
//
// HyperFrames composites each <video> into a sub-region of the frame, baking a
// solid black margin at an edge (observed: an ~88px black bar under a 1080x1920
// video montage — cropdetect on the render reports crop=1080:1832:0:0 while the
// source clip is clean). This recipe detects that letterbox and crops+scales it
// back to the full frame. It is a NO-OP when the frame is already clean, and it
// refuses to act when the detected content region is too small to be a mere
// letterbox (that would be a genuinely dark scene, not HF's bar).

export type CropRegion = { w: number; h: number; x: number; y: number };

/**
 * Parse the last `crop=W:H:X:Y` suggestion out of ffmpeg cropdetect stderr.
 * cropdetect accumulates the bounding box of non-black content across the
 * analyzed frames; the final line is the tightest safe crop. Returns null when
 * no crop line was emitted. Exported for unit testing.
 */
export function parseCropdetect(stderr: string): CropRegion | null {
  const re = /crop=(\d+):(\d+):(\d+):(\d+)/g;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(stderr); m; m = re.exec(stderr)) last = m;
  if (!last) return null;
  return { w: +last[1]!, h: +last[2]!, x: +last[3]!, y: +last[4]! };
}

export type LetterboxDecision =
  | { action: "noop"; reason: string }
  | { action: "crop"; region: CropRegion; barPx: number };

/**
 * Decide whether a cropdetect result is an HF letterbox bar worth healing:
 *  - within `epsilon` px of the full frame on both axes → already clean → noop.
 *  - detected content < `minContentRatio` of the frame on either axis → too
 *    aggressive to be a letterbox (likely a genuinely dark scene) → refuse.
 *  - otherwise → a modest full-width/height black margin → crop.
 * Pure — exported for unit testing (no ffmpeg spawn).
 */
export function decideLetterboxCrop(opts: {
  frameW: number;
  frameH: number;
  content: CropRegion | null;
  epsilon?: number;
  minContentRatio?: number;
}): LetterboxDecision {
  const { frameW, frameH, content, epsilon = 4, minContentRatio = 0.85 } = opts;
  if (!content) return { action: "noop", reason: "no cropdetect result" };
  const dW = frameW - content.w;
  const dH = frameH - content.h;
  if (dW <= epsilon && dH <= epsilon) {
    return { action: "noop", reason: "frame already full (no letterbox)" };
  }
  const ratio = Math.min(content.w / frameW, content.h / frameH);
  if (ratio < minContentRatio) {
    return {
      action: "noop",
      reason: `content ${Math.round(ratio * 100)}% < ${Math.round(minContentRatio * 100)}% floor — refusing (likely a dark scene, not a letterbox)`,
    };
  }
  return { action: "crop", region: content, barPx: Math.max(dW, dH) };
}

/** Probe a video's pixel dimensions via ffprobe. Null when unreadable. */
export function probeVideoDims(src: string): { w: number; h: number } | null {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", src],
    { encoding: "utf8" },
  );
  const m = (r.stdout || "").trim().match(/(\d+)x(\d+)/);
  return m ? { w: +m[1]!, h: +m[2]! } : null;
}

/** Run cropdetect over a mid-clip window and return the raw stderr. */
async function runCropdetect(src: string): Promise<string> {
  ensureFfmpeg();
  const dur = probeDurationSec(src);
  const ss = dur > 2 ? dur * 0.2 : 0;
  return new Promise((resolve) => {
    const args = ["-hide_banner", "-nostats"];
    if (ss > 0) args.push("-ss", String(ss));
    // cropdetect=limit:round:reset — round=2 (even crop), reset=0 (accumulate).
    args.push("-i", src, "-vf", "cropdetect=24:2:0", "-frames:v", "150", "-f", "null", "-");
    const proc = spawn("ffmpeg", args);
    let buf = "";
    proc.stderr.on("data", (d) => (buf += d.toString()));
    proc.on("close", () => resolve(buf));
  });
}

export type FixLetterboxResult = { path: string; healed: boolean; barPx: number; reason: string };

/**
 * Detect and heal an HF-baked letterbox bar on `src`, IN PLACE. Probes the frame
 * dims + cropdetect, runs `decideLetterboxCrop`, and on a crop verdict re-encodes
 * the content region scaled back to the full frame (libx264 crf18 yuv420p, audio
 * stream-copied) then atomically replaces `src`. A clean or too-dark frame is a
 * pure no-op (no re-encode, no gen-log row). Returns whether it acted + the bar size.
 */
export async function fixLetterboxInPlace(
  src: string,
  opts: FFmpegOptions & { epsilon?: number; minContentRatio?: number } = {},
): Promise<FixLetterboxResult> {
  const { epsilon, minContentRatio, ...logOpts } = opts;
  const dims = probeVideoDims(src);
  if (!dims) return { path: src, healed: false, barPx: 0, reason: "could not probe dims" };
  const content = parseCropdetect(await runCropdetect(src));
  const decision = decideLetterboxCrop({ frameW: dims.w, frameH: dims.h, content, epsilon, minContentRatio });
  if (decision.action === "noop") {
    return { path: src, healed: false, barPx: 0, reason: decision.reason };
  }
  const { w, h, x, y } = decision.region;
  const tmp = path.join(path.dirname(src), `.letterbox-${Date.now()}.mp4`);
  const vf =
    `crop=${w}:${h}:${x}:${y},scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,` +
    `crop=${dims.w}:${dims.h},setsar=1`;
  await runFfmpeg(
    [
      "-i", src,
      "-vf", vf,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "-movflags", "+faststart",
      tmp,
    ],
    { endpoint: "ffmpeg/fix-letterbox", input: { src, crop: decision.region, frame: dims, barPx: decision.barPx }, opts: logOpts },
  );
  await fs.rename(tmp, src);
  return { path: src, healed: true, barPx: decision.barPx, reason: `cropped ${decision.barPx}px letterbox bar` };
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
