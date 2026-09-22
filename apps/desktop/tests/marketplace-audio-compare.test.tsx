import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { loadAudioPeaks, waveformPeaks } from "../src/shared/lib/audio-peaks";
import { MarketplaceAudioCompare } from "../src/pages/marketplace/ui/MarketplaceAudioCompare";
import { createReactHost, type HostNode } from "./react-host";

test("waveforms use actual peak samples across channels, including silence", () => {
  expect(waveformPeaks([new Float32Array([0, 0.25, -0.5, 0]), new Float32Array([0, 0, 0, 1])], 2)).toEqual([0.25, 1]);
  expect(waveformPeaks([new Float32Array(4)], 2)).toEqual([0, 0]);
});

test("waveform requests share decoded samples but retry a failed fetch", async () => {
  const decoded = { duration: 2, numberOfChannels: 1, getChannelData: () => new Float32Array([0, 0.5, 1, 0]) };
  const decode = vi.fn(async () => decoded);
  vi.stubGlobal("OfflineAudioContext", class { decodeAudioData = decode; });
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(8) });
  vi.stubGlobal("fetch", fetch);
  try {
    expect(await loadAudioPeaks("retry-waveform.wav")).toBeNull();
    const first = loadAudioPeaks("retry-waveform.wav");
    const second = loadAudioPeaks("retry-waveform.wav");
    expect(first).toBe(second);
    expect(await first).toMatchObject({ duration: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("retry-waveform.wav", { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
    expect(decode).toHaveBeenCalledOnce();
    expect(await loadAudioPeaks("retry-waveform.wav")).toBe(await first);
  } finally { vi.unstubAllGlobals(); }
});

test("audio comparison has inline Original and Effect playback, retains time, and only archives a broken effect", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const unavailable = vi.fn();
  const create = document.createElement.bind(document);
  let audio: HostNode & { paused: boolean; currentTime: number; duration: number; muted: boolean; pause: ReturnType<typeof vi.fn> };
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") audio = Object.assign(node as unknown as HostNode, {
      paused: true, currentTime: 0, duration: 8, muted: false,
      play: () => { audio.paused = false; audio.dispatchEvent(new Event("play")); return Promise.resolve(); },
      pause: vi.fn(() => { audio.paused = true; audio.dispatchEvent(new Event("pause")); }),
    });
    return node;
  });
  const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label)!;
  const click = async (label: string) => act(async () => button(label).dispatchEvent(new Event("click", { bubbles: true })));
  try {
    await act(async () => root.render(<MarketplaceAudioCompare name="Radio" media={{ kind: "audio", url: "after.wav", before: { kind: "audio", url: "before.wav" } }} onUnavailable={unavailable} />));
    expect(host.container.querySelectorAll("audio")).toHaveLength(1);
    expect(audio!.paused).toBe(true);
    expect(button("Play original Radio")).toBeTruthy();
    expect(button("Play effect Radio")).toBeTruthy();
    expect(host.container.querySelectorAll("[role=region]")).toHaveLength(0);
    await click("Play original Radio");
    expect(audio!.getAttribute("src")).toBe("before.wav");
    await act(async () => { audio!.currentTime = 3; audio!.dispatchEvent(new Event("timeupdate")); });
    await click("Play effect Radio");
    expect(audio!.getAttribute("src")).toBe("after.wav");
    await act(async () => audio!.dispatchEvent(new Event("loadedmetadata")));
    expect(audio!.currentTime).toBe(3);
    await click("Mute Radio");
    expect(audio!.muted).toBe(true);
    await click("Pause effect Radio");
    expect(audio!.paused).toBe(true);
    await click("Play original Radio");
    await act(async () => audio!.dispatchEvent(new Event("error")));
    expect(unavailable).not.toHaveBeenCalled();
    expect(button("Play original Radio").disabled).toBe(true);
    await click("Play effect Radio");
    await act(async () => audio!.dispatchEvent(new Event("error")));
    expect(unavailable).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(audio!.paused).toBe(true);
  } finally { vi.restoreAllMocks(); host.restore(); }
});
