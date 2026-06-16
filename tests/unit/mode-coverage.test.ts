// Content-mode coverage tests — issue #413.
//
// #413 establishes WHICH #412 modes are SUPPORTED (the prerequisite for #417's
// guideline-coverage check). This file pins three things:
//
//   (1) the supported/gap call on the registry is internally consistent
//       (`supported === implementationUnit.kind !== "none"`, and the implied
//       gates + Unit shape are present);
//   (2) every SUPPORTED mode has ≥1 ROUTING fixture (a representative utterance
//       classifies to that mode via classifyContentMode, non-ambiguous) and ≥1
//       PRODUCTION-PLAN fixture (the brief → buildProductionPlan yields the
//       right mode + a schema-valid plan with the expected format + required
//       artifacts);
//   (3) a META-TEST: every mode in the registry appears in the coverage matrix
//       doc (docs/content-mode-coverage.md), so the matrix can't silently drift.
//
// English-only on disk: every fixture utterance / brief is plain English. The
// plan builder's LLM enrichment is STUBBED (no live network, no mock.module on a
// shared lib — #072), mirroring tests/unit/production-plan.test.ts.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  allContentModes,
  supportedContentModes,
  unsupportedContentModes,
  isModeSupported,
  classifyContentMode,
  getContentMode,
  CONTENT_MODES_LIST,
  type ContentMode,
} from "../../cli/lib/content-modes.js";
import { buildProductionPlan } from "../../cli/lib/plan/build.js";
import {
  parseProductionPlan,
  type LlmEnrichment,
} from "../../cli/lib/schemas/production-plan.js";
import type { TemplateFormat } from "../../cli/lib/schemas/template.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const COVERAGE_DOC = path.join(REPO, "docs", "content-mode-coverage.md");

// Canned enrichment — what a stubbed LLM returns. Valid against
// LlmEnrichmentSchema. The builder falls back to heuristics if omitted, but a
// fixed payload keeps scene/duration deterministic across modes.
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

// ─── Per-supported-mode fixtures (routing utterance + plan brief) ────────────
//
// One representative utterance per SUPPORTED mode that classifies confidently to
// it, plus the expected media format the plan resolves to (the mode's primary
// format when no template candidate is supplied — freeform plan). Reuses the
// #412 happy-path vocabulary where it fits.

interface ModeFixture {
  /** Routing utterance — must classify to `mode`, non-ambiguous. */
  utterance: string;
  /** Plan brief — must yield `mode` + this format. (Often the same string.) */
  brief: string;
  /** The media format the plan must resolve to (mode primaryFormat, freeform). */
  expectedFormat: TemplateFormat;
}

