// Claims & policy gate for commercial content (#442).
//
// The product/brand fidelity gate (#422) answers "does the OUTPUT MATCH the
// product" — identity, packaging, palette, and the brand's own claimsToAvoid
// guardrail. This gate answers a DISTINCT axis: "does the COPY make SAFE,
// SUPPORTED claims" — across the script (scenario VO/hook), the prompts, the
// on-screen baked text (OCR), the caption track, and the distribution / social
// copy. An invented health claim, a fabricated earnings promise, or an absolute
// "guaranteed / #1 / cures" superlative can make a polished Unit legally
// unusable — that must REFUSE before publishing, not show up as a soft note
// (issue Scope: "Block high-risk unsupported claims unless user provides proof").
//
// It is the direct sibling of the fidelity (#422) / OCR (#439) / hook (#440) /
// caption-sync (#441) gates: same shape, same injectable-analyzer test seam,
// same `Finding`/`Verdict` machinery, same append-only report. It does NOT fork
// a parallel pipeline:
//   • the `Finding` shape + `score()`/`Verdict` from findings.ts,
//   • `ProductBrandFacts` (#416) — the supported-facts source of truth (the
//     SAME loader fidelity.ts uses: research-facts.json productFacts/proofPoints),
//   • `requiresFidelityGate(mode)` (#412) — only commercial modes run it (a
//     non-commercial short has no product claims to police),
//   • `text-legibility.json` (#439) — the on-screen OCR text, reused as the
//     baked-text claim source (do NOT re-OCR).
//
// TWO-STAGE SPLIT (the load-bearing design decision):
//   1. EXTRACTION is an LLM task (an INJECTABLE `ClaimsExtractor`) — pulling the
//      candidate assertions out of free-text copy is judgement the model is good
//      at. Tests inject a fake; the default is one `callLLM()` pass.
//   2. POLICY CLASSIFICATION is DETERMINISTIC (a model-free ruleset over the
//      extracted claims): each claim → a `ClaimCategory` + a `Severity`, and a
//      supported-vs-unsupported decision by checking it against the
//      `ProductBrandFacts`. Keeping policy model-free makes the BLOCK decision
//      reproducible and free — the same guarantee the repair plan rests on.
//
// HIGH-RISK unsupported claims (health/medical, financial/earnings, and absolute
// superlatives) are a hard `fail` (block) UNLESS the user supplies PROOF — a
// `--proof <file>` substantiation document, or a `proofPoints` / `productFacts`
// entry in research-facts.json that backs the claim. Proof DOWNGRADES a blocking
// claim to a pass.

import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { projectDir, artifactKindDir } from "../paths.js";
import {
  ProductBrandFactsSchema,
  RESEARCH_FACTS_ARTIFACT,
  type ProductBrandFacts,
} from "../schemas/research-facts.js";
import { requiresFidelityGate } from "../content-modes.js";
import { score } from "./findings.js";
import { callLLM } from "../providers/llm.js";
import type { Finding, Severity, Verdict } from "./types.js";

const CLAIMS_MODEL = "google/gemini-2.5-flash";

/** Project-relative location the claims/policy report is persisted to. */
export const CLAIMS_ARTIFACT = "claims.json" as const;

// ─── Claim categories + severity (the issue Scope taxonomy) ────────────────────
//
// The eight categories the issue enumerates. The default severity is the
// REGULATORY RISK of an UNSUPPORTED claim in that category — health and finance
// are the legally radioactive ones (FTC / FDA / financial-promotion rules), the
// prohibited-comparative absolute is the classic ad-law trap. Pricing / warranty
// / testimonial are lower-risk-but-still-checked. A claim that IS backed by the
// product facts is always downgraded to a pass regardless of its category.

