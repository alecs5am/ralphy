import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { VideoPlayer } from "@/entities/media";
import { MediaCardTile, UnitSocialPreview } from "@/pages/project";
import type { UnitMedia } from "@/entities/unit";
import type { MediaCardDto } from "../electron/ralphy/types";
import { createReactHost, type HostNode } from "./react-host";

const labelled = (node: HostNode, label: string) => node.findAll((item) => item.getAttribute("aria-label") === label)[0]!;

test("autoplay starts at the beginning, loops, respects pause/mute and stops the replaced player", async () => {
  const host = createReactHost(), root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<VideoPlayer src="first.mp4" name="Preview" compact autoPlay loop />));
    const video = host.container.querySelector("video")!;
    const pause = vi.fn(() => video.dispatchEvent(new Event("pause")));
    Object.assign(video, { duration: 24, currentTime: 8, volume: 1, paused: false, pause });
    expect(video.getAttribute("autoPlay")).toBe("");
    expect(video.getAttribute("loop")).toBe("");
    expect((video as unknown as HTMLVideoElement).muted).toBe(true);
    await act(async () => { video.dispatchEvent(new Event("loadedmetadata")); video.dispatchEvent(new Event("play")); });
    expect((video as unknown as HTMLVideoElement).currentTime).toBe(0);
    await act(async () => { labelled(host.container, "Pause Preview").dispatchEvent(new Event("click", { bubbles: true })); });
    expect(pause).toHaveBeenCalledOnce();
    expect(labelled(host.container, "Play Preview")).toBeDefined();
    await act(async () => root.render(<VideoPlayer src="next.mp4" name="Preview" autoPlay loop />));
    expect(pause).toHaveBeenCalledTimes(2);
    const next = host.container.querySelector("video")!;
    expect(next).not.toBe(video);
    expect(next.getAttribute("autoPlay")).toBe("");
    await act(async () => { labelled(host.container, "Unmute Preview").dispatchEvent(new Event("click", { bubbles: true })); next.dispatchEvent(new Event("volumechange")); });
    expect((next as unknown as HTMLVideoElement).muted).toBe(false);
    expect(labelled(host.container, "Mute Preview")).toBeDefined();
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("only the visible unit carousel video is mounted and playing", async () => {
  const host = createReactHost(), root = createRoot(host.container as unknown as Element);
  const media: UnitMedia[] = ["first", "next"].map((id) => ({ id, role: id, position: 0, kind: "video", preview: { url: `${id}.mp4`, mime: "video/mp4", sizeBytes: 10 } }));
  try {
    await act(async () => root.render(<UnitSocialPreview target={{ id: "instagram-carousel", platform: "instagram", variant: "carousel", label: "Instagram" }} media={media} slug="Carousel" previewMode="clean" />));
    expect(host.container.querySelectorAll("video")).toHaveLength(1);
    const first = host.container.querySelector("video")!;
    const pause = vi.fn();
    Object.assign(first, { pause });
    expect(first.getAttribute("src")).toBe("first.mp4");
    expect(first.getAttribute("autoPlay")).toBe("");
    expect(first.getAttribute("loop")).toBe("");
    await act(async () => { labelled(host.container, "Next slide").dispatchEvent(new Event("click", { bubbles: true })); });
    expect(pause).toHaveBeenCalledOnce();
    expect(host.container.querySelectorAll("video")).toHaveLength(1);
    expect(host.container.querySelector("video")!.getAttribute("src")).toBe("next.mp4");
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("project video tiles preview on hover and stop before opening or leaving", async () => {
  const host = createReactHost(), root = createRoot(host.container as unknown as Element), open = vi.fn();
  const card: MediaCardDto = { ref: { type: "artifact", id: "hover-video" }, workspaceId: "ws", projectId: "project", slug: "Hover clip", kind: "video", selectedRevisionId: "revision", selectedState: "approved", mime: "video/mp4", bytes: 10, selectedAt: 1, revisionCount: 1, selectedObjectId: "object", storageClass: "final", usageRoles: [], target: { type: "object", id: "object" }, mediaKind: "video", provenance: "generation" };
  try {
    await act(async () => root.render(<MediaCardTile card={card} project={{ workspaceId: "ws", projectId: "project" }} rootEpoch={9001} selected={false} resolvePreview={async () => ({ url: "hover.mp4", mime: "video/mp4", sizeBytes: 10 })} onSelect={() => {}} onOpen={open} onContextMenu={() => {}} />));
    const tile = host.container.querySelector("article")!, video = host.container.querySelector("video")!;
    const play = vi.fn(async () => {}), pause = vi.fn();
    Object.assign(video, { play, pause, currentTime: 2 });
    expect(video.getAttribute("autoPlay")).toBeNull();
    expect((video as unknown as HTMLVideoElement).muted).toBe(true);
    await act(async () => { tile.dispatchEvent(new Event("mouseover", { bubbles: true })); });
    expect(play).toHaveBeenCalledOnce();
    await act(async () => { tile.dispatchEvent(new Event("mouseout", { bubbles: true })); });
    expect(pause).toHaveBeenCalledOnce();
    expect((video as unknown as HTMLVideoElement).currentTime).toBe(0);
    await act(async () => { tile.dispatchEvent(new Event("mouseover", { bubbles: true })); tile.dispatchEvent(new Event("click", { bubbles: true })); });
    expect(play).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.restore(); }
});
