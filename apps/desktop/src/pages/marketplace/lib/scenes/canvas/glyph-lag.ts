/**
 * `glyph-lag` — the upstream `matrix-decode` scramble: a reveal front sweeps the text left to
 * right and every character the front has not reached yet LAGS behind it as a scrambled glyph.
 *
 * Transcribed from upstream: character `i` of `n` resolves at `frame >= (i / n) * revealDuration`
 * and stays resolved; a space is never scrambled; and the scramble seed carries `floor(frame / 2)`,
 * so the glyphs re-roll in hard 15 Hz steps rather than tweening. Nothing here reads a clock — the
 * step index is derived from `t`, and the glyph from the shared deterministic `rand`.
 */
import type { SceneParams } from "../types";

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const num = (params: SceneParams, key: string, fallback: number) =>
  typeof params[key] === "number" ? (params[key] as number) : fallback;
const str = (params: SceneParams, key: string, fallback: string) =>
  typeof params[key] === "string" ? (params[key] as string) : fallback;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function glyphLag(
  ctx2d: CanvasRenderingContext2D,
  t: number,
  params: SceneParams,
  rand: (key: string) => number,
  palette: Record<string, string>,
): void {
  const body = str(params, "text", "MATRIX DECODE");
  const charset = str(params, "charset", "!@#$%^&*()_+-=<>?/\\|");
  if (body.length === 0 || charset.length === 0) return;
  const width = ctx2d.canvas.width;
  const height = ctx2d.canvas.height;
  const cols = Math.max(1, Math.round(num(params, "cols", body.length)));
  const rows = Math.max(1, Math.round(num(params, "rows", Math.ceil(body.length / cols))));
  const cellW = width / cols;
  const cellH = height / rows;

  const p = clamp01(t / Math.max(num(params, "cycle", 1), 1e-6));
  const revealDuration = num(params, "revealDuration", 60);
  // Upstream re-seeds on floor(frame / 2) at 30 fps: a deterministic 15 Hz re-roll.
  const step = Math.floor((p * revealDuration) / 2);
  const scrambleAlpha = clamp01(num(params, "scrambleOpacity", 1));

  ctx2d.font = `${Math.min(cellH * 0.78, cellW * 1.6).toFixed(3)}px ${MONO}`;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillStyle = palette.text ?? palette.ink ?? palette.accent ?? "currentColor";

  const count = Math.min(body.length, cols * rows);
  for (let index = 0; index < count; index += 1) {
    const target = body.charAt(index);
    if (target === " ") continue;
    const revealed = p >= index / body.length;
    const glyph = revealed ? target : charset.charAt(Math.floor(rand(`${index}-${step}`) * charset.length));
    ctx2d.globalAlpha = revealed ? 1 : scrambleAlpha;
    ctx2d.fillText(glyph, ((index % cols) + 0.5) * cellW, (Math.floor(index / cols) + 0.5) * cellH);
  }
}
