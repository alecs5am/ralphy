/**
 * Remocn scenes for the effects shard.
 *
 * Three hand-drawn/particle effects that upstream builds out of plain DOM and SVG, with no shader
 * anywhere: a mulberry32 confetti burst, a radial ribbon burst that welds itself into a ring, and a
 * stepped brush-ink arrow. Every deterministic table upstream computes at render time is computed
 * here once, at markup time, and baked into inline custom properties, so the keyframes stay shared
 * and no rule ever needs `:nth-child`.
 */
import { scene, type SceneSpec } from "./types";

const STAGE_W = 480;
const STAGE_H = 270;
/** Everything in this shard is authored against 30 fps, like its upstream sources. */
const MS_PER_FRAME = 1000 / 30;
const fx = (value: number, digits = 3) => Number(value.toFixed(digits));

/* --------------------------------------------------------------------- confetti */

/** `mulberry32`, verbatim from the upstream component: the particle table is its draw order. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Upstream's `DEFAULT_COLORS`, in order. Index 0 becomes `accent` so Customize can reach it. */
const CONFETTI_COLORS = ["#1d9bf0", "#ff5da2", "#ffd23f", "#22c55e", "#a855f7", "#ff7a45"];
/** A prefix of the 140-piece table, not a resample: `makeParticles` draws in one fixed order, so the
 *  first N pieces are the real first N. Below roughly this many the burst stops reading as confetti. */
const CONFETTI_PREVIEW = 72;
/** One whole run in seconds: `lifetime` at 30 fps, plus the gap upstream leaves by rendering null. */
const CONFETTI_RUN = 90 / 30 + 0.6;

export const confetti = scene({
  id: "confetti",
  group: "effects",
  shard: "effects",
  stage: { w: STAGE_W, h: STAGE_H },
  params: {
    particleCount: 140,
    colors: CONFETTI_COLORS,
    originX: 0.5,
    originY: 0.5,
    startFrame: 0,
    lifetime: 90,
    power: 17,
    gravity: 0.45,
    size: 13,
    seed: 1,
  },
  palette: {
    bg: "#0b1020",
    accent: CONFETTI_COLORS[0]!,
    c1: CONFETTI_COLORS[1]!,
    c2: CONFETTI_COLORS[2]!,
    c3: CONFETTI_COLORS[3]!,
    c4: CONFETTI_COLORS[4]!,
    c5: CONFETTI_COLORS[5]!,
  },
  motion: { kind: "cycle", seconds: 3, hold: 0.6 },
  // Frame 12 of the 90-frame lifetime: the pieces have cleared the origin but the burst is still a
  // burst. By frame 40 it is a thin scatter, which is the only thing a later still could show.
  still: 0.11,
  fidelity: {
    level: "approximate",
    note: "Renders the first 72 pieces of the 140-piece mulberry32 table rather than all of them, and the cos() paper flutter is an eight-stop piecewise-linear cosine on its own per-piece period.",
  },
  markup: (_ctx, p) => {
    const scale = STAGE_H / 720;
    const life = p.lifetime;
    const count = Math.max(0, Math.min(CONFETTI_PREVIEW, p.particleCount));
    const random = mulberry32(p.seed);
    let pieces = "";
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = 0.35 + 0.65 * random();
      const colour = Math.floor(random() * p.colors.length);
      const size = 0.7 + 0.6 * random();
      const rot0 = random() * Math.PI * 2;
      const spin = (random() - 0.5) * 0.6;
      const drift = (random() - 0.5) * 2;
      const vx = Math.cos(angle) * speed * p.power + drift;
      const vy = Math.sin(angle) * speed * p.power;
      // scaleX = cos(rot0 + spin * tt * 1.6): cos is even, so a negative spin only flips the phase.
      const rate = Math.max(1e-4, Math.abs(spin)) * 1.6;
      const period = Math.min(24 * CONFETTI_RUN, (Math.PI * 2) / rate) * MS_PER_FRAME;
      const phase = (spin >= 0 ? -rot0 : rot0) / rate * MS_PER_FRAME;
      const tint = colour === 0 ? "var(--p-accent)" : `var(--p-c${colour})`;
      pieces +=
        `<i class="rv-cf-a" style="--x:${fx(vx * life * scale)};--yl:${fx(vy * life * scale)}">` +
        `<i class="rv-cf-b" style="--w:${fx(p.size * size * scale)};--c:${tint};--r0:${fx(rot0, 4)};` +
        `--r1:${fx(rot0 + spin * life, 4)};--fp:${fx(period / (CONFETTI_RUN * 1000), 4)};--cf-phase:${fx(phase, 1)}ms"></i></i>`;
    }
    const style =
      `--ox:${fx(STAGE_W * p.originX)};--oy:${fx(STAGE_H * p.originY)};` +
      `--yq:${fx(0.5 * p.gravity * life * life * scale)};--rv-own:${fx(p.startFrame * MS_PER_FRAME, 1)}ms`;
    return `<div class="rv-stage"><div class="rv-cf" style="${style}">${pieces}</div></div>`;
  },
});

