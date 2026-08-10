import { act, createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { MediaCardDto } from "../electron/ralphy/types";
import type { ProjectPreview, ProjectReference } from "../src/lib/ipc";
import { MediaCardTile, VirtualAssetGrid } from "../src/components/VirtualAssetGrid";
import { assetGridGeometry, createPreviewScheduler } from "../src/lib/media";
import { createReactHost } from "./react-host";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    estimateSize: 0,
    getTotalSize: () => count * 240,
    getVirtualItems: () => count === 0 ? [] : [{ index: 0, key: "visible-row", start: 0 }],
    measure: () => undefined,
  }),
}));

const project: ProjectReference = { workspaceId: "workspace-grid", projectId: "project-grid" };

function mediaCard(id: string, mime = "image/png"): MediaCardDto {
  return {
    ref: { type: "object", id },
    workspaceId: project.workspaceId,
    projectId: project.projectId,
    storageClass: "final",
    mime,
    bytes: 2048,
    createdAt: 1,
    referenceCount: 1,
    target: { type: "object", id },
  };
}

function tags(node: unknown): string[] {
  const value = node as { tagName?: string; childNodes?: unknown[] };
  return [value.tagName, ...(value.childNodes ?? []).flatMap(tags)].filter((tag): tag is string => Boolean(tag));
}

