// Issue #103: `image convert` — format + resize + quality on a still.
//
// Tests cover:
// - buildMagickConvertArgs() emits the canonical `<in> [-strip]
//   [-resize 'WxH>'] -quality Q <out>` shape — note the `>` only-shrink
//   suffix on the resize geometry (pure helper, same pattern as
//   buildMagickFitArgs).
// - jpegQualityToQv() inverse 1-100 → 2-31 mapping for the ffmpeg jpg path.
// - buildFfmpegConvertArgs() emits the min()-guarded only-shrink scale,
//   `-map_metadata -1` under strip, `-q:v` for jpg / `-quality` for webp /
//   no quality flag for png.
// - convertImage() takes the ImageMagick path when stubbed-present
//   (arg-recording stub via __setMagickBinaryForTest) and logs
//   `provider: "imagemagick"` / `endpoint: "imagemagick/convert"`.
// - convertImage() falls back to real ffmpeg when stubbed-absent: lavfi PNG
//   fixture → JPG with --max smaller than source (output exists, JPEG magic
//   bytes FF D8, dimensions ≤ box) and a no-upscale case (max larger than
//   source → dimensions unchanged).
//
// ImageMagick is NOT assumed installed — the IM path is exercised purely
// through the stub script; the real-fixture tests run the ffmpeg fallback.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  convertImage,
  buildMagickConvertArgs,
  buildFfmpegConvertArgs,
  jpegQualityToQv,
} from "../../cli/lib/image/convert.js";
import { __setMagickBinaryForTest } from "../../cli/lib/image/magick.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { setRoot } from "../../cli/lib/paths.js";

const PROJECT_ID = "convert-test-001";

function hasFfmpeg(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

const HAS_FFMPEG = hasFfmpeg();

let tmpRoot: string;
let origRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-convert-"));
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

/** Probe a still's pixel dimensions via ffprobe. */
function probeDims(file: string): { w: number; h: number } {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file],
    { encoding: "utf-8" },
  );
  const m = (r.stdout ?? "").trim().match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`could not probe dimensions of "${file}"`);
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

/** Generate a solid-colour PNG fixture of the given size via lavfi. */
function writePngFixture(file: string, w: number, h: number): void {
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", `color=c=red:s=${w}x${h}:d=0.04:r=25`,
      "-frames:v", "1",
      file,
    ],
    { stdio: "ignore" },
  );
}

describe("buildMagickConvertArgs (#103)", () => {
  test("strip + max + quality emits the canonical one-invocation shape with the > only-shrink suffix", () => {
    expect(
      buildMagickConvertArgs({ src: "in.png", dst: "out.jpg", max: { w: 720, h: 1280 }, quality: 85, strip: true }),
    ).toEqual(["in.png", "-strip", "-resize", "720x1280>", "-quality", "85", "out.jpg"]);
  });

  test("no strip / no max → bare quality convert", () => {
    expect(
      buildMagickConvertArgs({ src: "in.webp", dst: "out.png", quality: 90 }),
    ).toEqual(["in.webp", "-quality", "90", "out.png"]);
  });

  test("quality defaults to 85", () => {
    const args = buildMagickConvertArgs({ src: "a.png", dst: "b.jpg" });
    expect(args[args.indexOf("-quality") + 1]).toBe("85");
  });
});

describe("jpegQualityToQv (#103)", () => {
  test("inverse 1-100 → 2-31 mapping", () => {
    expect(jpegQualityToQv(100)).toBe(2);
    expect(jpegQualityToQv(85)).toBe(6);
    expect(jpegQualityToQv(1)).toBe(31);
  });

  test("clamped to [2, 31]", () => {
    expect(jpegQualityToQv(200)).toBe(2);
    expect(jpegQualityToQv(-50)).toBe(31);
  });
});

describe("buildFfmpegConvertArgs (#103)", () => {
  test("jpg target: min()-guarded only-shrink scale + -map_metadata -1 + -q:v", () => {
    const args = buildFfmpegConvertArgs({
      src: "in.png",
      dst: "out.jpg",
      max: { w: 720, h: 1280 },
      quality: 85,
      strip: true,
    });
    expect(args).toEqual([
      "-i", "in.png",
      "-vf", "scale='min(iw,720)':'min(ih,1280)':force_original_aspect_ratio=decrease:flags=lanczos",
      "-map_metadata", "-1",
      "-q:v", "6",
      "-frames:v", "1",
      "out.jpg",
    ]);
  });

  test("webp target uses libwebp -quality on the 1-100 scale", () => {
    const args = buildFfmpegConvertArgs({ src: "in.png", dst: "out.webp", quality: 70 });
    expect(args).toContain("-quality");
    expect(args[args.indexOf("-quality") + 1]).toBe("70");
    expect(args).not.toContain("-q:v");
  });

  test("png target gets no quality flag", () => {
    const args = buildFfmpegConvertArgs({ src: "in.webp", dst: "out.png" });
    expect(args).not.toContain("-q:v");
    expect(args).not.toContain("-quality");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-map_metadata");
  });

  test("no strip → no -map_metadata", () => {
    const args = buildFfmpegConvertArgs({ src: "in.png", dst: "out.jpg" });
    expect(args).not.toContain("-map_metadata");
  });
});

