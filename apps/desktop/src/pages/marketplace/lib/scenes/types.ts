/**
 * The contract every ported Remocn component is written against.
 *
 * A scene is a pure markup builder plus one scoped CSS block. It never reads a clock: motion is
 * expressed entirely as CSS animations over a single normalised run (`--rv-run`), which lets the
 * same declarations serve a frozen card, a hovered card, a playing detail view and a frame-accurate
 * export without any of them re-rendering.
 */

/** The 17 authoring shards. One agent owns one shard; shard files are never shared. */
export type SceneShard =
  | "typography-a1" | "typography-a2" | "typography-b1" | "typography-b2"
  | "ui-a1" | "ui-a2" | "ui-b1" | "ui-b2" | "ui-blocks-layout"
  | "transitions-a" | "transitions-b"
  | "shaders-a" | "shaders-b"
  | "filters" | "effects"
  | "ai-social" | "templates-craft-comp";

/** Cell-based fields that are genuinely grid arithmetic rather than pixels. Canvas 2D suits them. */
export type CanvasFieldId =
  | "ascii-field" | "glyph-density" | "mosaic" | "glyph-lag";

/**
 * Upstream components that inline their own GLSL. We own that shader text, so it runs for real
 * rather than being approximated. Each id maps to a program in `webgl/programs.ts`.
 */
export type WebglProgramId =
  | "ascii-render" | "camera-lens" | "crt-screen" | "displacement" | "ember-burn"
  | "glitch-cut" | "grid-wave" | "halftone-print" | "hologram" | "particle-dissolve"
  | "pixelate-region" | "security-cam" | "shader-caustics" | "shader-light-tunnel"
  | "shader-seam" | "shader-strata" | "shader-weave" | "shader-text-reveal"
  | "sustained-glitch" | "tv-power-off" | "underwater-ripple" | "vhs-filter" | "rush-type";

/** Components upstream renders through `@paper-design/shaders-react`. We render the real thing. */
export type PaperShaderId =
  | "ColorPanels" | "Dithering" | "DotOrbit" | "GemSmoke" | "GodRays" | "GrainGradient"
  | "LiquidMetal" | "MeshGradient" | "Metaballs" | "NeuroNoise" | "PerlinNoise"
  | "PulsingBorder" | "SimplexNoise" | "SmokeRing" | "Spiral" | "Swirl" | "Voronoi"
  | "Warp" | "Water";

/** What moves, and on what clock. Scene CSS may only reference `var(--rv-run[-key])`. */
export type SceneMotion =
  /** Upstream has no time term at all. Conformance asserts zero `animation` declarations. */
  | { readonly kind: "static" }
  /** Ambient infinite field, strictly linear, no easing (shaders, marquees, auras). */
  | { readonly kind: "loop"; readonly seconds: number; readonly extra?: Readonly<Record<string, number>> }
  /**
   * An entrance or transition replayed forever: `seconds` of motion, then `hold` parked.
   * `extra` declares incommensurate secondary periods, emitted as `--rv-run-<key>`.
   */
  | { readonly kind: "cycle"; readonly seconds: number; readonly hold: number; readonly extra?: Readonly<Record<string, number>> };

/** Required on every scene. Markup is authored in these px; one shared rule scales it to the card. */
export interface SceneStage { readonly w: number; readonly h: number }

export interface SceneFidelity {
  readonly level: "verbatim" | "approximate" | "stand-in";
  /** At least 40 characters saying exactly what differs. Enforced in CI, not shown in the UI. */
  readonly note: string;
}

export interface SceneContext {
  /** Already HTML-escaped: the user's settings title, else the component's own default. */
  readonly title: string;
  /** Deterministic [0,1), FNV-1a over `${sceneId}:${key}`. The only randomness that exists. */
  readonly rand: (key: string) => number;
  readonly esc: (value: string) => string;
  /** BASE_URL-aware in the app, absolute in an exported artifact. */
  readonly asset: (path: string) => string;
  readonly format: "portrait" | "square" | "wide";
}

export type SceneParams = Readonly<Record<string, string | number | boolean | readonly (string | number)[]>>;

/** Pixels CSS cannot express. Every engine sizes itself in reference-stage px, never measured px. */
export type ScenePaint =
  | {
      readonly engine: "canvas";
      readonly field: CanvasFieldId;
      /** CONSTANT cell count in stage space. Never derived from element width. */
      readonly cells?: readonly [cols: number, rows: number];
      readonly fps?: number;
      readonly params?: SceneParams;
    }
  | {
      readonly engine: "webgl";
      readonly program: WebglProgramId;
      /** Uniform defaults, read out of the upstream source. */
      readonly uniforms?: SceneParams;
      /** Selector inside the scene whose CSS is the upstream-authored no-WebGL fallback. */
      readonly fallback?: string;
    }
  | {
      readonly engine: "paper";
      readonly component: PaperShaderId;
      /** Props, verbatim from the upstream wrapper's defaults. */
      readonly props: SceneParams;
    };

export interface SceneSpec<P extends SceneParams = SceneParams> {
  /** Upstream `slug` (motion) or `name` (foundations), VERBATIM. Registry key. */
  readonly id: string;
  readonly group: string;
  readonly shard: SceneShard;
  readonly stage: SceneStage;
  /**
   * Upstream prop defaults, read out of the embedded TSX. Conformance checks every key against
   * that component's source text — this is the anti-fabrication assertion.
   */
  readonly params: P;
  /** Every literal colour the scene uses, emitted as `--p-<key>`. Scene CSS may not write a colour. */
  readonly palette: Readonly<Record<string, string>>;
  /** Inner HTML of `.rv-scene`. Pure: no clock, no DOM, no closures, no `Math.random`. */
  readonly markup: (ctx: SceneContext, params: P) => string;
  readonly motion: SceneMotion;
  readonly paint?: ScenePaint;
  /** Frozen frame for the card, the still and reduced motion. Fraction of one run, in (0,1). */
  readonly still: number;
  /** Where upstream's own reduced-motion path lands. Default "still". */
  readonly reduced?: "still" | "end" | number;
  readonly fidelity?: SceneFidelity;
}

/**
 * Terse constructor so one component stays about fifteen lines of source. The cast widens the
 * component's own params type to the registry's: `markup` is only ever called with the very params
 * object declared beside it, so the erased type is sound in practice even though it is not provably
 * so to the checker.
 */
export const scene = <P extends SceneParams>(spec: SceneSpec<P>): SceneSpec => spec as unknown as SceneSpec;