const FIXTURES: Record<string, ModeFixture> = {
  "product-shot": {
    utterance: "I need a clean studio product shot on a white background",
    brief: "a clean studio product shot of my bottle on a white background",
    expectedFormat: "image",
  },
  "lifestyle-scene": {
    utterance: "make a lifestyle scene of my bottle in a real life kitchen",
    brief: "a lifestyle scene photo of my product in a real life setting",
    expectedFormat: "image",
  },
  "closeup-product-with-person": {
    utterance: "a close up of a person holding the product in hand",
    brief: "a closeup of a person holding the product in hand, macro shot",
    expectedFormat: "image",
  },
  "pinterest-pin": {
    utterance: "design a pinterest pin for my recipe",
    brief: "a vertical pinterest pin for my recipe with a headline",
    expectedFormat: "image",
  },
  "hero-banner": {
    utterance: "make a website hero banner with a headline",
    brief: "a wide website hero banner with a headline and our product",
    expectedFormat: "poster",
  },
  "social-carousel": {
    utterance: "I want a 10 slide instagram carousel swipe-through",
    brief: "a 10 slide instagram carousel swipe-through deck about our launch",
    expectedFormat: "carousel",
  },
  "ad-creative-pack": {
    utterance: "make me a meta ads creative matrix, an ad pack for my brand",
    brief: "a meta ads creative matrix / ad pack for acme.example.com cold traffic",
    expectedFormat: "fb-creative",
  },
  "conceptual-product": {
    utterance: "a surreal product concept, an artistic key visual",
    brief: "a surreal conceptual product key visual for the campaign",
    expectedFormat: "image",
  },
  restyle: {
    utterance: "restyle this image as a watercolor, style transfer it",
    brief: "restyle this image as a watercolor, style transfer the look",
    expectedFormat: "image",
  },
  "ugc-review": {
    utterance: "make a ugc review talking head testimonial of my serum",
    brief: "a ugc review talking head testimonial of my serum",
    expectedFormat: "video",
  },
  "tutorial-ugc": {
    utterance: "a how-to tutorial video showing step by step how to use it",
    brief: "a how-to tutorial video showing step by step how to use my app",
    expectedFormat: "video",
  },
  "unboxing-ugc": {
    utterance: "an unboxing video opening the box of my new gadget",
    brief: "an unboxing video opening the box of my new gadget",
    expectedFormat: "video",
  },
  "tv-ad": {
    utterance: "produce a polished tv commercial spot for the brand",
    brief: "a polished tv commercial spot, a broadcast ad for the brand",
    expectedFormat: "video",
  },
  "cartoon-animation": {
    utterance: "make a 2d cartoon animation short with my mascot",
    brief: "a 2d cartoon animation short with my mascot",
    expectedFormat: "video",
  },
  "motion-design": {
    utterance: "a kinetic motion graphics piece with logo animation",
    brief: "a kinetic motion graphics piece with logo animation",
    expectedFormat: "motion-design",
  },
  "typography-animation": {
    utterance: "a kinetic typography animated text lyric piece",
    brief: "a kinetic typography animated text lyric piece",
    expectedFormat: "motion-design",
  },
  "podcast-video": {
    utterance: "turn this podcast into a long form faceless video, audio to video",
    brief: "turn this podcast into a long form faceless video, audio to video",
    expectedFormat: "video",
  },
  "infographic-animation": {
    utterance: "make an animated infographic data visualization video of these stats",
    brief: "make an animated infographic data visualization video of these stats",
    expectedFormat: "motion-design",
  },
};

// ─── (1) Registry supported/gap call is internally consistent ────────────────

describe("content-mode supported flag (#413)", () => {
  test("supported === (implementationUnit.kind !== 'none') for every mode", () => {
    for (const e of allContentModes()) {
      expect(e.supported).toBe(e.implementationUnit.kind !== "none");
      // isModeSupported() agrees with the field.
      expect(isModeSupported(e.mode)).toBe(e.supported);
    }
  });

  test("every SUPPORTED mode also carries gates + a Unit shape (the full bar)", () => {
    for (const e of supportedContentModes()) {
      expect(e.qualityGates.length).toBeGreaterThan(0);
      expect(e.expectedUnitShape.format.length).toBeGreaterThan(0);
      expect(e.expectedUnitShape.minMedia).toBeGreaterThanOrEqual(1);
      // A supported mode names at least one concrete artifact (skill / guideline / verb).
      const u = e.implementationUnit;
      const hasArtifact = u.skills.length > 0 || u.guidelines.length > 0 || u.cliVerbs.length > 0;
      expect(hasArtifact).toBe(true);
    }
  });

  test("every GAP mode names a recommended unit and ships kind 'none'", () => {
    for (const e of unsupportedContentModes()) {
      expect(e.implementationUnit.kind).toBe("none");
      expect((e.implementationUnit.recommendedUnit ?? "").length).toBeGreaterThan(0);
    }
  });

  test("the supported set matches the documented 18/3 split", () => {
    expect(supportedContentModes().length).toBe(18);
    expect(unsupportedContentModes().length).toBe(3);
    const gaps = unsupportedContentModes().map((e) => e.mode).sort();
    expect(gaps).toEqual(["amazon-listing", "personal-clipper", "virtual-model-tryout"]);
  });

  test("isModeSupported is false for an unknown mode string", () => {
    expect(isModeSupported("not-a-real-mode")).toBe(false);
  });

  test("classifyContentMode still recognizes UNSUPPORTED modes (recognize, don't promise)", () => {
    // The classifier must NAME the intent even when it is a deferred gap.
    expect(classifyContentMode("cut my stream into shorts, extract the best moments clips").mode).toBe(
      "personal-clipper",
    );
    expect(classifyContentMode("design my amazon listing images with an infographic listing").mode).toBe(
      "amazon-listing",
    );
    expect(classifyContentMode("show my jacket on a virtual model, a try-on render").mode).toBe(
      "virtual-model-tryout",
    );
  });
});

