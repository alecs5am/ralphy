// Cross-batch similarity math (#529) — cli/lib/eval/batch-variance.ts.
//
// Two fixture batches: one deliberately-samey (shared openers + identical
// skeleton + clustered lengths + one caption formula → FAILS) and one varied
// (distinct openers, orders, lengths → PASSES clean). Pure — no fs, no env.
//
// English-only on disk.

import { describe, test, expect } from "bun:test";
import { scoreBatchVariance, type BatchUnitInput } from "../../cli/lib/eval/batch-variance.js";

// A deliberately-samey batch: every item opens the same way, same skeleton,
// near-identical length, same caption formula. This is the template-fingerprint
// the gate exists to catch.
function sameyBatch(): BatchUnitInput[] {
  const opener = "The best way to grow your channel fast is to post daily and stay consistent";
  return Array.from({ length: 6 }, (_, i) => ({
    id: `samey-${i}`,
    text: `# Intro\n\n${opener}. ${"Filler sentence here. ".repeat(20 + (i % 2))}\n\n## Tips\n\nMore filler.\n\n## FAQ\n\nQ and A filler.`,
    sections: ["intro", "tips", "faq"],
    captionFormula: "word-by-word",
  }));
}

// A varied batch: distinct openers, distinct skeletons, spread lengths, mixed
// caption formulas.
function variedBatch(): BatchUnitInput[] {
  return [
    {
      id: "v-0",
      text: "# Why speed wins\n\nMost creators obsess over quality when raw volume is what moves the needle early. " + "word ".repeat(120),
      sections: ["why", "how", "example"],
      captionFormula: "word-by-word",
    },
    {
      id: "v-1",
      text: "# A question for you\n\nEver wonder why some accounts blow up overnight? It is rarely luck. " + "word ".repeat(400),
      sections: ["hook", "story", "lesson", "cta"],
      captionFormula: "phrase-chunks",
    },
    {
      id: "v-2",
      text: "# Ninety percent quit\n\nHere is a stat that stops people: nine in ten quit before month three. " + "word ".repeat(220),
      sections: ["stat", "reason", "fix"],
      captionFormula: "keyword-punch",
    },
    {
      id: "v-3",
      text: "# The boring truth\n\nContrary to the gurus, there is no hack. The boring routine is the whole game. " + "word ".repeat(700),
      sections: ["claim", "evidence", "counter", "close", "faq"],
      captionFormula: "full-line",
    },
  ];
}

describe("batch-variance similarity gate", () => {
  test("a deliberately-samey batch FAILS with vary-X findings", () => {
    const res = scoreBatchVariance(sameyBatch());
    const cats = res.findings.map((f) => f.category);
    const fails = res.findings.filter((f) => f.severity === "fail");
    // Shared openers + identical skeleton both fire as fails.
    expect(fails.length).toBeGreaterThan(0);
    expect(cats).toContain("structure.batch-variance");
    // Uniform caption formula (editor-owned) fires too.
    expect(cats).toContain("captions.batch-variance");
    // The similarity metrics reflect the sameness.
    expect(res.metrics.maxOpeningOverlap).toBeGreaterThanOrEqual(0.6);
    expect(res.metrics.largestCaptionShare).toBe(1);
  });

  test("a varied batch PASSES clean (no findings)", () => {
    const res = scoreBatchVariance(variedBatch());
    expect(res.findings).toEqual([]);
  });

  test("a batch of one cannot cluster", () => {
    const res = scoreBatchVariance([{ id: "solo", text: "# Solo\n\nJust one item.", captionFormula: "word-by-word" }]);
    expect(res.findings).toEqual([]);
    expect(res.metrics.items).toBe(1);
  });

  test("structure.batch-variance routes to scenarist, captions.batch-variance to editor", async () => {
    const { classifyFindingOwner } = await import("../../cli/lib/repair.js");
    expect(classifyFindingOwner("structure.batch-variance")).toBe("scenarist");
    expect(classifyFindingOwner("captions.batch-variance")).toBe("editor");
  });
});
