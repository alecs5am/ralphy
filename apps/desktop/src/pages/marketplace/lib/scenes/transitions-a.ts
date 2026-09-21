/**
 * Remocn scenes for the transitions-a shard: `ascii-dissolve` and `page-turn`.
 *
 * Both are Remotion `TransitionPresentation`s, so both scenes are alive at once and stacked, and
 * each pass is styled independently. Upstream windows are written in p-space (the presentation's
 * own progress, 0 -> 1) and carry no duration of their own; this port picks a preview duration and
 * maps every window onto one run with `pct = p * seconds / (seconds + hold) * 100`.
 */
import type { SceneSpec } from "./types";
import { scene } from "./types";

/**
 * A CSS-drawn stand-in for one of the two scenes a transition moves between. Upstream these are
 * the caller's `children`, so there is nothing to transcribe: what matters is that the outgoing
 * and the incoming plate look nothing alike, or the transition reads as nothing happening.
 */
const panel = (kind: string, marks: number) =>
  `<div class="rv-plate rv-plate-${kind}">` +
  Array.from({ length: marks }, (_, index) => `<i style="--i:${index}"></i>`).join("") +
  `</div>`;

/** `AsciiDissolveProps` defaults. The spec and the canvas field read the same object. */
const asciiDefaults = { cellSize: 22, accentDensity: 0.05, ramp: " .:-=+*#%@" } as const;

/**
 * The outgoing plate fades (p 0.14 -> 0.30) and blurs (p 0.14 -> 0.36) under a rising field of
 * monospace glyphs; the field holds fully opaque long enough to be READ as text, then drops back
 * down the density ramp while the incoming plate resolves out of blur (p 0.62 -> 0.80/0.85/1.00).
 * The per-cell ramp is arithmetic, not a CSS property, so it is painted by `canvas/ascii-field.ts`.
 */
const asciiDissolve = scene({
  id: "ascii-dissolve",
  group: "transitions",
  shard: "transitions-a",
  stage: { w: 480, h: 270 },
  params: asciiDefaults,
  palette: { text: "#f2f2f299", bg: "#0d0d10", plateA: "#8f88ae", plateB: "#3a3a52", line: "#f2f2f2" },
  motion: { kind: "cycle", seconds: 1.2, hold: 0.9 },
  // p = 0.42: the field is at full opacity and full coverage, both plates are invisible, and the
  // card is the glyph grid itself -- the one frame that says "ASCII Dissolve" and nothing else.
  still: 0.24,
  paint: { engine: "canvas", field: "ascii-field", cells: [43, 14], fps: 20, params: asciiDefaults },
  markup: () =>
    `<div class="rv-stage">` +
    `<div class="rv-out">${panel("poster", 2)}</div>` +
    `<div class="rv-in">${panel("ledger", 4)}</div>` +
    `<canvas class="rv-canvas" width="480" height="270" data-field="ascii-field"></canvas>` +
    `</div>`,
});

/**
 * The exiting page does not move for the first half of the transition, then snaps through seven
 * discrete poses in the last 44%: `pose = floor(clamp(p)^3 * poses) / (poses - 1)`, lifted
 * `pose * height * 1.28` and rotated `angle * pose`. The revealed page below is completely
 * unstyled upstream, so it does not move here either.
 */
const pageTurn = scene({
  id: "page-turn",
  group: "transitions",
  shard: "transitions-a",
  stage: { w: 480, h: 270 },
  params: { angle: -7, origin: "18% 100%", poses: 8 },
  palette: {
    text: "#f4f1e8", bg: "#1f1d29", paper: "#f4f1e8",
    rule: "#3a3a52", leaf: "#2b2838", accent: "#8f88ae", shade: "#0d0d1099",
  },
  motion: { kind: "cycle", seconds: 1.2, hold: 1.2 },
  // p = 0.676 sits in the third bucket: lifted two sevenths of 1.28 frame-heights and tilted 2deg,
  // so the card shows the flick mid-flight with the next page already reading underneath.
  still: 0.338,
  markup: (ctx, params) =>
    `<div class="rv-stage">` +
    `<div class="rv-under">${panel("leaf", 3)}</div>` +
    `<div class="rv-page" style="transform-origin:${ctx.esc(params.origin)};` +
    `--pt-angle:${params.angle}deg;--pt-poses:${params.poses}">${panel("sheet", 5)}</div>` +
    `</div>`,
});

export const transitionsA: readonly SceneSpec[] = [asciiDissolve, pageTurn];
