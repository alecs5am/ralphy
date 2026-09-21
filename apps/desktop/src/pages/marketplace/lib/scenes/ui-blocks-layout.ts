/**
 * Remocn scenes for the ui-blocks-layout shard.
 *
 * Four `layout` composition frames -- backdrop (inset screenshot), drift (full-bleed push-in),
 * chat-to-preview-layout (two morphing columns) and stage (perspective studio plane) -- plus four
 * `ui-blocks` widgets: terminal-simulator, animated-bar-chart, polaroid and check-list.
 *
 * Every number below is an authored stage pixel, so `N` here is `Nem` in the sheet. Frame counts
 * come straight from the upstream schedules at 30 fps; a keyframe percentage is that frame over
 * `motion.seconds + motion.hold`.
 */
import { esc, plate } from "./shared";
import { scene, type SceneContext, type SceneSpec } from "./types";

/** Frame -> milliseconds at the 30 fps every component in this shard is authored at. */
const ms = (frame: number) => Math.round((frame / 30) * 1000);

/** Trim a float to two decimals without dragging `.00` into the markup. */
const n2 = (value: number) => Number(value.toFixed(2));

/**
 * `@remocn/handwrite`: one span per grapheme, hard-cut on a 3-frame grid.
 *
 * `shown = floor(qstep(frame - delay) * perStep)`, so grapheme `j` lands on the first step where
 * `steps >= ceil((j + 1) / perStep)` -- frame `delay + 3 * ceil((j + 1) / perStep)`. The slant and
 * the vertical nudge are constant per glyph, upstream's `hashRange(..., -3.2, 3.2)` and
 * `(..., -1.8, 1.8)` resolved here through the scene's own deterministic hash.
 */
const handwrite = (text: string, ctx: SceneContext, key: string, perStep: number, delay: number) =>
  Array.from(text)
    .map((glyph, index) => {
      const appear = delay + 3 * Math.ceil((index + 1) / perStep);
      const rotate = n2(ctx.rand(`${key}:r:${index}`) * 6.4 - 3.2);
      const lift = n2(ctx.rand(`${key}:y:${index}`) * 3.6 - 1.8);
      const style = `--rv-own:${ms(appear)}ms;--r:${rotate};--y:${lift}`;
      return `<span class="rv-ch" style="${style}">${glyph === " " ? "&nbsp;" : esc(glyph)}</span>`;
    })
    .join("");

/* ------------------------------------------------------------------ layout: composition frames */

/**
 * Screen-Studio inset: a full-bleed fill with one rounded, shadowed content frame floating inside
 * it. `padding` and `radius` are percentages of the composition WIDTH, so at 1280 the defaults are
 * 51.2 px of margin and a 12.8 px radius. Upstream has no time term at all.
 */
export const backdrop = scene({
  id: "backdrop",
  group: "layout",
  shard: "ui-blocks-layout",
  stage: { w: 1280, h: 720 },
  params: { padding: 4, radius: 1, shadow: "0 20px 60px rgba(0,0,0,0.4)" },
  palette: { bg: "#0a0a0a", cast: "rgba(0,0,0,0.4)", text: "#e4e4e7", accent: "#3f3f46", sheet: "#18181b" },
  motion: { kind: "static" },
  still: 0.5,
  fidelity: {
    level: "stand-in",
    note: "Upstream takes arbitrary children; the inset frame here holds a CSS-drawn screenshot plate because no bitmap ships with the catalog. Padding, radius, shadow and the default #0a0a0a fill are verbatim.",
  },
  markup: (ctx, p) =>
    `<div class="rv-stage" style="--pad:${n2((p.padding / 100) * 1280)};--rad:${n2((p.radius / 100) * 1280)}">` +
    `<div class="rv-fill"></div><div class="rv-frame">${plate("screen", ctx)}</div></div>`,
});

/**
 * The cheapest "never let a frame be static" wrapper: a linear, unclamped scale from 1 to
 * 1 + grow across the whole sequence. Edge to edge, no margin -- the opposite composition to
 * `backdrop`.
 */
export const drift = scene({
  id: "drift",
  group: "layout",
  shard: "ui-blocks-layout",
  stage: { w: 1280, h: 720 },
  params: { grow: 0.035 },
  palette: { bg: "#08080a", text: "#fafafa", accent: "#6366f1", haze: "rgba(255,255,255,0.09)", deep: "#111118" },
  motion: { kind: "loop", seconds: 5 },
  still: 0.5,
  fidelity: {
    level: "approximate",
    note: "Upstream drives the push from the composition duration and never wraps; a card loop has to, so the 5 s window restarts at scale 1. The rate, +0.7% per second, is the upstream one.",
  },
  markup: (ctx, p) =>
    `<div class="rv-stage"><div class="rv-push" style="--grow:${p.grow}">` +
    `${plate("scape", ctx)}<div class="rv-lede">${ctx.title}</div></div></div>`,
});

