import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { marketplaceAgentRequest, presentMarketplaceSources, studioCatalog, type MarketplaceQueryState } from "@/pages/marketplace";

const query: MarketplaceQueryState = { text: "", filters: { category: "all", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" }, sort: "relevance" };

test("bundled scenarios have real assets and carry their usable source into chat without remote lookups", () => {
  const items = studioCatalog();
  expect(items.length).toBeGreaterThan(800);
  expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  expect(items.filter((item) => item.category === "templates")).toHaveLength(9);
  expect(items.filter((item) => item.category === "components").length).toBeGreaterThan(100);
  expect(items.filter((item) => item.category === "recipes")).toHaveLength(8);
  expect(items.filter((item) => item.category === "sounds").length).toBeGreaterThan(700);
  expect(items.filter((item) => item.category === "prompts")).toHaveLength(10);
  for (const item of items) {
    expect(item.tags.length).toBeGreaterThanOrEqual(item.sourceLabel === "Ralphy studio examples" ? 4 : 2);
    expect(item.studio!.body.length).toBeGreaterThan(120);
    expect(["Ralphy studio examples", "Remocn · local copy", "Kenney audio packs"]).toContain(item.sourceLabel);
    for (const asset of [item.studio!.preview.url, item.studio!.preview.posterUrl, item.studio!.preview.before?.url].filter(Boolean)) {
      expect(existsSync(resolve("public", asset!.slice(asset!.indexOf("explore/")))), asset).toBe(true);
    }
    const request = marketplaceAgentRequest(item);
    expect(request.attachment.instructions).not.toContain("library templates/recipes/assets show");
    const data = JSON.parse(request.attachment.instructions!.split("\n\n").at(-1)!);
    expect(data.instructions).toBe(item.studio!.body);
    expect(data.settings).toEqual(item.studio!.settings);
    if (item.category === "components" && item.studio!.visualId) {
      expect(data.artifact).toContain("<!doctype html>");
      expect(data.artifact).toContain(`sv-${item.studio!.visualId}`);
      expect(data.artifact).toContain("prefers-reduced-motion");
    }
    if (item.category === "sounds") {
      const audio = readFileSync(resolve("public", item.studio!.preview.url.slice(item.studio!.preview.url.indexOf("explore/"))));
      expect(audio.toString("ascii", 0, 4)).toBe("RIFF");
      expect(audio.length).toBeGreaterThan(44);
    }
  }
  const snapshot = presentMarketplaceSources(null, null, query, [], { publicLibrary: "unavailable", models: "unavailable" }, null, null, items);
  expect(snapshot.items).toHaveLength(items.length);
  expect(snapshot.categories.find((category) => category.category === "components")?.count).toEqual({ status: "ready", value: items.filter((item) => item.category === "components").length });
  const filtered = presentMarketplaceSources(null, null, { ...query, filters: { ...query.filters, tag: "horror" } }, [], { publicLibrary: "unavailable", models: "unavailable" }, null, null, items);
  expect(filtered.items.length).toBeGreaterThan(4);
  expect(filtered.items.every((item) => item.tags.includes("horror"))).toBe(true);
});

test("bundled catalog includes the local Remocn library and every Kenney sound pack", () => {
  const items = studioCatalog();
  const remocn = items.filter((item) => item.sourceLabel === "Remocn · local copy");
  const kenney = items.filter((item) => item.sourceLabel === "Kenney audio packs");

  expect(remocn.length).toBeGreaterThan(100);
  expect(remocn.every((item) => item.category === "components")).toBe(true);
  expect(new Set(kenney.map((item) => item.studio?.pack?.id)).size).toBe(10);
  expect(kenney.every((item) => item.publisherIdentity.status === "ready" && item.publisherIdentity.value === "Kenney")).toBe(true);
});
