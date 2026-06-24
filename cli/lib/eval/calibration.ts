// Eval-judge calibration harness + pure agreement metrics (#483).
//
// The eval deep-research is clear: LLM/VLM judges are useful but fallible. A
// production quality gate that BLOCKS or SHIPS content should not be unverified
// taste — a maintainer needs its true-positive rate, true-negative rate, and
// agreement with human labels before trusting it. This module measures exactly
// that for a BINARY judge (a gate whose report has a boolean `blocksShip`).
//
// Binary convention (THE load-bearing rule):
//   POSITIVE class = "the gate should BLOCK / fail". A judge predicts positive
//   when its report's `blocksShip === true` (equivalently `verdict === "fail"`).
//   The human `expectedLabel` is "pass" (negative) or "fail" (positive).
//
// Two paths, one harness:
//   • OFFLINE (the test/CI seam): a `predictions` map { exampleId: "pass"|"fail" }
//     supplies the judge's call for each example → ZERO model calls, fully
//     deterministic. Every test + smoke uses this.
//   • LIVE (paid): no predictions map → `judgeGate` runs the gate's real judge
//     entry point (a model-backed `callLLM()` vision pass). Type-correct and
//     wired, never exercised by tests.

import { checkFirstFrameHook } from "./hook.js";
import { checkTextLegibility } from "./ocr.js";
import { checkCaptions } from "./captions-gate.js";
import { QUALITY_GATES } from "./gate.js";
import {
  CALIBRATION_REPORT_ARTIFACT,
  type CalibrationDataset,
  type ExpectedLabel,
} from "../schemas/calibration.js";

/** The default Cohen's-kappa bar above which a judge is eligible to be a HARD
 *  gate. The eval research recommends 0.6 as a reasonable FIRST promotion bar —
 *  a default, NOT a universal truth (a high-stakes gate may demand more). */
export const DEFAULT_PROMOTION_KAPPA = 0.6;

// ─── Pure metrics ────────────────────────────────────────────────────────────

/** The 2×2 confusion matrix (positive class = "gate should block"). */
export interface ConfusionMatrix {
  /** Predicted block, expected block. */
  tp: number;
  /** Predicted block, expected pass. */
  fp: number;
  /** Predicted pass, expected pass. */
  tn: number;
  /** Predicted pass, expected block. */
  fn: number;
}

/**
 * Judge-vs-human agreement metrics. Rate metrics are `null` when their
 * denominator is zero (the rate is undefined — never fabricated as 0). Cohen's
 * kappa is guarded for the degenerate `1 - pe === 0` case (see below).
 */
export interface CalibrationMetrics {
  /** Number of scored rows. */
  n: number;
  confusion: ConfusionMatrix;
  /** True-positive rate / recall = tp/(tp+fn). null when no positives expected. */
  tpr: number | null;
  /** True-negative rate / specificity = tn/(tn+fp). null when no negatives expected. */
  tnr: number | null;
  /** Precision = tp/(tp+fp). null when nothing predicted positive. */
  precision: number | null;
  /** Recall = tpr (alias). null when no positives expected. */
  recall: number | null;
  /** Accuracy = (tp+tn)/n. null when n === 0. */
  accuracy: number | null;
  /** Cohen's kappa — chance-corrected agreement. null when n === 0. */
  cohensKappa: number | null;
}

/** Safe division: null when the denominator is zero (rate is undefined). */
function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/**
 * Compute agreement metrics from binary rows. PURE — no I/O, no model calls.
 *
 * Cohen's kappa:
 *   po = (tp+tn)/n                                                  (observed agreement)
 *   pe = ((tp+fn)*(tp+fp) + (fp+tn)*(fn+tn)) / n^2                  (chance agreement)
 *   kappa = (po - pe) / (1 - pe)
 *
 * Degenerate guard: when `1 - pe === 0` (every label, both human and judge,
 * collapses onto a single class) kappa is undefined by the formula; we return
 * 1 when the two raters perfectly agree (po === 1) else 0 — the conventional
 * convention so an all-same-label dataset doesn't NaN. n === 0 → every metric
 * is null (nothing to score).
 */