/** The four default chat turns, verbatim. */
const CHAT: readonly (readonly [string, string])[] = [
  ["user", "Build me a landing page"],
  ["ai", "Sure — what should it feature?"],
  ["user", "Hero, pricing, footer."],
  ["ai", "On it. Generating now..."],
];

/**
 * Two columns on one morph window: the chat pane's flex-basis falls 50% -> 25% while the preview
 * pane grows, fades in and slides its last 40 px home. Both inner panes carry a fixed min-width so
 * nothing re-wraps while the basis moves. Morph runs 10% -> 70% of the sequence on Apple's
 * `cubic-bezier(0.16, 1, 0.3, 1)`.
 */
export const chatToPreviewLayout = scene({
  id: "chat-to-preview-layout",
  group: "layout",
  shard: "ui-blocks-layout",
  stage: { w: 1280, h: 720 },
  params: { startChatRatio: 0.5, endChatRatio: 0.25, speed: 1 },
  palette: { bg: "#09090b", text: "#ffffff", accent: "#0ea5e9", chat: "#111111", ai: "#262626",
    eyebrow: "#888888", edge: "rgba(255,255,255,0.08)", paper: "#ffffff", bar: "#f4f4f5", barEdge: "#e4e4e7",
    ink: "#0a0a0a", sub: "#71717a", dotA: "#ef4444", dotB: "#f59e0b", dotC: "#22c55e" },
  motion: { kind: "cycle", seconds: 3, hold: 2 },
  // Mid-morph: the frozen card should show the chat dragging the preview open, not the end state.
  still: 0.22,
  markup: (_ctx, p) => {
    const bubbles = CHAT.map(
      ([from, text]) => `<div class="rv-bub rv-bub-${from}">${esc(text)}</div>`,
    ).join("");
    return (
      `<div class="rv-stage"><div class="rv-cols" style="--r0:${p.startChatRatio};--r1:${p.endChatRatio}">` +
      `<div class="rv-chat"><div class="rv-inner"><span class="rv-eyebrow">Chat</span>${bubbles}</div></div>` +
      `<div class="rv-prev"><div class="rv-inner"><div class="rv-bar">` +
      `<i class="rv-dot rv-dot-a"></i><i class="rv-dot rv-dot-b"></i><i class="rv-dot rv-dot-c"></i></div>` +
      `<div class="rv-page"><div class="rv-h1">Ship faster.</div>` +
      `<div class="rv-sub">The fastest way to launch your idea. Built with Remotion.</div>` +
      `<div class="rv-cta">Get started</div></div></div></div></div></div>`
    );
  },
});

/**
 * A perspective studio plane. Plane geometry at 1280x720 with the hard-coded `widthRatio = 0.84`:
 * 1075.2 x 604.8 at (102.4, 57.6), radius 17.92. The neutral pose puts `transform-origin` dead
 * centre, so the translate terms cancel and only `entryY` moves.
 *
 * Entry settle rides Spring A over frames 0 -> 24 (0.800 s): scale 0.94x -> 1x, rotateX +8deg -> 0,
 * rotateY -5deg -> 0, entryY 64 -> 0. The entry fade is a separate linear 0 -> 9 frames (0.300 s)
 * and gates the reflection, the contact shadow and the plane, but never the specular sheet.
 */
