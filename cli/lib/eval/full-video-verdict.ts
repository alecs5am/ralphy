// Calibrated ship verdict for the full-video gate (#583).
//
// The #569 audit found the full-video pass (native-video / deep-style) returned
// a ship-ready verdict on 0 of 29 stored runs. #583 labeled those 29 renders by
// eye (cli/lib/eval/calibration-datasets/full-video-pass-569.json) and
// re-aggregated the stored sub-results under candidate rules. Two things kept
// every render, including the clean ones, from passing:
//
//   1. The generic `score()` verdict ("two warns make a warn", plus a score
//      floor of 70). Every stored full-video run carried at least two warns,
//      and warns never separated a ship-ready render from a broken one: every
//      render labeled not-ship-ready also carried a real `fail`.
//   2. Detail sub-checks of the full-video model that fail on their own while
//      the model's holistic verdict says the render works: a style rule or a
//      motion artifact the frames do not show (a fixed caption box called
//      "scaling", a hand called "fused" that is intact, the same picture scored
//      0 and 2 artifact fails on two runs), and the rubric's 3 s hook window.
//
// The calibrated rule, applied only to the native ship gate:
//
//   • `style.timing-hook-first-3s` is capped at warn (the prompt encodes the
//     rubric's 3 s window; it never decided a labeled render on its own).
//   • `style.rule-violation` and `vision.ai-artifacts` keep a `fail` only when
//     the model's own `overall_verdict` is `fail`; otherwise they are capped at
//     warn as unconfirmed detail calls.
//   • Structural catches keep their `fail` regardless: brief drift, register
//     miss, an undelivered mechanism, a broken body arc or closer. These are the
//     audit's highest-value true positives (undelivered payoff, missing brief
//     pose, register mismatch).
//   • The verdict is `fail` when any finding (deterministic or full-video) is a
//     `fail`, or the model's holistic verdict is `fail`; `warn` when the
//     full-video pass produced no usable result (inconclusive); else `pass`.
//     Warns stay in the report, the repair plan and the scorecard's `repair`
//     verdict; they no longer block ship on their own.
//
// `RALPHY_EVAL_STRICT_RUBRIC=1` (strict-rubric.ts) restores the previous
// aggregation: no caps and the `score()` verdict. The inconclusive guard (a
// missing full-video result can never pass) is a bug fix and holds in both.

import type { Finding, Severity, Verdict } from "./types.js";

/** Recorded in `scoring.aggregation` when the calibrated rule decided the verdict. */
export const FULL_VIDEO_AGGREGATION = "full-video-calibrated-583";
/** Recorded in `scoring.aggregation` when the generic `score()` verdict decided it. */
export const SCORE_AGGREGATION = "score";

/** The rubric's 3 s hook window, scored inside the full-video prompt. */
export const HOOK_WINDOW_CATEGORY = "style.timing-hook-first-3s";

/** Detail sub-checks whose `fail` needs the model's holistic `fail` to stand. */
export const DETAIL_CATEGORIES: readonly string[] = ["style.rule-violation", "vision.ai-artifacts"];

const CAP_NOTE_HOOK =
  "Capped at warn (#583): the 3 s hook window is advisory on the full-video gate.";
const CAP_NOTE_DETAIL =
  "Capped at warn (#583): a detail fail not confirmed by the model's overall verdict.";

/**
 * Apply the #583 severity caps to the findings of ONE full-video pass. Pure:
 * returns new objects, never mutates the input. `overallVerdict` is the model's
 * own `overall_verdict` for the same pass (null when unparsed).
 */
export function calibrateFullVideoFindings(
  findings: Finding[],
  overallVerdict: Verdict | null | undefined,
): Finding[] {
  return findings.map((f) => {
    if (f.severity !== "fail") return f;
    if (f.category === HOOK_WINDOW_CATEGORY) return capped(f, CAP_NOTE_HOOK);
    if (DETAIL_CATEGORIES.includes(f.category) && overallVerdict !== "fail") return capped(f, CAP_NOTE_DETAIL);
    return f;
  });
}

function capped(f: Finding, note: string): Finding {
  return { ...f, severity: "warn" as Severity, fixHint: `${note} ${f.fixHint}`.trim() };
}

export interface FullVideoVerdictInput {
  /** Every finding in the report (deterministic, keyframe and full-video), already calibrated. */
  findings: Finding[];
  /** True when the full-video pass returned a parsed result. False on an error or unparseable output. */
  fullVideoParsed: boolean;
  /** The model's holistic `overall_verdict` (null when unparsed). */
  overallVerdict: Verdict | null | undefined;
}

export interface FullVideoVerdict {
  verdict: Verdict;
  reason: string;
}

/**
 * The calibrated native-gate verdict (#583). Pure. See the module header for
 * the rule and docs/research/gate-audit-2026-10.md for the agreement table.
 */
export function fullVideoVerdict(input: FullVideoVerdictInput): FullVideoVerdict {
  const fails = input.findings.filter((f) => f.severity === "fail");
  if (fails.length > 0) {
    const cats = [...new Set(fails.map((f) => f.category))].slice(0, 4).join(", ");
    return { verdict: "fail", reason: `blocking finding(s): ${cats}` };
  }
  if (input.overallVerdict === "fail") {
    return { verdict: "fail", reason: "the full-video model's holistic verdict is fail" };
  }
  if (!input.fullVideoParsed) {
    return { verdict: "warn", reason: "the full-video pass returned no usable result (inconclusive)" };
  }
  return { verdict: "pass", reason: "no blocking finding; warns are repair notes" };
}

/**
 * Inconclusive guard for the strict (`score()`) path: a native gate whose
 * full-video pass produced no usable result can never read as `pass`.
 */
export function guardInconclusive(verdict: Verdict, fullVideoParsed: boolean): Verdict {
  return !fullVideoParsed && verdict === "pass" ? "warn" : verdict;
}
