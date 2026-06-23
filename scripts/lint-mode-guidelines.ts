#!/usr/bin/env tsx
// scripts/lint-mode-guidelines.ts — #417 (mode-level quality-playbook coverage)
//
// #413 established WHICH content modes are SUPPORTED (first-class routes the
// agent may promise). #417 says a mode cannot be considered fully supported
// without at least one piece of mode-specific QUALITY GUIDANCE backing it — a
// linked register guideline OR a mode-level quality playbook — so the agent is
// never left to improvise art direction, negative scope, or model picks.
//
// This lint asserts that bar. For every SUPPORTED mode (`supportedContentModes()`
// in `cli/lib/content-modes.ts`) it requires AT LEAST ONE of:
//
//   1. A LINKED GUIDELINE — the mode's `implementationUnit.guidelines` or
//      `guidelineOrStyleLock.guidelineSlugs` names a slug that resolves to an
//      existing `guidelines/<slug>/` directory (the public register gallery).
//   2. A MODE-LEVEL QUALITY PLAYBOOK — a `docs/playbooks/modes/<mode>.md` doc
//      exists for the mode (the home #417 chose for production-intent guidance
//      that does NOT fit the `guideline.json` look/register schema).
//
// A supported mode with NEITHER is an offender: it would route through the
// generic art-director step with no mode-specific quality floor. FAIL is exit 1
// with a JSON `{ ok, scanned, exempt, offenders }` report (mirrors
// lint-skill-routing.ts) so CI and the test suite can consume it.
//
// SCOPE — only SUPPORTED modes are checked. Deferred-gap modes (kind "none")
// are EXEMPT — they are recognized intents with no first-class route yet, so
// #417 does not hold them to a coverage bar (they carry a `recommendedUnit`
// instead). As of #436 there are no gap modes left (personal-clipper promoted);
// any future mode added at `supported: false` is exempt until it is promoted,
// at which point this lint starts requiring its coverage automatically.

import fs from "node:fs";
import path from "node:path";
import {
  supportedContentModes,
  modePlaybookPath,
  CONTENT_MODES_LIST,
  type ContentModeEntry,
} from "../cli/lib/content-modes.js";

/** Where the mode-level quality playbooks live (the #417-chosen home). */
export const MODE_PLAYBOOK_DIR = path.join("docs", "playbooks", "modes");

export interface ModeCoverage {
  /** Guideline slugs the mode references that resolve to an existing dir. */
  linkedGuidelines: string[];
  /** Guideline slugs the mode references that do NOT resolve (dangling). */
  danglingGuidelines: string[];
  /** True when a docs/playbooks/modes/<mode>.md playbook exists. */
  hasModePlaybook: boolean;
  /** Overall: is the mode covered by ≥1 guideline OR a mode playbook? */
  ok: boolean;
}

/**
 * The full set of guideline slugs a mode references (impl unit + style lock,
 * deduped). Reads the PASSED entry's own fields — not the registry by name — so
 * a synthetic / stripped entry (used by the teeth tests) is scored on its own
 * data. For a real registry entry this equals `modeGuidelineCoverage(mode)`.
 */
export function referencedGuidelineSlugs(entry: ContentModeEntry): string[] {
  return [
    ...new Set([
      ...entry.implementationUnit.guidelines,
      ...entry.guidelineOrStyleLock.guidelineSlugs,
    ]),
  ];
}

/** True when `guidelines/<slug>/` exists with a guideline.json (a real entry). */
export function guidelineExists(repoRoot: string, slug: string): boolean {
  const dir = path.join(repoRoot, "guidelines", slug);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, "guideline.json"));
}

/** True when the mode's conventional `docs/playbooks/modes/<mode>.md` exists. */
export function modePlaybookExists(repoRoot: string, mode: string): boolean {
  return fs.existsSync(path.join(repoRoot, modePlaybookPath(mode)));
}

/** Score the quality-guidance coverage of one supported mode. */
export function scoreModeCoverage(repoRoot: string, entry: ContentModeEntry): ModeCoverage {
  const referenced = referencedGuidelineSlugs(entry);
  const linkedGuidelines = referenced.filter((s) => guidelineExists(repoRoot, s));
  const danglingGuidelines = referenced.filter((s) => !guidelineExists(repoRoot, s));
  const hasModePlaybook = modePlaybookExists(repoRoot, entry.mode);
  const ok = linkedGuidelines.length > 0 || hasModePlaybook;
  return { linkedGuidelines, danglingGuidelines, hasModePlaybook, ok };
}

export interface ModeOffender {
  mode: string;
  referencedGuidelines: string[];
  danglingGuidelines: string[];
  coverage: ModeCoverage;
  reason: string;
}

export interface ModeCoverageReport {
  ok: boolean;
  /** Supported modes checked. */
  scanned: number;
  /** Unsupported (deferred-gap) modes skipped. */
  exempt: number;
  offenders: ModeOffender[];
}

export function lintModeGuidelines(repoRoot: string): ModeCoverageReport {
  const supported = supportedContentModes();
  const offenders: ModeOffender[] = [];

  for (const entry of supported) {
    const coverage = scoreModeCoverage(repoRoot, entry);
    if (!coverage.ok) {
      offenders.push({
        mode: entry.mode,
        referencedGuidelines: referencedGuidelineSlugs(entry),
        danglingGuidelines: coverage.danglingGuidelines,
        coverage,
        reason:
          `supported mode "${entry.mode}" has no quality guidance — ` +
          `link an existing guidelines/<slug>/ via implementationUnit.guidelines / ` +
          `guidelineOrStyleLock.guidelineSlugs, or add a mode-level quality playbook ` +
          `at ${MODE_PLAYBOOK_DIR}/${entry.mode}.md`,
      });
    }
  }

  // Count the deferred-gap modes (supported === false) as exempt for the report.
  const exempt = CONTENT_MODES_LIST.length - supported.length;

  return { ok: offenders.length === 0, scanned: supported.length, exempt, offenders };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const report = lintModeGuidelines(repo);
  if (report.ok) {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exit(0);
  }
  process.stderr.write(JSON.stringify(report, null, 2) + "\n");
  for (const o of report.offenders) {
    process.stderr.write(`content-mode "${o.mode}":\n  ✖ ${o.reason}\n`);
  }
  process.stderr.write(
    `\n${report.offenders.length} uncovered supported mode(s) across ${report.scanned} checked.\n`,
  );
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-mode-guidelines.ts") ||
    process.argv[1].endsWith("lint-mode-guidelines.js"));
if (isDirect) {
  void main();
}
