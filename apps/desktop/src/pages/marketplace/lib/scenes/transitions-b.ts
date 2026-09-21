/**
 * Remocn scenes for the transitions-b shard: `wave-wipe`, `whip-pan` and `zoom-blur`.
 *
 * All three are Remotion `TransitionPresentation`s: both scenes are alive at once and stacked, and
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

/**
 * The outgoing scene drifts up 70% (ease-in cubic, p 0 -> 0.70) and fades over p 0.30 -> 0.50; a
 * wave field rises over it (opacity p 0.18 -> 0.45, `offsetY` drift 0 -> 0.7 across the whole
 * transition); the incoming scene climbs a full frame-height from below, overshoots 3.5% above
 * centre at p = 0.82 and settles at p = 1. The entering scene has no opacity ramp at all.
 *
 * The field is upstream's `ShaderGrainGradient`, i.e. `@paper-design/shaders-react`'s
 * `<GrainGradient>` with `shape="wave"`; decision D1 runs the real package, so it is mounted here
 * rather than approximated with a CSS gradient.
 */
const waveWipe = scene({
  id: "wave-wipe",
  group: "transitions",
  shard: "transitions-b",
  stage: { w: 480, h: 270 },
  params: { intensity: 0.2, softness: 0.7, noise: 0.4, zoom: 1.16 },
  palette: {
    text: "#e6e3f0", bg: "#141318", wave1: "#3a3a52", wave2: "#4a4a68",
    wave3: "#8f88ae", plateA: "#d9d4ec", plateB: "#1f1d29", ink: "#2b2838", accent: "#8f88ae",
  },
  // `zoom` is upstream's own name for the wrapper's `scale`; every other prop keeps its name. The
  // wrapper hard-codes `fit="cover"`, and its `colors` / `colorBack` are wave-wipe's own literals.
  paint: {
    engine: "paper",
    component: "GrainGradient",
    props: {
      shape: "wave", colors: ["@wave1", "@wave2", "@wave3"], colorBack: "@bg",
      intensity: 0.2, softness: 0.7, noise: 0.4, scale: 1.16, fit: "cover",
    },
  },
  motion: { kind: "cycle", seconds: 1.2, hold: 0.8 },
  // p = 0.533: the outgoing plate has finished fading, the wave holds the top 30% of the frame and
  // the incoming plate has climbed under it -- the frame where the wipe is legible as a wipe.
  still: 0.32,
  fidelity: {
    level: "approximate",
    note: "The shader itself is upstream's own GrainGradient, but a paint engine's props are fixed for the run, so the `offsetY` pan upstream drives from 0 to 0.7 across the transition is not applied; the field moves on its own time term alone.",
  },
  markup: () =>
    `<div class="rv-stage">` +
    `<div class="rv-out">${panel("dusk", 3)}</div>` +
    `<div class="rv-field"><div class="rv-paper"></div></div>` +
    `<div class="rv-in">${panel("dawn", 2)}</div>` +
    `</div>`,
});

/**
 * Both scenes fly through the frame in one move. `travel` is p through cubic-bezier(0.7, 0, 0.2, 1)
 * and `velocity = sin(PI * travel)` is a 0 -> 1 -> 0 bell; the exiting pass sits at
 * `travel * 110%` and the entering one at `(travel - 1) * 110%` along the direction's axis, while
 * both carry the same `1 + velocity * 0.12` directional stretch and `velocity * blur` smear.
 */
const whipPan = scene({
  id: "whip-pan",
  group: "transitions",
  shard: "transitions-b",
  stage: { w: 480, h: 270 },
  params: { direction: "left", blur: 24 },
  palette: { text: "#fafafa", bg: "#0d0d10", accent: "#8f88ae", panel: "#413d56" },
  motion: { kind: "cycle", seconds: 0.9, hold: 1.1 },
  // The bell's peak: both plates sit 55% out of frame in opposite directions under the full
  // stretch and the full smear. Any other frame reads as a plain slide.
  still: 0.208,
  markup: (_ctx, params) => {
    const horizontal = params.direction === "left" || params.direction === "right";
    const sign = params.direction === "left" || params.direction === "up" ? -1 : 1;
    return (
      `<div class="rv-stage" style="--wp-x:${horizontal ? sign : 0};--wp-y:${horizontal ? 0 : sign};` +
      `--wp-sx:${horizontal ? 1 : 0};--wp-sy:${horizontal ? 0 : 1};--wp-blur:${params.blur}em">` +
      `<div class="rv-out">${panel("stripe", 3)}</div>` +
      `<div class="rv-in">${panel("column", 4)}</div>` +
      `</div>`
    );
  },
});

/**
 * A depth punch-in: the outgoing scene pushes through the viewer (scale 1 -> 1.12, blur 0 -> 16,
 * opacity 1 -> 0) while the incoming one resolves out of blur (scale 0.9 -> 1, blur 16 -> 0,
 * opacity 0 -> 1). Every ramp is a straight lerp on p -- the component eases nothing itself -- so
 * all the shaping has to come from the driving clock.
 */
const zoomBlur = scene({
  id: "zoom-blur",
  group: "transitions",
  shard: "transitions-b",
  stage: { w: 480, h: 270 },
  params: { blur: 16, rise: 0 },
  palette: {
    text: "#e6e3f0", bg: "#0d0d10", core: "#3a3a5c",
    ring: "#8f88ae", card: "#f2f2f2", accent: "#413d56",
  },
  motion: { kind: "cycle", seconds: 0.9, hold: 0.9 },
  // The driving bezier puts p at 0.22 here: the outgoing plate still carries the frame at 78% under
  // 3.5em of blur, already pushed to 1.03, while the incoming one ghosts in behind 12.5em of its
  // own. Later frames are a truer midpoint but the white plate washes the tunnel out of the card.
  still: 0.04,
  markup: (_ctx, params) =>
    `<div class="rv-stage" style="--zb-blur:${params.blur}em;--zb-rise:${params.rise}em">` +
    `<div class="rv-out">${panel("tunnel", 4)}</div>` +
    `<div class="rv-in">${panel("slab", 2)}</div>` +
    `</div>`,
});

export const transitionsB: readonly SceneSpec[] = [waveWipe, whipPan, zoomBlur];
