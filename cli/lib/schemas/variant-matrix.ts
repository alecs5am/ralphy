// Variant-tournament Zod schemas (#421) — the PLAN and the RESULT.
//
// A variant tournament is the DECISION layer on top of the existing variation
// pieces: `batch vary` (#024) already CREATES the variant projects on an axis,
// and `buildBatchReview` (#410) already AGGREGATES winners/failures/cost across
// a batch. The tournament adds the missing third step — RANK the variants, pick
// a CHAMPION, attribute the win to a hypothesis/axis, and PRESERVE the losers
// with a rationale (they are training data; AGENTS.md #14 forbids deleting them).
//
// Two artifacts:
//   • VARIANT_MATRIX  — the PLAN: which axes vary, the hypothesis behind each,
//     the slots it occupies, and the expected cost. Written before generation,
//     mirroring the production-plan estimate idiom.
//   • TournamentResult — the OUTCOME: ranked entries (variantId, mediaPath, axis,
//     score, reasons[], cost), the champion, and the preserved losers with the
//     reason each lost. Written by `ralphy batch tournament <id>` as
//     `tournament.json`.
//
// Schema style mirrors `cli/lib/schemas/{benchmark,provenance-graph,production-
// plan}.ts`: a Zod object with inline-doc comments, exported `z.infer` types,
// sane defaults so a partial / best-effort capture still parses, and a
// `parse*()` entry point. English-only-on-disk.

import { z } from "zod";

// ─── VARIANT_MATRIX (the plan) ────────────────────────────────────────────────

/**
 * One axis of variation in the matrix. `axis` is a free-form label (the #024
 * vary axes — hook / body / cta / persona — plus the wider set the postmortems
 * used: first-frame, product-master, caption-style, music-bed, motion-model).
 * `hypothesis` is the testable claim ("a punchier hook lifts 0-3s retention").
 * `slots` are the variant ids / slot names this axis fans into. `expectedCostUsd`
 * is the estimated spend to generate every slot on this axis.
 */
export const VariantAxisSchema = z.object({
  /** Free-form axis label (hook | first-frame | music-bed | …). */
  axis: z.string().min(1),
  /** The testable claim this axis varies to validate. */
  hypothesis: z.string().default(""),
  /** Variant ids / slot names this axis fans into. */
  slots: z.array(z.string().min(1)).default([]),
  /** Estimated USD to generate every slot on this axis. */
  expectedCostUsd: z.number().nonnegative().default(0),
  /**
   * #561: whether the axis changes substance (counts toward uniqueness), is a
   * cosmetic transform (never counts), or is not in the planner taxonomy.
   */
  kind: z.enum(["substantive", "cosmetic", "unknown"]).optional(),
});
export type VariantAxis = z.infer<typeof VariantAxisSchema>;

/**
 * #561: one planned variant — the substantive axes it changes (what #558
 * attributes outcomes to), the optional cosmetic last layer (recorded, never
 * counted), and the fingerprint channels the change moves.
 */
export const PlannedVariantSchema = z.object({
  variantId: z.string().min(1),
  changedAxes: z.array(z.string().min(1)).default([]),
  cosmeticLayer: z.array(z.string().min(1)).default([]),
  channels: z.array(z.enum(["visual", "audio", "script"])).default([]),
  hypothesis: z.string().default(""),
});
export type PlannedVariantRecord = z.infer<typeof PlannedVariantSchema>;

export const VariantMatrixSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The batch / base project this matrix plans variants for. */
  baseId: z.string().default(""),
  /** ISO timestamp the matrix was built. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** The axes the tournament varies, each with its hypothesis + slots + cost. */
  axes: z.array(VariantAxisSchema).default([]),
  /** Rolled-up expected USD across every axis (sum of `axes[].expectedCostUsd`). */
  totalExpectedCostUsd: z.number().nonnegative().default(0),
  /** #561: the planned variants (substantive axes per variant). */
  variants: z.array(PlannedVariantSchema).default([]),
});
export type VariantMatrix = z.infer<typeof VariantMatrixSchema>;

/** The durable filename the planned matrix is persisted to. */
export const VARIANT_MATRIX_FILENAME = "variant-matrix.json" as const;

// ─── TournamentResult (the outcome) ─────────────────────────────────────────────

/**
 * One ranked entry. `variantId` is the project / slot the candidate came from,
 * `mediaPath` the artifact that was scored, `axis` the matrix axis it varies,
 * `score` the 0-100 (or 0-10) figure the scorer returned, `reasons` the
 * human-readable justification, `cost` the USD spent producing it.
 */
