import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { MarketplacePublicItemDetail, MarketplaceScreenView, marketplaceAgentRequest, presentMarketplaceSources, studioCatalog, type MarketplaceLocation, type MarketplaceQueryState } from "@/pages/marketplace";
import { bridge } from "@/shared/api/ipc";
import { marketplaceStudioReference } from "../src/pages/marketplace/lib/agent-request";
import { createReactHost } from "./react-host";

// Pixel rendering has its own test; this checks real route, slider and agent handoff wiring.
vi.mock("../src/pages/marketplace/lib/use-effect-studio", () => ({ useEffectStudio: () => {} }));

test("baseball template copies and hands off its two exact prompt modules with portable example media", async () => {
  vi.stubEnv("BASE_URL", "./");
  const catalog = studioCatalog();
  const item = catalog.find((entry) => entry.key === "studio:templates:baseball-broadcast")!;
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const copy = vi.spyOn(bridge, "copyText").mockResolvedValue();
  const use = vi.fn();
  const open = vi.fn();
  const base = "file:///Applications/Ralphy%20Media.app/Contents/Resources/app/dist/index.html";
  Object.defineProperty(document, "baseURI", { configurable: true, value: base });
  try {
    await act(async () => root.render(<MarketplacePublicItemDetail item={item} items={catalog} onBack={vi.fn()} onOpenItem={open} onUse={use} />));
    const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.textContent === label)!;
    await act(async () => button("Copy template reference").dispatchEvent(new Event("click", { bubbles: true })));
    const copied = JSON.parse(copy.mock.calls.at(-1)![0]);
    await act(async () => button("Use in chat").dispatchEvent(new Event("click", { bubbles: true })));
    const handoff = JSON.parse(marketplaceAgentRequest(use.mock.calls[0]![0]).attachment.instructions!.split("\n\n").at(-1)!);
    expect(handoff).toMatchObject(copied);
    expect(handoff.modules).toHaveLength(2);
    for (const [index, key] of ["studio:prompts:baseball-broadcast-image", "studio:prompts:baseball-broadcast-motion"].entries()) {
      const module = catalog.find((entry) => entry.key === key)!;
      expect(handoff.modules[index]).toMatchObject({ key, step: index + 1, category: "prompts", instructions: module.studio!.body, artifact: module.studio!.artifact });
      const link = host.container.querySelector(`[data-module-key="${key}"] button`)!;
      await act(async () => link.dispatchEvent(new Event("click", { bubbles: true })));
      expect(open).toHaveBeenLastCalledWith(key);
    }
    expect(handoff.preview.path).toBe("/Applications/Ralphy Media.app/Contents/Resources/app/dist/explore/studio/baseball-broadcast-example.mp4");
    expect(handoff.reference.url).toBe("https://yce.perfectcorp.com/use-case/ai-baseball-broadcast-trend");
    expect(handoff.mediaCredit).toContain("User-provided");
    expect(handoff.modules[0].instructions).toContain("[jersey colors]");
    expect(handoff.modules[0].instructions).toContain("[stadium lighting]");
    expect(handoff.modules[1].instructions).toContain("0–4 seconds");
    const unresolved = { ...item, studio: { ...item.studio!, modules: [{ key: "studio:prompts:missing", step: 0, role: "Missing" }] } };
    expect(marketplaceStudioReference(unresolved).modules).toEqual([{ key: "studio:prompts:missing", step: 0, role: "Missing", unavailable: true }]);
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllEnvs(); }
});

