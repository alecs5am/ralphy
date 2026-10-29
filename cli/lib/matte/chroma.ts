// Colour-difference chroma keyer for `ralphy matte key` (issue #560).
//
// Pure ffmpeg, zero installs, zero provider calls. The key is the classic
// colour-difference matte that keyers like Keylight and IBK start from:
//
//   d     = K - max(O1, O2)          K = the screen channel (G for green, B for blue)
//   alpha = clip((high - d) / (high - low), 0, 1)
//   K'    = min(K, max(O1, O2))      despill "max": only the spill above the
//                                    other two channels is removed
//   K'    = min(K, (O1 + O2) / 2)    despill "avg": stronger, for heavy spill
//
// `low` and `high` scale with the measured screen strength (the median d of
// the frame border), so a dim, unevenly lit screen keys as cleanly as a
// saturated one. Every op is an 8-bit plane filter (extractplanes, blend,
// lut, mergeplanes), which runs at about 90 fps on a 1080x1920 frame on an
// M4 Pro.
//
// This module is pure (strings and numbers in, strings and numbers out) so
// the graph and the threshold math are unit-tested without ffmpeg.

export const SCREENS = ["green", "blue"] as const;
export type Screen = (typeof SCREENS)[number];

export const DESPILL_MODES = ["max", "avg", "off"] as const;
export type DespillMode = (typeof DESPILL_MODES)[number];

/** Fractions of the screen strength where the matte starts / stops being transparent. Tuned on the #560 bench. */
export const DEFAULT_LOW_FRAC = 0.1;
export const DEFAULT_HIGH_FRAC = 0.9;

/** Reject a "screen" weaker than this: the border is not a chroma screen. */
export const MIN_SCREEN_STRENGTH = 24;

/** Reject a "screen" that covers less of the frame border than this (a green prop is not a screen). */
export const MIN_SCREEN_COVERAGE = 0.35;

/** True when an estimate looks like a real chroma screen: strong enough and around most of the border. */
export function isChromaScreen(est: ScreenEstimate): boolean {
  return est.strength >= MIN_SCREEN_STRENGTH && est.coverage >= MIN_SCREEN_COVERAGE;
}

export type ScreenEstimate = {
  screen: Screen;
  /** Median border colour (sRGB, 0..255). */
  rgb: [number, number, number];
  /** Median of K - max(O1, O2) over border pixels that look like the screen. */
  strength: number;
  /** Border pixels that looked like the screen / all border pixels. */
  coverage: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function keyDiff(r: number, g: number, b: number, screen: Screen): number {
  return screen === "green" ? g - Math.max(r, b) : b - Math.max(r, g);
}

/**
 * Estimate the screen colour and strength from a small RGB24 frame (the
 * caller downscales the sample frame, e.g. to 96 px wide). Only the outer
 * `ring` pixels are read: on a green-screen shot the frame edge is screen.
 * With `screen` unset, green vs blue is picked by which one dominates.
 */
export function estimateScreen(
  rgb: Uint8Array,
  width: number,
  height: number,
  opts: { ring?: number; screen?: Screen } = {},
): ScreenEstimate | null {
  if (width <= 0 || height <= 0 || rgb.length < width * height * 3) return null;
  const ring = Math.max(1, Math.min(opts.ring ?? 3, Math.floor(Math.min(width, height) / 2)));
  const px: Array<[number, number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue;
      const i = (y * width + x) * 3;
      px.push([rgb[i]!, rgb[i + 1]!, rgb[i + 2]!]);
    }
  }
  if (px.length === 0) return null;
  const pick = (s: Screen) => px.filter(([r, g, b]) => keyDiff(r, g, b, s) > 0);
  let screen: Screen;
  if (opts.screen) screen = opts.screen;
  else screen = pick("green").length >= pick("blue").length ? "green" : "blue";
  const diffs = px.map(([r, g, b]) => keyDiff(r, g, b, screen));
  // Pixels that look like screen: clearly positive difference. Subject pixels
  // touching the frame edge (shoulders, feet) are excluded from the median.
  const screenPx = px.filter((_, i) => diffs[i]! >= MIN_SCREEN_STRENGTH / 2);
  if (screenPx.length === 0) return { screen, rgb: [0, 0, 0], strength: 0, coverage: 0 };
  const strength = median(screenPx.map(([r, g, b]) => keyDiff(r, g, b, screen)));
  return {
    screen,
    rgb: [
      Math.round(median(screenPx.map((p) => p[0]))),
      Math.round(median(screenPx.map((p) => p[1]))),
      Math.round(median(screenPx.map((p) => p[2]))),
    ],
    strength: Math.round(strength),
    coverage: Math.round((screenPx.length / px.length) * 1000) / 1000,
  };
}

export type KeyThresholds = { low: number; high: number };

