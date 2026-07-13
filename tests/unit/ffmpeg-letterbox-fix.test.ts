// Unit tests for the render-pipeline letterbox auto-crop (HF bakes a black bar
// under <video> compositions). Pure helpers only — `parseCropdetect` (stderr →
// crop region) and `decideLetterboxCrop` (crop region + frame dims → crop|noop).
// No ffmpeg spawn here; the orchestrator `fixLetterboxInPlace` is exercised by
// the render pipeline itself.

import { describe, test, expect } from "bun:test";
import { parseCropdetect, decideLetterboxCrop } from "../../cli/lib/ffmpeg-recipes.js";

describe("parseCropdetect", () => {
  test("returns the last accumulated crop= suggestion", () => {
    const stderr = [
      "[Parsed_cropdetect_0 @ 0x1] x1:0 x2:1079 y1:0 y2:1919 crop=1080:1840:0:0",
      "[Parsed_cropdetect_0 @ 0x1] x1:0 x2:1079 y1:0 y2:1831 crop=1080:1832:0:0",
    ].join("\n");
    expect(parseCropdetect(stderr)).toEqual({ w: 1080, h: 1832, x: 0, y: 0 });
  });

  test("null when no crop line present", () => {
    expect(parseCropdetect("no crop here")).toBeNull();
  });
});

describe("decideLetterboxCrop", () => {
  const frame = { frameW: 1080, frameH: 1920 };

  test("the real bug: crop=1080:1832 → crop with 88px bar", () => {
    const d = decideLetterboxCrop({ ...frame, content: { w: 1080, h: 1832, x: 0, y: 0 } });
    expect(d.action).toBe("crop");
    if (d.action === "crop") expect(d.barPx).toBe(88);
  });

  test("already-clean full frame → noop (no re-encode)", () => {
    const d = decideLetterboxCrop({ ...frame, content: { w: 1080, h: 1920, x: 0, y: 0 } });
    expect(d.action).toBe("noop");
  });

  test("within epsilon of full frame → noop (cropdetect rounding)", () => {
    const d = decideLetterboxCrop({ ...frame, content: { w: 1080, h: 1918, x: 0, y: 0 } });
    expect(d.action).toBe("noop");
  });

  test("full-width bar just above the 85% floor → crop", () => {
    // 1920 * 0.86 ≈ 1651 → above floor, healed.
    const d = decideLetterboxCrop({ ...frame, content: { w: 1080, h: 1660, x: 0, y: 0 } });
    expect(d.action).toBe("crop");
  });

  test("genuinely dark scene (content < 85% floor) → refuse (noop)", () => {
    const d = decideLetterboxCrop({ ...frame, content: { w: 1080, h: 1400, x: 0, y: 200 } });
    expect(d.action).toBe("noop");
  });

  test("full-height side bar (letterbox on X) → crop", () => {
    const d = decideLetterboxCrop({ frameW: 1920, frameH: 1080, content: { w: 1832, h: 1080, x: 44, y: 0 } });
    expect(d.action).toBe("crop");
    if (d.action === "crop") expect(d.barPx).toBe(88);
  });

  test("null content → noop", () => {
    expect(decideLetterboxCrop({ ...frame, content: null }).action).toBe("noop");
  });
});
