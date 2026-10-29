#!/usr/bin/env bun
// scripts/lint-font-licenses.ts
//
// #565: fail on any font without a recorded license. Every font in
// catalog/fonts.json must carry an allowed license (OFL-1.1 / Apache-2.0) with
// a pinned license-file sha256, pinned file hashes and measured coverage, and
// every font-family a catalog fragment (or the preview harness) names must be
// a manifest font; system faces are allowed only as later fallbacks.
// Metadata only: the font binaries are not needed (they live under the
// gitignored .ralphy/catalog/fonts/).
//
// Usage:
//   bun run lint:fonts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FontManifestSchema, lintFontManifest } from "../cli/lib/catalog/fonts.js";
import { HARNESS_CSS } from "../cli/lib/catalog/harness.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(REPO, "catalog");

const manifest = FontManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(CATALOG, "fonts.json"), "utf-8")));
const sources: Array<{ where: string; text: string }> = [{ where: "cli/lib/catalog/harness.ts", text: HARNESS_CSS }];
for (const kind of fs.readdirSync(path.join(CATALOG, "items"))) {
  for (const f of fs.readdirSync(path.join(CATALOG, "items", kind))) {
    if (f.endsWith(".html")) sources.push({ where: `catalog/items/${kind}/${f}`, text: fs.readFileSync(path.join(CATALOG, "items", kind, f), "utf-8") });
  }
}
const issues = lintFontManifest(manifest, sources);
const errors = issues.filter((i) => i.severity === "error");
console.log(JSON.stringify({ ok: errors.length === 0, fonts: manifest.fonts.length, pairs: manifest.pairs.length, sources: sources.length, errors: errors.length, issues }, null, 2));
if (errors.length > 0) process.exit(1);
