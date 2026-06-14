// CouncilVerdict Zod schema — the structured output of a council review (#415).
//
// A council brings multiple specialist perspectives into the pipeline at two
// expensive decision points:
//   • PREFLIGHT — review the production plan (#407) BEFORE any paid generation.
//   • POLISH    — review the native-video eval report (#411) AFTER eval and
//                 BEFORE Unit formation (#069).
//
// The verdict is the machine-readable contract between the council and the rest
// of the pipeline. Its most load-bearing field is `prioritizedActions`: those
// items REUSE the #409 repair vocabulary (owner ∈ art-director | scenarist |
// editor, plus a `category` string and a `priority`/`severity` ladder) so the
// deterministic repair-plan builder (`buildRepairPlan`) can ingest a polish
// council's actions WITHOUT any free-form parsing.
//
// Design notes:
//  - Schema style mirrors `cli/lib/schemas/{production-plan,repair-plan}.ts`:
//    Zod object, exported type via `z.infer`, sane defaults so a partial /
//    sloppy per-role synthesis still parses.
//  - The council owns NO disk writes and NO media generation — those guarantees
//    live in `cli/lib/council.ts`. This file only types the result.

import { z } from "zod";
import { RepairOwnerSchema, RepairSeveritySchema } from "./repair-plan.js";

// ─── Roles ──────────────────────────────────────────────────────────────────

/**
 * The seven council roles (issue #415 Scope). Each contributes one focused
 * perspective; the synthesis weighs them into a single verdict.
 */
export const CouncilRoleSchema = z.enum([
  "strategist",
  "niche-researcher",
  "creative-director",
  "art-director",
  "editor",
  "performance-marketer",
  "qa-evaluator",
]);
export type CouncilRole = z.infer<typeof CouncilRoleSchema>;

/** The roster, in synthesis order. The single source of truth for the fan-out. */
export const COUNCIL_ROLES: readonly CouncilRole[] = [
  "strategist",
  "niche-researcher",
  "creative-director",
  "art-director",
  "editor",
  "performance-marketer",
  "qa-evaluator",
] as const;

/** Which review moment a verdict was produced under. */
export const CouncilPhaseSchema = z.enum(["preflight", "polish"]);
export type CouncilPhase = z.infer<typeof CouncilPhaseSchema>;

/** The council's top-line call. `ship` = proceed, `revise` = fixable, `block` = stop. */
export const CouncilVerdictKindSchema = z.enum(["ship", "block", "revise"]);
export type CouncilVerdictKind = z.infer<typeof CouncilVerdictKindSchema>;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** One role's contribution: a 0-10 score + a one-line summary of its read. */
export const CouncilRoleScoreSchema = z.object({
  /** The role that produced this score. */
  role: CouncilRoleSchema,
  /** 0-10 confidence/quality score from that role's lens. */
  score: z.number().min(0).max(10).default(0),
  /** One-line summary of the role's verdict (English-on-disk). */
  summary: z.string().default(""),
});
export type CouncilRoleScore = z.infer<typeof CouncilRoleScoreSchema>;

/**
 * A surfaced disagreement between roles — recorded, not silently averaged away.
 * The synthesis keeps these so the agent can flag genuine forks to the user.
 */
export const CouncilDisagreementSchema = z.object({
  /** Short topic the roles disagree on (e.g. "hook strength", "aspect ratio"). */
  topic: z.string().default(""),
  /** The roles on each side of the split + their positions. */
  positions: z
    .array(
      z.object({
        role: CouncilRoleSchema,
        position: z.string().default(""),
      }),
    )
    .default([]),
});
export type CouncilDisagreement = z.infer<typeof CouncilDisagreementSchema>;

/**
 * A prioritized action the council recommends. THIS IS THE INTEGRATION SEAM:
 * `owner` + `category` + `priority` + `severity` REUSE the #409 repair
 * vocabulary (`RepairOwnerSchema` / `RepairSeveritySchema`) so the repair-plan
 * builder ingests these structurally — no free-form parsing of council prose.
 */
export const CouncilActionSchema = z.object({
  /** Owning role — the #409 repair owner taxonomy (art-director | scenarist | editor). */
  owner: RepairOwnerSchema,
  /**
   * Eval/repair-style category (e.g. `style.register-mismatch`, `audio.mix`,
   * `structure.hook-zone-thin-vo`). Free string, but should follow the
   * `<family>.<detail>` shape the eval taxonomy uses so owners stay legible.
   */
  category: z.string().min(1),
  /** The concrete action / edit instruction (English-on-disk). NEVER a paid call run without approval. */
  action: z.string().min(1),
  /** 1-based priority rank (1 = act first). */
  priority: z.number().int().positive().default(1),
  /** Severity carried into the repair ladder (info | warn | fail). */
  severity: RepairSeveritySchema.default("warn"),
});
export type CouncilAction = z.infer<typeof CouncilActionSchema>;

// ─── The full CouncilVerdict ────────────────────────────────────────────────

export const CouncilVerdictSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** Which review moment produced this verdict. */
  phase: CouncilPhaseSchema,
  /** The project this verdict belongs to (empty for a standalone review). */
  projectId: z.string().default(""),
  /** ISO timestamp the council convened. */
  generatedAt: z.string().default(() => new Date().toISOString()),

  /** The council's top-line call. */
  verdict: CouncilVerdictKindSchema,
  /** Per-role scores + summaries (one per convened role). */
  roleScores: z.array(CouncilRoleScoreSchema).default([]),
  /** Issues that BLOCK shipping until resolved (English-on-disk strings). */
  blockingIssues: z.array(z.string()).default([]),
  /** Improvements worth making that do NOT block shipping. */
  nonBlockingImprovements: z.array(z.string()).default([]),
  /** Surfaced cross-role disagreements (kept, not averaged away). */
  disagreements: z.array(CouncilDisagreementSchema).default([]),
  /**
   * The ordered, owner-classified actions in the #409 repair vocabulary. A
   * polish council's actions flow straight into `buildRepairPlan` via this
   * field — structural ingestion, no prose parsing.
   */
  prioritizedActions: z.array(CouncilActionSchema).default([]),
  /** The single human-readable recommendation line. */
  recommendation: z.string().default(""),
});

export type CouncilVerdict = z.infer<typeof CouncilVerdictSchema>;

/**
 * Parse + validate an unknown value into a CouncilVerdict. Throws a ZodError on
 * a malformed verdict. Callers mapping onto `E_VALIDATION_FAILED` should catch
 * and pass `error.message` as `detail`.
 */
export function parseCouncilVerdict(input: unknown): CouncilVerdict {
  return CouncilVerdictSchema.parse(input);
}
