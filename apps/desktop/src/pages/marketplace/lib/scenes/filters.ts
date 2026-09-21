/**
 * Remocn scenes for the filters shard.
 *
 * All three are WebGL post-filters that inline their own GLSL and sample the rendered frame as
 * `u_scene`. The shader runs through the shared WebGL host; the visible CSS layer is the
 * upstream-authored fallback each component ships, drawn over a CSS plate that stands in for the
 * footage the filter would otherwise be sampling.
 */
import { esc, plate } from "./shared";
import { scene, type SceneContext, type SceneSpec } from "./types";

const STAGE_W = 480;
const STAGE_H = 270;

/** `ascii-render`'s own glyph aspect: a cell is `glyphSize * 0.545` wide by `glyphSize` tall. */
const GLYPH_ASPECT = 0.545;
/** `TAPS = 3`: the shader box-averages a 3x3 grid of samples across each cell before quantising. */
const TAPS = 3;

/**
 * Luminance of the CSS plate `ascii-render` filters, as an analytic function of stage UV.
 *
 * The shader reads the luminance of whatever it wraps, which CSS cannot do. Here we author the
 * scene ourselves, so its luminance is known in closed form and the glyph ramp can be resolved at
 * build time exactly as the shader resolves it per pixel. The terms match what `.rv-plate-field`
 * draws: one radial lobe plus three soft horizontal bands.
 */
function fieldLuma(u: number, v: number): number {
  const distance = Math.hypot((u - 0.44) * (STAGE_W / STAGE_H), v - 0.44);
  const lobe = Math.max(0, 1 - distance / 0.62) ** 1.6 * 1.15;
  let bands = 0;
  for (const centre of [0.22, 0.48, 0.74]) bands += 0.26 * Math.max(0, 1 - Math.abs(v - centre) / 0.085);
  return Math.min(1, lobe + bands);
}

/** One `<i>` per glyph cell, carrying the character the shader's luma ramp would have chosen. */
function asciiGrid(charset: string, glyphSize: number): string {
  const cellW = glyphSize * GLYPH_ASPECT;
  const columns = Math.ceil(STAGE_W / cellW);
  const rows = Math.ceil(STAGE_H / glyphSize);
  const cellU = cellW / STAGE_W;
  const cellV = glyphSize / STAGE_H;
  let html = "";
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      let sum = 0;
      for (let ty = 0; ty < TAPS; ty += 1) {
        for (let tx = 0; tx < TAPS; tx += 1) {
          const offsetU = ((tx + 0.5) / TAPS - 0.5) * cellU;
          const offsetV = ((ty + 0.5) / TAPS - 0.5) * cellV;
          sum += fieldLuma((x + 0.5) * cellU + offsetU, (y + 0.5) * cellV + offsetV);
        }
      }
      const luma = sum / (TAPS * TAPS);
      const glyph = charset[Math.min(Math.floor(luma * charset.length), charset.length - 1)] ?? " ";
      html += `<i class="rv-cell">${glyph === " " ? "&nbsp;" : esc(glyph)}</i>`;
    }
  }
  return `<div class="rv-ascii" style="grid-template-columns:repeat(${columns},${cellW.toFixed(2)}em);grid-auto-rows:${glyphSize}em">${html}</div>`;
}

/**
 * `vhs-filter` — NTSC tape artefacts: head wobble, a screen-blended chroma smear, scanlines and a
 * head-switching band pinned to the bottom 3.6 % of the frame.
 *
 * The shipped fallback stacks four layers and derives its per-frame jitter from Remotion's seeded
 * `random(`vhs-wobble-${frame}`)`. That generator is not available here, so the jitter is baked as
 * a `step-end` keyframe list on the shader's own 64-frame clock, keeping the same amplitudes.
 */
export const vhsFilter = scene({
  id: "vhs-filter",
  group: "filters",
  shard: "filters",
  stage: { w: STAGE_W, h: STAGE_H },
  params: { bleed: 1, wobble: 1, noise: 1, intensity: 1 },
  palette: {
    text: "#f6efe6",
    bg: "#140b22",
    accent: "#ff4d8d",
    sky: "#2a1150",
    sun: "#ffce5c",
    shade: "#000000",
    band: "#e4e4e4",
  },
  motion: { kind: "loop", seconds: 64 / 30 },
  still: 0.28,
  paint: {
    engine: "webgl",
    program: "vhs-filter",
    uniforms: { u_bleed: 1, u_wobble: 1, u_noise: 1, u_intensity: 1 },
    fallback: ".rv-gl-fallback",
  },
  markup: (ctx: SceneContext, p) => {
    const tape = `${plate("tape", ctx)}<b class="rv-vhs-label">${ctx.title}</b>`;
    return `<div class="rv-stage" style="--bleed:${p.bleed};--wobble:${p.wobble};--noise:${p.noise};--intensity:${p.intensity}">`
      + `<div class="rv-gl"></div>`
      + `<div class="rv-gl-fallback">`
      + `<div class="rv-vhs-a">${tape}</div>`
      + `<div class="rv-vhs-b">${tape}</div>`
      + `<div class="rv-vhs-scan"></div>`
      + `<div class="rv-vhs-band"></div>`
      + `</div></div>`;
  },
  fidelity: {
    level: "approximate",
    note: "Upstream's four-layer CSS fallback is transcribed verbatim: the same filter strings, the same 8 px smear, the same scanline period and the same head-switching band across the bottom 3.6 %. Two things differ. Remotion's seeded random() is not available here, so the wobble and the brightness flicker are step-end keyframe lists on the shader's own 64-frame loop: the same +/- 1.7 px and +/- 3.5 % amplitudes, but re-rolled 16 and 8 times per loop instead of every frame. And the fps that turns those 64 frames into 2.133 s is assumed to be 30, because the source states a frame count and never an fps. The per-scanline wobble and the YIQ chroma-only smear exist only in the GLSL path.",
  },
});

