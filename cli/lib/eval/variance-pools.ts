// Batch variance profile schema + rotation pools (#529).
//
// A 30-item batch produced from one template has a structural fingerprint: the
// same hook shape, intro cadence, section skeleton, caption formula, lengths
// clustered within seconds. This module is the PLAN-TIME half of the fix: a
// data-driven set of rotation pools (per format) and a deterministic assignment
// function that hands each batch item a distinct `VarianceProfile` drawn from
// those pools. The GATE-TIME half (measuring similarity across produced units)
// lives in `batch-variance.ts`.
//
// PURE + deterministic, no LLM. The pools ARE the data — extend them here, not
// with magic numbers scattered across the callers. A profile stamps onto a
// campaign cell (`CampaignCell.variance`) / a batch config item and its fields
// flow into prompts as template-string slots (see `varianceSlots`).
//
// English-only-on-disk.

import { UNIT_FORMATS, type UnitFormat } from "../schemas/unit.js";

// ─── The profile shape ─────────────────────────────────────────────────────────

/**
 * One item's variance assignment. Every field is a pick from the format's pool
 * except `targetLength`, which is SAMPLED from a [min,max] range (a constant
 * length across a batch is itself a tell). All string fields are pool labels the
 * prompt substitutes; `sectionOrder` is a permutation of the format's sections.
 */
export interface VarianceProfile {
  /** The format whose pools this profile was drawn from. */
  format: UnitFormat;
  /** How the piece opens (from `hookTypes`). */
  hookType: string;
  /** How the intro is structured (from `introStructures`). */
  introStructure: string;
  /** The section skeleton, as an ORDERED list (a permutation of `sections`). */
  sectionOrder: string[];
  /** Sampled target length in the format's natural unit (words for text, seconds for video/short). */
  targetLength: number;
  /** The unit of `targetLength` ("words" | "seconds"). */
  targetLengthUnit: "words" | "seconds";
  /** The caption/subtitle formula (from `captionFormulas`). */
  captionFormula: string;
  /** The CTA phrasing (from `ctaPhrasings`). */
  ctaPhrasing: string;
}

// ─── The pools (data, per format family) ─────────────────────────────────────────

interface FormatPool {
  hookTypes: string[];
  introStructures: string[];
  sections: string[];
  /** [min, max] inclusive, sampled per item. */
  lengthRange: [number, number];
  lengthUnit: "words" | "seconds";
  captionFormulas: string[];
  ctaPhrasings: string[];
}

// Three pool families cover the nine unit formats. The mapping keeps the pools
// small + honest: a poster and a carousel share the "text-still" register, a
// video and motion-design share the "video" register, etc. Callers pass a
// UnitFormat; `poolFor` resolves the family.

const ARTICLE_POOL: FormatPool = {
  hookTypes: ["question", "stat-shock", "contrarian-claim", "story-open", "definition", "problem-agitate"],
  introStructures: ["thesis-first", "anecdote-then-thesis", "problem-then-promise", "context-then-gap"],
  sections: ["what", "why", "how", "example", "comparison", "pitfalls", "faq"],
  lengthRange: [700, 2200],
  lengthUnit: "words",
  captionFormulas: ["none"],
  ctaPhrasings: ["soft-invite", "direct-ask", "next-step", "resource-link", "question-close"],
};

const VIDEO_POOL: FormatPool = {
  hookTypes: ["cold-open-action", "question", "bold-claim", "pattern-interrupt", "pov-drop", "stat-shock"],
  introStructures: ["hook-then-setup", "in-media-res", "problem-then-payoff", "tease-then-reveal"],
  sections: ["hook", "setup", "beat-a", "beat-b", "turn", "payoff", "cta"],
  lengthRange: [18, 55],
  lengthUnit: "seconds",
  captionFormulas: ["word-by-word", "phrase-chunks", "keyword-punch", "full-line", "no-captions"],
  ctaPhrasings: ["follow-for-more", "comment-prompt", "link-in-bio", "save-this", "question-close"],
};

const SHORT_POOL: FormatPool = {
  hookTypes: ["cold-open-action", "question", "bold-claim", "pattern-interrupt", "text-hook"],
  introStructures: ["hook-then-setup", "in-media-res", "tease-then-reveal"],
  sections: ["hook", "beat-a", "beat-b", "payoff", "cta"],
  lengthRange: [8, 30],
  lengthUnit: "seconds",
  captionFormulas: ["word-by-word", "phrase-chunks", "keyword-punch", "meme-header"],
  ctaPhrasings: ["follow-for-more", "comment-prompt", "save-this", "watch-next"],
};

const STILL_POOL: FormatPool = {
  hookTypes: ["big-number", "question", "bold-claim", "before-after", "list-tease"],
  introStructures: ["headline-first", "visual-first", "problem-first"],
  sections: ["cover", "point-a", "point-b", "point-c", "proof", "cta"],
  lengthRange: [1, 8],
  lengthUnit: "words", // "words" here = headline word budget per slide; unit label kept for the slot
  captionFormulas: ["baked-headline", "sticker-callout", "minimal-label", "numbered-list"],
  ctaPhrasings: ["swipe-prompt", "follow-for-more", "save-this", "direct-ask"],
};

