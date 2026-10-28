// Deep-vision upload size cap (#583).
//
// The full-video eval pass sends the mp4 in-band as base64, and the provider
// rejects request bodies over 20,000,000 bytes (HTTP 413). The old 40 MB raw cap
// let 20-40 MB renders through to a guaranteed 413. These tests pin the byte math
// and the proxy fallback: a video above the raw budget is transcoded to a
// smaller proxy before upload instead of failing. No network; the transcode is
// injected, except one optional real-ffmpeg round trip (skipped without ffmpeg).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  base64EncodedBytes,
  buildVideoContentBlock,
  DEEP_VISION_MAX_MP4_BYTES,
  DEEP_VISION_MAX_REQUEST_BYTES,
  DEEP_VISION_REQUEST_RESERVE_BYTES,
  maxRawBytesForRequest,
  planEvalProxy,
  prepareVideoForUpload,
  videoRequestBytes,
  type PrepareVideoDeps,
} from "../../cli/lib/eval/deep-vision";
import { buildEvalProxyArgs } from "../../cli/lib/ffmpeg-recipes";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-dv-size-583-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function fakeVideo(bytes: number, name = "render.mp4"): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(bytes, 7));
  return p;
}

/** Probe stub for the injected-transcode tests: the byte budgets are tiny, so
 *  the clip is short enough for a valid bitrate plan. */
const PORTRAIT_4K_CLIP = { durationSec: 0.1, resolution: { w: 2160, h: 3840 }, codec: { audio: "aac" } };

describe("request byte math", () => {
  test("base64 inflates 3 raw bytes to 4", () => {
    expect(base64EncodedBytes(0)).toBe(0);
    expect(base64EncodedBytes(1)).toBe(4);
    expect(base64EncodedBytes(3)).toBe(4);
    expect(base64EncodedBytes(4)).toBe(8);
    expect(base64EncodedBytes(3_000_000)).toBe(4_000_000);
  });

  test("the default raw budget keeps the body under the provider limit with the prompt reserve", () => {
    const limitForVideo = DEEP_VISION_MAX_REQUEST_BYTES - DEEP_VISION_REQUEST_RESERVE_BYTES;
    expect(DEEP_VISION_MAX_MP4_BYTES).toBe(maxRawBytesForRequest());
    expect(videoRequestBytes(DEEP_VISION_MAX_MP4_BYTES)).toBeLessThanOrEqual(limitForVideo);
    // Tight: three more raw bytes would cross it.
    expect(videoRequestBytes(DEEP_VISION_MAX_MP4_BYTES + 3)).toBeGreaterThan(limitForVideo);
    // About 13.9 MiB, well under the old 40 MB cap.
    expect(DEEP_VISION_MAX_MP4_BYTES).toBeGreaterThan(14_000_000);
    expect(DEEP_VISION_MAX_MP4_BYTES).toBeLessThan(15_000_000);
  });

  test("the stored 413 cases are over the budget and the stored successes are under it", () => {
    // Renders whose full-video pass died with HTTP 413 in the #569 audit.
    for (const raw of [24_617_035, 23_424_858, 34_700_000]) {
      expect(raw).toBeGreaterThan(DEEP_VISION_MAX_MP4_BYTES);
      expect(videoRequestBytes(raw)).toBeGreaterThan(DEEP_VISION_MAX_REQUEST_BYTES);
    }
    // 24,617,035 raw bytes became the 32,829,560-byte body the provider
    // reported; the remainder is the prompt, well inside the reserve.
    const promptBytes = 32_829_560 - videoRequestBytes(24_617_035);
    expect(promptBytes).toBeGreaterThan(0);
    expect(promptBytes).toBeLessThan(DEEP_VISION_REQUEST_RESERVE_BYTES);
    // Renders that went through.
    for (const raw of [13_508_259, 9_318_008, 5_602_141]) {
      expect(raw).toBeLessThanOrEqual(DEEP_VISION_MAX_MP4_BYTES);
    }
  });

  test("a custom limit and reserve move the budget", () => {
    expect(maxRawBytesForRequest(4_000, 0)).toBe(Math.floor((4_000 - 64) / 4) * 3);
    expect(maxRawBytesForRequest(100, 1_000)).toBe(0);
  });
});

