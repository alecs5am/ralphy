import { act, createElement, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto } from "../electron/ralphy/types";
import { MediaCardTile, VirtualAssetGrid } from "../src/components/VirtualAssetGrid";
import { MAX_WAVEFORM_DECODE_BYTES } from "../src/lib/audio-preview";
import type { ProjectPreview, ProjectReference } from "../src/lib/ipc";
import { assetGridGeometry, createPreviewScheduler, previewScheduler } from "../src/lib/media";
import { createReactHost, type HostNode } from "./react-host";

const project: ProjectReference = { workspaceId: "workspace-grid", projectId: "project-grid" };

function mediaCard(id: string, mime = "image/png", bytes = 2048): MediaCardDto {
  return {
    ref: { type: "object", id }, workspaceId: project.workspaceId, projectId: project.projectId,
    storageClass: "final", mime, bytes, createdAt: 1, referenceCount: 1, target: { type: "object", id },
  };
}

async function mounted(element: ReactElement) {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => { root.render(element); await Promise.resolve(); await Promise.resolve(); });
  return {
    host,
    rerender: async (next: ReactElement) => { await act(async () => { root.render(next); await Promise.resolve(); await Promise.resolve(); }); },
    rerenderSync: (next: ReactElement) => flushSync(() => root.render(next)),
    flush: async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); },
    unmount: async () => { await act(async () => root.unmount()); host.restore(); },
  };
}

