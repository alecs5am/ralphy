import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { projectMarketplacePublicItem } from "../src/pages/marketplace/lib/presentation";
import { marketplacePreview, MarketplaceItemPreview } from "../src/pages/marketplace/ui/MarketplaceItemPreview";
import { MarketplaceDetailPreview } from "../src/pages/marketplace/ui/MarketplaceDetailPreview";
import { CreativeCard } from "../src/pages/marketplace/ui/MarketplaceCreativeResults";
import { WINDOW_FLUSH } from "../src/shared/ui/Window";
import { createReactHost } from "./react-host";

const base = "https://ralphy.b-cdn.net/blocks/recipe/";
const recipe = (withDemo = false) => projectMarketplacePublicItem({
  id: "sample", name: "Sample", category: "recipe", summary: "Sample effect",
  referenceUrls: [`${base}reference.png`],
  recipe: { kind: "ffmpeg", artifact: null, body: null, parameters: null, demo: withDemo ? {
    kind: "media", storageUrl: `${base}stored.mp4`, afterUrl: `${base}after.mp4`, beforeUrl: `${base}before.mp4`, posterUrl: null,
  } : null },
}, "live");

test("gallery and detail use the same media, keep before/after, and distinguish missing audio", () => {
  for (const [item, suffix] of [[recipe(), "reference.png"], [recipe(true), "after.mp4"]] as const) {
    expect(marketplacePreview(item)?.url).toBe(`${base}${suffix}`);
    expect(renderToStaticMarkup(<MarketplaceItemPreview item={item} />)).toContain(`${base}${suffix}`);
    expect(renderToStaticMarkup(<MarketplaceDetailPreview item={item} />)).toContain(`${base}${suffix}`);
  }
  expect(marketplacePreview(recipe(true))?.before?.url).toBe(`${base}before.mp4`);
  const sound = projectMarketplacePublicItem({ id: "brief", name: "Sound brief", category: "asset", summary: "A mood to compose", referenceUrls: [], recipe: null }, "live");
  expect(renderToStaticMarkup(<MarketplaceItemPreview item={sound} />)).toContain("Audio not provided");
  expect(renderToStaticMarkup(<MarketplaceDetailPreview item={sound} />)).toContain("Audio not provided");
  const coveredSound = projectMarketplacePublicItem({ id: "track", name: "Track", category: "asset", summary: "Track with cover", referenceUrls: [`${base}cover.png`, `${base}track.mp3`], recipe: null }, "live");
  expect(marketplacePreview(coveredSound)).toMatchObject({ kind: "audio", url: `${base}track.mp3` });
});

test("an original alone never counts as a finished effect preview", () => {
  const source = {
    id: "before-only", name: "Unfinished", category: "recipe" as const, summary: "Awaiting a demo", referenceUrls: [],
    recipe: { kind: "ffmpeg" as const, artifact: null, body: null, parameters: null,
      demo: { kind: "media" as const, storageUrl: null, afterUrl: null, beforeUrl: `${base}before.png`, posterUrl: null } },
  };
  expect(marketplacePreview(projectMarketplacePublicItem(source, "live"))).toBeNull();
  const withPoster = { ...source, recipe: { ...source.recipe, demo: { ...source.recipe.demo, posterUrl: `${base}poster.png` } } };
  expect(marketplacePreview(projectMarketplacePublicItem(withPoster, "live"))).toMatchObject({
    url: `${base}poster.png`, kind: "image", before: { url: `${base}before.png`, kind: "image" },
  });
});

test("Explore creative cards make media full bleed while copy keeps its inset", () => {
  const markup = renderToStaticMarkup(<CreativeCard item={recipe()} onOpenItem={() => undefined} onUnavailable={() => undefined} />);
  expect(markup).toContain("marketplace-creative-card-flush");
  expect(markup).toContain("marketplace-card-summary line-clamp-2 px-3 pb-2");
  expect(WINDOW_FLUSH).not.toContain("p-0.5");
});

test("detail respects live reduced-motion changes and gallery tolerates missing media methods", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const preference = Object.assign(new EventTarget(), { matches: true });
  Object.assign(window, { matchMedia: () => preference });
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  try {
    // The lightweight DOM intentionally has no media methods.
    await act(async () => root.render(<MarketplaceItemPreview item={recipe(true)} />));
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
      const node = create(tag, options);
      if (tag === "video") Object.assign(node, { play, pause });
      return node;
    });
    await act(async () => root.render(<MarketplaceDetailPreview item={recipe(true)} />));
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    preference.matches = false;
    await act(async () => preference.dispatchEvent(new Event("change")));
    expect(play).toHaveBeenCalledTimes(2);
    const pauses = pause.mock.calls.length;
    preference.matches = true;
    await act(async () => preference.dispatchEvent(new Event("change")));
    expect(pause).toHaveBeenCalledTimes(pauses + 2);
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    host.restore();
  }
});
