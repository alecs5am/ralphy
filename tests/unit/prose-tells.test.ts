// AI-tell prose lint (#529) — cli/lib/eval/prose-tells.ts + prose-tells-rules.ts.
//
// Every rule in the pack FIRES on a violating fixture (its own `examples.bad`)
// and clean prose PASSES. Plus: the paragraph-rhythm check, the caption routing,
// and the article-gate wiring (the `text-ai-tell` criterion registers and routes
// to the scenarist). Pure — no fs/env mutation except the isolated wiring check.
//
// English-only on disk (the detected words are English by design — the on-disk
// rule is about authored content, and these are detection patterns).

import { describe, test, expect } from "bun:test";
import { lintProse } from "../../cli/lib/eval/prose-tells.js";
import { RULES_EN } from "../../cli/lib/eval/prose-tells-rules.js";
import { classifyFindingOwner } from "../../cli/lib/repair.js";
import { hasWorkspaceValidator } from "../../cli/lib/eval/workspace-evaluators.js";
import { registerBuiltinWorkspaceValidators } from "../../cli/lib/eval/workspace-criteria.js";

// Pad a fixture to clear the density floor (40 words) so density rules can fire.
function pad(bad: string): string {
  return `${bad} ${"filler word here to reach the density measurement floor. ".repeat(10)}`;
}

describe("prose-tells rule pack", () => {
  test("EVERY rule fires on its own violating example", () => {
    for (const rule of RULES_EN) {
      const body = pad(rule.examples.bad);
      const res = lintProse(body, "prose");
      const hit = res.findings.some((f) => f.category === `structure.ai-tell.${rule.id}`);
      expect(hit, `rule "${rule.id}" should fire on its bad example`).toBe(true);
    }
  });

  test("EVERY rule passes on its own clean example", () => {
    for (const rule of RULES_EN) {
      const body = pad(rule.examples.good);
      const res = lintProse(body, "prose");
      const hit = res.findings.some((f) => f.category === `structure.ai-tell.${rule.id}`);
      expect(hit, `rule "${rule.id}" should NOT fire on its good example`).toBe(false);
    }
  });

  test("clean human prose produces zero findings", () => {
    const clean = [
      "The parser reads one token at a time.",
      "When it hits something unexpected, it stops and reports the line.",
      "",
      "We tried two designs. The first buffered the whole file and broke on big inputs. The second streams, so memory stays flat even on a huge log. That is the one we kept.",
      "",
      "You can pass a handler to recover instead of aborting. Most callers do not bother, and that is fine.",
    ].join("\n");
    const res = lintProse(clean, "prose");
    expect(res.findings).toEqual([]);
  });

  test("uniform paragraph rhythm fires the rhythm check", () => {
    // Five paragraphs, all ~10 words — metronomic (low coefficient of variation).
    const uniform = Array.from({ length: 5 }, (_, i) =>
      `Paragraph number ${i} has exactly ten plain words in it here.`,
    ).join("\n\n");
    const res = lintProse(uniform, "prose");
    expect(res.findings.some((f) => f.category === "structure.ai-tell.paragraph-rhythm")).toBe(true);
  });

  test("caption target routes findings to captions.ai-tell (editor)", () => {
    const res = lintProse(pad("It's not just a caption, it's a vibe."), "captions");
    const negp = res.findings.find((f) => f.category.startsWith("captions.ai-tell"));
    expect(negp).toBeDefined();
    expect(classifyFindingOwner(negp!.category)).toBe("editor");
  });

  test("prose findings route to the scenarist", () => {
    const res = lintProse(pad("It's not just a song, it's a statement."), "prose");
    const negp = res.findings.find((f) => f.category.startsWith("structure.ai-tell"));
    expect(negp).toBeDefined();
    expect(classifyFindingOwner(negp!.category)).toBe("scenarist");
  });
});

describe("article-gate wiring (#526 seam)", () => {
  test("the text-ai-tell criterion registers alongside the #526 text validators", () => {
    registerBuiltinWorkspaceValidators();
    expect(hasWorkspaceValidator("text-ai-tell")).toBe(true);
    // The #526 siblings still register (didn't clobber the seam).
    expect(hasWorkspaceValidator("text-keyword-coverage")).toBe(true);
    expect(hasWorkspaceValidator("text-structure")).toBe(true);
  });
});
