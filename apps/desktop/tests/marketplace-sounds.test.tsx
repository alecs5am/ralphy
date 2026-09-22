import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { projectMarketplacePublicItem } from "../src/pages/marketplace/lib/presentation";
import { MarketplaceSounds } from "../src/pages/marketplace/ui/MarketplaceSounds";
import { MarketplaceCreativeResults } from "../src/pages/marketplace/ui/MarketplaceCreativeResults";
import * as waveform from "../src/shared/lib/audio-peaks";
import { SnappySlider } from "../src/shared/ui/SnappySlider";
import { createReactHost, type HostNode } from "./react-host";

const sound = (id: string, playable = true) => projectMarketplacePublicItem({
  id, name: id, category: "asset", summary: "Sound sample", tags: ["ambient", "quiet"],
  referenceUrls: playable ? [`https://ralphy.b-cdn.net/blocks/asset/${id}.mp3`] : [], recipe: null,
}, "live");

const packedSound = (id: string, packId: string, packName: string) => Object.assign(sound(id), {
  studio: {
    body: "Use this sound.",
    preview: { kind: "audio" as const, url: `https://ralphy.b-cdn.net/blocks/asset/${id}.mp3`, posterUrl: `/${packId}.svg` },
    pack: { id: packId, name: packName, publisher: "Kenney" },
    mediaCredit: "Kenney · CC0",
  },
});

test("sound library leads with popular tracks and compact playlists", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const click = async (label: string) => act(async () => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label)!.dispatchEvent(new Event("click", { bubbles: true })));
  try {
    await act(async () => root.render(<MarketplaceSounds items={[
      packedSound("Click", "interface", "Interface Sounds"),
      packedSound("Confirm", "interface", "Interface Sounds"),
      packedSound("Hit", "impact", "Impact Sounds"),
    ]} onOpenItem={vi.fn()} />));
    expect(host.container.querySelectorAll("button").map((node) => node.getAttribute("aria-label"))).toEqual(expect.arrayContaining([
      "Open Interface Sounds pack", "Open Impact Sounds pack",
    ]));
    expect(host.container.textContent).toContain("Popular sounds");
    expect(host.container.textContent).toContain("Categories & playlists");
    expect(host.container.textContent).toContain("Kenney · Interface Sounds · CC0");
    expect(host.container.textContent).not.toContain("audio · kenney · cc0");
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Play Click")).toBe(true);
    expect(host.container.querySelector(".explore-sound-pack")?.querySelector(".aspect-content")).toBeNull();
    await click("Open Interface Sounds pack");
    expect(host.container.textContent).toContain("Interface Sounds");
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Play Click")).toBe(true);
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Play Confirm")).toBe(true);
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Play Hit")).toBe(false);
    await click("All sound packs");
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Open Impact Sounds pack")).toBe(true);
    await act(async () => root.render(<MarketplaceSounds items={[packedSound("Click", "interface", "Interface Sounds")]} showFilters={false} onOpenItem={vi.fn()} />));
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Play Click")).toBe(true);
    expect(host.container.querySelectorAll("button").some((node) => node.getAttribute("aria-label") === "Open Interface Sounds pack")).toBe(false);
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("a sound row decodes its waveform as soon as it becomes visible", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const load = vi.spyOn(waveform, "loadAudioPeaks").mockResolvedValue({ peaks: [0.3], duration: 1 });
  try {
    await act(async () => root.render(<MarketplaceSounds items={[
      packedSound("Click", "interface", "Interface Sounds"),
      packedSound("Confirm", "interface", "Interface Sounds"),
      packedSound("Cancel", "interface", "Interface Sounds"),
    ]} onOpenItem={vi.fn()} />));
    const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label)!;
    await act(async () => button("Open Interface Sounds pack").dispatchEvent(new Event("click", { bubbles: true })));
    expect(load).not.toHaveBeenCalled();
    const waveformRoot = host.container.querySelector(".waveform-track")!;
    await act(async () => host.intersectionObservers.find((observer) => observer.targets.has(waveformRoot))!.deliver(waveformRoot, true));
    expect(load).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});

