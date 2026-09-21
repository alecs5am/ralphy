import { expect, test } from "bun:test";
import { filterLibraryBlocks } from "../../cli/lib/library/tags.js";
import type { Block } from "../../cli/lib/library/types.js";

test("public-library lists expose normalized declared tags and filter exact tags plus query", () => {
  const blocks: Block[] = [
    { kind: "recipe", id: "radio", name: "Old Radio", blurb: "Dread treatment", recipeKind: "ffmpeg", format: "audio", tags: [" Vintage ", "vintage", "<script>x</script>"] },
    { kind: "asset", id: "bed", name: "Bed", blurb: "Vintage scene", sub: "music", tags: ["Dread"] },
  ];
  expect(filterLibraryBlocks(blocks)[0]?.tags).toEqual(["vintage", "audio", "ffmpeg"]);
  expect(filterLibraryBlocks(blocks, { tag: " VINTAGE ", query: "radio" }).map((block) => block.id)).toEqual(["radio"]);
  expect(filterLibraryBlocks(blocks, { query: "ffmpeg audio" }).map((block) => block.id)).toEqual(["radio"]);
  expect(filterLibraryBlocks(blocks, { tag: "unknown" })).toEqual([]);
});
