import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import {
  INSTRUMENT_COLOR_ALLOWLIST,
  INSTRUMENT_PALETTE,
  contrastRatio,
} from "../src/instrument/palette";
import {
  auditCss,
  auditPaletteSource,
  auditTokenCss,
  auditTypeScript,
} from "./instrument-color-audit";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function authoredColorIssues(): string[] {
  return ["src", "electron"].flatMap((directory) => sourceFiles(join(process.cwd(), directory))).flatMap((path) => {
    const projectPath = relative(process.cwd(), path);
    const source = readFileSync(path, "utf8");
    if (projectPath === "src/instrument/palette.ts") return auditPaletteSource(source, INSTRUMENT_COLOR_ALLOWLIST, INSTRUMENT_PALETTE, projectPath);
    if (projectPath === "src/styles/tokens.css") return auditTokenCss(source, INSTRUMENT_COLOR_ALLOWLIST, INSTRUMENT_PALETTE, projectPath);
    return projectPath.endsWith(".css") ? auditCss(source, projectPath) : auditTypeScript(source, projectPath);
  }).sort();
}

function cssThemeVariables(theme: "light" | "dark"): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
  const themeBlock = css.match(new RegExp(`html\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
  const componentBlock = css.slice(css.indexOf("/* instrument-token-definitions:end */")).match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  return Object.fromEntries([...`${themeBlock}\n${componentBlock}`.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

function resolveCssColor(variables: Record<string, string>, token: string): string {
  let value = variables[token];
  const visited = new Set<string>();
  while (value?.startsWith("var(")) {
    const dependency = value.match(/^var\((--[\w-]+)\)$/)?.[1];
    if (!dependency || visited.has(dependency)) throw new Error(`Cannot resolve ${token}: ${value}`);
    visited.add(dependency);
    value = variables[dependency];
  }
  if (!value || !/^#[\dA-F]{6}$/i.test(value)) throw new Error(`Cannot resolve ${token}: ${value ?? "missing"}`);
  return value;
}

describe("instrument color contract", () => {
  test("names the required readable secondary colors", () => {
    expect(INSTRUMENT_PALETTE.light.textSecondaryReadable).toBe("#4A4A48");
    expect(INSTRUMENT_PALETTE.dark.textSecondaryReadable).toBe("#A4A4A0");
  });

  test("keeps normal secondary text at WCAG AA contrast", () => {
    expect(contrastRatio("#4A4A48", "#E2E4EA")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#4A4A48", "#F1F2F6")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A4A4A0", "#050505")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#A4A4A0", "#141414")).toBeGreaterThanOrEqual(4.5);
  });

  test("keeps alert labels readable in both themes", () => {
    expect(INSTRUMENT_PALETTE.light.alertText).toBe("#050505");
    expect(INSTRUMENT_PALETTE.dark.alertText).toBe("#050505");
    expect(contrastRatio(INSTRUMENT_PALETTE.light.alertText, INSTRUMENT_PALETTE.light.alert)).toBeGreaterThanOrEqual(4.5);
  });

  test("keeps actual legacy control and required-copy aliases at WCAG AA", () => {
    const requiredPairs = [
      ["Settings input", "--field-text", "--field-surface"],
      ["Shared select trigger", "--control-text", "--field-surface"],
      ["Workspace/profile/agent menus", "--control-text", "--menu-surface"],
      ["Chat composer", "--field-text", "--field-surface"],
      ["Field placeholder", "--field-placeholder", "--field-surface"],
      ["Required secondary on canvas", "--fg-3", "--canvas"],
      ["Required secondary on sunken", "--fg-3", "--sunken"],
      ["Required secondary on raised", "--fg-3", "--raised"],
      ["Error on canvas", "--danger", "--canvas"],
      ["Error on sunken", "--danger", "--sunken"],
      ["Error on raised", "--danger", "--raised"],
      ["Error on hover", "--danger", "--hover"],
      ["Error on selected", "--danger", "--selected"],
      ["Error in fields", "--danger", "--field-surface"],
      ["Error in menus", "--danger", "--menu-surface"],
    ] as const;
    for (const theme of ["light", "dark"] as const) {
      const variables = cssThemeVariables(theme);
      const failures = requiredPairs.flatMap(([consumer, foreground, background]) => {
        const ratio = contrastRatio(resolveCssColor(variables, foreground), resolveCssColor(variables, background));
        return ratio >= 4.5 ? [] : [{ consumer, foreground, background, ratio }];
      });
      expect(failures, theme).toEqual([]);
    }
  });

  test("keeps component focus tokens visible on every target surface", () => {
    for (const theme of ["light", "dark"] as const) {
      const variables = cssThemeVariables(theme);
      const pairs = theme === "light"
        ? [["--focus-on-light", "--instrument-desk"], ["--focus-on-light", "--instrument-widget-light"], ["--focus-on-dark", "--instrument-widget-dark"], ["--focus-on-dark", "--instrument-media-frame"]]
        : [["--focus-on-dark", "--instrument-desk"], ["--focus-on-dark", "--instrument-widget-dark"], ["--focus-on-dark", "--instrument-widget-light"], ["--focus-on-light", "--instrument-composer-surface"]];
      expect(pairs.flatMap(([focus, surface]) => {
        const ratio = contrastRatio(resolveCssColor(variables, focus), resolveCssColor(variables, surface));
        return ratio >= 3 ? [] : [{ focus, surface, ratio }];
      }), theme).toEqual([]);
    }
  });

  test("rejects malformed colors instead of silently producing a ratio", () => {
    expect(() => contrastRatio("white", "#141414")).toThrow(TypeError);
    expect(() => contrastRatio("#FFF", "#141414")).toThrow(TypeError);
  });

  test("keeps every palette value in the complete authored-color allowlist", () => {
    expect(INSTRUMENT_COLOR_ALLOWLIST).toEqual([
      "#050505", "#060606", "#111111", "#141414", "#181818", "#1C1C1C", "#1D1D1D", "#1E1E1E",
      "#242422", "#242424", "#262626", "#2D2D2D", "#2E2E2E", "#343434", "#3A3A38", "#3F3F3D",
      "#4A4A48", "#5CC45C", "#6A6A66", "#6E6E6A", "#8A8A86", "#9A9A96", "#A4A4A0",
      "#CCCED6", "#D3D6DD", "#D8D8D6", "#DFE2E9", "#E0362C", "#E2E4EA", "#E4E4E2",
      "#E8E8E6", "#EB4438", "#ED6A5E", "#F0B544", "#F1F2F6", "#F2F2F0", "#FFFFFF",
    ]);
    const named = new Set(Object.values(INSTRUMENT_PALETTE).flatMap((palette) => Object.values(palette)));
    expect(INSTRUMENT_COLOR_ALLOWLIST.filter((color) => !named.has(color))).toEqual([]);
    expect(Object.values(INSTRUMENT_PALETTE).flatMap((palette) => Object.values(palette)).filter((color) => !INSTRUMENT_COLOR_ALLOWLIST.includes(color))).toEqual([]);
  });

  test("keeps authored app color literals only in the palette and verified token block", () => {
    expect(authoredColorIssues()).toEqual([]);
  });
});
