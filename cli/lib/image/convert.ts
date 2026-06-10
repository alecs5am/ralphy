// `ralphy image convert` — format + resize + quality (issue #103).
//
// Format conversion + downscale on a still (PNG→JPG, WebP→PNG, "make this
// ≤720×1280 JPG"). Generalizes the #021 anchor-prep recipe (which stays as
// transparent in-flight pre-processing inside `submitVideoJob()` —
// cli/lib/providers/shared.ts) into an explicit, user-invokable, gen-logged
// verb. Depends on the #101 ImageMagick optional runner.
//
// Hard rules (same as cutout.ts):
//  - Async, returns the output path, mkdir -p the dst dir.
//  - Output format inferred from the dst extension (by ImageMagick natively;
//    by ffmpeg's muxer on the fallback).
//  - Fit-inside + NEVER upscale: IM `-resize 'WxH>'` (the `>` suffix =
//    only-shrink); ffmpeg `scale='min(iw,W)':'min(ih,H)':
//    force_original_aspect_ratio=decrease` (the `min()` guard keeps a
//    smaller-than-box source untouched — plain `decrease`, as used by the
//    #021 recipe, fits-within but DOES upscale a smaller source, which #021
//    avoided by only resizing oversized anchors at the call site).
//  - `--strip` drops EXIF / C2PA / colour-profile metadata: IM `-strip`,
//    ffmpeg `-map_metadata -1` (the #021 strip, now reusable for any still).
//  - Gen-log via the runners: provider "imagemagick" (endpoint
//    "imagemagick/convert") or "ffmpeg" (endpoint "ffmpeg/convert"),
//    cost_usd 0 (local).

import path from "node:path";
import fs from "node:fs/promises";
import { runFfmpeg, type ImagePostOptions } from "./cutout.js";
import { hasMagick, runMagick } from "./magick.js";

export type MaxBox = { w: number; h: number };

export type ConvertImageOptions = {
  src: string;
  dst: string;
  /** Fit-inside box (preserves aspect, never upscales). */
  max?: MaxBox;
  /** JPG/WebP quality 1-100 (default 85). Ignored for lossless targets. */
  quality?: number;
  /** Drop EXIF / C2PA / colour-profile metadata. */
  strip?: boolean;
} & ImagePostOptions;

const DEFAULT_QUALITY = 85;

/**
 * Build the ImageMagick arg array for convert. Exported for unit testing
 * (same pattern as `buildMagickFitArgs`).
 *
 * `-resize 'WxH>'` — the `>` suffix means only-shrink: downscale to fit
 * inside WxH preserving aspect, and leave a smaller-than-box source
 * untouched (never upscale). The target format is inferred by ImageMagick
 * from the dst extension.
 */
export function buildMagickConvertArgs(opts: {
  src: string;
  dst: string;
  max?: MaxBox;
  quality?: number;
  strip?: boolean;
}): string[] {
  const args = [opts.src];
  if (opts.strip) args.push("-strip");
  if (opts.max) args.push("-resize", `${opts.max.w}x${opts.max.h}>`);
  args.push("-quality", String(opts.quality ?? DEFAULT_QUALITY));
  args.push(opts.dst);
  return args;
}

/**
 * Map a 1-100 user quality to ffmpeg's mjpeg `-q:v` scale (2 = best …
 * 31 = worst, inverse): `qv = round(2 + (100 - quality) * 29 / 99)`,
 * clamped to [2, 31]. quality 100 → 2, 85 → 6, 1 → 31. The #021 recipe's
 * hardcoded `-q:v 4` ("≈ 80-90 quality") sits at quality ≈ 92 on this map.
 *
 * Exported for unit testing.
 */
export function jpegQualityToQv(quality: number): number {
  const qv = Math.round(2 + ((100 - quality) * 29) / 99);
  return Math.min(31, Math.max(2, qv));
}

/**
 * Build the ffmpeg fallback arg array for convert (consumed by `runFfmpeg`,
 * which prepends `-y -loglevel error`). Exported for unit testing.
 *
 * Only-shrink scale: `scale='min(iw,W)':'min(ih,H)':
 * force_original_aspect_ratio=decrease:flags=lanczos` — the `min()` target
 * guards against upscale (decrease alone fits-within but scales a smaller
 * source UP to the box), `decrease` preserves aspect inside whatever box
 * remains (the #021 recipe in providers/shared.ts, plus the upscale guard).
 *
 * Quality flag by target format (dst extension):
 *  - .jpg/.jpeg → `-q:v <2-31>` via `jpegQualityToQv()`.
 *  - .webp      → `-quality <1-100>` (libwebp native scale).
 *  - other (.png, …) → none (lossless, quality is meaningless).
 */
export function buildFfmpegConvertArgs(opts: {
  src: string;
  dst: string;
  max?: MaxBox;
  quality?: number;
  strip?: boolean;
}): string[] {
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const args = ["-i", opts.src];
  if (opts.max) {
    args.push(
      "-vf",
      `scale='min(iw,${opts.max.w})':'min(ih,${opts.max.h})':force_original_aspect_ratio=decrease:flags=lanczos`,
    );
  }
  if (opts.strip) args.push("-map_metadata", "-1");
  const ext = path.extname(opts.dst).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    args.push("-q:v", String(jpegQualityToQv(quality)));
  } else if (ext === ".webp") {
    args.push("-quality", String(quality));
  }
  args.push("-frames:v", "1", opts.dst);
  return args;
}

/**
 * Convert a still image: target format from the dst extension, optional
 * fit-inside downscale (never upscale), optional metadata strip, JPG/WebP
 * quality. ImageMagick one-invocation when present (#101), ffmpeg fallback
 * otherwise. Returns the output path.
 */
export async function convertImage(input: ConvertImageOptions): Promise<string> {
  const { src, dst, max, quality = DEFAULT_QUALITY, strip, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });

  const logInput = {
    src,
    dst,
    max: max ? `${max.w}x${max.h}` : null,
    quality,
    strip: Boolean(strip),
  };

  if (hasMagick()) {
    await runMagick(
      buildMagickConvertArgs({ src, dst, max, quality, strip }),
      { endpoint: "imagemagick/convert", input: logInput, opts },
    );
    return dst;
  }

  await runFfmpeg(
    buildFfmpegConvertArgs({ src, dst, max, quality, strip }),
    { endpoint: "ffmpeg/convert", input: logInput, opts },
  );
  return dst;
}
