import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { studioCatalog } from "../src/pages/marketplace/lib/studio-catalog";
import { marketplacePreview } from "../src/pages/marketplace/ui/MarketplaceItemPreview";
import { MarketplaceCreativeResults } from "../src/pages/marketplace/ui/MarketplaceCreativeResults";
import { createReactHost, type HostNode } from "./react-host";

test("every studio category supplies its expected tagged resources with real bundled previews", () => {
  const items = studioCatalog().filter((item) => item.sourceLabel === "Ralphy studio examples");
  const counts = { templates: 9, components: 8, recipes: 8, sounds: 8, prompts: 10 };
  for (const category of ["templates", "components", "recipes", "sounds", "prompts"] as const) {
    const group = items.filter((item) => item.category === category);
    expect(group).toHaveLength(counts[category]);
    for (const item of group) {
      expect(item.tags.length).toBeGreaterThan(0);
      const preview = marketplacePreview(item)!;
      expect(preview).toBeTruthy();
      for (const url of [preview.url, preview.before?.url, preview.posterUrl].filter(Boolean) as string[]) {
        expect(url).toMatch(/^\/?explore\//);
        expect(readFileSync(join(process.cwd(), "public", url.replace(/^\//, ""))).byteLength).toBeGreaterThan(100);
      }
    }
    const html = renderToStaticMarkup(<MarketplaceCreativeResults items={group} category={category} onOpenItem={() => {}} />);
    expect(html).toContain(`${counts[category]} previews`);
    if (category === "recipes") {
      expect(html.match(/class="explore-audio-compare /g)).toHaveLength(2);
      expect(html.match(/class="explore-effect-preview explore-effect-preview-compact"/g)).toHaveLength(6);
      expect(html).not.toContain("Sound library");
    } else if (category === "sounds") {
      expect(html.match(/class="explore-sound-row /g)).toHaveLength(8);
      expect(html).not.toContain("explore-sound-transport");
    } else expect(html.match(/aspect-content/g)).toHaveLength(counts[category]);
  }
});

test("effect gallery hosts inline audio comparison and archives only a broken output", async () => {
  const items = studioCatalog().filter((item) => item.category === "recipes" && marketplacePreview(item)?.kind === "audio");
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const open = vi.fn();
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") {
      const audio = Object.assign(node as unknown as HostNode, {
        paused: true,
        play: () => { audio.paused = false; audio.dispatchEvent(new Event("play")); return Promise.resolve(); },
        pause: () => { audio.paused = true; audio.dispatchEvent(new Event("pause")); },
      });
    }
    return node;
  });
  try {
    await act(async () => root.render(<MarketplaceCreativeResults items={items} category="recipes" onOpenItem={open} />));
    expect(host.container.querySelectorAll(".explore-audio-compare")).toHaveLength(2);
    expect(host.container.querySelectorAll("button button")).toHaveLength(0);
    const play = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === `Play effect ${items[0]!.name}`)!;
    await act(async () => play.dispatchEvent(new Event("click", { bubbles: true })));
    expect(open).not.toHaveBeenCalled();
    await act(async () => host.container.querySelector("audio")!.dispatchEvent(new Event("error")));
    expect(host.container.querySelectorAll(".explore-audio-compare")).toHaveLength(1);
    expect(host.container.textContent).toContain("1 preview · 1 archived");
    const archive = host.container.querySelector("input")!;
    Object.assign(archive, { type: "checkbox", checked: true });
    await act(async () => archive.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelector(".marketplace-archived-list")?.textContent).toContain(items[0]!.name);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});
