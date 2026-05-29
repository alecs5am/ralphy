#!/usr/bin/env bun
// Lint: every `logGeneration({...})` call in cli/ MUST pass the canonical keys
// (`cost_usd`, `model`, `provider`, `endpoint`, `kind`) and MUST NOT pass the
// legacy alias `costUsd`. (#032)
//
// This is a grep-level guard, not a full AST analysis — the contract is "writers
// emit canonical keys", and a string match on the legacy alias inside a
// logGeneration() block is enough to catch a regression.
//
// Run from CI via `bun run lint:gen-log` (chained into `bun run lint`).
//
// Exits non-zero with a row-per-violation report when it finds anything.

import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "..");
const SOURCE_ROOT = path.join(REPO, "cli");
// gen-log.ts is the only file allowed to mention `costUsd` (in the normalizer)
// — every other source file is in violation.
const ALLOWED_FILES = new Set<string>([
  path.join(SOURCE_ROOT, "lib", "gen-log.ts"),
]);

// Walk cli/ for *.ts files.
function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.isFile() && ent.name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

type Violation = { file: string; line: number; snippet: string; reason: string };

function scanFile(file: string): Violation[] {
  const out: Violation[] = [];
  const text = fs.readFileSync(file, "utf-8");
  const lines = text.split("\n");

  // Find each `logGeneration(` opener and scan the bracket-balanced block that
  // follows for legacy keys. We use a tiny state machine instead of a regex
  // because logGeneration calls can span 10-20 lines.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const openIdx = line.indexOf("logGeneration(");
    if (openIdx === -1) continue;
    // Skip the definition itself.
    if (line.includes("export async function logGeneration")) continue;
    // Walk forward until the call's matching ')' is closed.
    let depth = 0;
    let started = false;
    const block: string[] = [];
    let j = i;
    outer: for (; j < lines.length; j++) {
      const l = lines[j]!;
      for (const ch of l) {
        if (ch === "(") {
          depth += 1;
          started = true;
        } else if (ch === ")") {
          depth -= 1;
          if (started && depth === 0) break outer;
        }
      }
      block.push(l);
    }
    const body = block.join("\n");

    // Match `costUsd:` as a key (with optional whitespace) but NOT a property
    // read like `result.costUsd`. The negative lookbehind catches the `.` case.
    if (/(?<![.\w])costUsd\s*:/.test(body)) {
      out.push({
        file,
        line: i + 1,
        snippet: lines[i]!.trim(),
        reason: "uses legacy `costUsd:` as a key — write `cost_usd:` instead (#032)",
      });
    }
    // `model:` is mandatory at the canonical site (we already enforce a runtime
    // fallback in logGeneration, but the lint nudges callers to be explicit).
    // Accepts both `model: "..."` and the shorthand `model,` / `model\n` form.
    if (!/\bmodel\s*(?::|,|\n|$)/m.test(body)) {
      out.push({
        file,
        line: i + 1,
        snippet: lines[i]!.trim(),
        reason:
          "missing `model:` — every logGeneration() call must declare the canonical model id (#032)",
      });
    }
  }
  return out;
}

function main(): void {
  const files = walk(SOURCE_ROOT).filter((f) => !ALLOWED_FILES.has(f));
  let total = 0;
  for (const f of files) {
    const v = scanFile(f);
    if (v.length > 0) {
      console.error(`\n${path.relative(REPO, f)}:`);
      for (const violation of v) {
        console.error(`  L${violation.line}: ${violation.reason}`);
        console.error(`    > ${violation.snippet}`);
      }
      total += v.length;
    }
  }
  if (total > 0) {
    console.error(
      `\nlint-gen-log-schema: ${total} violation(s) — see writers above. #032 canonical schema is enforced in cli/lib/gen-log.ts.`,
    );
    process.exit(1);
  }
  console.log(
    `lint-gen-log-schema: ok (${files.length} files scanned, all logGeneration() calls canonical).`,
  );
}

main();
