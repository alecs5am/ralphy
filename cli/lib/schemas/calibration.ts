// Eval-judge calibration dataset Zod schema (#483).
//
// A calibration dataset is a small set of HUMAN-LABELED examples for ONE binary
// eval judge (a quality gate that returns pass/fail). The harness
// (cli/lib/eval/calibration.ts) runs the judge over each example and measures
// its agreement with the human labels — confusion matrix, TPR/TNR, precision,
// recall, accuracy, and Cohen's kappa — so a maintainer can decide whether the
// judge is trustworthy enough to be a HARD gate or should stay ADVISORY.
//
// Binary convention (the load-bearing rule, repeated in calibration.ts):
//   POSITIVE class = "the gate should BLOCK / fail". A judge predicts positive
//   when its report's `blocksShip === true` (equivalently `verdict === "fail"`).
//   The human `expectedLabel` is "pass" (negative) or "fail" (positive).
//
// `artifact` is an opaque path / ref string — the schema does NOT read or
// validate its on-disk existence (a dataset may reference a fixture that hasn't
// landed yet, or a remote ref). Schema style mirrors
// cli/lib/schemas/{scorecard,run}.ts: a Zod object with inline-doc comments,
// exported z.infer types, sane .default()s, and a parse function. English-only-
// on-disk.

import { z } from "zod";

/** The two human binary labels. "fail" is the POSITIVE class (the gate blocks). */
export const ExpectedLabelSchema = z.enum(["pass", "fail"]);
export type ExpectedLabel = z.infer<typeof ExpectedLabelSchema>;

/** One human-labeled calibration example. */
export const CalibrationExampleSchema = z.object({
  /** Stable example id — also the key the offline `--predictions` map is keyed on. */
  id: z.string().min(1),
  /** Opaque path / ref string for the artifact the judge reads. NOT existence-checked. */
  artifact: z.string().min(1),
  /** The human label: "pass" (negative) or "fail" (positive = gate should block). */
  expectedLabel: ExpectedLabelSchema,
  /** Optional content mode this example was labeled under (drives the live judge's thresholds). */
  mode: z.string().optional(),
  /** Optional human rationale — why a labeler called it pass / fail. English-on-disk. */
  rationale: z.string().optional(),
});
export type CalibrationExample = z.infer<typeof CalibrationExampleSchema>;

export const CalibrationDatasetSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The QUALITY_GATES id this dataset calibrates (e.g. "first-frame-hook", "ocr", "captions"). */
  gate: z.string().min(1),
  /** Optional pin: the judge model the labels were collected against (the run report fills the actual one). */
  judgeModel: z.string().optional(),
  /** Optional pin: the judge prompt version the labels were collected against. */
  judgePromptVersion: z.string().optional(),
  /** The labeled examples (≥1). */
  examples: z.array(CalibrationExampleSchema).min(1),
});
export type CalibrationDataset = z.infer<typeof CalibrationDatasetSchema>;

/** The project-/dataset-relative filename a calibration report is persisted to. */
export const CALIBRATION_REPORT_ARTIFACT = "calibration.json" as const;

/**
 * Parse + validate an unknown value into a CalibrationDataset. Throws a ZodError
 * on a malformed object. Callers mapping onto `E_FILE_MALFORMED` /
 * `E_INPUT_INVALID` should catch and pass `error.message` as `detail`.
 */
export function parseCalibrationDataset(raw: unknown): CalibrationDataset {
  return CalibrationDatasetSchema.parse(raw);
}
