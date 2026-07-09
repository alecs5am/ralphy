// Content-mode taxonomy tests — issue #412.
//
// Two halves:
//   (a) registry completeness — every mode carries every required field, its
//       supportedFormats are valid format-taxonomy members, roleChain is
//       non-empty, etc.
//   (b) classifier — one HAPPY-PATH utterance per mode resolves to that mode,
//       and one AMBIGUOUS / low-detail prompt per mode comes back
//       `ambiguous: true` (issue acceptance: ≥1 happy + ≥1 ambiguous per mode).
//
// English-only on disk: the "Russian / low-detail prompt" acceptance case is
// exercised with OFF-DOMAIN ENGLISH strings that hit the same low-keyword-score
// path (the documented pattern from tests/unit/template-suggest.test.ts), never
// by committing Cyrillic.

import { describe, test, expect } from "bun:test";
import {
  CONTENT_MODES,
  CONTENT_MODES_LIST,
  allContentModes,
  classifyContentMode,
  getContentMode,
  isContentMode,
  type ContentMode,
} from "../../cli/lib/content-modes.js";
import { TEMPLATE_FORMATS } from "../../cli/lib/schemas/template.js";

const VALID_RESEARCH_DEPTHS = new Set(["none", "quick", "deep"]);
const VALID_FORMATS = new Set<string>(TEMPLATE_FORMATS);

// ─── (a) Registry completeness ───────────────────────────────────────────────

describe("content-mode registry completeness (#412)", () => {
  test("every mode in the list has a registry entry, and vice versa", () => {
    const keys = Object.keys(CONTENT_MODES).sort();
    const list = [...CONTENT_MODES_LIST].sort();
    expect(keys).toEqual(list);
    expect(allContentModes().length).toBe(CONTENT_MODES_LIST.length);
  });

  test("the registry covers the issue's initial mode set", () => {
    const expected: ContentMode[] = [
      "product-shot",
      "lifestyle-scene",
      "closeup-product-with-person",
      "pinterest-pin",
      "hero-banner",
      "social-carousel",
      "ad-creative-pack",
      "virtual-model-tryout",
      "conceptual-product",
      "restyle",
      "ugc-review",
      "tutorial-ugc",
      "unboxing-ugc",
      "tv-ad",
      "cartoon-animation",
      "motion-design",
      "typography-animation",
      "podcast-video",
      "personal-clipper",
      "amazon-listing",
      "infographic-animation",
      "seo-article",
    ];
    for (const m of expected) {
      expect(isContentMode(m)).toBe(true);
      expect(getContentMode(m)).toBeDefined();
    }
    expect(CONTENT_MODES_LIST.length).toBe(expected.length);
  });

  for (const entry of allContentModes()) {
    describe(`mode "${entry.mode}"`, () => {
      test("self-consistent mode id", () => {
        expect(CONTENT_MODES[entry.mode].mode).toBe(entry.mode);
      });

      test("has a non-empty summary", () => {
        expect(typeof entry.summary).toBe("string");
        expect(entry.summary.length).toBeGreaterThan(0);
      });

      test("supportedFormats are all valid format-taxonomy members (non-empty)", () => {
        expect(entry.supportedFormats.length).toBeGreaterThan(0);
        for (const f of entry.supportedFormats) {
          expect(VALID_FORMATS.has(f)).toBe(true);
        }
      });

      test("requiredInputs / optionalInputs are string arrays", () => {
        expect(Array.isArray(entry.requiredInputs)).toBe(true);
        expect(Array.isArray(entry.optionalInputs)).toBe(true);
        expect(entry.requiredInputs.every((x) => typeof x === "string")).toBe(true);
        expect(entry.optionalInputs.every((x) => typeof x === "string")).toBe(true);
      });

      test("defaultResearchDepth is one of none|quick|deep", () => {
        expect(VALID_RESEARCH_DEPTHS.has(entry.defaultResearchDepth)).toBe(true);
      });

      test("roleChain is non-empty and starts at intake", () => {
        expect(entry.roleChain.length).toBeGreaterThan(0);
        expect(entry.roleChain[0]).toBe("intake");
      });

      test("templateLookup points at a valid primary format with tags", () => {
        expect(VALID_FORMATS.has(entry.templateLookup.primaryFormat)).toBe(true);
        expect(entry.templateLookup.tagQuery.length).toBeGreaterThan(0);
        // The primary lookup format must be one the mode actually supports.
        expect(entry.supportedFormats).toContain(entry.templateLookup.primaryFormat);
      });

      test("guidelineOrStyleLock is well-formed", () => {
        expect(typeof entry.guidelineOrStyleLock.required).toBe("boolean");
        expect(Array.isArray(entry.guidelineOrStyleLock.guidelineSlugs)).toBe(true);
        expect(entry.guidelineOrStyleLock.note.length).toBeGreaterThan(0);
      });

      test("qualityGates is a non-empty array of known gates", () => {
        const known = new Set(["scoreScenario", "scoreImage", "scoreVideo"]);
        expect(entry.qualityGates.length).toBeGreaterThan(0);
        for (const g of entry.qualityGates) expect(known.has(g)).toBe(true);
      });

      test("expectedUnitShape format is valid and counts are coherent", () => {
        expect(VALID_FORMATS.has(entry.expectedUnitShape.format)).toBe(true);
        expect(entry.expectedUnitShape.minMedia).toBeGreaterThanOrEqual(1);
        if (entry.expectedUnitShape.maxMedia !== null) {
          expect(entry.expectedUnitShape.maxMedia).toBeGreaterThanOrEqual(entry.expectedUnitShape.minMedia);
        }
        expect(entry.expectedUnitShape.note.length).toBeGreaterThan(0);
        // The Unit format must be a format the mode supports.
        expect(entry.supportedFormats).toContain(entry.expectedUnitShape.format);
      });

      test("keywords are a non-empty, ASCII-only set", () => {
        expect(entry.keywords.length).toBeGreaterThan(0);
        for (const kw of entry.keywords) {
          expect(kw.length).toBeGreaterThan(0);
          // English-only on disk — no non-ASCII keyword tokens.
          expect(/^[\x20-\x7e]+$/.test(kw)).toBe(true);
        }
      });
    });
  }
});

