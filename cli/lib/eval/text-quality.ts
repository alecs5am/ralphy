// Deterministic text-quality evaluators for the `seo-article` mode (#526).
//
// Four PURE, deterministic scorers over a markdown article body + its brief —
// NO LLM, NO network. They are the prose counterpart to the media gates
// (platform.ts / captions-gate.ts / keyframes.ts) and mirror the deterministic
// `workspace-criteria.ts` validator shape:
//
//   • keyword-coverage  — how many of the brief's target keywords the body uses.
//   • structure         — GEO structure: headings, an FAQ block, and links.
//   • reading-level     — a Flesch-Reading-Ease band (approachable, not academic).
//   • length-window     — word count sits inside a [min, max] window.
//
// Each scorer takes plain inputs (body text + threshold + brief) and returns
// `Finding[]`, so it is trivially unit-testable in isolation. The four are ALSO
// registered as workspace-evaluator criteria (`registerWorkspaceValidator`) so a
// workspace `evaluators.json` can reference them by `validatorId` and a graph
// `gate` node can consume the resulting verdict. The validator wrapper locates
// the article body in the project tree and degrades gracefully (a missing body
// → one `info` finding + criterion `na`, never a throw) — the same contract the
// media validators honor.
//
// #529: the AI-tell / prose-humanization lint joins this file's gate family as
// ANOTHER derived criterion later. The seam is `registerBuiltinTextValidators`
// below — add `registerWorkspaceValidator("text-ai-tell", …)` there. Do NOT
// build it here (out of scope for #526).
//
// English-only-on-disk.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  registerWorkspaceValidator,
  type WorkspaceValidatorContext,
} from "./workspace-evaluators.js";
import { lintProse } from "./prose-tells.js";
import type { Finding, Severity } from "./types.js";

// ─── Finding helper ────────────────────────────────────────────────────────────

let _tid = 0;
function mkFinding(category: string, severity: Severity, message: string, fixHint: string): Finding {
  _tid += 1;
  return {
    id: `TQ${_tid}`,
    category,
    severity,
    sceneIndex: null,
    timestampSec: null,
    message,
    fixHint,
    fixCommand: null,
  };
}

// ─── Plain-text helpers (deterministic) ──────────────────────────────────────────

/** Split a body into lowercased word tokens (letters/digits/apostrophes). */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []);
}

/** Word count (token count) of a body. */
export function wordCount(text: string): number {
  return tokenize(text).length;
}

/** Count sentences by terminal punctuation (., !, ?), min 1 for non-empty text. */
export function sentenceCount(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  const n = matches ? matches.length : 0;
  return text.trim().length > 0 ? Math.max(1, n) : 0;
}

/** Count syllables in one word — a deterministic vowel-group heuristic. */
export function syllablesInWord(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 0;
  // Silent trailing "e" (but keep at least one syllable).
  if (w.endsWith("e") && n > 1) n -= 1;
  return Math.max(1, n);
}

/**
 * Flesch Reading Ease (0-100+; higher = easier). Deterministic — same syllable
 * heuristic every run. Standard coefficients:
 *   206.835 − 1.015·(words/sentences) − 84.6·(syllables/words).
 */
