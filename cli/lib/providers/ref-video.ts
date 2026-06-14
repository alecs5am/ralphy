// Reference-video constraint enforcement + auto-downscale for fal seedance r2v.
//
// `bytedance/seedance-2.0/reference-to-video` accepts up to 3 reference videos
// via `video_urls`, but with hard input constraints (verified against the fal
// model schema, 2026-06-12):
//   - each video between ~480p (640x640) and ~720p (834x1112) in resolution
//   - combined duration between 2 and 15 seconds
//   - total size under 50 MB
//
// 1080x1920 phone captures are the common source and blow past the 834x1112
// ceiling. Rather than refuse, we auto-downscale them (preserving aspect) to
// fit the box (e.g. 1080x1920 → 624x1108) and write the downscaled copy into
// the project's `artifacts/refs/` tree (#401/#105) so the original is never
// touched and the wire payload stays small.
//
// The pixel-box math is factored into the pure `fitWithinBox()` /
// `planRefVideo()` functions so it is unit-testable without invoking ffmpeg.

import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { probeFile } from "../ffprobe.js";
import { projectRefsDir } from "../paths.js";

// ─── Hard constraints (fal seedance r2v schema, 2026-06-12) ─────────────────

/** Minimum accepted resolution box edge (≈480p). */
export const REF_VIDEO_MIN = { width: 640, height: 640 } as const;
/** Maximum accepted resolution box (≈720p portrait). */
export const REF_VIDEO_MAX = { width: 834, height: 1112 } as const;
/** Max number of reference videos. */
export const REF_VIDEO_MAX_FILES = 3;
/** Combined duration window across all reference videos (seconds). */
export const REF_VIDEO_DURATION_MIN_S = 2;
export const REF_VIDEO_DURATION_MAX_S = 15;
/** Combined byte budget across all reference videos. */
export const REF_VIDEO_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export type Dimensions = { width: number; height: number };

/**
 * Scale `src` down (never up) so both edges fit within `box`, preserving aspect.
 * Returns the target dimensions rounded to even numbers (h.264 / yuv420p require
 * even width+height). When the source already fits, returns the source rounded
 * to even — a no-op resize is cheaper than refusing and lets the caller decide.
 *
 * Pure — no ffmpeg, no disk. The unit-testable core of the downscale planner.
 */
export function fitWithinBox(src: Dimensions, box: Dimensions = REF_VIDEO_MAX): Dimensions {
  const toEven = (n: number) => {
    const r = Math.max(2, Math.round(n));
    return r % 2 === 0 ? r : r - 1;
  };
  if (src.width <= 0 || src.height <= 0) return { width: box.width, height: box.height };
  const scale = Math.min(box.width / src.width, box.height / src.height, 1);
  return { width: toEven(src.width * scale), height: toEven(src.height * scale) };
}

/** The accepted long-edge band: [640 .. 1112]. Orientation-agnostic. */
const MAX_LONG_EDGE = Math.max(REF_VIDEO_MAX.width, REF_VIDEO_MAX.height); // 1112
const MIN_LONG_EDGE = Math.max(REF_VIDEO_MIN.width, REF_VIDEO_MIN.height); // 640
/** The accepted short-edge ceiling: must not exceed the max box's short edge. */
const MAX_SHORT_EDGE = Math.min(REF_VIDEO_MAX.width, REF_VIDEO_MAX.height); // 834

/**
 * True when `dims` sits inside the accepted resolution band — fal documents
 * "between ~480p (640x640) and ~720p (834x1112)". We read that as: the LONGER
 * edge in [640, 1112] and the SHORTER edge ≤ 834. A downscaled 9:16 portrait
 * (e.g. 624x1108) is accepted even though its short edge dips below 640 — fal's
 * floor is about not feeding a tiny thumbnail (long edge ≥ 640), not a strict
 * per-edge minimum. Orientation-agnostic.
 */
export function withinResolutionBox(dims: Dimensions): boolean {
  const longEdge = Math.max(dims.width, dims.height);
  const shortEdge = Math.min(dims.width, dims.height);
  return longEdge >= MIN_LONG_EDGE && longEdge <= MAX_LONG_EDGE && shortEdge <= MAX_SHORT_EDGE;
}

export type RefVideoProbe = {
  path: string;
  width: number;
  height: number;
  durationS: number;
  sizeBytes: number;
};

export type RefVideoPlanItem = {
  src: string;
  /** Whether a downscale is required to fit the resolution box. */
  needsDownscale: boolean;
  /** Target dims when `needsDownscale` (else the source dims). */
  target: Dimensions;
  probe: RefVideoProbe;
};

export type RefVideoPlan = {
  items: RefVideoPlanItem[];
  combinedDurationS: number;
  combinedBytes: number;
};

/**
 * Build a downscale/validation plan from probed reference videos. Pure: takes
 * already-probed dimensions so it is unit-testable without ffprobe. Throws a
 * plain Error (the connector maps it to a TerminalProviderError / raiseError)
 * when a hard constraint cannot be auto-fixed:
 *   - more than 3 files
 *   - combined duration outside [2, 15] s
 *   - combined bytes over 50 MB (downscale shrinks bytes, but we can't promise
 *     it lands under budget for arbitrary sources, so refuse up-front)
 *   - a single source below the 640px min floor (we never upscale)
 *
 * Over-resolution sources are flagged `needsDownscale` with a computed `target`
 * box — that is the auto-fix path.
 */
