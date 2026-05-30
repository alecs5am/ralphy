// Unit tests for caption post-processing helpers (issue #010):
// brand-spelling, safe-zone, wrap, SRT, drawtext filter.

import { describe, test, expect } from "bun:test";
import {
  applyBrandSpelling,
  applyBrandSpellingToCaptions,
  mergeBrandSpelling,
  resolveSafeZone,
  wrapCaptionText,
  captionsToSrt,
  captionsToDrawtextFilter,
} from "../../cli/lib/captions/helpers.js";
import type { Caption } from "../../cli/lib/captions/types.js";

describe("brand-spelling", () => {
  test("built-in dict replaces common misses, preserves casing", () => {
    const dict = mergeBrandSpelling(null);
    expect(applyBrandSpelling("Ralfy", dict)).toBe("Ralphy");
    expect(applyBrandSpelling("ralfy", dict)).toBe("Ralphy");
    expect(applyBrandSpelling("RALFY", dict)).toBe("Ralphy");
  });

  test("preserves trailing punctuation", () => {
    const dict = mergeBrandSpelling(null);
    expect(applyBrandSpelling("Ralfy.", dict)).toBe("Ralphy.");
    expect(applyBrandSpelling("(Ralfy)", dict)).toBe("(Ralphy)");
  });

  test("project override wins over built-in", () => {
    const dict = mergeBrandSpelling({ ralfy: "RalphyDx" });
    expect(applyBrandSpelling("Ralfy", dict)).toBe("RalphyDx");
  });

  test("multi-token phrase replacement", () => {
    const dict = mergeBrandSpelling(null);
    // built-in covers "open router" → "OpenRouter"
    expect(applyBrandSpelling("open router", dict)).toBe("OpenRouter");
  });

  test("untouched when no match", () => {
    const dict = mergeBrandSpelling(null);
    expect(applyBrandSpelling("hello world", dict)).toBe("hello world");
  });

  test("applyBrandSpellingToCaptions does not mutate input", () => {
    const dict = mergeBrandSpelling(null);
    const original: Caption[] = [
      { text: "Ralfy", startMs: 0, endMs: 500, timestampMs: 250, confidence: null },
    ];
    const out = applyBrandSpellingToCaptions(original, dict);
    expect(out[0]?.text).toBe("Ralphy");
    expect(original[0]?.text).toBe("Ralfy");
  });
});

describe("safe-zone resolution", () => {
  test("tiktok preset has caption mid-frame upper-third", () => {
    const s = resolveSafeZone("tiktok", undefined);
    expect(s.yCenter).toBeGreaterThan(0.5);
    expect(s.yCenter).toBeLessThan(0.8);
    expect(s.maxWidthPct).toBeGreaterThan(50);
  });

  test("none returns center w/ default 90 maxWidth", () => {
    const s = resolveSafeZone("none", undefined);
    expect(s.yCenter).toBe(0.5);
    expect(s.maxWidthPct).toBe(90);
  });

  test("user override beats preset", () => {
    const s = resolveSafeZone("tiktok", 50);
    expect(s.maxWidthPct).toBe(50);
  });
});

describe("wrapCaptionText", () => {
  test("wraps long text within max chars", () => {
    const text = "this is a fairly long line that needs to wrap onto multiple lines";
    const out = wrapCaptionText(text, { frameWidth: 1080, maxWidthPct: 50, fontSizePx: 48 });
    expect(out).toContain("\n");
  });

  test("short text stays single-line", () => {
    const out = wrapCaptionText("hi", { frameWidth: 1080, maxWidthPct: 90, fontSizePx: 48 });
    expect(out).toBe("hi");
  });

  test("respects maxLines with truncation marker", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
    const out = wrapCaptionText(text, {
      frameWidth: 200,
      maxWidthPct: 50,
      fontSizePx: 48,
      maxLines: 2,
    });
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("captionsToSrt", () => {
  test("empty captions → empty string", () => {
    expect(captionsToSrt([])).toBe("");
  });

  test("emits index + timestamps + text", () => {
    const captions: Caption[] = [
      { text: "hello", startMs: 0, endMs: 500, timestampMs: 250, confidence: null },
      { text: "world", startMs: 600, endMs: 1100, timestampMs: 850, confidence: null },
    ];
    const srt = captionsToSrt(captions);
    expect(srt).toContain("1\n");
    expect(srt).toContain("00:00:00,000 --> 00:00:00,500");
    expect(srt).toContain("hello");
    expect(srt).toContain("2\n");
    expect(srt).toContain("00:00:00,600 --> 00:00:01,100");
    expect(srt).toContain("world");
  });
});

describe("captionsToDrawtextFilter", () => {
  test("empty captions → empty filter", () => {
    expect(captionsToDrawtextFilter([], { fontSizePx: 64, yCenter: 0.5 })).toBe("");
  });

  test("emits one drawtext= per caption with enable=between expression", () => {
    const captions: Caption[] = [
      { text: "hello", startMs: 0, endMs: 1000, timestampMs: 500, confidence: null },
      { text: "world", startMs: 1000, endMs: 2000, timestampMs: 1500, confidence: null },
    ];
    const f = captionsToDrawtextFilter(captions, { fontSizePx: 64, yCenter: 0.6 });
    expect(f.split("drawtext=").length - 1).toBe(2);
    expect(f).toContain("between(t,0.000,1.000)");
    expect(f).toContain("between(t,1.000,2.000)");
    expect(f).toContain("text='hello'");
    expect(f).toContain("text='world'");
    expect(f).toContain("fontsize=64");
  });

  test("escapes single quotes and colons in text", () => {
    const captions: Caption[] = [
      { text: "it's: now", startMs: 0, endMs: 1000, timestampMs: 500, confidence: null },
    ];
    const f = captionsToDrawtextFilter(captions, { fontSizePx: 64, yCenter: 0.5 });
    expect(f).toContain("it\\'s\\: now");
  });

  test("includes fontfile when provided", () => {
    const captions: Caption[] = [
      { text: "hi", startMs: 0, endMs: 1000, timestampMs: 500, confidence: null },
    ];
    const f = captionsToDrawtextFilter(captions, {
      fontSizePx: 64,
      yCenter: 0.5,
      fontFile: "/fonts/inter.ttf",
    });
    expect(f).toContain("fontfile='/fonts/inter.ttf'");
  });
});
