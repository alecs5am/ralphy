import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DITHER_ASSET_SHA256, INSTRUMENT_PALETTE } from "../src/instrument/palette";
import {
  THEME_PREFERENCES,
  applyResolvedTheme,
  parseThemePreference,
  resolveTheme,
} from "../src/instrument/theme";

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

  test("keeps CSS theme definitions equal to the named palette", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(cssThemeTokens(theme)).toEqual(Object.fromEntries(
        Object.entries(INSTRUMENT_PALETTE[theme]).map(([name, value]) => [kebabCase(name), value]),
      ));
    }
  });
});