/* ---------------------------------------------------------------- radial-burst */

/** Upstream's literal colours, reused as the palette so the two can never drift apart. */
const BURST_COLOR = "#ffffff";
const BURST_ACCENT = "#f4e4a7";
const BURST_BG = "#a800b7";

export const radialBurst = scene({
  id: "radial-burst",
  group: "effects",
  shard: "effects",
  stage: { w: STAGE_W, h: STAGE_H },
  params: {
    segments: 8,
    radius: 210,
    thickness: 30,
    rotation: 135,
    intensity: 1,
    twist: 110,
    echoes: 3,
    color: BURST_COLOR,
    accentColor: BURST_ACCENT,
    backgroundColor: BURST_BG,
    speed: 1,
    loop: false,
  },
  palette: { bg: BURST_BG, text: BURST_COLOR, accent: BURST_ACCENT },
  motion: { kind: "cycle", seconds: 3.8, hold: 0.2 },
  still: 0.375,
  fidelity: {
    level: "approximate",
    note: "The eight flying ribbons are rounded capsules carrying the real orbit radius, segment length, per-index wobble and a single mean of the energy swell in place of the 37-sample curvature-limited offset outline, so a ribbon is a uniform blade rather than a leaf; the curl into the ring is a cross-fade onto a dashed circle whose gaps weld shut on the real close() curve, and the three echoes trail only that ring rather than outlined ribbons.",
  },
  markup: (_ctx, p) => {
    const count = Math.round(Math.min(16, Math.max(4, p.segments)));
    const echoCount = Math.round(Math.min(5, Math.max(0, p.echoes)));
    const thickness = Math.min(60, Math.max(8, p.thickness)) / 30;
    let spokes = "";
    for (let index = 0; index < count; index += 1) {
      const tint = index % 3 === 0 ? "var(--p-accent)" : "var(--p-text)";
      spokes +=
        `<i class="rv-rb-spoke" style="--a:${fx((index * 360) / count - 90)};` +
        `--m:${fx(Math.sin(index * 1.7) * 16)};--k:${fx(Math.sin(index * 2.4) * 0.15, 4)};--c:${tint}"></i>`;
    }
    let echoes = "";
    for (let index = 0; index < echoCount; index += 1) {
      const tint = index % 2 ? "var(--p-text)" : "var(--p-accent)";
      echoes +=
        `<circle class="rv-rb-ring" cx="0" cy="0" r="0" pathLength="100" style="--c:${tint};` +
        `--o:${fx(0.36 * (1 - index / (echoCount + 1)))};--sw:${fx((0.22 + index * 0.07) * thickness, 4)};` +
        `--rv-own:${fx((echoCount - index) * 2.2 * MS_PER_FRAME, 1)}ms"></circle>`;
    }
    const plane = `--rb-r:${fx(Math.min(280, Math.max(100, p.radius)) / 210, 4)};--rb-t:${fx(thickness, 4)}`;
    return (
      `<div class="rv-stage"><div class="rv-rb-plane" style="${plane}">` +
      `<i class="rv-rb-dot"></i><div class="rv-rb-spin">${spokes}` +
      `<svg class="rv-rb-svg" viewBox="-240 -135 480 270">${echoes}` +
      `<circle class="rv-rb-ring" cx="0" cy="0" r="0" pathLength="100" style="--c:var(--p-text);--o:1;--sw:${fx(thickness, 4)}"></circle>` +
      `</svg></div></div></div>`
    );
  },
});

