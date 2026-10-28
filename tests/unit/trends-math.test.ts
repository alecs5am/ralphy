import { describe, expect, test } from "bun:test";
import {
  DAY_MS,
  HOUR_MS,
  MATURITY_PRIORS,
  SCALE_FLOOR,
  checkpointFor,
  cohortFallbacks,
  cohortKey,
  composite,
  creatorBaseline,
  isRising,
  lengthBandFor,
  maturity,
  median,
  metricScore,
  momentum,
  multiplierBand,
  outlierLabel,
  project,
  refitMaturity,
  robustScale,
  rollingWindow,
  shrink,
  sizeBandFor,
  truncateCodePoints,
  valueAtAge,
} from "../../cli/lib/trends/math.js";

const tiktok = MATURITY_PRIORS.tiktok;

describe("maturity curve", () => {
  test("TikTok prior reproduces the research anchor points", () => {
    expect(maturity(24, tiktok)).toBeCloseTo(0.33, 2);
    expect(maturity(72, tiktok)).toBeCloseTo(0.75, 2);
    expect(maturity(168, tiktok)).toBeCloseTo(0.97, 2);
  });

  test("is monotone, zero at birth, and bounded by 1", () => {
    expect(maturity(0, tiktok)).toBe(0);
    let previous = 0;
    for (const hours of [1, 6, 24, 48, 96, 400, 2000]) {
      const value = maturity(hours, tiktok);
      expect(value).toBeGreaterThan(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  test("YouTube and Instagram use the tau 96 h, k 1.0 assumption", () => {
    expect(MATURITY_PRIORS.youtube).toMatchObject({ tauHours: 96, k: 1, basis: "prior" });
    expect(maturity(96, MATURITY_PRIORS.instagram)).toBeCloseTo(1 - Math.exp(-1), 6);
  });
});

describe("projection", () => {
  test("divides by maturity and refuses snapshots younger than 6 h", () => {
    expect(project(1000, 5.9, tiktok)).toBeNull();
    expect(project(1000, 72, tiktok)!).toBeCloseTo(1000 / maturity(72, tiktok), 6);
  });

  test("floors maturity at 10% so very young snapshots cannot explode", () => {
    const young = { tauHours: 1000, k: 1, basis: "prior" as const, n: 0 };
    expect(maturity(6, young)).toBeLessThan(0.1);
    expect(project(500, 6, young)).toBe(5000);
  });
});

describe("checkpoint buckets", () => {
  const at = 1_800_000_000_000;
  test.each([
    [2, "h0-6"],
    [6, "h6-24"],
    [23.9, "h6-24"],
    [30, "d1-2"],
    [50, "d2-3"],
    [100, "d3-7"],
    [200, "d7-14"],
    [400, "d14-28"],
    [700, "d28"],
  ] as const)("%s h old lands in %s", (hours, checkpoint) => {
    expect(checkpointFor(hours * HOUR_MS, at)).toEqual({ checkpoint, bucketSeq: 0 });
  });

  test("monthly buckets after 56 days number the month", () => {
    expect(checkpointFor(57 * DAY_MS, at)).toEqual({ checkpoint: "monthly", bucketSeq: 1 });
    expect(checkpointFor(87 * DAY_MS, at)).toEqual({ checkpoint: "monthly", bucketSeq: 2 });
  });

  test("an unknown post time buckets by the UTC day of observation", () => {
    expect(checkpointFor(null, at)).toEqual({ checkpoint: "undated", bucketSeq: Math.floor(at / DAY_MS) });
    expect(checkpointFor(null, at + 1000).bucketSeq).toBe(checkpointFor(null, at).bucketSeq);
  });
});

describe("robust baseline", () => {
  const members = [10, 11, 12, 13, 14, 15].map((x, index) => ({ postedAt: index * DAY_MS, key: `v${index}`, x: { views: x } }));

  test("median, MAD scale, and the 0.25 floor", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(robustScale([5, 5, 5, 5], 5)).toBe(SCALE_FLOOR);
    expect(robustScale([1, 2, 3, 4, 5], 3)).toBeCloseTo(1.4826, 4);
  });

  test("the rolling window is leave-one-out and only looks backwards", () => {
    const window = rollingWindow(members, { postedAt: 3 * DAY_MS, key: "v3" }, 30);
    expect(window.map((member) => member.key)).toEqual(["v2", "v1", "v0"]);
    expect(rollingWindow(members, { postedAt: 10 * DAY_MS, key: "new" }, 2).map((member) => member.key)).toEqual(["v5", "v4"]);
  });

  test("creator baseline skips members without the metric", () => {
    const baseline = creatorBaseline([...members, { postedAt: 9, key: "z", x: { views: null } }], "views");
    expect(baseline).toEqual({ median: 12.5, scale: expect.any(Number), n: 6 });
  });

  test("shrinkage pulls small creators toward the cohort (n0 = 5)", () => {
    expect(shrink(10, 5, 6)).toBe(8);
    expect(shrink(10, 95, 0)).toBeCloseTo(9.5, 6);
    expect(shrink(null, 0, 6)).toBe(6);
    expect(shrink(10, 3, null)).toBe(10);
  });
});

describe("scores and labels", () => {
  test("multiplier is exp of the log gap and z divides by the scale", () => {
    const score = metricScore(Math.log1p(10_000), Math.log1p(1_000), 0.5);
    expect(score.multiplier).toBeCloseTo(10, 1);
    expect(score.z).toBeCloseTo(Math.log(10) / 0.5, 1);
  });

  test("composite renormalizes weights over exposed metrics", () => {
    expect(composite("tiktok", { views: 2, shares: 2, saves: 2, comments: 2 })).toBeCloseTo(2, 9);
    expect(composite("youtube", { views: 3 })).toBe(3);
    expect(composite("tiktok", { views: 1, shares: 3 })).toBeCloseTo((0.55 * 1 + 0.2 * 3) / 0.75, 9);
    expect(composite("instagram", {})).toBeNull();
  });

  test("labels need a non-thin, non-provisional baseline", () => {
    const base = { thin: false, provisional: false };
    expect(outlierLabel({ ...base, viewsMultiplier: 12, viewsZ: 1 })).toBe("breakout");
    expect(outlierLabel({ ...base, viewsMultiplier: 6, viewsZ: 2.5 })).toBe("outlier");
    expect(outlierLabel({ ...base, viewsMultiplier: 6, viewsZ: 1.5 })).toBe("strong");
    expect(outlierLabel({ ...base, viewsMultiplier: 3.2, viewsZ: 0.5 })).toBe("strong");
    expect(outlierLabel({ ...base, viewsMultiplier: 1, viewsZ: 0 })).toBe("normal");
    expect(outlierLabel({ ...base, viewsMultiplier: 0.3, viewsZ: -2 })).toBe("under");
    expect(outlierLabel({ thin: true, provisional: false, viewsMultiplier: 50, viewsZ: 9 })).toBeNull();
    expect(outlierLabel({ thin: false, provisional: true, viewsMultiplier: 50, viewsZ: 9 })).toBeNull();
  });

  test("display bands match the competitor convention", () => {
    expect([0.5, 2, 4, 8, 20, 80].map(multiplierBand)).toEqual(["under 1x", "1-3x", "3-5x", "5-10x", "10-50x", "50x+"]);
  });
});

describe("momentum and same-age interpolation", () => {
  test("growth beyond what the curve expects reads as rising", () => {
    const earlier = { ageHours: 12, value: 1_000 };
    const expected = { ageHours: 36, value: Math.round(1_000 * maturity(36, tiktok) / maturity(12, tiktok)) };
    expect(Math.abs(momentum(earlier, expected, tiktok)!)).toBeLessThan(0.01);
    const hot = momentum(earlier, { ageHours: 36, value: 10_000 }, tiktok)!;
    expect(hot).toBeGreaterThan(0.3);
    expect(isRising(hot, 36)).toBe(true);
    expect(isRising(hot, 8 * 24)).toBe(false);
    expect(momentum(earlier, { ageHours: 12, value: 5 }, tiktok)).toBeNull();
  });

  test("valueAtAge log-interpolates between bracketing snapshots", () => {
    const series = [{ ageHours: 10, value: 99 }, { ageHours: 30, value: 9_999 }];
    expect(valueAtAge(series, 20)!).toBeCloseTo((Math.log(100) + Math.log(10_000)) / 2, 6);
    expect(valueAtAge(series, 10)).toBeCloseTo(Math.log(100), 6);
    expect(valueAtAge(series, 40)).toBeNull();
  });
});

describe("maturity refit", () => {
  test("recovers the generating curve from longitudinal ratios", () => {
    const truth = { tauHours: 40, k: 1.3, basis: "prior" as const, n: 0 };
    const pairs = Array.from({ length: 300 }, (_, index) => {
      const ageHours = 6 + (index % 60) * 3;
      return { ageHours, ratio: maturity(ageHours, truth) };
    });
    const fit = refitMaturity(pairs)!;
    expect(fit.basis).toBe("refit");
    expect(Math.abs(fit.tauHours - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(fit.k - 1.3)).toBeLessThanOrEqual(0.06);
    expect(refitMaturity(pairs.slice(0, 50))).toBeNull();
  });
});

describe("bands, cohort keys, and text", () => {
  test("length and size bands", () => {
    expect([5_000, 12_000, 30_000, 45_000, 75_000, 120_000, 400_000].map(lengthBandFor)).toEqual(["le7s", "8-15s", "16-30s", "31-60s", "61-90s", "91-180s", "gt180s"]);
    expect(lengthBandFor(null)).toBeNull();
    expect([10, 5_000, 50_000, 200_000, 700_000, 3_000_000].map(sizeBandFor)).toEqual(["seed", "nano", "micro", "mid", "macro", "mega"]);
  });

  test("cohort key and its shrinkage fallbacks", () => {
    const key = cohortKey({ platform: "tiktok", niche: "ai-tools", formatKey: "tiktok-video", lengthBand: "16-30s", sizeBand: null });
    expect(key).toBe("tiktok|ai-tools|tiktok-video|16-30s|unknown");
    expect(cohortFallbacks(key)).toEqual([
      key,
      "tiktok|ai-tools|tiktok-video|*|unknown",
      "tiktok|ai-tools|tiktok-video|*|*",
      "tiktok|*|tiktok-video|*|*",
    ]);
  });

  test("truncation never splits a surrogate pair", () => {
    const text = "ab\u{1F600}\u{1F600}cd";
    expect(truncateCodePoints(text, 3)).toBe("ab\u{1F600}");
    expect(JSON.parse(JSON.stringify(truncateCodePoints(text, 3)))).toBe("ab\u{1F600}");
    expect(text.slice(0, 3)).not.toBe(truncateCodePoints(text, 3));
  });
});
