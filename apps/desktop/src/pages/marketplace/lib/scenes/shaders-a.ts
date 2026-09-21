/**
 * Remocn scenes for the shaders-a shard.
 *
 * Three ambient fields, none of which CSS can fake. `shader-mesh-gradient` and `shader-dithering`
 * are thin `@paper-design/shaders-react` wrappers, so they run paper's own fragment shader with the
 * upstream wrapper's props (decision D1). `shader-caustics` inlines its own GLSL, which we own, so
 * it runs for real through the same WebGL host (decision D3).
 *
 * Upstream renders no DOM at all here — just a full-bleed canvas. The title treatment in each
 * scene's CSS is therefore ours: it is what makes a card in the grid readable as a component rather
 * than as a swatch, and it is deliberately different per scene so three shader cards never read as
 * one. The fields themselves carry all the motion; no scene here invents a keyframe.
 */
import { stage } from "./shared";
import { scene, type SceneSpec } from "./types";

/**
 * `<MeshGradient>`: four blurred colour wells kneaded by `distortion`, with a barely-there `swirl`.
 * `colors[0]` is the ground rather than a fourth well, which is why it doubles as the scene bg.
 */
export const shaderMeshGradient = scene({
  id: "shader-mesh-gradient",
  group: "shaders",
  shard: "shaders-a",
  stage: { w: 480, h: 270 },
  params: { speed: 1, distortion: 0.6, swirl: 0.1 },
  palette: { bg: "#12121a", c2: "#232338", c3: "#3a3a5c", accent: "#52527a", text: "#c8c8d0" },
  paint: {
    engine: "paper",
    component: "MeshGradient",
    props: { colors: ["@bg", "@c2", "@c3", "@accent"], distortion: 0.6, swirl: 0.1, fit: "cover" },
  },
  motion: { kind: "loop", seconds: 24 },
  still: 0.42,
  markup: (ctx) => stage(
    `<div class="rv-paper"></div><div class="rv-veil"></div><h3 class="rv-title">${ctx.title}</h3>`),
});

/**
 * `<Dithering>`: a moving wave luminance field binarised through a static 4x4 Bayer matrix. Exactly
 * two colours reach the screen, with hard cell edges — the knockout band answers that in the type.
 */
export const shaderDithering = scene({
  id: "shader-dithering",
  group: "shaders",
  shard: "shaders-a",
  stage: { w: 480, h: 270 },
  params: { speed: 1, shape: "wave", type: "4x4", size: 2 },
  palette: { bg: "#12121a", accent: "#6a6a85", text: "#6a6a85" },
  paint: {
    engine: "paper",
    component: "Dithering",
    props: { colorBack: "@bg", colorFront: "@accent", shape: "wave", type: "4x4", size: 2, fit: "cover" },
  },
  motion: { kind: "loop", seconds: 12 },
  still: 0.3,
  markup: (ctx) => stage(
    `<div class="rv-paper"></div><p class="rv-band"><span class="rv-title">${ctx.title}</span></p>`),
});

/**
 * Hand-written WebGL1: four counter-drifting trigonometric warps whose zero-crossing set is the
 * caustic web, biased 1.25x at the bottom of the frame and 0.55x at the top because the light lands
 * on the floor. It is dark by design — peak colour is about 0.42 with these defaults.
 *
 * One of the five GLSL-only components (D3): upstream ships no CSS fallback, so this scene declares
 * none. Without WebGL the card shows the floor colour and the title, which is the honest answer.
 */
export const shaderCaustics = scene({
  id: "shader-caustics",
  group: "shaders",
  shard: "shaders-a",
  stage: { w: 480, h: 270 },
  params: { speed: 1, scale: 5.2, intensity: 1, accentAmount: 0 },
  palette: { bg: "#0a0a0a", light: "#2e2e33", accent: "#7F57FF", text: "#d8d8de" },
  paint: {
    engine: "webgl",
    program: "shader-caustics",
    uniforms: { u_scale: 5.2, u_intensity: 1, u_floor: "@bg", u_light: "@light", u_accent: "@accent", u_accentAmt: 0 },
  },
  motion: { kind: "loop", seconds: 20 },
  still: 0.36,
  markup: (ctx) => stage(
    `<div class="rv-gl"></div><i class="rv-seam"></i><h3 class="rv-title">${ctx.title}</h3>`),
});

export const shadersA: readonly SceneSpec[] = [shaderMeshGradient, shaderDithering, shaderCaustics];