export const stage = scene({
  id: "stage",
  group: "layout",
  shard: "ui-blocks-layout",
  stage: { w: 1280, h: 720 },
  params: { rotateX: 14, rotateY: -20, perspective: 900, scale: 0.86, radius: 1.4, reflection: 0.24, shadow: 0.7, light: 0.55 },
  palette: { bg: "#17181d", deep: "#09090b", text: "#d4d4d8", accent: "#8b83e6",
    mirrorA: "rgba(188,181,255,0.32)", mirrorB: "rgba(91,81,145,0.1)", contact: "rgba(0,0,0,0.364)",
    specA: "rgba(255,255,255,0.2)", specB: "rgba(255,255,255,0.08)", specC: "rgba(255,255,255,0.02)",
    specD: "rgba(0,0,0,0.24)", sheet: "#262733" },
  motion: { kind: "cycle", seconds: 0.8, hold: 2.2 },
  still: 0.35,
  fidelity: {
    level: "stand-in",
    note: "Camera keyframes and handheld shake are both off at the defaults (`moves: []`, `shake: 0`), so only the entry settle is ported; the plane holds a CSS screenshot plate in place of arbitrary children.",
  },
  markup: (ctx, p) => {
    const width = n2(1280 * 0.84);
    const height = n2(1280 * 0.84 * (720 / 1280));
    const vars =
      `--rx:${p.rotateX}deg;--ry:${p.rotateY}deg;--persp:${p.perspective};--sc:${p.scale};` +
      `--rad:${n2((p.radius / 100) * 1280)};--refl:${p.reflection};--light:${p.light};` +
      `--pw:${width};--ph:${height};--pl:${n2((1280 - width) / 2)};--pt:${n2((720 - height) / 2)}`;
    return (
      `<div class="rv-stage" style="${vars}"><div class="rv-entry">` +
      `<div class="rv-mirror rv-lift"></div><div class="rv-contact rv-lift"></div>` +
      `<div class="rv-persp"><div class="rv-plane rv-lift">${plate("app", ctx)}</div></div></div>` +
      `<div class="rv-spec"></div></div>`
    );
  },
});

/* ------------------------------------------------------------------------- ui-blocks: widgets */

/** `DEFAULT_LINES`, verbatim, paired with the resolved start frame and length of each. */
const TERMINAL: readonly (readonly [type: string, text: string, start: number])[] = [
  ["cmd", "npm run build", 10],
  ["log", "Resolving dependencies...", 29],
  ["log", "> remocn@1.0.0 build", 76],
  ["log", "> next build", 100],
  ["log", "Compiling...", 124],
  ["ok", "Compiled successfully in 4.2s", 168],
  ["log", "Generating static pages (24/24)", 207],
  ["ok", "Build completed without errors", 250],
];

/**
 * A 900x480 terminal that types one character per frame. The schedule is upstream's `acc` walk:
 * 10 lead-in frames, then each line's own delay, its `ceil(len / (chunkSize * charsPerFrame))`
 * typing frames and the 18-frame auto-pause every line ending in "..." earns. Total 280 frames.
 *
 * Each line clips a `ch`-wide box with `steps(len, end)`, so the reveal lands one character per
 * frame exactly as upstream does; the caret is that box's own right border, present only while its
 * line is typing, blinking at 2 Hz.
 */
export const terminalSimulator = scene({
  id: "terminal-simulator",
  group: "ui-blocks",
  shard: "ui-blocks-layout",
  stage: { w: 1000, h: 560 },
  params: { prompt: "$", title: "~/projects/remocn", fontSize: 18, charsPerFrame: 1, chunkSize: 1, speed: 1 },
  palette: { bg: "#050507", text: "#fafafa", accent: "#22c55e", win: "#0a0a0a", chrome: "#1a1a1a",
    ring: "rgba(255,255,255,0.06)", cast: "rgba(0,0,0,0.6)", dim: "#71717a", log: "#a1a1aa", dotA: "#ff5f57",
    dotB: "#febc2e", dotC: "#28c840" },
  motion: { kind: "cycle", seconds: 9.333, hold: 0.667 },
  still: 0.76,
  markup: (_ctx, p) => {
    const rows = TERMINAL.map(([type, text], index) => {
      const length = Array.from(text).length;
      const tone = type === "cmd" ? "--p-text" : type === "ok" ? "--p-accent" : "--p-log";
      const timing = `animation-name:terminal-simulator-l${index},terminal-simulator-blink;animation-timing-function:steps(${Math.ceil(length / (Number(p.chunkSize) || 1))},end),steps(1,end)`;
      const lead = type === "cmd" ? `<span class="rv-p">${esc(String(p.prompt))}</span>` : "";
      return (
        `<div class="rv-ln" style="--tone:var(${tone})">${lead}` +
        `<span class="rv-t" style="--cols:${length}ch;${timing}">${esc(text)}</span></div>`
      );
    }).join("");
    return (
      `<div class="rv-stage"><div class="rv-win" style="--fs:${p.fontSize}">` +
      `<div class="rv-chrome"><i class="rv-dot rv-dot-a"></i><i class="rv-dot rv-dot-b"></i>` +
      `<i class="rv-dot rv-dot-c"></i><span class="rv-title">${esc(String(p.title))}</span></div>` +
      `<div class="rv-body"><div class="rv-buf">${rows}</div></div></div></div>`
    );
  },
});

