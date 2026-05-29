// Unit tests for the i2v anchor pre-processing chain (#021).
//
// Two passes apply to every PNG/JPG/WEBP ref passed to generateVideo() as
// firstFrame / lastFrame / image:
//   1. C2PA / EXIF metadata strip — load-bearing, Kling rejects `caBX` chunks
//      with "not in a valid base64 format" 400s.
//   2. Auto-resize to ≤720×1280 + re-encode as JPG when source exceeds the
//      target box. Shrinks 700KB anchors to ~80KB without changing aspect.
//
// AGENTS invariant #14: originals on disk are never overwritten. Pre-processed
// bytes live in `os.tmpdir()/ralphy-{stripped,resized}-refs/` only.

import { describe, test, expect } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

import {
  resolveImageRefForVideo,
  I2V_ANCHOR_TARGET,
} from "../../cli/lib/providers/shared.js";

function ffmpegAvailable(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function ffprobeAvailable(): boolean {
  const r = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function makePng(dir: string, name: string, width: number, height: number): string {
  const out = path.join(dir, name);
  // testsrc2 + setpts=N/24 creates a solid synthetic frame. -frames:v 1 keeps
  // it to a single PNG. -pix_fmt rgb24 keeps the encoder predictable.
  const r = spawnSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi",
    "-i", `color=c=blue:s=${width}x${height}:d=1`,
    "-frames:v", "1",
    "-pix_fmt", "rgb24",
    out,
  ]);
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed to synthesize PNG ${name}: ${r.stderr?.toString()}`);
  }
  return out;
}

function injectFakeC2PA(pngPath: string): void {
  // PNG chunk layout: 8-byte signature, then chunks of (length:4 BE, type:4,
  // data:length, crc:4). Insert a fake `caBX` chunk right after IHDR (which
  // starts at offset 8 and is 25 bytes total — length(4) + IHDR(4) + 13 +
  // crc(4)). The exact CRC doesn't matter for our test — the C2PA-strip pass
  // re-encodes the PNG via ffmpeg `-map_metadata -1` which drops non-image
  // chunks regardless of CRC validity.
  const data = fs.readFileSync(pngPath);
  const afterIHDR = 8 + 25;
  const payload = Buffer.from("hello-c2pa-payload");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(payload.length, 0);
  const typeBuf = Buffer.from("caBX", "ascii");
  const crcBuf = Buffer.from([0, 0, 0, 0]); // bogus crc, OK for strip test
  const injected = Buffer.concat([
    data.slice(0, afterIHDR),
    lenBuf,
    typeBuf,
    payload,
    crcBuf,
    data.slice(afterIHDR),
  ]);
  fs.writeFileSync(pngPath, injected);
}

const havePipeline = ffmpegAvailable() && ffprobeAvailable();
const desc = havePipeline ? describe : describe.skip;

desc("resolveImageRefForVideo — i2v anchor pre-processing (#021)", () => {
  test("oversized 1080x1920 PNG → resize + jpg + bytes shrink dramatically", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-i2v-pp-"));
    try {
      const src = makePng(tmp, "big.png", 1080, 1920);
      const srcBytes = fs.statSync(src).size;
      // Sanity: synthesized PNG should be non-trivially sized.
      expect(srcBytes).toBeGreaterThan(0);

      const { url, info } = await resolveImageRefForVideo(src);

      expect(info.resized).toBe(true);
      expect(info.c2pa_stripped).toBe(true);
      expect(info.out_mime).toBe("image/jpeg");
      // Resized output must fit inside the target box, aspect preserved.
      expect(info.out_dimensions?.width).toBeLessThanOrEqual(I2V_ANCHOR_TARGET.width);
      expect(info.out_dimensions?.height).toBeLessThanOrEqual(I2V_ANCHOR_TARGET.height);
      // Resized JPG should be well under 100KB for a solid-color 720x1280.
      expect(info.out_bytes).toBeLessThan(100_000);
      // Wire form is a data: URL with the resized JPG mime.
      expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);

      // Original file on disk is untouched (AGENTS invariant #14).
      expect(fs.statSync(src).size).toBe(srcBytes);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("small 720x1280 PNG → skips resize, still C2PA-strips, stays PNG", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-i2v-pp-"));
    try {
      const src = makePng(tmp, "small.png", 720, 1280);
      const { url, info } = await resolveImageRefForVideo(src);

      expect(info.resized).toBe(false);
      // No resize → output mime stays PNG.
      expect(info.out_mime).toBe("image/png");
      expect(url.startsWith("data:image/png;base64,")).toBe(true);
      // C2PA strip still runs (PNG always re-encoded), so out_bytes is set.
      expect(info.out_bytes).toBeGreaterThan(0);
      expect(info.src_dimensions).toEqual({ width: 720, height: 1280 });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("C2PA-laden PNG: `caBX` marker disappears from the base64 payload", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-i2v-pp-"));
    try {
      // Use a small (in-budget) PNG so the resize path doesn't fire — we want
      // to isolate the C2PA strip pass.
      const src = makePng(tmp, "c2pa.png", 720, 1280);
      injectFakeC2PA(src);
      // Confirm the marker is in the raw file before the call.
      const rawHex = fs.readFileSync(src).toString("binary");
      expect(rawHex.includes("caBX")).toBe(true);

      const { url, info } = await resolveImageRefForVideo(src);

      expect(info.resized).toBe(false);
      expect(info.c2pa_stripped).toBe(true);

      // Decode the data: URL and confirm `caBX` is gone.
      const b64 = url.slice(url.indexOf(",") + 1);
      const decoded = Buffer.from(b64, "base64").toString("binary");
      expect(decoded.includes("caBX")).toBe(false);
      // Payload byte we injected must also be gone (defense in depth).
      expect(decoded.includes("hello-c2pa-payload")).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("http / https / data: refs pass through with no pre-processing", async () => {
    const remote = "https://example.invalid/foo.png";
    const r1 = await resolveImageRefForVideo(remote);
    expect(r1.url).toBe(remote);
    expect(r1.info.c2pa_stripped).toBe(false);
    expect(r1.info.resized).toBe(false);

    const data = "data:image/png;base64,iVBORw0KGgo=";
    const r2 = await resolveImageRefForVideo(data);
    expect(r2.url).toBe(data);
    expect(r2.info.c2pa_stripped).toBe(false);
    expect(r2.info.resized).toBe(false);
  });
});
