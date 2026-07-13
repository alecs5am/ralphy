// Prompt-library guideline loading + folding (#515).
//
// Guidelines live at <root>/guidelines/<slug>/ (see guidelines/README.md and
// cli/commands/guideline.ts — the CLI surface over the same tree):
//   - guideline.json   metadata (slug, name, kind, models, tags, examples)
//   - guideline.md     LLM-facing body (the actual prompt-writing rules)
//
// The CLI validates guideline slugs and folds the selected bodies into resolved
// prompts. Agents can inspect the same rules with `ralphy guideline show <slug>`
// before generation (AGENTS.md invariant #13).
//
// The fold is deterministic: the body is appended as a delimited STYLE RULES
// block, never merged into the prose — sources stay readable and the fold is
// reproducible from (prompt, slugs) alone.

import fs from "node:fs";
import path from "node:path";
import { root } from "./paths.js";

export interface GuidelineMeta {
  slug?: string;
  name?: string;
  kind?: string;
  tag?: string;
  models?: string[];
  tags?: string[];
  scope?: string[];
  version?: string;
}

export interface Guideline {
  slug: string;
  meta: GuidelineMeta;
  /** The guideline.md body — the prompt-writing rules block. */
  body: string;
}

export function guidelinesDir(): string {
  return path.join(root(), "guidelines");
}

/** Does the guidelines tree exist at all? (Absent on a non-repo data root.) */
export function guidelinesDirExists(): boolean {
  return fs.existsSync(guidelinesDir());
}

export function listGuidelineSlugs(): string[] {
  try {
    return fs
      .readdirSync(guidelinesDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Load one guideline (meta + body). Returns null when the slug has no
 * loadable guideline.md — metadata is best-effort (a body without JSON still
 * folds; the rules are the load-bearing half).
 */
export function loadGuideline(slug: string): Guideline | null {
  const dir = path.join(guidelinesDir(), slug);
  let body: string;
  try {
    body = fs.readFileSync(path.join(dir, "guideline.md"), "utf-8");
  } catch {
    return null;
  }
  let meta: GuidelineMeta = {};
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, "guideline.json"), "utf-8"));
  } catch {
    /* body-only guideline — meta stays empty */
  }
  return { slug, meta, body };
}

/**
 * Metadata tags that mark a guideline as the photoreal / anti-AI-slop
 * register — the #515 negative-cluster prompt-lint rule keys on these
 * (memory feedback_anti_ai_slop_image).
 */
export const PHOTOREAL_GUIDELINE_TAGS = ["photoreal", "anti-ai-slop"] as const;

export function isPhotorealGuideline(g: Guideline): boolean {
  const tags = g.meta.tags ?? [];
  return PHOTOREAL_GUIDELINE_TAGS.some((t) => tags.includes(t));
}

/** The delimiter line a folded guideline block starts with. */
export function guidelineFoldHeader(slug: string): string {
  return `=== STYLE RULES (@guideline:${slug}) ===`;
}

/**
 * Deterministic fold: append each guideline's body as a delimited STYLE RULES
 * block, in the order given. The source prompt is never mutated on disk —
 * the folded string is execution-time-only and is journaled for
 * reproducibility (run journal / gen-log), per #515.
 */
export function foldGuidelinesIntoPrompt(prompt: string, guidelines: Guideline[]): string {
  if (guidelines.length === 0) return prompt;
  const blocks = guidelines.map((g) => `${guidelineFoldHeader(g.slug)}\n${g.body.trim()}`);
  return `${prompt.trimEnd()}\n\n${blocks.join("\n\n")}\n`;
}
