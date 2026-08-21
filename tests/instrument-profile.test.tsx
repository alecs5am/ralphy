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

function viewport(host: ReturnType<typeof createReactHost>, width: number, height: number) {
  Object.assign(host.container.ownerDocument.defaultView!, { innerWidth: width, innerHeight: height });
}

function bounds(node: HostNode, left: number, top: number, width: number, height: number) {
  node.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
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

  test("anchors the portalled menu inside the viewport and recomputes it on resize and scroll", async () => {
    const host = createReactHost();
    viewport(host, 1_000, 720);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: null }} onOpenSettings={() => undefined} />);
        await settle();
      });
      const trigger = host.container.querySelector("button") as HostNode;
      bounds(trigger, 900, 660, 60, 30);
      await act(async () => {
        trigger.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      const menu = host.container.ownerDocument.body.querySelector(".instrument-profile-menu") as HostNode;
      expect(menu.style.position).toBe("fixed");
      expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8);
      expect(Number.parseFloat(menu.style.left)).toBeLessThanOrEqual(800);
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(660);

      bounds(trigger, 40, 100, 60, 30);
      await act(async () => {
        host.container.ownerDocument.defaultView!.dispatchEvent(new Event("resize"));
        await settle();
      });
      expect(menu.style.left).toBe("40px");
      expect(menu.style.top).toBe("138px");

      bounds(trigger, 60, 120, 60, 30);
      await act(async () => {
        host.container.ownerDocument.defaultView!.dispatchEvent(new Event("scroll"));
        await settle();
      });
      expect(menu.style.left).toBe("60px");
      expect(menu.style.top).toBe("158px");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("dismisses outside pointer and focus interactions back to the opener", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: null }} onOpenSettings={() => undefined} />);
        await settle();
      });
      const trigger = host.container.querySelector("button") as HostNode;
      const focus = vi.fn();
      trigger.focus = focus;
      await act(async () => {
        trigger.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      const surface = host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"profile-menu\"]") as HostNode;
      const menuFocus = new Event("focusin", { bubbles: true });
      Object.defineProperty(menuFocus, "target", { value: surface });
      await act(async () => {
        host.container.ownerDocument.dispatchEvent(menuFocus);
        await settle();
      });
      expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"profile-menu\"]")).not.toBeNull();
      await act(async () => {
        host.container.ownerDocument.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        await settle();
      });
      expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"profile-menu\"]")).toBeNull();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });

      await act(async () => {
        trigger.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
        host.container.ownerDocument.dispatchEvent(new Event("focusin", { bubbles: true }));
        await settle();
      });
      expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay=\"profile-menu\"]")).toBeNull();
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

  test("uses approved renderer avatar URLs and falls back after an image error", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: "ralphy-media://asset/avatar-token" }} onOpenSettings={() => undefined} />);
        await settle();
      });
      const avatar = host.container.querySelector("img") as HostNode;
      expect(avatar.getAttribute("src")).toBe("ralphy-media://asset/avatar-token");
      await act(async () => {
        avatar.dispatchEvent(new Event("error"));
        await settle();
      });
      expect(host.container.querySelector("img")).toBeNull();
      expect(host.container.textContent).toContain("MO");
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl: "ralphy-media://asset/new-avatar-token" }} onOpenSettings={() => undefined} />);
        await settle();
      });
      expect(host.container.querySelector("img")?.getAttribute("src")).toBe("ralphy-media://asset/new-avatar-token");
      expect(host.container.textContent).toContain("Maxim");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("rejects avatar URLs outside the renderer media allowlist", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      for (const avatarUrl of ["javascript:alert(1)", "about:blank", "https://example.test/avatar.png", "file:///Users/maxim/avatar.png", "data:text/html,x", "custom:avatar", "not a URL"]) {
        await act(async () => {
          root.render(<InstrumentProfileControl identity={{ displayName: "Maxim", initials: "MO", avatarUrl }} onOpenSettings={() => undefined} />);
          await settle();
        });
        expect(host.container.querySelector("img")).toBeNull();
        expect(host.container.textContent).toContain("MO");
      }
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