describe("convertImage ImageMagick path (stubbed-present, #103)", () => {
  test("magick present → IM invocation with -strip/-resize/-quality and provider=imagemagick gen-log", async () => {
    __setMagickBinaryForTest(writeArgRecordingStub());

    const src = path.join(tmpRoot, "in.png");
    fs.writeFileSync(src, ""); // content irrelevant — the stub never reads it
    const dst = path.join(tmpRoot, "out.jpg");
    await convertImage({
      src,
      dst,
      max: { w: 720, h: 1280 },
      quality: 85,
      strip: true,
      projectId: PROJECT_ID,
    });

    const args = recordedArgs();
    expect(args[0]).toBe(src);
    expect(args).toContain("-strip");
    expect(args[args.indexOf("-resize") + 1]).toBe("720x1280>");
    expect(args[args.indexOf("-quality") + 1]).toBe("85");
    expect(args[args.length - 1]).toBe(dst);

    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe("imagemagick");
    expect(rows[0].endpoint).toBe("imagemagick/convert");
    expect(rows[0].status).toBe("ok");
    expect(rows[0].cost_usd).toBe(0);
    expect(rows[0].input.src).toBe(src);
    expect(rows[0].input.max).toBe("720x1280");
    expect(rows[0].input.quality).toBe(85);
    expect(rows[0].input.strip).toBe(true);
  });
});

describe("convertImage ffmpeg fallback (stubbed-absent, #103)", () => {
  test("PNG → JPG with --max smaller than source: JPEG magic bytes, dims ≤ box, provider=ffmpeg gen-log", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping ffmpeg fallback test");
      return;
    }
    __setMagickBinaryForTest(null);

    const src = path.join(tmpRoot, "big.png");
    writePngFixture(src, 800, 600);
    const dst = path.join(tmpRoot, "small.jpg");
    await convertImage({ src, dst, max: { w: 400, h: 400 }, strip: true, projectId: PROJECT_ID });

    expect(fs.existsSync(dst)).toBe(true);
    // JPEG magic bytes: FF D8.
    const head = fs.readFileSync(dst).subarray(0, 2);
    expect(head[0]).toBe(0xff);
    expect(head[1]).toBe(0xd8);
    // Fits inside the box, aspect preserved (800x600 → 400x300).
    const { w, h } = probeDims(dst);
    expect(w).toBeLessThanOrEqual(400);
    expect(h).toBeLessThanOrEqual(400);
    expect(w).toBe(400);
    expect(h).toBe(300);

    const rows = await readGenerations(PROJECT_ID);
    expect(rows.length).toBe(1);
    expect(rows[0].provider).toBe("ffmpeg");
    expect(rows[0].endpoint).toBe("ffmpeg/convert");
    expect(rows[0].status).toBe("ok");
    expect(rows[0].cost_usd).toBe(0);
  });

  test("no-upscale: --max larger than source leaves dimensions unchanged", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping no-upscale fallback test");
      return;
    }
    __setMagickBinaryForTest(null);

    const src = path.join(tmpRoot, "tiny.png");
    writePngFixture(src, 200, 100);
    const dst = path.join(tmpRoot, "tiny-out.jpg");
    await convertImage({ src, dst, max: { w: 720, h: 1280 } });

    const { w, h } = probeDims(dst);
    expect(w).toBe(200);
    expect(h).toBe(100);
  });

  test("WebP → PNG format conversion without max", async () => {
    if (!HAS_FFMPEG) {
      console.warn("ffmpeg missing — skipping webp→png fallback test");
      return;
    }
    __setMagickBinaryForTest(null);

    // Build a small webp source first (also via ffmpeg).
    const png = path.join(tmpRoot, "seed.png");
    writePngFixture(png, 64, 64);
    const src = path.join(tmpRoot, "seed.webp");
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-frames:v", "1", src], { stdio: "ignore" });

    const dst = path.join(tmpRoot, "seed-out.png");
    await convertImage({ src, dst });

    expect(fs.existsSync(dst)).toBe(true);
    // PNG magic bytes: 89 50 4E 47.
    const head = fs.readFileSync(dst).subarray(0, 4);
    expect(Array.from(head)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(probeDims(dst)).toEqual({ w: 64, h: 64 });
  });
});