describe("planEvalProxy", () => {
  test("a 4K portrait render scales to a 720-wide proxy with audio kept", () => {
    const p = planEvalProxy({ durationSec: 20.4, width: 2160, height: 3840, maxBytes: DEEP_VISION_MAX_MP4_BYTES, hasAudio: true });
    expect(p.width).toBe(720);
    expect(p.audioKbps).toBe(96);
    const bytes = ((p.videoKbps + p.audioKbps) * 1000 * 20.4) / 8;
    expect(bytes).toBeLessThan(DEEP_VISION_MAX_MP4_BYTES);
  });

  test("a landscape plate scales by its short side", () => {
    const p = planEvalProxy({ durationSec: 5, width: 2224, height: 1668, maxBytes: DEEP_VISION_MAX_MP4_BYTES, hasAudio: false });
    expect(p.width).toBe(960);
    expect(p.audioKbps).toBe(0);
  });

  test("a source already below the rung is never upscaled", () => {
    const p = planEvalProxy({ durationSec: 30, width: 480, height: 852, maxBytes: 10_000_000, hasAudio: true });
    expect(p.width).toBe(480);
  });

  test("each retry lowers the bitrate and steps down the resolution ladder", () => {
    const base = { durationSec: 20, width: 1080, height: 1920, maxBytes: DEEP_VISION_MAX_MP4_BYTES, hasAudio: true };
    const a0 = planEvalProxy({ ...base, attempt: 0 });
    const a1 = planEvalProxy({ ...base, attempt: 1 });
    const a2 = planEvalProxy({ ...base, attempt: 2 });
    expect(a1.videoKbps).toBeLessThan(a0.videoKbps);
    expect(a2.videoKbps).toBeLessThan(a1.videoKbps);
    expect([a0.width, a1.width, a2.width]).toEqual([720, 540, 360]);
  });

  test("a long video gets a lower rung up front", () => {
    const p = planEvalProxy({ durationSec: 240, width: 1080, height: 1920, maxBytes: DEEP_VISION_MAX_MP4_BYTES, hasAudio: true });
    expect(p.width).toBe(360);
  });

  test("a video too long to fit at any rung is refused with a clear message", () => {
    expect(() =>
      planEvalProxy({ durationSec: 4 * 3600, width: 1080, height: 1920, maxBytes: DEEP_VISION_MAX_MP4_BYTES, hasAudio: true }),
    ).toThrow(/too long for an in-band eval upload/);
  });
});