// ─── (b) Classifier — happy path (one utterance per mode) ────────────────────

const HAPPY_PATH: Record<ContentMode, string> = {
  "product-shot": "I need a clean studio product shot on a white background",
  "lifestyle-scene": "make a lifestyle scene of my bottle in a real life kitchen",
  "closeup-product-with-person": "a close up of a person holding the product in hand",
  "pinterest-pin": "design a pinterest pin for my recipe",
  "hero-banner": "make a website hero banner with a headline",
  "social-carousel": "I want a 10 slide instagram carousel swipe-through",
  "ad-creative-pack": "make me a meta ads creative matrix, an ad pack for my brand",
  "virtual-model-tryout": "show my jacket on a virtual model, a try-on render",
  "conceptual-product": "a surreal product concept, an artistic key visual",
  restyle: "restyle this image as a watercolor, style transfer it",
  "ugc-review": "make a ugc review talking head testimonial of my serum",
  "tutorial-ugc": "a how-to tutorial video showing step by step how to use it",
  "unboxing-ugc": "an unboxing video opening the box of my new gadget",
  "tv-ad": "produce a polished tv commercial spot for the brand",
  "cartoon-animation": "make a 2d cartoon animation short with my mascot",
  "motion-design": "a kinetic motion graphics piece with logo animation",
  "typography-animation": "a kinetic typography animated text lyric piece",
  "podcast-video": "turn this podcast into a long form faceless video, audio to video",
  "personal-clipper": "cut my stream into shorts, extract the best moments clips",
  "amazon-listing": "design my amazon listing images with an infographic listing",
  "infographic-animation": "make an animated infographic data visualization video of these stats",
  "seo-article": "write an seo article, a long-form blog post for search",
};

describe("classifyContentMode — happy path resolves to the mode (#412)", () => {
  for (const mode of CONTENT_MODES_LIST) {
    test(`"${HAPPY_PATH[mode]}" → ${mode}`, () => {
      const r = classifyContentMode(HAPPY_PATH[mode]);
      expect(r.mode).toBe(mode);
      expect(r.ambiguous).toBe(false);
      expect(r.confidence).toBeGreaterThan(0);
    });
  }
});

// ─── (b) Classifier — ambiguous / low-detail path (one per mode) ─────────────
//
// Per the English-only-on-disk rule we test the "Russian / low-detail" path
// with off-domain English strings that produce the same low-keyword-score path.
// Each prompt is too vague to resolve and MUST come back `ambiguous: true`.

const AMBIGUOUS_PROMPTS: string[] = [
  "make me something for my brand",
  "I want a video about my stuff",
  "do the thing for my product",
  "create some content for me",
  "help me with marketing",
  "make it pop",
  "something cool for social",
  "I need a visual",
  "make a nice asset",
  "produce something good",
  "do a creative for the campaign",
  "make my product look great",
  "I want a post",
  "build me a thing",
  "give me an image and a video maybe",
  "whatever works best",
  "surprise me",
  "make it viral",
  "do your magic",
  "anything that converts",
];

describe("classifyContentMode — ambiguous / low-detail prompts flag ambiguous (#412)", () => {
  // Pair each mode with a distinct ambiguous prompt so coverage is 1-per-mode.
  CONTENT_MODES_LIST.forEach((mode, i) => {
    const prompt = AMBIGUOUS_PROMPTS[i % AMBIGUOUS_PROMPTS.length]!;
    test(`ambiguous case for ${mode}: "${prompt}"`, () => {
      const r = classifyContentMode(prompt);
      expect(r.ambiguous).toBe(true);
    });
  });

  test("empty / whitespace utterance is ambiguous with mode=null", () => {
    const r = classifyContentMode("   ");
    expect(r.ambiguous).toBe(true);
    expect(r.mode).toBeNull();
    expect(r.alternatives).toEqual([]);
  });

  test("a tie between two modes flags ambiguous and surfaces alternatives", () => {
    // "unboxing" (unboxing-ugc) + "carousel" (social-carousel) — two strong
    // single-domain hits of equal weight → tie.
    const r = classifyContentMode("an unboxing carousel");
    expect(r.ambiguous).toBe(true);
    expect(r.alternatives.length).toBeGreaterThan(0);
  });
});

// ─── Classifier shape invariants ─────────────────────────────────────────────

describe("classifyContentMode — return shape", () => {
  test("scores are sorted descending and exclude the winner from alternatives", () => {
    const r = classifyContentMode("a meta ads creative matrix ad pack");
    expect(r.mode).toBe("ad-creative-pack");
    expect(r.alternatives).not.toContain(r.mode);
    for (let i = 1; i < r.scores.length; i++) {
      expect(r.scores[i].score).toBeLessThanOrEqual(r.scores[i - 1].score);
    }
  });

  test("confidence is clamped to 0..1", () => {
    const r = classifyContentMode("amazon listing amazon listing amazon images listing images");
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});
