// Per-workspace custom-evaluator config Zod schema (#468).
//
// A workspace (= a studio / universe / client) can encode its own hard quality
// bar ONCE and reuse it across every episode it produces. This is the generic,
// config-driven framework that the runner (#469) and the criteria
// implementations (#470) build on; the Silent-Hill thresholds live in an
// INSTANCE config authored separately (#471), never in this schema.
//
// Where the config lands: a sibling `<workspace>/evaluators.json`, or an
// `evaluators` key inside `<workspace>/workspace.json` (the loader reads the
// sibling first — see `cli/lib/workspace-evaluators.ts`).
//
// Schema style mirrors `cli/lib/schemas/scorecard.ts`: a Zod object with
// inline-doc comments, exported `z.infer` types, sane `.default()`s so a
// best-effort / partial config still parses, and a `parseWorkspaceEvaluators()`.
// English-only-on-disk. The schema is fully GENERIC — NO universe-specific
// fields, NO hardcoded criterion ids.

import { z } from "zod";

// ─── Criterion ──────────────────────────────────────────────────────────────

/**
 * How a criterion is checked:
 *   • `deterministic` — code-only (ffprobe, scene durations, plate opacity,
 *                       freeze detection). Resolved via `validatorId`. NO model.
 *   • `vision`        — a model pass scored against `rubricPrompt` (and an
 *                       optional `benchmarkRef`).
 */
export const CriterionCheckSchema = z.enum(["deterministic", "vision"]);
export type CriterionCheck = z.infer<typeof CriterionCheckSchema>;

/**
 * Severity reuses the eval `Severity` vocab (`cli/lib/eval/types.ts`) so a
 * custom criterion's finding slots into the same gate verdict as a built-in one.
 * Defaults to `warn` — a custom criterion advises unless the workspace opts it
 * up to `fail`.
 */
export const CriterionSeveritySchema = z.enum(["info", "warn", "fail"]);
export type CriterionSeverity = z.infer<typeof CriterionSeveritySchema>;

/**
 * `threshold` is config-defined PER criterion, so its shape can't be fixed here:
 * a freeze-duration check wants a number (`1.7`), an aspect check wants a string
 * (`"9:16"`), a toggle wants a boolean, and a range wants an object
 * (`{ min: 3 }`). We accept the permissive union of those and default to `{}`
 * (an empty object = "no threshold configured"), mirroring the pragmatism in
 * scorecard.ts rather than locking it to one type the criteria don't share.
 */
export const CriterionThresholdSchema = z
  .union([z.number(), z.string(), z.boolean(), z.record(z.unknown())])
  .default({});
export type CriterionThreshold = z.infer<typeof CriterionThresholdSchema>;

/** One custom evaluator criterion. Generic: any universe defines its own set. */
export const WorkspaceCriterionSchema = z.object({
  /** Stable id, unique within the config (e.g. "plate-opacity", "freeze-on-fork"). */
  id: z.string(),
  /** Human-readable label for reports / studio. */
  label: z.string(),
  /** Grouping bucket (e.g. "captions", "pacing", "style") — free-form. */
  category: z.string(),
  /** deterministic (code) or vision (model). */
  check: CriterionCheckSchema,
  /** info | warn | fail — reuses the eval Severity vocab. */
  severity: CriterionSeveritySchema.default("warn"),
  /** The configured bar — number | string | boolean | object (see schema above). */
  threshold: CriterionThresholdSchema,
  /** For `deterministic`: the id of the validator that runs the check (#470). */
  validatorId: z.string().optional(),
  /** For `vision`: the rubric prompt the model scores against. */
  rubricPrompt: z.string().optional(),
  /** Optional reference into `benchmarks` this criterion measures against. */
  benchmarkRef: z.string().optional(),
});
export type WorkspaceCriterion = z.infer<typeof WorkspaceCriterionSchema>;

// ─── Config ───────────────────────────────────────────────────────────────────

export const WorkspaceEvaluatorsConfigSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.string().default("1.0"),
  /** The custom criteria this workspace evaluates every episode against. */
  criteria: z.array(WorkspaceCriterionSchema).default([]),
  /**
   * Optional named benchmarks a criterion can reference via `benchmarkRef`
   * (e.g. reference frames, golden-set slugs, target metrics). Free-form values
   * — the criteria implementations (#470) define what each benchmark means.
   */
  benchmarks: z.record(z.unknown()).optional(),
});
export type WorkspaceEvaluatorsConfig = z.infer<
  typeof WorkspaceEvaluatorsConfigSchema
>;

/**
 * Parse + validate an unknown value into a WorkspaceEvaluatorsConfig. Throws a
 * ZodError on a malformed object (the loader catches it and returns null so a
 * bad rubric never crashes unrelated verbs).
 */
export function parseWorkspaceEvaluators(
  raw: unknown,
): WorkspaceEvaluatorsConfig {
  return WorkspaceEvaluatorsConfigSchema.parse(raw);
}
