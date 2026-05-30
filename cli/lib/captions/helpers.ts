// Caption post-processing helpers: brand-spelling substitution, safe-zone +
// max-width wrapping, SRT serialization, and a drawtext-per-line ffmpeg filter
// snippet emitter. Used by `ralphy generate captions` (issue #010) so editors
// can grab the ffmpeg filter directly instead of hand-rolling one per project.
//
// All helpers are pure (no I/O); the caller in cli/commands/generate.ts handles
// reading `<project>/brand-spelling.json` and writing the sidecar files.

import type { Caption } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Brand-spelling dictionary
//
// Common ASR misspellings of brand / product names we keep tripping over. The
// built-in is intentionally tiny — projects extend it via `brand-spelling.json`
// at the project root, which the CLI merges on top.
//
// Match is case-insensitive, whole-token. Replacement preserves the target
// casing literally (so "RALPHY" stays uppercase, "Ralphy" stays title-case).
// ─────────────────────────────────────────────────────────────────────────────

export type BrandSpellingDict = Record<string, string>;

/**
 * Tiny built-in. Project overrides win on conflict. Keep this list short —
 * it's not a global product database, it's the "every project hits this"
 * floor. Expand per-project in `<project>/brand-spelling.json` instead.
 */
export const BUILTIN_BRAND_SPELLING: BrandSpellingDict = {
  ralfy: "Ralphy",
  ralphie: "Ralphy",
  ralfie: "Ralphy",
  raphy: "Ralphy",
  // legacy / common ASR misses for "OpenRouter" / "ElevenLabs"
  openrooter: "OpenRouter",
  "open router": "OpenRouter",
  "eleven labs": "ElevenLabs",
  elevenlab: "ElevenLabs",
  // HyperFrames frequently lands as "hyper frames" or "hyperframe"
  "hyper frames": "HyperFrames",
  hyperframe: "HyperFrames",
};

/**
 * Merge the builtin dict with a project override. Keys are lowercased; the
 * override wins. Returns a fresh object (callers may mutate freely).
 */
export function mergeBrandSpelling(
  override: BrandSpellingDict | null | undefined,
): BrandSpellingDict {
  const out: BrandSpellingDict = {};
  for (const [k, v] of Object.entries(BUILTIN_BRAND_SPELLING)) {
    out[k.toLowerCase()] = v;
  }
  if (override) {
    for (const [k, v] of Object.entries(override)) {
      if (typeof v === "string" && v.length > 0) out[k.toLowerCase()] = v;
    }
  }
  return out;
}

/**
 * Apply brand-spelling substitution to a single caption token. Whole-token,
 * case-insensitive match. Punctuation glued to the token is preserved (so
 * "Ralfy." → "Ralphy.").
 *
 * Returns the original text untouched when no dict entry matches.
 */
