// Reference digest bundle (#557) — one folder an agent reads in ONE request to
// analyze a reference video: scene cuts, a tile -> timestamp frame map, the
// word-level transcript when one already exists, known metrics, and one or
// more contact sheets sized for the agent's own vision budget.
//
// Everything here is local and free: ffprobe for metadata, one ffmpeg pass
// for the per-frame scene-score profile (cli/lib/eval/scenes.ts), one ffmpeg
// pass that streams CFR rgb24 frames at tile size, and an in-process sheet
// compositor that burns a timestamp label under every tile. The local ffmpeg
// build is not assumed to have `drawtext` (Homebrew ffmpeg ships without
// freetype), so labels are drawn with a built-in 5x7 bitmap font.
//
// Cost model (the knob the #557 eval tuned): a sheet costs vision input tokens
// according to `visionImageCost` — the API downscales any image whose long
// edge exceeds 1568 px or whose area exceeds ~1.15 MP, then charges
// ceil(w*h/750) tokens. Pixels above that budget are thrown away by the API,
// so by default the planner FITS the sheet to the budget: the tile width is
// the largest one whose sheet still fits, and a larger requested width is
// clamped (`--no-fit` disables the clamp for human viewing).
//
// Results and the chosen defaults: docs/research/contact-sheet-eval.md.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { probeVideo } from "./eval/probe.js";
import {
  MIN_SCENE_SEC,
  SCENE_THRESHOLD,
  cutsFromProfile,
  sceneScoreProfile,
  scenesFromCuts,
  type SceneScorePoint,
} from "./eval/scenes.js";

// ─── Defaults (chosen by the #557 eval; see docs/research/contact-sheet-eval.md) ─

export type DigestMode = "fixed" | "cut-adaptive";
export type SheetFormat = "jpg" | "png";

export const DIGEST_DEFAULTS = {
  mode: "fixed" as DigestMode,
  everySec: 0.5,
  tilesPerSheet: 36,
  /** 4 x 36 tiles = 72 s at 0.5 s; longer videos are evenly subsampled. */
  maxSheets: 4,
  format: "jpg" as SheetFormat,
  /** In cut-adaptive mode a shot is "fast" above this mean scene score. */
  fastMotion: 0.06,
  cutThreshold: SCENE_THRESHOLD,
} as const;

// ─── Vision budget + token cost ──────────────────────────────────────────────

export interface VisionBudget {
  /** Long edge above which the API downscales. */
  maxLongEdge: number;
  /** Pixel area above which the API downscales. */
  maxPixels: number;
  /** Input tokens are ceil(width * height / pixelsPerToken) after downscale. */
  pixelsPerToken: number;
}

/** Claude image input rule applied by the #557 eval (documented there). */
export const CLAUDE_VISION_BUDGET: VisionBudget = {
  maxLongEdge: 1568,
  maxPixels: 1_150_000,
  pixelsPerToken: 750,
};

export interface VisionImageCost {
  /** Size the model actually sees after the API's own downscale. */
  width: number;
  height: number;
  scale: number;
  downscaled: boolean;
  tokens: number;
}

export function visionImageCost(
  width: number,
  height: number,
  budget: VisionBudget = CLAUDE_VISION_BUDGET,
): VisionImageCost {
  if (width <= 0 || height <= 0) return { width: 0, height: 0, scale: 1, downscaled: false, tokens: 0 };
  const scale = Math.min(
    1,
    budget.maxLongEdge / Math.max(width, height),
    Math.sqrt(budget.maxPixels / (width * height)),
  );
  const w = scale < 1 ? Math.floor(width * scale) : width;
  const h = scale < 1 ? Math.floor(height * scale) : height;
  return {
    width: w,
    height: h,
    scale: round4(scale),
    downscaled: scale < 1,
    tokens: Math.ceil((w * h) / budget.pixelsPerToken),
  };
}

// ─── Sheet layout math ───────────────────────────────────────────────────────

export const SHEET_GUTTER_PX = 2;
const GLYPH_W = 5;
const GLYPH_H = 7;

/** Label glyph scale for a tile width (1 = 5x7 px glyphs). */
export function labelScaleFor(tileWidth: number): number {
  if (tileWidth < 110) return 1;
  if (tileWidth < 260) return 2;
  return 3;
}

/** Height of the label band burned under each tile. */
export function labelBandHeight(scale: number): number {
  return GLYPH_H * scale + 2 * Math.max(2, scale);
}

export interface SheetDims {
  tileWidth: number;
  tileHeight: number;
  labelScale: number;
  labelHeight: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
}

