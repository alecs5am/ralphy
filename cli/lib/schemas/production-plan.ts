// ProductionPlan Zod schema — the structured production plan an agent drafts
// from a chat brief BEFORE any paid generation (issue #407).
//
// This is the machine-readable half of the contract's phase-7 artifact
// (`PRODUCTION_PLAN.md`, see `docs/playbooks/agent-production-contract.md` and
// `cli/lib/contract.ts → CONTRACT_PHASES`). The plan is created/updated AFTER
// the format/template match (phase 3) and BEFORE scenario generation (phase 8);
// `ralphy project plan <id> --brief "<text>"` writes both:
//   • `<project>/PRODUCTION_PLAN.md`     — human-readable (what the contract
//                                          phase-7 presence check looks for).
//   • `<project>/production-plan.json`   — the validated object (this schema).
//
// Design notes:
//  - The DETERMINISTIC fields (contentMode, formatTemplate match, costEstimate)
//    are filled by the plan builder directly: `classifyContentMode(brief)`,
//    `suggestTemplates(brief)`, and a model-stack → cost rollup from the
//    catalog. The LLM ENRICHMENT fields (targetAudienceLanguage, register,
//    sceneCount/duration reasoning) come from a single `callLLM()` jsonMode
//    pass and are validated against `LlmEnrichmentSchema` before being merged.
//  - Schema style mirrors `cli/lib/schemas/{scene,template,unit}.ts`: Zod
//    object with rich `.describe()`-equivalent inline comments, exported type
//    via `z.infer`, sane defaults so a partial LLM payload still parses.

import { z } from "zod";
import { CONTENT_MODES_LIST } from "../content-modes.js";
import { TEMPLATE_FORMATS } from "./template.js";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** The content-mode block — the #412 production-intent label + classifier confidence. */
export const PlanContentModeSchema = z.object({
  /** Best mode from `classifyContentMode`, or null when nothing scored. */
  mode: z.enum(CONTENT_MODES_LIST).nullable(),
  /** 0.0-1.0 classifier confidence in the best mode. */
  confidence: z.number().min(0).max(1).default(0),
  /** True when the classifier couldn't decide — the agent should confirm with the user. */
  ambiguous: z.boolean().default(false),
  /** Runner-up modes, descending score. */
  alternatives: z.array(z.enum(CONTENT_MODES_LIST)).default([]),
});
export type PlanContentMode = z.infer<typeof PlanContentModeSchema>;

/**
 * The format/template match block — the result of `suggestTemplates(brief)`
 * plus the media format. `templateSlug: null` = freeform (nothing matched).
 */
export const PlanFormatTemplateSchema = z.object({
  /** Media format the deliverable ships as (∈ the template format taxonomy). */
  format: z.enum(TEMPLATE_FORMATS),
  /** Matched template slug, or null for a freeform brief. */
  templateSlug: z.string().nullable(),
  /** Human name of the matched template, when one matched. */
  templateName: z.string().optional(),
  /** 0.0-1.0 match confidence (the top suggest score). */
  confidence: z.number().min(0).max(1).default(0),
  /** How the match was found: keyword scorer, LLM rerank, fallback, or freeform. */
  source: z.enum(["keyword", "llm", "keyword-fallback", "freeform"]).default("freeform"),
  /** One-line reasoning when the LLM rerank fired. */
  reasoning: z.string().optional(),
});
export type PlanFormatTemplate = z.infer<typeof PlanFormatTemplateSchema>;

/** One model in the stack + its role and per-unit price ballpark. */
export const PlanModelSchema = z.object({
  /** What this model produces in the stack. */
  role: z.enum(["image", "video", "voiceover", "music", "sfx", "llm"]),
  /** Model id (e.g. `google/gemini-3-pro-image-preview`) or pipeline label (e.g. `elevenlabs-tts`). */
  model: z.string().min(1),
  /** Best-effort per-unit USD cost (per image / per second of video / per VO pass). */
  unitCostUsd: z.number().nonnegative().default(0),
  /** Optional one-line note (why this model, any caveat). */
  note: z.string().optional(),
});
export type PlanModel = z.infer<typeof PlanModelSchema>;

/** The cost + wall-clock estimate block. */
export const PlanEstimateSchema = z.object({
  /** Low end of the cost range, USD. */
  costLowUsd: z.number().nonnegative().default(0),
  /** High end of the cost range, USD. */
  costHighUsd: z.number().nonnegative().default(0),
  /** Estimated wall-clock minutes for the full job. */
  wallClockMin: z.number().nonnegative().default(0),
  /** Free-text breakdown of how the estimate was derived. */
  basis: z.string().optional(),
});
export type PlanEstimate = z.infer<typeof PlanEstimateSchema>;