export function computeCalibrationMetrics(
  rows: Array<{ expected: boolean; predicted: boolean }>,
): CalibrationMetrics {
  const confusion: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const { expected, predicted } of rows) {
    if (predicted && expected) confusion.tp++;
    else if (predicted && !expected) confusion.fp++;
    else if (!predicted && !expected) confusion.tn++;
    else confusion.fn++;
  }
  const { tp, fp, tn, fn } = confusion;
  const n = tp + fp + tn + fn;

  if (n === 0) {
    return {
      n: 0,
      confusion,
      tpr: null,
      tnr: null,
      precision: null,
      recall: null,
      accuracy: null,
      cohensKappa: null,
    };
  }

  const tpr = ratio(tp, tp + fn);
  const tnr = ratio(tn, tn + fp);
  const precision = ratio(tp, tp + fp);
  const accuracy = (tp + tn) / n;

  const po = (tp + tn) / n;
  const pe = ((tp + fn) * (tp + fp) + (fp + tn) * (fn + tn)) / (n * n);
  const cohensKappa = 1 - pe === 0 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);

  return {
    n,
    confusion,
    tpr,
    tnr,
    precision,
    recall: tpr,
    accuracy,
    cohensKappa,
  };
}

// ─── Live judge mapping (paid path) ──────────────────────────────────────────

/** The gate ids this harness can calibrate LIVE today (binary blocksShip judges). */
export const CALIBRATABLE_GATES = ["first-frame-hook", "ocr", "captions"] as const;
export type CalibratableGate = (typeof CALIBRATABLE_GATES)[number];

export interface JudgeGateOptions {
  /** The content mode the example was labeled under (drives the judge's thresholds). */
  mode?: string | null;
  /** Skip the vision pass where the gate supports it (free deterministic-only judge). */
  noVision?: boolean;
}

/**
 * Run a gate's REAL judge (the paid, model-backed path) on one artifact and map
 * its report to the binary prediction. The artifact string is the
 * video/render/image the gate reads:
 *   • first-frame-hook → checkFirstFrameHook (the artifact is the video path).
 *   • ocr              → checkTextLegibility (the artifact is one image).
 *   • captions         → checkCaptions (the artifact is the video path).
 *
 * The gates are project-scoped, so we feed a stable synthetic projectId and the
 * artifact as the explicit video / image path each gate already accepts. The
 * binary prediction is `report.blocksShip` ("fail" when it blocks ship).
 *
 * An UN-calibratable gate id throws a clean error naming the supported set. NOT
 * exercised by tests — the offline `predictions` seam covers the harness logic.
 */
export async function judgeGate(
  gateId: string,
  artifactPath: string,
  opts: JudgeGateOptions = {},
): Promise<{ predicted: ExpectedLabel; raw: unknown }> {
  const mode = opts.mode ?? null;
  const projectId = `calibration-${gateId}`;

  if (gateId === "first-frame-hook") {
    const report = await checkFirstFrameHook({ projectId, mode, videoPath: artifactPath });
    return { predicted: report.blocksShip ? "fail" : "pass", raw: report };
  }
  if (gateId === "ocr") {
    const report = await checkTextLegibility({
      projectId,
      // OCR is mode-gated to baked-text modes; default to one so a bare artifact
      // gets read rather than short-circuiting to a not-applicable pass.
      mode: mode ?? "social-carousel",
      images: [artifactPath],
    });
    return { predicted: report.blocksShip ? "fail" : "pass", raw: report };
  }
  if (gateId === "captions") {
    const report = await checkCaptions({
      projectId,
      mode,
      videoPath: artifactPath,
      noPlacement: opts.noVision === true,
    });
    return { predicted: report.blocksShip ? "fail" : "pass", raw: report };
  }

  throw new Error(
    `gate "${gateId}" is not calibratable yet. Supported gates: ${CALIBRATABLE_GATES.join(", ")}.`,
  );
}

// ─── Report ──────────────────────────────────────────────────────────────────

/** One example's calibration outcome. */
export interface CalibrationExampleResult {
  id: string;
  /** Human label as a boolean (true = positive = gate should block). */
  expected: boolean;
  /** Judge prediction as a boolean (true = positive = gate blocks). */
  predicted: boolean;
  /** Whether the judge agreed with the human. */
  agree: boolean;
}

