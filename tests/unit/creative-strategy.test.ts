// #456 — creative-strategy schema + the variant-matrix bridge + winner feedback.

import { describe, test, expect } from "bun:test";
import {
  parseCreativeStrategy,
  parseWinnerFeedback,
  strategyToVariantMatrix,
  applyWinnerFeedback,
  VARIANT_AXIS_KINDS,
  type CreativeStrategy,
} from "../../cli/lib/schemas/creative-strategy.js";
import { parseVariantMatrix } from "../../cli/lib/schemas/variant-matrix.js";

/** A minimal but realistic strategy for an ad-creative-pack experiment. */
function sampleStrategy(): CreativeStrategy {
  return parseCreativeStrategy({
    baseId: "spring-2026-001",
    contentMode: "ad-creative-pack",
    audience: [{ label: "cold-traffic devs", painPoint: "slow OCR", platform: "meta" }],
    offer: "fastest OCR API",
    hypothesis: "a problem-mirror hook beats a benefit hook for cold devs",
    angle: "the API that just works",
    hook: "still pasting screenshots into ChatGPT?",
    proof: "2x faster in the benchmark",
    objection: "we already have an OCR vendor",
    cta: "start free",
    variantAxes: [
      { kind: "hook", hypothesis: "problem-mirror > benefit", slots: 3 },
      { kind: "style", slots: 2, options: ["graphic", "real-people"] },
    ],
    successCriteria: ["scoreImage >= 70"],
  });
}

