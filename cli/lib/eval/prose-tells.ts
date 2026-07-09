// AI-tell prose lint ENGINE (#529).
//
// Runs the DATA rule pack (prose-tells-rules.ts) over a body of text and emits
// #409-vocabulary findings. Two rule kinds (phrase / density) plus one built-in
// structural check (paragraph-rhythm uniformity — length variance across
// paragraphs, which no single regex can express). Runs STANDALONE via
// `ralphy eval prose <file>` and as a workspace-eval gate criterion
// (`registerWorkspaceValidator("text-ai-tell", …)`, wired at the text-quality.ts
// #529 seam).
//
// Findings route via cli/lib/repair.ts: article/script prose →
// `structure.ai-tell.<rule>` (scenarist); captions → `captions.ai-tell.<rule>`
// (editor). The caller picks the category prefix via `target`.
//
// PURE + deterministic, no LLM, no disk. English-only-on-disk.

import { RULES_EN, type ProseRule } from "./prose-tells-rules.js";
import { tokenize } from "./text-quality.js";
import type { Finding, Severity } from "./types.js";

// ─── Finding helper ──────────────────────────────────────────────────────────

let _pid = 0;
function mkFinding(category: string, severity: Severity, message: string, fixHint: string): Finding {
  _pid += 1;
  return {
    id: `PT${_pid}`,
    category,
    severity,
    sceneIndex: null,
    timestampSec: null,
    message,
    fixHint,
    fixCommand: null,
  };
}

// ─── Rule evaluation ───────────────────────────────────────────────────────────

/** Count non-overlapping matches of a global regex in `text`. */
function countMatches(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let n = 0;
  while (g.exec(text) !== null) {
    n += 1;
    if (g.lastIndex === 0) break; // zero-width guard
  }
  return n;
}

/**
 * `target` picks the category prefix so findings route to the right owner:
 *   • "prose"    → `structure.ai-tell.<rule>` (scenarist owns article/script words),
 *   • "captions" → `captions.ai-tell.<rule>`  (editor owns the caption treatment).
 */
export type ProseTarget = "prose" | "captions";

function categoryFor(target: ProseTarget, ruleId: string): string {
  const base = target === "captions" ? "captions.ai-tell" : "structure.ai-tell";
  return `${base}.${ruleId}`;
}

export interface ProseTellResult {
  findings: Finding[];
  /** Per-rule hit counts (surfaced for the report). */
  ruleHits: Record<string, number>;
  wordCount: number;
}

/**
 * Lint `body` against the English rule pack + the paragraph-rhythm check. A rule
 * fires at most one finding (with its hit count in the message). `rules` is
 * injectable so a future language pack swaps in without touching the engine.
 */
export function lintProse(
  body: string,
  target: ProseTarget = "prose",
  rules: ProseRule[] = RULES_EN,
): ProseTellResult {
  const findings: Finding[] = [];
  const ruleHits: Record<string, number> = {};
  const words = tokenize(body).length;
  const per1000 = words > 0 ? words / 1000 : 0;

  for (const rule of rules) {
    const hits = countMatches(body, rule.pattern);
    ruleHits[rule.id] = hits;
    if (hits === 0) continue;

    if (rule.kind === "phrase") {
      findings.push(
        mkFinding(
          categoryFor(target, rule.id),
          rule.level,
          `AI tell — ${rule.label}: ${hits} match(es). ${rule.examples.bad}`,
          rule.fix,
        ),
      );
    } else {
      // density: hits per 1000 words vs the ceiling. Needs a floor of text so a
      // 3-word caption doesn't trip a per-1000 ratio.
      const rate = per1000 > 0 ? hits / per1000 : hits;
      const ceiling = rule.maxPer1000 ?? Infinity;
      if (words >= 40 && rate > ceiling) {
        findings.push(
          mkFinding(
            categoryFor(target, rule.id),
            rule.level,
            `AI tell — ${rule.label}: ${hits} in ${words} words (${rate.toFixed(1)} per 1000, over the ${ceiling}/1000 bar).`,
            rule.fix,
          ),
        );
      }
    }
  }

  // — Built-in: paragraph-rhythm uniformity. A human varies paragraph length;
  //   LLM prose tends to a metronomic, near-identical paragraph size. Measured
  //   as the coefficient of variation (stddev/mean) of paragraph word counts.
  const rhythm = paragraphRhythm(body);
  if (rhythm !== null && rhythm.paragraphs >= 4 && rhythm.cv < 0.25) {
    findings.push(
      mkFinding(
        categoryFor(target, "paragraph-rhythm"),
        "warn",
        `AI tell — uniform paragraph rhythm: ${rhythm.paragraphs} paragraphs with near-identical length (coefficient of variation ${rhythm.cv.toFixed(2)} < 0.25). Human prose varies paragraph size.`,
        "Vary paragraph length — mix short punchy paragraphs with longer ones instead of a metronomic wall of same-size blocks.",
      ),
    );
  }

  return { findings, ruleHits, wordCount: words };
}

/** Coefficient of variation of paragraph word counts, or null when < 2 paragraphs. */
function paragraphRhythm(body: string): { paragraphs: number; cv: number } | null {
  const paras = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^#{1,6}\s/.test(p)); // skip headings
  const counts = paras.map((p) => tokenize(p).length).filter((c) => c > 0);
  if (counts.length < 2) return null;
  const mean = counts.reduce((s, x) => s + x, 0) / counts.length;
  if (mean === 0) return null;
  const variance = counts.reduce((s, x) => s + (x - mean) ** 2, 0) / counts.length;
  const cv = Math.sqrt(variance) / mean;
  return { paragraphs: counts.length, cv };
}
