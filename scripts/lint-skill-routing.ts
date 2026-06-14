#!/usr/bin/env tsx
// scripts/lint-skill-routing.ts — #405 (harden agent routing + skill activation)
//
// `lint-skills.ts` already enforces frontmatter SHAPE (name regex, ≤1536-char
// description, namespace enum). This lint enforces the ROUTING SIGNAL the
// skill-activation research (`docs/research/skill-activation.md`, H1/H3) says a
// description needs to actually fire: a user-facing skill must carry at least
// one *actionable trigger cue* so the matcher (and a mid-conversation agent
// re-reading frontmatter) can bind an utterance to it. A broad prose blurb with
// no "USE WHEN" / example utterances / `triggers:` array is the underfire bug.
//
// Heuristic — a `namespace: user` skill PASSES iff ANY of:
//   1. A `triggers:` frontmatter array is present (≥1 entry), OR
//   2. The description contains a trigger-cue token — USE WHEN / USE THIS /
//      TRIGGER / FIRES / ALSO FIRE / KEYWORDS / "use this skill when[ever]" /
//      a slash-command self-reference like `/postmortem` (case-insensitive), OR
//   3. The description carries ≥2 example utterances quoted with straight ("…")
//      or curly ("…") double quotes.
//
// Rationale: every legitimate trigger-forward description today satisfies (2)
// or (3); a description that satisfies none is, by construction, a flat blurb
// that conflates intents with no actionable hook — exactly what we want to flag.
//
// SCOPE — only `namespace: user` skills are held to this bar. Maintainer skills
// (`namespace: maintainer`) and the HyperFrames render-engine skills (no
// `namespace`, e.g. gsap / hyperframes / three) are EXEMPT: maintainer skills
// are invoked deliberately by a developer, and the HyperFrames skills are
// reference docs reached through the `hyperframes` routing row, not matched from
// a cold user utterance. They still pass `lint-skills.ts` for shape.
//
// Output mirrors lint-skills.ts: JSON `{ ok, scanned, offenders }` on success,
// JSON + per-offender stderr lines + exit 1 on failure.

import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, type SkillFrontmatter } from "./lint-skills.js";

/** Trigger-cue tokens that mark a description as actionable. Case-insensitive. */
const CUE_RE =
  /\bUSE WHEN\b|\bUSE THIS\b|\bTRIGGER(?:S)?\b|\bFIRES?\b|\bALSO FIRE\b|\bKEYWORDS\b|use this skill (?:when|whenever)|(?:^|\s)\/[a-z][a-z0-9-]+/i;

/** Straight- or curly-double-quoted example utterance, ≥3 inner chars. */
const QUOTED_UTTERANCE_RE = /"[^"]{3,}"|“[^”]{3,}”/g;

/** Minimum quoted example utterances to count as a trigger signal on their own. */
const MIN_UTTERANCES = 2;

export interface RoutingSignal {
  /** A `triggers:` frontmatter array is present with ≥1 entry. */
  hasTriggersArray: boolean;
  /** Description contains a trigger-cue token. */
  hasCue: boolean;
  /** Count of quoted example utterances in the description. */
  utteranceCount: number;
  /** Overall: does the skill carry an actionable trigger signal? */
  ok: boolean;
}

/**
 * A skill is held to the routing bar only when it is user-facing
 * (`namespace: user`). Maintainer + HyperFrames (no-namespace) skills are exempt.
 */
export function isUserFacing(fm: SkillFrontmatter): boolean {
  return fm.namespace === "user";
}

/**
 * Score the trigger signal of a parsed skill. `rawFrontmatter` is the raw text
 * of the frontmatter block (used to detect a `triggers:` array, which the flat
 * parser does not surface as a list).
 */
export function scoreRoutingSignal(
  fm: SkillFrontmatter,
  rawFrontmatter: string,
): RoutingSignal {
  const desc = fm.description ?? "";

  // A `triggers:` array — either a YAML block sequence (`triggers:\n  - "…"`)
  // or an inline flow sequence (`triggers: ["…", "…"]`).
  const triggersBlock = /^triggers:\s*$/m.test(rawFrontmatter) &&
    /^triggers:\s*\n(?:\s*-\s+\S.*\n?)+/m.test(rawFrontmatter);
  const triggersInline = /^triggers:\s*\[[^\]]*\S[^\]]*\]/m.test(rawFrontmatter);
  const hasTriggersArray = triggersBlock || triggersInline;

  const hasCue = CUE_RE.test(desc);

  const utteranceCount = (desc.match(QUOTED_UTTERANCE_RE) ?? []).length;

  const ok = hasTriggersArray || hasCue || utteranceCount >= MIN_UTTERANCES;
  return { hasTriggersArray, hasCue, utteranceCount, ok };
}

export interface Offender {
  folder: string;
  description_chars: number;
  signal: RoutingSignal;
  reason: string;
}

export interface RoutingLintReport {
  ok: boolean;
  scanned: number;
  exempt: number;
  offenders: Offender[];
}

export function lintSkillRouting(repoRoot: string): RoutingLintReport {
  const skillsDir = path.join(repoRoot, ".agents", "skills");
  if (!fs.existsSync(skillsDir)) {
    return { ok: true, scanned: 0, exempt: 0, offenders: [] };
  }

  const folders = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const offenders: Offender[] = [];
  let scanned = 0;
  let exempt = 0;

  for (const folder of folders) {
    const skillPath = path.join(skillsDir, folder, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue; // lint-skills.ts owns this error
    const src = fs.readFileSync(skillPath, "utf8");
    const fm = parseFrontmatter(src);
    if (!fm) continue; // lint-skills.ts owns the unparseable-frontmatter error

    if (!isUserFacing(fm)) {
      exempt++;
      continue;
    }
    scanned++;

    const rawFm = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const signal = scoreRoutingSignal(fm, rawFm);
    if (!signal.ok) {
      offenders.push({
        folder,
        description_chars: (fm.description ?? "").length,
        signal,
        reason:
          "user-facing skill description has no actionable trigger signal — " +
          "add a `triggers:` array, a USE WHEN / TRIGGER cue, or ≥2 quoted " +
          "example utterances so the router can bind an utterance to it",
      });
    }
  }

  return { ok: offenders.length === 0, scanned, exempt, offenders };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repo = path.resolve(import.meta.dir, "..");
  const report = lintSkillRouting(repo);
  if (report.ok) {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exit(0);
  }
  process.stderr.write(JSON.stringify(report, null, 2) + "\n");
  for (const o of report.offenders) {
    process.stderr.write(`.agents/skills/${o.folder}/SKILL.md:\n  ✖ ${o.reason}\n`);
  }
  process.stderr.write(
    `\n${report.offenders.length} offender(s) across ${report.scanned} user-facing skill(s).\n`,
  );
  process.exit(1);
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("lint-skill-routing.ts") ||
    process.argv[1].endsWith("lint-skill-routing.js"));
if (isDirect) {
  void main();
}
