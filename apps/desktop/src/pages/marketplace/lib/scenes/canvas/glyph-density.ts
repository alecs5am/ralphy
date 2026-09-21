/**
 * `glyph-density` — the observable behaviour of the upstream `ascii-render` post filter: a
 * monospace grid where each cell picks its glyph from `charset` by the luminance under it, in HARD
 * steps (`index = min(floor(luma * n), n - 1)`), never a smoothed opacity or hue ramp.
 *
 * Upstream reads that luminance from the rendered scene through a 3x3 box average. A scene we
 * author ourselves has no bitmap to sample, so the luminance is a known analytic field — a radial
 * falloff plus the per-cell grain the box average would surface. `drift` defaults to 0 because the
 * filter has no time term of its own; a spec that wants the field to breathe raises it.
 */
import type { SceneParams } from "../types";

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const num = (params: SceneParams, key: string, fallback: number) =>
  typeof params[key] === "number" ? (params[key] as number) : fallback;
const str = (params: SceneParams, key: string, fallback: string) =>
  typeof params[key] === "string" ? (params[key] as string) : fallback;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function glyphDensity(
  ctx2d: CanvasRenderingContext2D,
  t: number,
  params: SceneParams,
  rand: (key: string) => number,
  palette: Record<string, string>,
): void {
  const charset = str(params, "charset", " .:-=+*#%@");
  if (charset.length === 0) return;
  const width = ctx2d.canvas.width;
  const height = ctx2d.canvas.height;
  // Upstream cell: glyphSize tall by glyphSize * GLYPH_ASPECT (0.545) wide.
  const glyphSize = num(params, "glyphSize", 26);
  const cols = Math.max(1, Math.round(num(params, "cols", Math.ceil(width / (glyphSize * 0.545)))));
  const rows = Math.max(1, Math.round(num(params, "rows", Math.ceil(height / glyphSize))));
  const cellW = width / cols;
  const cellH = height / rows;

  const drift = num(params, "drift", 0);
  const phase = drift * clamp01(t / Math.max(num(params, "cycle", 1), 1e-6)) * Math.PI * 2;
  const focusX = num(params, "focusX", 0.5) * width;
  const focusY = num(params, "focusY", 0.5) * height;
  const radius = Math.max(1e-6, num(params, "radius", 0.72) * Math.hypot(width, height) * 0.5);
  const grain = num(params, "grain", 0.16);

  ctx2d.globalAlpha = clamp01(num(params, "intensity", 1));
  ctx2d.fillStyle = palette.ink ?? palette.accent ?? palette.text ?? "currentColor";
  ctx2d.font = `${(cellH * 0.74).toFixed(3)}px ${MONO}`;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = (x + 0.5) * cellW;
      const py = (y + 0.5) * cellH;
      const r = Math.hypot(px - focusX, py - focusY) / radius;
      const luma = clamp01(
        1 - r + (rand(`luma-${x}-${y}`) - 0.5) * 2 * grain + drift * 0.18 * Math.sin(r * 6 - phase),
      );
      const glyph = charset.charAt(Math.min(charset.length - 1, Math.floor(luma * charset.length)));
      if (glyph === " ") continue;
      ctx2d.fillText(glyph, px, py);
    }
  }
}
