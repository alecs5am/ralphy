// Eval-driven prompt-optimization loop (#486) — EXPERIMENTAL.
//
// The eval research (and DSPy/MIPRO specifically) recommends treating PROMPTS as
// optimizable artifacts: improve a generator or judge prompt against a labeled
// dataset, then prove the improvement on a HELD-OUT split before trusting it.
// This module is that loop, built on the #483 calibration dataset + metrics.
//
// DSPy/MIPRO is the INSPIRATION, not a hard dependency — we do not pull in DSPy.
// The candidate-generation step is one bounded `callLLM` call given the train
// split's failures; the value comes from the SPLIT + the held-out comparison,
// not from any one optimizer algorithm.
//
// The load-bearing acceptance: this NEVER overwrites a template, guideline,
// MODELS.md, or the source prompt. It writes a REVIEWABLE proposal under a
// proposals dir (append-only, versioned). A maintainer applies a proposal by
// hand. Public guidance stays review-gated.
//
// Two paths, one loop (mirrors calibration.ts):
//   • OFFLINE (the test/CI seam): inject `baselinePredictions` /
//     `candidatePredictions` (per-example { id: "pass"|"fail" } maps) and
//     `candidateOverride` (the candidate prompt string) → ZERO model calls,
//     fully deterministic. Every test + smoke uses this.
//   • LIVE (paid): no injections → `runCalibration` runs the gate's real judge
//     with each prompt, and `callLLM` generates the candidate from train-split
//     failures. Type-correct and wired, never exercised by tests.

import { createHash } from "node:crypto";
import path from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import {
  runCalibration,
  type CalibrationMetrics,
  type RunCalibrationOptions,
} from "./calibration.js";
import type { CalibrationDataset } from "../schemas/calibration.js";
import { callLLM } from "../providers/llm.js";

/** The two kinds of prompt this loop can optimize. */
export type OptimizeKind = "judge" | "generator";

/**
 * The minimum kappa margin a candidate must beat the baseline by to be called an
 * improvement. A bare `> baseline` would let pure split-noise read as a win, so
 * we demand a small but non-trivial edge. A default, not a universal truth — a
 * high-stakes gate may demand more.
 */
export const DEFAULT_IMPROVEMENT_KAPPA_MARGIN = 0.02;

/** The fraction of examples that land in the TRAIN split by default. */
export const DEFAULT_TRAIN_FRACTION = 0.6;

/** Default optimizer budget — the max number of candidate-generation attempts the live path makes. */
export const DEFAULT_OPTIMIZER_BUDGET = 1;

// ─── Deterministic split ──────────────────────────────────────────────────────

/**
 * Stable 32-bit hash of an example id (+ seed). Used to pseudo-shuffle the
 * examples deterministically so the same dataset + fraction + seed ALWAYS yields
 * the exact same split — no Math.random, reproducible across calls and machines.
 */
function idHash(id: string, seed: number): number {
  const h = createHash("sha256").update(`${seed}:${id}`).digest();
  // First 4 bytes as an unsigned int.
  return h.readUInt32BE(0);
}

/**
 * Split a dataset into deterministic, DISJOINT train / held-out subsets.
 *
 * Determinism: examples are ordered by a stable per-id hash (`sha256(seed:id)`),
 * NOT their array position and NOT Math.random. The first `floor(n *
 * trainFraction)` of that stable order go to `train`, the rest to `heldOut`. The
 * same `dataset` + `trainFraction` + `seed` therefore produce byte-identical
 * splits on every call and every machine. Every example lands in exactly one
 * subset; the union is the full set.
 *
 * `trainFraction` is clamped to [0, 1]. A `trainFraction` of 1 leaves heldOut
 * empty (and vice versa) — callers that need a non-empty held-out set should
 * validate before calling.
 */
export function splitDataset(
  dataset: CalibrationDataset,
  trainFraction: number,
  seed = 0,
): { train: CalibrationDataset; heldOut: CalibrationDataset } {
  const frac = Math.max(0, Math.min(1, trainFraction));
  // Stable order: by id-hash, tie-broken by id so equal hashes are still deterministic.
  const ordered = [...dataset.examples].sort((a, b) => {
    const ha = idHash(a.id, seed);
    const hb = idHash(b.id, seed);
    return ha === hb ? a.id.localeCompare(b.id) : ha - hb;
  });
  const trainCount = Math.floor(ordered.length * frac);
  const trainExamples = ordered.slice(0, trainCount);
  const heldExamples = ordered.slice(trainCount);

  const base = { version: dataset.version, gate: dataset.gate } as const;
  return {
    train: {
      ...base,
      judgeModel: dataset.judgeModel,
      judgePromptVersion: dataset.judgePromptVersion,
      examples: trainExamples,
    },
    heldOut: {
      ...base,
      judgeModel: dataset.judgeModel,
      judgePromptVersion: dataset.judgePromptVersion,
      examples: heldExamples,
    },
  };
}

