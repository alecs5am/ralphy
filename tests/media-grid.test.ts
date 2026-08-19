import { act, createElement, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MediaCardDto } from "../electron/ralphy/types";
import { MediaCardTile, VirtualAssetGrid } from "../src/components/VirtualAssetGrid";
import { AudioWaveform } from "../src/components/media/AudioWaveform";
import { MAX_WAVEFORM_DECODE_BYTES } from "../src/lib/audio-preview";
import type { ProjectPreview, ProjectReference } from "../src/lib/ipc";
import { assetGridGeometry, createPreviewScheduler, mediaFallbackAspectRatio, previewScheduler } from "../src/lib/media";
import { useRememberedScroll } from "../src/screens/project/scroll-memory";
import { createReactHost, type HostNode } from "./react-host";

const waveSurfer = vi.hoisted(() => ({ instances: [] as Array<{ emit(event: string, ...args: unknown[]): void }> }));
vi.mock("wavesurfer.js", () => ({
  default: {
    create: () => {
      const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
      const instance = {
        on(event: string, callback: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), callback]); },
        emit(event: string, ...args: unknown[]) { listeners.get(event)?.forEach((callback) => callback(...args)); },
        destroy() {}, getCurrentTime: () => 0, playPause: async () => undefined,
        setTime() {}, setMuted() {}, setVolume() {},
      };
      waveSurfer.instances.push(instance);
      return instance;
    },
  },
}));

const project: ProjectReference = { workspaceId: "workspace-grid", projectId: "project-grid" };

