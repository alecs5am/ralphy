// Regenerates the guarded token block in src/app/styles/tokens.css from the palette in
// src/shared/instrument/palette.ts,
// the single source of truth for instrument color literals.
import { readFileSync, writeFileSync } from "node:fs";

const { INSTRUMENT_PALETTE } = await import("../src/shared/instrument/palette");
const START = "/* instrument-token-definitions:start */";
const END = "/* instrument-token-definitions:end */";
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const block = (selector, theme) => [
  `${selector} {`,
  `  color-scheme: ${theme};`,
  ...Object.entries(INSTRUMENT_PALETTE[theme]).map(([name, value]) => `  --instrument-${kebab(name)}: ${value};`),
  "}",
].join("\n");

const path = new URL("../src/app/styles/tokens.css", import.meta.url);
const source = readFileSync(path, "utf8");
const start = source.indexOf(START);
const end = source.indexOf(END);
if (start < 0 || end < start) throw new Error("token definition markers missing from tokens.css");
writeFileSync(path, [
  source.slice(0, start + START.length),
  "\n",
  block(':root,\nhtml[data-theme="dark"]', "dark"),
  "\n\n",
  block('html[data-theme="light"]', "light"),
  "\n",
  source.slice(end),
].join(""));
console.log("tokens.css token block synced from palette.ts");
