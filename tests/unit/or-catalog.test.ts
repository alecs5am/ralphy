// validateVideoParams — pure unit tests across the canonical OR video
// model classes (kling / veo / hailuo / wan / seedance). The matrix
// matches what the live `/api/v1/videos/models` endpoint returned on
// the 2026-05-08 snapshot recorded in MODELS.md.

import { describe, test, expect } from "bun:test";
import {
  validateVideoParams,
  estimateVideoCostUsd,
  type VideoModel,
} from "../../cli/lib/or-catalog.js";

const KLING_PRO: VideoModel = {
  id: "kwaivgi/kling-v3.0-pro",
  supported_durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supported_resolutions: ["720p"],
  supported_aspect_ratios: ["16:9", "9:16", "1:1"],
  supported_frame_images: ["first_frame", "last_frame"],
};

const HAILUO: VideoModel = {
  id: "minimax/hailuo-2.3",
  supported_durations: [6, 10],
  supported_resolutions: ["1080p"],
  supported_aspect_ratios: ["16:9"],
  supported_frame_images: ["first_frame"],
};

const SEEDANCE: VideoModel = {
  id: "bytedance/seedance-2.0",
  supported_durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supported_resolutions: ["480p", "720p", "1080p"],
  supported_aspect_ratios: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9", "9:21"],
  supported_frame_images: ["first_frame", "last_frame"],
};

const WAN_26: VideoModel = {
  id: "alibaba/wan-2.6",
  supported_durations: [5, 10],
  supported_resolutions: ["720p", "1080p"],
  supported_aspect_ratios: ["16:9", "9:16"],
  supported_frame_images: ["first_frame"],
};

const baseArgs = {
  duration: 5,
  aspectRatio: "9:16",
  resolution: "720p",
  hasFirstFrame: false,
  hasLastFrame: false,
};

describe("validateVideoParams · kling-v3.0-pro", () => {
  test("default brainrot params (5s, 9:16, 720p) pass", () => {
    expect(validateVideoParams(KLING_PRO, baseArgs)).toEqual([]);
  });

  test("rejects 4:3 aspect (kling supports only 9:16/16:9/1:1)", () => {
    const f = validateVideoParams(KLING_PRO, { ...baseArgs, aspectRatio: "4:3" });
    expect(f.length).toBe(1);
    expect(f[0].field).toBe("aspect_ratio");
    expect(f[0].suggestion).toContain("16:9");
  });

  test("rejects 1080p resolution (kling pro only supports 720p)", () => {
    const f = validateVideoParams(KLING_PRO, { ...baseArgs, resolution: "1080p" });
    expect(f.length).toBe(1);
    expect(f[0].field).toBe("resolution");
    expect(f[0].suggestion).toContain("720p");
  });

  test("rejects fractional durations rounded to unsupported value", () => {
    // duration 2.4 rounds to 2 → not in [3..15]
    const f = validateVideoParams(KLING_PRO, { ...baseArgs, duration: 2.4 });
    expect(f.find((x) => x.field === "duration")).toBeDefined();
  });

  test("accepts both first_frame and last_frame anchors", () => {
    const f = validateVideoParams(KLING_PRO, {
      ...baseArgs,
      hasFirstFrame: true,
      hasLastFrame: true,
    });
    expect(f).toEqual([]);
  });
});

