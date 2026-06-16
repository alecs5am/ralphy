// Production-plan quality grade Zod schema (#432).
//
// The grade is a deterministic CRITIC of a ProductionPlan (#407) BEFORE it
// becomes the contract for expensive work — it grades the plan itself (is it
// actionable, grounded, complete, safe to execute), as opposed to the
// release-readiness scorecard (#427) which grades a FINISHED render. The grader
// reads ONE object (the plan) + the static content-mode registry and makes ZERO
// model calls (an optional injected LLM completeness pass is advisory only).
//
// Where the JSON lands: `<project>/plan-grade.json` (append-only / auto-version,
// AGENTS.md #14). The verb is `ralphy project grade-plan <id>`.
//
// Schema style mirrors `cli/lib/schemas/{scorecard,production-plan}.ts`: a Zod
// object with inline-doc comments, exported `z.infer` types, sane defaults so a
// best-effort assembly still parses, and a `parsePlanGrade()`. English-only-
// on-disk.

import { z } from "zod";

// ─── Dimensions ────────────────────────────────────────────────────────────────

/**
 * The plan-quality dimensions (issue #432 Scope). Each is graded from the plan +
 * the content-mode registry expectations the comment names. Append, never
 * repurpose.
 */
export const PLAN_GRADE_DIMENSIONS = [
  "modeFit", // contentMode classified, confident, supported (#413)
  "missingInputs", // mode requiredInputs / requiredRefTypes present in requiredRefs
  "researchGrounding", // research depth + benchmarkSource appropriate for the mode's defaultResearchDepth (#416)
  "styleLock", // a style/guideline lock present when guidelineOrStyleLock.required (#417)
  "modelStack", // the stack covers the roles the resolved format needs
  "costEta", // the cost range + wall-clock estimate is populated + coherent
  "gates", // the mode's qualityGates are declared (AGENTS #4)
  "firstCheckpoint", // a first user-facing checkpoint is set before bulk generation
] as const;
export type PlanGradeDimension = (typeof PLAN_GRADE_DIMENSIONS)[number];

/** Per-dimension status. `na` = the dimension does not apply (e.g. no mode resolved). */
export const PlanGradeStatusSchema = z.enum(["pass", "warn", "fail", "na"]);
export type PlanGradeStatus = z.infer<typeof PlanGradeStatusSchema>;

/** One dimension's reading: a pass/warn/fail/na status + a 0-100 band + a concrete note. */
export const PlanGradeDimensionEntrySchema = z.object({
  /** The dimension this entry grades. */
  dimension: z.enum(PLAN_GRADE_DIMENSIONS),
  /** pass | warn | fail | na. */
  status: PlanGradeStatusSchema,
  /** 0-100 quality band for the dimension. */
  score: z.number().min(0).max(100).default(0),
  /** One-line, English-on-disk explanation of the reading. */
  note: z.string().default(""),
});
export type PlanGradeDimensionEntry = z.infer<typeof PlanGradeDimensionEntrySchema>;

// ─── The top-level verdict ──────────────────────────────────────────────────────

/**
 * The grade's final call:
 *   • `strong`  — every dimension passes; the plan is safe to execute.
 *   • `weak`    — no hard blocker, but a dimension warns (thin research,
 *                 under-covered stack, incoherent/empty estimate, missing gates,
 *                 no first checkpoint) — tighten before locking the contract.
 *   • `blocked` — the plan LACKS a REQUIRED artifact for its mode (a required ref
 *                 type / input missing, a lock-required mode with no style lock,
 *                 an empty model stack, an unsupported/unclassified mode). A
 *                 blocked plan must not become the execution contract.
 */
export const PlanGradeVerdictSchema = z.enum(["strong", "weak", "blocked"]);
export type PlanGradeVerdict = z.infer<typeof PlanGradeVerdictSchema>;

export const PlanGradeSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The project this grade summarizes. */
  projectId: z.string().default(""),
  /** The content mode the plan named (null = unclassified). */
  mode: z.string().nullable().default(null),
  /** ISO timestamp of grading. */
  generatedAt: z.string().default(() => new Date().toISOString()),

  /** The final plan-quality call. */
  verdict: PlanGradeVerdictSchema,
  /** One-line, English-on-disk reason for the verdict. */
  reason: z.string().default(""),
  /** The per-dimension readings (stable order = PLAN_GRADE_DIMENSIONS). */
  dimensions: z.array(PlanGradeDimensionEntrySchema).default([]),
  /** Optional advisory note from the injected LLM completeness pass (omitted when not run). */
  llmReviewNote: z.string().optional(),
});
export type PlanGrade = z.infer<typeof PlanGradeSchema>;

/** The project-relative location the grade is persisted to. */
export const PLAN_GRADE_ARTIFACT = "plan-grade.json" as const;

/**
 * Parse + validate an unknown value into a PlanGrade. Throws a ZodError on a
 * malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parsePlanGrade(input: unknown): PlanGrade {
  return PlanGradeSchema.parse(input);
}
