import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { MarketplaceDetailCollection } from "../src/pages/marketplace/ui/MarketplaceDetailCollection";
import { studioCatalog } from "../src/pages/marketplace/lib/studio-catalog";
import { createReactHost } from "./react-host";

test("detail discovery excludes the current item, deduplicates the catalog and opens the chosen example", async () => {
  const items = studioCatalog();
  const item = items.find((entry) => entry.key === "studio:components:photo-orbit")!;
  const open = vi.fn();
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<MarketplaceDetailCollection item={item} items={[...items, ...items]} onOpenItem={open} />));
    const buttons = host.container.querySelectorAll("[data-marketplace-item-key]");
    const keys = buttons.map((button) => button.getAttribute("data-marketplace-item-key"));
    expect(keys).not.toContain(item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(5);
    await act(async () => buttons[0]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(open).toHaveBeenCalledWith(keys[0]);
    expect(host.container.querySelector('[aria-label="Sound type"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("related effects preserve the live comparison and keep preview controls separate from navigation", async () => {
  const items = studioCatalog();
  const item = items.find((entry) => entry.key === "studio:recipes:vhs-overlay")!;
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const open = vi.fn();
  const create = document.createElement.bind(document);
  vi.stubGlobal("Image", class {});
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "canvas") Object.assign(node, { getContext: () => ({}) });
    return node;
  });
  try {
    await act(async () => root.render(<MarketplaceDetailCollection item={item} items={items} onOpenItem={open} collection="similar" />));
    const card = host.container.querySelectorAll(".marketplace-effect-card").find((node) => node.querySelector("canvas"))!;
    expect(card).toBeTruthy();
    expect(card.querySelectorAll("canvas")).toHaveLength(2);
    expect(card.querySelector("canvas")?.getAttribute("aria-label")).toContain("After preview");
    expect(host.container.querySelectorAll("button input")).toHaveLength(0);
    expect(host.container.querySelectorAll("button button")).toHaveLength(0);
    const comparison = card.querySelector("input")!;
    Object.assign(comparison, { value: "80" });
    await act(async () => comparison.dispatchEvent(new Event("input", { bubbles: true })));
    expect(comparison.getAttribute("aria-valuetext")).toBe("80% original visible");
    expect(open).not.toHaveBeenCalled();
    const title = card.querySelector("[data-marketplace-item-key]")!;
    await act(async () => title.dispatchEvent(new Event("click", { bubbles: true })));
    expect(open).toHaveBeenCalledWith(title.getAttribute("data-marketplace-item-key"));
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); host.restore(); }
});
