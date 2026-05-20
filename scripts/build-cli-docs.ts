#!/usr/bin/env tsx
// scripts/build-cli-docs.ts — 07.03.01
//
// Walks cli/commands/, runs `ralphy <verb> --help`, and emits one .mdx page
// per verb under docs-mintlify/reference/cli/. Each page has two sections:
//
//   1. Summary — signature + 3 most common flags + 1 worked example.
//   2. <Expandable title="Full reference"> — every flag with description.
//
// Per 07-D-03: the summary picks 3 flags marked `commonInRef: true` in the
// verb's flag definitions; when no annotations exist (today's reality), the
// generator picks the first 3 deterministic flags as a fallback.
//
// CLI:
//   bun run docs:cli            → regen the .mdx files
//   bun run docs:cli:check       → exit 1 if committed pages are stale
//
// Idempotent — re-running on a clean tree produces byte-identical output.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ParsedFlag {
  name: string;
  description: string;
}

export interface ParsedHelp {
  usage: string;
  description: string;
  flags: ParsedFlag[];
  examples: string[];
}

// ─── Parser ────────────────────────────────────────────────────────────────

export function parseHelpText(raw: string): ParsedHelp {
  // Strip the leading banner line by line and the ANSI escapes.
  const cleaned = raw.replace(/\x1b\[[0-9;]*m/g, "");
  const usageMatch = cleaned.match(/^Usage:\s*(.+?)$/m);
  const usage = usageMatch ? usageMatch[1]!.trim() : "";

  // Description: the first non-empty paragraph after Usage that isn't
  // "Options:" / "Commands:" / "Arguments:".
  const lines = cleaned.split("\n");
  let description = "";
  let i = lines.findIndex((l) => /^Usage:/.test(l));
  if (i >= 0) {
    i++;
    while (i < lines.length && lines[i]!.trim() === "") i++;
    const descLines: string[] = [];
    while (
      i < lines.length &&
      !/^(Options?|Commands?|Arguments?|Examples?):/.test(lines[i]!.trim())
    ) {
      if (lines[i]!.trim() === "") {
        if (descLines.length > 0) break;
      } else {
        descLines.push(lines[i]!.trim());
      }
      i++;
    }
    description = descLines.join(" ");
  }

  // Flags: lines under "Options:" starting with "  -" or "  --".
  const flags: ParsedFlag[] = [];
  const optionsIdx = lines.findIndex((l) => /^Options?:\s*$/.test(l.trim()));
  if (optionsIdx >= 0) {
    let j = optionsIdx + 1;
    while (j < lines.length) {
      const line = lines[j]!;
      if (/^[A-Z][a-z]+:\s*$/.test(line.trim())) break;  // next section
      // Commander format: "  --flag <value>     description"
      const m = line.match(/^\s+(-[-\w, <>]+?)\s\s+(.*)$/);
      if (m) {
        flags.push({ name: m[1]!.trim(), description: m[2]!.trim() });
      } else if (
        /^\s{20,}/.test(line) &&
        flags.length > 0 &&
        line.trim().length > 0
      ) {
        // Continuation line for the previous flag's description.
        flags[flags.length - 1]!.description += " " + line.trim();
      }
      j++;
    }
  }

  // Examples: lines under "Examples:" until a blank or next section.
  const examples: string[] = [];
  const examplesIdx = lines.findIndex((l) => /^Examples?:\s*$/.test(l.trim()));
  if (examplesIdx >= 0) {
    let j = examplesIdx + 1;
    while (j < lines.length) {
      const line = lines[j]!;
      if (line.trim() === "") {
        // Stop at the first blank line if we already collected examples.
        if (examples.length > 0) break;
        j++;
        continue;
      }
      if (/^[A-Z][a-z]+:\s*$/.test(line.trim())) break;
      const t = line.trim();
      if (t.startsWith("ralphy ")) examples.push(t);
      j++;
    }
  }

  return { usage, description, flags, examples };
}

// ─── Curators ──────────────────────────────────────────────────────────────

export function pickCommonFlags(flags: ParsedFlag[]): ParsedFlag[] {
  return flags.filter((f) => !/-h,?\s*--help/.test(f.name)).slice(0, 3);
}

export function pickExample(examples: string[]): string | null {
  if (examples.length === 0) return null;
  return examples[0]!;
}

// ─── Renderer ──────────────────────────────────────────────────────────────

const HEADER_SENTINEL =
  "{/* Auto-generated — edit `cli/commands/<verb>.ts` instead. Regenerate via `bun run docs:cli`. */}";

export function renderVerbMdx(verb: string, parsed: ParsedHelp): string {
  const lines: string[] = [];
  // Frontmatter
  lines.push("---");
  lines.push(`title: "ralphy ${verb}"`);
  if (parsed.description) {
    // Mintlify description is a single-line plain-text field — strip backticks.
    const desc = parsed.description.replace(/`/g, "").slice(0, 160);
    lines.push(`description: "${desc.replace(/"/g, '\\"')}"`);
  }
  lines.push("---");
  lines.push("");
  lines.push(HEADER_SENTINEL);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  if (parsed.usage) {
    lines.push("```bash");
    lines.push(parsed.usage);
    lines.push("```");
    lines.push("");
  }
  const common = pickCommonFlags(parsed.flags);
  if (common.length > 0) {
    lines.push("**Common flags**");
    lines.push("");
    lines.push("| Flag | Description |");
    lines.push("|---|---|");
    for (const f of common) {
      const desc = f.description.replace(/\|/g, "\\|");
      lines.push(`| \`${f.name}\` | ${desc} |`);
    }
    lines.push("");
  }
  const example = pickExample(parsed.examples);
  if (example) {
    lines.push("**Example**");
    lines.push("");
    lines.push("```bash");
    lines.push(example);
    lines.push("```");
    lines.push("");
  }

  // Full reference (collapsible)
  lines.push(`<Expandable title="Full reference">`);
  lines.push("");
  if (parsed.flags.length > 0) {
    lines.push("**Flags**");
    lines.push("");
    lines.push("| Flag | Description |");
    lines.push("|---|---|");
    for (const f of parsed.flags) {
      const desc = f.description.replace(/\|/g, "\\|");
      lines.push(`| \`${f.name}\` | ${desc} |`);
    }
    lines.push("");
  }
  if (parsed.examples.length > 0) {
    lines.push("**All examples**");
    lines.push("");
    lines.push("```bash");
    for (const ex of parsed.examples) lines.push(ex);
    lines.push("```");
    lines.push("");
  }
  lines.push("</Expandable>");
  lines.push("");
  return lines.join("\n");
}