/**
 * Eight bars springing off a baseline on Spring B (damping 12, stiffness 100, mass 0.8): 5.8%
 * overshoot peaking at frame 11 after each bar's own start, settled by frame 28. The cascade is
 * 6 frames (0.200 s) apart, so the last bar starts at frame 42 and the whole chart resolves near
 * frame 70. The overshoot lives in the `linear()` easing, not in the keyframes.
 */
export const animatedBarChart = scene({
  id: "animated-bar-chart",
  group: "ui-blocks",
  shard: "ui-blocks-layout",
  stage: { w: 1000, h: 500 },
  params: { data: [35, 60, 45, 80, 55, 70, 90, 65], width: 1000, height: 500, gap: 16, staggerFrames: 6, speed: 1 },
  palette: { bg: "#09090b", text: "#a1a1aa", accent: "#0ea5e9", rule: "#27272a", glow: "#0ea5e955" },
  motion: { kind: "cycle", seconds: 2.333, hold: 1.667 },
  still: 0.6,
  markup: (_ctx, p) => {
    const data = p.data.map(Number);
    const padding = 60;
    const innerWidth = p.width - padding * 2;
    const innerHeight = p.height - padding * 2;
    const max = Math.max(...data);
    const barWidth = (innerWidth - p.gap * (data.length - 1)) / data.length;
    const baseY = padding + innerHeight;
    const bars = data
      .map((value, index) => {
        const barHeight = (value / max) * innerHeight;
        const x = padding + index * (barWidth + p.gap);
        const style = `--rv-own:${ms(index * p.staggerFrames)}ms`;
        return `<rect class="rv-bar" style="${style}" x="${n2(x)}" y="${n2(baseY - barHeight)}" width="${n2(barWidth)}" height="${n2(barHeight)}" rx="6"></rect>`;
      })
      .join("");
    return (
      `<div class="rv-stage"><svg class="rv-chart" viewBox="0 0 ${p.width} ${p.height}" preserveAspectRatio="xMidYMid meet">` +
      `<line class="rv-base" x1="${padding}" x2="${padding + innerWidth}" y1="${baseY}" y2="${baseY}"></line>${bars}</svg></div>`
    );
  },
});

/**
 * An instant print. The frame is pure geometry off `scale = width / 652` and never moves; the only
 * animation in the component is the handwritten caption, hard-cutting 1.4 graphemes per 3-frame
 * beat with the two newest glyphs held at 1.06.
 */
export const polaroid = scene({
  id: "polaroid",
  group: "ui-blocks",
  shard: "ui-blocks-layout",
  stage: { w: 780, h: 540 },
  params: { width: 652, captionAt: 0, captionSize: 36, perStep: 1.4, step: 3 },
  palette: { bg: "#d9d3c6", text: "#26242c", accent: "#26242c", frame: "#fdfcf8", media: "#100f14", cast: "rgba(38,36,44,0.18)", castNear: "rgba(38,36,44,0.12)" },
  motion: { kind: "cycle", seconds: 1.8, hold: 1.2 },
  still: 0.7,
  fidelity: {
    level: "approximate",
    note: "Upstream requires a caption and children; the caption here is the scene title capped at 22 graphemes and the media plate is CSS-drawn. Caveat is not bundled, so the script falls back to the platform handwriting face.",
  },
  markup: (ctx, p) => {
    const unit = p.width / 652;
    const caption = Array.from(ctx.title).slice(0, 22).join("");
    const vars =
      `--pad:${n2(16 * unit)};--mw:${n2(620 * unit)};--mh:${n2(349 * unit)};` +
      `--ch:${n2(62 * unit)};--pw:${p.width};--ph:${n2(427 * unit)};--cs:${p.captionSize}`;
    return (
      `<div class="rv-stage"><div class="rv-print" style="${vars}">` +
      `<div class="rv-media">${plate("portrait", ctx)}</div>` +
      `<div class="rv-slot"><div class="rv-cap">${handwrite(caption, ctx, "cap", Number(p.perStep), Number(p.captionAt))}</div></div>` +
      `</div></div>`
    );
  },
});

/** The four list rows. A bare string means `checked: true`, which is upstream's own shorthand. */
const CHECKS: readonly string[] = ["Storyboard", "Record VO", "Colour grade", "Ship it"];

