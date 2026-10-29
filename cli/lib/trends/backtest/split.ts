// Time-based train / held-out split (#578, dataset spec "Splits and
// versioning": weeks 1-4 tune, weeks 5-6 held out).
//
// The split is over DECISION time. A decision's outcome arrives later (28
// days for a breakout label), so the decision span is the data span minus
// the outcome horizon, and every decision whose outcome is not known by the
// data end is `outside`. Purged (default): a training decision whose outcome
// becomes known at or after the held-out start is dropped, so tuning never
// sees anything observed during the held-out period. The purge costs one
// outcome horizon of training data; `purge: false` keeps those decisions
// for exploratory runs and is recorded in the report.

import { DAY_MS } from "../math.js";

export interface TimeSplit {
  periodStart: number;
  /** First decision instant of the held-out period. */
  testStart: number;
  /** Data end: outcomes must be known by then. */
  periodEnd: number;
  trainFraction: number;
  horizonDays: number;
  purge: boolean;
}

export type SplitSide = "train" | "test" | "purged" | "outside";

/** Default: the last third of the decision span is held out (weeks 5-6 of 6). */
export const DEFAULT_TRAIN_FRACTION = 4 / 6;
export const DEFAULT_HORIZON_DAYS = 28;

export function makeSplit(periodStart: number, periodEnd: number, options: { trainFraction?: number; testStart?: number; horizonDays?: number; purge?: boolean } = {}): TimeSplit {
  if (!(periodEnd > periodStart)) throw new Error("split period must have positive length");
  const trainFraction = options.trainFraction ?? DEFAULT_TRAIN_FRACTION;
  const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const decisionEnd = Math.max(periodStart + 1, periodEnd - horizonDays * DAY_MS);
  const testStart = options.testStart ?? Math.round(periodStart + (decisionEnd - periodStart) * trainFraction);
  return { periodStart, periodEnd, testStart, trainFraction, horizonDays, purge: options.purge ?? true };
}

/** Which side a decision falls on, given when its outcome becomes known. */
export function sideOf(split: TimeSplit, decisionAt: number, outcomeAt: number): SplitSide {
  if (decisionAt < split.periodStart || outcomeAt > split.periodEnd || decisionAt >= split.periodEnd) return "outside";
  if (decisionAt >= split.testStart) return "test";
  if (!split.purge) return "train";
  return outcomeAt < split.testStart ? "train" : "purged";
}

export function splitSummary(split: TimeSplit) {
  return {
    periodStart: new Date(split.periodStart).toISOString(),
    testStart: new Date(split.testStart).toISOString(),
    periodEnd: new Date(split.periodEnd).toISOString(),
    trainDays: Math.round(((split.testStart - split.periodStart) / DAY_MS) * 10) / 10,
    testDecisionDays: Math.round(((split.periodEnd - split.horizonDays * DAY_MS - split.testStart) / DAY_MS) * 10) / 10,
    purge: split.purge,
  };
}
