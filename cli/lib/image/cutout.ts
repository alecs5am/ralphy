// Image post-processing primitives — chromakey, SVG rasterize, flood-fill
// cutout, and alpha-trim/fit. Issue #037.
//
// Recipes consolidated from three projects that each re-derived them:
//  - `ralphy-vs-higgsfield-001` (raw ffmpeg `colorkey=0x00b140` × 7 monsters)
//  - `ralphy-carousel-001`      (95-line Playwright helper for SVG → PNG)
//  - `free-air-vpn-stickerpack` (flood-fill keyer that preserved the die-cut outline)
//
// Hard rules:
//  - All functions are async and return the output path.
//  - All functions accept an optional `projectId` and log to
//    `workspace/projects/<id>/logs/generations.jsonl` via gen-log.ts. Provider
//    is `"ffmpeg"` for chromakey/fit, `"playwright"` for rasterize + flood-fill.
//  - cost_usd is 0 (all local).
//  - Output PNGs always preserve alpha; callers picking the right mode is on
//    them (chromakey for greenscreen, flood for sticker work, u2net for
//    salient-object — see hyperframes remove-background).

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { logGeneration } from "../gen-log.js";
import { hasMagick, runMagick } from "./magick.js";

export type ImagePostOptions = {
  projectId?: string;
  note?: string;
};

function ensureFfmpeg(): void {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error("ffmpeg not found in PATH (install via `brew install ffmpeg`)");
  }
}

async function runFfmpeg(
  args: string[],
  meta: { endpoint: string; input: Record<string, unknown>; opts?: ImagePostOptions },
): Promise<{ stderr: string; durationMs: number }> {
  ensureFfmpeg();
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", async (code) => {
      const durationMs = Date.now() - t0;
      if (meta.opts?.projectId) {
        await logGeneration(meta.opts.projectId, {
          provider: "ffmpeg",
          model: meta.endpoint,
          endpoint: meta.endpoint,
          kind: "image",
          input: { project: meta.opts.projectId, ...meta.input },
          status: code === 0 ? "ok" : "error",
          error: code === 0 ? undefined : stderr.slice(0, 500),
          latency_ms: durationMs,
          cost_usd: 0,
          note: meta.opts.note,
        });
      }
      if (code === 0) resolve({ stderr, durationMs });
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}

// ── Color parsing ───────────────────────────────────────────────────────────
// Accept `#00b140`, `0x00b140`, `00b140`. Returns the canonical 6-digit
// `0xRRGGBB` form ffmpeg/canvas expect.

export function normalizeHexColor(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("#")) s = s.slice(1);
  else if (s.startsWith("0x") || s.startsWith("0X")) s = s.slice(2);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`invalid hex color "${raw}" — expected 6 hex digits (#RRGGBB / 0xRRGGBB / RRGGBB)`);
  }
  return `0x${s.toLowerCase()}`;
}

// ── Chromakey ───────────────────────────────────────────────────────────────
// ffmpeg `colorkey` (single-color match with similarity + blend feather).
// `colorhold` despill pass desaturates remaining green halo around the key.

export type ChromakeyOptions = {
  src: string;
  dst: string;
  /** Hex color to key out (default 0x00b140 = greenscreen green) */
  color?: string;
  /** Similarity 0..1 (default 0.3). Higher = wider tolerance. */
  similarity?: number;
  /** Feather 0..1 (default 0.1). Soft edge blending. */
  feather?: number;
  /** Apply a despill pass via `colorhold` (default false). */
  despill?: boolean;
} & ImagePostOptions;

/**
 * Build the ffmpeg filter chain for chromakey. Exported for unit testing.
 * Always emits `format=yuva420p` first so the output has an alpha channel
 * (PNG output picks rgba from this automatically).
 */