/**
 * Matte thresholds in key-difference units (0..255): `d <= low` is opaque
 * subject, `d >= high` is transparent screen. Explicit values win; otherwise
 * they scale with the screen strength.
 */
export function keyThresholds(
  strength: number,
  opts: { low?: number; high?: number; lowFrac?: number; highFrac?: number } = {},
): KeyThresholds {
  const s = Math.max(strength, MIN_SCREEN_STRENGTH);
  let low = opts.low ?? Math.round(s * (opts.lowFrac ?? DEFAULT_LOW_FRAC));
  let high = opts.high ?? Math.round(s * (opts.highFrac ?? DEFAULT_HIGH_FRAC));
  low = Math.max(0, Math.min(254, low));
  high = Math.max(low + 1, Math.min(255, high));
  return { low, high };
}

/** Alpha (0..255) for one key difference value; mirrors the ffmpeg `lut` expression exactly. */
export function alphaFor(d: number, t: KeyThresholds): number {
  const v = Math.max(0, d);
  return Math.max(0, Math.min(255, (255 * (t.high - v)) / (t.high - t.low)));
}

export type ChromaGraphOpts = {
  screen: Screen;
  thresholds: KeyThresholds;
  despill: DespillMode;
  /** Shrink (positive) or grow (negative) the matte edge in pixels, 0 = off. */
  choke?: number;
  /** Gaussian blur sigma applied to the matte, 0 = off. */
  soften?: number;
  inputLabel?: string;
  outputLabel?: string;
};

/**
 * The ffmpeg filter graph for the colour-difference key. Output is `gbrap`
 * with straight (unpremultiplied) alpha, which is what VP9 alpha and ProRes
 * 4444 store and what Chrome composites.
 *
 * ffmpeg's `extractplanes` emits outputs in plane-flag order (r, g, b) no
 * matter how they are listed, and `gbrap` stores planes as G, B, R, A, which
 * is why the mergeplanes mapping is spelled out below.
 */
export function chromaKeyGraph(opts: ChromaGraphOpts): string {
  const inp = opts.inputLabel ?? "0:v";
  const outp = opts.outputLabel ?? "keyed";
  const { low, high } = opts.thresholds;
  if (!(high > low)) throw new Error(`high (${high}) must be greater than low (${low})`);
  // K = key channel, O1/O2 = the other two, in gbrap plane terms.
  const [k, o1, o2] = opts.screen === "green" ? ["g", "r", "b"] : ["b", "r", "g"];
  const parts: string[] = [];
  parts.push(`[${inp}]format=gbrp,extractplanes=r+g+b[pr][pg][pb]`);
  parts.push(`[p${k}]split[k1][k2]`);
  parts.push(`[p${o1}]split[o1a][o1b]`);
  parts.push(`[p${o2}]split[o2a][o2b]`);
  parts.push(`[o1a][o2a]blend=all_mode=lighten,split[mx1][mx2]`);
  // Alpha from the colour difference d = K - max(O1, O2) (blend subtract clamps at 0).
  let matte = `[k1][mx1]blend=all_mode=subtract,lut=c0='clip(255*(${high}-val)/${high - low},0,255)'`;
  const choke = opts.choke ?? 0;
  if (choke > 0) matte += `,erosion`.repeat(Math.min(Math.round(choke), 8));
  if (choke < 0) matte += `,dilation`.repeat(Math.min(Math.round(-choke), 8));
  if ((opts.soften ?? 0) > 0) matte += `,gblur=sigma=${opts.soften}`;
  parts.push(`${matte}[alpha]`);
  // Despill the key channel.
  if (opts.despill === "max") {
    parts.push(`[k2][mx2]blend=all_mode=darken[kd]`);
  } else if (opts.despill === "avg") {
    parts.push(`[o1b]split[o1c][o1d]`);
    parts.push(`[o2b]split[o2c][o2d]`);
    parts.push(`[o1c][o2c]blend=all_mode=average[avg]`);
    parts.push(`[k2][avg]blend=all_mode=darken[kd]`);
    parts.push(`[mx2]nullsink`);
  } else {
    parts.push(`[k2]null[kd]`);
    parts.push(`[mx2]nullsink`);
  }
  // Rebuild gbrap: plane 0 = G, 1 = B, 2 = R, 3 = A.
  const despilledO1 = opts.despill === "avg" ? "o1d" : "o1b";
  const despilledO2 = opts.despill === "avg" ? "o2d" : "o2b";
  const plane: Record<"r" | "g" | "b", string> = { r: "", g: "", b: "" };
  plane[k as "g" | "b"] = "kd";
  plane[o1 as "r"] = despilledO1;
  plane[o2 as "b" | "g"] = despilledO2;
  parts.push(`[${plane.g}][${plane.b}][${plane.r}][alpha]mergeplanes=mapping=0x00102030:format=gbrap[${outp}]`);
  return parts.join(";");
}