/** UnitFormat → its pool family. */
function poolFor(format: UnitFormat): FormatPool {
  switch (format) {
    case "article":
      return ARTICLE_POOL;
    case "video":
    case "motion-design":
      return VIDEO_POOL;
    case "podcast-cuts":
      return SHORT_POOL;
    case "carousel":
    case "poster":
    case "image":
    case "fb-creative":
    case "sticker-pack":
      return STILL_POOL;
    default:
      return VIDEO_POOL;
  }
}

/** The four format families a UnitFormat resolves into (exposed for tests / docs). */
export type VarianceFamily = "article" | "video" | "short" | "still";

export function familyFor(format: UnitFormat): VarianceFamily {
  const p = poolFor(format);
  if (p === ARTICLE_POOL) return "article";
  if (p === VIDEO_POOL) return "video";
  if (p === SHORT_POOL) return "short";
  return "still";
}

// ─── Deterministic rotation assignment ────────────────────────────────────────

/**
 * A small deterministic PRNG (mulberry32) seeded from the item index + a salt,
 * so the whole assignment is reproducible: same batch size + salt → same
 * profiles every run (the batch/campaign commit stamps them once).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate a pool so index `i` picks pool[(i+offset) % len] — guarantees coverage. */
function rotate<T>(pool: T[], i: number, offset: number): T {
  return pool[(i + offset) % pool.length]!;
}

/**
 * Deterministic Fisher-Yates shuffle of `arr` driven by `rng` (a permutation of
 * the section skeleton — the same sections, a different order per item).
 */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A 32-bit hash of a string (salt) so a batch id / campaign id seeds distinctly. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Assign one variance profile for item `index` of a batch of `count`, drawn from
 * `format`'s pools. ROTATION (not pure random) drives the categorical picks so
 * no dimension is starved: with `count >= pool.length` every pool value is used;
 * with `count < pool.length` the first `count` distinct values are used. The
 * per-dimension rotation offsets are staggered so two dimensions don't move in
 * lockstep. `targetLength` and the section permutation are sampled from a
 * seeded PRNG so they vary without clustering.
 */
export function assignVarianceProfile(
  format: UnitFormat,
  index: number,
  count: number,
  salt = "",
): VarianceProfile {
  const pool = poolFor(format);
  const rng = mulberry32(hashStr(`${format}:${salt}:${index}`) ^ (index + 1));
  // Staggered rotation offsets keep the dimensions out of lockstep.
  const [rMin, rMax] = pool.lengthRange;
  const span = rMax - rMin;
  const targetLength = span <= 0 ? rMin : rMin + Math.round(rng() * span);
  return {
    format,
    hookType: rotate(pool.hookTypes, index, 0),
    introStructure: rotate(pool.introStructures, index, 1),
    sectionOrder: shuffle(pool.sections, rng),
    targetLength,
    targetLengthUnit: pool.lengthUnit,
    captionFormula: rotate(pool.captionFormulas, index, 2),
    ctaPhrasing: rotate(pool.ctaPhrasings, index, 3),
  };
}

/**
 * Assign profiles for a whole batch in one call (the campaign/batch stamp path).
 * `count` items, `format`, an optional `salt` (the batch/campaign id).
 */
export function assignBatchProfiles(
  format: UnitFormat,
  count: number,
  salt = "",
): VarianceProfile[] {
  return Array.from({ length: count }, (_, i) => assignVarianceProfile(format, i, count, salt));
}

// ─── Prompt slot delivery ─────────────────────────────────────────────────────

/**
 * Flatten a profile into template-string slots the prompt-builder substitutes
 * (`{{VARIANCE_HOOK_TYPE}}` etc.). This is HOW a profile reaches a prompt: the
 * campaign/batch stamp writes the profile onto the cell/item, and the producer
 * merges these slots into the brief/prompt context alongside the existing
 * `{{BRIEF}}` / `{{FORMAT}}` slots.
 */
export function varianceSlots(p: VarianceProfile): Record<string, string> {
  return {
    VARIANCE_HOOK_TYPE: p.hookType,
    VARIANCE_INTRO_STRUCTURE: p.introStructure,
    VARIANCE_SECTION_ORDER: p.sectionOrder.join(" > "),
    VARIANCE_TARGET_LENGTH: `${p.targetLength} ${p.targetLengthUnit}`,
    VARIANCE_CAPTION_FORMULA: p.captionFormula,
    VARIANCE_CTA_PHRASING: p.ctaPhrasing,
  };
}

/** The full list of unit formats (re-exported so callers don't dip into unit.js). */
export const VARIANCE_FORMATS = UNIT_FORMATS;