export const TournamentEntrySchema = z.object({
  /** The variant's id (project id / slot / slug). */
  variantId: z.string().min(1),
  /** The artifact path that was scored (project-relative or absolute). */
  mediaPath: z.string().default(""),
  /** The matrix axis this variant varies (free-form label), when known. */
  axis: z.string().default(""),
  /** The scorer's figure for this variant. Higher is better. */
  score: z.number(),
  /** Human-readable reasons the scorer assigned this score. */
  reasons: z.array(z.string()).default([]),
  /** USD spent producing this variant. */
  cost: z.number().nonnegative().default(0),
  /** 1-based rank (1 = champion). Filled by the runner. */
  rank: z.number().int().positive().optional(),
  /** #561: substantive axes this variant changed (from the plan / scenario). */
  changedAxes: z.array(z.string()).default([]),
  /** #561: cosmetic last layer (recorded, never counted as uniqueness). */
  cosmeticLayer: z.array(z.string()).default([]),
});
export type TournamentEntry = z.infer<typeof TournamentEntrySchema>;

/** #561: a sibling comparison the originality gate ran. */
export const SiblingComparisonSchema = z.object({
  variantId: z.string(),
  sibling: z.string(),
  verdict: z.enum(["likely-duplicate", "similar", "original"]),
  visual: z.number().nullable().default(null),
  audio: z.number().nullable().default(null),
  script: z.number().nullable().default(null),
  reasons: z.string().default(""),
});
export type SiblingComparison = z.infer<typeof SiblingComparisonSchema>;

/** #561: a variant the gate refused to emit (or emitted under a logged override). */
export const VariantRefusalSchema = z.object({
  variantId: z.string(),
  /** duplicate-of-sibling: measured similarity over the threshold; cosmetic-only: no substantive change planned. */
  reason: z.enum(["duplicate-of-sibling", "cosmetic-only"]),
  /** The higher-ranked sibling it duplicates, when the reason is a duplicate. */
  sibling: z.string().nullable().default(null),
  detail: z.string().default(""),
  /** The user's logged override reason, when the refusal was overridden. */
  overrideReason: z.string().nullable().default(null),
});
export type VariantRefusal = z.infer<typeof VariantRefusalSchema>;

/** A preserved loser carries the same entry shape + the reason it lost. */
export const TournamentLoserSchema = TournamentEntrySchema.extend({
  /** Why this variant did NOT win (the rationale the issue requires preserved). */
  rationale: z.string().default(""),
});
export type TournamentLoser = z.infer<typeof TournamentLoserSchema>;

export const TournamentResultSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The batch / base id this tournament ran over. */
  baseId: z.string().default(""),
  /** ISO timestamp the tournament was scored. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** Which scorer mode produced the scores. */
  scorer: z.enum(["manual", "model-assisted"]).default("manual"),
  /** Every candidate, ranked best-first (champion is `ranked[0]`). */
  ranked: z.array(TournamentEntrySchema).default([]),
  /** The winning entry (null when there were no candidates). */
  champion: TournamentEntrySchema.nullable().default(null),
  /**
   * The preserved losers (every non-champion candidate) with a rationale. NEVER
   * deleted from disk — this list mirrors what stays in `artifacts/`.
   */
  losers: z.array(TournamentLoserSchema).default([]),
  /** #561: variants cleared to ship as distinct pieces, best first. */
  emitted: z.array(z.string()).default([]),
  /** #561: variants refused (never deleted; they stay on disk as data). */
  refused: z.array(VariantRefusalSchema).default([]),
  /** #561: refusals the user overrode with a logged reason (still emitted). */
  overrides: z.array(VariantRefusalSchema).default([]),
  /** #561: the sibling originality gate. */
  originality: z
    .object({
      /** False when no sibling comparator was wired (--no-originality-gate or no media). */
      checked: z.boolean().default(false),
      comparisons: z.array(SiblingComparisonSchema).default([]),
      /** Variants whose media could not be fingerprinted. */
      unchecked: z.array(z.object({ variantId: z.string(), reason: z.string() })).default([]),
    })
    .default({ checked: false, comparisons: [], unchecked: [] }),
  /** Cost roll-up across every candidate. */
  cost: z
    .object({
      /** Sum of every candidate's `cost`. */
      totalUsd: z.number().nonnegative().default(0),
      /** Per-variant { variantId, cost }. */
      byVariant: z.array(z.object({ variantId: z.string(), cost: z.number() })).default([]),
    })
    .default({ totalUsd: 0, byVariant: [] }),
});
export type TournamentResult = z.infer<typeof TournamentResultSchema>;

/** The durable filename the tournament result is persisted to. */
export const TOURNAMENT_RESULT_FILENAME = "tournament.json" as const;

// ─── Parse entry points ─────────────────────────────────────────────────────────

/** Parse + validate an unknown value into a VariantMatrix. Throws a ZodError. */
export function parseVariantMatrix(input: unknown): VariantMatrix {
  return VariantMatrixSchema.parse(input);
}

/** Parse + validate an unknown value into a TournamentResult. Throws a ZodError. */
export function parseTournamentResult(input: unknown): TournamentResult {
  return TournamentResultSchema.parse(input);
}
