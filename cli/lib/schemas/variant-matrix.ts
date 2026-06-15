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
});
export type VariantAxis = z.infer<typeof VariantAxisSchema>;

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
});
export type VariantMatrix = z.infer<typeof VariantMatrixSchema>;

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
});
export type TournamentEntry = z.infer<typeof TournamentEntrySchema>;

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
