import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { marketplaceAgentRequest, studioCatalog } from "@/pages/marketplace";
import { MarketplaceVisualPreview } from "../src/pages/marketplace/ui/MarketplaceVisualPreview";
import { visualAppearance, visualArtifact, visualSceneMarkup, visualStyleVariables } from "../src/pages/marketplace/lib/studio-visual-scenes";
import { remocnVisualArtifact, remocnVisualDefinition, remocnVisualSceneMarkup } from "../src/pages/marketplace/lib/studio-remocn-preview";
import { createReactHost } from "./react-host";

test("native visual previews respect motion preferences; edited title and speed survive composition handoff", async () => {
  const item = studioCatalog().find((entry) => entry.studio?.visualId === "photo-orbit")!;
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const preference = Object.assign(new EventTarget(), { matches: true });
  Object.assign(window, { matchMedia: () => preference });
  const changed = vi.fn();
  const scene = () => host.container.querySelector(".sv-scene")!;
  const click = async () => act(async () => host.container.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
  try {
    await act(async () => root.render(<MarketplaceVisualPreview item={item} onSettingsChange={changed} />));
    expect(scene().getAttribute("data-playing")).toBe("false");
    expect(scene().getAttribute("data-format")).toBe("portrait");
    let sceneHtml = scene().innerHTML;
    const replaceScene = vi.fn((html: string) => { sceneHtml = html; });
    Object.defineProperty(scene(), "innerHTML", { configurable: true, get: () => sceneHtml, set: replaceScene });
    await click();
    expect(scene().getAttribute("data-playing")).toBe("true");
    expect(scene().getAttribute("data-motion")).toBe("manual");
    const stage = host.container.querySelector(".explore-visual-stage")!;
    await act(async () => host.intersectionObservers[0]!.deliver(stage as unknown as Element, false));
    expect(scene().getAttribute("data-playing")).toBe("false");
    await act(async () => host.intersectionObservers[0]!.deliver(stage as unknown as Element, true));
    expect(scene().getAttribute("data-playing")).toBe("true");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(scene().getAttribute("data-playing")).toBe("false");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => preference.dispatchEvent(new Event("change")));
    expect(scene().getAttribute("data-playing")).toBe("false");
    preference.matches = false;
    await act(async () => preference.dispatchEvent(new Event("change")));
    expect(scene().getAttribute("data-playing")).toBe("true");
    await click();
    expect(scene().getAttribute("data-playing")).toBe("false");

    const input = host.container.findAll((node) => node.getAttribute("aria-label") === `Motion speed for ${item.name}`)[0] as unknown as HTMLInputElement;
    Object.assign(input, { attachEvent() {}, detachEvent() {} });
    await act(async () => {
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
      input.value = "1.75";
      input.dispatchEvent(new Event("keyup", { bubbles: true }));
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(changed).toHaveBeenLastCalledWith({ speed: 1.75 });
    expect(replaceScene).not.toHaveBeenCalled();
    expect(scene().style.getPropertyValue?.("--sv-speed") ?? (scene().style as unknown as Record<string, number>)["--sv-speed"]).toBe(1.75);
    const attached = marketplaceAgentRequest({ ...item, studio: { ...item.studio!, settings: { speed: 1.75 } } });
    const payload = JSON.parse(attached.attachment.instructions!.split("\n\n").at(-1)!);
    expect(payload.settings.speed).toBe(1.75);
    expect(payload.artifact).toContain("--sv-speed:1.75");
    expect(payload.artifact).toContain(visualSceneMarkup("photo-orbit"));
    expect(visualArtifact("filmstrip")).toContain("@keyframes sv-filmstrip");

    const title = host.container.querySelector("input") as unknown as HTMLInputElement;
    Object.assign(title, { type: "text", attachEvent() {}, detachEvent() {} });
    await act(async () => {
      title.dispatchEvent(new Event("focusin", { bubbles: true }));
      title.value = "My <title> / In motion";
      title.dispatchEvent(new Event("keyup", { bubbles: true }));
      title.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    const settings = { speed: 1.75, title: "My <title> / In motion" };
    expect(changed).toHaveBeenLastCalledWith(settings);
    const edited = marketplaceAgentRequest({ ...item, studio: { ...item.studio!, settings } });
    const editedPayload = JSON.parse(edited.attachment.instructions!.split("\n\n").at(-1)!);
    expect(editedPayload.settings).toEqual(settings);
    expect(editedPayload.artifact).toContain("My &lt;title><br><em>In motion</em>");
    expect(editedPayload.artifact).not.toContain("My <title>");
    expect(editedPayload.artifact).toContain("--sv-speed:1.75");
    expect(scene().innerHTML).toContain("My &lt;title><br><em>In motion</em>");
    expect(replaceScene).toHaveBeenCalledTimes(1);

    const paper = host.container.findAll((node) => node.tagName === "BUTTON" && node.textContent === "AaPaper")[0]!;
    await act(async () => paper.dispatchEvent(new Event("click", { bubbles: true })));
    const styled = changed.mock.calls.at(-1)![0];
    expect(styled).toMatchObject({ ...settings, fontWeight: 400, fontScale: 1.05, backgroundColor: "#efe9de", textColor: "#312c26" });
    const portrait = host.container.findAll((node) => node.getAttribute("aria-label") === `Portrait format for ${item.name}`)[0]!;
    await act(async () => portrait.dispatchEvent(new Event("click", { bubbles: true })));
    const portraitSettings = changed.mock.calls.at(-1)![0];
    expect(scene().getAttribute("data-format")).toBe("portrait");
    expect(replaceScene).toHaveBeenCalledTimes(1);
    const styledArtifact = visualArtifact("photo-orbit", portraitSettings);
    for (const [key, value] of Object.entries(visualStyleVariables("photo-orbit", portraitSettings))) {
      expect((scene().style as unknown as Record<string, string | number>)[key]).toBe(value);
      expect(styledArtifact).toContain(`${key}:${value}`);
    }
    expect(styledArtifact).toContain('data-format="portrait"');
    expect(visualAppearance("photo-orbit", { textColor: 'red; background:url("bad")', fontScale: Infinity, fontWeight: 50 })).toMatchObject({ textColor: "#243c32", fontScale: 1, fontWeight: 300 });

    await act(async () => root.render(<MarketplaceVisualPreview item={item} compact active={false} />));
    expect(host.container.querySelector("button")).toBeNull();
    expect(host.container.querySelector("input")).toBeNull();
    expect(scene().getAttribute("data-playing")).toBe("false");
    expect(scene().getAttribute("data-format")).toBe("portrait");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("Remocn entries use the live visual pipeline with component-specific scenes and controls", async () => {
  const catalog = studioCatalog();
  const typography = catalog.find((entry) => entry.studio?.remocnVisual?.group === "typography")!;
  const transition = catalog.find((entry) => entry.studio?.remocnVisual?.group === "transitions")!;
  expect(typography.studio?.remocnVisual?.scene).not.toBe(transition.studio?.remocnVisual?.scene);
  expect(remocnVisualSceneMarkup(typography.studio!.remocnVisual!, typography.studio!.settings)).toContain("rv-word");
  expect(remocnVisualSceneMarkup(transition.studio!.remocnVisual!, transition.studio!.settings)).not.toBe(remocnVisualSceneMarkup(typography.studio!.remocnVisual!, typography.studio!.settings));
  const artifact = remocnVisualArtifact(transition.studio!.remocnVisual!, { ...transition.studio!.settings, speed: 1.75, title: "Custom transition" }, transition.studio!.artifact);
  expect(artifact).toContain("--rv-speed:1.75");
  expect(artifact).toContain(`data-remocn-scene="${transition.studio!.remocnVisual!.scene}"`);
  const roll = remocnVisualDefinition({ id: "roll", name: "word-roll", title: "Word Roll", summary: "Animated words", group: "typography" });
  const wave = remocnVisualDefinition({ id: "wave", name: "word-wave", title: "Word Wave", summary: "Animated words", group: "typography" });
  expect(remocnVisualSceneMarkup(roll)).toContain("rv-word-roll");
  expect(remocnVisualSceneMarkup(wave)).toContain("rv-word-wave");
  expect(remocnVisualSceneMarkup(roll).replaceAll("Word Roll", "Title")).not.toBe(remocnVisualSceneMarkup(wave).replaceAll("Word Wave", "Title"));
  expect(remocnVisualDefinition({ id: "drawer", name: "drawer", title: "Drawer", summary: "Panel", group: "ui" }).scene).not.toBe("handwrite");
  expect(remocnVisualDefinition({ id: "metaballs", name: "shader-metaballs", title: "Shader Metaballs", summary: "Blobs", group: "shaders" }).scene).toBe("metaballs");
  for (const group of ["layout", "ai", "social", "effects", "filters", "shaders", "templates"]) {
    const entries = catalog.filter((entry) => entry.studio?.remocnVisual?.group === group);
    expect(new Set(entries.map((entry) => entry.studio?.remocnVisual?.scene)).size, group).toBe(entries.length);
  }

  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<MarketplaceVisualPreview item={transition} />));
    const scene = host.container.querySelector(".rv-scene")!;
    expect(scene.getAttribute("data-remocn-id")).toBe(transition.studio?.remocnVisual?.id);
    expect(scene.getAttribute("data-playing")).toBe("true");
    expect(host.container.findAll((node) => node.getAttribute("aria-label") === `Title for ${transition.name}`)).toHaveLength(1);
    expect(host.container.findAll((node) => node.getAttribute("aria-label") === `Motion speed for ${transition.name}`)).toHaveLength(1);
  } finally { await act(async () => root.unmount()); host.restore(); }
});