// ─── The LLM enrichment payload ──────────────────────────────────────────────
//
// What the single `callLLM()` jsonMode pass returns. Kept narrow so a partial
// or sloppy model response still validates and merges into the plan. The
// deterministic half NEVER comes from the LLM.

export const LlmEnrichmentSchema = z.object({
  /** Inferred target-audience language (e.g. "English", "Russian"). */
  targetAudienceLanguage: z.string().min(1).default("English"),
  /** Style/register the piece should hit (e.g. "photoreal UGC selfie", "PS1 horror"). */
  register: z.string().default(""),
  /** Reasoned scene count for a video; 1 for a single still / image-pack. */
  sceneCount: z.number().int().positive().max(120).default(1),
  /** Reasoned total duration in seconds (0 for stills). */
  durationSec: z.number().nonnegative().max(3600).default(0),
  /** The first user-facing checkpoint (e.g. "scene-01 anchor → wait for go"). */
  firstCheckpoint: z.string().default(""),
  /** One short sentence summarizing the creative vibe. */
  vibe: z.string().default(""),
});
export type LlmEnrichment = z.infer<typeof LlmEnrichmentSchema>;

// ─── The full ProductionPlan ──────────────────────────────────────────────────

export const ProductionPlanSchema = z.object({
  /** Schema version — bump when fields gain a required member. */
  version: z.literal(1).default(1),
  /** The project this plan belongs to. */
  projectId: z.string().min(1),
  /** The originating user brief (verbatim, English-on-disk). */
  brief: z.string().default(""),
  /** ISO timestamp the plan was generated. */
  generatedAt: z.string().default(() => new Date().toISOString()),

  // ── LLM-enriched fields ──
  /** Inferred target-audience language. */
  targetAudienceLanguage: z.string().min(1).default("English"),
  /** Style/register the piece hits. */
  register: z.string().default(""),
  /** One-sentence creative vibe. */
  vibe: z.string().default(""),
  /** Reasoned scene count (1 for stills). */
  sceneCount: z.number().int().positive().max(120).default(1),
  /** Reasoned total duration in seconds. */
  durationSec: z.number().nonnegative().max(3600).default(0),
  /** First user-facing checkpoint before bulk generation. */
  firstCheckpoint: z.string().default(""),

  // ── Format / platform ──
  /** Aspect ratio (e.g. "9:16", "1:1", "16:9"). */
  aspect: z.string().default("9:16"),
  /** Target platform (e.g. "tiktok", "instagram", "youtube"). */
  platform: z.string().default("tiktok"),

  // ── Deterministic blocks ──
  /** Content-mode classification (#412). */
  contentMode: PlanContentModeSchema,
  /** Format + template match (suggest). */
  formatTemplate: PlanFormatTemplateSchema,
  /**
   * Content-niche craft-overlay skills to load on top (e.g. `ugc-unboxing`,
   * `poster`). Empty when no overlay applies.
   */
  craftOverlay: z.array(z.string()).default([]),
  /**
   * The quality guidance the agent loads for the chosen mode BEFORE drafting
   * prompts (#417): the register-guideline slugs the mode declares (resolvable
   * via `ralphy guideline show <slug>`) PLUS its mode-level quality-playbook doc
   * path when one exists (`docs/playbooks/modes/<mode>.md`). Populated from
   * `modeGuidelineCoverage(mode)`; empty only when the mode is unclassified.
   * This is the plan's record of "which guidelines it used".
   */
  guidelinesUsed: z.array(z.string()).default([]),

  // ── Inputs the agent must have ──
  /** References the brief requires (named real entities, products, IP). */
  requiredRefs: z.array(z.string()).default([]),
  /** Benchmark / style source (a URL, a template slug, or a guideline slug). */
  benchmarkSource: z.string().nullable().default(null),
  /** Audio path / pipeline (e.g. an uploaded track, "elevenlabs-music", "none"). */
  audioPath: z.string().nullable().default(null),

  // ── Stack + estimate ──
  /** The model stack: which model fills which role. */
  modelStack: z.array(PlanModelSchema).default([]),
  /** Cost + wall-clock estimate. */
  estimate: PlanEstimateSchema,

  /**
   * Bypasses the user explicitly waived (contract bypass-logging, AGENTS.md
   * invariant). Each entry is a `skip:<phase-id>` label + the user's words.
   */
  bypasses: z.array(z.string()).default([]),
});

export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;

/**
 * Parse + validate an unknown value into a ProductionPlan. Throws a ZodError on
 * a malformed plan. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseProductionPlan(input: unknown): ProductionPlan {
  return ProductionPlanSchema.parse(input);
}
