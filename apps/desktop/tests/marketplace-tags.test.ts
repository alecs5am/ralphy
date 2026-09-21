import { describe, expect, test } from "vitest";
import { projectMarketplacePublicDocument } from "../electron/marketplace-library";
import { marketplaceTags } from "../shared/marketplace-tags";
import { marketplacePublicMediaKind, presentMarketplaceSources } from "../src/pages/marketplace/lib/presentation";
import { isMarketplaceLocation, readMarketplaceNavigation } from "../src/pages/marketplace/model/navigation";
import { clearedFilters, publicItemReference } from "../src/pages/marketplace/ui/screen-references";

const initialQuery = readMarketplaceNavigation({ getItem: () => null } as unknown as Storage).location.query;
const query = { ...initialQuery, filters: { ...initialQuery.filters, category: "all" as const } };

describe("Explore source tags and sounds", () => {
  test("keeps actual audio assets and declared facets searchable without inventing tags", () => {
    const items = projectMarketplacePublicDocument({ schemaVersion: 1, blocks: [
      { kind: "asset", sub: "music", id: "bed", name: "Quiet bed", blurb: "For a scene", tags: ["  Dread ", "dread", "", 3, "<script>x</script>"], refs: ["https://ralphy.b-cdn.net/blocks/asset/bed/hook.mp3"] },
      { kind: "asset", sub: "character", id: "figure", name: "Figure", blurb: "A reference" },
      { kind: "recipe", id: "effect", name: "Transform", blurb: "Dread treatment", recipeKind: "ffmpeg", tags: ["Retro", "retro"], format: "video" },
    ] });
    expect(items).toHaveLength(2);
    expect(items[0]?.tags).toEqual(["dread", "music"]);
    expect(items[1]?.tags).toEqual(["retro", "video", "ffmpeg"]);
    const source = { schemaVersion: 1 as const, source: "live" as const, refreshedAt: "2026-09-18T00:00:00.000Z", sourceUpdatedAt: null, warning: null, items };
    const present = (text = "", tag?: string) => presentMarketplaceSources(source, null, { ...query, text, filters: { ...query.filters, ...(tag ? { tag } : {}) } }, [], { publicLibrary: "ready", models: "unavailable" });
    expect(present().items.find((item) => item.key === "asset:bed")).toMatchObject({ category: "sounds", sound: items[0], tags: ["dread", "music"] });
    expect(present("retro").items.map((item) => item.key)).toEqual(["recipe:effect"]);
    expect(present("", "dread").items.map((item) => item.key)).toEqual(["asset:bed"]);
    expect(present("", "unknown").items).toEqual([]);
    expect(present().categories.find((category) => category.category === "sounds")?.count).toEqual({ status: "ready", value: 1 });
    expect(publicItemReference("asset:bed")).toEqual({ category: "asset", id: "bed" });
  });

  test("allows audio only within the existing trusted CDN paths", () => {
    for (const extension of ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"]) {
      expect(marketplacePublicMediaKind(`https://ralphy.b-cdn.net/blocks/sound.${extension}`)).toBe("audio");
    }
    for (const url of ["https://example.com/blocks/a.mp3", "https://ralphy.b-cdn.net/private/a.mp3", "https://ralphy.b-cdn.net/blocks/%2e%2e/a.mp3", "https://ralphy.b-cdn.net/blocks/a.mp3?token=x", "file:///tmp/a.mp3"]) {
      expect(marketplacePublicMediaKind(url)).toBeNull();
    }
  });

  test("normalizes bounded tags and restores exact tag filters while accepting older locations", () => {
    expect(marketplaceTags(["  Motion   Design ", "motion design", "x".repeat(97), "<b>unsafe</b>"])).toEqual(["motion design"]);
    expect(marketplaceTags(Array.from({ length: 100 }, (_, index) => `tag ${index}`))).toHaveLength(32);
    const location = readMarketplaceNavigation({ getItem: () => null } as unknown as Storage).location;
    expect(isMarketplaceLocation(location)).toBe(true);
    expect(isMarketplaceLocation({ ...location, route: { kind: "category", category: "sounds" }, query: { ...query, filters: { ...query.filters, tag: "motion design" } } })).toBe(true);
    expect(isMarketplaceLocation({ ...location, query: { ...query, filters: { ...query.filters, tag: "Motion Design" } } })).toBe(false);
    expect(clearedFilters({ ...query, filters: { ...query.filters, tag: "retro" } }, "all").filters.tag).toBeUndefined();
  });
});