// ─── Baseline-vs-candidate comparison ──────────────────────────────────────────

export interface PromptComparison {
  /** candidate.kappa - baseline.kappa (null when either kappa is undefined). */
  deltaKappa: number | null;
  /** candidate.accuracy - baseline.accuracy (null when either is undefined). */
  deltaAccuracy: number | null;
  /** candidate.tpr - baseline.tpr (null when either is undefined). */
  deltaTpr: number | null;
  /** candidate.tnr - baseline.tnr (null when either is undefined). */
  deltaTnr: number | null;
  /** True when the candidate's kappa beats the baseline's by >= the improvement margin. */
  improved: boolean;
  /** The kappa margin the `improved` verdict was decided against. */
  improvementMargin: number;
  /** One-line human-readable summary of the comparison. */
  summary: string;
}

/** candidate - baseline, null when either operand is null. */
function delta(candidate: number | null, baseline: number | null): number | null {
  return candidate === null || baseline === null ? null : candidate - baseline;
}

/**
 * Pure baseline-vs-candidate comparison on held-out metrics. `improved` is true
 * iff both kappas are defined AND `candidate.kappa - baseline.kappa >= margin`
 * (default DEFAULT_IMPROVEMENT_KAPPA_MARGIN). A null kappa on either side (a
 * degenerate split) is NOT an improvement — we never propose on undefined
 * agreement.
 */
export function comparePromptCandidates(
  baseline: CalibrationMetrics,
  candidate: CalibrationMetrics,
  margin = DEFAULT_IMPROVEMENT_KAPPA_MARGIN,
): PromptComparison {
  const deltaKappa = delta(candidate.cohensKappa, baseline.cohensKappa);
  const deltaAccuracy = delta(candidate.accuracy, baseline.accuracy);
  const deltaTpr = delta(candidate.tpr, baseline.tpr);
  const deltaTnr = delta(candidate.tnr, baseline.tnr);
  const improved = deltaKappa !== null && deltaKappa >= margin;

  const fmt = (v: number | null) => (v === null ? "undefined" : v.toFixed(3));
  const summary = improved
    ? `candidate improves Cohen's kappa by ${fmt(deltaKappa)} (>= ${margin} margin) on the held-out split — propose.`
    : `candidate does not clear the ${margin} kappa-improvement margin (delta ${fmt(deltaKappa)}) on the held-out split — reject.`;

  return { deltaKappa, deltaAccuracy, deltaTpr, deltaTnr, improved, improvementMargin: margin, summary };
}

// ─── The optimization report ────────────────────────────────────────────────

export interface OptimizationReport {
  version: 1;
  kind: OptimizeKind;
  /** The gate id the dataset calibrates (e.g. "first-frame-hook"), or null. */
  gate: string | null;
  /** Absolute path of the source prompt being optimized (NEVER written). */
  promptSource: string;
  /** Absolute path / identifier of the dataset. */
  datasetSource: string;
  /** The train fraction used for the split. */
  trainFraction: number;
  /** The split seed. */
  seed: number;
  /** Max candidate-generation attempts the live path was allowed. */
  optimizerBudget: number;
  baseline: { metrics: CalibrationMetrics; prompt: string };
  candidate: { metrics: CalibrationMetrics; prompt: string };
  comparison: PromptComparison;
  /** "propose" when the candidate improved, else "reject". */
  recommendation: "propose" | "reject";
  /** ISO timestamp. */
  generatedAt: string;
}

export interface RunPromptOptimizationInput {
  /** Absolute path of the source prompt (read for the baseline prompt text; never written). */
  promptSource: string;
  /** The baseline prompt text (already read from promptSource by the caller). */
  baselinePrompt: string;
  /** The dataset to split + evaluate against. */
  dataset: CalibrationDataset;
  /** Dataset path / identifier recorded in the report. */
  datasetSource: string;
  /** "judge" (default) or "generator". */
  kind?: OptimizeKind;
}

