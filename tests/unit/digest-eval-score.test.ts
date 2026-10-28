// #557 — contact-sheet digest eval scorer (pure).

import { describe, test, expect } from "bun:test";
import {
  aggregateScores,
  classAt,
  cutCountScore,
  cutF1,
  ctaScore,
  jaccard,
  paretoFront,
  scoreAnswer,
  wordF1,
  type DigestEvalAnswer,
  type DigestEvalLabels,
} from "../../cli/lib/eval/digest-eval.js";

describe("digest eval scoring primitives", () => {
  test("cutF1 matches one-to-one within the tolerance", () => {
    expect(cutF1([], [])).toBe(1);
    expect(cutF1([1], [])).toBe(0);
    expect(cutF1([1.0, 5.0], [1.3, 5.6])).toBeCloseTo(0.5, 5);
    // Two predictions near one true cut: only one can match.
    expect(cutF1([2.0, 2.1], [2.05])).toBeCloseTo(2 / 3, 5);
  });

  test("cutCountScore is relative to the true count", () => {
    expect(cutCountScore(4, 4)).toBe(1);
    expect(cutCountScore(3, 4)).toBe(0.75);
    expect(cutCountScore(2, 0)).toBe(0);
  });

  test("wordF1 ignores case, punctuation, and non-Latin tokens", () => {
    expect(wordF1("Hello, World!", "hello world")).toBe(1);
    expect(wordF1(null, null)).toBe(1);
    expect(wordF1("hello", null)).toBe(0);
    expect(wordF1("one two", "one three")).toBeCloseTo(0.5, 5);
  });

  test("jaccard, classAt, ctaScore", () => {
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(["a", "b"], ["b"])).toBe(0.5);
    const segs = [{ startSec: 0, class: "talking_head" as const }, { startSec: 5, class: "graphics" as const }];
    expect(classAt(4.5, segs)).toBe("talking_head");
    expect(classAt(5.5, segs)).toBe("graphics");
    expect(ctaScore({ present: true, startSec: 10 }, null)).toBeNull();
    expect(ctaScore({ present: false, startSec: null }, { present: false, startSec: null })).toBe(1);
    expect(ctaScore({ present: true, startSec: 12 }, { present: true, startSec: 10 })).toBe(0.5);
  });

  test("paretoFront keeps non-dominated points", () => {
    const pts = [
      { id: "a", quality: 0.9, cost: 10 },
      { id: "b", quality: 0.8, cost: 12 },
      { id: "c", quality: 0.95, cost: 20 },
    ];
    expect(paretoFront(pts).map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("scoreAnswer", () => {
  const labels: DigestEvalLabels = {
    cuts: [2.5],
    transitions: ["hard_cut"],
    textGrid: [true, true, false, false],
    classGrid: ["talking_head", "talking_head", "b_roll", "b_roll"],
    hook: { face: true, textOverlay: true, cutInFirst2s: false, openingClass: "talking_head", text: "big claim" },
    cta: null,
  };
  const answer: DigestEvalAnswer = {
    cuts: [2.4],
    transitions: ["hard_cut"],
    textIntervals: [[0, 2]],
    segments: [{ startSec: 0, class: "talking_head" }, { startSec: 2.4, class: "b_roll" }],
    hook: { face: true, textOverlay: true, cutInFirst2s: false, openingClass: "talking_head", text: "Big claim!" },
    cta: { present: false, startSec: null },
  };

  test("a correct answer scores 1 everywhere and cta is excluded when unlabeled", () => {
    const s = scoreAnswer(answer, labels);
    expect(s).toEqual({ cutF1: 1, cutCount: 1, text: 1, hookText: 1, hook: 1, transitions: 1, shotClass: 1, cta: null });
    expect(aggregateScores([s]).overall).toBe(1);
  });

  test("aggregate ignores nulls per key", () => {
    const a = scoreAnswer({ ...answer, cuts: [] }, labels);
    const agg = aggregateScores([a, scoreAnswer(answer, labels)]);
    expect(agg.cutF1).toBe(0.5);
    expect(agg.cta).toBeNull();
  });
});