/** Pixel size of a cols x rows sheet of `tileWidth` tiles with aspect h/w. */
export function sheetDims(
  cols: number,
  rows: number,
  tileWidth: number,
  aspect: number,
  gutter: number = SHEET_GUTTER_PX,
): SheetDims {
  const tileHeight = even(Math.max(2, Math.round(tileWidth * aspect)));
  const labelScale = labelScaleFor(tileWidth);
  const labelHeight = labelBandHeight(labelScale);
  const cellWidth = tileWidth;
  const cellHeight = tileHeight + labelHeight;
  return {
    tileWidth,
    tileHeight,
    labelScale,
    labelHeight,
    cellWidth,
    cellHeight,
    width: cols * cellWidth + (cols + 1) * gutter,
    height: rows * cellHeight + (rows + 1) * gutter,
  };
}

function fitsBudget(d: SheetDims, budget: VisionBudget): boolean {
  return Math.max(d.width, d.height) <= budget.maxLongEdge && d.width * d.height <= budget.maxPixels;
}

/** Largest even tile width whose sheet fits the vision budget (min 16 px). */
export function fitTileWidth(
  cols: number,
  rows: number,
  aspect: number,
  budget: VisionBudget = CLAUDE_VISION_BUDGET,
  gutter: number = SHEET_GUTTER_PX,
): number {
  let lo = 8; // in units of 2 px
  let hi = 2048;
  if (!fitsBudget(sheetDims(cols, rows, lo * 2, aspect, gutter), budget)) return lo * 2;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fitsBudget(sheetDims(cols, rows, mid * 2, aspect, gutter), budget)) lo = mid;
    else hi = mid - 1;
  }
  return lo * 2;
}

export interface SheetLayoutInput {
  /** Tiles per full sheet. */
  tiles: number;
  /** Source aspect as height / width (9:16 vertical = 1.777…). */
  aspect: number;
  /** Requested tile width; omitted = fit the budget exactly. */
  tileWidth?: number;
  /** Clamp the tile width so the sheet fits the budget (default true). */
  fit?: boolean;
  /** Never upscale above the source width. */
  maxTileWidth?: number;
  /** Force the column count (default: chosen to maximize tile pixels). */
  cols?: number;
  budget?: VisionBudget;
  gutter?: number;
}

export interface SheetLayout extends SheetDims {
  tiles: number;
  cols: number;
  rows: number;
  gutter: number;
  /** Largest tile width that fits the budget for this grid. */
  fitWidth: number;
  /** True when a requested tile width was reduced to `fitWidth`. */
  clamped: boolean;
  /** Tokens for one full sheet, and the tile width the model effectively sees. */
  visionTokens: number;
  effectiveTileWidth: number;
}

/**
 * Pick the grid for `tiles` tiles: the column count whose sheet gives every
 * tile the most pixels under the budget (ties: fewer empty cells, then the
 * squarer sheet). The sheet is then sized to the requested or fitted width.
 */
export function planSheetLayout(input: SheetLayoutInput): SheetLayout {
  const tiles = Math.max(1, Math.floor(input.tiles));
  const budget = input.budget ?? CLAUDE_VISION_BUDGET;
  const gutter = input.gutter ?? SHEET_GUTTER_PX;
  const fit = input.fit !== false;
  const aspect = input.aspect > 0 ? input.aspect : 16 / 9;

  let best: { cols: number; rows: number; fitWidth: number; empty: number; skew: number } | null = null;
  const forced = input.cols && input.cols > 0 ? Math.min(tiles, Math.floor(input.cols)) : null;
  for (let cols = forced ?? 1; cols <= (forced ?? tiles); cols++) {
    const rows = Math.ceil(tiles / cols);
    const fitWidth = fitTileWidth(cols, rows, aspect, budget, gutter);
    const d = sheetDims(cols, rows, fitWidth, aspect, gutter);
    const cand = {
      cols,
      rows,
      fitWidth,
      empty: cols * rows - tiles,
      skew: Math.abs(Math.log(d.width / d.height)),
    };
    if (
      !best ||
      cand.fitWidth > best.fitWidth ||
      (cand.fitWidth === best.fitWidth && cand.empty < best.empty) ||
      (cand.fitWidth === best.fitWidth && cand.empty === best.empty && cand.skew < best.skew)
    ) {
      best = cand;
    }
  }
  const chosen = best!;
  const sourceCap = input.maxTileWidth && input.maxTileWidth > 0 ? even(input.maxTileWidth) : Infinity;
  const requested = input.tileWidth && input.tileWidth > 0 ? even(input.tileWidth) : undefined;
  let tileWidth = requested ?? chosen.fitWidth;
  let clamped = false;
  if (fit && tileWidth > chosen.fitWidth) {
    tileWidth = chosen.fitWidth;
    clamped = requested !== undefined;
  }
  tileWidth = Math.max(16, Math.min(tileWidth, sourceCap));
  const dims = sheetDims(chosen.cols, chosen.rows, tileWidth, aspect, gutter);
  const cost = visionImageCost(dims.width, dims.height, budget);
  return {
    ...dims,
    tiles,
    cols: chosen.cols,
    rows: chosen.rows,
    gutter,
    fitWidth: chosen.fitWidth,
    clamped,
    visionTokens: cost.tokens,
    effectiveTileWidth: Math.floor(tileWidth * cost.scale),
  };
}

