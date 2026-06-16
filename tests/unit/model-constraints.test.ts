// Model constraint preflight (#445) — pure unit tests over the synthetic-input
// surface. NO live model / network calls: preflightModelCall is pure and the
// catalog-backed video check is exercised by injecting a VideoModel directly
// (the same network-free seam tests/unit/or-catalog.test.ts uses).
//
// Each describe block asserts a constraint already captured in a DONE issue:
//   • #008 — kling multiframe base64 broken; kling 2500-char prompt cap.
//   • #023 — kling --audio renders speech (EN-only advisory).
//   • #051 — gemini / gpt ignore --size (snap to natural grid).
// Plus the seedance ref-count cap and ElevenLabs duration ranges.

import { describe, test, expect } from "bun:test";
import {
  preflightModelCall,
  MODEL_CONSTRAINTS,
} from "../../cli/lib/models/constraints.js";
import type { VideoModel } from "../../cli/lib/or-catalog.js";

const KLING_PRO: VideoModel = {
  id: "kwaivgi/kling-v3.0-pro",
  supported_durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supported_resolutions: ["720p"],
  supported_aspect_ratios: ["16:9", "9:16", "1:1"],
  supported_frame_images: ["first_frame", "last_frame"],
};

describe("#008 · kling multiframe base64 broken", () => {
  test("first_frame AND last_frame together → fail (not ok), with seedance fallback", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      hasFirstFrame: true,
      hasLastFrame: true,
    });
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.field === "frames" && x.severity === "fail");
    expect(v).toBeDefined();
    expect(v!.message).toContain("base64");
    expect(r.recommendedFallbacks).toContain("bytedance/seedance-2.0");
  });

  test("single first_frame alone is fine (no frames violation)", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      hasFirstFrame: true,
      hasLastFrame: false,
    });
    expect(r.violations.find((x) => x.field === "frames")).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});

describe("#008 · kling 2500-char prompt cap", () => {
  test("prompt over 2500 chars → fail", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      promptChars: 2501,
    });
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.field === "prompt");
    expect(v?.severity).toBe("fail");
    expect(v?.message).toContain("2500");
  });

  test("prompt at exactly 2500 chars passes", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      promptChars: 2500,
    });
    expect(r.violations.find((x) => x.field === "prompt")).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});

describe("#023 · kling --audio renders speech (EN-only advisory)", () => {
  test("--audio surfaces an EN-only hint but does NOT block", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      audio: true,
    });
    expect(r.ok).toBe(true);
    expect(r.hints.some((h) => /EN only/i.test(h))).toBe(true);
    // The constraint table records the audio behavior as renders-speech.
    expect(MODEL_CONSTRAINTS["kwaivgi/kling-v3.0-pro"]?.audioSupport).toBe("renders-speech");
  });

  test("seedance --audio is ambient-only → warn (not fail) for speech", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "bytedance/seedance-2.0",
      audio: true,
    });
    expect(r.ok).toBe(true);
    const v = r.violations.find((x) => x.field === "audio");
    expect(v?.severity).toBe("warn");
  });
});

describe("#051 · gemini / gpt ignore --size", () => {
  test("gemini-3-pro-image-preview with --size and no --aspect → warn", () => {
    const r = preflightModelCall({
      kind: "image",
      modelId: "google/gemini-3-pro-image-preview",
      size: "1290x2796",
    });
    expect(r.ok).toBe(true);
    const v = r.violations.find((x) => x.field === "size");
    expect(v?.severity).toBe("warn");
    expect(v?.hint).toContain("--aspect");
  });

  test("gpt-5.4-image-2 with --aspect (no bare --size) → no size warning", () => {
    const r = preflightModelCall({
      kind: "image",
      modelId: "openai/gpt-5.4-image-2",
      aspect: "9:16",
    });
    expect(r.violations.find((x) => x.field === "size")).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});

describe("seedance ref-count cap (MODELS.md 6b: <=9 image refs)", () => {
  test("10 refs → fail", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "bytedance/seedance-2.0",
      refCount: 10,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.find((x) => x.field === "refs")?.severity).toBe("fail");
  });

  test("9 refs is fine", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "bytedance/seedance-2.0",
      refCount: 9,
    });
    expect(r.violations.find((x) => x.field === "refs")).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});

describe("ElevenLabs duration ranges (sfx 0.5-22s, music 3-600s)", () => {
  test("sfx over 22s → fail", () => {
    const r = preflightModelCall({ kind: "sfx", modelId: "elevenlabs-sfx", durationSec: 30 });
    expect(r.ok).toBe(false);
    expect(r.violations.find((x) => x.field === "duration")?.severity).toBe("fail");
  });

  test("sfx at 4s is fine", () => {
    const r = preflightModelCall({ kind: "sfx", modelId: "elevenlabs-sfx", durationSec: 4 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  test("music under 3s → fail", () => {
    const r = preflightModelCall({ kind: "music", modelId: "elevenlabs-music", durationSec: 2 });
    expect(r.ok).toBe(false);
    expect(r.violations.find((x) => x.field === "duration")?.severity).toBe("fail");
  });

  test("music at 8s is fine", () => {
    const r = preflightModelCall({ kind: "music", modelId: "elevenlabs-music", durationSec: 8 });
    expect(r.ok).toBe(true);
  });
});

describe("concurrency hint (advisory)", () => {
  test("music planned at 3 in-flight → warn (cap is 2)", () => {
    const r = preflightModelCall({ kind: "music", modelId: "elevenlabs-music", durationSec: 8, concurrency: 3 });
    expect(r.ok).toBe(true);
    expect(r.violations.find((x) => x.field === "concurrency")?.severity).toBe("warn");
  });
});

describe("catalog-backed video limits (injected VideoModel, no network)", () => {
  test("kling 4:3 aspect → fail via validateVideoParams", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      videoModel: KLING_PRO,
      durationSec: 5,
      aspect: "4:3",
      resolution: "720p",
    });
    expect(r.ok).toBe(false);
    expect(r.violations.find((x) => x.field === "aspect_ratio")?.severity).toBe("fail");
  });

  test("valid kling params with no videoModel injected → ok", () => {
    const r = preflightModelCall({
      kind: "video",
      modelId: "kwaivgi/kling-v3.0-pro",
      promptChars: 500,
      aspect: "9:16",
      durationSec: 5,
    });
    expect(r.ok).toBe(true);
  });
});

describe("unknown model is permissive", () => {
  test("a model not in the table and no videoModel → ok, no violations", () => {
    const r = preflightModelCall({
      kind: "image",
      modelId: "fake/unknown-model",
      promptChars: 99999,
      refCount: 50,
      size: "9999x9999",
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
});
