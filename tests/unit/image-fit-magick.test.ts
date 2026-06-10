// Issue #102: `image fit` alpha-trim via ImageMagick `-trim` over the ffmpeg
// cropdetect hack.
//
// Tests cover:
// - buildMagickFitArgs() emits the canonical `<in> -fuzz N% -trim +repage
//   -resize LxL <out>` shape (pure helper, same pattern as
//   buildChromakeyFilter).
// - fitImage() takes the ImageMagick path when the runner is stubbed-present
//   (arg-recording stub script via __setMagickBinaryForTest) and logs
//   `provider: "imagemagick"` / `endpoint: "imagemagick/fit"`.
// - fitImage() falls back to the existing ffmpeg detectAlphaBbox + scale path
//   when stubbed-absent (null) — asserted via the gen-log provider and real
//   wide/tall transparent-margin PNG fixtures (long edge correct, telegram
//   preset ≤512 PNG, alpha preserved).
//
// NOTE on the fallback fixtures: ffmpeg ≥5 `cropdetect` has `skip` default 2
// (initial frames skipped), so on a single still it emits no crop box and
// detectAlphaBbox silently no-ops — the exact fragility issue #102 documents.
// The fallback tests therefore assert the as-is (scale-only) contract; tight
// trimming is the IM path's job, covered by the arg-array tests above.
//
// ImageMagick is NOT assumed installed — the IM path is exercised purely
// through the stub script; the real-fixture tests run the ffmpeg fallback.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { fitImage, buildMagickFitArgs } from "../../cli/lib/image/cutout.js";
import { __setMagickBinaryForTest } from "../../cli/lib/image/magick.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { setRoot } from "../../cli/lib/paths.js";

const PROJECT_ID = "fit-magick-test-001";

function hasFfmpeg(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let origRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-fit-magick-"));
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", PROJECT_ID, "logs"), {
    recursive: true,
  });
  origRoot = process.cwd();
  setRoot(tmpRoot);
});