// ─── Sampling ────────────────────────────────────────────────────────────────

export interface PlannedFrame {
  /** Target timestamp (seconds) — the burned label. */
  t: number;
  /** Shot index the frame falls in. */
  shot: number;
  role: "shot-start" | "in-shot" | "cadence";
}

export interface ShotSpan {
  startSec: number;
  endSec: number;
  /** Mean per-frame scene score inside the shot (motion proxy). */
  motion?: number;
}

/** t = 0, every, 2*every, … strictly before the end (half a frame of slack). */
export function fixedCadenceTimes(durationSec: number, everySec: number, fps = 30): number[] {
  if (!(durationSec > 0) || !(everySec > 0)) return [];
  const limit = durationSec - 0.5 / Math.max(1, fps);
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const t = round3(i * everySec);
    if (t >= limit && i > 0) break;
    out.push(t);
    if (i > 100_000) break;
  }
  return out;
}

/** Evenly keep `max` items (first and last always kept). */
export function evenSubsample<T>(items: T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return [...items];
  if (max === 1) return [items[0]!];
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(items[Math.round((k * (items.length - 1)) / (max - 1))]!);
  return out;
}

function shotIndexAt(t: number, shots: ShotSpan[]): number {
  for (let i = shots.length - 1; i >= 0; i--) if (t >= shots[i]!.startSec - 1e-6) return i;
  return 0;
}

export function planFixedFrames(
  durationSec: number,
  everySec: number,
  shots: ShotSpan[],
  maxFrames: number,
  fps = 30,
): { frames: PlannedFrame[]; capped: boolean } {
  const all = fixedCadenceTimes(durationSec, everySec, fps);
  const kept = evenSubsample(all, maxFrames);
  return {
    frames: kept.map((t) => ({ t, shot: shotIndexAt(t, shots), role: "cadence" as const })),
    capped: kept.length < all.length,
  };
}

export interface CutAdaptiveOptions {
  shots: ShotSpan[];
  /** In-shot cadence: one extra frame per `everySec` inside a shot. */
  everySec: number;
  /** Cadence inside fast shots (default everySec / 2). */
  fastEverySec?: number;
  /** Mean scene score above which a shot is fast. */
  fastMotion?: number;
  maxFrames: number;
  /** Frames closer than this are deduped (default one 30 fps frame). */
  minGapSec?: number;
}

/**
 * Cut-adaptive sampler: one frame just after every shot start (a small offset
 * skips the transition frame), plus evenly spaced in-shot frames — one per
 * `everySec` in normal shots, one per `fastEverySec` in fast shots. Under the
 * frame cap the shot-start frames always survive and the extras are cut back
 * proportionally (largest remainder); when the shots alone exceed the cap,
 * shots are kept evenly and `droppedShots` reports the rest.
 */
