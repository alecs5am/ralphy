// Alpha output helpers for `ralphy matte` (issue #560): output naming,
// append-only versioning, and the ffmpeg encode arguments per format.
//
// Format choice. HyperFrames composites both VP9-alpha WebM and ProRes 4444:
// its renderer re-extracts every video with ffmpeg and switches to PNG frames
// for alpha-capable codecs (vp9, vp8, prores), decoding VP9 with libvpx so
// the alpha plane survives. Only WebM also plays in the browser preview
// (Chromium has no ProRes decoder), and it is about 100x smaller (1.5 MB vs
// 200 MB for 4 s of 1080x1920). So `webm` is the default and `mov` is for
// handing a matte to an editor (Resolve, Premiere, Final Cut).

import { existsSync } from "node:fs";
import path from "node:path";

export const MATTE_FORMATS = ["webm", "mov"] as const;
export type MatteFormat = (typeof MATTE_FORMATS)[number];
export type OutputFormat = MatteFormat | "png";

export const MATTE_QUALITIES = ["fast", "balanced", "best"] as const;
export type MatteQuality = (typeof MATTE_QUALITIES)[number];

/** VP9 CRF per quality preset; mirrors `hyperframes remove-background --quality`. */
export const VP9_CRF: Record<MatteQuality, number> = { fast: 30, balanced: 18, best: 12 };

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"]);

export function isImagePath(p: string): boolean {
  return IMAGE_EXTS.has(path.extname(p).toLowerCase());
}

/** `a.webm` -> `a.webm` if free, else `a.v2.webm`, `a.v3.webm`, ... (never overwrite). */
export function nextFreeFile(target: string, exists: (p: string) => boolean = existsSync): string {
  if (!exists(target)) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);
  for (let v = 2; v < 10_000; v++) {
    const cand = `${stem}.v${v}${ext}`;
    if (!exists(cand)) return cand;
  }
  throw new Error(`too many versions of ${target}`);
}

export type MatteKind = "key" | "subject";

/**
 * Default output path: `<dir>/<stem>.matte-<kind>.<ext>` where `<dir>` is the
 * project's `artifacts/videos/` (or `artifacts/images/` for a still) when a
 * project dir is given, else the source's own directory.
 */
export function defaultMatteOut(
  source: string,
  kind: MatteKind,
  format: OutputFormat,
  projectArtifactsDir?: string | null,
): string {
  const stem = path.basename(source, path.extname(source));
  const dir = projectArtifactsDir
    ? path.join(projectArtifactsDir, format === "png" ? "images" : "videos")
    : path.dirname(path.resolve(source));
  return path.join(dir, `${stem}.matte-${kind}.${format}`);
}

/** The output format implied by an explicit `--out` path, or null if unsupported. */
export function formatFromOut(out: string): OutputFormat | null {
  const ext = path.extname(out).toLowerCase().replace(/^\./, "");
  if (ext === "webm" || ext === "mov" || ext === "png") return ext;
  return null;
}

/** ffmpeg output arguments for straight-alpha video or a PNG cutout. */
export function alphaEncodeArgs(format: OutputFormat, quality: MatteQuality = "balanced"): string[] {
  const tags = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
  if (format === "png") return ["-frames:v", "1", "-pix_fmt", "rgba", "-update", "1"];
  if (format === "mov") {
    return ["-c:v", "prores_ks", "-profile:v", "4444", "-vendor", "apl0", "-pix_fmt", "yuva444p10le", ...tags, "-an"];
  }
  return [
    "-c:v", "libvpx-vp9",
    "-b:v", "0",
    "-crf", String(VP9_CRF[quality]),
    "-deadline", "good",
    // cpu-used 2: 2.3x faster than 0 at 15% more bytes (bench, #560).
    "-cpu-used", "2",
    "-row-mt", "1",
    // libvpx drops the alpha plane when alt-ref frames are on.
    "-auto-alt-ref", "0",
    "-pix_fmt", "yuva420p",
    "-metadata:s:v:0", "alpha_mode=1",
    ...tags,
    "-an",
  ];
}

/**
 * Tail of a graph that ends in RGB (`gbrap`): convert to YUV with the BT.709
 * matrix the encode args tag, so colours match the source when the matte is
 * composited over it. PNG stays RGB.
 */
export function rgbToOutputTail(format: OutputFormat): string {
  if (format === "png") return "format=rgba";
  const pix = format === "mov" ? "yuva444p10le" : "yuva420p";
  return `scale=out_color_matrix=bt709:out_range=tv,format=${pix}`;
}

/**
 * Graph that attaches a grayscale matte (input 1) to the source (input 0)
 * without an RGB round trip, so the subject keeps the source's exact YUV
 * values (text-behind-subject composites it over its own source).
 */
export function subjectMergeGraph(format: OutputFormat): string {
  if (format === "png") return "[1:v]format=gray[m];[0:v]format=rgb24[c];[c][m]alphamerge,format=rgba[out]";
  const pix = format === "mov" ? "yuva444p10le" : "yuva420p";
  return `[1:v]format=gray[m];[0:v]format=yuv420p[c];[c][m]alphamerge,format=${pix}[out]`;
}