test("a focused seek slider stops handling keys when playback becomes unavailable", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const seek = vi.fn();
  const render = (disabled: boolean) => root.render(<SnappySlider value={1} min={0} max={10} step={1} disabled={disabled} ariaLabel="Audio position" onValueChange={seek} />);
  try {
    await act(async () => render(false));
    const slider = host.container.querySelector("[role=slider]")!;
    slider.focus();
    const key = (key: string) => slider.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key }));
    await act(async () => { key("ArrowRight"); });
    expect(seek).toHaveBeenCalledWith(2);
    seek.mockClear();
    await act(async () => render(true));
    expect(document.activeElement).toBe(slider);
    expect(slider.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { key("ArrowRight"); key("Home"); key("End"); });
    expect(seek).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("sound rows seek inline with one audio element, prepare a draft, and stop on filtering or unmount", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const first = sound("First"); const second = sound("Second"); const archived = sound("Archived", false);
  const items = [first, second, archived];
  const open = vi.fn(); const use = vi.fn();
  const play = vi.fn(); const pause = vi.fn();
  let player: HostNode & { paused: boolean; currentTime: number; duration: number; volume: number };
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") {
      player = Object.assign(node as unknown as HostNode, {
        paused: true, currentTime: 0, duration: 123, volume: 1,
        play: () => { play(); player.paused = false; player.dispatchEvent(new Event("play")); return Promise.resolve(); },
        pause: () => { pause(); player.paused = true; player.dispatchEvent(new Event("pause")); },
      });
    }
    return node;
  });
  const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label)!;
  const click = async (label: string) => act(async () => button(label).dispatchEvent(new Event("click", { bubbles: true })));
  const render = (next = items) => root.render(<MarketplaceSounds items={next} onOpenItem={open} onUse={use} />);
  try {
    await act(async () => render());
    expect(play).not.toHaveBeenCalled();
    expect(host.container.querySelectorAll("audio")).toHaveLength(1);
    expect(button("Play Archived").disabled).toBe(true);
    expect(host.container.textContent).toContain("ambient · quiet");
    expect(host.container.textContent).not.toContain("2:03");
    const row = host.container.querySelector("li")!;
    const slots = [...row.children];
    expect(host.container.querySelector("[aria-label='Now playing']")).toBeNull();

    await click("Play First");
    expect(row.children).toEqual(slots);
    const volume = host.container.querySelectorAll("[role=slider]").find((node) => node.getAttribute("aria-label") === "Volume for First")!;
    expect(volume.getAttribute("aria-disabled")).toBe("false");
    expect(host.container.querySelectorAll("[role=region]")).toHaveLength(0);
    expect(play).toHaveBeenCalledTimes(1);
    expect(player!.getAttribute("src")).toContain("First.mp3");
    expect(button("Pause current sound First")).toBeTruthy();
    await click("Pause current sound First");
    expect(player!.paused).toBe(true);
    await click("Play current sound First");
    expect(player!.paused).toBe(false);
    await act(async () => player!.dispatchEvent(new Event("loadedmetadata")));
    expect(host.container.textContent).toContain("2:03");
    const seek = host.container.querySelectorAll("[role=slider]").find((node) => node.getAttribute("aria-label") === "Position in First")!;
    await act(async () => seek.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "End" })));
    expect(player!.currentTime).toBe(123);
    await act(async () => volume.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "ArrowLeft" })));
    expect(player!.volume).toBe(0.95);
    await click("Mute First");
    expect(player!.volume).toBe(0);
    await click("Unmute First");
    expect(player!.volume).toBe(1);
    expect(row.children).toEqual(slots);
    await click("Use First in chat");
    expect(use).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledWith(first);
    expect(open).not.toHaveBeenCalled();

    const beforeSwitch = pause.mock.calls.length;
    await click("Play Second");
    expect(pause.mock.calls.length).toBe(beforeSwitch + 1);
    expect(play).toHaveBeenCalledTimes(3);
    expect(player!.getAttribute("src")).toContain("Second.mp3");
    expect(host.container.querySelectorAll("audio")).toHaveLength(1);
    expect(row.children).toEqual(slots);
    expect(host.container.querySelectorAll("[role=slider]").some((node) => node.getAttribute("aria-label") === "Volume for Second")).toBe(true);
    await click("Pause Second");
    expect(player!.paused).toBe(true);
    await click("Play Second");
    expect(player!.paused).toBe(false);
    await act(async () => render([first, archived]));
    expect(player!.paused).toBe(true);
    expect(host.container.querySelectorAll("[role=region]")).toHaveLength(0);
    await act(async () => render());
    expect(player!.paused).toBe(true);
    expect(host.container.querySelectorAll("[role=region]")).toHaveLength(0);
    await click("Play First");
    const beforeUnmount = pause.mock.calls.length;
    await act(async () => root.unmount());
    expect(pause.mock.calls.length).toBe(beforeUnmount + 1);
  } finally { vi.restoreAllMocks(); host.restore(); }
});