/* -------------------------------------------------------------------- ink-arrow */

type Point = { x: number; y: number };

/** `@/lib/remocn/stop-motion`'s hash: FNV-1a plus an avalanche, unlike `shared.ts`'s plain FNV-1a. */
function inkHash01(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 13), 2246822519);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
const inkRange = (seed: string, lo: number, hi: number) => lo + inkHash01(seed) * (hi - lo);

const n2 = (value: number) => value.toFixed(2);
/** `@/components/remocn/brush`'s `normalAt`: the unit normal of the central difference at `index`. */
function normalAt(points: readonly Point[], index: number): Point {
  const before = points[index - 1] ?? points[index]!;
  const after = points[index + 1] ?? points[index]!;
  const tx = after.x - before.x;
  const ty = after.y - before.y;
  const length = Math.hypot(tx, ty) || 1;
  return { x: -ty / length, y: tx / length };
}
/** `curveSegments`: Catmull-Rom through the offset points, converted to cubics with tangent/6. */
const curveSegments = (points: readonly Point[]) =>
  points.slice(0, -1).map((p1, index) => {
    const p0 = points[index - 1] ?? p1;
    const p2 = points[index + 1]!;
    const p3 = points[index + 2] ?? p2;
    return `C ${n2(p1.x + (p2.x - p0.x) / 6)} ${n2(p1.y + (p2.y - p0.y) / 6)}, ${n2(p2.x - (p3.x - p1.x) / 6)} ${n2(p2.y - (p3.y - p1.y) / 6)}, ${n2(p2.x)} ${n2(p2.y)}`;
  }).join(" ");
/** `brushRibbon` at progress 1: the closed, tapered outline the draw-on later uncovers. */
function brushRibbon(spine: readonly Point[], strokeWidth: number, pressure: number, release: number): string {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let index = 0; index < spine.length; index += 1) {
    const half = (strokeWidth / 2) * (pressure + (release - pressure) * (index / (spine.length - 1)));
    const normal = normalAt(spine, index);
    left.push({ x: spine[index]!.x + normal.x * half, y: spine[index]!.y + normal.y * half });
    right.push({ x: spine[index]!.x - normal.x * half, y: spine[index]!.y - normal.y * half });
  }
  const back = right.slice().reverse();
  return `M ${n2(left[0]!.x)} ${n2(left[0]!.y)} ${curveSegments(left)} L ${n2(back[0]!.x)} ${n2(back[0]!.y)} ${curveSegments(back)} Z`;
}
const sampleCubic = (a: Point, c1: Point, c2: Point, b: Point, points: number): Point[] =>
  Array.from({ length: points }, (_, index) => {
    const t = index / (points - 1);
    const u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
      y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
    };
  });
