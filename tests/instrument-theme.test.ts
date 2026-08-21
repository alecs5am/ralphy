import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { COLOR_ASSET_SHA256, DITHER_ASSET_SHA256, INSTRUMENT_PALETTE } from "../src/instrument/palette";
import {
  THEME_PREFERENCES,
  applyResolvedTheme,
  parseThemePreference,
  resolveTheme,
} from "../src/instrument/theme";
import { ThemeProvider, useTheme } from "../src/instrument/ThemeProvider";
import { auditAssetManifest } from "./instrument-color-audit";
import { createReactHost } from "./react-host";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(process.cwd(), path))).digest("hex");
}

function cssThemeTokens(theme: "light" | "dark"): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
  const block = css.match(new RegExp(`html\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/--instrument-([\w-]+):\s*(#[\dA-F]{6});/g)].map((match) => [match[1], match[2]]));
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function visualAssets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return visualAssets(path);
    return /\.(?:apng|avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(entry.name) ? [path] : [];
  });
}

function emulateBootstrap(
  stored: unknown,
  systemDark: boolean,
  storageThrows = false,
): { dataset: Record<string, string>; style: Record<string, string> } {
  const root = { dataset: {}, style: {} };
  const script = readFileSync(join(process.cwd(), "public/theme-bootstrap.js"), "utf8");
  runInNewContext(script, {
    document: { documentElement: root },
    localStorage: {
      getItem: () => {
        if (storageThrows) throw new Error("storage unavailable");
        return JSON.stringify(stored);
      },
    },
    window: {
      matchMedia: (query: string) => {
        if (query !== "(prefers-color-scheme: dark)") throw new Error(`Unexpected query: ${query}`);
        return { matches: systemDark };
      },
    },
  });
  return root;
}

function ThemeProbe() {
  const theme = useTheme();
  return createElement("output", {
    "data-preference": theme.preference,
    "data-resolved": theme.resolved,
  });
}

describe("instrument theme contract", () => {
  test("accepts only the three theme preferences", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "dark", "light"]);
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  test("resolves system without changing explicit preferences", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  test("applies the resolved theme to both DOM theme consumers", () => {
    const root = { dataset: {}, style: {} } as HTMLElement;
    applyResolvedTheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  test("runs a blocking local bootstrap before body without weakening script CSP", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const bootstrap = html.indexOf('<script src="/theme-bootstrap.js"></script>');
    expect(bootstrap).toBeGreaterThan(html.indexOf("Content-Security-Policy"));
    expect(bootstrap).toBeLessThan(html.indexOf("<body>"));
    expect(html).not.toMatch(/<script(?![^>]+src=)[^>]*>/i);
    expect(html).toMatch(/script-src 'self'/);
  });

  test("prepaints validated explicit and system themes even when storage is unavailable", () => {
    expect(emulateBootstrap({ theme: "light", sidebarVisible: false }, true)).toEqual({
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    });
    expect(emulateBootstrap({ theme: "system" }, true)).toEqual({
      dataset: { theme: "dark" },
      style: { colorScheme: "dark" },
    });
    expect(emulateBootstrap({ theme: "sepia" }, false)).toEqual({
      dataset: { theme: "light" },
      style: { colorScheme: "light" },
    });
    expect(emulateBootstrap(null, true, true)).toEqual({
      dataset: { theme: "dark" },
      style: { colorScheme: "dark" },
    });
  });

  test("tracks system theme changes and removes its sole listener on unmount", async () => {
    const host = createReactHost();
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const media = {
      matches: true,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    } as MediaQueryList;
    Object.assign(document.documentElement, { dataset: {} });
    Object.assign(window, { matchMedia: () => media });
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => root.render(createElement(
        ThemeProvider,
        { initialPreference: "system" },
        createElement(ThemeProbe),
      )));
      const output = host.container.querySelector("output");
      expect(output?.getAttribute("data-preference")).toBe("system");
      expect(output?.getAttribute("data-resolved")).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(listeners.size).toBe(1);

      media.matches = false;
      const change = Object.assign(new Event("change"), { matches: false });
      await act(async () => listeners.forEach((listener) => listener(change as MediaQueryListEvent)));
      expect(output?.getAttribute("data-resolved")).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    } finally {
      await act(async () => root.unmount());
      expect(listeners.size).toBe(0);
      host.restore();
    }
  });

  test("bundles the pinned Doto font and license bytes", () => {
    expect(sha256("public/assets/fonts/Doto-Variable.ttf")).toBe("6f4fe7d37853b91df3698daa84cde2dbe1c9695d88c986e6510134910337d426");
    expect(sha256("public/assets/fonts/OFL-Doto.txt")).toBe("26a7b58bdba6cda8a78ca6e8b3791d8013b8abc6d5e6519f84193893aee02020");
    const license = readFileSync(join(process.cwd(), "public/assets/fonts/OFL-Doto.txt"), "utf8");
    expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007");
    expect(license.split("\n").flatMap((line, index) => /[\t ]+$/.test(line) ? [index + 1] : [])).toEqual([21]);
  });

  test("keeps excluded binary dither assets byte-identical", () => {
    const directory = "public/assets/dither";
    expect(Object.fromEntries(readdirSync(join(process.cwd(), directory)).sort().map((file) => [file, sha256(`${directory}/${file}`)])))
      .toEqual(DITHER_ASSET_SHA256);
  });

  test("pins every shipped visual asset by exact path and bytes", () => {
    const assets = Object.fromEntries(visualAssets(join(process.cwd(), "public")).map((path) => [relative(process.cwd(), path), readFileSync(path)]));
    const manifest = {
      ...COLOR_ASSET_SHA256,
      ...Object.fromEntries(Object.entries(DITHER_ASSET_SHA256).map(([file, digest]) => [`public/assets/dither/${file}`, digest])),
    };
    expect(auditAssetManifest(assets, manifest)).toEqual([]);
  });

  test("keeps CSS theme definitions equal to the named palette", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(cssThemeTokens(theme)).toEqual(Object.fromEntries(
        Object.entries(INSTRUMENT_PALETTE[theme]).map(([name, value]) => [kebabCase(name), value]),
      ));
    }
  });
});
