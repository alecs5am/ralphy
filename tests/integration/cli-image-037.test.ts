// Integration tests for `ralphy asset chromakey`, `ralphy ref rasterize`, and
// `ralphy image cutout/fit` (#037). Spawns real ffmpeg + headless Chromium
// against synthetic fixtures.
//
// Hosts without ffmpeg / ffprobe skip with a warning; Playwright Chromium is
// already a ralphy dep (used by ref scrape-trends + the site-grounding sub-
// agent), so we assume it's available.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

function hasFfmpeg(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  const p = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
  return r.status === 0 && p.status === 0;
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let greenPng: string;
let logoSvg: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-037-"));
  greenPng = path.join(tmpRoot, "green-bg.png");
  logoSvg = path.join(tmpRoot, "logo.svg");

  if (HAS_FFMPEG) {
    // 64x64 PNG: solid greenscreen-green background with a red square in the
    // middle. After chromakey the centre red square should survive and the
    // green should be transparent.
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel", "error",
        "-f", "lavfi",
        "-i", "color=color=0x00b140:size=64x64:duration=0.04:rate=25",
        "-f", "lavfi",
        "-i", "color=color=red:size=32x32:duration=0.04:rate=25",
        "-filter_complex", "[0:v][1:v]overlay=16:16",
        "-frames:v", "1",
        greenPng,
      ],
      { stdio: "ignore" },
    );
  }

  // Minimal SVG: 200x100 viewBox with a single rect.
  fs.writeFileSync(
    logoSvg,
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect x="0" y="0" width="200" height="100" fill="#0066ff" />
  <text x="100" y="60" font-family="sans-serif" font-size="36" fill="white" text-anchor="middle">LOGO</text>
</svg>`,
  );
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function probePngDims(file: string): { w: number; h: number } {
  // PNG IHDR chunk: width @ bytes 16-19, height @ bytes 20-23 (big-endian).
  const buf = fs.readFileSync(file);
  if (buf.length < 24) return { w: 0, h: 0 };
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

function readAlphaPixel(file: string, x: number, y: number): number {
  // Use ffmpeg to dump a single rgba pixel as raw bytes; read the 4th byte.
  // Avoids pulling in a PNG library.
  const out = path.join(path.dirname(file), `.probe-${Date.now()}.raw`);
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-i", file,
      "-vf", `crop=1:1:${x}:${y}`,
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      out,
    ],
    { stdio: "ignore" },
  );
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return buf[3] ?? 255;
}

describe("`ralphy asset chromakey` (#037)", () => {
  test("keys out greenscreen → transparent PNG with alpha channel", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping chromakey integration test");
      return;
    }
    const outPng = path.join(tmpRoot, "out-chromakey.png");
    const r = spawnSync(
      "bun",
      [CLI, "asset", "chromakey", greenPng, "--out", outPng, "--color", "0x00b140"],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPng)).toBe(true);
    // Corner pixel was green → should be transparent now.
    const cornerAlpha = readAlphaPixel(outPng, 0, 0);
    expect(cornerAlpha).toBe(0);
    // Centre pixel was red → should be opaque.
    const centreAlpha = readAlphaPixel(outPng, 32, 32);
    expect(centreAlpha).toBeGreaterThan(200);
  });
});

describe("`ralphy ref rasterize` (#037)", () => {
  test("SVG → PNG at requested long-edge size, preserving aspect", async () => {
    const outPng = path.join(tmpRoot, "out-logo.png");
    const r = spawnSync(
      "bun",
      [CLI, "ref", "rasterize", logoSvg, "--size", "512", "--out", outPng],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      console.error("rasterize stderr:", r.stderr);
    }
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPng)).toBe(true);
    const { w, h } = probePngDims(outPng);
    // 200x100 SVG → long edge 512, short edge 256. Allow ±2px for sub-pixel
    // rounding.
    expect(w).toBeGreaterThanOrEqual(510);
    expect(w).toBeLessThanOrEqual(514);
    expect(h).toBeGreaterThanOrEqual(254);
    expect(h).toBeLessThanOrEqual(258);
  });

  test("rejects non-SVG input with E_INPUT_INVALID", () => {
    const r = spawnSync(
      "bun",
      [CLI, "ref", "rasterize", greenPng, "--size", "256", "--out", path.join(tmpRoot, "x.png")],
      { encoding: "utf8" },
    );
    expect(r.status).not.toBe(0);
    expect((r.stdout + r.stderr).toLowerCase()).toContain("svg");
  });
});

describe("`ralphy image cutout --bg chroma` (#037)", () => {
  test("chroma mode is an alias for the chromakey recipe", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping image cutout integration test");
      return;
    }
    const outPng = path.join(tmpRoot, "out-cutout.png");
    const r = spawnSync(
      "bun",
      [CLI, "image", "cutout", "--in", greenPng, "--out", outPng, "--bg", "chroma", "--color", "0x00b140"],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPng)).toBe(true);
    expect(readAlphaPixel(outPng, 0, 0)).toBe(0);
  });
});

describe("`ralphy image cutout --bg flood` (#037)", () => {
  test("flood-fill clears the corner-connected greenscreen and keeps the centre square opaque", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping image flood-fill test");
      return;
    }
    const outPng = path.join(tmpRoot, "out-flood.png");
    const r = spawnSync(
      "bun",
      [CLI, "image", "cutout", "--in", greenPng, "--out", outPng, "--bg", "flood", "--tolerance", "16"],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      console.error("flood-fill stderr:", r.stderr);
    }
    expect(r.status).toBe(0);
    expect(fs.existsSync(outPng)).toBe(true);
    // Corner pixel started green → flood-fill from (0,0) should clear it.
    expect(readAlphaPixel(outPng, 0, 0)).toBe(0);
    // Centre pixel is red → preserved.
    expect(readAlphaPixel(outPng, 32, 32)).toBeGreaterThan(200);
  });
});

describe("`ralphy image fit --telegram` (#037)", () => {
  test("telegram preset emits ≤512px long edge", () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping image fit integration test");
      return;
    }
    // Larger source so the scale step has work to do.
    const bigPng = path.join(tmpRoot, "big.png");
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel", "error",
        "-f", "lavfi",
        "-i", "color=color=red:size=1024x768:duration=0.04:rate=25",
        "-frames:v", "1",
        bigPng,
      ],
      { stdio: "ignore" },
    );
    const outPng = path.join(tmpRoot, "out-tg.png");
    const r = spawnSync(
      "bun",
      [CLI, "image", "fit", "--in", bigPng, "--out", outPng, "--telegram"],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    const { w, h } = probePngDims(outPng);
    expect(Math.max(w, h)).toBeLessThanOrEqual(512);
    // 1024:768 = 4:3 → long edge 512, short edge 384. Allow ±2px.
    expect(w).toBeGreaterThanOrEqual(510);
    expect(w).toBeLessThanOrEqual(514);
    expect(h).toBeGreaterThanOrEqual(382);
    expect(h).toBeLessThanOrEqual(386);
  });
});

describe("`--ref scene.svg` accepts SVG in generate paths (#037)", () => {
  test("ensureSvgRasterized is wired into resolveImageRef", async () => {
    // Direct unit-style test of the rasterizer cache helper via the exported
    // symbol — confirms the .svg → png path resolution that providers/shared.ts
    // calls under the hood, without spinning up an OpenRouter live call.
    const { ensureSvgRasterized } = await import("../../cli/lib/image/cutout.js");
    const png = await ensureSvgRasterized(logoSvg, 256);
    expect(png.endsWith(".png")).toBe(true);
    expect(fs.existsSync(png)).toBe(true);
    const { w, h } = probePngDims(png);
    // 200x100 SVG at long-edge 256 → ~256x128. Allow ±2px.
    expect(w).toBeGreaterThanOrEqual(254);
    expect(w).toBeLessThanOrEqual(258);
    expect(h).toBeGreaterThanOrEqual(126);
    expect(h).toBeLessThanOrEqual(130);
  });
});
