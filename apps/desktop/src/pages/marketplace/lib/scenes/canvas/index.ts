/**
 * The canvas field registry: `CanvasFieldId` -> draw function.
 *
 * A field is a pure function of its arguments. Same `t`, params, `rand` and palette, same pixels —
 * which is what lets a baked still and the first live frame be the same image. A field never reads
 * a clock, never calls `Math.random` and never measures an element: its grid comes from
 * `paint.cells`, or from its own constant derivation, in reference-stage px.
 */
import type { CanvasFieldId, SceneParams } from "../types";
import { asciiField } from "./ascii-field";
import { glyphDensity } from "./glyph-density";
import { glyphLag } from "./glyph-lag";
import { mosaic } from "./mosaic";

export type CanvasField = (
  ctx2d: CanvasRenderingContext2D,
  /** Progress through one whole run (`cycle` + `hold`), in [0,1). */
  t: number,
  /** `paint.params`, plus `cycle` and — when `paint.cells` is set — `cols` and `rows`. */
  params: SceneParams,
  /** Deterministic [0,1), FNV-1a over `${sceneId}:${key}`. The only randomness that exists. */
  rand: (key: string) => number,
  /** Already resolved through `resolvePalette`, so a Customize change reaches canvas scenes too. */
  palette: Record<string, string>,
) => void;

export const canvasFields: Readonly<Record<CanvasFieldId, CanvasField>> = {
  "ascii-field": asciiField,
  "glyph-density": glyphDensity,
  mosaic,
  "glyph-lag": glyphLag,
};
