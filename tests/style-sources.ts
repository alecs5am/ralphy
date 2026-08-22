import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STYLE_DIR = resolve(process.cwd(), "src/styles");

/**
 * Reads a stylesheet with its `@import` graph inlined, in cascade order. Style entry
 * points are split into per-domain parts, so assertions must see the resolved sheet
 * rather than the manifest.
 */
export function readStylesheet(name: string): string {
  const path = name.startsWith("/") ? name : join(STYLE_DIR, name);
  const source = readFileSync(path, "utf8");
  return source.replace(/@import\s+"([^"]+)";?/g, (_, target: string) =>
    readStylesheet(resolve(dirname(path), target)));
}

export function readStylesheets(names: readonly string[]): string {
  return names.map((name) => readStylesheet(name)).join("\n");
}
