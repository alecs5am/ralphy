// Unit tests for the image post-processing primitives added in issue #037:
// chromakey filter chain, hex normalization, and SVG path detection. The
// integration counterpart (tests/integration/cli-image-037.test.ts) spawns
// ffmpeg + Playwright against real assets.

import { describe, test, expect } from "bun:test";
import {
  buildChromakeyFilter,
  normalizeHexColor,
  isSvgPath,
  parseSvgAspectRatio,
} from "../../cli/lib/image/cutout.js";

describe("buildChromakeyFilter (#037)", () => {
  test("default colour = greenscreen 0x00b140", () => {
    const f = buildChromakeyFilter({});
    expect(f).toContain("colorkey=color=0x00b140");
    expect(f).toContain("similarity=0.3");
    expect(f).toContain("blend=0.1");
  });

  test("emits format=rgba first so PNG output has alpha", () => {
    const f = buildChromakeyFilter({});
    expect(f.startsWith("format=rgba,")).toBe(true);
  });

  test("custom hex colour normalizes through (#00FF00 → 0x00ff00)", () => {
    const f = buildChromakeyFilter({ color: "#00FF00" });
    expect(f).toContain("colorkey=color=0x00ff00");
  });

  test("0xRRGGBB form passes through verbatim, lowercased", () => {
    const f = buildChromakeyFilter({ color: "0x00B140" });
    expect(f).toContain("colorkey=color=0x00b140");
  });

  test("similarity + feather flow through", () => {
    const f = buildChromakeyFilter({ similarity: 0.42, feather: 0.55 });
    expect(f).toContain("similarity=0.42");
    expect(f).toContain("blend=0.55");
  });

  test("despill=true appends colorhold pass with bumped similarity", () => {
    const f = buildChromakeyFilter({ similarity: 0.3, despill: true });
    expect(f).toContain("colorhold=color=0x00b140:similarity=0.4:blend=0");
    // Order matters — despill always runs AFTER the keyout.
    const keyIdx = f.indexOf("colorkey=");
    const holdIdx = f.indexOf("colorhold=");
    expect(holdIdx).toBeGreaterThan(keyIdx);
  });

  test("despill clamps the bumped similarity at 1.0", () => {
    const f = buildChromakeyFilter({ similarity: 0.95, despill: true });
    expect(f).toContain("colorhold=color=0x00b140:similarity=1:blend=0");
  });

  test("no-despill default omits the colorhold pass", () => {
    const f = buildChromakeyFilter({});
    expect(f).not.toContain("colorhold");
  });
});

describe("normalizeHexColor (#037)", () => {
  test("accepts # / 0x / bare 6-hex forms", () => {
    expect(normalizeHexColor("#00b140")).toBe("0x00b140");
    expect(normalizeHexColor("0x00B140")).toBe("0x00b140");
    expect(normalizeHexColor("0X00B140")).toBe("0x00b140");
    expect(normalizeHexColor("00b140")).toBe("0x00b140");
  });

  test("rejects bad input", () => {
    expect(() => normalizeHexColor("bogus")).toThrow();
    expect(() => normalizeHexColor("#00b14")).toThrow(); // 5 digits
    expect(() => normalizeHexColor("#00b1400")).toThrow(); // 7 digits
  });
});

describe("parseSvgAspectRatio (#037)", () => {
  test("viewBox wins over width/height attrs", () => {
    const r = parseSvgAspectRatio(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="9999" height="1"><rect/></svg>`,
    );
    expect(r).toBe(2);
  });

  test("falls back to width+height attrs when no viewBox", () => {
    const r = parseSvgAspectRatio(`<svg width="300" height="100"><rect/></svg>`);
    expect(r).toBe(3);
  });

  test("returns null when neither viewBox nor numeric w/h present", () => {
    expect(parseSvgAspectRatio(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`)).toBeNull();
  });

  test("ignores degenerate viewBox (h=0) and falls through", () => {
    const r = parseSvgAspectRatio(`<svg viewBox="0 0 100 0" width="100" height="50"><rect/></svg>`);
    expect(r).toBe(2);
  });
});

describe("isSvgPath (#037)", () => {
  test("matches .svg / .SVG suffixes", () => {
    expect(isSvgPath("/tmp/logo.svg")).toBe(true);
    expect(isSvgPath("/tmp/logo.SVG")).toBe(true);
    expect(isSvgPath("./brand-mark.SvG")).toBe(true);
  });

  test("rejects non-SVG paths", () => {
    expect(isSvgPath("/tmp/logo.png")).toBe(false);
    expect(isSvgPath("/tmp/file.svg.bak")).toBe(false);
    expect(isSvgPath("")).toBe(false);
  });
});