describe("validateVideoParams · hailuo-2.3 (most restrictive)", () => {
  test("rejects 5s duration (only 6 / 10)", () => {
    const f = validateVideoParams(HAILUO, {
      ...baseArgs,
      resolution: "1080p",
      aspectRatio: "16:9",
    });
    expect(f.length).toBe(1);
    expect(f[0].field).toBe("duration");
    expect(f[0].suggestion).toContain("6, 10");
  });

  test("accepts 6s + 16:9 + 1080p", () => {
    expect(
      validateVideoParams(HAILUO, {
        ...baseArgs,
        duration: 6,
        resolution: "1080p",
        aspectRatio: "16:9",
      }),
    ).toEqual([]);
  });

  test("rejects 9:16 (hailuo is 16:9 only)", () => {
    const f = validateVideoParams(HAILUO, {
      ...baseArgs,
      duration: 6,
      resolution: "1080p",
      aspectRatio: "9:16",
    });
    expect(f.find((x) => x.field === "aspect_ratio")).toBeDefined();
  });

  test("rejects last_frame anchor (hailuo first_frame only)", () => {
    const f = validateVideoParams(HAILUO, {
      ...baseArgs,
      duration: 6,
      resolution: "1080p",
      aspectRatio: "16:9",
      hasLastFrame: true,
    });
    expect(f.length).toBe(1);
    expect(f[0].field).toBe("frame_images");
    expect(f[0].suggestion).toContain("first_frame");
  });
});

describe("validateVideoParams · seedance-2.0 (most permissive)", () => {
  test("accepts 21:9 cinema aspect (only model in catalog supporting it)", () => {
    expect(
      validateVideoParams(SEEDANCE, { ...baseArgs, aspectRatio: "21:9" }),
    ).toEqual([]);
  });

  test("accepts 480p + 4:3", () => {
    expect(
      validateVideoParams(SEEDANCE, {
        ...baseArgs,
        resolution: "480p",
        aspectRatio: "4:3",
      }),
    ).toEqual([]);
  });

  test("rejects 4K (seedance maxes at 1080p)", () => {
    const f = validateVideoParams(SEEDANCE, { ...baseArgs, resolution: "4K" });
    expect(f.find((x) => x.field === "resolution")).toBeDefined();
  });
});

describe("validateVideoParams · combined errors", () => {
  test("returns one finding per failing field, not bailing early", () => {
    const f = validateVideoParams(WAN_26, {
      duration: 7,                  // not in [5,10]
      aspectRatio: "21:9",          // not in [16:9, 9:16]
      resolution: "4K",             // not in [720p, 1080p]
      hasFirstFrame: false,
      hasLastFrame: true,           // wan-2.6 first_frame only
    });
    const fields = f.map((x) => x.field).sort();
    expect(fields).toEqual([
      "aspect_ratio",
      "duration",
      "frame_images",
      "resolution",
    ]);
  });

  test("missing supported_durations / aspects / resolutions = open (no findings)", () => {
    // Model with no per-field schema should not reject duration/aspect/resolution.
    const open: VideoModel = { id: "fake/anything" };
    const f = validateVideoParams(open, {
      duration: 999,
      aspectRatio: "fake",
      resolution: "fake",
      hasFirstFrame: false,
      hasLastFrame: false,
    });
    expect(f).toEqual([]);
  });

  test("missing supported_frame_images = anchors rejected (safer default)", () => {
    // Frame anchors are reject-by-default when the model doesn't declare
    // support, since OR's submit will throw at the provider level otherwise.
    const open: VideoModel = { id: "fake/anything" };
    const f = validateVideoParams(open, {
      duration: 999,
      aspectRatio: "fake",
      resolution: "fake",
      hasFirstFrame: true,
      hasLastFrame: true,
    });
    expect(f.length).toBe(2);
    expect(f.every((x) => x.field === "frame_images")).toBe(true);
  });
});

describe("estimateVideoCostUsd", () => {
  test("returns hand-table per-second × duration", () => {
    expect(estimateVideoCostUsd("kwaivgi/kling-v3.0-pro", 5)).toBe(0.7);
    expect(estimateVideoCostUsd("bytedance/seedance-2.0-fast", 10)).toBe(0.5);
    expect(estimateVideoCostUsd("google/veo-3.1", 8)).toBe(4);
  });

  test("falls back to 0.14/sec for unknown models", () => {
    expect(estimateVideoCostUsd("fake/unknown-model", 5)).toBeCloseTo(0.7, 4);
  });
});