test("only an audio resource error reports unavailable; a play rejection keeps the resource visible", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const item = sound("Sample");
  const unavailable = vi.fn();
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") Object.assign(node, { paused: true, pause: vi.fn(), play: () => Promise.reject(new Error("Playback permission denied")) });
    return node;
  });
  try {
    await act(async () => root.render(<MarketplaceSounds items={[item]} onOpenItem={vi.fn()} onUnavailable={unavailable} />));
    const audio = host.container.querySelector("audio")!;
    await act(async () => audio.dispatchEvent(new Event("error")));
    expect(unavailable).not.toHaveBeenCalled();
    const play = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Play Sample")!;
    await act(async () => play.dispatchEvent(new Event("click", { bubbles: true })));
    expect(unavailable).not.toHaveBeenCalled();
    expect(host.container.textContent).toContain("Preview could not play. Try again.");
    await act(async () => audio.dispatchEvent(new Event("error")));
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(unavailable).toHaveBeenCalledWith(item);
    await act(async () => root.render(<MarketplaceSounds items={[item]} onOpenItem={vi.fn()} />));
    await act(async () => audio.dispatchEvent(new Event("error")));
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(host.container.textContent).toContain("Preview could not play. Try again.");
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});

test("an idle track starts at the selected waveform position", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  vi.spyOn(waveform, "loadAudioPeaks").mockResolvedValue({ peaks: [0.2, 1, 0.4], duration: 8 });
  const create = document.createElement.bind(document);
  let audio: HostNode & { currentTime: number; paused: boolean; duration: number };
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") audio = Object.assign(node as unknown as HostNode, {
      currentTime: 0, paused: true, duration: 8,
      play: () => { audio.paused = false; audio.dispatchEvent(new Event("play")); return Promise.resolve(); },
      pause: () => { audio.paused = true; audio.dispatchEvent(new Event("pause")); },
    });
    return node;
  });
  try {
    await act(async () => root.render(<MarketplaceSounds items={[sound("First"), sound("Second")]} onOpenItem={vi.fn()} />));
    const seek = host.container.querySelectorAll("[role=slider]").find((node) => node.getAttribute("aria-label") === "Position in Second")!;
    expect(seek.getAttribute("aria-disabled")).toBe("false");
    await act(async () => seek.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "ArrowRight" })));
    expect(audio!.getAttribute("src")).toContain("Second.mp3");
    await act(async () => audio!.dispatchEvent(new Event("loadedmetadata")));
    expect(audio!.currentTime).toBe(0.1);
    expect(audio!.paused).toBe(false);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});

test("separate sound sections pause one another and remove their document listeners", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const players: (HostNode & { paused: boolean; pause: ReturnType<typeof vi.fn> })[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") {
      const player = Object.assign(node as unknown as HostNode, {
        paused: true,
        pause: vi.fn(() => { player.paused = true; player.dispatchEvent(new Event("pause")); }),
        play: () => {
          player.paused = false;
          // The test DOM has no capture phase; forward the native document event explicitly.
          document.dispatchEvent(Object.defineProperty(new Event("play"), "target", { value: player }));
          player.dispatchEvent(new Event("play"));
          return Promise.resolve();
        },
      });
      players.push(player);
    }
    return node;
  });
  const removed = vi.spyOn(document, "removeEventListener");
  const click = async (label: string) => act(async () => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label)!.dispatchEvent(new Event("click", { bubbles: true })));
  try {
    await act(async () => root.render(<>
      <MarketplaceSounds items={[sound("Effect")]} onOpenItem={vi.fn()} />
      <MarketplaceSounds items={[sound("Music")]} onOpenItem={vi.fn()} />
    </>));
    await click("Play Effect");
    expect(players[0]!.paused).toBe(false);
    await click("Play Music");
    expect(players[0]!.paused).toBe(true);
    expect(players[1]!.paused).toBe(false);
    await click("Play Effect");
    expect(players[0]!.paused).toBe(false);
    expect(players[1]!.paused).toBe(true);
    const before = players[0]!.pause.mock.calls.length;
    await act(async () => document.dispatchEvent(Object.defineProperty(new Event("play"), "target", { value: { tagName: "VIDEO" } })));
    expect(players[0]!.pause.mock.calls.length).toBe(before);
    await act(async () => root.unmount());
    expect(removed.mock.calls.filter(([name, , capture]) => name === "play" && capture)).toHaveLength(2);
  } finally { vi.restoreAllMocks(); host.restore(); }
});

