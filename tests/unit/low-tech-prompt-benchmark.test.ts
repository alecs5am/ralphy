// Low-tech prompt benchmark — issue #430.
//
// Runs the deterministic classifier + research-depth decision + production-plan
// builder over the low-detail/messy prompt corpus in
// tests/fixtures/low-tech-prompts.ts, so "works for low-tech users" is testable
// and regression-proof. Two contracts:
//
//   (1) CLEAR-INTENT messy prompts route CONFIDENTLY: classifyContentMode →
//       expectedMode (non-ambiguous), chooseResearchDepth → expectedResearchDepth,
//       and buildProductionPlan → the mode's primary format + the mode's
//       requiredInputs as requiredRefs + a schema-valid plan + a non-empty
//       deterministic firstCheckpoint.
//   (2) AMBIGUOUS / too-little-info prompts must NOT confidently mis-route:
//       classification.ambiguous === true (mode null, below the confidence
//       floor, or a tie). The agent should ask, not guess.
//
// Fully offline + deterministic: the plan builder's LLM enrichment is STUBBED
// (cannedEnrichment) exactly like tests/unit/mode-coverage.test.ts — no live
// network, no mock.module on a shared lib. English-only on disk: every fixture
// utterance is plain English (too-little-info cases use off-domain English, not
// a foreign-language string).

import { describe, test, expect } from "bun:test";
import {
  classifyContentMode,
  getContentMode,
} from "../../cli/lib/content-modes.js";
import { chooseResearchDepth } from "../../cli/lib/research-bootstrap.js";
import { buildProductionPlan } from "../../cli/lib/plan/build.js";
import {
  parseProductionPlan,
  type LlmEnrichment,
} from "../../cli/lib/schemas/production-plan.js";
import {
  LOW_TECH_FIXTURES,
  CLEAR_INTENT_FIXTURES,
  AMBIGUOUS_FIXTURES,
} from "../fixtures/low-tech-prompts.js";

// Canned enrichment — what a stubbed LLM returns (valid against
// LlmEnrichmentSchema). Mirrors mode-coverage.test.ts. The builder uses the
// DETERMINISTIC fallback when `enrich` is omitted; passing a stub keeps the plan
// fixed AND exercises the enrich path. The firstCheckpoint here is non-empty,
// but the deterministic fallback (heuristicEnrichment) also yields a non-empty
// firstCheckpoint — we assert NON-EMPTY, not a specific LLM string.
function cannedEnrichment(over: Partial<LlmEnrichment> = {}): LlmEnrichment {
  return {
    targetAudienceLanguage: "English",
    register: "",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor -> wait for go",
    vibe: "",
    ...over,
  };
}

// ─── Corpus sanity ────────────────────────────────────────────────────────────

describe("low-tech corpus shape (#430)", () => {
  test("corpus has >= 30 fixtures with unique ids", () => {
    expect(LOW_TECH_FIXTURES.length).toBeGreaterThanOrEqual(30);
    const ids = LOW_TECH_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("corpus carries both clear-intent AND ambiguous/too-little-info fixtures", () => {
    expect(CLEAR_INTENT_FIXTURES.length).toBeGreaterThan(0);
    expect(AMBIGUOUS_FIXTURES.length).toBeGreaterThan(0);
    expect(LOW_TECH_FIXTURES.length).toBe(
      CLEAR_INTENT_FIXTURES.length + AMBIGUOUS_FIXTURES.length,
    );
  });

  test("covers the issue's named categories", () => {
    const cats = new Set(LOW_TECH_FIXTURES.map((f) => f.category));
    for (const required of [
      "product-shot",
      "ad-creative-pack",
      "carousel",
      "image-pack",
      "podcast-clip",
      "ugc-review",
      "tutorial",
      "ambiguous",
      "too-little-info",
    ]) {
      expect(cats.has(required as never)).toBe(true);
    }
  });
});

// ─── (1) Clear-intent messy prompts route + plan confidently ──────────────────

describe("clear-intent low-tech prompts route confidently (#430)", () => {
  const enrich = async () => cannedEnrichment();

  for (const fx of CLEAR_INTENT_FIXTURES) {
    test(`[${fx.id}] "${fx.utterance}" → ${fx.expectedMode}`, async () => {
      const mode = fx.expectedMode!;
      const modeEntry = getContentMode(mode);
      expect(modeEntry, `fixture names unknown mode ${mode}`).toBeDefined();

      // Classification: confident, non-ambiguous, correct mode.
      const cls = classifyContentMode(fx.utterance);
      expect(cls.mode).toBe(mode);
      expect(cls.ambiguous).toBe(false);
      expect(cls.confidence).toBeGreaterThan(0);

      // Research depth: the deterministic decision matches the fixture.
      const depth = chooseResearchDepth({ brief: fx.utterance });
      expect(depth.depth).toBe(fx.expectedResearchDepth);

      // Production plan (freeform, no template candidates → format falls back to
      // the mode's primary format). Schema-valid + right mode + right format +
      // mode's requiredInputs flow onto requiredRefs + a non-empty checkpoint.
      const { plan } = await buildProductionPlan(
        { projectId: `lowtech-${fx.id}`, brief: fx.utterance },
        { candidates: [], enrich },
      );
      expect(() => parseProductionPlan(plan)).not.toThrow();
      expect(plan.contentMode.mode).toBe(mode);
      expect(plan.contentMode.ambiguous).toBe(false);
      // expectedFormat is DERIVED from the registry (the mode's primary format),
      // so it can't drift from a hardcoded fixture copy.
      expect(plan.formatTemplate.format).toBe(modeEntry!.templateLookup.primaryFormat);
      // expectedRequiredRefs == the mode's requiredInputs (also registry-derived).
      expect(plan.requiredRefs).toEqual(modeEntry!.requiredInputs);
      // The deterministic firstCheckpoint fallback is always non-empty.
      expect(plan.firstCheckpoint.length).toBeGreaterThan(0);
      // Cost range is coherent.
      expect(plan.estimate.costHighUsd).toBeGreaterThanOrEqual(plan.estimate.costLowUsd);
    });
  }
});

// ─── (2) Ambiguous / too-little-info prompts must NOT mis-route ───────────────

describe("ambiguous / too-little-info prompts stay ambiguous (#430)", () => {
  const enrich = async () => cannedEnrichment();

  for (const fx of AMBIGUOUS_FIXTURES) {
    test(`[${fx.id}] "${fx.utterance}" is not confidently routed`, async () => {
      const cls = classifyContentMode(fx.utterance);
      // The contract: the agent must NOT confidently mis-route a vague prompt.
      // Either the classifier flagged it ambiguous, OR nothing scored (mode null).
      expect(cls.ambiguous).toBe(true);
      if (fx.expectedMode === null) {
        expect(cls.mode).toBeNull();
      }

      // The deterministic research-depth decision still resolves (and the
      // bootstrap can't crash on a vague brief).
      const depth = chooseResearchDepth({ brief: fx.utterance });
      expect(depth.depth).toBe(fx.expectedResearchDepth);

      // The plan still builds and stays schema-valid, and crucially carries the
      // ambiguous flag forward so a downstream gate can refuse to spend.
      const { plan } = await buildProductionPlan(
        { projectId: `lowtech-${fx.id}`, brief: fx.utterance },
        { candidates: [], enrich },
      );
      expect(() => parseProductionPlan(plan)).not.toThrow();
      expect(plan.contentMode.ambiguous).toBe(true);
      if (fx.expectedMode === null) {
        expect(plan.contentMode.mode).toBeNull();
      }
    });
  }
});