afterEach(() => {
  setRoot(origRoot);
  __setMagickBinaryForTest(undefined);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

/**
 * Write an executable stub that records its args (one per line) to
 * `<tmpRoot>/magick-args.txt`, touches its last arg (the output file) so the
 * caller sees a file appear, and exits 0. Returns the stub path.
 */
function writeArgRecordingStub(): string {
  const argsFile = path.join(tmpRoot, "magick-args.txt");
  const p = path.join(tmpRoot, "magick-stub.sh");
  fs.writeFileSync(
    p,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\nfor last in "$@"; do :; done\ntouch "$last"\nexit 0\n`,
  );
  fs.chmodSync(p, 0o755);
  return p;
}

function recordedArgs(): string[] {
  const argsFile = path.join(tmpRoot, "magick-args.txt");
  return fs.readFileSync(argsFile, "utf-8").trimEnd().split("\n");
}

/** PNG IHDR dims: width @ bytes 16-19, height @ bytes 20-23 (big-endian). */
function probePngDims(file: string): { w: number; h: number } {
  const buf = fs.readFileSync(file);
  if (buf.length < 24) return { w: 0, h: 0 };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Dump one rgba pixel via ffmpeg and return its alpha byte. */
function readAlphaPixel(file: string, x: number, y: number): number {
  const out = path.join(path.dirname(file), `.probe-${Date.now()}.raw`);
  spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", file, "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgba", out],
    { stdio: "ignore" },
  );
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return buf[3] ?? 255;
}

/**
 * Build a canvas-sized transparent PNG with an opaque red rect of
 * `rectW`x`rectH` centred in it — a synthetic sticker with transparent
 * margins for the trim to find.
 */
function writeTransparentMarginPng(file: string, canvasW: number, canvasH: number, rectW: number, rectH: number): void {
  const x = Math.round((canvasW - rectW) / 2);
  const y = Math.round((canvasH - rectH) / 2);
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", `color=c=black@0.0:s=${canvasW}x${canvasH}:d=0.04:r=25,format=rgba`,
      "-f", "lavfi",
      "-i", `color=c=red:s=${rectW}x${rectH}:d=0.04:r=25`,
      "-filter_complex", `[0:v][1:v]overlay=${x}:${y},format=rgba`,
      "-frames:v", "1",
      file,
    ],
    { stdio: "ignore" },
  );
}

describe("buildMagickFitArgs (#102)", () => {
  test("trim + resize emits the canonical one-invocation shape", () => {
    expect(
      buildMagickFitArgs({ src: "in.png", dst: "out.png", long: 512, trimAlpha: true }),
    ).toEqual(["in.png", "-fuzz", "2%", "-trim", "+repage", "-resize", "512x512", "out.png"]);
  });

  test("custom fuzz percentage is honored", () => {
    const args = buildMagickFitArgs({ src: "a.png", dst: "b.png", long: 256, trimAlpha: true, fuzz: 5 });
    expect(args).toContain("-fuzz");
    expect(args[args.indexOf("-fuzz") + 1]).toBe("5%");
  });

  test("no trim → no -fuzz / -trim / +repage, just resize", () => {
    expect(
      buildMagickFitArgs({ src: "in.png", dst: "out.png", long: 1024 }),
    ).toEqual(["in.png", "-resize", "1024x1024", "out.png"]);
  });

  test("no long → trim only, no -resize", () => {
    expect(
      buildMagickFitArgs({ src: "in.png", dst: "out.png", trimAlpha: true }),
    ).toEqual(["in.png", "-fuzz", "2%", "-trim", "+repage", "out.png"]);
  });
});

describe("fitImage ImageMagick path (stubbed-present, #102)", () => {
  test("trim-alpha + magick present → IM invocation with -fuzz/-trim/+repage/-resize and provider=imagemagick gen-log", async () => {
    __setMagickBinaryForTest(writeArgRecordingStub());

    const src = path.join(tmpRoot, "in.png");
    fs.writeFileSync(src, ""); // content irrelevant — the stub never reads it
    const dst = path.join(tmpRoot, "out.png");
    await fitImage({ src, dst, long: 300, trimAlpha: true, projectId: PROJECT_ID });

    const args = recordedArgs();
    expect(args[0]).toBe(src);
    expect(args).toContain("-fuzz");
    expect(args).toContain("-trim");
    expect(args).toContain("+repage");
    expect(args[args.indexOf("-resize") + 1]).toBe("300x300");
    expect(args[args.length - 1]).toBe(dst);

    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe("imagemagick");
    expect(rows[0].endpoint).toBe("imagemagick/fit");
    expect(rows[0].status).toBe("ok");
    expect(rows[0].cost_usd).toBe(0);
    expect(rows[0].input.src).toBe(src);
    expect(rows[0].input.long).toBe(300);
    expect(rows[0].input.trimAlpha).toBe(true);
  });

  test("--telegram preset routes through IM with -resize 512x512", async () => {
    __setMagickBinaryForTest(writeArgRecordingStub());

    const src = path.join(tmpRoot, "in.png");
    fs.writeFileSync(src, "");
    const dst = path.join(tmpRoot, "out.png");
    await fitImage({ src, dst, telegram: true, projectId: PROJECT_ID });

    const args = recordedArgs();
    expect(args).toContain("-trim");
    expect(args).toContain("+repage");
    expect(args[args.indexOf("-resize") + 1]).toBe("512x512");

    const rows = await readGenerations(PROJECT_ID);
    expect(rows[0].provider).toBe("imagemagick");
    expect(rows[0].input.telegram).toBe(true);
  });

  test("scale-only (no trim) stays on ffmpeg even when magick is present", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping scale-only fallback test");
      return;
    }
    __setMagickBinaryForTest(writeArgRecordingStub());

    const src = path.join(tmpRoot, "plain.png");
    writeTransparentMarginPng(src, 256, 128, 256, 128); // fully opaque
    const dst = path.join(tmpRoot, "plain-out.png");
    await fitImage({ src, dst, long: 64, projectId: PROJECT_ID });

    // The stub was never invoked …
    expect(fs.existsSync(path.join(tmpRoot, "magick-args.txt"))).toBe(false);
    // … and the gen-log shows the ffmpeg path.
    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe("ffmpeg");
    expect(rows[0].endpoint).toBe("ffmpeg/fit-image");
    expect(probePngDims(dst).w).toBe(64);
  });
});

describe("fitImage ffmpeg fallback (stubbed-absent, #102)", () => {
  test("wide fixture: ffmpeg path runs, long edge lands on width, alpha preserved", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping ffmpeg fallback test");
      return;
    }
    __setMagickBinaryForTest(null);

    // 512x256 transparent canvas, 128x64 opaque rect (wide) in the middle.
    const src = path.join(tmpRoot, "wide.png");
    writeTransparentMarginPng(src, 512, 256, 128, 64);
    const dst = path.join(tmpRoot, "wide-out.png");
    await fitImage({ src, dst, long: 200, trimAlpha: true, projectId: PROJECT_ID });

    const { w, h } = probePngDims(dst);
    // Long edge → 200 on the wider axis (cropdetect no-ops on a single still,
    // so the 2:1 canvas aspect carries through). Allow ±2px rounding.
    expect(w).toBeGreaterThanOrEqual(198);
    expect(w).toBeLessThanOrEqual(202);
    expect(h).toBeGreaterThanOrEqual(98);
    expect(h).toBeLessThanOrEqual(102);
    // Alpha preserved: the corner started transparent and must stay so.
    expect(readAlphaPixel(dst, 0, 0)).toBe(0);

    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe("ffmpeg");
    expect(rows[0].endpoint).toBe("ffmpeg/fit-image");
  });

  test("tall fixture: long edge lands on height via the ffmpeg path", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping ffmpeg fallback test");
      return;
    }
    __setMagickBinaryForTest(null);

    // 256x512 transparent canvas, 64x128 opaque rect (tall) in the middle.
    const src = path.join(tmpRoot, "tall.png");
    writeTransparentMarginPng(src, 256, 512, 64, 128);
    const dst = path.join(tmpRoot, "tall-out.png");
    await fitImage({ src, dst, long: 200, trimAlpha: true });

    const { w, h } = probePngDims(dst);
    expect(h).toBeGreaterThanOrEqual(198);
    expect(h).toBeLessThanOrEqual(202);
    expect(w).toBeGreaterThanOrEqual(98);
    expect(w).toBeLessThanOrEqual(102);
  });

  test("telegram preset emits ≤512 PNG with alpha on the ffmpeg path", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping ffmpeg telegram fallback test");
      return;
    }
    __setMagickBinaryForTest(null);

    // 1024x768 transparent canvas with a 600x300 opaque rect.
    const src = path.join(tmpRoot, "tg.png");
    writeTransparentMarginPng(src, 1024, 768, 600, 300);
    const dst = path.join(tmpRoot, "tg-out.png");
    await fitImage({ src, dst, telegram: true });

    const { w, h } = probePngDims(dst);
    expect(Math.max(w, h)).toBeLessThanOrEqual(512);
    expect(Math.max(w, h)).toBeGreaterThanOrEqual(510);
    expect(readAlphaPixel(dst, 0, 0)).toBe(0);
  });
});