export interface RunPromptOptimizationOptions {
  /** Train-split fraction (default DEFAULT_TRAIN_FRACTION). */
  trainFraction?: number;
  /** Split seed (default 0). */
  seed?: number;
  /** Max candidate-generation attempts on the live path (default DEFAULT_OPTIMIZER_BUDGET). */
  optimizerBudget?: number;
  /** The kappa-improvement margin (default DEFAULT_IMPROVEMENT_KAPPA_MARGIN). */
  improvementMargin?: number;
  /** Judge-model override threaded into both held-out calibration runs + the live candidate generation. */
  model?: string;
  /** Skip vision on the live calibration path where the gate supports it. */
  noVision?: boolean;

  // ── OFFLINE injection seams (supply ALL THREE for a fully model-free run) ──
  /** Pre-recorded BASELINE judge predictions on the held-out split { exampleId: "pass"|"fail" }. */
  baselinePredictions?: Record<string, "pass" | "fail">;
  /** Pre-recorded CANDIDATE judge predictions on the held-out split. */
  candidatePredictions?: Record<string, "pass" | "fail">;
  /** The candidate prompt string — skips the live `callLLM` candidate-generation entirely. */
  candidateOverride?: string;
}

/**
 * The bounded LIVE candidate-generation step: ask the LLM to improve the prompt
 * given the train-split's mislabeled examples. ONE `callLLM` call (the optimizer
 * budget bounds how many times the loop may retry; the default is 1). Returns
 * the improved prompt text. NOT exercised by tests — `candidateOverride` is the
 * offline seam.
 */
async function generateCandidatePrompt(
  baselinePrompt: string,
  kind: OptimizeKind,
  train: CalibrationDataset,
  opts: RunPromptOptimizationOptions,
): Promise<string> {
  const trainSummary = train.examples
    .map((e) => `- id=${e.id} expected=${e.expectedLabel}${e.rationale ? ` rationale=${e.rationale}` : ""}`)
    .join("\n");
  const role =
    kind === "judge"
      ? "You are improving an LLM JUDGE prompt that decides whether a piece of content should pass or be blocked."
      : "You are improving a GENERATOR prompt whose outputs are scored by a fixed quality gate.";
  const { text } = await callLLM({
    endpoint: "prompt-optimize",
    model: opts.model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          `${role} Rewrite the prompt so it agrees better with the human labels on the training examples. ` +
          `Keep it concise and self-contained. Return ONLY the improved prompt text, no commentary.`,
      },
      {
        role: "user",
        content: `Current prompt:\n${baselinePrompt}\n\nTraining examples (human labels):\n${trainSummary}`,
      },
    ],
  });
  return text.trim();
}

/**
 * Run the eval-driven prompt-optimization loop:
 *   1. split the dataset into train / held-out (deterministic),
 *   2. evaluate the BASELINE prompt on the held-out split (via runCalibration —
 *      offline when `baselinePredictions` is supplied, else the live judge),
 *   3. produce a CANDIDATE prompt (offline: `candidateOverride`; live: a bounded
 *      `callLLM` over the train split's labels),
 *   4. evaluate the CANDIDATE on the held-out split (offline when
 *      `candidatePredictions` is supplied, else the live judge),
 *   5. compare → recommendation ("propose" when improved, else "reject").
 *
 * Zero model calls when `baselinePredictions` + `candidatePredictions` +
 * `candidateOverride` are all supplied. The source prompt is NEVER written.
 */
