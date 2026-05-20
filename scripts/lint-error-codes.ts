#!/usr/bin/env tsx
// scripts/lint-error-codes.ts
//
// Statically lint every cli/ source file for raiseError(<code>, ...) call
// sites where <code> is a string literal not present in the catalog
// (cli/lib/errors/catalog.ts). Enforces the 01.06.01 acceptance criterion
// that new error codes must be added to the catalog before being thrown.
//
// Usage:
//   bun run scripts/lint-error-codes.ts        → scans cli/, exits 1 on violations
//   bunx tsx scripts/lint-error-codes.ts        → same, via tsx
//   imported as a library                       → call lintFiles([...])
//
// Out of scope (today):
//   • Legacy err("...") calls in cli/lib/output.ts — those route through the
//     E_INTERNAL escape hatch by design until they're migrated to raiseError().
//     A follow-up sweep migrates them; this lint is the mechanism that
//     surfaces the gaps as they accumulate.

import fs from "node:fs";
import path from "node:path";
import { isKnownErrorCode } from "../cli/lib/errors/catalog.js";

export interface LintViolation {
  file: string;
  line: number;
  code: string;
}

// Matches:
//   raiseError("E_FOO", ...)
//   raiseError('E_FOO', ...)
//   errFromCode("E_FOO", ...)  (for forward-compat with a future helper name)
//
// Captures the literal string on group 2.
const CALL_RE = /\b(?:raiseError|errFromCode)\s*\(\s*(["'])([A-Z_][A-Z0-9_]*)\1/;

// Strip /* ... */ block comments before per-line scanning so commented-out
// raiseError calls don't produce false positives.
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

export function lintSource(file: string, src: string): LintViolation[] {
  const violations: LintViolation[] = [];
  const cleaned = stripBlockComments(src);
  const lines = cleaned.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip single-line comments.
    const commentIdx = line.indexOf("//");
    const scanned = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const m = scanned.match(CALL_RE);
    if (!m) continue;
    const code = m[2]!;
    if (!isKnownErrorCode(code)) {
      violations.push({ file, line: i + 1, code });
    }
  }
  return violations;
}

export function lintFiles(files: string[]): LintViolation[] {
  const all: LintViolation[] = [];
  for (const f of files) {
    let src: string;
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    all.push(...lintSource(f, src));
  }
  return all;
}

function walkTs(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkTs(p, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const files = walkTs(path.join(repo, "cli"));
  const violations = lintFiles(files);
  if (violations.length === 0) {
    process.stdout.write(
      JSON.stringify({ ok: true, scanned: files.length, violations: [] }) + "\n",
    );
    process.exit(0);
  }
  for (const v of violations) {
    process.stderr.write(`${v.file}:${v.line}  unknown error code: ${v.code}\n`);
  }
  process.stderr.write(
    `\n${violations.length} violation(s). Add the code(s) to cli/lib/errors/catalog.ts or use an existing code.\n`,
  );
  process.exit(1);
}

// Run when invoked directly (not when imported as a library).
const isDirectInvocation =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-error-codes.ts") ||
    process.argv[1].endsWith("lint-error-codes.js"));
if (isDirectInvocation) {
  void main();
}