async function mounted(element: ReactElement) {
  const host = createReactHost();
  (window as unknown as { getComputedStyle: () => { paddingLeft: string; paddingRight: string } }).getComputedStyle = () => ({ paddingLeft: "0", paddingRight: "0" });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    host,
    root,
    rerender: async (next: ReactElement) => {
      await act(async () => {
        root.render(next);
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    flush: async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.restore();
    },
  };
}

function tile(card: MediaCardDto, rootEpoch: number, resolvePreview: (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>) {
  return createElement(MediaCardTile, {
    card,
    project,
    rootEpoch,
    selected: false,
    resolvePreview,
    onSelect: () => undefined,
    onOpen: () => undefined,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("media grid geometry", () => {
  test("derives non-overlapping 16:10 rows at narrow, medium, and wide widths", () => {
    expect(assetGridGeometry(492, 190, 16)).toEqual({ columns: 2, tileWidth: 238, tileHeight: 202.75, rowHeight: 218.75, gap: 16 });
    expect(assetGridGeometry(688, 190, 16)).toEqual({ columns: 3, tileWidth: 218.66666666666666, tileHeight: 190.66666666666666, rowHeight: 206.66666666666666, gap: 16 });
    expect(assetGridGeometry(1000, 190, 16)).toEqual({ columns: 4, tileWidth: 238, tileHeight: 202.75, rowHeight: 218.75, gap: 16 });
  });

  test("queues each preview kind independently until its release", async () => {
    const scheduler = createPreviewScheduler({ image: 1, video: 1, audio: 1 });
    const releaseFirst = await scheduler.acquire("image");
    let secondAcquired = false;
    const second = scheduler.acquire("image").then((release) => { secondAcquired = true; return release; });
    const releaseVideo = await scheduler.acquire("video");
    await Promise.resolve();
    expect(secondAcquired).toBe(false);
    releaseFirst();
    const releaseSecond = await second;
    expect(secondAcquired).toBe(true);
    releaseSecond();
    releaseVideo();
  });
});

describe("mounted media tiles", () => {
  test("publishes a lazy image only after the mounted resolver succeeds", async () => {
    const resolver = vi.fn(async () => ({ url: "ralphy-media://preview/lazy", sizeBytes: 2048 }));
    const card = mediaCard("lazy-image");
    const view = await mounted(tile(card, 101, resolver));
    try {
      expect(resolver).toHaveBeenCalledOnce();
      expect(tags(view.host.container)).toContain("IMG");
      const markup = renderToStaticMarkup(tile(card, 101, resolver));
      expect(markup).toContain('loading="lazy"');
    } finally {
      await view.unmount();
    }
  });

  test("renders video metadata muted and retains a glyph after failure", async () => {
    const videoResolver = vi.fn(async () => ({ url: "ralphy-media://preview/video", sizeBytes: 2048 }));
    const card = mediaCard("metadata-video", "video/mp4");
    const video = await mounted(tile(card, 103, videoResolver));
    try {
      expect(tags(video.host.container)).toContain("VIDEO");
      const markup = renderToStaticMarkup(tile(card, 103, videoResolver));
      expect(markup).toContain('preload="metadata"');
      expect(markup).toContain('muted=""');
    } finally {
      await video.unmount();
    }

    const failed = await mounted(tile(mediaCard("failed-image"), 105, async () => { throw new Error("unavailable"); }));
    try {
      expect(tags(failed.host.container)).toContain("SVG");
      expect(tags(failed.host.container)).not.toContain("IMG");
    } finally {
      await failed.unmount();
    }
  });

  test("caches an immutable ref within an epoch and resolves it again after the epoch changes", async () => {
    const resolver = vi.fn(async () => ({ url: "ralphy-media://preview/cached", sizeBytes: 2048 }));
    const card = mediaCard("epoch-cache");
    const first = await mounted(tile(card, 106, resolver));
    await first.unmount();
    const second = await mounted(tile(card, 106, resolver));
    try {
      expect(resolver).toHaveBeenCalledOnce();
      await second.rerender(tile(card, 107, resolver));
      expect(resolver).toHaveBeenCalledTimes(2);
    } finally {
      await second.unmount();
    }
  });

  test("ignores a stale result after its tile is replaced", async () => {
    let resolveOld!: (value: ProjectPreview | null) => void;
    const old = new Promise<ProjectPreview | null>((resolve) => { resolveOld = resolve; });
    const resolver = vi.fn((_project: ProjectReference, ref: MediaCardDto["ref"]) => ref.id === "stale-old" ? old : Promise.resolve(null));
    const view = await mounted(tile(mediaCard("stale-old"), 108, resolver));
    try {
      await view.rerender(tile(mediaCard("stale-new"), 108, resolver));
      resolveOld({ url: "ralphy-media://preview/stale", sizeBytes: 2048 });
      await view.flush();
      expect(tags(view.host.container)).not.toContain("IMG");
    } finally {
      await view.unmount();
    }
  });

  test("resolves only cards in the mounted virtual row", async () => {
    const resizeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
    const setPropertyDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "setProperty");
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} } });
    Object.defineProperty(Object.prototype, "setProperty", { configurable: true, value() {} });
    const cards = ["mounted-1", "mounted-2", "mounted-3", "outside-row"].map((id) => mediaCard(id));
    const resolver = vi.fn(async () => null);
    const view = await mounted(createElement(VirtualAssetGrid, {
      items: cards,
      project,
      rootEpoch: 109,
      selectedRef: null,
      resolvePreview: resolver,
      onSelect: () => undefined,
      onOpen: () => undefined,
    }));
    try {
      expect(resolver.mock.calls.map(([, ref]) => ref.id)).toEqual(["mounted-1"]);
      expect(resolver).not.toHaveBeenCalledWith(project, cards[3].ref);
    } finally {
      await view.unmount();
      if (resizeDescriptor) Object.defineProperty(globalThis, "ResizeObserver", resizeDescriptor);
      else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      if (setPropertyDescriptor) Object.defineProperty(Object.prototype, "setProperty", setPropertyDescriptor);
      else delete (Object.prototype as { setProperty?: unknown }).setProperty;
    }
  });

  test("keeps selection and Open as separate native keyboard controls", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const element = MediaCardTile({
      card: mediaCard("accessible"), project, rootEpoch: 110, selected: false,
      resolvePreview: async () => null, onSelect, onOpen,
    }) as ReactElement<{ children: ReactElement<any>[] }>;
    const [selection, open] = element.props.children.filter(Boolean);
    selection.props.onClick();
    selection.props.onDoubleClick();
    open.props.onClick();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(selection.type).toBe("button");
    expect(open.type).toBe("button");
    expect(selection.props.children).not.toContain(open);
  });
});