export const CLAIM_CATEGORIES = [
  "health-medical", // cures / treats / clinically proven / weight-loss / FDA-shaped
  "financial-earnings", // earn $X / passive income / ROI / guaranteed returns
  "performance-efficacy", // "works in 7 days", "2x faster", measurable result claims
  "warranty-guarantee", // lifetime warranty / money-back / "guaranteed" promise
  "pricing", // "cheapest", "free", a concrete price/discount claim
  "platform-policy", // banned terms / disallowed claims for the ad platform
  "testimonial", // "users say…", quoted endorsements, social proof statements
  "prohibited-comparative", // absolute superlatives — "#1", "best", "only", "no other"
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

/**
 * The categories whose UNSUPPORTED form is HIGH-RISK and therefore BLOCKS ship
 * unless proof is supplied. These are the legally radioactive axes: a health /
 * medical or financial / earnings claim with no substantiation, and an absolute
 * superlative (the classic ad-law "puffery vs claim" trap). The rest WARN when
 * unsupported (review-before-ship), never auto-block.
 */
const HIGH_RISK_CATEGORIES: ReadonlySet<ClaimCategory> = new Set([
  "health-medical",
  "financial-earnings",
  "prohibited-comparative",
]);

/** The default deterministic severity an UNSUPPORTED claim in each category gets. */
const UNSUPPORTED_SEVERITY: Record<ClaimCategory, Severity> = {
  "health-medical": "fail",
  "financial-earnings": "fail",
  "prohibited-comparative": "fail",
  "performance-efficacy": "warn",
  "warranty-guarantee": "warn",
  pricing: "warn",
  "platform-policy": "warn",
  testimonial: "warn",
};

// ─── Deterministic category classifier (model-free) ────────────────────────────
//
// A keyword ruleset over the extracted claim text. The EXTRACTOR may suggest a
// category, but policy NEVER trusts the model for the BLOCK decision — we
// re-derive the category deterministically here so the gate is reproducible. The
// extractor's hint is only a fallback when no keyword family matches.

const CATEGORY_PATTERNS: Array<{ category: ClaimCategory; re: RegExp }> = [
  {
    category: "health-medical",
    re: /\b(cure[sd]?|heal[s]?|treat(s|ed|ment)?|clinically|medically|FDA|disease|diagnos\w*|prescrib\w*|therap\w*|detox|immune|weight[\s-]?loss|lose \d+\s?(lb|kg|pounds)|anti[\s-]?aging|reverse[s]? \w+)\b/i,
  },
  {
    category: "financial-earnings",
    re: /\b(earn|income|passive income|\$\d[\d,]*\s*(\/|per)?\s*(day|week|month|year)?|ROI|returns?|profit[s]?|make money|get rich|double your|guaranteed returns?)\b/i,
  },
  {
    category: "warranty-guarantee",
    re: /\b(guarantee[ds]?|warrant(y|ies)|money[\s-]?back|lifetime (warranty|guarantee)|risk[\s-]?free|refund)\b/i,
  },
  {
    category: "prohibited-comparative",
    re: /\b(#?\s?1\b|number one|the best|only \w+ that|no other|nobody else|world'?s (best|first|only)|unbeatable|guaranteed best)\b/i,
  },
  {
    category: "performance-efficacy",
    re: /\b(\d+\s?x faster|works in \d+|in (just|only) \d+\s*(days?|hours?|minutes?)|\d+%\s*(more|less|faster|better)|proven to|results in \d+)\b/i,
  },
  {
    category: "pricing",
    re: /\b(cheap(est)?|lowest price|free\b|\d+%\s*off|half price|\$\d[\d,.]*\b|save \$?\d+|discount)\b/i,
  },
  {
    category: "testimonial",
    re: /\b(users? (say|love|report)|customers? (say|love|report)|reviews? (say|show)|"[^"]+"\s*[—-]\s*\w|rated \d|\d+[\s-]?star)\b/i,
  },
];

/**
 * Deterministically classify a claim's text into a `ClaimCategory`. Returns the
 * first keyword family that matches; falls back to the extractor's `hint` when
 * it names a known category, else `performance-efficacy` (the neutral "this is a
 * measurable assertion" bucket). NO model call.
 */
export function classifyClaimCategory(text: string, hint?: string): ClaimCategory {
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return category;
  }
  if (hint && (CLAIM_CATEGORIES as readonly string[]).includes(hint)) {
    return hint as ClaimCategory;
  }
  return "performance-efficacy";
}

/**
 * Deterministically decide whether a claim is SUPPORTED by the product facts.
 * A claim is supported when a productFacts / proofPoints bullet (or a proof-doc
 * line) shares a meaningful content-word overlap with it — same loose token
 * match the human eye uses ("95% OCR accuracy" backs "95% accurate"). Stop-words
 * and short tokens are ignored so "the best cream" doesn't match on "the".
 * NO model call.
 */
export function isClaimSupported(text: string, supportLines: string[]): boolean {
  const claimTokens = contentTokens(text);
  if (claimTokens.size === 0) return false;
  for (const line of supportLines) {
    const lineTokens = contentTokens(line);
    if (lineTokens.size === 0) continue;
    let overlap = 0;
    for (const t of claimTokens) if (lineTokens.has(t)) overlap++;
    // Two shared content words (or all of a 1-word claim) is a backing match.
    if (overlap >= 2 || (claimTokens.size === 1 && overlap === 1)) return true;
  }
  return false;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "in", "on",
  "and", "or", "for", "with", "your", "you", "our", "we", "it", "this", "that",
  "will", "can", "by", "at", "as", "from", "all", "now", "get", "more", "than",
]);

