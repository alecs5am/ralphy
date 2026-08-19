// Unit tests for buildDitherFilter — the pure filtergraph builder behind
// `ralphy video dither`. No ffmpeg spawn; asserts graph shape only.

import { describe, test, expect } from "bun:test";
import { buildDitherFilter } from "../../cli/lib/ffmpeg-recipes.js";

describe("buildDitherFilter", () => {
  test("default (palette=null, contrast=1) → 1-bit B&W monob, no palettegen, no eq", () => {
    const f = buildDitherFilter({ pixelate: 1, palette: null, mode: "bayer", bayerScale: 2, contrast: 1 });
    expect(f).toBe("format=gray,format=monob,format=gray,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor");
    expect(f).not.toContain("palettegen");
    expect(f).not.toContain("eq=");
  });

  test("pixelate>1 downscales (bilinear) then nearest-neighbor upscales for chunky dots", () => {
    const f = buildDitherFilter({ pixelate: 3, palette: null, mode: "bayer", bayerScale: 2, contrast: 1 });
    expect(f).toContain("scale=iw/3:ih/3:flags=bilinear");
    expect(f).toContain("scale=iw*3:ih*3:flags=neighbor");
    // downscale comes before monob, upscale after.
    expect(f.indexOf("iw/3")).toBeLessThan(f.indexOf("format=monob"));
    expect(f.indexOf("format=monob")).toBeLessThan(f.indexOf("iw*3"));
  });

  test("contrast!=1 inserts eq before dithering (B&W path)", () => {
    const f = buildDitherFilter({ pixelate: 1, palette: null, mode: "bayer", bayerScale: 2, contrast: 1.9 });
    expect(f).toContain("eq=contrast=1.9");
    // eq after grayscale, before monob.
    expect(f.indexOf("format=gray")).toBeLessThan(f.indexOf("eq=contrast=1.9"));
    expect(f.indexOf("eq=contrast=1.9")).toBeLessThan(f.indexOf("format=monob"));
  });

  test("palette=N → palettegen with reserve_transparent=0 + bayer_scale, eq before split", () => {
    const f = buildDitherFilter({ pixelate: 1, palette: 6, mode: "bayer", bayerScale: 3, contrast: 1.5 });
    expect(f).toContain("split[s0][s1]");
    expect(f).toContain("[s0]palettegen=max_colors=6:reserve_transparent=0[pal]");
    expect(f).toContain("[s1][pal]paletteuse=dither=bayer:bayer_scale=3");
    expect(f).not.toContain("format=gray"); // palette engine keeps hue
    expect(f.indexOf("eq=contrast=1.5")).toBeLessThan(f.indexOf("split[s0][s1]"));
  });

  test("palette + error-diffusion mode drops bayer_scale", () => {
    const f = buildDitherFilter({ pixelate: 1, palette: 2, mode: "floyd_steinberg", bayerScale: 2, contrast: 1 });
    expect(f).toContain("paletteuse=dither=floyd_steinberg");
    expect(f).not.toContain("bayer_scale");
  });
});
