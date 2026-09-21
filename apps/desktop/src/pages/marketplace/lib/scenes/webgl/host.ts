/**
 * One WebGL engine for both shader families.
 *
 * `@paper-design/shaders` ships a vanilla `ShaderMount`: a full-screen quad, a `setFrame` taking
 * milliseconds from zero that draws synchronously, and a `u_time` it feeds in seconds — exactly the
 * seek model the rest of the scene runtime uses. So the 19 paper components and the 23 that inline
 * their own GLSL run on one code path: frozen is `speed: 0` at `still * runSeconds * 1000`, playing
 * is `setSpeed(speed)`.
 *
 * Nothing here throws. When a context cannot be created, or a program will not link, the host does
 * not mount and leaves `.rv-scene` without `data-gl="ready"` — the signal `shared.css` uses to
 * reveal the upstream-authored `.rv-gl-fallback` instead.
 */
import { ShaderMount, getShaderColorFromString, type ShaderMountUniforms } from "@paper-design/shaders";
import { resolvePalette } from "../shared";
import type { SceneSpec } from "../types";
import { paperProgram, webglProgram } from "./programs";

export interface GlHandle {
  setFrame(ms: number): void;
  setSpeed(n: number): void;
  setUniforms(u: Record<string, unknown>): void;
  dispose(): void;
}

export interface GlMountOptions {
  /** Milliseconds from zero, the same clock `--rv-t` seeks on. */
  readonly frameMs: number;
  readonly speed: number;
  /** Merged over the scene's own `paint` uniforms or props. */
  readonly uniforms?: Readonly<Record<string, unknown>>;
  /** Customize settings, so a palette override reaches the shader. */
  readonly settings?: Readonly<Record<string, unknown>>;
}

/** Browsers cap live WebGL contexts and the grid can hover many cards in sequence. */
const MAX_CONTEXTS = 6;
const live = new Map<HTMLElement, { key: string; handle: GlHandle }>();
/** Scene ids whose program will not link here. Recompiling one per hover is pure waste. */
const unrunnable = new Set<string>();
const NOOP: GlHandle = { setFrame() {}, setSpeed() {}, setUniforms() {}, dispose() {} };

let contextSupport: boolean | undefined;
function webglAvailable(): boolean {
  if (contextSupport === undefined) {
    try {
      const gl = typeof document === "undefined" ? null : document.createElement("canvas").getContext("webgl2");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      contextSupport = gl !== null;
    } catch { contextSupport = false; }
  }
  return contextSupport;
}

/** `"@accent"` reads the resolved palette. Every other value passes through untouched. */
const deref = (value: unknown, palette: Readonly<Record<string, string>>): unknown =>
  typeof value === "string" && value.startsWith("@") ? palette[value.slice(1)] ?? value
    : Array.isArray(value) ? value.map((item) => deref(item, palette)) : value;

/** Paper takes RGBA; upstream GLSL usually declares `vec3`, so the declared type picks the width. */
const toUniform = (value: unknown, type: string | undefined): ShaderMountUniforms[string] => {
  if (typeof value !== "string") return value as ShaderMountUniforms[string];
  const rgba = getShaderColorFromString(value);
  return type === "vec3" ? rgba.slice(0, 3) : rgba;
};

function build(spec: SceneSpec, options: GlMountOptions): { shader: string; uniforms: ShaderMountUniforms } | undefined {
  const paint = spec.paint;
  if (!paint || paint.engine === "canvas") return undefined;
  const palette = resolvePalette(spec, options.settings);
  const source = { ...(paint.engine === "paper" ? paint.props : paint.uniforms), ...options.uniforms };
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) resolved[key] = deref(value, palette);
  if (paint.engine === "paper") {
    const program = paperProgram(paint.component, resolved);
    return { shader: program.fragmentShader, uniforms: program.uniforms };
  }
  const program = webglProgram(paint.program);
  const uniforms: ShaderMountUniforms = {};
  for (const [key, value] of Object.entries(resolved)) uniforms[key] = toUniform(value, program.uniformTypes[key]);
  return { shader: program.fragmentShader, uniforms };
}