export function cutAdaptiveFrames(opts: CutAdaptiveOptions): {
  frames: PlannedFrame[];
  capped: boolean;
  droppedShots: number;
} {
  const shots = opts.shots.filter((s) => s.endSec > s.startSec);
  const maxFrames = Math.max(1, Math.floor(opts.maxFrames));
  const every = opts.everySec > 0 ? opts.everySec : 1;
  const fastEvery = opts.fastEverySec && opts.fastEverySec > 0 ? opts.fastEverySec : every / 2;
  const fastMotion = opts.fastMotion ?? DIGEST_DEFAULTS.fastMotion;
  const minGap = opts.minGapSec ?? 1 / 30;

  // The first shot starts at t = 0 (no transition to skip; the first frame is
  // the hook frame). Later shots skip a little past the cut frame.
  const startOf = (s: ShotSpan) =>
    s.startSec <= 0 ? 0 : round3(s.startSec + Math.min(0.25, (s.endSec - s.startSec) * 0.1));

  if (shots.length === 0) return { frames: [], capped: false, droppedShots: 0 };
  if (shots.length > maxFrames) {
    const keep = evenSubsample(shots.map((s, i) => ({ s, i })), maxFrames);
    return {
      frames: keep.map(({ s, i }) => ({ t: startOf(s), shot: i, role: "shot-start" as const })),
      capped: true,
      droppedShots: shots.length - keep.length,
    };
  }

  const desired = shots.map((s) => {
    const len = s.endSec - s.startSec;
    const interval = (s.motion ?? 0) > fastMotion ? fastEvery : every;
    return Math.max(0, Math.ceil(len / interval - 1e-9) - 1);
  });
  const budget = maxFrames - shots.length;
  const total = desired.reduce((a, b) => a + b, 0);
  let extras = desired;
  let capped = false;
  if (total > budget) {
    capped = true;
    const raw = desired.map((d) => (d * budget) / total);
    extras = raw.map((r) => Math.floor(r));
    let left = budget - extras.reduce((a, b) => a + b, 0);
    const order = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r), len: shots[i]!.endSec - shots[i]!.startSec }))
      .sort((a, b) => b.frac - a.frac || b.len - a.len || a.i - b.i);
    for (const o of order) {
      if (left <= 0) break;
      extras[o.i]! += 1;
      left--;
    }
  }

  const frames: PlannedFrame[] = [];
  shots.forEach((s, i) => {
    const t0 = startOf(s);
    frames.push({ t: t0, shot: i, role: "shot-start" });
    const n = extras[i]!;
    for (let j = 1; j <= n; j++) {
      frames.push({ t: round3(t0 + (j * (s.endSec - t0)) / (n + 1)), shot: i, role: "in-shot" });
    }
  });
  frames.sort((a, b) => a.t - b.t);
  const deduped: PlannedFrame[] = [];
  for (const f of frames) {
    const prev = deduped[deduped.length - 1];
    if (prev && f.t - prev.t < minGap) continue;
    deduped.push(f);
  }
  return { frames: deduped, capped, droppedShots: 0 };
}

/** Mean scene score per shot, skipping each shot's first two frames (the cut itself). */
export function shotMotion(profile: SceneScorePoint[], shots: ShotSpan[]): number[] {
  return shots.map((s) => {
    const inside = profile.filter((p) => p.t >= s.startSec - 1e-6 && p.t < s.endSec - 1e-6);
    const body = inside.slice(2);
    if (body.length === 0) return 0;
    return round4(body.reduce((a, p) => a + p.score, 0) / body.length);
  });
}

// ─── Timestamp map ───────────────────────────────────────────────────────────

export interface FrameMapEntry {
  /** 0-based tile index within the sheet (row-major). */
  tile: number;
  /** Target timestamp in seconds (the burned label). */
  t: number;
  /** CFR frame index decoded for this tile, and its exact time. */
  frameIndex: number;
  frameTime: number;
  shot: number;
  role: PlannedFrame["role"];
}

export interface SheetPlan {
  /** 1-based sheet number. */
  index: number;
  frames: FrameMapEntry[];
}

/**
 * Split planned frames into sheets of `tilesPerSheet` and resolve every tile
 * to a CFR frame index at `decodeFps` (clamped to the last decodable frame).
 */
export function buildFrameMap(
  frames: PlannedFrame[],
  tilesPerSheet: number,
  decodeFps: number,
  durationSec: number,
): SheetPlan[] {
  const per = Math.max(1, Math.floor(tilesPerSheet));
  const lastIndex = Math.max(0, Math.ceil(durationSec * decodeFps) - 1);
  const sheets: SheetPlan[] = [];
  frames.forEach((f, i) => {
    const sheetNo = Math.floor(i / per);
    if (!sheets[sheetNo]) sheets[sheetNo] = { index: sheetNo + 1, frames: [] };
    const frameIndex = Math.min(lastIndex, Math.max(0, Math.round(f.t * decodeFps)));
    sheets[sheetNo]!.frames.push({
      tile: i % per,
      t: f.t,
      frameIndex,
      frameTime: round3(frameIndex / decodeFps),
      shot: f.shot,
      role: f.role,
    });
  });
  return sheets;
}

/** Burned label text for a timestamp: "12.75s". */
export function formatTileLabel(t: number): string {
  return `${t.toFixed(2)}s`;
}

// ─── Append-only bundle dirs ─────────────────────────────────────────────────

/** `base`, else `base.v2`, `base.v3`, … — the first path that does not exist. */
export function nextVersionedPath(base: string, exists: (p: string) => boolean = existsSync): string {
  if (!exists(base)) return base;
  for (let v = 2; v < 10_000; v++) {
    const cand = `${base}.v${v}`;
    if (!exists(cand)) return cand;
  }
  throw new Error(`nextVersionedPath: too many versions of ${base}`);
}

/**
 * Create a fresh bundle dir without ever reusing an existing one. `mkdir`
 * without `recursive` fails on an existing path, so a concurrent writer that
 * wins the race pushes this one to the next version instead of sharing it.
 */