function tile(
  card: MediaCardDto,
  rootEpoch: number,
  resolvePreview: (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>,
  targetProject = project,
  onSelect = () => undefined,
  onOpen = () => undefined,
) {
  return createElement(MediaCardTile, { card, project: targetProject, rootEpoch, selected: false, resolvePreview, onSelect, onOpen });
}

function grid(cards: MediaCardDto[], rootEpoch: number, resolvePreview: (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>, targetProject = project, onSelect = () => undefined, onOpen = () => undefined) {
  return createElement(VirtualAssetGrid, { items: cards, project: targetProject, rootEpoch, selectedRef: null, resolvePreview, onSelect, onOpen });
}

function byTag(root: HostNode, tag: string): HostNode[] { return root.findAll((node) => node.tagName === tag); }
function byLabel(root: HostNode, label: string): HostNode {
  const node = root.findAll((candidate) => candidate.getAttribute("aria-label") === label)[0];
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
function dispatchKey(node: HostNode, type: "keydown" | "keyup", key: string): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "key", { value: key });
  node.dispatchEvent(event);
}

describe("media grid geometry and scheduling", () => {
  test("derives non-overlapping 16:10 rows at narrow, medium, and wide widths", () => {
    expect(assetGridGeometry(492, 190, 16)).toEqual({ columns: 2, tileWidth: 238, tileHeight: 202.75, rowHeight: 218.75, gap: 16 });
    expect(assetGridGeometry(688, 190, 16)).toEqual({ columns: 3, tileWidth: 218.66666666666666, tileHeight: 190.66666666666666, rowHeight: 206.66666666666666, gap: 16 });
    expect(assetGridGeometry(1000, 190, 16)).toEqual({ columns: 4, tileWidth: 238, tileHeight: 202.75, rowHeight: 218.75, gap: 16 });
  });

  test("enforces the production 4/2/1 limits with FIFO, idempotent, error, and queued-unmount release", async () => {
    const image = await Promise.all(Array.from({ length: 4 }, () => previewScheduler.acquire("image")));
    const video = await Promise.all(Array.from({ length: 2 }, () => previewScheduler.acquire("video")));
    const audio = await previewScheduler.acquire("audio");
    const order: string[] = [];
    const fifth = previewScheduler.acquire("image").then((release) => { order.push("fifth"); return release; });
    const sixth = previewScheduler.acquire("image").then((release) => { order.push("sixth"); return release; });
    await Promise.resolve();
    expect(order).toEqual([]);
    image[0]();
    const releaseFifth = await fifth;
    expect(order).toEqual(["fifth"]);
    image[0]();
    await Promise.resolve();
    expect(order).toEqual(["fifth"]);
    try { throw new Error("preview failed"); } catch {} finally { releaseFifth(); }
    const releaseSixth = await sixth;
    expect(order).toEqual(["fifth", "sixth"]);

    let disposed = true;
    const queuedUnmount = previewScheduler.acquire("audio").then((release) => { if (disposed) release(); });
    let followerReady = false;
    const follower = previewScheduler.acquire("audio").then((release) => { followerReady = true; return release; });
    audio();
    await queuedUnmount;
    const releaseFollower = await follower;
    expect(followerReady).toBe(true);
    disposed = false;
    releaseFollower();
    releaseSixth();
    image.slice(1).forEach((release) => release());
    video.forEach((release) => release());
  });

  test("keeps scheduler kinds independent", async () => {
    const scheduler = createPreviewScheduler({ image: 1, video: 1, audio: 1 });
    const releaseImage = await scheduler.acquire("image");
    const releaseVideo = await scheduler.acquire("video");
    let nextImage = false;
    const waiting = scheduler.acquire("image").then((release) => { nextImage = true; return release; });
    await Promise.resolve();
    expect(nextImage).toBe(false);
    releaseImage();
    (await waiting)();
    releaseVideo();
  });
});

describe("mounted media tiles", () => {
  test("uses the real virtualizer measurements and resolves only mounted rows", async () => {
    const cards = Array.from({ length: 100 }, (_, index) => mediaCard(`real-${index}`));
    const resolver = vi.fn(async () => null);
    const view = await mounted(grid(cards, 201, resolver));
    try {
      expect(resolver.mock.calls.length).toBeGreaterThan(0);
      expect(resolver.mock.calls.length).toBeLessThan(cards.length);
      expect(byTag(view.host.container, "ARTICLE").length).toBe(resolver.mock.calls.length);
    } finally { await view.unmount(); }
  });

  test("publishes lazy image and muted metadata video previews", async () => {
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: 2048 }));
    const imageCard = mediaCard("lazy-image");
    const image = await mounted(tile(imageCard, 202, resolver));
    try {
      expect(byTag(image.host.container, "IMG")).toHaveLength(1);
      expect(renderToStaticMarkup(tile(imageCard, 202, resolver))).toContain('loading="lazy"');
    } finally { await image.unmount(); }
    const videoCard = mediaCard("metadata-video", "video/mp4");
    const video = await mounted(tile(videoCard, 203, resolver));
    try {
      expect(byTag(video.host.container, "VIDEO")).toHaveLength(1);
      const markup = renderToStaticMarkup(tile(videoCard, 203, resolver));
      expect(markup).toContain('preload="metadata"');
      expect(markup).toContain('muted=""');
    } finally { await video.unmount(); }
  });

  test("separates colon-bearing Project identities in the preview cache", async () => {
    const resolver = vi.fn(async () => ({ url: "ralphy-media://preview/tuple", sizeBytes: 2048 }));
    const card = mediaCard("tuple-ref");
    const first = await mounted(tile(card, 204, resolver, { workspaceId: "a:b", projectId: "c" }));
    await first.unmount();
    const second = await mounted(tile(card, 204, resolver, { workspaceId: "a", projectId: "b:c" }));
    try { expect(resolver).toHaveBeenCalledTimes(2); } finally { await second.unmount(); }
  });

  test("never renders the previous identity source during the replacement commit", async () => {
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: 2048 }));
    const card = mediaCard("same-ref");
    const view = await mounted(tile(card, 205, resolver));
    try {
      expect(byTag(view.host.container, "IMG")).toHaveLength(1);
      act(() => {
        view.rerenderSync(tile(card, 206, resolver, { workspaceId: "other", projectId: "other" }));
        expect(byTag(view.host.container, "IMG")).toHaveLength(0);
      });
    } finally { await view.unmount(); }
  });

  test.each([
    ["image", "image/png", "IMG"],
    ["video", "video/mp4", "VIDEO"],
    ["audio", "audio/wav", "AUDIO"],
  ])("restores the %s glyph and invalidates the cache after media failure", async (_kind, mime, tag) => {
    const resolver = vi.fn(async () => ({ url: `ralphy-media://preview/failing-${tag}`, sizeBytes: MAX_WAVEFORM_DECODE_BYTES + 1 }));
    const card = mediaCard(`failing-${tag}`, mime, MAX_WAVEFORM_DECODE_BYTES + 1);
    const first = await mounted(tile(card, 207, resolver));
    try {
      const media = byTag(first.host.container, tag)[0];
      expect(media).toBeDefined();
      await act(async () => { media.dispatchEvent(new Event("error", { bubbles: true })); await Promise.resolve(); });
      expect(byTag(first.host.container, tag)).toHaveLength(0);
      expect(byTag(first.host.container, "SVG").length).toBeGreaterThan(0);
    } finally { await first.unmount(); }
    const retry = await mounted(tile(card, 207, resolver));
    try { expect(resolver).toHaveBeenCalledTimes(2); } finally { await retry.unmount(); }
  });

  test("holds the audio slot through bounded decode and releases it on unmount", async () => {
    const cards = [mediaCard("bounded-a", "audio/wav", 2048), mediaCard("bounded-b", "audio/wav", 2048)];
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: 2048 }));
    const view = await mounted(grid(cards, 208, resolver));
    try {
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["bounded-a"]);
      const audio = byTag(view.host.container, "AUDIO")[0] as HostNode & { duration: number; volume: number; muted: boolean };
      audio.duration = 30; audio.volume = 1; audio.muted = false;
      await act(async () => { audio.dispatchEvent(new Event("loadedmetadata", { bubbles: true })); await Promise.resolve(); });
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["bounded-a"]);
      await view.rerender(grid([cards[1]], 208, resolver));
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["bounded-a", "bounded-b"]);
    } finally { await view.unmount(); }
  });

  test("serializes large audio until streaming metadata is ready and skips decode", async () => {
    const bytes = MAX_WAVEFORM_DECODE_BYTES + 1;
    const cards = [mediaCard("stream-a", "audio/mpeg", bytes), mediaCard("stream-b", "audio/mpeg", bytes)];
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: bytes }));
    const view = await mounted(grid(cards, 209, resolver));
    try {
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["stream-a"]);
      const audio = byTag(view.host.container, "AUDIO")[0] as HostNode & { duration: number; volume: number; muted: boolean };
      audio.duration = 30; audio.volume = 1; audio.muted = false;
      await act(async () => { audio.dispatchEvent(new Event("loadedmetadata", { bubbles: true })); await Promise.resolve(); });
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["stream-a", "stream-b"]);
      expect(view.host.container.findAll((node) => node.getAttribute("class")?.includes("audio-waveform-canvas") ?? false)).toHaveLength(0);
    } finally { await view.unmount(); }
  });

  test("evicts the oldest preview after 128 immutable cache entries", async () => {
    const resolver = vi.fn(async () => null);
    const first = mediaCard("cache-0");
    const view = await mounted(tile(first, 210, resolver));
    try {
      for (let index = 1; index <= 128; index += 1) await view.rerender(tile(mediaCard(`cache-${index}`), 210, resolver));
      await view.rerender(tile(first, 210, resolver));
      expect(resolver).toHaveBeenCalledTimes(130);
    } finally { await view.unmount(); }
  });

  test("dispatches click, Enter, Space, double-click, Tab, and keyboard Open without nested buttons", async () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const view = await mounted(tile(mediaCard("accessible"), 211, async () => null, project, onSelect, onOpen));
    try {
      const selection = byLabel(view.host.container, "image/png");
      const open = byLabel(view.host.container, "Open image/png");
      selection.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      dispatchKey(selection, "keydown", "Enter");
      dispatchKey(selection, "keydown", " ");
      dispatchKey(selection, "keyup", " ");
      selection.dispatchEvent(new Event("dblclick", { bubbles: true, cancelable: true }));
      expect(onSelect).toHaveBeenCalledTimes(3);
      expect(onOpen).toHaveBeenCalledOnce();
      selection.focus();
      dispatchKey(selection, "keydown", "Tab");
      expect(document.activeElement).toBe(open);
      dispatchKey(open, "keydown", "Enter");
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(selection.findAll((node) => node.tagName === "BUTTON")).toHaveLength(1);
    } finally { await view.unmount(); }
  });
});
