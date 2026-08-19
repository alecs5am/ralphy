import { expect, test } from "vitest";

import { watchTheme } from "../src/theme";

class FakeMediaQueryList {
  added: EventListener[] = [];
  removed: EventListener[] = [];

  constructor(public matches: boolean) {}

  addEventListener(type: string, listener: EventListener) {
    if (type === "change") this.added.push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    if (type === "change") this.removed.push(listener);
  }

  change(matches: boolean) {
    this.matches = matches;
    for (const listener of this.added) {
      listener({ matches } as Event);
    }
  }
}

test("watches system theme changes and cleans up its listener", () => {
  const mediaQuery = new FakeMediaQueryList(true);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => mediaQuery },
  });
  const resolved: string[] = [];

  try {
    const cleanup = watchTheme("system", (theme) => resolved.push(theme));
    mediaQuery.change(false);
    cleanup();

    expect(resolved).toEqual(["dark", "light"]);
    expect(mediaQuery.removed).toEqual([mediaQuery.added[0]]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: Window }).window;
  }
});

test("resolves fixed themes without installing a media-query listener", () => {
  const mediaQuery = new FakeMediaQueryList(true);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => mediaQuery },
  });
  const resolved: string[] = [];

  try {
    watchTheme("light", (theme) => resolved.push(theme));
    watchTheme("dark", (theme) => resolved.push(theme));

    expect(resolved).toEqual(["light", "dark"]);
    expect(mediaQuery.added).toEqual([]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: Window }).window;
  }
});
