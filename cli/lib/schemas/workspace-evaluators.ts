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
import { CONTRACT_PHASE_IDS } from "../contract.js";

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
  /**
   * For `vision`: a path (relative to the workspace dir) to a dedicated prose
   * `.md` rubric for THIS criterion (#477). Lets each domain (scenario /
   * characters / locations / editing) carry its own self-contained, focused
   * rubric file instead of an inline string. Resolution precedence in the
   * engine's per-criterion vision pass: inline `rubricPrompt` → `rubricFile`
   * content → registered builtin fragment (#470, by `validatorId`) → the label.
   */
  rubricFile: z.string().optional(),
  /** Optional reference into `benchmarks` this criterion measures against. */
  benchmarkRef: z.string().optional(),
});
export type WorkspaceCriterion = z.infer<typeof WorkspaceCriterionSchema>;

// ─── Stage gate (#472) ──────────────────────────────────────────────────────────

/**
 * One stage gate: it maps a production STAGE (the user-facing approval decision)
 * onto a production-contract PHASE and the workspace criterion(s) whose
 * `workspace-eval.json` verdict gates advancing past that phase (#472). The
 * stage cannot advance until every owned criterion's latest verdict clears
 * (`fail` blocks, `warn` advises). The map is config-driven: each universe
 * authors its own gates in its `evaluators.json` — there are NO hardcoded
 * stages here.
 *
 * The four CANONICAL stages a universe typically wires (the #472 spec map —
 * documented, NOT defaulted, so other universes choose their own):
 *   1. location/cast → phase `style-lock` → criteria
 *      `character-design-cohesion` + `location-consistency` (candidate pre-screen).
 *   2. scenario      → phase `scenario`   → criterion `scenario-fidelity`.
 *   3. anchors       → phase `assets`     → criteria
 *      `character-design-cohesion` + `location-consistency`.
 *   4. montage       → phase `eval`       → criteria
 *      `material-density` + `edit-correctness` + `insta-metric-fit`.
 */
export const StageGateSchema = z.object({
  /** Free-form stage label (e.g. "location/cast", "scenario", "anchors", "montage"). */
  stage: z.string(),
  /**
   * The contract phase this stage gates — MUST be a real `CONTRACT_PHASES[].id`.
   * Validated LAZILY against `CONTRACT_PHASE_IDS` via `.refine()` (read at PARSE
   * time, not module-eval time): `contract.ts` and this schema form a circular
   * import (the schema loader is reached from inside `deriveStopConditions`), so
   * referencing the const eagerly in a `z.enum(...)` hits a
   * "Cannot access before initialization" load-order trap. The refine keeps the
   * validation against the single source of truth without the trap.
   */
  phase: z
    .string()
    .refine((p) => CONTRACT_PHASE_IDS.includes(p), {
      message: "phase must be a CONTRACT_PHASES id (see cli/lib/contract.ts)",
    }),
  /** Criterion ids (from this config's `criteria[]`) whose verdict gates the stage. */
  criteria: z.array(z.string()),
  /**
   * `block` halts the stage until the owned criteria clear; `warn` is advisory.
   * Defaults to `block` — a stage gate is a hard bar unless opted down.
   */
  severity: z.enum(["block", "warn"]).default("block"),
});
export type StageGate = z.infer<typeof StageGateSchema>;

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
  /**
   * Optional stage→phase→criteria gates (#472). When present, the production
   * contract (`deriveStopConditions` in `cli/lib/contract.ts`) emits a
   * `stage-gate-unmet` stop at the gated phase whenever an owned criterion's
   * latest `workspace-eval.json` verdict is `fail` (or `warn` → advisory).
   * Absent → zero behavior change for the contract.
   */
  stageGates: z.array(StageGateSchema).optional(),
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
