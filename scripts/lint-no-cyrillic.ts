#!/usr/bin/env bun
// scripts/lint-no-cyrillic.ts
//
// #465 — English-only-on-disk gate. Fails on any Cyrillic in a tracked text
// file. developing-ralphy.md mandates English-only output repo-wide; this turns
// the previously-manual `rg '\p{Cyrillic}'` check into a real CI gate so the
// rule can't silently rot.
//
// Scope: `git ls-files` minus binary assets minus the ALLOWLIST of pre-existing
// all-Russian docs (tracked translation debt, #479). New Cyrillic in any clean
// file fails immediately. Cyrillic-only by design (the recurring failure mode);
// kept narrow to stay false-positive-free.
//
// Usage:
//   bun run lint:no-cyrillic
//   bun run scripts/lint-no-cyrillic.ts

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Binary assets — regex against random bytes is meaningless + noisy. */
const BINARY_EXT =
  /\.(webp|png|jpe?g|gif|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|ogg|zip|gz|tgz|pdf|avif|heic|lockb)$/i;

/**
 * Translation-debt escape hatch (#465): paths whose Cyrillic is tracked debt
 * rather than a fresh violation. The original seven all-Russian content/audit
 * docs were translated to English in #479, so this is now EMPTY — the gate scans
 * the whole tree. Add a path here ONLY for genuine pre-existing debt, and delete
 * it the moment the file is translated.
 */
export const ALLOWLIST = new Set<string>([]);

export interface CyrillicHit {
  file: string;
  line: number;
  snippet: string;
}

/** 1-based line numbers (+ trimmed snippet) in `text` that contain Cyrillic. */
export function cyrillicLines(text: string): Array<{ line: number; snippet: string }> {
  const hits: Array<{ line: number; snippet: string }> = [];
  text.split("\n").forEach((l, i) => {
    if (CYRILLIC.test(l)) hits.push({ line: i + 1, snippet: l.trim().slice(0, 100) });
  });
  return hits;
}

/** Scan every tracked, non-binary, non-allowlisted file for Cyrillic. */
export function scanRepo(repoRoot: string): { scanned: number; hits: CyrillicHit[] } {
  const files = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const hits: CyrillicHit[] = [];
  let scanned = 0;
  for (const rel of files) {
    if (BINARY_EXT.test(rel) || ALLOWLIST.has(rel)) continue;
    let text: string;
    try {
      text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
    } catch {
      continue;
    }
    scanned += 1;
    for (const h of cyrillicLines(text)) hits.push({ file: rel, line: h.line, snippet: h.snippet });
  }
  return { scanned, hits };
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-no-cyrillic.ts") ||
    process.argv[1].endsWith("lint-no-cyrillic.js"));

if (isDirect) {
  const repo = path.resolve(import.meta.dir, "..");
  const { scanned, hits } = scanRepo(repo);
  if (hits.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, scanned, hits: 0 }) + "\n");
    process.exit(0);
  }
  process.stdout.write(
    JSON.stringify({ ok: false, scanned, hits: hits.length, details: hits.slice(0, 50) }, null, 2) + "\n",
  );
  for (const h of hits) process.stderr.write(`  • ${h.file}:${h.line}  ${h.snippet}\n`);
  process.stderr.write(
    `\n${hits.length} Cyrillic line(s) on disk. English-only is a hard rule (docs/developing-ralphy.md). Translate / paraphrase to English, or — for genuine pre-existing debt — add the path to ALLOWLIST in scripts/lint-no-cyrillic.ts.\n`,
  );
  process.exit(1);
}
