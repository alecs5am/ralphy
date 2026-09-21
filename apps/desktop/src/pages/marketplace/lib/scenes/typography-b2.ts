/** Remocn scenes for the typography-b2 shard. */
import { caret } from "./shared";
import { scene, type SceneSpec } from "./types";

/** One whole run of `rolling-number`, in milliseconds. Must match its `motion` below. */
const ROLL_RUN_MS = 3000;
/** `COUNT_PORTION` upstream: the value ramp is done by 80% of the composition. */
const ROLL_COUNT_PORTION = 0.8;

/**
 * How many whole revolutions a place is allowed to spin. Upstream's ones wheel turns 2481 times
 * for the default 0 -> 24813, which needs a 24 814-cell strip; a CSS translate cannot wrap the way
 * the upstream per-frame `value % 10` does. The cap keeps the shape that reads — each place an
 * octave slower than the one to its right — at a strip the DOM can hold.
 */
const rollTurnCap = (place: number) => Math.max(1, 8 >> place);

const wrap10 = (value: number) => ((value % 10) + 10) % 10;

/**
 * Signed cell travel for one place: whole turns, then the step onto the final digit. The sign
 * picks the strip's direction; the strip is always walked from its first cell, so the CSS is
 * driven by the magnitude alone (see `--travel` below).
 */
const placeTravel = (start: number, end: number, place: number) => {
  const pow = 10 ** place;
  const up = end >= start;
  const startDigit = Math.floor(start / pow) % 10;
  const finalDigit = Math.floor(end / pow) % 10;
  const turns = Math.min(Math.floor(Math.abs(end - start) / (pow * 10)), rollTurnCap(place));
  const step = up ? wrap10(finalDigit - startDigit) : wrap10(startDigit - finalDigit);
  return (up ? 1 : -1) * (turns * 10 + step);
};

/**
 * When place `p` starts rising into view. Upstream reveals it over `current` in
 * [0.4 * 10^p, 10^p], so the trigger has to be pulled back through the quartic-out value ramp:
 * `e = 1 - (1 - t)^4` inverts to `t = 1 - (1 - e)^(1/4)`.
 */
const revealDelayMs = (start: number, end: number, place: number) => {
  if (end === start) return 0;
  const e = (10 ** place * 0.4 - start) / (end - start);
  const t = e <= 0 ? 0 : e >= 1 ? 1 : 1 - (1 - e) ** 0.25;
  return Math.round(t * ROLL_COUNT_PORTION * ROLL_RUN_MS);
};

export const typographyB2: readonly SceneSpec[] = [
  /**
   * Text types in left to right under a sliding cover, the caret riding the cover's leading edge,
   * then the caret drops into upstream's square-wave blink: a hard cut every 15 frames, never a
   * fade. Upstream's own `useTypewriter` hook is not embedded in this dataset, so the reveal is
   * built from its call-site contract rather than read.
   */
  scene({
    id: "typewriter",
    group: "typography",
    shard: "typography-b2",
    stage: { w: 480, h: 270 },
    params: { cursor: true, charsPerSecond: 22, fontSize: 48, speed: 1 },
    palette: { text: "#171717", bg: "#ffffff" },
    // 0.64 s of typing (22 cps across a ~14-character title), then the caret blinks on the tail.
    motion: { kind: "cycle", seconds: 0.64, hold: 1.86 },
    still: 0.5,
    fidelity: {
      level: "approximate",
      note: "The reveal steps the cover by an equal share of the line width per character rather than by each glyph's own advance, the typing window is a fixed 25.6% of the run so the effective rate drifts around the nominal 22 cps with the title length, and the line is anchored instead of re-centring as it grows.",
    },
    markup: (ctx, p) => {
      const count = Math.max(1, Array.from(ctx.title).length);
      return (
        `<div class="rv-stage"><span class="rv-line" style="--fs:${p.fontSize};--steps:steps(${count})">` +
        `<span class="rv-tape"><span class="rv-text">${ctx.title}</span>` +
        `<i class="rv-cover">${p.cursor ? caret() : ""}</i></span></span></div>`
      );
    },
  }),

  /**
   * An odometer, not a fade: every place is a strip of digits translated up behind a one-cell
   * window, each running its own distance over the same quartic-out ramp, so the ones wheel is a
   * blur while the leading place barely moves. Leading places rise 0.32em into view as the count
   * crosses 40% of their threshold.
   */
  scene({
    id: "rolling-number",
    group: "typography",
    shard: "typography-b2",
    stage: { w: 480, h: 270 },
    params: { from: 0, to: 24813, fontSize: 120, speed: 1 },
    palette: { text: "#171717", bg: "#ffffff" },
    // Counting is done at 80% of the run; the tail holds the landed value.
    motion: { kind: "cycle", seconds: 2.4, hold: 0.6 },
    still: 0.9,
    fidelity: {
      level: "approximate",
      note: "Whole revolutions per place are capped (8, 4, 2, 1, 1 from the ones place up) because a CSS translate cannot wrap a digit strip the way upstream's per-frame modulo does; every place still lands on exactly the upstream digit, and the reveal ramp is one shared 6.2% band rather than each place's own.",
    },
    markup: (_ctx, p) => {
      const start = Math.max(0, Math.round(p.from));
      const end = Math.max(0, Math.round(p.to));
      const places = String(Math.max(start, end)).length;
      const columns: string[] = [];
      for (let place = 0; place < places; place += 1) {
        if (place > 0 && place % 3 === 0) columns.unshift(`<i class="rv-gap"></i>`);
        const travel = placeTravel(start, end, place);
        const startDigit = Math.floor(start / 10 ** place) % 10;
        const strip = Array.from({ length: Math.abs(travel) + 1 }, (_, cell) =>
          `<i>${wrap10(startDigit + (travel < 0 ? -cell : cell))}</i>`).join("");
        columns.unshift(
          `<span class="rv-col${place > 0 ? " rv-lead" : ""}" ` +
          `style="--travel:${Math.abs(travel)};--rv-own:${revealDelayMs(start, end, place)}ms">` +
          `<span class="rv-strip">${strip}</span></span>`);
      }
      return `<div class="rv-stage"><div class="rv-odo" style="--fs:${p.fontSize}">${columns.join("")}</div></div>`;
    },
  }),
];
