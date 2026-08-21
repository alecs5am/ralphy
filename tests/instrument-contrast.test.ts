import { describe, expect, test } from "vitest";
import {
  INSTRUMENT_COLOR_ALLOWLIST,
  INSTRUMENT_PALETTE,
  contrastRatio,
} from "../src/instrument/palette";

describe("instrument color contract", () => {
  test("names the required readable secondary colors", () => {
    expect(INSTRUMENT_PALETTE.light.textSecondaryReadable).toBe("#4A4A48");
    expect(INSTRUMENT_PALETTE.dark.textSecondaryReadable).toBe("#A4A4A0");
  });

  test("keeps normal secondary text at WCAG AA contrast", () => {
    expect(contrastRatio("#4A4A48", "#E2E4EA")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#4A4A48", "#F1F2F6")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A4A4A0", "#050505")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A4A4A0", "#141414")).toBeGreaterThanOrEqual(4.5);
  });

  test("keeps alert labels and focus indicators readable in both themes", () => {
    expect(INSTRUMENT_PALETTE.light.alertText).toBe("#050505");
    expect(INSTRUMENT_PALETTE.dark.alertText).toBe("#050505");
    expect(contrastRatio(INSTRUMENT_PALETTE.light.alertText, INSTRUMENT_PALETTE.light.alert)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(INSTRUMENT_PALETTE.light.focus, INSTRUMENT_PALETTE.light.desk)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(INSTRUMENT_PALETTE.dark.focus, INSTRUMENT_PALETTE.dark.desk)).toBeGreaterThanOrEqual(3);
  });

  test("rejects malformed colors instead of silently producing a ratio", () => {
    expect(() => contrastRatio("white", "#141414")).toThrow(TypeError);
    expect(() => contrastRatio("#FFF", "#141414")).toThrow(TypeError);
  });

  test("keeps every palette value in the complete authored-color allowlist", () => {
    expect(INSTRUMENT_COLOR_ALLOWLIST).toEqual([
      "#050505", "#060606", "#111111", "#141414", "#181818", "#1C1C1C", "#1D1D1D", "#1E1E1E",
      "#242422", "#242424", "#262626", "#2D2D2D", "#2E2E2E", "#343434", "#3A3A38", "#3F3F3D",
      "#4A4A48", "#5CC45C", "#6A6A66", "#6E6E6A", "#8A8A86", "#9A9A96", "#A4A4A0",
      "#CCCED6", "#D3D6DD", "#D8D8D6", "#DFE2E9", "#E0362C", "#E2E4EA", "#E4E4E2",
      "#E8E8E6", "#EB4438", "#ED6A5E", "#F0B544", "#F1F2F6", "#F2F2F0", "#FFFFFF",
    ]);
    const named = new Set(Object.values(INSTRUMENT_PALETTE).flatMap((palette) => Object.values(palette)));
    expect(INSTRUMENT_COLOR_ALLOWLIST.filter((color) => !named.has(color))).toEqual([]);
    expect(Object.values(INSTRUMENT_PALETTE).flatMap((palette) => Object.values(palette)).filter((color) => !INSTRUMENT_COLOR_ALLOWLIST.includes(color))).toEqual([]);
  });
});
