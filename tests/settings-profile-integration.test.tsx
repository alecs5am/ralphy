import { act, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { App } from "../src/App";
import { createReactHost } from "./react-host";

vi.mock("motion/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("motion/react")>(),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

describe("Settings profile integration", () => {
  test("restores focus to the persistent user-pill trigger after Settings closes", async () => {
    const host = createReactHost();
    const storage = new Map<string, string>([[
      "ralphy-media-workbench-v1",
      JSON.stringify({ rootPath: "mock-store", workspaceId: "launch-studio" }),
    ]]);
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    Object.assign(document.documentElement, { dataset: {} });
    Object.assign(window, {
      innerWidth: 1280,
      innerHeight: 800,
      localStorage,
      matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<App />); await Promise.resolve(); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_000)); });
      const trigger = host.container.querySelector<HTMLButtonElement>(".profile-menu-trigger")!;
      await act(async () => { trigger.dispatchEvent(new Event("click", { bubbles: true })); await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
      const settings = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent?.includes("Settings"))!;
      settings.focus();
      expect(document.activeElement).toBe(settings);

      await act(async () => { settings.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      await act(async () => {
        for (let attempt = 0; attempt < 100 && !document.body.querySelector(".settings-screen"); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      });
      const back = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Back to app"))!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true })));
      await act(async () => {
        for (let attempt = 0; attempt < 200 && document.body.querySelector(".settings-screen"); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      });

      expect(document.body.querySelector(".settings-screen")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      await act(async () => root.unmount());
      if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
      host.restore();
    }
  }, 10_000);
});
