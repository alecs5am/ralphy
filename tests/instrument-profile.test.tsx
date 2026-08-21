import { act } from "react";
import { readFileSync } from "node:fs";
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
  Object.assign(host.container.ownerDocument.defaultView!, {
    innerWidth: width,
    innerHeight: height,
  });
}

function animationFrameHarness(host: ReturnType<typeof createReactHost>) {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  Object.assign(host.container.ownerDocument.defaultView!, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle: number) => callbacks.delete(handle),
  });
  return {
    flush(frames = 1) {
      for (let index = 0; index < frames; index += 1) {
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(index);
      }
    },
  };
}

function bounds(node: HostNode, left: number, top: number, width: number, height: number) {
  node.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

function resizeObserverHarness() {
  const previous = globalThis.ResizeObserver;
  const registrations: Array<{ callback: ResizeObserverCallback; target: Element; observer: ResizeObserver }> = [];
  class TestResizeObserver {
    constructor(readonly callback: ResizeObserverCallback) {}
    observe(target: Element) { registrations.push({ callback: this.callback, target, observer: this as unknown as ResizeObserver }); }
    disconnect() { registrations.splice(0, registrations.length, ...registrations.filter((entry) => entry.observer !== this)); }
    unobserve(target: Element) { registrations.splice(0, registrations.length, ...registrations.filter((entry) => entry.observer !== this || entry.target !== target)); }
  }
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  return {
    trigger(target: Element) {
      for (const entry of registrations.filter((registration) => registration.target === target)) {
        entry.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], entry.observer);
      }
    },
    restore() { globalThis.ResizeObserver = previous; },
  };
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

  test("measures a long profile menu and follows opener reflow without viewport events", async () => {
    const host = createReactHost();
    viewport(host, 1_000, 720);
    const frames = animationFrameHarness(host);
    const observers = resizeObserverHarness();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<InstrumentProfileControl identity={{ displayName: "ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678", initials: "MO", avatarUrl: null }} onOpenSettings={() => undefined} />);
        await settle();
      });
      const trigger = host.container.querySelector("button") as HostNode;
      bounds(trigger, 800, 660, 60, 30);
      await act(async () => {
        trigger.dispatchEvent(new Event("click", { bubbles: true }));
        await settle();
      });
      const menu = host.container.ownerDocument.body.querySelector(".instrument-profile-menu") as HostNode;
      menu.scrollWidth = 192;
      menu.clientWidth = 192;
      menu.scrollHeight = 80;
      bounds(menu, 0, 0, 192, 80);
      await act(async () => {
        observers.trigger(menu as unknown as Element);
        frames.flush();
        await settle();
      });
      expect(menu.style.position).toBe("fixed");
      expect(menu.style.left).toBe("800px");
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(660);
      expect(Number.parseFloat(menu.style.left) + menu.scrollWidth).toBeLessThanOrEqual(992);

      bounds(trigger, 40, 100, 60, 30);
      await act(async () => {
        frames.flush(2);
        await settle();
      });
      expect(menu.style.left).toBe("40px");
      expect(menu.style.top).toBe("138px");
      expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth);

      const styles = readFileSync("src/styles/instrument.css", "utf8");
      expect(styles).toMatch(/\.instrument-profile-menu\s*\{[^}]*width:\s*min\(192px, calc\(100vw - 16px\)\)[^}]*max-width:\s*calc\(100vw - 16px\)/s);
      expect(styles).toMatch(/\.instrument-profile-menu-identity > span\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/s);
      expect(styles).toMatch(/\.instrument-profile-trigger\s*\{[^}]*box-sizing:\s*border-box[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
      expect(styles).toMatch(/\.instrument-profile-trigger > span\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/s);
      expect(styles).toMatch(/\.instrument-profile-avatar,\s*\.instrument-profile-initials\s*\{[^}]*flex:\s*none/s);
    } finally {
      await act(async () => root.unmount());
      observers.restore();
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