function mediaCard(id: string, mime = "image/png", bytes = 2048): MediaCardDto {
  return {
    ref: { type: "object", id }, workspaceId: project.workspaceId, projectId: project.projectId,
    storageClass: "final", mime, bytes, createdAt: 1, referenceCount: 1, target: { type: "object", id },
    mediaKind: mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : mime.startsWith("image/") ? "image" : "document",
    provenance: "not-generation",
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
    unmount: async () => { await act(async () => { root.unmount(); await Promise.resolve(); await Promise.resolve(); }); host.restore(); },
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
  return createElement(MediaCardTile, { card, project: targetProject, rootEpoch, selected: false, resolvePreview, onSelect, onOpen, onContextMenu: () => undefined });
}

function grid(
  cards: MediaCardDto[],
  rootEpoch: number,
  resolvePreview: (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>,
  targetProject = project,
  onSelect = () => undefined,
  onOpen = () => undefined,
  paging: Record<string, unknown> = {},
) {
  return createElement(VirtualAssetGrid, {
    items: cards,
    project: targetProject,
    rootEpoch,
    selectedRef: null,
    resolvePreview,
    onSelect,
    onOpen,
    onContextMenu: () => undefined,
    density: 230,
    hasMore: false,
    loadingMore: false,
    appendError: null,
    onLoadMore: () => undefined,
    onRetryAppend: () => undefined,
    scrollMemory: new Map<string, number>(),
    scrollKey: "media",
    scrollResetToken: rootEpoch,
    ...paging,
  } as never);
}

function byTag(root: HostNode, tag: string): HostNode[] { return root.findAll((node) => node.tagName === tag); }
function bySrc(root: HostNode, src: string): HostNode[] { return root.findAll((node) => node.getAttribute("src") === src); }
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

function ScrollOwners({
  memory,
  overviewReset,
  mediaReset,
  revision,
}: {
  memory: Map<string, number>;
  overviewReset: number;
  mediaReset: number;
  revision: number;
}) {
  const overview = useRememberedScroll(memory, "overview", overviewReset);
  const media = useRememberedScroll(memory, "media", mediaReset);
  return createElement("section", null,
    createElement("div", { className: "project-domain-body", key: `overview-${revision}`, ref: overview.ref, onScroll: overview.onScroll }),
    createElement("div", { className: "asset-grid-scroll", key: `media-${revision}`, ref: media.ref, onScroll: media.onScroll }),
  );
}

beforeEach(() => { waveSurfer.instances.length = 0; });

describe("media grid geometry and scheduling", () => {
  test("groups compact audio controls for vertical centering without changing the full viewer", async () => {
    const view = await mounted(createElement(AudioWaveform, { src: "ralphy-media://preview/audio", name: "Voiceover", sizeBytes: MAX_WAVEFORM_DECODE_BYTES + 1, compact: true }));
    try {
      expect(view.host.container.findAll((node) => node.getAttribute("class") === "audio-compact-content")).toHaveLength(1);
      await view.rerender(createElement(AudioWaveform, { src: "ralphy-media://preview/audio", name: "Voiceover", sizeBytes: MAX_WAVEFORM_DECODE_BYTES + 1 }));
      expect(view.host.container.findAll((node) => node.getAttribute("class") === "audio-compact-content")).toHaveLength(0);
    } finally { await view.unmount(); }
  });

  test("gives nonvisual media stable bounded masonry proportions", () => {
    expect(mediaFallbackAspectRatio("audio", "a")).toBe(1.6);
    expect(mediaFallbackAspectRatio(null, "document-a")).toBeGreaterThanOrEqual(0.72);
    expect(mediaFallbackAspectRatio(null, "document-a")).toBeLessThanOrEqual(1.15);
    expect(mediaFallbackAspectRatio(null, "document-a")).toBe(mediaFallbackAspectRatio(null, "document-a"));
    expect(mediaFallbackAspectRatio(null, "document-a")).not.toBe(mediaFallbackAspectRatio(null, "document-b"));
  });

  test("derives non-overlapping 16:10 rows at narrow, medium, and wide widths", () => {
    expect(assetGridGeometry(492, 190, 16)).toEqual({ columns: 2, tileWidth: 238, tileHeight: 202.75, rowHeight: 218.75, gap: 16 });
    expect(assetGridGeometry(688, 190, 16)).toEqual({ columns: 3, tileWidth: 218.66666666666666, tileHeight: 190.66666666666666, rowHeight: 206.66666666666666, gap: 16 });
    expect(assetGridGeometry(1000, 190, 16)).toEqual({ columns: 4, tileWidth: 238, tileHeight: 202.75, rowHeight: 218.75, gap: 16 });
  });

  test("uses four natural-ratio lanes with ten-pixel gaps at the Media reference width", async () => {
    const cards = Array.from({ length: 8 }, (_, index) => mediaCard(`lane-${index}`));
    const view = await mounted(grid(cards, 4, async () => null, project, undefined, undefined, { density: 190 }));
    try {
      const items = view.host.container.findAll((node) => node.getAttribute("class") === "virtual-masonry-item");
      expect([...new Set(items.map((item) => item.getAttribute("data-lane")))]).toEqual(["0", "1", "2", "3"]);
      expect(items.find((item) => item.getAttribute("data-lane") === "1")?.style.left).toBe("202.5px");
    } finally { await view.unmount(); }
  });

  test("caps project media density without changing normal geometry", () => {
    expect(assetGridGeometry(1000, 190, 16)).toMatchObject({ columns: 4 });
    expect(assetGridGeometry(2300, 230, 16, 7)).toMatchObject({ columns: 7 });
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
  test("remeasures the grid when filtered results replace an empty page", async () => {
    const host = createReactHost();
    let observed = 0;
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(node: Element) {
        observed += 1;
        this.callback([{ target: node, contentRect: { width: 1490 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(grid([], 200, async () => null)); await Promise.resolve(); });
      expect(observed).toBe(0);
      await act(async () => { root.render(grid(Array.from({ length: 12 }, (_, index) => mediaCard(`filtered-${index}`)), 200, async () => null)); await Promise.resolve(); await Promise.resolve(); });
      expect(observed).toBeGreaterThan(1);
      const items = host.container.querySelectorAll(".virtual-masonry-item");
      expect(items.length).toBeGreaterThan(6);
      expect(new Set(items.map((item) => item.style.left)).size).toBe(6);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("automatic cursor scroll memory isolates owners and resets only the changed token", async () => {
    const memory = new Map<string, number>();
    const render = (revision: number, overviewReset = 1, mediaReset = 1) => createElement(ScrollOwners, {
      memory,
      revision,
      overviewReset,
      mediaReset,
    });
    const view = await mounted(render(1));
    try {
      let overviewOwner = view.host.container.querySelector(".project-domain-body")!;
      let mediaOwner = view.host.container.querySelector(".asset-grid-scroll")!;
      overviewOwner.scrollTop = 140;
      mediaOwner.scrollTop = 280;
      overviewOwner.dispatchEvent(new Event("scroll"));
      mediaOwner.dispatchEvent(new Event("scroll"));
      expect([...memory]).toEqual([["overview", 140], ["media", 280]]);

      await view.rerender(render(2));
      overviewOwner = view.host.container.querySelector(".project-domain-body")!;
      mediaOwner = view.host.container.querySelector(".asset-grid-scroll")!;
      expect(overviewOwner.scrollTop).toBe(140);
      expect(mediaOwner.scrollTop).toBe(280);

      await view.rerender(render(2, 1, 2));
      expect(overviewOwner.scrollTop).toBe(140);
      expect(mediaOwner.scrollTop).toBe(0);
      expect([...memory]).toEqual([["overview", 140]]);
    } finally { await view.unmount(); }
  });

  test("automatic cursor observes the exact Media owner and rearms only after leaving the tail", async () => {
    const onLoadMore = vi.fn();
    const scrollMemory = new Map<string, number>();
    const paging = (loadingMore: boolean) => ({
      hasMore: true,
      loadingMore,
      appendError: null,
      onLoadMore,
      onRetryAppend: vi.fn(),
      scrollMemory,
      scrollKey: "media",
      scrollResetToken: 1,
    });
    const render = (loadingMore: boolean) => grid(
      [mediaCard("automatic-cursor")],
      215,
      async () => null,
      project,
      undefined,
      undefined,
      paging(loadingMore),
    );
    const view = await mounted(render(false));
    try {
      expect(view.host.intersectionObservers).toHaveLength(1);
      const observer = view.host.intersectionObservers[0];
      const owner = view.host.container.querySelector(".asset-grid-scroll")!;
      const space = owner.querySelector(".virtual-grid-space")!;
      const sentinel = owner.querySelector(".auto-cursor-tail")!;
      expect(observer.root).toBe(owner);
      expect(owner.contains(sentinel)).toBe(true);
      expect(owner.children.indexOf(sentinel)).toBeGreaterThan(owner.children.indexOf(space));
      expect(observer.rootMargin).toBe("240px 0px");

      act(() => observer.deliver(sentinel as unknown as Element, true));
      await view.rerender(render(true));
      expect(view.host.container.querySelector("[role='status']")?.textContent).toContain("Loading");
      await view.rerender(render(false));
      act(() => observer.deliver(sentinel as unknown as Element, true));
      expect(onLoadMore).toHaveBeenCalledOnce();
      expect(view.host.intersectionObservers).toHaveLength(1);

      act(() => observer.deliver(sentinel as unknown as Element, false));
      act(() => observer.deliver(sentinel as unknown as Element, true));
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    } finally { await view.unmount(); }
  });

  test("automatic cursor keeps append errors in the tail and never loads a null cursor", async () => {
    const onLoadMore = vi.fn();
    const onRetryAppend = vi.fn();
    const scrollMemory = new Map<string, number>();
    const render = (hasMore: boolean, appendError: string | null) => grid(
      [mediaCard("automatic-error")],
      216,
      async () => null,
      project,
      undefined,
      undefined,
      {
        hasMore,
        loadingMore: false,
        appendError,
        onLoadMore,
        onRetryAppend,
        scrollMemory,
        scrollKey: "media",
        scrollResetToken: 1,
      },
    );
    const view = await mounted(render(true, "Offline"));
    try {
      const observer = view.host.intersectionObservers[0];
      const sentinel = view.host.container.querySelector(".auto-cursor-tail")!;
      const alert = view.host.container.querySelector("[role='alert']")!;
      expect(alert.textContent).toContain("Offline");
      const retry = alert.querySelector("button")!;
      retry.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      expect(onRetryAppend).toHaveBeenCalledOnce();
      act(() => observer.deliver(sentinel as unknown as Element, true));
      expect(onLoadMore).not.toHaveBeenCalled();

      await view.rerender(render(false, null));
      act(() => observer.deliver(sentinel as unknown as Element, false));
      act(() => observer.deliver(sentinel as unknown as Element, true));
      expect(onLoadMore).not.toHaveBeenCalled();
      expect(view.host.intersectionObservers).toHaveLength(1);
    } finally { await view.unmount(); }
  });

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
      const element = byTag(image.host.container, "IMG")[0];
      expect(element.getAttribute("loading")).toBe("lazy");
    } finally { await image.unmount(); }
    const videoCard = mediaCard("metadata-video", "video/mp4");
    const video = await mounted(tile(videoCard, 203, resolver));
    try {
      const element = byTag(video.host.container, "VIDEO")[0] as HostNode & { muted: boolean };
      expect(element.getAttribute("preload")).toBe("metadata");
      expect(element.muted).toBe(true);
    } finally { await video.unmount(); }
  });

  test("plays a mounted video preview on hover and resets it on leave", async () => {
    const resolver = vi.fn(async () => ({ url: "ralphy-media://preview/hover-video", sizeBytes: 2048 }));
    const view = await mounted(tile(mediaCard("hover-video", "video/mp4"), 204, resolver));
    try {
      const video = byTag(view.host.container, "VIDEO")[0] as HostNode & {
        currentTime: number;
        pause: ReturnType<typeof vi.fn>;
        play: ReturnType<typeof vi.fn>;
      };
      video.currentTime = 7;
      video.play = vi.fn(async () => undefined);
      video.pause = vi.fn();
      const cardButton = byTag(view.host.container, "BUTTON")[0];
      cardButton.dispatchEvent(new Event("mouseover", { bubbles: true }));
      await view.flush();
      expect(video.play).toHaveBeenCalledOnce();
      cardButton.dispatchEvent(new Event("mouseout", { bubbles: true }));
      expect(video.pause).toHaveBeenCalledOnce();
      expect(video.currentTime).toBe(0);
    } finally { await view.unmount(); }
  });

  test("updates a masonry preview to its intrinsic image proportion", async () => {
    const resolver = vi.fn(async () => ({ url: "ralphy-media://preview/intrinsic", sizeBytes: 2048 }));
    const view = await mounted(grid([mediaCard("intrinsic")], 217, resolver));
    try {
      const preview = view.host.container.querySelector(".asset-preview")!;
      expect(preview.style.aspectRatio).toBe("1");
      const image = byTag(view.host.container, "IMG")[0];
      Object.defineProperty(image, "naturalWidth", { value: 1600 });
      Object.defineProperty(image, "naturalHeight", { value: 900 });
      await act(async () => { image.dispatchEvent(new Event("load", { bubbles: true })); await Promise.resolve(); });
      expect(preview.style.aspectRatio).toBe(String(16 / 9));
    } finally { await view.unmount(); }
  });

  test("keeps a settled cache remount as a glyph until its production permit is handed off", async () => {
    const cached = mediaCard("cached-queued");
    const cachedUrl = "ralphy-media://preview/cached-queued";
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: 2048 }));
    const seed = await mounted(tile(cached, 212, resolver));
    try {
      const image = bySrc(seed.host.container, cachedUrl)[0];
      await act(async () => { image.dispatchEvent(new Event("load", { bubbles: true })); await Promise.resolve(); });
    } finally { await seed.unmount(); }

    const blockers = Array.from({ length: 4 }, (_, index) => mediaCard(`cache-blocker-${index}`));
    const follower = mediaCard("cache-follower");
    const last = mediaCard("cache-last");
    const view = await mounted(grid([...blockers, cached, follower, last], 212, resolver));
    try {
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual([cached.ref.id, ...blockers.map(({ ref }) => ref.id)]);
      expect(bySrc(view.host.container, cachedUrl)).toHaveLength(0);

      const blocker = bySrc(view.host.container, "ralphy-media://preview/cache-blocker-0")[0];
      await act(async () => { blocker.dispatchEvent(new Event("load", { bubbles: true })); await Promise.resolve(); });
      expect(bySrc(view.host.container, cachedUrl)).toHaveLength(1);
      expect(resolver.mock.calls.filter(([, ref]) => ref.id === cached.ref.id)).toHaveLength(1);

      const cachedImage = bySrc(view.host.container, cachedUrl)[0];
      await act(async () => { cachedImage.dispatchEvent(new Event("load", { bubbles: true })); await Promise.resolve(); });
      expect(resolver.mock.calls.some(([, ref]) => ref.id === follower.ref.id)).toBe(true);
      cachedImage.dispatchEvent(new Event("load", { bubbles: true }));
      await Promise.resolve();
      expect(resolver.mock.calls.some(([, ref]) => ref.id === last.ref.id)).toBe(false);

      const followerImage = bySrc(view.host.container, "ralphy-media://preview/cache-follower")[0];
      await act(async () => { followerImage.dispatchEvent(new Event("load", { bubbles: true })); await Promise.resolve(); });
      expect(resolver.mock.calls.some(([, ref]) => ref.id === last.ref.id)).toBe(true);
    } finally { await view.unmount(); }
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

  test("hands the audio slot to the mounted second tile only after bounded WaveSurfer ready", async () => {
    const cards = [mediaCard("bounded-a", "audio/wav", 2048), mediaCard("bounded-b", "audio/wav", 2048)];
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: 2048 }));
    const view = await mounted(grid(cards, 208, resolver));
    try {
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["bounded-a"]);
      const audio = byTag(view.host.container, "AUDIO")[0] as HostNode & { duration: number; volume: number; muted: boolean };
      audio.duration = 30; audio.volume = 1; audio.muted = false;
      await act(async () => { audio.dispatchEvent(new Event("loadedmetadata", { bubbles: true })); await Promise.resolve(); });
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["bounded-a"]);
      await vi.waitFor(() => expect(waveSurfer.instances).toHaveLength(1));
      await act(async () => { waveSurfer.instances[0].emit("ready", 30); await Promise.resolve(); });
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["bounded-a", "bounded-b"]);
    } finally { await view.unmount(); }
  });

  test("final streaming error hands off, restores the glyph, and invalidates its cache while the second tile stays mounted", async () => {
    const bytes = MAX_WAVEFORM_DECODE_BYTES + 1;
    const first = mediaCard("error-stream-a", "audio/mpeg", bytes);
    const second = mediaCard("error-stream-b", "audio/mpeg", bytes);
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: bytes }));
    const view = await mounted(grid([first, second], 213, resolver));
    try {
      const failedAudio = bySrc(view.host.container, "ralphy-media://preview/error-stream-a")[0];
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual([first.ref.id]);
      await act(async () => { failedAudio.dispatchEvent(new Event("error", { bubbles: true })); await Promise.resolve(); });
      expect(bySrc(view.host.container, "ralphy-media://preview/error-stream-a")).toHaveLength(0);
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual([first.ref.id, second.ref.id]);

      const secondAudio = bySrc(view.host.container, "ralphy-media://preview/error-stream-b")[0] as HostNode & { duration: number; volume: number; muted: boolean };
      secondAudio.duration = 30; secondAudio.volume = 1; secondAudio.muted = false;
      await act(async () => { secondAudio.dispatchEvent(new Event("loadedmetadata", { bubbles: true })); await Promise.resolve(); });
      await view.rerender(grid([second], 213, resolver));
      await view.rerender(grid([second, first], 213, resolver));
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual([first.ref.id, second.ref.id, first.ref.id]);
    } finally { await view.unmount(); }
  });

  test("unmounting an audio tile queued without a permit hands the slot to the next mounted tile", async () => {
    const bytes = MAX_WAVEFORM_DECODE_BYTES + 1;
    const holder = mediaCard("unmount-holder", "audio/mpeg", bytes);
    const queued = mediaCard("unmount-queued", "audio/mpeg", bytes);
    const follower = mediaCard("unmount-follower", "audio/mpeg", bytes);
    const resolver = vi.fn(async (_project: ProjectReference, ref: MediaCardDto["ref"]) => ({ url: `ralphy-media://preview/${ref.id}`, sizeBytes: bytes }));
    const view = await mounted(grid([holder, queued, follower], 214, resolver));
    try {
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual([holder.ref.id]);
      await view.rerender(grid([holder, follower], 214, resolver));
      const audio = bySrc(view.host.container, "ralphy-media://preview/unmount-holder")[0] as HostNode & { duration: number; volume: number; muted: boolean };
      audio.duration = 30; audio.volume = 1; audio.muted = false;
      await act(async () => { audio.dispatchEvent(new Event("loadedmetadata", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual([holder.ref.id, follower.ref.id]);
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
      await view.rerender(tile(mediaCard("cache-128"), 210, resolver));
      expect(resolver).toHaveBeenCalledTimes(129);
      await view.rerender(tile(first, 210, resolver));
      expect(resolver).toHaveBeenCalledTimes(130);
    } finally { await view.unmount(); }
  });

  test("dispatches click, Enter, Space, double-click, and context without nested buttons", async () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const view = await mounted(tile(mediaCard("accessible"), 211, async () => null, project, onSelect, onOpen));
    try {
      const selection = byLabel(view.host.container, "image/png");
      selection.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      dispatchKey(selection, "keydown", "Enter");
      dispatchKey(selection, "keydown", " ");
      dispatchKey(selection, "keyup", " ");
      selection.dispatchEvent(new Event("dblclick", { bubbles: true, cancelable: true }));
      expect(onSelect).toHaveBeenCalledTimes(3);
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(view.host.container.findAll((node) => node.tagName === "BUTTON")).toHaveLength(1);
    } finally { await view.unmount(); }
  });
});
