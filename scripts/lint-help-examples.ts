#!/usr/bin/env tsx
// scripts/lint-help-examples.ts
//
// 01.03.02 enforcement. Extracts every `ralphy <...>` command string from
// landing/components/**.tsx and verifies each one (filtered to v1.0 verbs)
// appears in the corresponding --help output. Post-launch verbs (trend,
// iterate, make) are skipped — they're surfaced on the landing as roadmap
// teasers and won't ship until later.
//
// Usage:
//   bun run lint:help-examples
//   bun run scripts/lint-help-examples.ts

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type V1HelpIndex = Record<string, string>;

export interface LintResult {
  violations: Array<{ example: string; reason: string }>;
  skipped: string[];
  checked: number;
}

// Verbs that exist in v1.0 (per roadmap/01-cli/SPEC.md). Post-launch verbs
// listed in 01.11.x are NOT in this set.
const V1_VERB_PREFIXES = [
  "ralphy clone",
  "ralphy render",
  "ralphy skill install",
  "ralphy generate",
  "ralphy ref",
  "ralphy template",
  "ralphy assets",
  "ralphy project",
  "ralphy eval",
  "ralphy doctor",
  "ralphy setup",
  "ralphy status",
  "ralphy whoami",
  "ralphy config",
  "ralphy models",
  "ralphy new",
  "ralphy persona",
  "ralphy brand",
  "ralphy batch",
  "ralphy profile",
];

// Verbs that are NOT in v1.0 (per D-01, D-03, D-04 of roadmap 01-cli).
const POST_LAUNCH_PREFIXES = ["ralphy trend", "ralphy iterate", "ralphy make", "ralphy mcp"];

export function classifyExample(example: string): { v1: boolean; verb: string | null } {
  for (const p of POST_LAUNCH_PREFIXES) {
    if (example.startsWith(p)) return { v1: false, verb: p };
  }
  for (const p of V1_VERB_PREFIXES) {
    if (example.startsWith(p)) return { v1: true, verb: p };
  }
  return { v1: false, verb: null };
}

/**
 * Extract every `ralphy ...` command string from a piece of source text.
 * Handles both backtick-quoted (inline prose) and template-literal
 * (`{...}` JSX expressions) forms.
 */
export function extractLandingExamples(src: string): string[] {
  const out = new Set<string>();
  // Backtick form: `ralphy <stuff>`
  const backtick = /`(ralphy\s+[^`]+?)`/g;
  for (const m of src.matchAll(backtick)) {
    const cmd = m[1]!.trim();
    if (/^ralphy\s+\w/.test(cmd)) out.add(cmd);
  }
  // Template-literal form: {`ralphy ...\n`} — we already pulled this above,
  // but also support multi-line template literals that span past one line.
  return Array.from(out)
    // Strip trailing `\n` literal that lands when a template literal closes mid-string.
    .map((s) => s.replace(/\\n$/, "").trim())
    // Drop empty / verb-less items.
    .filter((s) => s.split(/\s+/).length >= 2);
}

/**
 * Strip free-form arguments to leave just the verb chain. Used to match
 * an example against the right --help text.
 */
function verbChain(example: string): string {
  const parts = example.split(/\s+/);
  // Take the first 2-3 tokens that look like verbs (no flags, no URLs).
  const chain: string[] = [];
  for (const p of parts.slice(0, 4)) {
    if (p.startsWith("-")) break;
    if (p.startsWith("http")) break;
    if (p.startsWith("<") || p.startsWith('"')) break;
    chain.push(p);
  }
  return chain.join(" ");
}

export function lintExamples(examples: string[], helpIndex: V1HelpIndex): LintResult {
  const violations: LintResult["violations"] = [];
  const skipped: string[] = [];
  let checked = 0;
  for (const example of examples) {
    const cls = classifyExample(example);
    if (!cls.v1) {
      skipped.push(example);
      continue;
    }
    checked++;
    const chain = verbChain(example).replace(/^ralphy\s+/, "");
    const topVerb = chain.split(/\s+/)[0]!;
    const help = helpIndex[topVerb];
    if (!help) {
      violations.push({ example, reason: `no --help captured for verb '${topVerb}'` });
      continue;
    }
    // Acceptance: example string must appear in the help text.
    if (!help.includes(example)) {
      violations.push({ example, reason: `not present in 'ralphy ${topVerb} --help' output` });
    }
  }
  return { violations, skipped, checked };
}

// ─── CLI entry point ───────────────────────────────────────────────────────

function walkTsx(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkTsx(p, out);
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      out.push(p);
    }
  }
  return out;
}

function captureHelp(repo: string, verb: string): string {
  const r = spawnSync(
    "bun",
    ["run", path.join(repo, "cli", "index.ts"), verb, "--help"],
    { cwd: repo, encoding: "utf8" },
  );
  return r.stdout + "\n" + r.stderr;
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const tsxFiles = walkTsx(path.join(repo, "landing"));
  const allExamples = new Set<string>();
  for (const f of tsxFiles) {
    const src = fs.readFileSync(f, "utf8");
    for (const e of extractLandingExamples(src)) allExamples.add(e);
  }
  // Build help index: capture --help for each unique top-verb mentioned.
  const helpIndex: V1HelpIndex = {};
  const verbs = new Set<string>();
  for (const e of allExamples) {
    const cls = classifyExample(e);
    if (!cls.v1) continue;
    const top = verbChain(e).replace(/^ralphy\s+/, "").split(/\s+/)[0]!;
    verbs.add(top);
  }
  for (const v of verbs) {
    helpIndex[v] = captureHelp(repo, v);
  }
  const result = lintExamples(Array.from(allExamples), helpIndex);
  if (result.violations.length === 0) {
    process.stdout.write(
      JSON.stringify(
        { ok: true, scanned: tsxFiles.length, examples: allExamples.size, checked: result.checked, skipped: result.skipped.length },
        null,
        2,
      ) + "\n",
    );
    process.exit(0);
  }
  for (const v of result.violations) {
    process.stderr.write(`  ✖ ${v.example}\n    ${v.reason}\n`);
  }
  process.stderr.write(`\n${result.violations.length} landing example(s) not present in --help.\n`);
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-help-examples.ts") ||
    process.argv[1].endsWith("lint-help-examples.js"));
if (isDirect) {
  void main();
}