export interface CalibrationReport {
  version: 1;
  gate: string;
  /** The judge model actually used (from opts.model / the gate default), or null offline. */
  judgeModel: string | null;
  /** The judge prompt version (dataset pin), or null. */
  judgePromptVersion: string | null;
  /** ISO timestamp of the run. */
  generatedAt: string;
  /** Whether predictions came from the offline `--predictions` seam (no model calls). */
  offline: boolean;
  metrics: CalibrationMetrics;
  examples: CalibrationExampleResult[];
  /** "promote-to-hard-gate eligible" or "keep advisory" (vs the kappa bar). */
  recommendation: string;
  /** The kappa bar the recommendation was decided against (default 0.6). */
  promotionKappaBar: number;
}

export interface RunCalibrationOptions {
  /**
   * The OFFLINE seam: a map { exampleId: "pass"|"fail" } of pre-recorded judge
   * predictions. When supplied, the harness uses these instead of calling the
   * live judge — ZERO model calls. Missing ids fall back to the live judge.
   */
  predictions?: Record<string, ExpectedLabel>;
  /** Skip vision on the live path where the gate supports it. */
  noVision?: boolean;
  /** Judge-model override recorded in the report (and threaded to the live judge later). */
  model?: string;
  /** Override the kappa promotion bar (default DEFAULT_PROMOTION_KAPPA = 0.6). */
  promotionKappaBar?: number;
}

const label = (b: boolean): ExpectedLabel => (b ? "fail" : "pass");
const isPositive = (l: ExpectedLabel): boolean => l === "fail";

/**
 * Run the calibration harness over a dataset.
 *
 * For each example the predicted label is `opts.predictions[id]` when a
 * predictions map supplies it (OFFLINE — no model calls), else `judgeGate(...)`
 * (LIVE — paid). Builds the agreement metrics + a CalibrationReport. The
 * recommendation compares the metrics' Cohen's kappa to the promotion bar
 * (default 0.6): `>= bar` → "promote-to-hard-gate eligible", else "keep
 * advisory". A null kappa (degenerate dataset) keeps the judge advisory.
 */
export async function runCalibration(
  dataset: CalibrationDataset,
  opts: RunCalibrationOptions = {},
): Promise<CalibrationReport> {
  const predictions = opts.predictions;
  const bar = opts.promotionKappaBar ?? DEFAULT_PROMOTION_KAPPA;
  const offline = predictions !== undefined && dataset.examples.every((e) => e.id in predictions);

  const examples: CalibrationExampleResult[] = [];
  for (const ex of dataset.examples) {
    const expected = isPositive(ex.expectedLabel);
    let predictedLabel: ExpectedLabel;
    if (predictions && ex.id in predictions) {
      predictedLabel = predictions[ex.id]!;
    } else {
      const judged = await judgeGate(dataset.gate, ex.artifact, {
        mode: ex.mode ?? null,
        noVision: opts.noVision,
      });
      predictedLabel = judged.predicted;
    }
    const predicted = isPositive(predictedLabel);
    examples.push({ id: ex.id, expected, predicted, agree: expected === predicted });
  }

  const metrics = computeCalibrationMetrics(
    examples.map((e) => ({ expected: e.expected, predicted: e.predicted })),
  );

  const kappa = metrics.cohensKappa;
  const eligible = kappa !== null && kappa >= bar;
  const recommendation = eligible
    ? `promote-to-hard-gate eligible (Cohen's kappa ${kappa!.toFixed(3)} >= ${bar} bar).`
    : `keep advisory (Cohen's kappa ${kappa === null ? "undefined (degenerate dataset)" : `${kappa.toFixed(3)} < ${bar} bar`}).`;

  return {
    version: 1,
    gate: dataset.gate,
    judgeModel: opts.model ?? dataset.judgeModel ?? null,
    judgePromptVersion: dataset.judgePromptVersion ?? null,
    generatedAt: new Date().toISOString(),
    offline,
    metrics,
    examples,
    recommendation,
    promotionKappaBar: bar,
  };
}

/** True when `gate` is a known QUALITY_GATES id (whether or not it is calibratable). */
export function isKnownGate(gate: string): boolean {
  return (QUALITY_GATES as readonly string[]).includes(gate);
}

export { CALIBRATION_REPORT_ARTIFACT, label as binaryToLabel };
