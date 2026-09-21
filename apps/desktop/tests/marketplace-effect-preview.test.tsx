import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MarketplaceEffectControls, MarketplaceEffectPreview } from "../src/pages/marketplace/ui/MarketplaceEffectPreview";
import { createReactHost, type HostNode } from "./react-host";

const after = { kind: "video" as const, url: "/explore/noir-grade.mp4", before: { kind: "video" as const, url: "/explore/source.mp4" } };

test("comparison loops and synchronizes silent video, supports manual motion, and degrades before errors independently", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const preference = Object.assign(new EventTarget(), { matches: true });
  Object.assign(window, { matchMedia: () => preference });
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  const unavailable = vi.fn();
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "video") Object.assign(node, { play, pause, currentTime: 0, duration: 3 });
    return node;
  });
  try {
    await act(async () => root.render(<MarketplaceEffectPreview media={after} name="Noir" onUnavailable={unavailable} />));
    const videos = host.container.querySelectorAll("video") as (HostNode & { currentTime: number; duration: number; muted: boolean })[];
    expect(videos).toHaveLength(2);
    for (const video of videos) { expect(video.getAttribute("loop")).not.toBeNull(); expect(video.muted).toBe(true); }
    expect(play).not.toHaveBeenCalled();
    await act(async () => host.container.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(play).toHaveBeenCalled();
    videos[0].currentTime = 1.4;
    await act(async () => videos[0].dispatchEvent(new Event("timeupdate")));
    expect(videos[1].currentTime).toBe(1.4);
    const paused = pause.mock.calls.length;
    await act(async () => preference.dispatchEvent(new Event("change")));
    expect(pause.mock.calls.length).toBe(paused + 2);
    await act(async () => videos[1].dispatchEvent(new Event("error")));
    expect(host.container.querySelector("input")).toBeNull();
    expect(host.container.querySelectorAll("video")).toHaveLength(1);
    expect(unavailable).not.toHaveBeenCalled();
    await act(async () => videos[0].dispatchEvent(new Event("error")));
    expect(unavailable).toHaveBeenCalledOnce();
    expect(host.container.textContent).toContain("This preview could not load");
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});

test("does not invent an original for standalone effects", () => {
  const markup = renderToStaticMarkup(<MarketplaceEffectPreview media={{ kind: "image", url: "/preview.webp" }} name="Glow" />);
  expect(markup).not.toContain('type="range"');
  expect(markup).not.toContain("Before");
  expect(markup).toContain('alt="Effect preview for Glow"');
});

test("effect rulers preserve the handoff amount and can move outside the preview", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const change = vi.fn();
  try {
    const controls = (amount: number) => <MarketplaceEffectControls effectId="voxel-dither" name="Desert racer" settings={{ amount }} onSettingsChange={change} />;
    await act(async () => root.render(controls(50)));
    const input = host.container.querySelector(".ruler-slider input") as unknown as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(input.getAttribute("aria-valuetext")).toBe("10 pixels");
    Object.assign(input, { attachEvent() {}, detachEvent() {} });
    await act(async () => {
      input.dispatchEvent(new Event("focusin", { bubbles: true }));
      input.value = "72";
      input.dispatchEvent(new Event("keyup", { bubbles: true }));
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(change).toHaveBeenLastCalledWith({ amount: 72 });
    await act(async () => root.render(controls(72)));
    expect(host.container.querySelector("output")?.textContent).toBe("14 px");
    expect(input.getAttribute("aria-valuetext")).toBe("14 pixels");
    await act(async () => input.dispatchEvent(new Event("dblclick", { bubbles: true })));
    expect(change).toHaveBeenLastCalledWith({ amount: 50 });
    const markup = renderToStaticMarkup(<MarketplaceEffectPreview media={after} name="Desert racer" effectId="voxel-dither" showControls={false} />);
    expect(markup).not.toContain("ruler-slider");
    expect(markup).toContain('aria-label="Preview comparison for Desert racer"');
  } finally { await act(async () => root.unmount()); host.restore(); }
});