// ─── CLI entry point ───────────────────────────────────────────────────────

const ADD_CMD_RE = /^\s*program\.addCommand\((\w+)Cmd\(\)\)/gm;

function parseVerbsFromIndex(src: string): string[] {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of stripped.matchAll(ADD_CMD_RE)) {
    const verb = m[1]!;
    if (seen.has(verb)) continue;
    seen.add(verb);
    out.push(verb);
  }
  return out;
}

function captureHelp(repo: string, verb: string): string {
  const r = spawnSync(
    "bun",
    ["run", path.join(repo, "cli", "index.ts"), verb, "--help"],
    { cwd: repo, encoding: "utf8" },
  );
  return (r.stdout + "\n" + r.stderr).replace(/\x1b\[[0-9;]*m/g, "");
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const indexSrc = fs.readFileSync(path.join(repo, "cli", "index.ts"), "utf8");
  const verbs = parseVerbsFromIndex(indexSrc);
  const targetDir = path.join(repo, "docs-mintlify", "reference", "cli");
  const checkMode = process.argv.includes("--check");
  const expectedFiles: Map<string, string> = new Map();

  for (const verb of verbs) {
    const help = captureHelp(repo, verb);
    const parsed = parseHelpText(help);
    const md = renderVerbMdx(verb, parsed);
    expectedFiles.set(`${verb}.mdx`, md);
  }

  if (checkMode) {
    let stale = 0;
    for (const [filename, expected] of expectedFiles) {
      const target = path.join(targetDir, filename);
      const actual = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      if (actual.trim() !== expected.trim()) {
        process.stderr.write(`stale: docs-mintlify/reference/cli/${filename}\n`);
        stale++;
      }
    }
    if (stale > 0) {
      process.stderr.write(`\n${stale} stale page(s). Run \`bun run docs:cli\` and commit.\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({ ok: true, verbs: verbs.length }) + "\n");
    process.exit(0);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const [filename, content] of expectedFiles) {
    fs.writeFileSync(path.join(targetDir, filename), content);
  }
  process.stdout.write(
    JSON.stringify({ ok: true, wrote: targetDir, verbs: verbs.length }) + "\n",
  );
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("build-cli-docs.ts") ||
    process.argv[1].endsWith("build-cli-docs.js"));
if (isDirect) {
  void main();
}
