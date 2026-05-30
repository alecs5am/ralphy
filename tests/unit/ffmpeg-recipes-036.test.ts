// Unit tests for the four new ffmpeg recipes added in issue #036:
// `colorGrade`, `applyVhs`, `mixMusic`, `compressForSocial` (via the
// `qualityPresetToCrf` helper). All assertions target the pure filter / CRF
// helpers — no ffmpeg spawn here. The integration counterpart in
// tests/integration/cli-video-036.test.ts spawns ffmpeg.

import { describe, test, expect } from "bun:test";
import {
  buildColorGradeFilter,
  buildVhsFilter,
  buildMixMusicFilter,
  qualityPresetToCrf,
} from "../../cli/lib/ffmpeg-recipes.js";

describe("buildColorGradeFilter — preset chains (#036)", () => {
  test("tv-commercial-soft = eq + colorchannelmixer warm tint", () => {
    const f = buildColorGradeFilter("tv-commercial-soft");
    expect(f).toContain("eq=contrast=1.05");
    expect(f).toContain("saturation=1.05");
    expect(f).toContain("colorchannelmixer=rr=1.02:bb=0.98");
    // Order matters — eq always first.
    expect(f.startsWith("eq=")).toBe(true);
  });

  test("tv-commercial-strong = higher contrast, +18% saturation", () => {
    const f = buildColorGradeFilter("tv-commercial-strong");
    expect(f).toContain("contrast=1.15");
    expect(f).toContain("saturation=1.18");
    expect(f).toContain("colorchannelmixer=rr=1.05:bb=0.95");
  });

  test("cinematic-teal-orange = curves + teal-shadow / orange-highlight", () => {
    const f = buildColorGradeFilter("cinematic-teal-orange");
    expect(f).toContain("curves=");
    expect(f).toContain("0/0 0.5/0.55 1/1"); // R curve lifts highlights
    expect(f).toContain("0/0 0.5/0.45 1/1"); // B curve drops mids
    expect(f).toContain("colorchannelmixer=rr=1.08:gg=1.00:bb=0.92");
  });

  test("analog-horror = desat + green shift + crushed blacks", () => {
    const f = buildColorGradeFilter("analog-horror");
    expect(f).toContain("saturation=0.78");
    expect(f).toContain("brightness=-0.04");
    expect(f).toContain("gg=1.05"); // green-shift
    expect(f).toContain("curves=all=");
  });
});

describe("buildVhsFilter — chain layers toggleable (#036)", () => {
  test("default opts emit all four layers + vignette + desat tail", () => {
    const f = buildVhsFilter({ drift: 2, grain: 8, chroma: 3 });
    expect(f).toContain("rgbashift=rh=3:bh=-3");
    expect(f).toContain("crop=in_w-4:in_h:2+2*sin(2*PI*0.6*t):0");
    expect(f).toContain("noise=alls=8:allf=t");
    expect(f).toContain("vignette=PI/5");
    expect(f).toContain("eq=saturation=0.92:contrast=1.05");
  });

  test("chroma=0 drops the rgbashift step but keeps the rest", () => {
    const f = buildVhsFilter({ drift: 2, grain: 8, chroma: 0 });
    expect(f).not.toContain("rgbashift=");
    expect(f).toContain("noise=");
    expect(f).toContain("vignette=");
  });

  test("grain=0 drops the noise step", () => {
    const f = buildVhsFilter({ drift: 2, grain: 0, chroma: 3 });
    expect(f).not.toContain("noise=");
    expect(f).toContain("rgbashift=");
  });

  test("drift=0 drops the sine-crop step", () => {
    const f = buildVhsFilter({ drift: 0, grain: 8, chroma: 3 });
    expect(f).not.toContain("crop=");
    expect(f).toContain("noise=");
  });

  test("all-zero opts still keep vignette + desat tail (always-on baseline)", () => {
    const f = buildVhsFilter({ drift: 0, grain: 0, chroma: 0 });
    expect(f).toBe("vignette=PI/5,eq=saturation=0.92:contrast=1.05");
  });
});

describe("buildMixMusicFilter — multi-char labels, audio-aware (#036)", () => {
  test("source has audio → amix with [mbed] + [mixed] labels", () => {
    const f = buildMixMusicFilter({ volume: 0.18, hasSourceAudio: true });
    // Multi-char labels per #011 — no single-letter brackets.
    expect(f).not.toMatch(/\[m\]/);
    expect(f).not.toMatch(/\[v\]/);
    expect(f).toContain("[mbed]");
    expect(f).toContain("[mixed]");
    expect(f).toContain("[1:a]volume=0.18[mbed]");
    expect(f).toContain("amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]");
  });

  test("source has no audio → music-only path with [mixed] label", () => {
    const f = buildMixMusicFilter({ volume: 0.18, hasSourceAudio: false });
    expect(f).toBe("[1:a]volume=0.18[mixed]");
  });

  test("volume flows through verbatim", () => {
    const f = buildMixMusicFilter({ volume: 0.42, hasSourceAudio: true });
    expect(f).toContain("volume=0.42");
  });
});

describe("qualityPresetToCrf — CRF table (#036)", () => {
  test("web → 23 (small, shareable)", () => {
    expect(qualityPresetToCrf("web")).toBe(23);
  });
  test("print → 18 (visually lossless)", () => {
    expect(qualityPresetToCrf("print")).toBe(18);
  });
  test("archive → 12 (near-mathematically-lossless)", () => {
    expect(qualityPresetToCrf("archive")).toBe(12);
  });
});
