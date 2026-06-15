#!/usr/bin/env bun
// scripts/lint-out-coverage.ts
//
// Issue #001 §A — pretty-mode render-coverage lint.
//
// Cross-references every `out(...)` call site in cli/commands/ against the
// canonical pretty-mode render registry in tests/fixtures/verb-shapes.ts.
//
// HEURISTIC (low-false-positive by design):
//   A command file is a STRUCTURED emitter if it calls `out(...)` with an
//   argument that renders as a table / key-value tree — i.e. the first
//   non-whitespace token after `out(` is `{` (object literal), `[` (array
//   literal), or `...` (spread). Those are the shapes the `[object Object]`
//   bug class lives in.
//
//   Every structured emitter MUST be covered: it has to be a key in
//   VERB_SHAPES (a canonical shape the snapshot test renders through `out()`
//   in pretty mode) OR be listed in EXEMPT with a reason. A scalar-only verb
//   (only ever `out(somePrimitive)`) is neither required nor flagged.
//
// This is deliberately conservative: a command that passes only a *variable*
// to out() (e.g. `out(report)`) is NOT auto-flagged, because we can't prove
// statically whether that variable is structured. We only require coverage
// for the provably-structured literal/spread emitters. That keeps false
// positives at zero while still catching the regression front (a new verb
// that prints an object literal without a render assertion).
//
// Prints JSON, exits 1 on any offender. Wired into `lint:out-coverage` +
// .github/workflows/test.yml.
//
// Usage:
//   bun run lint:out-coverage
//   bun run scripts/lint-out-coverage.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERB_SHAPES, EXEMPT } from "../tests/fixtures/verb-shapes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const COMMANDS_DIR = path.join(REPO, "cli", "commands");

export interface OutCoverageResult {
  /** Command files that emit a structured shape via out(). */
  structuredEmitters: string[];
  /** Structured emitters with no VERB_SHAPES entry and no EXEMPT reason. */
  offenders: Array<{ command: string; reason: string; firstSite: number | null }>;
  /** Structured emitters covered by VERB_SHAPES. */
  covered: string[];
  /** Structured emitters skipped via EXEMPT. */
  exempt: Array<{ command: string; reason: string }>;
  /** VERB_SHAPES / EXEMPT keys that no longer map to a structured emitter. */
  staleRegistryKeys: string[];
}

/**
 * Find each structured `out(...)` site in `src`. Returns the 1-based line
 * numbers of out() calls whose first argument token is `{`, `[`, or `...`.
 */
function structuredOutSites(src: string): number[] {
  const sites: number[] = [];
  const re = /\bout\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i]!)) i++;
    const ch = src[i];
    const isSpread = src.slice(i, i + 3) === "...";
    if (ch === "{" || ch === "[" || isSpread) {
      const line = src.slice(0, m.index).split("\n").length;
      sites.push(line);
    }
  }
  return sites;
}

export function lintOutCoverage(): OutCoverageResult {
  const files = fs
    .readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  const structuredEmitters: string[] = [];
  const firstSiteByCommand: Record<string, number> = {};
  const commandNames = new Set<string>();

  for (const f of files) {
    const command = f.replace(/\.ts$/, "");
    commandNames.add(command);
    const src = fs.readFileSync(path.join(COMMANDS_DIR, f), "utf8");
    const sites = structuredOutSites(src);
    if (sites.length === 0) continue;
    structuredEmitters.push(command);
    firstSiteByCommand[command] = sites[0]!;
  }

  const offenders: OutCoverageResult["offenders"] = [];
  const covered: string[] = [];
  const exempt: OutCoverageResult["exempt"] = [];

  for (const command of structuredEmitters) {
    const hasShapes = Object.prototype.hasOwnProperty.call(VERB_SHAPES, command) && VERB_SHAPES[command]!.length > 0;
    const exemptReason = EXEMPT[command];
    if (hasShapes) {
      covered.push(command);
    } else if (exemptReason) {
      exempt.push({ command, reason: exemptReason });
    } else {
      offenders.push({
        command,
        reason:
          `cli/commands/${command}.ts emits a structured shape via out({...}) / out([...]) ` +
          `but has no canonical shape in tests/fixtures/verb-shapes.ts (VERB_SHAPES["${command}"]) ` +
          `and is not in EXEMPT. Add a representative shape (the snapshot test will assert it) ` +
          `or exempt it with a reason.`,
        firstSite: firstSiteByCommand[command] ?? null,
      });
    }
  }

  // Catch registry rot: a VERB_SHAPES / EXEMPT key that no longer maps to a
  // real command file at all (verb renamed / removed). A key for a command
  // that exists but only emits via a *variable* (e.g. `out(report)`) is NOT
  // stale — extra coverage there is welcome and harmless, it just isn't
  // *required*. We only flag keys whose command file is gone entirely.
  const staleRegistryKeys = [...Object.keys(VERB_SHAPES), ...Object.keys(EXEMPT)].filter(
    (k) => !commandNames.has(k),
  );

  return { structuredEmitters, offenders, covered, exempt, staleRegistryKeys };
}

function main() {
  const result = lintOutCoverage();
  const ok = result.offenders.length === 0 && result.staleRegistryKeys.length === 0;

  console.log(
    JSON.stringify(
      {
        ok,
        summary: {
          structuredEmitters: result.structuredEmitters.length,
          covered: result.covered.length,
          exempt: result.exempt.length,
          offenders: result.offenders.length,
          staleRegistryKeys: result.staleRegistryKeys.length,
        },
        offenders: result.offenders,
        staleRegistryKeys: result.staleRegistryKeys,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    console.error(
      `\nlint:out-coverage FAILED — ${result.offenders.length} uncovered verb(s), ` +
        `${result.staleRegistryKeys.length} stale registry key(s).`,
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
