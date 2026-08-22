import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

/**
 * The stylesheet the app actually ships: the built bundle, which carries the authored CSS
 * *and* the Tailwind layer in their real cascade order. A geometry harness that links the
 * source files alone renders without any utility, so it measures a layout no operator ever
 * sees — that is how a stylesheet came to claim 13px while the screen rendered 11.5px.
 */
export function builtStylesheetLink(): string {
  const assets = resolve(process.cwd(), "dist/assets");
  const find = () => existsSync(assets)
    ? readdirSync(assets).find((file) => /^index-.+\.css$/.test(file))
    : undefined;
  let stylesheet = find();
  if (!stylesheet) {
    execFileSync("bun", ["run", "build:renderer"], { cwd: process.cwd(), stdio: "ignore" });
    stylesheet = find();
  }
  if (!stylesheet) throw new Error("Renderer build produced no application stylesheet");
  return `<link rel="stylesheet" href="${pathToFileURL(join(assets, stylesheet)).href}">`;
}