/** Lowercased content tokens (≥3 chars, stop-words dropped) for loose matching. */
function contentTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9%$.]+/)) {
    const t = raw.replace(/^[.%$]+|[.%$]+$/g, "");
    if (t.length >= 3 && !STOP_WORDS.has(t)) out.add(t);
    // Keep numeric / percentage / dollar tokens (they're the load-bearing claim
    // content — "95%", "$0.003", "7" days) even when short.
    else if (/[\d%$]/.test(raw)) out.add(raw);
  }
  return out;
}

// ─── Extractor seam (LLM, injectable) ──────────────────────────────────────────

/** One candidate claim the extractor pulled out of the combined copy. */
export interface ExtractedClaim {
  /** The claim text, verbatim from the source copy. */
  text: string;
  /** Which copy surface it came from (script / prompt / on-screen / caption / distribution). */
  source: string;
  /** The model's category hint (advisory — policy re-derives the category deterministically). */
  categoryHint?: string;
}

/**
 * The injectable analyzer: reads the COMBINED commercial copy and returns the
 * candidate factual CLAIMS in it (assertions about what the product does / costs
 * / guarantees / achieves). Tests pass a fake; the default is one `callLLM()`
 * pass. It returns claims ONLY — the deterministic policy classifier decides the
 * category, severity, and supported-vs-unsupported.
 */
export type ClaimsExtractor = (input: {
  /** The combined copy text (script + prompts + on-screen + captions + distribution). */
  text: string;
  projectId: string;
}) => Promise<ExtractedClaim[]>;

// ─── Report shape ──────────────────────────────────────────────────────────────

/** One classified claim carried through to the human report. */
export interface ClassifiedClaim {
  text: string;
  source: string;
  category: ClaimCategory;
  severity: Severity;
  /** True when a product-fact / proof line backs the claim. */
  supported: boolean;
  /** True when proof was supplied AND unblocked an otherwise-blocking claim. */
  unblockedByProof: boolean;
}

