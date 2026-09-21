/**
 * `mosaic` — the upstream `pixelate-region` block filter: up to 8 rectangular regions, each
 * replaced by flat cells of `cellSize` whose colour is the average of what sits under them. The
 * cell grid is anchored to each region's own ORIGIN, not to the frame, and later regions overwrite
 * earlier ones where they overlap.
 *
 * We have no source pixels to average, so a block's level is an analytic ramp plus per-block grain,
 * painted as `accent` over a flat `bg` base — two palette colours, no colour arithmetic, the same
 * blocky read. `drift` defaults to 0: the filter has no time term of its own.
 */
import type { SceneParams } from "../types";

const num = (params: SceneParams, key: string, fallback: number) =>
  typeof params[key] === "number" ? (params[key] as number) : fallback;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function mosaic(
  ctx2d: CanvasRenderingContext2D,
  t: number,
  params: SceneParams,
  rand: (key: string) => number,
  palette: Record<string, string>,
): void {
  const width = ctx2d.canvas.width;
  const height = ctx2d.canvas.height;
  const cellSize = Math.max(1, num(params, "cellSize", 24));
  // Upstream's cell is `cellSize` stage px in EVERY region, however small the region is; only an
  // explicit `paint.cells` overrides that. Deriving one grid from the stage and stretching it over
  // each region would shrink the blocks in proportion to the region, which is the one property
  // this field exists to express.
  const fixedCols = typeof params.cols === "number" ? Math.max(1, Math.round(params.cols)) : undefined;
  const fixedRows = typeof params.rows === "number" ? Math.max(1, Math.round(params.rows)) : undefined;
  const grain = num(params, "grain", 0.22);
  const drift = num(params, "drift", 0);
  const p = clamp01(t / Math.max(num(params, "cycle", 1), 1e-6));
  // `regions` is flat [x, y, w, h, ...] in stage px. MAX_REGIONS is 8 upstream.
  const flat = (Array.isArray(params.regions) ? params.regions : [])
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .slice(0, 32);
  // A scene names every colour it uses in `spec.palette`; an engine may not invent one. With no
  // declared base the region keeps whatever the scene already draws behind the canvas.
  const base = palette.bg ?? palette.back;
  const ink = palette.accent ?? palette.text ?? palette.front ?? "currentColor";

  for (let region = 0; region < Math.max(1, Math.floor(flat.length / 4)); region += 1) {
    const rx = flat.length >= 4 ? (flat[region * 4] as number) : 0;
    const ry = flat.length >= 4 ? (flat[region * 4 + 1] as number) : 0;
    const rw = flat.length >= 4 ? (flat[region * 4 + 2] as number) : width;
    const rh = flat.length >= 4 ? (flat[region * 4 + 3] as number) : height;
    const cols = fixedCols ?? Math.max(1, Math.round(rw / cellSize));
    const rows = fixedRows ?? Math.max(1, Math.round(rh / cellSize));
    ctx2d.globalAlpha = 1;
    if (base !== undefined) {
      ctx2d.fillStyle = base;
      ctx2d.fillRect(rx, ry, rw, rh);
    }
    ctx2d.fillStyle = ink;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const shade = 0.5 + 0.5 * Math.sin(((x + 0.5) / cols * 1.7 + (y + 0.5) / rows * 1.1 + drift * p) * Math.PI * 2);
        ctx2d.globalAlpha = clamp01(shade * 0.82 + (rand(`block-${region}-${x}-${y}`) - 0.5) * grain);
        const left = Math.round((x * rw) / cols);
        const top = Math.round((y * rh) / rows);
        ctx2d.fillRect(rx + left, ry + top, Math.round(((x + 1) * rw) / cols) - left, Math.round(((y + 1) * rh) / rows) - top);
      }
    }
  }
}