export async function createVersionedDir(base: string): Promise<string> {
  await fs.mkdir(path.dirname(base), { recursive: true });
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const dir = nextVersionedPath(base);
    try {
      await fs.mkdir(dir);
      return dir;
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
    }
  }
  throw new Error(`createVersionedDir: could not allocate ${base}`);
}

// ─── Bitmap font + compositor ────────────────────────────────────────────────

const GLYPHS: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

/** Pixel width of `text` at `scale` (one blank column between glyphs). */
export function labelTextWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : (text.length * (GLYPH_W + 1) - 1) * scale;
}

type Rgb = [number, number, number];

function fillRect(buf: Buffer, stride: number, x: number, y: number, w: number, h: number, rgb: Rgb): void {
  for (let yy = y; yy < y + h; yy++) {
    let o = (yy * stride + x) * 3;
    for (let xx = 0; xx < w; xx++) {
      buf[o] = rgb[0];
      buf[o + 1] = rgb[1];
      buf[o + 2] = rgb[2];
      o += 3;
    }
  }
}

/** Draw `text` with the bitmap font into an rgb24 buffer; glyphs clip at `maxX`. */
export function drawLabel(
  buf: Buffer,
  stride: number,
  x: number,
  y: number,
  text: string,
  scale: number,
  rgb: Rgb = [255, 255, 255],
  maxX: number = stride,
): void {
  let cx = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch] ?? GLYPHS[" "]!;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row[gx] !== "#") continue;
        const px = cx + gx * scale;
        if (px + scale > maxX) continue;
        fillRect(buf, stride, px, y + gy * scale, scale, scale, rgb);
      }
    }
    cx += (GLYPH_W + 1) * scale;
  }
}

/** Compose an rgb24 sheet from rgb24 tiles (row-major) with labels under each tile. */
export function composeSheet(
  tiles: Array<{ rgb: Buffer; label: string }>,
  layout: Pick<SheetLayout, "cols" | "tileWidth" | "tileHeight" | "labelHeight" | "labelScale" | "gutter" | "cellHeight">,
): { rgb: Buffer; width: number; height: number } {
  const { cols, tileWidth, tileHeight, labelHeight, labelScale, gutter, cellHeight } = layout;
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const usedCols = Math.min(cols, Math.max(1, tiles.length));
  const width = usedCols * tileWidth + (usedCols + 1) * gutter;
  const height = rows * cellHeight + (rows + 1) * gutter;
  const buf = Buffer.alloc(width * height * 3);
  fillRect(buf, width, 0, 0, width, height, [42, 42, 42]);
  tiles.forEach((tile, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gutter + col * (tileWidth + gutter);
    const y = gutter + row * (cellHeight + gutter);
    const rowBytes = tileWidth * 3;
    for (let ty = 0; ty < tileHeight; ty++) {
      tile.rgb.copy(buf, ((y + ty) * width + x) * 3, ty * rowBytes, ty * rowBytes + rowBytes);
    }
    const bandY = y + tileHeight;
    fillRect(buf, width, x, bandY, tileWidth, labelHeight, [0, 0, 0]);
    const pad = Math.max(2, labelScale);
    drawLabel(buf, width, x + pad, bandY + pad, tile.label, labelScale, [255, 255, 255], x + tileWidth);
  });
  return { rgb: buf, width, height };
}

// ─── ffmpeg I/O ──────────────────────────────────────────────────────────────

/**
 * Stream CFR rgb24 frames at `width`x`height` and keep only `indices`.
 * Indices past the last decoded frame resolve to the last frame.
 */
export function extractRawFrames(
  file: string,
  indices: number[],
  opts: { fps: number; width: number; height: number },
): Promise<Map<number, Buffer>> {
  const wanted = new Set(indices);
  const maxWanted = indices.reduce((a, b) => Math.max(a, b), 0);
  const frameBytes = opts.width * opts.height * 3;
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-an",
      "-vf",
      `fps=${opts.fps}:start_time=0,scale=${opts.width}:${opts.height}:flags=area,setsar=1`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ]);
    const got = new Map<number, Buffer>();
    let current = Buffer.alloc(frameBytes);
    let filled = 0;
    let n = 0;
    let last: Buffer | null = null;
    let stderr = "";
    let done = false;
    proc.stdout.on("data", (chunk: Buffer) => {
      if (done) return;
      let off = 0;
      while (off < chunk.length) {
        const take = Math.min(frameBytes - filled, chunk.length - off);
        chunk.copy(current, filled, off, off + take);
        filled += take;
        off += take;
        if (filled === frameBytes) {
          if (wanted.has(n)) got.set(n, Buffer.from(current));
          last = current;
          current = Buffer.alloc(frameBytes);
          filled = 0;
          n++;
          if (n > maxWanted) {
            done = true;
            proc.kill("SIGKILL");
            return;
          }
        }
      }
    });
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (!done && code !== 0) {
        return reject(new Error(`ffmpeg frame extract failed: ${stderr.slice(-500)}`));
      }
      for (const i of wanted) {
        if (!got.has(i) && last) got.set(i, Buffer.from(last));
      }
      if (got.size < wanted.size) return reject(new Error("ffmpeg frame extract returned no frames"));
      resolve(got);
    });
  });
}