const sampleLine = (a: Point, b: Point, points: number): Point[] =>
  Array.from({ length: points }, (_, index) => {
    const t = index / (points - 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });

/** `from` and `to` have no upstream default; these are stage coordinates authored for this card. */
const INK_FROM = [112, 170];
const INK_TO = [372, 74];
const INK_INK = "#26242c";
/** The sheet the arrow is drawn on. Upstream renders over whatever is behind it and names no colour. */
const INK_PAPER = "#f2ede3";

export const inkArrow = scene({
  id: "ink-arrow",
  group: "effects",
  shard: "effects",
  stage: { w: STAGE_W, h: STAGE_H },
  params: {
    from: INK_FROM,
    to: INK_TO,
    curvature: 0.35,
    color: INK_INK,
    strokeWidth: 8,
    pressure: 0.2,
    release: 1,
    grain: 1,
    delay: 0,
    drawDur: 36,
    headSize: 24,
    seed: "arrow",
    step: 3,
  },
  palette: { text: INK_INK, bg: INK_PAPER },
  motion: { kind: "cycle", seconds: 1.6, hold: 1.4 },
  still: 0.62,
  fidelity: {
    level: "approximate",
    note: "The ribbon outlines, the taper, the 3-frame stepping and the turbulence grain are upstream's own; the draw-on uncovers the finished ribbon with a clip circle grown to each step's exact spine sample instead of rebuilding the outline from a truncated spine, so the drawing edge is a short arc rather than the ribbon's own end cap, and the paper colour behind it is authored here.",
  },
  markup: (_ctx, p) => {
    const from: Point = { x: p.from[0]!, y: p.from[1]! };
    const to: Point = { x: p.to[0]!, y: p.to[1]! };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const bow = p.curvature * distance;
    const wobble = distance * 0.06;
    const control = (t: number, key: string): Point => ({
      x: from.x + dx * t + (-dy / distance) * bow + inkRange(`${p.seed}:${key}:x`, -wobble, wobble),
      y: from.y + dy * t + (dx / distance) * bow + inkRange(`${p.seed}:${key}:y`, -wobble, wobble),
    });
    const c1 = control(0.3, "c1");
    const c2 = control(0.7, "c2");
    const reach = Math.max(p.headSize, p.strokeWidth * 2.6);
    const hx = to.x - c2.x;
    const hy = to.y - c2.y;
    const head = Math.hypot(hx, hy) || 1;
    const arm = (angle: number): Point => ({
      x: to.x + reach * ((-hx / head) * Math.cos(angle) - (-hy / head) * Math.sin(angle)),
      y: to.y + reach * ((-hx / head) * Math.sin(angle) + (-hy / head) * Math.cos(angle)),
    });
    const apex: Point = { x: to.x + (hx / head) * reach * 0.16, y: to.y + (hy / head) * reach * 0.16 };
    const armWidth = p.strokeWidth * p.release;
    const grainScale = p.strokeWidth * 0.5 * p.grain;
    // The brush outline can stray a half-width plus a grain displacement past its spine, so the clip
    // that uncovers it has to run that far ahead of the last sample it is meant to have reached.
    const pad = p.strokeWidth / 2 + grainScale;
    const filterId = `remocn-brush-${Math.floor(inkHash01(`${p.seed}:${p.strokeWidth}:${p.grain}`) * 1e9)}`;
    const defs =
      `<defs><filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="${Math.floor(inkHash01(`${p.seed}:grain`) * 1000)}" result="brushGrain"></feTurbulence>` +
      `<feDisplacementMap in="SourceGraphic" in2="brushGrain" scale="${grainScale}" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>` +
      `</filter></defs>`;
    const svg = (inner: string) =>
      `<svg class="rv-ink-svg" viewBox="0 0 ${STAGE_W} ${STAGE_H}">${inner}</svg>`;
    const path = (d: string) => `<path d="${d}" filter="url(#${filterId})"></path>`;
    const shaft = brushRibbon(sampleCubic(from, c1, c2, to, 40), p.strokeWidth, p.pressure, p.release);
    const armPath = (tip: Point) => path(brushRibbon(sampleLine(apex, tip, 10), armWidth, 1, 0.6));
    const left = arm(0.72);
    const geometry =
      `--cx:${fx(from.x)};--cy:${fx(from.y)};--r:${fx(distance + pad)};--ax:${fx(apex.x)};--ay:${fx(apex.y)};` +
      `--ar:${fx(Math.hypot(left.x - apex.x, left.y - apex.y) + pad)}`;
    return (
      `<div class="rv-stage"><div class="rv-ink" style="${geometry}">` +
      `<div class="rv-ink-shaft">${svg(defs + path(shaft))}</div>` +
      `<div class="rv-ink-arm-a">${svg(armPath(left))}</div>` +
      `<div class="rv-ink-arm-b">${svg(armPath(arm(-0.72)))}</div>` +
      `</div></div>`
    );
  },
});

export const effects: readonly SceneSpec[] = [confetti, radialBurst, inkArrow];
