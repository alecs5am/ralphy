#!/usr/bin/env tsx
// scripts/build-cli-surface.ts — 01.10.01
//
// Reads cli/index.ts, extracts every registered top-level verb, runs
// `<verb> --help` against each, and writes a single docs/cli-surface.generated.md
// with the captured help. CI gate (also in this script via --check) compares
// the committed file against a fresh regen and fails if they diverge.
//
// The hand-curated docs/cli-surface.md stays — it carries the v1.0-vs-today
// narrative the generator can't infer. The generated file is the
// "fully-up-to-date verb dump" agents and CI can rely on.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ADD_CMD_RE = /^\s*program\.addCommand\((\w+)Cmd\(\)\)/gm;

export function parseVerbsFromIndex(src: string): string[] {
  // Strip block + line comments so commented-out registrations don't slip in.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const found: string[] = [];
  const seen = new Set<string>();
  for (const m of stripped.matchAll(ADD_CMD_RE)) {
    // Convert `setupCmd` → `setup`, `newCmd` → `new`, etc.
    const verb = m[1]!;
    if (seen.has(verb)) continue;
    seen.add(verb);
    found.push(verb);
  }
  return found;
}

export interface VerbHelp {
  name: string;
  help: string;
}

export function renderSurfaceMarkdown(verbs: VerbHelp[]): string {
  const lines: string[] = [];
  lines.push("# Ralphy CLI Surface (generated)");
  lines.push("");
  lines.push("> DO NOT EDIT. Regenerate via `bun run cli:surface:build`.");
  lines.push("> The hand-curated companion lives at `docs/cli-surface.md`.");
  lines.push("");
  lines.push(`Verbs registered: **${verbs.length}**`);
  lines.push("");
  lines.push("## Top-level verbs");
  lines.push("");
  for (const v of verbs) {
    lines.push(`### \`ralphy ${v.name}\``);
    lines.push("");
    lines.push("```");
    lines.push(v.help.trim());
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

function captureHelp(repo: string, verb: string): string {
  const r = spawnSync(
    "bun",
    ["run", path.join(repo, "cli", "index.ts"), verb, "--help"],
    { cwd: repo, encoding: "utf8" },
  );
  const out = (r.stdout + "\n" + r.stderr).trim();
  // Strip ANSI escapes for stable diff.
  return out.replace(/\x1b\[[0-9;]*m/g, "");
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const indexSrc = fs.readFileSync(path.join(repo, "cli", "index.ts"), "utf8");
  const verbs = parseVerbsFromIndex(indexSrc);
  const captured: VerbHelp[] = [];
  for (const v of verbs) {
    captured.push({ name: v, help: captureHelp(repo, v) });
  }
  const md = renderSurfaceMarkdown(captured);
  const target = path.join(repo, "docs", "cli-surface.generated.md");
  const checkMode = process.argv.includes("--check");
  if (checkMode) {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (existing.trim() !== md.trim()) {
      process.stderr.write("docs/cli-surface.generated.md is stale. Run `bun run cli:surface:build` and commit.\n");
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({ ok: true, verbs: verbs.length }) + "\n");
    process.exit(0);
  }
  fs.writeFileSync(target, md);
  process.stdout.write(JSON.stringify({ ok: true, wrote: target, verbs: verbs.length, bytes: md.length }) + "\n");
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("build-cli-surface.ts") ||
    process.argv[1].endsWith("build-cli-surface.js"));
if (isDirect) {
  void main();
}