/** Encode an rgb24 buffer to a JPEG or PNG still. */
export function encodeRgbImage(
  rgb: Buffer,
  width: number,
  height: number,
  dst: string,
  format: SheetFormat,
): Promise<void> {
  const codec = format === "png" ? ["-c:v", "png"] : ["-c:v", "mjpeg", "-pix_fmt", "yuvj444p", "-q:v", "3"];
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${width}x${height}`,
      "-i",
      "-",
      "-frames:v",
      "1",
      ...codec,
      "-n",
      dst,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg sheet encode failed: ${stderr.slice(-500)}`));
      else resolve();
    });
    proc.stdin.on("error", () => {
      /* surfaced by close */
    });
    proc.stdin.end(rgb);
  });
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

// ─── Transcript + metrics + structure ────────────────────────────────────────

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** Accept Caption[] / { captions } / { words: [{ text|word, start, end }] (seconds) }. */
export function normalizeTranscript(raw: unknown): TranscriptWord[] | null {
  const fromCaptions = (arr: unknown[]): TranscriptWord[] | null => {
    const words: TranscriptWord[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const text = typeof o.text === "string" ? o.text : typeof o.word === "string" ? o.word : null;
      if (text === null) return null;
      if (typeof o.startMs === "number" && typeof o.endMs === "number") {
        words.push({ text: text.trim(), startMs: Math.round(o.startMs), endMs: Math.round(o.endMs) });
      } else if (typeof o.start === "number" && typeof o.end === "number") {
        words.push({ text: text.trim(), startMs: Math.round(o.start * 1000), endMs: Math.round(o.end * 1000) });
      } else {
        return null;
      }
    }
    return words.filter((w) => w.text.length > 0);
  };
  if (Array.isArray(raw)) return fromCaptions(raw);
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.captions)) return fromCaptions(o.captions);
    if (Array.isArray(o.words)) return fromCaptions(o.words);
  }
  return null;
}

/** Transcript files that may sit next to a video (explicit flags win). */
export function transcriptCandidates(videoPath: string): string[] {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  const out = [path.join(dir, `${base}.transcript.json`), path.join(dir, `${base}.captions.json`)];
  if (base === "source") out.push(path.join(dir, "transcript.json"));
  return out;
}

const META_METRIC_KEYS = [
  "view_count",
  "like_count",
  "comment_count",
  "repost_count",
  "channel_follower_count",
  "upload_date",
  "uploader",
  "title",
  "webpage_url",
] as const;

