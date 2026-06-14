// ProductBrandFacts Zod schema — the structured, machine-readable output of the
// research bootstrap (issue #416).
//
// The research bootstrap (`cli/lib/research-bootstrap.ts → chooseResearchDepth`)
// decides HOW DEEP to research a brief; the existing research engine
// (`ralphy research run` → report.md + sources.json) and the site-grounding
// sub-agent (AGENTS.md #15 → artifacts/refs/research.md) do the CRAWLING. This
// schema is the structured DISTILLATE both flows feed into so downstream phases
// (content-mode selection #412, the production plan #407, STYLE_LOCK #408, the
// contract #406, and council review #415) can consume the facts WITHOUT
// re-reading prose.
//
// Where the JSON lands:
//   • <project>/artifacts/refs/research-facts.json
//
// Why there (and NOT under the global research/<topic>/ tree):
//   - It is PROJECT-scoped curated input, not a free-standing topic report. The
//     prose report (report.md + sources.json) stays where the research engine
//     writes it (workspace/research/<topic>/ for `research run`, or
//     artifacts/refs/research.md for the site-grounding crawl); this JSON is the
//     small machine-readable facts the project's later stages read.
//   - It sits beside the other per-project input references in the `refs` kind
//     (artifacts/refs/, #105), so it composes with `--ref artifacts/refs/...`
//     resolution and the append-only artifact contract (regen → .v2, #14).
//   - The production plan's `benchmarkSource` (#407) and the STYLE_LOCK
//     benchmarkRefs section (#408) point AT this file + the prose report; the
//     contract (#406) treats its presence as the satisfied research signal.
//
// Schema style mirrors `cli/lib/schemas/{production-plan,unit,template}.ts`:
// a Zod object with inline-doc comments, exported `z.infer` type, and sane
// defaults so a partial extraction still parses. English-only-on-disk.

import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/**
 * A single visual reference the research surfaced — a benchmark example the
 * generation should measure against. `url` is the source; `note` says what to
 * borrow (composition, palette, hook). `refSlug` links a pulled artifact in the
 * global references tree / the project's refs when one exists.
 */
export const VisualReferenceSchema = z.object({
  /** Source URL of the reference (a TikTok / Reel / Shorts / image / landing page). */
  url: z.string().min(1),
  /** What this reference is a benchmark FOR — the takeaway to apply. */
  note: z.string().default(""),
  /** Pulled-artifact slug (`.ralphy/references/<slug>/` or project refs), when pulled. */
  refSlug: z.string().optional(),
});
export type VisualReference = z.infer<typeof VisualReferenceSchema>;

/**
 * Platform fit for one target platform — the conventions the deliverable must
 * respect on it (aspect, duration band, hook timing, caption norm).
 */
export const PlatformFitSchema = z.object({
  /** Platform id (e.g. "tiktok", "instagram", "youtube", "meta-ads"). */
  platform: z.string().min(1),
  /** Native aspect for this platform (e.g. "9:16", "1:1", "16:9"), when known. */
  aspect: z.string().optional(),
  /** Recommended duration band (e.g. "15-30s", "static") for the format. */
  durationBand: z.string().optional(),
  /** One-line note on platform-specific conventions (hook timing, caption norm). */
  note: z.string().default(""),
});
export type PlatformFit = z.infer<typeof PlatformFitSchema>;

/**
 * A cited source backing the facts. Mirrors the lightweight shape of an entry in
 * the research engine's `sources.json` (id + url + title) so the two stay
 * cross-walkable. The full source machine-contract still lives in `sources.json`;
 * this is the trimmed reference the facts cite.
 */
export const ResearchSourceSchema = z.object({
  /** Footnote / source id (e.g. "1", "site-docs", a `sources.json` id). */
  id: z.string().min(1),
  /** Source URL. */
  url: z.string().min(1),
  /** Source title, when known. */
  title: z.string().optional(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

// ─── The ProductBrandFacts schema ──────────────────────────────────────────────

export const ProductBrandFactsSchema = z.object({
  /** Schema version — bump when a field gains a required member. */
  version: z.literal(1).default(1),
  /** ISO timestamp the facts were extracted. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** How deep the research that produced these facts ran (mirrors ResearchDepth). */
  depth: z.enum(["quick", "deep"]).default("quick"),

  /**
   * Product facts — concrete, citable claims about the product/offer. Free-text
   * bullets (e.g. "95% OCR accuracy", "$0.003 per page", "100+ languages").
   * Anchored to a source in `sources` where possible.
   */
  productFacts: z.array(z.string()).default([]),

  /**
   * Brand assets — the brand DNA the deliverable must respect: palette hex
   * values, typography stack, logo style, tone-of-voice cues. Free-text bullets
   * sourced from the site-grounding crawl (artifacts/refs/tokens.json), never
   * invented from memory (AGENTS.md #15).
   */
  brandAssets: z.array(z.string()).default([]),

  /**
   * Audience — who the content is for: job titles, use-cases, segments, the
   * pains/desires the research surfaced.
   */
  audience: z.array(z.string()).default([]),

  /**
   * Proof points — the credibility levers worth featuring: customer counts,
   * named logos, benchmarks beaten, testimonials, awards.
   */
  proofPoints: z.array(z.string()).default([]),

  /**
   * Claims to avoid — the hard guardrail list: claims the brand does NOT make,
   * regulated/unsubstantiated language, hallucination traps (e.g. "no Python SDK
   * — REST only", from the sotaocr postmortem). Folds into STYLE_LOCK do-not-do.
   */
  claimsToAvoid: z.array(z.string()).default([]),

  /** Visual references — the benchmark examples to measure generation against. */
  visualReferences: z.array(VisualReferenceSchema).default([]),

  /** Platform fit — the conventions per target platform. */
  platformFit: z.array(PlatformFitSchema).default([]),

  /** Cited sources backing the facts above. */
  sources: z.array(ResearchSourceSchema).default([]),
});

export type ProductBrandFacts = z.infer<typeof ProductBrandFactsSchema>;

/**
 * Parse + validate an unknown value into ProductBrandFacts. Throws a ZodError on
 * a malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseProductBrandFacts(input: unknown): ProductBrandFacts {
  return ProductBrandFactsSchema.parse(input);
}

/** Project-relative location the facts JSON is persisted to. */
export const RESEARCH_FACTS_ARTIFACT = "artifacts/refs/research-facts.json" as const;