export function fleschReadingEase(text: string): number {
  const words = tokenize(text);
  const sentences = sentenceCount(text);
  if (words.length === 0 || sentences === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + syllablesInWord(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
  return Number(score.toFixed(1));
}

/** Markdown ATX (`#`…) + Setext heading count. */
export function headingCount(text: string): number {
  const atx = (text.match(/^#{1,6}\s+\S/gm) ?? []).length;
  const setext = (text.match(/^\S.*\n(?:=+|-+)\s*$/gm) ?? []).length;
  return atx + setext;
}

/** True when the body carries an FAQ block (an "FAQ"/"Frequently asked" heading). */
export function hasFaqBlock(text: string): boolean {
  return /^#{1,6}\s*(faq|frequently asked questions?|q\s*&\s*a|questions? and answers?)\b/im.test(text);
}

/** Markdown link count (`[text](url)`). */
export function linkCount(text: string): number {
  return (text.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length;
}

// ─── Threshold reading (config-driven, documented defaults) ──────────────────────

type ThresholdObj = Record<string, unknown>;

function thresholdObj(t: unknown): ThresholdObj {
  return t && typeof t === "object" && !Array.isArray(t) ? (t as ThresholdObj) : {};
}
function num(o: ThresholdObj, key: string, def: number): number {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}
function strArr(o: ThresholdObj, key: string): string[] {
  const v = o[key];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : [];
}
function str(o: ThresholdObj, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ─── 1. keyword-coverage (pure) ───────────────────────────────────────────────────
//
// How many of the brief's target keywords the body actually uses. A single-word
// keyword matches on a word boundary; a multi-word phrase matches as a substring
// of the normalized body. Bar: `minCoveragePct` of the keyword set present
// (default 70). Absent keyword list → one `info` finding (nothing to score).

export interface KeywordCoverageInput {
  body: string;
  keywords: string[];
  minCoveragePct?: number;
}

export function scoreKeywordCoverage(input: KeywordCoverageInput): Finding[] {
  const keywords = input.keywords.filter((k) => k.trim().length > 0);
  if (keywords.length === 0) {
    return [
      mkFinding(
        "text.keyword-coverage.no-keywords",
        "info",
        "No target keywords supplied — keyword coverage was not scored.",
        "Pass the brief's target keywords (threshold.keywords) so coverage can be measured.",
      ),
    ];
  }
  const minPct = input.minCoveragePct ?? 70;
  const bodyLower = ` ${input.body.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const missing: string[] = [];
  for (const kw of keywords) {
    const norm = kw.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    if (!bodyLower.includes(` ${norm} `)) missing.push(kw);
  }
  const covered = keywords.length - missing.length;
  const pct = Math.round((covered / keywords.length) * 100);
  if (pct < minPct) {
    return [
      mkFinding(
        "text.keyword-coverage.below-bar",
        "warn",
        `Keyword coverage ${pct}% (${covered}/${keywords.length}) is below the ${minPct}% bar. Missing: ${missing.join(", ")}.`,
        "Work the missing target keywords into headings, the intro, and the FAQ answers — naturally, not stuffed.",
      ),
    ];
  }
  return [];
}

// ─── 2. structure (pure) ────────────────────────────────────────────────────────
//
// GEO structure: headings for scannability, an FAQ block for LLM-answer
// citation, and outbound links for authority. Bars: `minHeadings` (default 3),
// `requireFaq` (default true), `minLinks` (default 1).

export interface StructureInput {
  body: string;
  minHeadings?: number;
  requireFaq?: boolean;
  minLinks?: number;
}

export function scoreStructure(input: StructureInput): Finding[] {
  const minHeadings = input.minHeadings ?? 3;
  const requireFaq = input.requireFaq ?? true;
  const minLinks = input.minLinks ?? 1;
  const findings: Finding[] = [];

  const headings = headingCount(input.body);
  if (headings < minHeadings) {
    findings.push(
      mkFinding(
        "text.structure.headings",
        "warn",
        `Only ${headings} heading(s); the bar is ${minHeadings}. A flat wall of text does not surface in snippets or LLM answers.`,
        "Break the body into clear H2/H3 sections — one scannable claim per heading.",
      ),
    );
  }
  if (requireFaq && !hasFaqBlock(input.body)) {
    findings.push(
      mkFinding(
        "text.structure.faq",
        "warn",
        "No FAQ block found. GEO answers are cited from explicit question/answer pairs.",
        "Add an `## FAQ` section with 3-5 real question headings and quotable one-paragraph answers.",
      ),
    );
  }
  const links = linkCount(input.body);
  if (links < minLinks) {
    findings.push(
      mkFinding(
        "text.structure.links",
        "warn",
        `Only ${links} link(s); the bar is ${minLinks}. Outbound links signal authority and let the piece anchor claims.`,
        "Add at least one reference link (to a source, a doc, or a related article).",
      ),
    );
  }
  return findings;
}

// ─── 3. reading-level (pure) ──────────────────────────────────────────────────────
//
// Flesch Reading Ease band. Default floor `minEase` 45 (a plain-language,
// approachable article) — too far below reads as dense/academic; a warn.

export interface ReadingLevelInput {
  body: string;
  minEase?: number;
}

export function scoreReadingLevel(input: ReadingLevelInput): Finding[] {
  if (wordCount(input.body) === 0) {
    return [
      mkFinding(
        "text.reading-level.empty",
        "info",
        "Empty body — reading level not scored.",
        "Draft the article body before scoring reading level.",
      ),
    ];
  }
  const minEase = input.minEase ?? 45;
  const ease = fleschReadingEase(input.body);
  if (ease < minEase) {
    return [
      mkFinding(
        "text.reading-level.too-dense",
        "warn",
        `Flesch Reading Ease ${ease} is below the ${minEase} floor — the prose reads as dense / academic.`,
        "Shorten sentences, cut jargon, prefer common words — aim for a plain, approachable register.",
      ),
    ];
  }
  return [];
}

// ─── 4. length-window (pure) ──────────────────────────────────────────────────────
//
// Word count inside a [minWords, maxWords] window. Defaults 600-2500 — long
// enough to rank, short enough to stay tight. A body under min OR over max warns.

export interface LengthWindowInput {
  body: string;
  minWords?: number;
  maxWords?: number;
}

export function scoreLengthWindow(input: LengthWindowInput): Finding[] {
  const minWords = input.minWords ?? 600;
  const maxWords = input.maxWords ?? 2500;
  const words = wordCount(input.body);
  if (words < minWords) {
    return [
      mkFinding(
        "text.length-window.too-short",
        "warn",
        `Body is ${words} words; the floor is ${minWords}. Too thin to rank or answer a query in depth.`,
        "Expand the weak sections — add examples, a comparison, and a fuller FAQ.",
      ),
    ];
  }
  if (words > maxWords) {
    return [
      mkFinding(
        "text.length-window.too-long",
        "warn",
        `Body is ${words} words; the ceiling is ${maxWords}. An over-long piece buries the answer.`,
        "Tighten: cut repetition, merge thin sections, keep one idea per heading.",
      ),
    ];
  }
  return [];
}

// ─── Article-body resolution (for the workspace-validator wrapper) ────────────────

/**
 * Locate the article's markdown body inside a project tree. Order:
 *   1. an explicit `threshold.bodyFile` (project-relative or absolute), else
 *   2. the first article unit (units/<slug>/unit.json with format "article") -> its article.body, else
 *   3. the first markdown file under artifacts/ (excluding the scaffold docs).
 * Returns null when none is found (the validator degrades to `na`). Pure read.
 */
export function resolveArticleBody(projectDir: string, bodyFileRel: string | null): string | null {
  if (bodyFileRel) {
    const p = path.isAbsolute(bodyFileRel) ? bodyFileRel : path.join(projectDir, bodyFileRel);
    return existsSync(p) ? safeRead(p) : null;
  }
  // A formed article unit.
  const unitsDir = path.join(projectDir, "units");
  if (existsSync(unitsDir)) {
    for (const dirent of safeReaddir(unitsDir)) {
      const manifestPath = path.join(unitsDir, dirent, "unit.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = safeJson(manifestPath);
      if (manifest && manifest.format === "article" && typeof manifest.article?.body === "string") {
        const bodyPath = path.join(unitsDir, dirent, manifest.article.body);
        if (existsSync(bodyPath)) return safeRead(bodyPath);
      }
    }
  }
  // A raw draft under artifacts/.
  const artifactsDir = path.join(projectDir, "artifacts");
  if (existsSync(artifactsDir)) {
    const md = findFirstMarkdown(artifactsDir);
    if (md) return safeRead(md);
  }
  return null;
}

function safeRead(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
function safeJson(p: string): { format?: string; article?: { body?: string } } | null {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
/** Shallow scan of `artifacts/` (top level + one subdir deep) for the first `.md`. */
function findFirstMarkdown(dir: string): string | null {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md")).map((e) => e.name).sort();
  if (files.length > 0) return path.join(dir, files[0]!);
  for (const sub of entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const nested = findFirstMarkdown(path.join(dir, sub));
    if (nested) return nested;
  }
  return null;
}

const NO_BODY_HINT =
  "Form the article unit (`ralphy unit create --format article`) or place the draft `.md` under <project>/artifacts/, or set threshold.bodyFile.";

// ─── Workspace-validator wrappers (#526) ──────────────────────────────────────────
//
// Each wraps a pure scorer: resolve the article body from the project tree, read
// the criterion threshold (+ brief keywords from `threshold.keywords`), and run
// the scorer. A missing body → one `info` finding (criterion `na`), never a throw
// — the same graceful-degrade contract as the media validators.

function bodyOrNaFinding(ctx: WorkspaceValidatorContext): { body: string } | { na: Finding } {
  const t = thresholdObj(ctx.criterion.threshold);
  const body = resolveArticleBody(ctx.projectDir, str(t, "bodyFile"));
  if (body === null) {
    return {
      na: mkFinding(
        "text.no-body",
        "info",
        "No article body found — cannot run the text-quality check.",
        NO_BODY_HINT,
      ),
    };
  }
  return { body };
}

function keywordCoverageValidator(ctx: WorkspaceValidatorContext): Finding[] {
  const r = bodyOrNaFinding(ctx);
  if ("na" in r) return [r.na];
  const t = thresholdObj(ctx.criterion.threshold);
  return scoreKeywordCoverage({
    body: r.body,
    keywords: strArr(t, "keywords"),
    minCoveragePct: num(t, "minCoveragePct", 70),
  });
}

function structureValidator(ctx: WorkspaceValidatorContext): Finding[] {
  const r = bodyOrNaFinding(ctx);
  if ("na" in r) return [r.na];
  const t = thresholdObj(ctx.criterion.threshold);
  return scoreStructure({
    body: r.body,
    minHeadings: num(t, "minHeadings", 3),
    requireFaq: (t.requireFaq ?? true) !== false,
    minLinks: num(t, "minLinks", 1),
  });
}

function readingLevelValidator(ctx: WorkspaceValidatorContext): Finding[] {
  const r = bodyOrNaFinding(ctx);
  if ("na" in r) return [r.na];
  const t = thresholdObj(ctx.criterion.threshold);
  return scoreReadingLevel({ body: r.body, minEase: num(t, "minEase", 45) });
}

function lengthWindowValidator(ctx: WorkspaceValidatorContext): Finding[] {
  const r = bodyOrNaFinding(ctx);
  if ("na" in r) return [r.na];
  const t = thresholdObj(ctx.criterion.threshold);
  return scoreLengthWindow({
    body: r.body,
    minWords: num(t, "minWords", 600),
    maxWords: num(t, "maxWords", 2500),
  });
}

// #529: the AI-tell / prose-humanization lint as a workspace criterion. Resolves
// the article body from the project tree (same graceful-degrade as the others)
// and runs the rule pack; findings land under `structure.ai-tell.*` (scenarist).
function aiTellValidator(ctx: WorkspaceValidatorContext): Finding[] {
  const r = bodyOrNaFinding(ctx);
  if ("na" in r) return [r.na];
  return lintProse(r.body, "prose").findings;
}

let _registered = false;

/**
 * Register the four deterministic text-quality validators so a workspace
 * `evaluators.json` can reference them by `validatorId` in a graph `gate` node.
 * Idempotent. Called by `registerBuiltinWorkspaceValidators()` (#470) so the
 * text criteria are available wherever the media ones are.
 *
 * #529 seam: the AI-tell / prose-humanization lint (`text-ai-tell`) is wired here
 * alongside the #526 text validators, so a workspace `evaluators.json` (and the
 * article gate) can reference it by `validatorId`.
 */
export function registerBuiltinTextValidators(): void {
  if (_registered) return;
  _registered = true;
  registerWorkspaceValidator("text-keyword-coverage", keywordCoverageValidator);
  registerWorkspaceValidator("text-structure", structureValidator);
  registerWorkspaceValidator("text-reading-level", readingLevelValidator);
  registerWorkspaceValidator("text-length-window", lengthWindowValidator);
  registerWorkspaceValidator("text-ai-tell", aiTellValidator);
}

/** Test-only handles for the deterministic validators (exercised in isolation). */
export const __testHooks = {
  keywordCoverageValidator,
  structureValidator,
  readingLevelValidator,
  lengthWindowValidator,
  aiTellValidator,
} as const;