/** Pull known metric fields from a yt-dlp `meta.info.json`. */
export function metricsFromYtDlpMeta(meta: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const k of META_METRIC_KEYS) {
    const v = meta[k];
    if (typeof v === "number" || typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const CTA_LEXICON = new Set([
  "follow", "subscribe", "link", "bio", "comment", "download", "signup", "sign", "join", "dm",
  "shop", "buy", "order", "book", "click", "tap", "visit", "waitlist", "register",
]);

/** First CTA-lexicon word in the last 40% of the transcript (heuristic). */
export function ctaCandidate(words: TranscriptWord[], durationSec: number): { t: number; word: string } | null {
  const from = durationSec * 0.6 * 1000;
  for (const w of words) {
    if (w.startMs < from) continue;
    const token = w.text.toLowerCase().replace(/[^a-z]/g, "");
    if (CTA_LEXICON.has(token)) return { t: round3(w.startMs / 1000), word: token };
  }
  return null;
}

// ─── Digest document ─────────────────────────────────────────────────────────

export const DIGEST_SCHEMA_VERSION = 1;
export const HOOK_WINDOW_SEC = 2;

export interface DigestSheet {
  index: number;
  file: string;
  width: number;
  height: number;
  tiles: number;
  visionTokens: number;
  frames: FrameMapEntry[];
}

export interface RefDigest {
  version: number;
  kind: "ralphy.ref-digest";
  createdAt: string;
  source: { input: string; path: string; url: string | null; sha256: string; bytes: number };
  video: { durationSec: number; fps: number; width: number; height: number; codec: string };
  sampling: {
    mode: DigestMode;
    everySec: number;
    maxFrames: number;
    frameCount: number;
    capped: boolean;
    droppedShots: number;
    decodeFps: number;
    fastMotion: number | null;
  };
  layout: {
    tilesPerSheet: number;
    cols: number;
    rows: number;
    tileWidth: number;
    tileHeight: number;
    labelHeight: number;
    fit: boolean;
    clamped: boolean;
    effectiveTileWidth: number;
    format: SheetFormat;
    visionBudget: VisionBudget;
  };
  scenes: {
    threshold: number;
    minSceneSec: number;
    cuts: number[];
    shots: Array<{ index: number; startSec: number; endSec: number; durationSec: number; motion: number }>;
  };
  structure: {
    hook: { windowSec: number; cuts: number[]; words: string | null };
    beats: number;
    ctaCandidate: { t: number; word: string; source: "transcript-lexicon" } | null;
  };
  sheets: DigestSheet[];
  transcript:
    | { status: "present"; source: string; wordCount: number; text: string; words: TranscriptWord[] }
    | { status: "skipped"; reason: string };
  metrics: Record<string, unknown> | null;
  cost: { visionTokens: number; sheets: number; buildMs: number; timingsMs: Record<string, number>; tokenRule: string };
}

export interface BuildDigestOptions {
  videoPath: string;
  /** Base bundle dir; the actual dir is versioned (`.v2`, …) when it exists. */
  bundleDir: string;
  /** The caller already allocated `bundleDir` via createVersionedDir (URL pulls land in it first). */
  preallocated?: boolean;
  /** Precomputed sha256 of the video (skips re-hashing). */
  sha256?: string;
  input: string;
  url?: string | null;
  mode?: DigestMode;
  everySec?: number;
  tilesPerSheet?: number;
  tileWidth?: number;
  fit?: boolean;
  maxSheets?: number;
  maxFrames?: number;
  cutThreshold?: number;
  fastMotion?: number;
  format?: SheetFormat;
  budget?: VisionBudget;
  transcript?: { words: TranscriptWord[]; source: string } | { skipped: string };
  metrics?: Record<string, unknown> | null;
  /** Injected clock for tests. */
  now?: () => Date;
}

export interface BuildDigestResult {
  bundleDir: string;
  digestPath: string;
  digest: RefDigest;
}

export function tokenRuleText(b: VisionBudget): string {
  return `downscale to long edge <= ${b.maxLongEdge}px and area <= ${b.maxPixels}px, then tokens = ceil(w*h/${b.pixelsPerToken})`;
}

export async function buildDigest(o: BuildDigestOptions): Promise<BuildDigestResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mode = o.mode ?? DIGEST_DEFAULTS.mode;
  const everySec = o.everySec ?? DIGEST_DEFAULTS.everySec;
  const tilesPerSheet = Math.max(1, Math.floor(o.tilesPerSheet ?? DIGEST_DEFAULTS.tilesPerSheet));
  const maxSheets = Math.max(1, Math.floor(o.maxSheets ?? DIGEST_DEFAULTS.maxSheets));
  const maxFrames = Math.max(1, Math.min(o.maxFrames ?? Infinity, tilesPerSheet * maxSheets));
  const cutThreshold = o.cutThreshold ?? DIGEST_DEFAULTS.cutThreshold;
  const fastMotion = o.fastMotion ?? DIGEST_DEFAULTS.fastMotion;
  const format = o.format ?? DIGEST_DEFAULTS.format;
  const budget = o.budget ?? CLAUDE_VISION_BUDGET;
  const fit = o.fit !== false;

  let lap = Date.now();
  const meta = probeVideo(o.videoPath);
  const bytes = statSync(o.videoPath).size;
  const sha256 = o.sha256 ?? (await sha256File(o.videoPath));
  timings.probe = Date.now() - lap;

  lap = Date.now();
  const profile = await sceneScoreProfile(o.videoPath);
  const scenes = scenesFromCuts(cutsFromProfile(profile, cutThreshold), meta.durationSec);
  const motion = shotMotion(profile, scenes);
  const shots: ShotSpan[] = scenes.map((s, i) => ({ startSec: s.startSec, endSec: s.endSec, motion: motion[i] }));
  timings.scenes = Date.now() - lap;

  const decodeFps = Math.max(1, Math.min(30, Math.round(meta.fps || 30)));
  const planned =
    mode === "fixed"
      ? { ...planFixedFrames(meta.durationSec, everySec, shots, maxFrames, decodeFps), droppedShots: 0 }
      : cutAdaptiveFrames({ shots, everySec, fastMotion, maxFrames, minGapSec: 1 / decodeFps });

  const aspect = meta.resolution.w > 0 ? meta.resolution.h / meta.resolution.w : 16 / 9;
  const layout = planSheetLayout({
    tiles: tilesPerSheet,
    aspect,
    tileWidth: o.tileWidth,
    fit,
    maxTileWidth: meta.resolution.w,
    budget,
  });
  const sheetPlans = buildFrameMap(planned.frames, tilesPerSheet, decodeFps, meta.durationSec);

  lap = Date.now();
  const frames = await extractRawFrames(
    o.videoPath,
    [...new Set(sheetPlans.flatMap((s) => s.frames.map((f) => f.frameIndex)))],
    { fps: decodeFps, width: layout.tileWidth, height: layout.tileHeight },
  );
  timings.frames = Date.now() - lap;

  lap = Date.now();
  const bundleDir = o.preallocated ? o.bundleDir : await createVersionedDir(o.bundleDir);
  if (o.preallocated) await fs.mkdir(bundleDir, { recursive: true });
  const sheets: DigestSheet[] = [];
  for (const plan of sheetPlans) {
    const composed = composeSheet(
      plan.frames.map((f) => ({ rgb: frames.get(f.frameIndex)!, label: formatTileLabel(f.t) })),
      layout,
    );
    const file = `sheet-${String(plan.index).padStart(2, "0")}.${format}`;
    await encodeRgbImage(composed.rgb, composed.width, composed.height, path.join(bundleDir, file), format);
    sheets.push({
      index: plan.index,
      file,
      width: composed.width,
      height: composed.height,
      tiles: plan.frames.length,
      visionTokens: visionImageCost(composed.width, composed.height, budget).tokens,
      frames: plan.frames,
    });
  }
  timings.compose = Date.now() - lap;

  const words = o.transcript && "words" in o.transcript ? o.transcript.words : null;
  const hookWords = words
    ? words.filter((w) => w.startMs < HOOK_WINDOW_SEC * 1000).map((w) => w.text).join(" ") || null
    : null;
  const cta = words ? ctaCandidate(words, meta.durationSec) : null;
  const cuts = scenes.slice(1).map((s) => s.startSec);

  const digest: RefDigest = {
    version: DIGEST_SCHEMA_VERSION,
    kind: "ralphy.ref-digest",
    createdAt: (o.now ? o.now() : new Date()).toISOString(),
    source: { input: o.input, path: o.videoPath, url: o.url ?? null, sha256, bytes },
    video: {
      durationSec: round3(meta.durationSec),
      fps: meta.fps,
      width: meta.resolution.w,
      height: meta.resolution.h,
      codec: meta.codec.video,
    },
    sampling: {
      mode,
      everySec,
      maxFrames,
      frameCount: planned.frames.length,
      capped: planned.capped,
      droppedShots: planned.droppedShots,
      decodeFps,
      fastMotion: mode === "cut-adaptive" ? fastMotion : null,
    },
    layout: {
      tilesPerSheet,
      cols: layout.cols,
      rows: layout.rows,
      tileWidth: layout.tileWidth,
      tileHeight: layout.tileHeight,
      labelHeight: layout.labelHeight,
      fit,
      clamped: layout.clamped,
      effectiveTileWidth: layout.effectiveTileWidth,
      format,
      visionBudget: budget,
    },
    scenes: {
      threshold: cutThreshold,
      minSceneSec: MIN_SCENE_SEC,
      cuts,
      shots: scenes.map((s, i) => ({
        index: s.index,
        startSec: s.startSec,
        endSec: s.endSec,
        durationSec: s.durationSec,
        motion: motion[i] ?? 0,
      })),
    },
    structure: {
      hook: { windowSec: HOOK_WINDOW_SEC, cuts: cuts.filter((c) => c < HOOK_WINDOW_SEC), words: hookWords },
      beats: scenes.length,
      ctaCandidate: cta ? { ...cta, source: "transcript-lexicon" } : null,
    },
    sheets,
    transcript: words
      ? {
          status: "present",
          source: (o.transcript as { source: string }).source,
          wordCount: words.length,
          text: words.map((w) => w.text).join(" "),
          words,
        }
      : { status: "skipped", reason: o.transcript && "skipped" in o.transcript ? o.transcript.skipped : "no transcript" },
    metrics: o.metrics ?? null,
    cost: {
      visionTokens: sheets.reduce((a, s) => a + s.visionTokens, 0),
      sheets: sheets.length,
      buildMs: 0,
      timingsMs: timings,
      tokenRule: tokenRuleText(budget),
    },
  };
  digest.cost.buildMs = Date.now() - t0;
  const digestPath = path.join(bundleDir, "digest.json");
  await fs.writeFile(digestPath, JSON.stringify(digest, null, 2) + "\n", { flag: "wx" });
  return { bundleDir, digestPath, digest };
}

/** Read a transcript file, normalized; null when unreadable or unrecognized. */
export function readTranscriptFile(file: string): TranscriptWord[] | null {
  try {
    return normalizeTranscript(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r - 1;
}
