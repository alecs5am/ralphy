// Image aesthetic / prompt-alignment adapter (#485).
//
// A PLUGGABLE seam for an image aesthetic / prompt-alignment predictor
// (ImageReward / HPS / a local aesthetic model). There is NO bundled scorer in
// this first slice: by default `available()` returns `{ ok: false, hint }` and
// the adapter degrades to `na`. The interface + threshold mapping are wired so
// a future provider-backed or local-binary scorer drops in WITHOUT an ad-hoc
// provider call here — registering a scorer is what flips it on.
//
// The PURE, tested-now part is `statusForAesthetic()`: a 0..1 score is `pass`
// at/above the threshold, `warn` within one band below, else `fail`. A future
// `score()` that obtains a real aesthetic value reuses it unchanged.

import { configGet } from "../../global-config.js";
import { thresholdFor } from "./thresholds.js";
import type { MetricAdapter, MetricInput, MetricResult } from "./types.js";

const ADAPTER_ID = "image-aesthetic";

/**
 * Map a 0..1 aesthetic/alignment score to a status: ≥threshold pass; within a
 * `warnBand` (default 0.15) below it warn; else fail. PURE.
 */
export function statusForAesthetic(
  scoreValue: number,
  threshold: number,
  warnBand = 0.15,
): "pass" | "warn" | "fail" {
  if (scoreValue >= threshold) return "pass";
  if (scoreValue >= threshold - warnBand) return "warn";
  return "fail";
}

/** Read a configured scorer id, if any (`metrics.image-aesthetic.scorer`). */
function configuredScorer(): string | null {
  const v = configGet(`metrics.${ADAPTER_ID}.scorer`);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const NO_SCORER_HINT =
  "no aesthetic scorer configured — set metrics.imageAesthetic.scorer (a registered connector) or install a local scorer";

export const imageAestheticAdapter: MetricAdapter = {
  id: ADAPTER_ID,
  label: "Image aesthetic / prompt-alignment",
  capability: "image",

  async available(): Promise<{ ok: boolean; hint?: string }> {
    // No bundled scorer — only "available" once one is wired in. Even then the
    // concrete call would go through a registered connector / wrapped local
    // binary, never an ad-hoc provider call from this file.
    if (!configuredScorer()) return { ok: false, hint: NO_SCORER_HINT };
    return {
      ok: false,
      hint: `aesthetic scorer "${configuredScorer()}" is named but no scorer implementation is wired yet — this is a forward-compatible seam (#485).`,
    };
  },

  async score(input: MetricInput): Promise<MetricResult> {
    const threshold = thresholdFor(ADAPTER_ID, input.mode);
    const avail = await this.available(input);
    // No scorer ⇒ degrade to `na` + the actionable hint. Never crash, never
    // reach for a provider here.
    return {
      adapter: ADAPTER_ID,
      capability: "image",
      status: "na",
      score: null,
      threshold,
      reason: avail.hint ?? NO_SCORER_HINT,
    };
  },
};