/**
 * Two acts on a 3-frame stop-motion grid. Boxes draw 0.600 s apart (`itemGap = step * 6`), each
 * label writes itself at 1.6 graphemes per beat, and once the whole list is in (frame 78) every
 * checked row ticks then strikes, 0.300 s behind the last (`closeGap = step * 3`). Every stroke is
 * a 6-frame window on a 3-frame grid, so it has exactly one intermediate pose: dashoffset
 * 1 -> 0.125 -> 0, hard cut. Total 117 frames.
 */
export const checkList = scene({
  id: "check-list",
  group: "ui-blocks",
  shard: "ui-blocks-layout",
  stage: { w: 560, h: 340 },
  params: { items: CHECKS, width: 420, fontSize: 40, strokeWidth: 3, perStep: 1.6, step: 3 },
  palette: { bg: "#f4f1e8", text: "#26242c", accent: "#6f7f35", rule: "rgba(38,36,44,0.08)" },
  motion: { kind: "cycle", seconds: 3.9, hold: 1.1 },
  still: 0.8,
  fidelity: {
    level: "approximate",
    note: "Upstream declares no default items or width, so the four rows and the 420 px measure are chosen here; the hand-drawn corner nudges use this registry's own FNV hash, which shifts the exact jitter values but not their range or character.",
  },
  markup: (ctx, p) => {
    const items = p.items.map(String);
    const font = Number(p.fontSize);
    const boxSize = Math.round(font * 0.62);
    const rowHeight = Math.round(font * 1.15);
    const labelWidth = Math.max(font * 2, Number(p.width) - boxSize - Math.round(font * 0.4));
    const enterEnd = 78;
    const nudge = (key: string, span: number) => n2(ctx.rand(key) * span * 2 - span);
    const rows = items
      .map((text, index) => {
        const boxFrom = index * 18;
        const labelAt = boxFrom + 6;
        const tickFrom = enterEnd + index * 9;
        const lo = boxSize * 0.08;
        const hi = boxSize - lo;
        const c = (slot: number) => nudge(`box:${index}:c${slot}`, 1.5);
        const quad =
          `M ${n2(lo + c(0))} ${n2(lo + c(1))} L ${n2(hi + c(2))} ${n2(lo + c(3))} ` +
          `L ${n2(hi + c(4))} ${n2(hi + c(5))} L ${n2(lo + c(6))} ${n2(hi + c(7))} Z`;
        const tick = `M ${n2(boxSize * 0.2)} ${n2(boxSize * 0.52)} L ${n2(boxSize * 0.42)} ${n2(boxSize * 0.78)} L ${n2(boxSize * 0.88)} ${n2(boxSize * 0.14)}`;
        const reach = Math.min(labelWidth, Array.from(text).length * font * 0.36);
        const over = font * 0.07;
        const mid = rowHeight / 2;
        const l = (slot: number) => n2(mid + nudge(`strike:${index}:s${slot}`, 1.6));
        const strike =
          `M ${n2(-over)} ${l(0)} C ${n2(reach * 0.35)} ${l(1)}, ${n2(reach * 0.7)} ${l(2)}, ${n2(reach + over)} ${l(3)}`;
        return (
          `<div class="rv-row">` +
          `<svg class="rv-box" viewBox="0 0 ${boxSize} ${boxSize}">` +
          `<path class="rv-quad" style="--rv-own:${ms(boxFrom)}ms" d="${quad}" pathLength="1"></path>` +
          `<path class="rv-tick" style="--rv-own:${ms(tickFrom)}ms" d="${tick}" pathLength="1"></path></svg>` +
          `<div class="rv-lab"><div class="rv-hw">${handwrite(text, ctx, `row${index}`, Number(p.perStep), labelAt)}</div>` +
          `<svg class="rv-strike" viewBox="0 0 ${n2(labelWidth)} ${rowHeight}">` +
          `<path style="--rv-own:${ms(tickFrom + 6)}ms" d="${strike}" pathLength="1"></path></svg></div></div>`
        );
      })
      .join("");
    const vars = `--box:${boxSize};--gap:${Math.round(font * 0.4)};--row:${rowHeight};--lab:${n2(labelWidth)};--fs:${font};--sw:${p.strokeWidth}`;
    return `<div class="rv-stage"><div class="rv-list" style="${vars}">${rows}</div></div>`;
  },
});

export const uiBlocksLayout: readonly SceneSpec[] = [
  backdrop,
  drift,
  chatToPreviewLayout,
  stage,
  terminalSimulator,
  animatedBarChart,
  polaroid,
  checkList,
];
