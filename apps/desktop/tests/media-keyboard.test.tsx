import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { AudioTrack } from "@/shared/ui/AudioTrack";
import { createReactHost, type HostNode } from "./react-host";

/* Space is the one transport key every player is expected to answer. It is bound to the player's
   own root rather than to the window, so the assertion that matters is that a player which never
   had focus stays silent while the focused one plays. */
test("space plays the focused player and leaves the others alone", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<>
      <AudioTrack src="ralphy-media://asset/one" name="One" />
      <AudioTrack src="ralphy-media://asset/two" name="Two" />
    </>));
    const [first, second] = host.container.findAll((node) => node.tagName === "AUDIO") as HostNode[];
    const plays = [vi.fn(async () => {}), vi.fn(async () => {})];
    Object.assign(first!, { paused: true, play: plays[0], pause: vi.fn() });
    Object.assign(second!, { paused: true, play: plays[1], pause: vi.fn() });

    const players = host.container.findAll((node) => (node.getAttribute("class") ?? "").includes("audio-track")) as HostNode[];
    const space = () => {
      const event = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "code", { value: "Space" });
      return event;
    };
    await act(async () => { players[0]!.dispatchEvent(space()); });
    expect(plays[0]).toHaveBeenCalledOnce();
    expect(plays[1]).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.restore(); }
});