test("studio details resolve offline across filters, carry adjusted dither settings and reject unknown keys", async () => {
  const item = studioCatalog().find((entry) => entry.studio?.effectId === "voxel-dither")!;
  const query: MarketplaceQueryState = { text: "not-in-this-result", filters: { category: "prompts", source: "all", license: "all", compatibility: "all", modality: "all", format: "all" }, sort: "relevance" };
  const snapshot = presentMarketplaceSources(null, null, query, [], { publicLibrary: "unavailable", models: "unavailable" }, null, null, studioCatalog());
  expect(snapshot.items).toEqual([]);
  const location: MarketplaceLocation = { route: { kind: "detail", itemId: item.key }, query, selectedItemId: item.key, scrollTop: 0, focusId: null };
  const request = vi.fn();
  const mutate = vi.fn();
  const copy = vi.spyOn(bridge, "copyText").mockResolvedValue();
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const render = (current = location) => root.render(<MarketplaceScreenView catalog={null} location={current} snapshot={snapshot} sidebarVisible onBack={vi.fn()} onNavigate={vi.fn()} onRememberLocation={vi.fn()} onRetry={vi.fn()} onInstallAction={mutate} onRequestAgent={request} />);
  try {
    await act(async () => render());
    expect(host.container.querySelector("#marketplace-public-title")?.textContent).toBe(item.name);
    expect(host.container.textContent).not.toContain("Library item unavailable");
    const slider = host.container.querySelector(".ruler-slider input") as unknown as HTMLInputElement;
    expect(slider.value).toBe("50");
    Object.assign(slider, { attachEvent() {}, detachEvent() {} });
    await act(async () => {
      slider.dispatchEvent(new Event("focusin", { bubbles: true }));
      slider.value = "100";
      slider.dispatchEvent(new Event("keyup", { bubbles: true }));
      slider.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    const copySettings = host.container.querySelectorAll("button").find((node) => node.textContent === "Copy effect settings")!;
    await act(async () => copySettings.dispatchEvent(new Event("click", { bubbles: true })));
    expect(JSON.parse(copy.mock.calls.at(-1)![0])).toEqual({ effectId: "voxel-dither", settings: { amount: 100 }, instructions: item.studio!.body, exampleCommand: item.studio!.artifact });
    const use = host.container.querySelectorAll("button").find((node) => node.textContent === "Use in chat")!;
    await act(async () => use.dispatchEvent(new Event("click", { bubbles: true })));
    expect(request).toHaveBeenCalledOnce();
    const draft = request.mock.calls[0]![0];
    const attached = JSON.parse(draft.attachment.instructions.split("\n\n").at(-1));
    expect(attached).toMatchObject({ key: item.key, category: "recipes", source: { bundled: true }, settings: { amount: 100 }, instructions: item.studio!.body, artifact: item.studio!.artifact });
    expect(draft.attachment.instructions).not.toContain("library templates/recipes/assets show");
    expect(mutate).not.toHaveBeenCalled();

    await act(async () => render({ ...location, route: { kind: "detail", itemId: "studio:recipes:missing" }, selectedItemId: "studio:recipes:missing" }));
    expect(host.container.textContent).toContain("Library item unavailable");
    expect(host.container.querySelector("#marketplace-public-title")).toBeNull();
    expect(host.container.querySelectorAll("button").some((node) => node.textContent === "Use in chat")).toBe(false);
    expect(request).toHaveBeenCalledOnce();

    const sound = studioCatalog().find((entry) => entry.category === "sounds")!;
    const portableSound = { ...sound, studio: { ...sound.studio!, preview: { ...sound.studio!.preview, url: "./explore/studio/sound-pulse.wav" } } };
    for (const base of ["file:///workspace/apps/desktop/dist/index.html", "file:///Applications/Ralphy%20Media.app/Contents/Resources/app/dist/index.html", "http://localhost:5173/"]) {
      Object.defineProperty(document, "baseURI", { configurable: true, value: base });
      const audioData = JSON.parse(marketplaceAgentRequest(portableSound).attachment.instructions!.split("\n\n").at(-1)!);
      expect(audioData.preview.url).toBe(new URL("./explore/studio/sound-pulse.wav", base).href);
      if (base.startsWith("file:")) expect(audioData.preview.path).toBe(decodeURIComponent(new URL(audioData.preview.url).pathname));
      else expect(audioData.preview.path).toBeUndefined();
    }
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});

test("copied photo components resolve bundled images outside the application page", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const copy = vi.spyOn(bridge, "copyText").mockResolvedValue();
  const item = studioCatalog().find((entry) => entry.studio?.visualId === "photo-orbit")!;
  const base = "file:///Applications/Ralphy%20Media.app/Contents/Resources/app/dist/index.html";
  Object.defineProperty(document, "baseURI", { configurable: true, value: base });
  try {
    await act(async () => root.render(<MarketplacePublicItemDetail item={item} onBack={vi.fn()} />));
    const portrait = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === `Portrait format for ${item.name}`)!;
    await act(async () => portrait.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelector(".explore-detail-stage .sv-scene")?.getAttribute("data-format")).toBe("portrait");
    expect(host.container.querySelector(".explore-stage-toolbar")?.textContent).toContain("9:16");
    const button = host.container.querySelectorAll("button").find((node) => node.textContent === "Copy artifact")!;
    await act(async () => button.dispatchEvent(new Event("click", { bubbles: true })));
    const html = copy.mock.calls.at(-1)![0];
    expect(html).toContain('data-format="portrait"');
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]!);
    expect(images).toHaveLength(5);
    expect(images).toContain(new URL(item.studio!.preview.url, base).href);
    expect(images.every((url) => url.startsWith("file:///"))).toBe(true);
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});