export function buildChromakeyFilter(opts: {
  color?: string;
  similarity?: number;
  feather?: number;
  despill?: boolean;
}): string {
  const color = normalizeHexColor(opts.color ?? "0x00b140");
  const similarity = opts.similarity ?? 0.3;
  const feather = opts.feather ?? 0.1;
  const parts = [
    "format=rgba",
    `colorkey=color=${color}:similarity=${similarity}:blend=${feather}`,
  ];
  if (opts.despill) {
    // colorhold keeps the keyed colour as grey — kills the green halo on
    // anti-aliased edges. similarity is bumped slightly to bite the spill ring.
    const spillSim = Math.min(1, similarity + 0.1);
    parts.push(`colorhold=color=${color}:similarity=${spillSim}:blend=0`);
  }
  return parts.join(",");
}

export async function chromakey(input: ChromakeyOptions): Promise<string> {
  const { src, dst, color, similarity, feather, despill, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const filter = buildChromakeyFilter({ color, similarity, feather, despill });
  await runFfmpeg(
    ["-i", src, "-vf", filter, "-frames:v", "1", dst],
    {
      endpoint: "ffmpeg/chromakey",
      input: { src, dst, color: color ?? "0x00b140", similarity: similarity ?? 0.3, feather: feather ?? 0.1, despill: Boolean(despill) },
      opts,
    },
  );
  return dst;
}

// ── SVG rasterize (Playwright) ──────────────────────────────────────────────
// Renders a .svg file in headless Chromium at the requested long-edge size.
// Aspect ratio is preserved; the viewport matches the SVG bbox so the output
// is crisp and tight (no whitespace padding).

export type RasterizeSvgOptions = {
  src: string;
  dst: string;
  /** Long-edge size in pixels (default 1024). */
  size?: number;
  /** Optional background hex (e.g. "#ffffff"). Default: transparent. */
  bg?: string;
} & ImagePostOptions;

export async function rasterizeSvg(input: RasterizeSvgOptions): Promise<string> {
  const { src, dst, size = 1024, bg, ...opts } = input;
  const t0 = Date.now();
  await fs.mkdir(path.dirname(dst), { recursive: true });

  const svgText = await fs.readFile(src, "utf-8");

  // Parse intrinsic aspect ratio so the output is tight (no transparent
  // padding around the rendered SVG). Priority order:
  //   1. viewBox `x y w h` — most reliable.
  //   2. width + height attrs — usable when both have unit-less px values.
  //   3. fallback to 1:1 square.
  const ratio = parseSvgAspectRatio(svgText) ?? 1;
  const targetW = ratio >= 1 ? size : Math.max(1, Math.round(size * ratio));
  const targetH = ratio >= 1 ? Math.max(1, Math.round(size / ratio)) : size;

  // Dynamically import playwright so test environments without it can stub
  // earlier helpers (chromakey filter assertions, etc.) without erroring out
  // on module load.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: targetW, height: targetH },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    // Wrap the SVG in a minimal HTML doc that scales it to fill the viewport.
    // We strip the SVG's own width/height attrs so CSS sizing wins — otherwise
    // an SVG that declared `width="200"` renders at 200 regardless of
    // viewport size.
    const bgCss = bg ? normalizeHexColorForCss(bg) : "transparent";
    const scaledSvg = svgText.replace(
      /<svg\b([^>]*)>/i,
      (_m, attrs: string) =>
        `<svg${attrs.replace(/\s+(?:width|height)\s*=\s*"[^"]*"/gi, "")} preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">`,
    );
    const html = `<!doctype html><html><head><style>
      html,body { margin: 0; padding: 0; background: ${bgCss}; width: 100%; height: 100%; }
    </style></head><body>${scaledSvg}</body></html>`;
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({
      path: dst,
      fullPage: false,
      omitBackground: !bg,
      type: "png",
    });
  } finally {
    await browser.close();
  }
  if (opts.projectId) {
    await logGeneration(opts.projectId, {
      provider: "playwright",
      model: "playwright/rasterize-svg",
      endpoint: "playwright/rasterize-svg",
      kind: "image",
      input: { project: opts.projectId, src, dst, size, bg: bg ?? null },
      output: { local: dst },
      status: "ok",
      latency_ms: Date.now() - t0,
      cost_usd: 0,
      note: opts.note,
    });
  }
  return dst;
}