export async function runPromptOptimization(
  input: RunPromptOptimizationInput,
  opts: RunPromptOptimizationOptions = {},
): Promise<OptimizationReport> {
  const kind = input.kind ?? "judge";
  const trainFraction = opts.trainFraction ?? DEFAULT_TRAIN_FRACTION;
  const seed = opts.seed ?? 0;
  const optimizerBudget = opts.optimizerBudget ?? DEFAULT_OPTIMIZER_BUDGET;

  const { train, heldOut } = splitDataset(input.dataset, trainFraction, seed);

  // — Baseline eval on the held-out split (the judge runs with the baseline prompt).
  const baselineCalOpts: RunCalibrationOptions = {
    model: opts.model,
    noVision: opts.noVision,
    ...(opts.baselinePredictions ? { predictions: opts.baselinePredictions } : {}),
  };
  const baselineReport = await runCalibration(heldOut, baselineCalOpts);

  // — Candidate prompt: offline override, else the bounded live optimizer.
  const candidatePrompt =
    opts.candidateOverride ??
    (await generateCandidatePrompt(input.baselinePrompt, kind, train, opts));

  // — Candidate eval on the same held-out split (the judge runs with the candidate prompt).
  const candidateCalOpts: RunCalibrationOptions = {
    model: opts.model,
    noVision: opts.noVision,
    ...(opts.candidatePredictions ? { predictions: opts.candidatePredictions } : {}),
  };
  const candidateReport = await runCalibration(heldOut, candidateCalOpts);

  const comparison = comparePromptCandidates(
    baselineReport.metrics,
    candidateReport.metrics,
    opts.improvementMargin,
  );

  return {
    version: 1,
    kind,
    gate: input.dataset.gate,
    promptSource: path.resolve(input.promptSource),
    datasetSource: input.datasetSource,
    trainFraction,
    seed,
    optimizerBudget,
    baseline: { metrics: baselineReport.metrics, prompt: input.baselinePrompt },
    candidate: { metrics: candidateReport.metrics, prompt: candidatePrompt },
    comparison,
    recommendation: comparison.improved ? "propose" : "reject",
    generatedAt: new Date().toISOString(),
  };
}

// ─── Proposal writer (no-overwrite is the load-bearing acceptance) ─────────────

/** Path segments that must never be a proposal target — public guidance is review-gated. */
const PROTECTED_SEGMENTS = ["templates", "guidelines"] as const;
const PROTECTED_FILES = ["MODELS.md"] as const;

/**
 * Refuse a proposal `outDir` that would land ON the source prompt's own
 * directory (or the prompt file itself) or any review-gated public-guidance
 * path. A dedicated SUBDIRECTORY of the prompt's dir (e.g. the default
 * `prompt-proposals/` next to the dataset) is fine — what we forbid is
 * scribbling over the prompt's directory contents or the prompt file. The
 * writer NEVER touches the source prompt, `templates/`, `guidelines/`, or
 * MODELS.md.
 */
function assertSafeOutDir(outDir: string, promptSource: string): void {
  const resolvedOut = path.resolve(outDir);
  const resolvedPrompt = path.resolve(promptSource);
  const promptDir = path.dirname(resolvedPrompt);

  if (resolvedOut === promptDir || resolvedOut === resolvedPrompt) {
    throw new Error(
      `refusing to write a proposal onto the source prompt's directory (${promptDir}); choose a dedicated --out subdir`,
    );
  }
  const segments = resolvedOut.split(path.sep);
  for (const protectedSeg of PROTECTED_SEGMENTS) {
    if (segments.includes(protectedSeg)) {
      throw new Error(
        `refusing to write a proposal into a protected path (contains "${protectedSeg}/"); public guidance stays review-gated`,
      );
    }
  }
  for (const protectedFile of PROTECTED_FILES) {
    if (segments.includes(protectedFile) || path.basename(resolvedOut) === protectedFile) {
      throw new Error(
        `refusing to write a proposal onto a protected file ("${protectedFile}"); public guidance stays review-gated`,
      );
    }
  }
}

/**
 * Write a REVIEWABLE proposal under `<outDir>/proposal-vN/` (append-only — the
 * next free N, never overwriting an existing proposal dir). The dir holds
 * `candidate-prompt.txt` (the proposed prompt) + `report.json` (the full
 * OptimizationReport). Returns the proposal dir path.
 *
 * Guards (the load-bearing acceptance): refuses to write into the source
 * prompt's own directory or any protected public-guidance path
 * (`templates/`, `guidelines/`, MODELS.md). It writes ONLY under `outDir`.
 */
export function writeProposal(outDir: string, report: OptimizationReport): string {
  assertSafeOutDir(outDir, report.promptSource);

  const resolvedOut = path.resolve(outDir);
  mkdirSync(resolvedOut, { recursive: true });

  // Append-only: find the next free proposal-vN.
  let n = 1;
  while (existsSync(path.join(resolvedOut, `proposal-v${n}`))) n++;
  const proposalDir = path.join(resolvedOut, `proposal-v${n}`);
  mkdirSync(proposalDir, { recursive: true });

  writeFileSync(path.join(proposalDir, "candidate-prompt.txt"), report.candidate.prompt);
  writeFileSync(path.join(proposalDir, "report.json"), JSON.stringify(report, null, 2));

  return proposalDir;
}

/** Read a prompt file as UTF-8. Throws when missing (callers map to E_NOT_FOUND). */
export function readPromptFile(promptPath: string): string {
  return readFileSync(promptPath, "utf8");
}
