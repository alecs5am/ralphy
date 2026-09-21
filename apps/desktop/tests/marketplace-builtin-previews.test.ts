import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { builtinPreview } from "../src/pages/marketplace/lib/builtin-previews";
import { projectMarketplacePublicItem } from "../src/pages/marketplace/lib/presentation";

const item = (id: string) => projectMarketplacePublicItem({
  id, name: id, category: "recipe", summary: "Sample effect", referenceUrls: [],
  recipe: { kind: "ffmpeg", artifact: null, body: null, parameters: null, demo: null },
}, "live");

test("bundled previews map only exact public recipes to existing bounded before/after media", () => {
  for (const id of ["vhs-overlay", "chroma-split", "film-grain", "noir-grade", "voxel-dither", "crt-scanlines", "old-radio-ps1-vo"]) {
    const preview = builtinPreview(item(id));
    expect(preview?.label).toBe("Sample preview");
    expect(preview?.kind).toBe(id === "old-radio-ps1-vo" ? "audio" : "video");
    for (const url of [preview?.url, preview?.beforeUrl, preview?.posterUrl].filter(Boolean)) {
      const path = resolve("public", url!.replace(/^\.?\//, ""));
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size).toBeLessThan(2_000_000);
    }
    expect(builtinPreview({ ...item(id), origin: "pack" } as ReturnType<typeof item>)).toBeNull();
  }
  expect(builtinPreview(item("another-vhs-overlay"))).toBeNull();
  expect(builtinPreview(item("glitch"))).toBeNull();
});