export function applyBrandSpelling(text: string, dict: BrandSpellingDict): string {
  if (!text) return text;
  // Strip leading + trailing punctuation for the lookup, but preserve it on the
  // way out. Word-level captions (Scribe / Whisper-words) typically don't carry
  // punctuation; segment-level captions (Gemini single-segment) do.
  const m = /^(\W*)(.*?)(\W*)$/.exec(text);
  if (!m) return text;
  const [, leading = "", core = "", trailing = ""] = m;
  if (!core) return text;
  // Single-token path.
  const hitSingle = dict[core.toLowerCase()];
  if (hitSingle) return `${leading}${hitSingle}${trailing}`;
  // Multi-token path: try replacing inside the core string by phrase.
  let work = core;
  // Sort longest-first so "open router" beats "router".
  const phrases = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (!phrase.includes(" ")) continue;
    const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi");
    work = work.replace(re, dict[phrase] ?? phrase);
  }
  return `${leading}${work}${trailing}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure-functional pass: returns a NEW Caption[] with brand-spelling applied to
 * each token's `.text`. Original array is not mutated (AGENTS invariant #14
 * — append-only over generations, never overwrite).
 */
export function applyBrandSpellingToCaptions(
  captions: Caption[],
  dict: BrandSpellingDict,
): Caption[] {
  return captions.map((c) => ({ ...c, text: applyBrandSpelling(c.text, dict) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe-zone presets
//
// Platform-specific safe zones (where the UI chrome covers the frame). Values
// are y-offsets from the top in normalized [0..1] coords AND the recommended
// horizontal max-width as a percentage of the frame. The drawtext filter
// emitter consumes these.
// ─────────────────────────────────────────────────────────────────────────────

export type SafeZone = "tiktok" | "reels" | "shorts" | "none";

export type SafeZoneSpec = {
  /** Vertical center line for caption text, [0..1] from top. */
  yCenter: number;
  /** Max width of caption text box as a percentage of frame width (0..100). */
  maxWidthPct: number;
};

const SAFE_ZONES: Record<Exclude<SafeZone, "none">, SafeZoneSpec> = {
  // TikTok: bottom CTA + right-rail icons. Place captions mid-frame upper-third.
  tiktok: { yCenter: 0.62, maxWidthPct: 86 },
  // Reels: bottom caption area + heart/share rail on right; mid-frame safe.
  reels: { yCenter: 0.6, maxWidthPct: 86 },
  // Shorts: top "Shorts" label + bottom subscribe / progress bar.
  shorts: { yCenter: 0.5, maxWidthPct: 88 },
};

export function resolveSafeZone(
  zone: SafeZone,
  maxWidthPctOverride: number | undefined,
): SafeZoneSpec {
  if (zone === "none") {
    return { yCenter: 0.5, maxWidthPct: maxWidthPctOverride ?? 90 };
  }
  const base = SAFE_ZONES[zone];
  return {
    yCenter: base.yCenter,
    maxWidthPct: maxWidthPctOverride ?? base.maxWidthPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Caption wrapping
//
// Naive char-based wrap. We don't know the rendered font metrics at this stage
// (no Canvas, no Pango), so we approximate via a maxCharsPerLine derived from
// frame_width * maxWidthPct / avg_char_width. Avg char width = font_size * 0.55
// for most sans-serif faces, which is conservative enough that 95% of wraps fit
// the safe zone without overflow.
//
// Returns each caption with its `.text` split on `\n` for line breaks.
// ─────────────────────────────────────────────────────────────────────────────

export type WrapOptions = {
  frameWidth: number;
  maxWidthPct: number;
  /** Pixel font size to render at (drives the char-width estimate). */
  fontSizePx: number;
  /** Max lines per caption. Anything more is hard-truncated with "…". */
  maxLines?: number;
};

export function wrapCaptionText(text: string, opts: WrapOptions): string {
  const maxLines = opts.maxLines ?? 2;
  const maxPx = opts.frameWidth * (opts.maxWidthPct / 100);
  const avgCharPx = opts.fontSizePx * 0.55;
  const maxChars = Math.max(8, Math.floor(maxPx / avgCharPx));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
      continue;
    }
    if ((cur + " " + w).length <= maxChars) {
      cur = cur + " " + w;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = last.replace(/\s*\S+$/, "") + " …";
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SRT serialization
// ─────────────────────────────────────────────────────────────────────────────

export function captionsToSrt(captions: Caption[]): string {
  if (captions.length === 0) return "";
  const lines: string[] = [];
  captions.forEach((c, i) => {
    lines.push(String(i + 1));
    lines.push(`${msToSrt(c.startMs)} --> ${msToSrt(c.endMs)}`);
    lines.push(c.text);
    lines.push("");
  });
  return lines.join("\n");
}

function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ffmpeg drawtext filter snippet
//
// Emits ONE `drawtext=` filter per caption with `enable='between(t,start,end)'`,
// chained with commas. The fontfile, font_size, and y-position respect the
// safe-zone spec. Output is meant to be pasted directly into an ffmpeg `-vf`
// argument (or written to a `.drawtext.filter` sidecar that ffmpeg loads via
// `-filter_complex_script`).
//
// The frameWidth is encoded as `w` in the expression so the filter scales to
// whatever resolution ffmpeg renders into. We only need maxWidthPct + yCenter
// from the safe-zone spec at filter-emit time.
// ─────────────────────────────────────────────────────────────────────────────

export type DrawtextOptions = {
  fontFile?: string;
  fontSizePx: number;
  fontColor?: string;
  boxColor?: string;
  yCenter: number;
};

export function captionsToDrawtextFilter(
  captions: Caption[],
  opts: DrawtextOptions,
): string {
  if (captions.length === 0) return "";
  const parts: string[] = [];
  for (const c of captions) {
    const safeText = ffmpegEscape(c.text);
    const drawopts: string[] = [];
    if (opts.fontFile) drawopts.push(`fontfile='${ffmpegEscape(opts.fontFile)}'`);
    drawopts.push(`text='${safeText}'`);
    drawopts.push(`fontsize=${opts.fontSizePx}`);
    drawopts.push(`fontcolor=${opts.fontColor ?? "white"}`);
    if (opts.boxColor) {
      drawopts.push(`box=1`);
      drawopts.push(`boxcolor=${opts.boxColor}`);
      drawopts.push(`boxborderw=12`);
    }
    drawopts.push(`x=(w-text_w)/2`);
    // Place baseline at yCenter of frame height. `h` is the frame height in
    // ffmpeg expressions; multiply by the normalized yCenter.
    drawopts.push(`y=h*${opts.yCenter.toFixed(3)}-text_h/2`);
    drawopts.push(`enable='between(t,${(c.startMs / 1000).toFixed(3)},${(c.endMs / 1000).toFixed(3)})'`);
    parts.push(`drawtext=${drawopts.join(":")}`);
  }
  return parts.join(",\n");
}

/** Escape special chars for the ffmpeg drawtext text= argument. */
function ffmpegEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}