/**
 * Parse an SVG's intrinsic aspect ratio (width / height). Tries viewBox
 * first, falls back to the width + height attrs when both are numeric.
 * Returns `null` if neither can be parsed (caller falls back to 1:1).
 *
 * Exported for testing.
 */
export function parseSvgAspectRatio(svgText: string): number | null {
  // Prefer viewBox — robust against unit-bearing width/height attrs.
  const vb = svgText.match(/<svg\b[^>]*\bviewBox\s*=\s*"([^"]+)"/i);
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[3] > 0) {
      return parts[2] / parts[3];
    }
  }
  // Fallback: width + height attrs, unitless.
  const w = svgText.match(/<svg\b[^>]*\bwidth\s*=\s*"([0-9.]+)(?:px)?"/i);
  const h = svgText.match(/<svg\b[^>]*\bheight\s*=\s*"([0-9.]+)(?:px)?"/i);
  if (w && h) {
    const wn = Number(w[1]);
    const hn = Number(h[1]);
    if (Number.isFinite(wn) && Number.isFinite(hn) && hn > 0) return wn / hn;
  }
  return null;
}

function normalizeHexColorForCss(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) s = `#${s.slice(2)}`;
  else if (!s.startsWith("#")) s = `#${s}`;
  return s;
}

// ── Flood-fill cutout (Playwright canvas) ───────────────────────────────────
// The "Pure look" sticker recipe: flood-fill from the four corners (or a
// single colour sample) and key out only the connected background — preserves
// interior white islands (eyes, holes in a die-cut sticker) that u2net would
// cut off.
//
// Implementation: load the source into a headless Canvas2D, walk the pixel
// grid with a BFS connectivity flood-fill seeded from the four corners,
// setting alpha = 0 where the colour distance from the seed sample is within
// the tolerance.

export type FloodCutoutOptions = {
  src: string;
  dst: string;
  /** Optional explicit seed colour. If absent, samples the top-left pixel. */
  color?: string;
  /** Colour-distance tolerance 0..255 (default 24). */
  tolerance?: number;
} & ImagePostOptions;

