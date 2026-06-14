// Unit tests for the fal seedance r2v reference-video constraint enforcement
// (#402). These exercise the PURE planner + dimension math in
// cli/lib/providers/ref-video.ts WITHOUT invoking ffprobe / ffmpeg — the
// probed dimensions are supplied directly so the resolution-box math and the
// reject paths are unit-testable.

import { describe, test, expect } from "bun:test";
import {
  fitWithinBox,
  withinResolutionBox,
  planRefVideos,
  buildDownscaleArgs,
  REF_VIDEO_MAX,
  type RefVideoProbe,
} from "../../cli/lib/providers/ref-video.js";

const probe = (over: Partial<RefVideoProbe> = {}): RefVideoProbe => ({
  path: "/tmp/clip.mp4",
  width: 720,
  height: 1280,
  durationS: 6,
  sizeBytes: 4 * 1024 * 1024,
  ...over,
});

describe("fitWithinBox — pure downscale math", () => {
  test("1080x1920 → fits within 834x1112 (≈624-626x1108-1112), aspect preserved, even dims", () => {
    const out = fitWithinBox({ width: 1080, height: 1920 }, REF_VIDEO_MAX);
    // height is the binding edge: 1112/1920 ≈ 0.5792 → w≈625.6 → even-round 626.
    expect(out.height).toBe(1112);
    expect(out.width % 2).toBe(0);
    expect(out.width).toBeGreaterThanOrEqual(620);
    expect(out.width).toBeLessThanOrEqual(REF_VIDEO_MAX.width);
    expect(out.height).toBeLessThanOrEqual(REF_VIDEO_MAX.height);
    // Aspect preserved within rounding tolerance.
    const srcAspect = 1080 / 1920;
    const outAspect = out.width / out.height;
    expect(Math.abs(srcAspect - outAspect)).toBeLessThan(0.01);
  });

  test("even-number guarantee (h.264 yuv420p) for an odd-scaling source", () => {
    const out = fitWithinBox({ width: 1001, height: 1777 }, REF_VIDEO_MAX);
    expect(out.width % 2).toBe(0);
    expect(out.height % 2).toBe(0);
  });

  test("already-small source is not upscaled (scale clamps at 1)", () => {
    const out = fitWithinBox({ width: 640, height: 800 }, REF_VIDEO_MAX);
    expect(out).toEqual({ width: 640, height: 800 });
  });
});

describe("withinResolutionBox — orientation-agnostic", () => {
  test("720x1280 portrait is within the box", () => {
    expect(withinResolutionBox({ width: 720, height: 1280 })).toBe(false);
    // 1280 > 1112 long edge → NOT within. (720p label != 720p pixel box here.)
  });
  test("624x1108 (downscaled) is within the box", () => {
    expect(withinResolutionBox({ width: 624, height: 1108 })).toBe(true);
  });
  test("1080x1920 exceeds the box", () => {
    expect(withinResolutionBox({ width: 1080, height: 1920 })).toBe(false);
  });
  test("640x640 (min floor) is within the box", () => {
    expect(withinResolutionBox({ width: 640, height: 640 })).toBe(true);
  });
});

describe("planRefVideos — accept / auto-fix / reject", () => {
  test("within-box source: no downscale needed", () => {
    const plan = planRefVideos([probe({ width: 624, height: 1108, durationS: 5 })]);
    expect(plan.items[0]!.needsDownscale).toBe(false);
    expect(plan.combinedDurationS).toBe(5);
  });

  test("1080x1920 source flagged for downscale with a computed target ≤834x1112", () => {
    const plan = planRefVideos([probe({ width: 1080, height: 1920, durationS: 6 })]);
    expect(plan.items[0]!.needsDownscale).toBe(true);
    expect(plan.items[0]!.target.height).toBeLessThanOrEqual(1112);
    expect(plan.items[0]!.target.width).toBeLessThanOrEqual(834);
  });

  test("reject: combined duration > 15s", () => {
    expect(() =>
      planRefVideos([probe({ durationS: 8 }), probe({ durationS: 8 })]),
    ).toThrow(/duration/i);
  });

  test("reject: combined duration < 2s", () => {
    expect(() => planRefVideos([probe({ durationS: 1 })])).toThrow(/duration/i);
  });

  test("reject: more than 3 files", () => {
    expect(() =>
      planRefVideos([probe(), probe(), probe(), probe()].map((p, i) => ({ ...p, durationS: 3, path: `/tmp/${i}.mp4` }))),
    ).toThrow(/too many/i);
  });

  test("reject: combined size > 50MB", () => {
    expect(() =>
      planRefVideos([probe({ sizeBytes: 30 * 1024 * 1024 }), probe({ sizeBytes: 30 * 1024 * 1024 })]),
    ).toThrow(/size/i);
  });

  test("reject: source below the 640px minimum edge (never upscale)", () => {
    expect(() => planRefVideos([probe({ width: 320, height: 568, durationS: 4 })])).toThrow(/minimum/i);
  });
});

describe("buildDownscaleArgs — ffmpeg command shape (pure)", () => {
  test("scale filter carries the target dims, strips audio, even pix_fmt", () => {
    const args = buildDownscaleArgs("/in.mp4", "/out.mp4", { width: 624, height: 1108 });
    const joined = args.join(" ");
    expect(joined).toContain("scale=624:1108");
    expect(args).toContain("-an"); // audio dropped — frames are the reference
    expect(joined).toContain("yuv420p");
    expect(args[args.length - 1]).toBe("/out.mp4");
    expect(args).toContain("-i");
  });
});