export interface ClaimsReport {
  schemaVersion: "1.0";
  projectId: string;
  mode: string | null;
  /** False when the mode is non-commercial → the gate is a pass-through. */
  applicable: boolean;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** The single hard blocker the readiness path (#427) + unit formation consult. */
  blocksShip: boolean;
  /** One-line reason for the verdict / blocksShip decision. */
  reason: string;
  /** Which copy surfaces contributed text (script / on-screen / captions / distribution). */
  copySources: string[];
  /** Whether a proof document was supplied (drives high-risk unblocking). */
  proofProvided: boolean;
  /** Every claim the extractor surfaced, classified. */
  claims: ClassifiedClaim[];
  /** All findings, flattened (the fixer/readiness path consumes these). */
  findings: Finding[];
}

// ─── Copy harvesting (the text inputs) ──────────────────────────────────────────

/** Read + parse the project's research-facts.json, or empty facts when absent. */
function readFacts(projectId: string): ProductBrandFacts {
  try {
    const abs = path.join(projectDir(projectId), RESEARCH_FACTS_ARTIFACT);
    if (!existsSync(abs)) return ProductBrandFactsSchema.parse({});
    const r = ProductBrandFactsSchema.safeParse(JSON.parse(readFileSync(abs, "utf8")));
    return r.success ? r.data : ProductBrandFactsSchema.parse({});
  } catch {
    return ProductBrandFactsSchema.parse({});
  }
}

function safeReadJson(abs: string): unknown {
  try {
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/** Pull free-text copy strings out of scenario.json (hook + per-scene VO/narration/text). */
function scenarioCopy(projectId: string): string[] {
  const j = safeReadJson(path.join(projectDir(projectId), "scenario.json"));
  if (!j || typeof j !== "object") return [];
  const out: string[] = [];
  const rec = j as Record<string, unknown>;
  const hook = rec.hook as { primary?: unknown } | undefined;
  if (hook && typeof hook.primary === "string") out.push(hook.primary);
  const scenes = rec.scenes;
  const collectScene = (s: unknown) => {
    if (!s || typeof s !== "object") return;
    for (const key of ["vo", "voiceover", "narration", "text", "caption", "line", "copy", "script"]) {
      const v = (s as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out.push(v);
    }
  };
  if (Array.isArray(scenes)) scenes.forEach(collectScene);
  else if (scenes && typeof scenes === "object") Object.values(scenes).forEach(collectScene);
  return out;
}

/** Pull the prompt strings out of prompts.json (any string values, one level deep). */
function promptCopy(projectId: string): string[] {
  const j = safeReadJson(path.join(projectDir(projectId), "prompts.json"));
  if (!j || typeof j !== "object") return [];
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (v.trim()) out.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(j);
  return out;
}

/**
 * Pull the on-screen baked text from the #439 OCR report (text-legibility.json),
 * reusing its transcription rather than re-OCR-ing. Reads every region's `text`.
 */
function onScreenCopy(projectId: string): string[] {
  const j = safeReadJson(path.join(projectDir(projectId), "text-legibility.json")) as
    | { assets?: Array<{ regions?: Array<{ text?: unknown }> }> }
    | null;
  if (!j || !Array.isArray(j.assets)) return [];
  const out: string[] = [];
  for (const a of j.assets) {
    for (const r of a.regions ?? []) {
      if (typeof r.text === "string" && r.text.trim()) out.push(r.text);
    }
  }
  return out;
}

/** Pull the caption-track text from captions.json / artifacts/captions/<slot>.json. */
function captionCopy(projectId: string): string[] {
  const root = projectDir(projectId);
  const out: string[] = [];
  const ingest = (raw: unknown) => {
    const arr = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).captions)
        ? ((raw as Record<string, unknown>).captions as unknown[])
        : [];
    for (const c of arr) {
      const t = (c as Record<string, unknown>)?.text;
      if (typeof t === "string" && t.trim()) out.push(t);
    }
  };
  ingest(safeReadJson(path.join(root, "captions.json")));
  try {
    const dir = artifactKindDir(projectId, "captions");
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).sort()) {
        if (f.toLowerCase().endsWith(".json")) ingest(safeReadJson(path.join(dir, f)));
      }
    }
  } catch {
    // no caption artifacts
  }
  return out;
}

/**
 * Pull the distribution / social copy: the project's units/<slug>/unit.json
 * `caption` fields (per-platform body + title, #403) and any distribution-pack
 * platform sections. This is the publish last-mile copy that ships under the
 * reel — it makes claims too.
 */