describe("prepareVideoForUpload", () => {
  function deps(sizes: number[]): { deps: PrepareVideoDeps; calls: Array<{ width: number; videoKbps: number; dst: string }> } {
    const calls: Array<{ width: number; videoKbps: number; dst: string }> = [];
    return {
      calls,
      deps: {
        cacheDir: path.join(dir, "cache"),
        probe: () => PORTRAIT_4K_CLIP,
        async transcode(i) {
          calls.push({ width: i.width, videoKbps: i.videoKbps, dst: i.dst });
          fs.writeFileSync(i.dst, Buffer.alloc(sizes[Math.min(calls.length - 1, sizes.length - 1)]!, 1));
          return i.dst;
        },
      },
    };
  }

  test("a video within the budget is uploaded as-is, no transcode", async () => {
    const src = fakeVideo(20_000);
    const { deps: d, calls } = deps([500]);
    const r = await prepareVideoForUpload(src, { maxBytes: 30_000, deps: d });
    expect(r).toEqual({ path: src, proxied: false, originalBytes: 20_000, uploadBytes: 20_000 });
    expect(calls).toHaveLength(0);
  });

  test("a video over the budget is transcoded to a proxy instead of failing", async () => {
    const src = fakeVideo(100_000);
    const { deps: d, calls } = deps([10_000]);
    const r = await prepareVideoForUpload(src, { maxBytes: 30_000, deps: d });
    expect(r.proxied).toBe(true);
    expect(r.originalBytes).toBe(100_000);
    expect(r.uploadBytes).toBe(10_000);
    expect(r.path.startsWith(path.join(dir, "cache"))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.width).toBeLessThanOrEqual(720);
    // The source is never touched.
    expect(fs.statSync(src).size).toBe(100_000);
  });

  test("an overshooting encode retries smaller", async () => {
    const src = fakeVideo(100_000);
    const { deps: d, calls } = deps([50_000, 20_000]);
    const r = await prepareVideoForUpload(src, { maxBytes: 30_000, deps: d });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.videoKbps).toBeLessThan(calls[0]!.videoKbps);
    expect(r.uploadBytes).toBe(20_000);
  });

  test("gives up after three attempts with an actionable error", async () => {
    const src = fakeVideo(100_000);
    const { deps: d, calls } = deps([90_000]);
    await expect(prepareVideoForUpload(src, { maxBytes: 30_000, deps: d })).rejects.toThrow(/Evaluate a shorter cut/);
    expect(calls).toHaveLength(3);
  });

  test("a cached proxy that fits is reused", async () => {
    const src = fakeVideo(100_000);
    const { deps: d, calls } = deps([10_000]);
    const first = await prepareVideoForUpload(src, { maxBytes: 30_000, deps: d });
    const second = await prepareVideoForUpload(src, { maxBytes: 30_000, deps: d });
    expect(second.path).toBe(first.path);
    expect(calls).toHaveLength(1);
  });

  test("the content block carries the proxy bytes under the original filename", async () => {
    const src = fakeVideo(100_000, "final-social.mp4");
    const { deps: d } = deps([12_000]);
    const block = await buildVideoContentBlock(src, 30_000, { deps: d });
    if (block.type !== "file") throw new Error("expected a file block");
    expect(block.file.filename).toBe("final-social.mp4");
    expect(block.file.file_data.startsWith("data:video/mp4;base64,")).toBe(true);
    expect(block.file.file_data.length).toBeLessThanOrEqual(videoRequestBytes(30_000));
  });
});

describe("eval proxy ffmpeg arguments", () => {
  test("scale, bitrate cap and audio are pinned", () => {
    const args = buildEvalProxyArgs({ src: "in.mp4", dst: "out.mp4", width: 720, videoKbps: 2000, audioKbps: 96 });
    expect(args).toContain("scale=720:-2");
    expect(args.join(" ")).toContain("-b:v 2000k -maxrate 2000k -bufsize 4000k");
    expect(args.join(" ")).toContain("-c:a aac -b:a 96k");
    expect(args.at(-1)).toBe("out.mp4");
  });
  test("no audio stream drops audio instead of encoding silence", () => {
    const args = buildEvalProxyArgs({ src: "in.mp4", dst: "out.mp4", width: 540, videoKbps: 800, audioKbps: 0 });
    expect(args).toContain("-an");
    expect(args).not.toContain("aac");
  });
});

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

describe("real ffmpeg round trip (local, no network)", () => {
  test.skipIf(!HAS_FFMPEG)("a high-bitrate clip comes back under a small budget", async () => {
    const src = path.join(dir, "noisy.mp4");
    const gen = spawnSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "8M",
      "-c:a", "aac", "-shortest", src,
    ]);
    expect(gen.status).toBe(0);
    const budget = 250_000;
    expect(fs.statSync(src).size).toBeGreaterThan(budget);
    const r = await prepareVideoForUpload(src, { maxBytes: budget, deps: { cacheDir: path.join(dir, "cache") } });
    expect(r.proxied).toBe(true);
    expect(r.uploadBytes).toBeLessThanOrEqual(budget);
  }, 30_000);
});