test("sound facets use available tags, pause a hidden track, and stay absent in related shelves", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const loop = { ...sound("Pulse"), tags: ["loop"] };
  const hit = { ...sound("Impact"), tags: ["sfx"] };
  const unknown = { ...sound("Unclassified"), tags: [] };
  const create = document.createElement.bind(document);
  let player: HostNode & { paused: boolean };
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === "audio") player = Object.assign(node as unknown as HostNode, {
      paused: true,
      play: () => { player.paused = false; player.dispatchEvent(new Event("play")); return Promise.resolve(); },
      pause: () => { player.paused = true; player.dispatchEvent(new Event("pause")); },
    });
    return node;
  });
  const render = (showFilters = true, items = [loop, hit, unknown]) => root.render(<MarketplaceSounds items={items} showFilters={showFilters} onOpenItem={vi.fn()} />);
  const filter = async (label: string) => act(async () => {
    const radio = host.container.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === label)!;
    Object.assign(radio, { checked: true });
    radio.dispatchEvent(new Event("click", { bubbles: true }));
  });
  try {
    await act(async () => render());
    expect(host.container.querySelectorAll("input").map((node) => node.getAttribute("aria-label"))).toEqual(["All sounds", "One-shots", "Loops"]);
    expect(host.container.querySelectorAll("li")).toHaveLength(3);
    await act(async () => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Play Pulse")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(player!.paused).toBe(false);
    await filter("One-shots");
    expect(host.container.querySelectorAll("li")).toHaveLength(1);
    expect(host.container.querySelector("li")!.textContent).toContain("Impact");
    expect(player!.paused).toBe(true);
    expect(player!.getAttribute("src")).toBeNull();
    await act(async () => render(false));
    expect(host.container.querySelector("[role=radiogroup]")).toBeNull();
    expect(host.container.querySelectorAll("li")).toHaveLength(3);
    await act(async () => render(true, [hit, unknown]));
    expect(host.container.querySelector("[role=radiogroup]")).toBeNull();
    expect(host.container.querySelectorAll("li")).toHaveLength(2);
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); host.restore(); }
});

test("metadata preflight archives broken idle sounds without rejecting playable waveform fallbacks", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const probes: Probe[] = [];
  class Probe {
    src = "";
    preload = "";
    duration = 62;
    onloadedmetadata: (() => void) | null = null;
    onerror: (() => void) | null = null;
    load = vi.fn();
    removeAttribute = vi.fn();
    constructor() { probes.push(this); }
  }
  vi.stubGlobal("Audio", Probe);
  vi.spyOn(waveform, "loadAudioPeaks").mockResolvedValue(null);
  try {
    await act(async () => root.render(<MarketplaceCreativeResults items={[sound("Valid"), sound("Broken")]} category="sounds" onOpenItem={vi.fn()} />));
    expect(probes).toHaveLength(2);
    expect(probes.every((probe) => probe.preload === "metadata")).toBe(true);
    expect(host.container.querySelectorAll("audio")).toHaveLength(1);
    const valid = probes.find((probe) => probe.src.includes("Valid.mp3"))!;
    const broken = probes.find((probe) => probe.src.includes("Broken.mp3"))!;
    await act(async () => valid.onloadedmetadata?.());
    expect(host.container.textContent).toContain("1:02");
    expect(host.container.textContent).toContain("2 previews");
    expect(valid.removeAttribute).toHaveBeenCalledWith("src");
    await act(async () => broken.onerror?.());
    expect(host.container.textContent).toContain("1 preview · 1 archived");
    expect(host.container.querySelectorAll("li")).toHaveLength(1);
    expect(host.container.querySelector("li")!.textContent).toContain("Valid");
    expect(broken.onerror).toBeNull();
    expect(broken.removeAttribute).toHaveBeenCalledWith("src");
    await act(async () => {
      const archived = host.container.querySelector("input")!;
      Object.assign(archived, { checked: true });
      archived.dispatchEvent(new Event("click", { bubbles: true }));
    });
    expect(host.container.querySelectorAll("li")).toHaveLength(2);
    expect(host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Play Broken")!.disabled).toBe(true);
    expect(probes).toHaveLength(2);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); host.restore(); }
});

test("the transport is the docked bar, and closing it stops the sound", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label);
  const click = async (label: string) => act(async () => button(label)!.dispatchEvent(new Event("click", { bubbles: true })));
  try {
    await act(async () => root.render(<MarketplaceSounds items={[sound("Rain")]} showFilters={false} onOpenItem={vi.fn()} />));
    /* Nothing selected, no transport: the bar is the now-playing state, not a permanent fixture
       that sits empty above the list the way the old sticky block did. */
    expect(host.container.querySelector(".player-bar")).toBeNull();
    await click("Play Rain");
    expect(host.container.querySelector(".player-bar")).not.toBeNull();
    expect(button("Stop playing Rain")).toBeDefined();
    await click("Stop playing Rain");
    expect(host.container.querySelector(".player-bar")).toBeNull();
  } finally { await act(async () => root.unmount()); host.restore(); }
});
