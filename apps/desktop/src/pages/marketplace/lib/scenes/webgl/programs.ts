/**
 * Fragment-shader text for everything the WebGL host can run: the 19 paper programs come from
 * `paper.ts`, the 23 Remocn-authored ones from `glsl.generated.ts`.
 *
 * The Remocn shaders were written for their own tiny WebGL setup, so two mechanical adjustments are
 * made here. Neither touches the shader's own logic, only how it meets `ShaderMount`:
 *
 * 1. Upstream declares and names its own clock and viewport (`iTime`, `iResolution`, `u_res`, ...).
 *    `ShaderMount` owns both and its vertex shader declares `u_resolution` as `mediump`, so a highp
 *    redeclaration in the fragment stage will not link. We drop upstream's declaration, declare ours
 *    at the matching precision, and alias upstream's name onto it.
 * 2. Four components are still GLSL ES 1.00 while `ShaderMount`'s vertex shader is `#version 300 es`,
 *    and the two cannot link. Those get the standard ES 1.00 -> 3.00 rename (`varying` -> `in`,
 *    `texture2D` -> `texture`, `gl_FragColor` -> an explicit `out`).
 *
 * A program that still fails to link is not a bug to paper over: most of these shaders are
 * post-process passes over a Remotion frame and read a `sampler2D` we have no earlier pass to fill.
 * `host.ts` catches that, never mounts, and `shared.css` reveals the upstream-authored
 * `.rv-gl-fallback` instead — which is exactly the path 18 of the 23 ship one for.
 */
import type { PaperShaderId, WebglProgramId } from "../types";
import generatedGlslData from "./glsl.generated.json";

/** One extracted upstream fragment stage. Shape of every row in `glsl.generated.json`. */
export interface GeneratedGlsl {
  /** Upstream identifier of the template literal this text was lifted from. */
  readonly stage: string;
  /** Every fragment stage the upstream component declares, in source order. */
  readonly stages: readonly string[];
  /** Declared uniform name -> GLSL type, so the host can size a colour vector correctly. */
  readonly uniforms: Readonly<Record<string, string>>;
  readonly source: string;
}

const generatedGlsl = generatedGlslData as Readonly<Record<WebglProgramId, GeneratedGlsl>>;
import { paperShaders, paperUniforms } from "./paper";
import type { ShaderMountUniforms } from "@paper-design/shaders";

export interface ResolvedProgram {
  readonly fragmentShader: string;
  /** Declared uniform name -> GLSL type. Empty for paper programs, whose uniforms are already typed. */
  readonly uniformTypes: Readonly<Record<string, string>>;
}

const PRELUDE = [
  "precision highp float;",
  "uniform mediump vec2 u_resolution;", // mediump to match ShaderMount's vertex shader
  "uniform float u_time;",
  "#define iResolution u_resolution",
  "#define uResolution u_resolution",
  "#define uRes u_resolution",
  "#define u_res u_resolution",
  "#define iTime u_time",
  "#define uTime u_time",
].join("\n");

/** Upstream's own declarations of the two uniforms ShaderMount drives; ours replace them. */
const DRIVEN = /^[ \t]*uniform\s+\w+\s+(?:u_res|uRes|uResolution|iResolution|u_resolution|u_time|uTime|iTime)\s*;[ \t]*\n/gm;

/**
 * Names ShaderMount's vertex shader also declares. A uniform of one name is a single uniform across
 * both stages, so a `highp` twin of a `mediump` vertex uniform is a link error rather than a shadow.
 * Both collisions in practice are scalars in a 0..4 range, so taking the vertex precision is safe.
 */
const SHARED = /^([ \t]*uniform\s+)(float|vec2)(\s+(?:u_pixelRatio|u_imageAspectRatio|u_originX|u_originY|u_worldWidth|u_worldHeight|u_fit|u_scale|u_rotation|u_offsetX|u_offsetY)\s*;)/gm;

/** `#version` must be the first token, and `out vec4` needs a default float precision in scope. */
function compose(source: string): string {
  const legacy = !/#version\s+300\s+es/.test(source);
  const body = source.replace(/^\s*#version[^\n]*\n/, "").replace(DRIVEN, "").replace(SHARED, "$1mediump $2$3");
  const upgraded = legacy
    ? body.replace(/\bvarying\b/g, "in").replace(/\btexture2D\b/g, "texture").replace(/\bgl_FragColor\b/g, "rv_fragColor")
    : body;
  return ["#version 300 es", PRELUDE, legacy ? "out vec4 rv_fragColor;" : "", upgraded].filter(Boolean).join("\n");
}

const composed = new Map<WebglProgramId, ResolvedProgram>();

/** The Remocn-authored program for an id, composed once and cached. */
export function webglProgram(id: WebglProgramId): ResolvedProgram {
  let program = composed.get(id);
  if (!program) {
    const entry = generatedGlsl[id];
    program = { fragmentShader: compose(entry.source), uniformTypes: entry.uniforms };
    composed.set(id, program);
  }
  return program;
}

/** Which upstream pass `webglProgram` runs, and every pass that component declares. */
export const webglStages = (id: WebglProgramId): { stage: string; stages: readonly string[] } => ({
  stage: generatedGlsl[id].stage,
  stages: generatedGlsl[id].stages,
});

/** The paper program for an id, with the upstream wrapper's props folded into paper's own defaults. */
export function paperProgram(
  id: PaperShaderId,
  props?: Readonly<Record<string, unknown>>,
): { readonly fragmentShader: string; readonly uniforms: ShaderMountUniforms } {
  return { fragmentShader: paperShaders[id].shader, uniforms: paperUniforms(id, props) };
}