export function planRefVideos(probes: RefVideoProbe[]): RefVideoPlan {
  if (probes.length === 0) {
    throw new Error("no reference videos supplied");
  }
  if (probes.length > REF_VIDEO_MAX_FILES) {
    throw new Error(
      `too many reference videos: ${probes.length} (max ${REF_VIDEO_MAX_FILES}). Drop the extras before submit.`,
    );
  }
  const combinedDurationS = probes.reduce((s, p) => s + p.durationS, 0);
  if (combinedDurationS < REF_VIDEO_DURATION_MIN_S || combinedDurationS > REF_VIDEO_DURATION_MAX_S) {
    throw new Error(
      `combined reference-video duration is ${combinedDurationS.toFixed(2)}s; must be between ` +
        `${REF_VIDEO_DURATION_MIN_S}s and ${REF_VIDEO_DURATION_MAX_S}s. Trim the clips before submit.`,
    );
  }
  const combinedBytes = probes.reduce((s, p) => s + p.sizeBytes, 0);
  if (combinedBytes > REF_VIDEO_MAX_TOTAL_BYTES) {
    throw new Error(
      `combined reference-video size is ${(combinedBytes / 1024 / 1024).toFixed(1)}MB; ` +
        `must be under ${REF_VIDEO_MAX_TOTAL_BYTES / 1024 / 1024}MB. Trim or re-encode the clips before submit.`,
    );
  }

  const items: RefVideoPlanItem[] = probes.map((p) => {
    const longEdge = Math.max(p.width, p.height);
    if (longEdge < MIN_LONG_EDGE) {
      throw new Error(
        `reference video ${path.basename(p.path)} is ${p.width}x${p.height} — its longest edge is ` +
          `below the ${MIN_LONG_EDGE}px minimum. We never upscale; supply a higher-resolution source.`,
      );
    }
    if (withinResolutionBox({ width: p.width, height: p.height })) {
      return { src: p.path, needsDownscale: false, target: { width: p.width, height: p.height }, probe: p };
    }
    return {
      src: p.path,
      needsDownscale: true,
      target: fitWithinBox({ width: p.width, height: p.height }),
      probe: p,
    };
  });

  return { items, combinedDurationS, combinedBytes };
}

// ─── ffmpeg-backed I/O (NOT pure; the planner above is the testable core) ────

/** Probe a reference video on disk into the pure-planner shape. */
export async function probeRefVideo(filePath: string): Promise<RefVideoProbe> {
  const r = await probeFile(filePath);
  if (!r.exists) throw new Error(`reference video not found: ${filePath}`);
  if (!r.has_video || r.width == null || r.height == null) {
    throw new Error(`${path.basename(filePath)} has no decodable video stream`);
  }
  return {
    path: filePath,
    width: r.width,
    height: r.height,
    durationS: r.duration_s ?? 0,
    sizeBytes: r.size_bytes ?? 0,
  };
}

/**
 * The ffmpeg command (argv) that downscales `src` into `dst` at `target`. Pure
 * (returns argv, runs nothing) so a unit test can assert the built command
 * without invoking ffmpeg. `-an` strips audio — seedance reads the video frames
 * as a motion/style reference, not the audio (audio refs are a separate
 * `audio_urls` slot we do not wire here).
 */
export function buildDownscaleArgs(src: string, dst: string, target: Dimensions): string[] {
  return [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", src,
    "-vf", `scale=${target.width}:${target.height}:flags=lanczos`,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-an",
    "-map_metadata", "-1",
    dst,
  ];
}

/**
 * Materialize a plan item into a wire-ready local path: when a downscale is
 * needed, run ffmpeg into the project's `artifacts/refs/` tree and return the
 * downscaled copy (a stderr note documents the resize); otherwise return the
 * source untouched. Append-only — the downscaled copy gets a deterministic
 * `<stem>.r2v-<WxH>.mp4` name, never overwriting the original (#105/#401, #14).
 */
export async function materializeRefVideo(
  projectId: string,
  item: RefVideoPlanItem,
): Promise<string> {
  if (!item.needsDownscale) return item.src;
  const refsDir = projectRefsDir(projectId);
  await fs.mkdir(refsDir, { recursive: true });
  const stem = path.basename(item.src, path.extname(item.src));
  const dst = path.join(refsDir, `${stem}.r2v-${item.target.width}x${item.target.height}.mp4`);
  // Append-only: if the downscaled copy already exists (same source, same box),
  // reuse it rather than re-encoding.
  try {
    await fs.access(dst);
    process.stderr.write(
      `ralphy: reusing downscaled ref-video copy → ${dst} (${item.target.width}x${item.target.height})\n`,
    );
    return dst;
  } catch {
    /* not cached — encode below */
  }
  const args = buildDownscaleArgs(item.src, dst, item.target);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `ffmpeg downscale of ${path.basename(item.src)} failed (exit ${r.status}): ${(r.stderr || "").slice(0, 200)}`,
    );
  }
  process.stderr.write(
    `ralphy: ref-video ${path.basename(item.src)} ${item.probe.width}x${item.probe.height} ` +
      `exceeds the 834x1112 seedance ceiling → downscaled to ${item.target.width}x${item.target.height} → ${dst}\n`,
  );
  return dst;
}
