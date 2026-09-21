/** Remocn scenes for the typography-b1 shard. */
import { esc } from "./shared";
import { scene, type SceneSpec } from "./types";

export const typographyB1: readonly SceneSpec[] = [
  /**
   * A marker bar springs across the last word of the line and bleeds 0.1em past each end, the way
   * a real highlighter overshoots. The spring is `{ damping: 14 }`, which peaks at 104.6% of the
   * word width before settling — that overshoot is the whole character of the effect, so the
   * sweep is written as a sampled keyframe list rather than a bezier, which cannot overshoot.
   *
   * Upstream also recolours the highlighted text between 50% and 80% of the sweep, but its two
   * defaults (`baseColor` and `highlightedTextColor`) are both #171717, so with the shipped props
   * nothing visibly changes. Reproduced as written: no colour animation.
   */
  scene({
    id: "marker-highlight",
    group: "typography",
    shard: "typography-b1",
    stage: { w: 480, h: 270 },
    params: { before: "", after: "", fontSize: 72, speed: 1 },
    palette: { text: "#171717", bg: "#ffffff", accent: "#facc15" },
    // The bar waits 15 frames, then springs for 24 more: 39 frames of motion, then it just sits.
    motion: { kind: "cycle", seconds: 1.3, hold: 1.2 },
    still: 0.7,
    markup: (ctx, p) => {
      const parts = ctx.title.split(/\s+/).filter(Boolean);
      const highlight = parts.pop() ?? ctx.title;
      const lead = parts.length > 0 ? `${parts.join(" ")} ` : "";
      return (
        `<div class="rv-stage"><span class="rv-line" style="--fs:${p.fontSize}">${esc(p.before)}${lead}` +
        `<span class="rv-mark"><i class="rv-ink"></i><span class="rv-hl">${highlight}</span></span>` +
        `${esc(p.after)}</span></div>`
      );
    },
  }),
];