/**
 * `crt-screen` — aperture-grille triad, 240 scanline pairs, a heavy vignette and one slow mains
 * hum. Everything but the hum is static upstream, so everything but the hum is static here.
 *
 * The shipped fallback is three layers (content, scanlines, vignette); the phosphor triad is
 * transcribed from the shader's own `phosphorMask`, whose unlit channels sit at 0.34.
 */
export const crtScreen = scene({
  id: "crt-screen",
  group: "filters",
  shard: "filters",
  stage: { w: STAGE_W, h: STAGE_H },
  params: { curvature: 1, scanlines: 1, maskScale: 2, vignette: 1 },
  palette: {
    text: "#f3f7f5",
    bg: "#05070a",
    accent: "#2ae0c1",
    shade: "#000000",
    phosphorR: "#ff0000",
    phosphorG: "#00ff00",
    phosphorB: "#0000ff",
  },
  motion: { kind: "loop", seconds: 60 / 30 },
  still: 0.4,
  paint: {
    engine: "webgl",
    program: "crt-screen",
    uniforms: { u_curvature: 1, u_scanlines: 1, u_mask_scale: 2, u_vignette: 1 },
    fallback: ".rv-gl-fallback",
  },
  markup: (ctx: SceneContext, p) =>
    `<div class="rv-stage" style="--curvature:${p.curvature};--scanlines:${p.scanlines};--mask-scale:${p.maskScale};--vignette:${p.vignette}">`
    + `<div class="rv-gl"></div>`
    + `<div class="rv-gl-fallback">`
    + `<div class="rv-crt-tube">${plate("card", ctx)}<b class="rv-crt-title">${ctx.title}</b></div>`
    + `<div class="rv-crt-scan"></div>`
    + `<div class="rv-crt-triad"></div>`
    + `<div class="rv-crt-vignette"></div>`
    + `</div></div>`,
  fidelity: {
    level: "approximate",
    note: "Upstream's three-layer CSS fallback is transcribed verbatim; the phosphor triad and the mains hum are added from the shader, since the shipped fallback has neither. The triad is a multiply layer at alpha 0.66, which lands the two unlit channels on the shader's own 0.34. The tube warp has no CSS equivalent: the +11 %/+17 % corner bulge is stood in for by border-radius 4 % / 6 % on the tube, and the 1/(1 + 0.045) shrink by scale(0.957). The hum is a four-stop linear approximation of one sine period, over a 60-frame run read at an assumed 30 fps. The 5-tap horizontal bloom stays in the GLSL path only.",
  },
});

/**
 * `ascii-render` — a per-cell glyph-density ramp. No time term of any kind upstream: the filter is
 * a pure function of the frame it wraps, so this scene declares `motion: { kind: "static" }` and
 * animates nothing.
 *
 * The glyph per cell is resolved at build time by running the shader's own arithmetic (3x3 box
 * average, Rec.601 luma, `min(floor(luma * 10), 9)`) over the analytic luminance of the plate it
 * filters, so the ramp has the same hard edges at luma 0.1, 0.2 ... 0.9 that the shader has.
 */
export const asciiRender = scene({
  id: "ascii-render",
  group: "filters",
  shard: "filters",
  stage: { w: STAGE_W, h: STAGE_H },
  params: { glyphSize: 26, charset: " .:-=+*#%@", colored: false, ink: "#9dff9d", intensity: 1 },
  palette: { text: "#9dff9d", bg: "#000000", glow: "#ffffff" },
  motion: { kind: "static" },
  still: 0.5,
  paint: {
    engine: "webgl",
    program: "ascii-render",
    uniforms: {
      u_cell: [(26 * GLYPH_ASPECT) / STAGE_W, 26 / STAGE_H],
      u_glyph_count: 10,
      u_colored: 0,
      u_ink: "@text",
      u_intensity: 1,
    },
    fallback: ".rv-gl-fallback",
  },
  markup: (ctx: SceneContext, p) => {
    const charset = p.charset.length > 0 ? p.charset : " .:-=+*#%@";
    return `<div class="rv-stage" style="--intensity:${p.intensity}">`
      + `<div class="rv-gl"></div>`
      + `<div class="rv-gl-fallback">${plate("field", ctx)}${asciiGrid(charset, p.glyphSize)}</div>`
      + `</div>`;
  },
  fidelity: {
    level: "approximate",
    note: "Upstream ships a pass-through fallback, so there is no CSS translation to transcribe. Instead the filter is resolved analytically against the plate this scene draws: charset, cell geometry (14.17 x 26 px), the 3x3 box average, the Rec.601 luma and the ten-step index quantisation are upstream's, but they run over one known field rather than over arbitrary footage, and real monospace text replaces the 24x44 glyph atlas.",
  },
});

export const filters: readonly SceneSpec[] = [vhsFilter, crtScreen, asciiRender];
