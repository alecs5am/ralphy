/** Remocn scenes for the typography-a1 shard. */
import { at, esc, words } from "./shared";
import { scene, type SceneSpec } from "./types";

/** Remocn's registry compositions run at 30 fps, so one upstream frame is this many milliseconds. */
const FRAME_MS = 1000 / 30;

/**
 * Upstream builds `Array.from(text)` into one span per character, so the stagger index counts the
 * spaces too. Runs of glyphs are grouped into a `.rv-w`, which `shared.css` gives `white-space: pre`
 * — that removes every line-break opportunity inside a word, so a long title wraps between words
 * instead of splitting one. The per-character stagger itself is untouched.
 */
const riseChars = (text: string, staggerMs: number) => {
  let index = 0;
  return text
    .split(" ")
    .map((word) => {
      const glyphs = Array.from(word)
        .map((character) => {
          const position = index;
          index += 1;
          return `<span class="rv-ch" style="${at(position, position * staggerMs)}">${esc(character)}</span>`;
        })
        .join("");
      index += 1; // upstream's `Array.from(text)` gives the separating space an index of its own
      return `<span class="rv-w">${glyphs}</span>`;
    })
    .join(" ");
};

export const typographyA1: readonly SceneSpec[] = [
  /**
   * Words fade up out of a 6px blur, sit clean, then lift away while the blur grows back to 8px.
   * Enter and exit are both staggered one frame per word, which is why the tail of the line is
   * still arriving while its head has already settled.
   */
  scene({
    id: "blur-out-up",
    group: "typography",
    shard: "typography-a1",
    stage: { w: 480, h: 270 },
    params: { staggerDelay: 1, fontSize: 72, speed: 1 },
    palette: { text: "#171717", bg: "#ffffff" },
    // 17 frames of entrance + 14 of exit = 31 frames of motion, parked clean in between.
    motion: { kind: "cycle", seconds: 1.03, hold: 1.4 },
    // Frame 4 of the entrance: "Motion" has landed, "Made" is still hazed and "Simple" is barely
    // in. A settled frame here is indistinguishable from per-character-rise's, so the frozen card
    // parks where this component's own per-word blur cascade is the picture.
    still: 0.055,
    markup: (ctx, p) =>
      `<div class="rv-stage"><span class="rv-line" style="--fs:${p.fontSize}">` +
      `${words(ctx.title, p.staggerDelay * FRAME_MS)}</span></div>`,
  }),

  /**
   * The same family, deliberately the opposite treatment: per character rather than per word, a
   * 32px rise instead of 10px, no blur at any point and no exit at all. The two curves differ —
   * opacity settles fully, the travel arrives slightly slack.
   */
  scene({
    id: "per-character-rise",
    group: "typography",
    shard: "typography-a1",
    stage: { w: 480, h: 270 },
    params: { distance: 32, fontSize: 72, speed: 1 },
    palette: { text: "#171717", bg: "#ffffff" },
    // 21 frames is the longest of the two ramps; the rest of the run holds the settled line.
    motion: { kind: "cycle", seconds: 0.7, hold: 1.6 },
    // Frame 14, mid-cascade: the head of the line has arrived and the tail is still rising out of
    // nothing, which is the per-character signature. Parked at rest it would read as blur-out-up.
    still: 0.2,
    markup: (ctx, p) =>
      `<div class="rv-stage"><span class="rv-line" style="--fs:${p.fontSize};--rise:${(p.distance / p.fontSize).toFixed(4)}em">` +
      `${riseChars(ctx.title, FRAME_MS)}</span></div>`,
  }),
];
