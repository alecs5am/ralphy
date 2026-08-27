import { act } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import { InstrumentProfileControl } from "@/widgets/instrument-sidebar/ui/InstrumentProfileControl";
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
      // The markup fixes the menu; the inline style carries only the measured position.
      expect(readFileSync("src/widgets/instrument-sidebar/ui/InstrumentProfileControl.tsx", "utf8"))
        .toMatch(/instrument-profile-menu fixed z-popover/);
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

      // Every one of these decisions now stands on the element that renders it. The measure and
      // the two viewport fits are role keys: the menu gives way to the window rather than
      // overdrawing the window's own rounded clip.
      const source = readFileSync("src/widgets/instrument-sidebar/ui/InstrumentProfileControl.tsx", "utf8");
      const theme = readFileSync("src/app/styles/theme/shell.css", "utf8");
      expect(source).toMatch(/w-profile-menu min-w-profile-menu-min max-w-overlay-fit/);
      expect(source).toMatch(/max-h-overlay-fit-block/);
      expect(theme).toMatch(/--spacing-profile-menu:\s*min\(192px, calc\(100vw - 16px\)\)/);
      expect(theme).toMatch(/--spacing-profile-menu-min:\s*min\(180px, calc\(100vw - 16px\)\)/);
      expect(theme).toMatch(/--spacing-overlay-fit:\s*calc\(100vw - 16px\)/);
      expect(theme).toMatch(/--spacing-overlay-fit-block:\s*calc\(100vh - 16px\)/);
      // The truncating label and the identity's `flex-none` are structural guards, not decoration:
      // without them the name pushes the row wide and the avatar is the first thing to shrink.
      expect(source).toMatch(/const LABEL = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"/);
      expect(source).toMatch(/const IDENTITY = "size-control-sm flex-none/);
      expect(source).toMatch(/box-border min-h-control-md min-w-0 max-w-full/);
      // The plate and its rows state their surface and ink as a pair. The menu is portalled to
      // `document.body`, outside `.app-mode-work`, where the legacy inks resolve to the on-dark
      // family -- a plate that inherited its ink there would paint near-white text on a light
      // widget in the light theme.
      expect(source).toMatch(/rounded-menu bg-surface p-2 text-ink/);
      // The other half of the flat-widget rule, which `design-system.test.ts` used to assert here
      // by proxy through the retired `ProfileMenu`: a menu is one flat surface, so it carries no
      // border and no shadow. That test keeps the `bg-instrument` half for the three menus that
      // are black widgets; this menu takes the theme surface instead, so its flatness is pinned
      // on the element that actually renders it.
      const menuClasses = /className="instrument-profile-menu ([^"]*)"/.exec(source)?.[1] ?? "";
      expect(menuClasses).toContain("bg-surface");
      expect(menuClasses).not.toMatch(/\b(?:border-|shadow-)/);
      expect(source).toMatch(/const ON_THEME = "text-ink hover:bg-surface-hover focus-visible:outline-ink"/);
      // Handoff 13 dissolved the sidebar footer's black pill into the one sidebar card, so this
      // row now stands on a theme surface and takes the theme pair. The on-dark family it used to
      // carry would paint #F2F2F0 ink on a white card in the light theme.
      expect(source).toMatch(/const ON_CARD = "text-muted hover:bg-field hover:text-ink focus-visible:outline-ink"/);
      expect(source).not.toContain("text-on-instrument-muted");
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
