import { act } from "react";
import { describe, expect, test, vi } from "vitest";

import { InstrumentProfileControl } from "../src/instrument/InstrumentProfileControl";
import { createReactHost, type HostNode } from "./react-host";

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function escape() {
  return Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Escape" });
}

describe("instrument profile control", () => {
  test("opens the registered menu and restores its opener after Escape", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: null }} onOpenSettings={() => undefined} />);
        await settle();
      });
      const trigger = host.container.querySelector("button") as HostNode;

      await act(async () => {
        trigger.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      const menu = host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"profile-menu\"]") as HostNode;
      expect(trigger.getAttribute("aria-label")).toBe("Open profile menu");
      expect(menu.getAttribute("role")).toBe("menu");
      expect(menu.querySelector("[data-instrument-root=\"instrument-profile-menu\"]")).not.toBeNull();
      expect(host.container.ownerDocument.activeElement).toBe(menu);
      expect(menu.textContent).toContain("Maxim");
      expect(menu.textContent).not.toContain("Sign out");

      await act(async () => {
        menu.dispatchEvent(escape());
        await settle();
      });
      expect(host.container.ownerDocument.activeElement).toBe(trigger);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("opens Settings only through the supplied callback", async () => {
    const onOpenSettings = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: null }} onOpenSettings={onOpenSettings} />);
        await settle();
      });
      const trigger = host.container.querySelector("button") as HostNode;
      await act(async () => {
        trigger.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      const settings = host.container.ownerDocument.body.querySelectorAll("button").find((button) => button.textContent === "Settings");
      await act(async () => {
        settings?.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
      expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"profile-menu\"]")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("uses a supplied local avatar before falling back to initials", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: "file:///Users/maxim/avatar.png" }} onOpenSettings={() => undefined} />);
        await settle();
      });
      expect(host.container.querySelector("img")?.getAttribute("src")).toBe("file:///Users/maxim/avatar.png");
      expect(host.container.textContent).toContain("Maxim");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
