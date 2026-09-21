import { expect, test } from "vitest";
import { ditherPixels } from "../src/pages/marketplace/lib/effect-rendering";
import { effectAmount, effectPixelSize, effectStudio } from "../src/pages/marketplace/lib/effect-settings";

test("dither settings change real pixels and preserve the original at zero", () => {
  const pixels = new Uint8ClampedArray(Array.from({ length: 16 }, () => [128, 128, 128, 220]).flat());
  const original = pixels.slice();
  ditherPixels(pixels, 4, 0);
  expect(pixels).toEqual(original);
  ditherPixels(pixels, 4, 100);
  expect(pixels).not.toEqual(original);
  const colors = Array.from(pixels).filter((_, index) => index % 4 !== 3);
  expect(new Set(colors)).toEqual(new Set([0, 255]));
  expect(Array.from(pixels).filter((_, index) => index % 4 === 3)).toEqual(Array(16).fill(220));
  expect(effectPixelSize(100)).toBeGreaterThan(effectPixelSize(20));
  expect(effectAmount(-10)).toBe(0);
  expect(effectAmount(Infinity)).toBe(50);
});

test("known effect controls point to their own thematic source without intercepting other demos", () => {
  expect(effectStudio("vhs-overlay")?.sourceUrl).toContain("horror-corridor.png");
  expect(effectStudio("voxel-dither")?.sourceUrl).toContain("desert-racer.png");
  expect(effectStudio("unknown")).toBeNull();
  expect(effectStudio("constructor")).toBeNull();
});
