/**
 * The 19 `@paper-design/shaders` programs, mapped to the real exported fragment shader and to the
 * uniforms paper's own React wrapper would have computed.
 *
 * Paper's React components are thin: each merges the caller's props over `*Presets[0].params`, then
 * renames every prop to `u_<prop>`, converting colour strings with `getShaderColorFromString` and
 * enum-ish strings through the package's own lookup tables. We do the same without React, so a
 * scene's `paint.props` — verbatim from the upstream Remocn wrapper — gives the same picture.
 */
import {
  ShaderFitOptions, getShaderColorFromString, getShaderNoiseTexture,
  DitheringShapes, DitheringTypes, GemSmokeShapes, GrainGradientShapes, LiquidMetalShapes, PulsingBorderAspectRatios, WarpPatterns,
  colorPanelsFragmentShader, ditheringFragmentShader, dotOrbitFragmentShader, gemSmokeFragmentShader,
  godRaysFragmentShader, grainGradientFragmentShader, liquidMetalFragmentShader, meshGradientFragmentShader,
  metaballsFragmentShader, neuroNoiseFragmentShader, perlinNoiseFragmentShader, pulsingBorderFragmentShader,
  simplexNoiseFragmentShader, smokeRingFragmentShader, spiralFragmentShader, swirlFragmentShader,
  voronoiFragmentShader, warpFragmentShader, waterFragmentShader, type ShaderMountUniforms,
} from "@paper-design/shaders";
import {
  colorPanelsPresets, ditheringPresets, dotOrbitPresets, gemSmokePresets, godRaysPresets, grainGradientPresets,
  liquidMetalPresets, meshGradientPresets, metaballsPresets, neuroNoisePresets, perlinNoisePresets,
  pulsingBorderPresets, simplexNoisePresets, smokeRingPresets, spiralPresets, swirlPresets, voronoiPresets, warpPresets, waterPresets,
} from "@paper-design/shaders-react";
import type { PaperShaderId } from "../types";

type Enum = Readonly<Record<string, number>>;

export interface PaperEntry {
  readonly shader: string;
  /** Paper's own default preset: the fallback for any prop the upstream wrapper leaves out. */
  readonly defaults: Readonly<Record<string, unknown>>;
  /** Props whose string value indexes one of paper's lookup tables rather than being a colour. */
  readonly enums?: Readonly<Record<string, Enum>>;
  /** The one place paper's prop name and uniform name diverge. */
  readonly rename?: Readonly<Record<string, string>>;
}

/** `*Presets[0]` is the default preset in every paper shader module. */
const def = (p: readonly { params: object }[]): Readonly<Record<string, unknown>> => p[0].params as Record<string, unknown>;

export const paperShaders: Readonly<Record<PaperShaderId, PaperEntry>> = {
  ColorPanels: { shader: colorPanelsFragmentShader, defaults: def(colorPanelsPresets) },
  Dithering: { shader: ditheringFragmentShader, defaults: def(ditheringPresets), enums: { shape: DitheringShapes, type: DitheringTypes }, rename: { size: "pxSize" } },
  DotOrbit: { shader: dotOrbitFragmentShader, defaults: def(dotOrbitPresets) },
  GemSmoke: { shader: gemSmokeFragmentShader, defaults: def(gemSmokePresets), enums: { shape: GemSmokeShapes } },
  GodRays: { shader: godRaysFragmentShader, defaults: def(godRaysPresets) },
  GrainGradient: { shader: grainGradientFragmentShader, defaults: def(grainGradientPresets), enums: { shape: GrainGradientShapes } },
  LiquidMetal: { shader: liquidMetalFragmentShader, defaults: def(liquidMetalPresets), enums: { shape: LiquidMetalShapes } },
  MeshGradient: { shader: meshGradientFragmentShader, defaults: def(meshGradientPresets) },
  Metaballs: { shader: metaballsFragmentShader, defaults: def(metaballsPresets) },
  NeuroNoise: { shader: neuroNoiseFragmentShader, defaults: def(neuroNoisePresets) },
  PerlinNoise: { shader: perlinNoiseFragmentShader, defaults: def(perlinNoisePresets) },
  PulsingBorder: { shader: pulsingBorderFragmentShader, defaults: def(pulsingBorderPresets), enums: { aspectRatio: PulsingBorderAspectRatios } },
  SimplexNoise: { shader: simplexNoiseFragmentShader, defaults: def(simplexNoisePresets) },
  SmokeRing: { shader: smokeRingFragmentShader, defaults: def(smokeRingPresets) },
  Spiral: { shader: spiralFragmentShader, defaults: def(spiralPresets) },
  Swirl: { shader: swirlFragmentShader, defaults: def(swirlPresets) },
  Voronoi: { shader: voronoiFragmentShader, defaults: def(voronoiPresets) },
  Warp: { shader: warpFragmentShader, defaults: def(warpPresets), enums: { shape: WarpPatterns } },
  Water: { shader: waterFragmentShader, defaults: def(waterPresets) },
};

let noise: HTMLImageElement | undefined; // one shared noise image, not one per mount

/** Sizing uniforms live in paper's shared vertex shader, so the fragment text never names them. */
const SIZING = new Set(["u_fit", "u_scale", "u_rotation", "u_originX", "u_originY", "u_offsetX", "u_offsetY", "u_worldWidth", "u_worldHeight"]);

/**
 * Whole-word, not a substring: `PulsingBorder` has a `margin` shorthand prop and no `u_margin`
 * uniform, and a plain `includes` matches it against `u_marginLeft` and lets it through to warn.
 */
const declares = (shader: string, name: string) => new RegExp(`\\b${name}\\b`).test(shader);

/**
 * Props -> uniforms, the way paper's wrapper does it. `speed` and `frame` are dropped: they are
 * `ShaderMount` constructor arguments. A prop the shader has no uniform for is dropped too, rather
 * than reaching `setUniformValues` and warning on every frame.
 */
export function paperUniforms(id: PaperShaderId, props?: Readonly<Record<string, unknown>>): ShaderMountUniforms {
  const entry = paperShaders[id];
  const uniforms: ShaderMountUniforms = {};
  for (const [key, value] of Object.entries({ ...entry.defaults, ...props })) {
    if (key === "speed" || key === "frame") continue;
    const name = `u_${entry.rename?.[key] ?? key}`;
    if (!SIZING.has(name) && !declares(entry.shader, name)) continue;
    const table: Enum | undefined = key === "fit" ? ShaderFitOptions : entry.enums?.[key];
    if (table) uniforms[name] = table[String(value)] ?? 0;
    else if (key === "colors" && Array.isArray(value)) {
      uniforms.u_colors = value.map((color) => getShaderColorFromString(color as string));
      uniforms.u_colorsCount = value.length;
    } else if (typeof value === "string") uniforms[name] = getShaderColorFromString(value);
    else uniforms[name] = value as ShaderMountUniforms[string];
  }
  if (declares(entry.shader, "u_noiseTexture")) uniforms.u_noiseTexture = (noise ??= getShaderNoiseTexture());
  return uniforms;
}
