#!/usr/bin/env tsx
// scripts/lint-confirmation-shape.ts — 04.03.04
//
// Sweeps every playbook in `docs/playbooks/` and every skill in
// `.agents/skills/*/SKILL.md` for *confirmation-shaped* phrases that the
// agent should NOT emit on a concrete user request (per `04.03.01` +
// `04.03.04`).
//
// The rule, per AGENTS.md + intake.md: real clarifying questions are fine
// (each must unblock a distinct decision). What's banned is the
// hand-wringing "may I proceed?" register that doesn't surface new
// information and just stalls the loop.
//
// Allowlist:
//   • Quoted examples inside code fences (the playbook is documenting the
//     ANTI-pattern, not committing it).
//   • Lines explicitly tagged with `<!-- confirmation-shape-allow -->`.
//   • Lines inside a section explicitly tagged with
//     `<!-- confirmation-shape-allow:section -->` until the next `##` heading
//     (so a "things NOT to say" section can list examples without being
//     flagged).
//
// Adding a new banned phrase? Append to BANNED_PHRASES below. The lint
// matches case-insensitively against the literal phrase as a whole-word
// substring.
//
// Output shape (JSON on success, JSON on stderr on failure):
//   { ok: true, scanned: <N>, findings: 0 }
//   { ok: false, scanned: <N>, findings: <count>, hits: [{ file, line, phrase, snippet }] }

import fs from "node:fs";
import path from "node:path";

export interface Hit {
  file: string;     // repo-relative
  line: number;     // 1-indexed
  phrase: string;   // the matched banned phrase
  snippet: string;  // the offending line trimmed
}

export interface LintReport {
  ok: boolean;
  scanned: number;
  findings: number;
  hits: Hit[];
}

// ─── Banned phrases ────────────────────────────────────────────────────────
//
// These are case-insensitive whole-line substring matches. Keep the list
// short and famous. Adding a phrase here is a behavioural assertion — the
// agent literally must not say this to the user on a concrete request.

export const BANNED_PHRASES = [
  "should i proceed",
  "shall i proceed",
  "shall i go ahead",
  "shall i continue",
  "shall i fix",
  "should i fix",
  "would you like me to",
  "do you want me to",
  "want me to go ahead",
  "want me to proceed",
  "i'll go ahead and",
  "just to confirm",
  // Russian counterparts — playbooks are bilingual.
  "мне продолжить",
  "хочешь чтобы я",
  "хочешь, чтобы я",
  "продолжить?",
] as const;

// ─── Walkers ───────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Skip lines inside fenced code blocks (the playbook is quoting bad UX, not committing it). */
  skipFencedCode?: boolean;
  /** Skip lines flagged by an inline `<!-- confirmation-shape-allow -->` marker. */
  honorInlineAllow?: boolean;
}

const DEFAULT_OPTS: Required<ScanOptions> = {
  skipFencedCode: true,
  honorInlineAllow: true,
};

const INLINE_ALLOW = /<!--\s*confirmation-shape-allow\s*-->/i;
const SECTION_ALLOW = /<!--\s*confirmation-shape-allow:section\s*-->/i;

/** Scan a single file's contents; returns hits relative to the file. */
export function scanText(src: string, relPath: string, opts: ScanOptions = {}): Hit[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  const lines = src.split("\n");
  const hits: Hit[] = [];
  let inFence = false;
  let sectionAllowActive = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    // Toggle section-level allow when a new H2/H3 starts.
    if (/^##+\s/.test(raw)) {
      sectionAllowActive = SECTION_ALLOW.test(raw);
    }
    // Toggle fence state. ``` opens, next ``` closes.
    if (/^```/.test(raw.trimStart())) {
      inFence = !inFence;
      continue;
    }
    if (o.skipFencedCode && inFence) continue;
    if (sectionAllowActive) continue;
    if (o.honorInlineAllow && INLINE_ALLOW.test(raw)) continue;

    const lower = raw.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        hits.push({
          file: relPath,
          line: i + 1,
          phrase,
          snippet: raw.trim().slice(0, 240),
        });
        break; // one hit per line is enough — keep output legible
      }
    }
  }
  return hits;
}

/**
 * Walk all targets (playbooks + skill READMEs) under repoRoot.
 *
 * `targets` is overridable for unit tests so we don't have to populate a
 * fixture tree on every call.
 */
export function lintConfirmationShape(
  repoRoot: string,
  targets: string[] | null = null,
): LintReport {
  const files = targets ?? defaultTargets(repoRoot);
  const hits: Hit[] = [];
  let scanned = 0;
  for (const abs of files) {
    if (!fs.existsSync(abs)) continue;
    scanned++;
    const src = fs.readFileSync(abs, "utf8");
    const rel = path.relative(repoRoot, abs);
    hits.push(...scanText(src, rel));
  }
  return {
    ok: hits.length === 0,
    scanned,
    findings: hits.length,
    hits,
  };
}

function defaultTargets(repoRoot: string): string[] {
  const out: string[] = [];
  const playbooks = path.join(repoRoot, "docs", "playbooks");
  if (fs.existsSync(playbooks)) {
    walkMarkdown(playbooks, out);
  }
  const skills = path.join(repoRoot, ".agents", "skills");
  if (fs.existsSync(skills)) {
    for (const entry of fs.readdirSync(skills, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skills, entry.name, "SKILL.md");
      if (fs.existsSync(skillMd)) out.push(skillMd);
    }
  }
  return out;
}

function walkMarkdown(dir: string, acc: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(p, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(p);
    }
  }
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const report = lintConfirmationShape(repo);
  if (report.ok) {
    process.stdout.write(
      JSON.stringify({ ok: true, scanned: report.scanned, findings: 0 }) + "\n",
    );
    process.exit(0);
  }
  process.stderr.write(
    JSON.stringify({ ok: false, scanned: report.scanned, findings: report.findings, hits: report.hits.slice(0, 50) }, null, 2) +
      "\n",
  );
  for (const h of report.hits) {
    process.stderr.write(`  ✖ ${h.file}:${h.line}  "${h.phrase}"\n      ${h.snippet}\n`);
  }
  process.stderr.write(
    `\n${report.findings} confirmation-shape hit(s) across ${report.scanned} file(s).\n` +
      `Fix by replacing "shall I…?" / "should I…?" with an action statement, or tag the line with <!-- confirmation-shape-allow -->.\n`,
  );
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-confirmation-shape.ts") ||
    process.argv[1].endsWith("lint-confirmation-shape.js"));
if (isDirect) {
  void main();
}