describe("creative-strategy schema", () => {
  test("fills defaults and round-trips", () => {
    const s = parseCreativeStrategy({ baseId: "x" });
    expect(s.version).toBe(1);
    expect(s.contentMode).toBe("");
    expect(s.audience).toEqual([]);
    expect(s.variantAxes).toEqual([]);
    expect(s.successCriteria).toEqual([]);
    expect(s.history).toEqual([]);
    expect(typeof s.generatedAt).toBe("string");

    // Round-trip a fully-populated strategy unchanged.
    const full = sampleStrategy();
    expect(parseCreativeStrategy(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });

  test("a variant axis defaults to 2 slots and a closed-vocabulary kind", () => {
    const s = parseCreativeStrategy({ variantAxes: [{ kind: "cta" }] });
    expect(s.variantAxes[0]!.slots).toBe(2);
    expect(s.variantAxes[0]!.options).toEqual([]);
  });

  test("rejects an axis kind outside the closed vocabulary", () => {
    expect(() => parseCreativeStrategy({ variantAxes: [{ kind: "not-an-axis" }] })).toThrow();
  });

  test("covers the five required content modes (#456 §5)", () => {
    // The schema accepts any mode string; assert the 5 required ids round-trip.
    for (const mode of [
      "ad-creative-pack",
      "ugc-review",
      "social-carousel",
      "product-shot",
      "personal-clipper",
    ]) {
      expect(parseCreativeStrategy({ contentMode: mode }).contentMode).toBe(mode);
    }
  });
});

describe("winner-feedback schema", () => {
  test("fills defaults and round-trips", () => {
    const f = parseWinnerFeedback({ baseId: "x" });
    expect(f.version).toBe(1);
    expect(f.champion).toBe("");
    expect(f.losers).toEqual([]);
    expect(f.nextBatchSuggestions).toEqual([]);
  });

  test("rejects a losing rationale with an out-of-vocabulary axis", () => {
    expect(() =>
      parseWinnerFeedback({ losers: [{ variantId: "v1", axis: "nope" }] }),
    ).toThrow();
  });
});

describe("strategyToVariantMatrix (the #421 bridge)", () => {
  test("emits an object that parses through the REAL VariantMatrixSchema", () => {
    const matrix = strategyToVariantMatrix(sampleStrategy(), 0.04);
    // The output must round-trip through the actual #421 schema unchanged.
    expect(parseVariantMatrix(matrix)).toEqual(matrix);
  });

  test("each strategy axis becomes a matrix axis with generated slot names", () => {
    const matrix = strategyToVariantMatrix(sampleStrategy());
    expect(matrix.baseId).toBe("spring-2026-001");
    expect(matrix.axes.map((a) => a.axis)).toEqual(["hook", "style"]);

    const hookAxis = matrix.axes.find((a) => a.axis === "hook")!;
    expect(hookAxis.slots).toEqual([
      "spring-2026-001-hook-1",
      "spring-2026-001-hook-2",
      "spring-2026-001-hook-3",
    ]);
    expect(hookAxis.hypothesis).toBe("problem-mirror > benefit");

    // An axis with no per-axis hypothesis inherits the strategy hypothesis.
    const styleAxis = matrix.axes.find((a) => a.axis === "style")!;
    expect(styleAxis.slots).toHaveLength(2);
    expect(styleAxis.hypothesis).toBe(
      "a problem-mirror hook beats a benefit hook for cold devs",
    );
  });

  test("rolls expected cost up from per-slot cost", () => {
    const matrix = strategyToVariantMatrix(sampleStrategy(), 0.1);
    // 3 hook slots + 2 style slots = 5 slots × $0.10 = $0.50.
    expect(matrix.totalExpectedCostUsd).toBeCloseTo(0.5, 5);
    expect(matrix.axes.find((a) => a.axis === "hook")!.expectedCostUsd).toBeCloseTo(0.3, 5);
  });

  test("an empty strategy yields a valid empty matrix", () => {
    const matrix = strategyToVariantMatrix(parseCreativeStrategy({}));
    expect(parseVariantMatrix(matrix)).toEqual(matrix);
    expect(matrix.axes).toEqual([]);
    expect(matrix.totalExpectedCostUsd).toBe(0);
  });
});

describe("applyWinnerFeedback (the #456 §4 loop)", () => {
  test("prepends feedback to history without mutating the input", () => {
    const before = sampleStrategy();
    const feedback = parseWinnerFeedback({
      baseId: "spring-2026-001",
      champion: "spring-2026-001-hook-1",
      winningAxis: "hook",
      winRationale: "problem-mirror lifted 0-3s retention",
      losers: [{ variantId: "spring-2026-001-hook-2", axis: "hook", rationale: "weak open" }],
      nextBatchSuggestions: ["try a UGC-style hook next"],
    });

    const after = applyWinnerFeedback(before, feedback);

    // Pure: input untouched.
    expect(before.history).toEqual([]);
    // Feedback recorded most-recent-first.
    expect(after.history).toHaveLength(1);
    expect(after.history[0]!.champion).toBe("spring-2026-001-hook-1");

    // Winning axis's hypothesis annotated as confirmed.
    const hookAxis = after.variantAxes.find((a) => a.kind === "hook")!;
    expect(hookAxis.hypothesis).toBe("confirmed: problem-mirror lifted 0-3s retention");
    // Non-winning axis untouched.
    const styleAxis = after.variantAxes.find((a) => a.kind === "style")!;
    expect(styleAxis.hypothesis).toBe(before.variantAxes.find((a) => a.kind === "style")!.hypothesis);

    // Next-batch suggestions folded into success criteria (additive, deduped).
    expect(after.successCriteria).toContain("scoreImage >= 70");
    expect(after.successCriteria).toContain("try a UGC-style hook next");

    // The updated strategy still parses through the schema.
    expect(parseCreativeStrategy(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });

  test("multiple feedback rounds stack newest-first", () => {
    let s = sampleStrategy();
    s = applyWinnerFeedback(s, parseWinnerFeedback({ champion: "a" }));
    s = applyWinnerFeedback(s, parseWinnerFeedback({ champion: "b" }));
    expect(s.history.map((h) => h.champion)).toEqual(["b", "a"]);
  });
});

describe("VARIANT_AXIS_KINDS", () => {
  test("carries the seven axes #456 names", () => {
    expect(VARIANT_AXIS_KINDS).toEqual([
      "hook",
      "persona",
      "style",
      "cta",
      "first-frame",
      "music",
      "platform",
    ]);
  });
});