function distributionCopy(projectId: string): string[] {
  const root = projectDir(projectId);
  const out: string[] = [];
  const unitsDir = path.join(root, "units");
  try {
    if (existsSync(unitsDir)) {
      for (const slug of readdirSync(unitsDir)) {
        const dir = path.join(unitsDir, slug);
        try {
          if (!statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        const u = safeReadJson(path.join(dir, "unit.json")) as
          | { caption?: { platform?: Record<string, unknown> } }
          | null;
        const plat = u?.caption?.platform;
        if (plat) for (const v of Object.values(plat)) if (typeof v === "string" && v.trim()) out.push(v);
        // The distribution pack lives inside the unit dir (#423).
        const pack = safeReadJson(path.join(dir, "distribution-pack.json")) as
          | { platforms?: Record<string, { caption?: unknown; title?: unknown; primaryText?: unknown }> }
          | null;
        for (const sect of Object.values(pack?.platforms ?? {})) {
          for (const k of ["caption", "title", "primaryText"] as const) {
            if (typeof sect[k] === "string" && (sect[k] as string).trim()) out.push(sect[k] as string);
          }
        }
      }
    }
  } catch {
    // no units
  }
  return out;
}

/** Read a proof / substantiation document into its non-empty lines, or []. */
function readProofLines(proofPath: string | null): string[] {
  if (!proofPath) return [];
  try {
    const abs = path.resolve(proofPath);
    if (!existsSync(abs)) return [];
    return readFileSync(abs, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── The gate ──────────────────────────────────────────────────────────────────

/**
 * Run the claims & policy gate for a project. Pure read — never mutates.
 * `extract` (the LLM claim extractor) is INJECTABLE (default = a `callLLM()`
 * pass) so fixtures run with NO network/paid gen. A non-commercial mode
 * short-circuits to an applicable:false pass.
 *
 * STAGE 1 (LLM, injectable): extract the candidate claims from the COMBINED
 * commercial copy (scenario VO/hook + prompts + on-screen OCR text + captions +
 * distribution/social copy).
 *
 * STAGE 2 (DETERMINISTIC, model-free): classify each claim → category + severity,
 * decide supported-vs-unsupported against `ProductBrandFacts` (productFacts +
 * proofPoints) plus any `--proof` document, and BLOCK high-risk unsupported
 * claims (health/medical, financial/earnings, absolute superlatives) unless proof
 * backs them.
 */
export async function checkClaims(input: {
  projectId: string;
  mode: string | null;
  /** Explicit ProductBrandFacts (default: read research-facts.json). */
  facts?: ProductBrandFacts;
  /** Explicit copy strings to police (default: harvested from the project). */
  texts?: string[];
  /** Path to a proof / substantiation doc whose lines back high-risk claims. */
  proof?: string | null;
  /** Skip the gate entirely (the escape for a mode you know makes no claims). */
  noClaims?: boolean;
  extract?: ClaimsExtractor;
}): Promise<ClaimsReport> {
  const { projectId, mode } = input;
  const extract = input.extract ?? defaultExtractor;

  // — Mode-gated: only commercial modes police claims (same partition as #422).
  if (input.noClaims || !mode || !requiresFidelityGate(mode)) {
    return {
      schemaVersion: "1.0",
      projectId,
      mode: mode ?? null,
      applicable: false,
      verdict: "pass",
      blocksShip: false,
      reason: input.noClaims
        ? "claims/policy gate skipped (--no-claims)."
        : mode
          ? `mode "${mode}" is not a commercial product/brand mode — claims/policy gate not applicable.`
          : "no content mode resolved — claims/policy gate not applicable (pass a commercial mode to run it).",
      copySources: [],
      proofProvided: input.proof != null,
      claims: [],
      findings: [],
    };
  }

  const facts = input.facts ?? readFacts(projectId);
  const proofLines = readProofLines(input.proof ?? null);

  // — Harvest the copy surfaces (or take the explicit override).
  const sources: Array<{ label: string; lines: string[] }> = input.texts
    ? [{ label: "(explicit)", lines: input.texts }]
    : [
        { label: "script", lines: scenarioCopy(projectId) },
        { label: "prompt", lines: promptCopy(projectId) },
        { label: "on-screen", lines: onScreenCopy(projectId) },
        { label: "caption", lines: captionCopy(projectId) },
        { label: "distribution", lines: distributionCopy(projectId) },
      ];
  const copySources = sources.filter((s) => s.lines.length > 0).map((s) => s.label);
  const combined = sources.map((s) => s.lines.join("\n")).filter(Boolean).join("\n");

  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">) => {
    const f: Finding = { id: `CLM${nextId++}`, ...x };
    findings.push(f);
    return f;
  };

  // — STAGE 1: extract candidate claims (LLM, injectable). An empty copy set
  //   short-circuits — nothing to extract.
  let extracted: ExtractedClaim[] = [];
  if (combined.trim()) {
    try {
      extracted = await extract({ text: combined, projectId });
    } catch (e) {
      add({
        category: "claims.extraction-failed",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Claim extraction failed: ${(e as Error).message}`,
        fixHint: "Re-run the claims gate once a model provider is reachable.",
        fixCommand: null,
      });
    }
  }

  // — STAGE 2: deterministic policy classification. Two distinct support
  //   corpora: the product facts (`productFacts` + `proofPoints` — the brand's
  //   own substantiated claims, written by the research bootstrap #19) decide
  //   `supported`; the explicit `--proof` doc lines decide the separate
  //   high-risk UNBLOCK. Keeping them separate is what makes `unblockedByProof`
  //   meaningful — a high-risk claim the facts DON'T back but a proof doc DOES.
  const factLines = [...facts.productFacts, ...facts.proofPoints];
  const claims: ClassifiedClaim[] = [];

  for (const ec of extracted) {
    const text = (ec.text ?? "").trim();
    if (!text) continue;
    const category = classifyClaimCategory(text, ec.categoryHint);
    const supported = isClaimSupported(text, factLines);
    const highRisk = HIGH_RISK_CATEGORIES.has(category);
    // Proof unblocks a high-risk, fact-unsupported claim that the proof doc
    // actually backs — it downgrades the block to a pass.
    const backedByProof = proofLines.length > 0 && isClaimSupported(text, proofLines);
    const unblockedByProof = highRisk && !supported && backedByProof;
    // A non-high-risk claim is also cleared when the proof doc backs it.
    const cleared = supported || backedByProof;

    let severity: Severity;
    if (cleared || unblockedByProof) {
      severity = "info"; // a backed claim is fine; surface it for the record only.
    } else {
      severity = UNSUPPORTED_SEVERITY[category];
    }

    const classified: ClassifiedClaim = {
      text,
      source: ec.source ?? "copy",
      category,
      severity,
      supported,
      unblockedByProof,
    };
    claims.push(classified);

    // Only UNSUPPORTED, un-proofed claims raise an actionable finding.
    if (!cleared) {
      const quote = ` "${text.slice(0, 80)}"`;
      const proofHint = highRisk
        ? ` Supply substantiation (\`ralphy eval claims ${projectId} --proof <file>\`) or back it in research-facts.json productFacts/proofPoints, or remove the claim.`
        : " Back the claim with a product fact or soften the wording.";
      add({
        category: `claims.${category}`,
        severity,
        sceneIndex: null,
        timestampSec: null,
        message: `${cap(ec.source ?? "copy")} makes an unsupported ${category} claim${quote}.${highRisk ? " HIGH-RISK — blocks ship until substantiated." : ""}`,
        fixHint: `Rewrite the copy so the claim is supported by the product facts.${proofHint}`,
        fixCommand: null,
      });
    }
  }

  const { verdict } = score(findings);
  const blocksShip = verdict === "fail";
  const failCount = findings.filter((f) => f.severity === "fail").length;

  return {
    schemaVersion: "1.0",
    projectId,
    mode,
    applicable: true,
    verdict,
    blocksShip,
    reason: blocksShip
      ? `${failCount} high-risk unsupported claim(s) — health/financial/absolute claims with no substantiation. Blocks ship-ready until proof is supplied or the claim is removed.`
      : verdict === "warn"
        ? "unsupported claims present (performance / pricing / warranty / testimonial). Review and back them before shipping; not a hard block."
        : extracted.length === 0
          ? "no claims found in the commercial copy — nothing to police (re-run after the copy is written)."
          : "all extracted claims are supported by the product facts (or substantiated by proof) — copy is clear to ship.",
    copySources,
    proofProvided: proofLines.length > 0,
    claims,
    findings,
  };
}

/** Capitalize the first letter of a short source label for the finding message. */
function cap(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ─── Default extractor (LLM) ────────────────────────────────────────────────────

/**
 * Default extractor — one `callLLM()` jsonMode pass over the combined copy. It
 * asks the model to pull out every FACTUAL CLAIM (an assertion the brand would
 * have to be able to PROVE) and which surface it came from. It does NOT judge
 * support or category — that is the deterministic policy classifier's job. An
 * unreadable / empty response yields an empty claim list (do-not-invent rule).
 */
const defaultExtractor: ClaimsExtractor = async ({ text, projectId }) => {
  const sys = `You extract FACTUAL CLAIMS from commercial marketing copy for a compliance check.
A factual claim is any assertion the brand would have to be able to PROVE: health/medical effects, earnings/income, performance/efficacy ("works in 7 days", "2x faster"), warranties/guarantees, pricing ("cheapest", "free"), testimonials/social proof, or absolute superlatives ("#1", "the best", "only"). Ignore generic mood/lifestyle copy that asserts nothing provable.
Return JSON only:
{
  "claims": [
    { "text": "the claim, verbatim from the copy", "source": "where it appears (script | prompt | on-screen | caption | distribution) or your best guess", "categoryHint": "health-medical | financial-earnings | performance-efficacy | warranty-guarantee | pricing | platform-policy | testimonial | prohibited-comparative" }
  ]
}
Do not invent claims that are not present. If there are no provable claims, return an empty array.`;

  const res = await callLLM({
    model: CLAIMS_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Commercial copy to scan for claims:\n\n${text}` },
    ],
    jsonMode: true,
    maxTokens: 900,
    projectId,
    endpoint: "openrouter/eval-claims",
  });
  const parsed = safeParse(res.text);
  return Array.isArray(parsed.claims)
    ? parsed.claims
        .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as Record<string, unknown>).text === "string")
        .map((c: Record<string, unknown>) => ({
          text: c.text as string,
          source: typeof c.source === "string" ? c.source : "copy",
          categoryHint: typeof c.categoryHint === "string" ? c.categoryHint : undefined,
        }))
    : [];
};

function safeParse(text: string): Record<string, any> {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(text.slice(s, e + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}