const scene = (element: HTMLElement) => element.closest(".rv-scene");

/**
 * `ShaderMount` THROWS on an image uniform that has not finished decoding, and paper's noise
 * texture is a data URL that is still decoding on the tick it is created. Paper's own React
 * wrapper awaits `decode()` before it mounts; we hold the image back and hand it over when the
 * decode lands, so a first mount draws instead of failing and being written off as unrunnable.
 */
const undecoded = (value: unknown): value is HTMLImageElement =>
  typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement
  && (!value.complete || value.naturalWidth === 0);

function hold(uniforms: ShaderMountUniforms): [string, HTMLImageElement][] {
  const held = Object.entries(uniforms).filter((entry): entry is [string, HTMLImageElement] => undecoded(entry[1]));
  for (const [key] of held) delete uniforms[key];
  return held;
}

const release = (element: HTMLElement, handle: GlHandle, held: readonly (readonly [string, HTMLImageElement])[]) => {
  for (const [key, image] of held) {
    image.decode()
      .then(() => { if (live.get(element)?.handle === handle) handle.setUniforms({ [key]: image }); })
      .catch(() => { /* an image that never decodes just leaves its shader without that texture */ });
  }
};

function attach(element: HTMLElement, spec: SceneSpec, options: GlMountOptions): GlHandle {
  const built = build(spec, options);
  if (!built) return NOOP;
  const held = hold(built.uniforms);
  const existing = live.get(element);
  if (existing && existing.key === spec.id) {
    live.delete(element);
    live.set(element, existing); // re-insert so Map order stays least-recently-used first
    existing.handle.setUniforms(built.uniforms);
    existing.handle.setFrame(options.frameMs);
    existing.handle.setSpeed(options.speed);
    release(element, existing.handle, held);
    return existing.handle;
  }
  existing?.handle.dispose();
  if (!webglAvailable()) return NOOP;
  for (const old of [...live.keys()].slice(0, Math.max(0, live.size - MAX_CONTEXTS + 1))) live.get(old)?.handle.dispose();
  const shader = new ShaderMount(element, built.shader, built.uniforms, undefined, 0, options.frameMs);
  // A program that will not link leaves ShaderMount's own program null, and its constructor has
  // already thrown out of `getAttribLocation` by this point — so reaching this line means it drew.
  shader.setFrame(options.frameMs);
  shader.setSpeed(options.speed);
  const handle: GlHandle = {
    setFrame: (ms) => shader.setFrame(ms),
    setSpeed: (n) => shader.setSpeed(n),
    setUniforms: (u) => shader.setUniforms(u as ShaderMountUniforms),
    dispose: () => {
      live.delete(element);
      scene(element)?.removeAttribute("data-gl");
      try {
        shader.dispose(); // frees the program, but the context lives until GC and the cap wants it now
        shader.canvasElement.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch { /* a teardown race must never surface as a render error */ }
    },
  };
  live.set(element, { key: spec.id, handle });
  scene(element)?.setAttribute("data-gl", "ready");
  release(element, handle, held);
  return handle;
}

/** Mount, or reuse the handle already on this element. Never throws; returns a no-op on failure. */
export function mount(element: HTMLElement, spec: SceneSpec, options: GlMountOptions): GlHandle {
  if (unrunnable.has(spec.id)) return NOOP;
  try {
    return attach(element, spec, options);
  } catch (error) {
    // A context we could not get may just be the cap; only a program that will not link is permanent.
    if (!(error instanceof Error) || !error.message.includes("WebGL is not supported")) unrunnable.add(spec.id);
    live.get(element)?.handle.dispose();
    // A throwing constructor leaves its canvas behind, and detaching one does not free its context
    // until GC — seventeen of these would spend the browser's whole context budget on dead shaders.
    const orphan = element.querySelector("canvas");
    orphan?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    orphan?.remove();
    scene(element)?.removeAttribute("data-gl");
    return NOOP;
  }
}

/** Release every live context, for a route change or a test teardown. */
export function disposeAll(): void {
  for (const entry of [...live.values()]) entry.handle.dispose();
  live.clear();
}
