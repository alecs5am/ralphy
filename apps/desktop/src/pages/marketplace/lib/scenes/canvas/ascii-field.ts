/**
 * `ascii-field` — the upstream `ascii-dissolve` glyph field, generic (non-text) mode.
 *
 * A deterministic noise field drives every cell up a density ramp (`" .:-=+*#%@"`): the field
 * rises over the outgoing scene, holds opaque long enough to be READ as text, then the cells drop
 * back down the ramp to space. It is a per-cell character ramp, not a zoom and not a hue rotation.
 * Flow, envelopes and per-cell jitter are transcribed from `registry/remocn/ascii-dissolve`.
 */
import type { SceneParams } from "../types";

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const num = (params: SceneParams, key: string, fallback: number) =>
  typeof params[key] === "number" ? (params[key] as number) : fallback;
const str = (params: SceneParams, key: string, fallback: string) =>
  typeof params[key] === "string" ? (params[key] as string) : fallback;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const slope = (x: number, a: number, b: number) => (a === b ? (x < a ? 0 : 1) : clamp01((x - a) / (b - a)));
/** `interpolate(p, [a,b,c,d], [0,1,1,0])`: rise, hold, fall — the upstream trapezoid envelope. */
const trapezoid = (x: number, a: number, b: number, c: number, d: number) =>
  Math.min(slope(x, a, b), 1 - slope(x, c, d));

export function asciiField(
  ctx2d: CanvasRenderingContext2D,
  t: number,
  params: SceneParams,
  rand: (key: string) => number,
  palette: Record<string, string>,
): void {
  const ramp = str(params, "ramp", " .:-=+*#%@");
  if (ramp.length === 0) return;
  const width = ctx2d.canvas.width;
  const height = ctx2d.canvas.height;
  const cellSize = num(params, "cellSize", 22);
  // Upstream sizes the grid off the mono advance: fontSize = cellSize * 0.86, advance = fontSize * 0.6.
  const cols = Math.max(1, Math.round(num(params, "cols", Math.ceil(width / (cellSize * 0.516)))));
  const rows = Math.max(1, Math.round(num(params, "rows", Math.ceil(height / cellSize) + 1)));
  const cellW = width / cols;
  const cellH = height / rows;

  const p = clamp01(t / Math.max(num(params, "cycle", 1), 1e-6));
  const fieldOpacity = trapezoid(p, 0.04, 0.2, 0.66, 0.94);
  if (fieldOpacity <= 0.001) return;
  const coverage = trapezoid(p, 0.06, 0.28, 0.6, 0.9);

  ctx2d.globalAlpha = fieldOpacity;
  // A scene names every colour it uses in `spec.palette`; an engine may not invent one. With no
  // declared back colour the canvas simply stays transparent and the scene's own background shows.
  const back = palette.back ?? palette.bg;
  if (back !== undefined) {
    ctx2d.fillStyle = back;
    ctx2d.fillRect(0, 0, width, height);
  }

  ctx2d.font = `${(cellH * 0.86).toFixed(3)}px ${MONO}`;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  const front = palette.front ?? palette.text ?? "currentColor";
  const accent = palette.accent;
  const accentDensity = num(params, "accentDensity", 0.05);
  const cx = cols / 2;
  const cy = rows / 2;
  const flow = p * 5;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      // A slow sinusoid flow plus stable per-cell jitter: organic, but textual.
      const base =
        0.5 +
        (Math.sin(x * 0.33 + flow * 1.7) +
          Math.sin(y * 0.51 - flow * 1.2) +
          Math.sin((x * 0.5 + y) * 0.24 + flow * 0.9) +
          Math.sin(Math.hypot(x - cx, (y - cy) * 1.8) * 0.42 - flow * 2.1)) /
          8;
      const density = clamp01((base * 0.72 + rand(`ascii-${x}-${y}`) * 0.28) * coverage * 1.2 - 0.08);
      const glyph = ramp.charAt(Math.min(ramp.length - 1, Math.floor(density * ramp.length)));
      if (glyph === " ") continue;
      const isAccent = accent !== undefined && rand(`ascii-a-${x}-${y}`) < accentDensity;
      ctx2d.fillStyle = isAccent ? accent : front;
      ctx2d.fillText(glyph, (x + 0.5) * cellW, (y + 0.5) * cellH);
    }
  }
}
