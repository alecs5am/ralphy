// Specialized media metric-adapter contract (#485).
//
// An OPTIONAL layer of media-specific scorers (speech WER, image aesthetic, …)
// that ENRICH the existing eval report — they never form a parallel quality
// system and never change a verdict on their own. Every adapter degrades
// gracefully: when its tool/model/expected-input is unavailable it returns a
// `na` MetricResult with an actionable hint instead of crashing.
//
// The contract is deliberately the same shape as the provider connector
// (cli/lib/providers/types.ts): a small interface + a registry, so adding an
// adapter is adding a file + one registration line.

import type { Capability } from "../../providers/types.js";

/** The score-vs-threshold status of one metric. `na` = the adapter could not run. */
export type MetricStatus = "pass" | "warn" | "fail" | "na";

/**
 * One adapter's verdict over one project. PURE-serializable — this is exactly
 * what lands in `eval.json.metrics[]`. `score`/`threshold` are null when the
 * adapter could not run (`na`) or the metric is unscored.
 */
export interface MetricResult {
  /** The adapter id that produced this (e.g. "tts-wer"). */
  adapter: string;
  /** The media capability axis this adapter scores (mirrors the provider matrix). */
  capability: string;
  status: MetricStatus;
  /** The raw metric value (e.g. WER 0.12), or null when unscored / `na`. */
  score: number | null;
  /** The threshold the status was decided against, or null when not applicable. */
  threshold: number | null;
  /** Human-facing, English-on-disk reason — actionable on `na`/`fail`/`warn`. */
  reason: string;
}

/** The input handed to an adapter's `score()`. Adapter-specific fields are
 *  carried as optional overrides so a test can inject a transcript / hypothesis
 *  and make ZERO model calls. */
export interface MetricInput {
  /** Project id whose artifacts the adapter scores. */
  projectId: string;
  /** Optional content mode — drives per-mode threshold overrides. */
  mode?: string | null;
  /** The expected / reference text (for text-comparison adapters like WER). */
  expectedText?: string | null;
  /**
   * Test seam: a pre-computed transcript / hypothesis string. When set, an
   * adapter that would otherwise transcribe (paid) uses this instead and makes
   * NO model call. Production paths leave it undefined.
   */
  hypothesisOverride?: string | null;
}

/**
 * A pluggable media-specific scorer. `available()` does the capability
 * detection (missing tool/model/expected-input → `{ ok: false, hint }`).
 * `score()` runs the metric and returns a MetricResult — it MUST return `na`
 * (never throw) when the adapter cannot run.
 */
export interface MetricAdapter {
  /** Stable id, kebab-case — the `--adapter` value + the `metrics[].adapter` key. */
  readonly id: string;
  /** Human label for listings. */
  readonly label: string;
  /** The media capability this adapter scores. */
  readonly capability: Capability;
  /** True (ok) when the adapter can actually run for this input; else a hint. */
  available(input: MetricInput): Promise<{ ok: boolean; hint?: string }>;
  /** Run the metric. Returns `na` + a hint rather than throwing when unavailable. */
  score(input: MetricInput): Promise<MetricResult>;
}