// ─── (2a) Every supported mode has a ROUTING fixture ─────────────────────────

describe("every SUPPORTED mode has a routing fixture (#413)", () => {
  test("a fixture exists for every supported mode (no supported mode is uncovered)", () => {
    const supported = supportedContentModes().map((e) => e.mode).sort();
    const covered = Object.keys(FIXTURES).sort();
    expect(covered).toEqual(supported);
  });

  for (const mode of supportedContentModes().map((e) => e.mode)) {
    test(`routing: "${FIXTURES[mode]!.utterance}" → ${mode}`, () => {
      const r = classifyContentMode(FIXTURES[mode]!.utterance);
      expect(r.mode).toBe(mode);
      expect(r.ambiguous).toBe(false);
      expect(r.confidence).toBeGreaterThan(0);
    });
  }
});

// ─── (2b) Every supported mode has a PRODUCTION-PLAN fixture ─────────────────

describe("every SUPPORTED mode has a production-plan fixture (#413)", () => {
  const enrich = async () => cannedEnrichment();

  for (const entry of supportedContentModes()) {
    const mode = entry.mode;
    const fx = FIXTURES[mode]!;
    test(`plan: "${fx.brief}" → mode ${mode}, format ${fx.expectedFormat}, schema-valid`, async () => {
      // Freeform (no candidates) → format resolves to the mode's primary format.
      const { plan } = await buildProductionPlan(
        { projectId: `plan-${mode}`, brief: fx.brief },
        { candidates: [], enrich },
      );
      // Schema-valid (the issue acceptance: production plan output is valid).
      expect(() => parseProductionPlan(plan)).not.toThrow();
      // Right mode, confidently classified.
      expect(plan.contentMode.mode).toBe(mode);
      expect(plan.contentMode.ambiguous).toBe(false);
      // Sensible format = the mode's primary format (freeform fallback).
      expect(plan.formatTemplate.format).toBe(fx.expectedFormat);
      // Required artifacts: the mode's requiredInputs flow onto the plan.
      expect(plan.requiredRefs).toEqual(getContentMode(mode)!.requiredInputs);
      // A video/motion-design plan carries a video model; a still plan does not.
      const isVideo = fx.expectedFormat === "video" || fx.expectedFormat === "motion-design";
      expect(plan.modelStack.some((m) => m.role === "video")).toBe(isVideo);
      // Cost range is coherent.
      expect(plan.estimate.costHighUsd).toBeGreaterThanOrEqual(plan.estimate.costLowUsd);
    });
  }

  test("a craft-overlay mode records its overlay on the plan", async () => {
    // ad-creative-pack → fb-creatives overlay (CRAFT_OVERLAY_BY_MODE in build.ts).
    const { plan } = await buildProductionPlan(
      { projectId: "plan-overlay", brief: FIXTURES["ad-creative-pack"]!.brief },
      { candidates: [], enrich },
    );
    expect(plan.contentMode.mode).toBe("ad-creative-pack");
    expect(plan.craftOverlay).toContain("fb-creatives");
  });
});

// ─── (3) META-TEST: every mode appears in the coverage matrix doc ────────────

describe("coverage matrix doc completeness (#413)", () => {
  const doc = fs.readFileSync(COVERAGE_DOC, "utf8");

  test("every mode in the registry is listed in docs/content-mode-coverage.md", () => {
    const missing: string[] = [];
    for (const mode of CONTENT_MODES_LIST) {
      // The matrix lists each mode as a `code-fenced` row label.
      if (!doc.includes(`\`${mode}\``)) missing.push(mode);
    }
    expect(
      missing,
      `coverage matrix is missing rows for: ${JSON.stringify(missing)}. ` +
        `Every #412 mode MUST appear in docs/content-mode-coverage.md so the matrix can't drift from the registry.`,
    ).toEqual([]);
  });

  test("the doc states the supported/gap split that the registry carries", () => {
    expect(doc).toContain("18 supported");
    // Each gap mode is named in the doc.
    for (const e of unsupportedContentModes()) {
      expect(doc).toContain(`\`${e.mode}\``);
    }
  });

  test("the doc carries the do-not-promise-unsupported-modes warning", () => {
    expect(/do not promise|not yet a first-class route|isModeSupported/i.test(doc)).toBe(true);
  });
});