export async function floodFillCutout(input: FloodCutoutOptions): Promise<string> {
  const { src, dst, color, tolerance = 24, ...opts } = input;
  const t0 = Date.now();
  await fs.mkdir(path.dirname(dst), { recursive: true });

  // Read the source as base64 and feed it to the page as a data URL —
  // file:// from an about:blank page is blocked by the renderer's same-
  // origin policy, but data: URLs always succeed.
  const srcBuf = await fs.readFile(src);
  const ext = path.extname(src).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  const inputDataUrl = `data:${mime};base64,${srcBuf.toString("base64")}`;

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 16, height: 16 } });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><body></body></html>`);
    const seedHex = color ? normalizeHexColor(color) : null;

    const dataUrl = (await page.evaluate(
      async ({ inputDataUrl, seedHex, tolerance }) => {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("image load failed"));
          img.src = inputDataUrl;
        });
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const c2d = canvas.getContext("2d")!;
        c2d.drawImage(img, 0, 0);
        const idata = c2d.getImageData(0, 0, w, h);
        const px = idata.data;

        // Seed colour: explicit (parse hex) or sample top-left pixel.
        let seedR: number, seedG: number, seedB: number;
        if (seedHex) {
          const hex = seedHex.slice(2); // "0xRRGGBB" → "RRGGBB"
          seedR = parseInt(hex.slice(0, 2), 16);
          seedG = parseInt(hex.slice(2, 4), 16);
          seedB = parseInt(hex.slice(4, 6), 16);
        } else {
          seedR = px[0];
          seedG = px[1];
          seedB = px[2];
        }

        function withinTol(r: number, g: number, b: number): boolean {
          // Chebyshev distance — cheap and good enough for flat sticker bg.
          return (
            Math.abs(r - seedR) <= tolerance &&
            Math.abs(g - seedG) <= tolerance &&
            Math.abs(b - seedB) <= tolerance
          );
        }

        // BFS flood-fill from all four corners, 4-connected. Stack stored as
        // flat (x,y) pairs in a Uint32Array index list to avoid GC churn.
        const visited = new Uint8Array(w * h);
        const queue: number[] = [];
        const corners = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
        ];
        for (const [cx, cy] of corners) {
          const ci = cy * w + cx;
          const r = px[ci * 4],
            g = px[ci * 4 + 1],
            b = px[ci * 4 + 2];
          if (withinTol(r, g, b) && !visited[ci]) {
            visited[ci] = 1;
            queue.push(ci);
          }
        }
        while (queue.length) {
          const idx = queue.pop()!;
          const x = idx % w;
          const y = (idx - x) / w;
          // Clear alpha.
          px[idx * 4 + 3] = 0;
          // 4-neighbours.
          if (x > 0) {
            const n = idx - 1;
            if (!visited[n]) {
              const r = px[n * 4], g = px[n * 4 + 1], b = px[n * 4 + 2];
              if (withinTol(r, g, b)) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
          if (x < w - 1) {
            const n = idx + 1;
            if (!visited[n]) {
              const r = px[n * 4], g = px[n * 4 + 1], b = px[n * 4 + 2];
              if (withinTol(r, g, b)) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
          if (y > 0) {
            const n = idx - w;
            if (!visited[n]) {
              const r = px[n * 4], g = px[n * 4 + 1], b = px[n * 4 + 2];
              if (withinTol(r, g, b)) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
          if (y < h - 1) {
            const n = idx + w;
            if (!visited[n]) {
              const r = px[n * 4], g = px[n * 4 + 1], b = px[n * 4 + 2];
              if (withinTol(r, g, b)) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
        }
        c2d.putImageData(idata, 0, 0);
        return canvas.toDataURL("image/png");
      },
      { inputDataUrl, seedHex, tolerance },
    )) as string;

    const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(dst, Buffer.from(b64, "base64"));
  } finally {
    await browser.close();
  }

  if (opts.projectId) {
    await logGeneration(opts.projectId, {
      provider: "playwright",
      model: "playwright/flood-fill-cutout",
      endpoint: "playwright/flood-fill-cutout",
      kind: "image",
      input: { project: opts.projectId, src, dst, color: color ?? null, tolerance },
      output: { local: dst },
      status: "ok",
      latency_ms: Date.now() - t0,
      cost_usd: 0,
      note: opts.note,
    });
  }
  return dst;
}

// ── Image fit (alpha-trim + scale) ──────────────────────────────────────────
// `--trim-alpha` removes transparent margins. Preferred path (#102): when
// ImageMagick is installed, trim + scale run as ONE native invocation
// (`-fuzz N% -trim +repage -resize LxL`) — `-trim` is the canonical tool for
// finding a still's transparent margin. Fallback: ffmpeg `cropdetect` with an
// alpha-aware threshold (a video-letterbox hack, kept as the no-IM path).
// `--long N` scales the long edge to N preserving aspect. `--telegram` is
// shorthand for `--trim-alpha --long 512` + PNG output (Telegram sticker
// spec: 512×512 max, transparent PNG, ≤512KB).

export type FitImageOptions = {
  src: string;
  dst: string;
  /** Long-edge target in pixels. Required unless `telegram` is set. */
  long?: number;
  /** Trim transparent margins before scaling (default false). */
  trimAlpha?: boolean;
  /** Telegram sticker preset: trimAlpha=true, long=512, type=png. */
  telegram?: boolean;
} & ImagePostOptions;

/** Default `-fuzz` percentage for the ImageMagick trim — absorbs near-
 * transparent anti-aliased edge pixels so the box isn't left 1px loose. */
const MAGICK_TRIM_FUZZ_PERCENT = 2;

/**
 * Build the ImageMagick arg array for the trim + scale fit (#102). Exported
 * for unit testing (same pattern as `buildChromakeyFilter`).
 *
 * `-resize <long>x<long>` is fit-inside preserving aspect — the longer axis
 * lands on `long`, replicating the ffmpeg `if(gt(iw,ih),long,-1)` long-edge
 * semantics. PNG output preserves alpha natively, no extra flag needed.
 */
export function buildMagickFitArgs(opts: {
  src: string;
  dst: string;
  /** Long-edge target. Omitted → trim only, no resize. */
  long?: number;
  /** Trim transparent margins (default false). */
  trimAlpha?: boolean;
  /** Fuzz percentage for the trim (default 2). */
  fuzz?: number;
}): string[] {
  const args = [opts.src];
  if (opts.trimAlpha) {
    args.push("-fuzz", `${opts.fuzz ?? MAGICK_TRIM_FUZZ_PERCENT}%`, "-trim", "+repage");
  }
  if (opts.long && opts.long > 0) {
    args.push("-resize", `${opts.long}x${opts.long}`);
  }
  args.push(opts.dst);
  return args;
}

export async function fitImage(input: FitImageOptions): Promise<string> {
  const { src, dst, telegram, ...rest } = input;
  const long = telegram ? 512 : rest.long;
  const trimAlpha = telegram ? true : Boolean(rest.trimAlpha);
  if (!long || long <= 0) {
    throw new Error("fitImage: --long <N> is required (or pass --telegram for the 512 preset)");
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });

  // Preferred path (#102): trim requested + ImageMagick present → native
  // `-trim` does the alpha bbox correctly in one invocation, no stderr-regex
  // probe. Plain scale (no trim) stays on ffmpeg either way.
  if (trimAlpha && hasMagick()) {
    await runMagick(
      buildMagickFitArgs({ src, dst, long, trimAlpha }),
      {
        endpoint: "imagemagick/fit",
        input: { src, dst, long, trimAlpha, telegram: Boolean(telegram) },
        opts: { projectId: input.projectId, note: input.note },
      },
    );
    return dst;
  }

  // Fallback: two-pass ffmpeg when trimAlpha is on:
  //   1) `cropdetect` on the alpha plane to find the tight bbox.
  //   2) `crop=W:H:X:Y,scale=…` for the final emit.
  // When trimAlpha is off, just scale.
  let cropFilter: string | undefined;
  if (trimAlpha) {
    cropFilter = await detectAlphaBbox(src);
  }
  // Scale long edge to `long` preserving aspect; the conditional picks the
  // bigger axis at runtime via ffmpeg expression syntax.
  const scaleFilter = `scale='if(gt(iw,ih),${long},-1)':'if(gt(iw,ih),-1,${long})':flags=lanczos`;
  const vf = [cropFilter, scaleFilter].filter(Boolean).join(",");

  await runFfmpeg(
    ["-i", src, "-vf", vf, "-frames:v", "1", dst],
    {
      endpoint: "ffmpeg/fit-image",
      input: { src, dst, long, trimAlpha, telegram: Boolean(telegram) },
      opts: { projectId: input.projectId, note: input.note },
    },
  );
  return dst;
}

/**
 * Probe the alpha bbox of a PNG with ffmpeg's `alphaextract` + `cropdetect`.
 * Returns the matching `crop=W:H:X:Y` filter, or `undefined` when the image
 * has no alpha (fall back to no-op).
 */
async function detectAlphaBbox(src: string): Promise<string | undefined> {
  ensureFfmpeg();
  return new Promise((resolve) => {
    // alphaextract → 1-channel grey of the alpha; cropdetect=24:2 reads tight
    // bbox. ffmpeg prints `crop=W:H:X:Y` to stderr.
    const proc = spawn("ffmpeg", [
      "-loglevel", "info",
      "-i", src,
      "-vf", "alphaextract,cropdetect=24:2:0",
      "-frames:v", "1",
      "-f", "null", "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => {
      const m = stderr.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
      if (!m) return resolve(undefined);
      resolve(`crop=${m[1]}:${m[2]}:${m[3]}:${m[4]}`);
    });
    proc.on("error", () => resolve(undefined));
  });
}

// ── PS1 crunch (authentic low-fi downsample) ────────────────────────────────
// Kills the "clean / cartoonish" feel of a modern render and forces a genuine
// PlayStation-1 screenshot look. Three stages, all in one ffmpeg pass:
//   1) bilinear downscale by `scale` (default 4×) → throws away polygon &
//      texture detail, the source of the "too high-poly" complaint.
//   2) `format=rgb565` → crushes to a 16-bit framebuffer (the PS1 used 15/16-bit
//      colour), producing the characteristic colour banding.
//   3) nearest-neighbour upscale back to the original dimensions → big crunchy
//      aliased pixels instead of smooth interpolation.
// Optional `noise` adds static grain for extra VHS bite.

export type Ps1CrunchOptions = {
  src: string;
  dst: string;
  /** Downscale factor for the internal render resolution (default 4). Higher = harsher. */
  scale?: number;
  /** Add static film grain (0..100, default 0 = off). */
  noise?: number;
} & ImagePostOptions;

/** Probe a still's pixel dimensions via ffprobe. Returns [w, h]. */
function probeDimensions(src: string): [number, number] {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", src],
    { encoding: "utf-8" },
  );
  const m = (r.stdout ?? "").trim().match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`could not probe dimensions of "${src}"`);
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/** Build the PS1-crunch filter chain. Exported for unit testing. */
export function buildPs1CrunchFilter(opts: { w: number; h: number; scale?: number; noise?: number }): string {
  const scale = Math.max(2, opts.scale ?? 4);
  const lowW = Math.max(2, Math.round(opts.w / scale));
  const lowH = Math.max(2, Math.round(opts.h / scale));
  const parts = [
    `scale=${lowW}:${lowH}:flags=bilinear`,
    "format=rgb565",
    "format=rgb24",
    `scale=${opts.w}:${opts.h}:flags=neighbor`,
  ];
  if (opts.noise && opts.noise > 0) {
    parts.push(`noise=alls=${Math.round(opts.noise)}:allf=t`);
  }
  return parts.join(",");
}

export async function ps1Crunch(input: Ps1CrunchOptions): Promise<string> {
  const { src, dst, scale, noise, ...opts } = input;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const [w, h] = probeDimensions(src);
  const filter = buildPs1CrunchFilter({ w, h, scale, noise });
  await runFfmpeg(
    ["-i", src, "-vf", filter, "-frames:v", "1", dst],
    {
      endpoint: "ffmpeg/ps1-crunch",
      input: { src, dst, scale: scale ?? 4, noise: noise ?? 0, w, h },
      opts,
    },
  );
  return dst;
}

// ── SVG passthrough for `--ref` ─────────────────────────────────────────────
// Used by the generate-image path (and any other --ref consumer) to coerce a
// .svg ref into a PNG on the fly. Cached under
// `workspace/.ralph/svg-cache/<basename>-<size>.png` so the same logo isn't
// re-rasterized on every gen.

import { root } from "../paths.js";

export function isSvgPath(p: string): boolean {
  return p.toLowerCase().endsWith(".svg");
}

export async function ensureSvgRasterized(svgPath: string, size = 1024): Promise<string> {
  const abs = path.resolve(svgPath);
  const cacheDir = path.join(root(), "workspace", ".ralph", "svg-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  const key = `${path.basename(abs, ".svg")}-${size}.png`;
  const out = path.join(cacheDir, key);
  try {
    const [s, d] = await Promise.all([fs.stat(abs), fs.stat(out)]);
    // Cache hit only if PNG is newer than SVG.
    if (d.mtimeMs >= s.mtimeMs) return out;
  } catch { /* cache miss */ }
  await rasterizeSvg({ src: abs, dst: out, size });
  return out;
}
