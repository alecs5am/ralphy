// Low-tech prompt benchmark corpus — issue #430.
//
// The product's real risk is not expert users; it is LOW-TECH users typing
// vague, messy chat prompts and expecting a polished Unit back. This corpus
// pins the EXPECTED routing/planning behavior on a spread of realistic-messy
// prompts so "works for low-tech users" is testable and regression-proof. The
// runner is `tests/unit/low-tech-prompt-benchmark.test.ts` — fully offline +
// deterministic (the plan builder's LLM enrichment is stubbed, no network).
//
// English-only on disk: every utterance is plain English. The "too little
// info" cases use OFF-DOMAIN English strings (an everyday non-content request),
// NOT a foreign-language string — the same low-keyword-score path the
// classifier would hit on a vague brief. See tests/unit/template-suggest.test.ts
// for the worked pattern this mirrors.
//
// ─── Adding a fixture (after a failed real user run) ─────────────────────────
//
// When a real low-tech user prompt mis-routes in production (wrong mode, wrong
// research depth, or a confident route on a vague brief), capture it HERE so it
// can never silently regress:
//
//   1. Add a fixture object below with the user's verbatim (or lightly
//      paraphrased, English) utterance and the CORRECT expected behavior.
//   2. Ground the expected values against the live functions before committing
//      — the quickest way is the probe the test uses:
//        bun -e 'import {classifyContentMode} from "./cli/lib/content-modes.js";
//                import {chooseResearchDepth} from "./cli/lib/research-bootstrap.js";
//                const u="<your utterance>";
//                console.log(classifyContentMode(u), chooseResearchDepth({brief:u}));'
//   3. For a CLEAR-INTENT prompt set `expectedMode` + `expectedResearchDepth`
//      and leave `ambiguous` falsy. For a VAGUE / too-little-info prompt set
//      `ambiguous: true` (or `expectedMode: null`) — the contract is the agent
//      must NOT confidently mis-route a vague prompt, so we assert it stays
//      ambiguous rather than asserting a specific wrong mode.
//   4. If the fixture reveals a GENUINE classifier gap (a clear intent that
//      mis-routes), do NOT tune the classifier to make the fixture pass — that
//      is a separate product issue. Either pick a clearer utterance that
//      reflects the real intent, or file the gap. This corpus DOCUMENTS current
//      behavior and guards it; it is not where classifier behavior is changed.
//
// `expectedFormat` / `expectedRequiredRefs` are derived from the registry by the
// test (a clear-intent fixture's plan resolves to the mode's primary format +
// the mode's requiredInputs), so they are NOT duplicated per fixture here —
// only the load-bearing low-tech assertions (mode, depth, ambiguity) live below.

import type { ContentMode } from "../../cli/lib/content-modes.js";
import type { ResearchDepth } from "../../cli/lib/content-modes.js";

/** A coarse category label for the corpus breakdown (reporting / coverage). */
export type FixtureCategory =
  | "product-shot"
  | "ad-creative-pack"
  | "carousel"
  | "image-pack"
  | "podcast-clip"
  | "ugc-review"
  | "tutorial"
  | "unboxing"
  | "still-other"
  | "video-other"
  | "motion"
  | "ambiguous"
  | "too-little-info";

export interface LowTechFixture {
  /** Stable fixture id (kebab-case, unique). */
  id: string;
  /** The low-detail / messy user utterance (plain English). */
  utterance: string;
  /** Coarse category for the corpus breakdown. */
  category: FixtureCategory;
  /**
   * Expected content mode for a CLEAR-INTENT fixture. `null` for too-little-info
   * fixtures where nothing should score (the classifier returns mode null).
   * Ignored when `ambiguous` is true and you only care that it stayed ambiguous.
   */
  expectedMode: ContentMode | null;
  /** Expected deterministic research-depth decision (chooseResearchDepth). */
  expectedResearchDepth: ResearchDepth;
  /**
   * True when this is an intentionally AMBIGUOUS / too-little-info prompt: the
   * contract is the agent must NOT confidently mis-route it. The test asserts
   * `classification.ambiguous === true` (i.e. mode null, below the confidence
   * floor, or a tie) rather than a specific mode.
   */
  ambiguous?: boolean;
  /** Optional note explaining the fixture's intent / why it's messy. */
  note?: string;
}

// ─── Clear-intent low-tech prompts (messy phrasing, recognizable intent) ──────
//
// Each utterance is what a low-tech user might actually type — lowercase,
// abbreviations ("plz", "ig", "fb"), filler — but still carries enough of a mode
// keyword that the classifier routes it confidently. expectedMode + depth are
// grounded against the live classifyContentMode / chooseResearchDepth.

const CLEAR_INTENT: LowTechFixture[] = [
  // ── Commercial ads — product-shot ──
  {
    id: "product-shot-white-bg",
    utterance: "white background product shot of my bottle",
    category: "product-shot",
    expectedMode: "product-shot",
    expectedResearchDepth: "none",
    note: "Detail markers + product keyword → confident product-shot, no research trigger.",
  },
  {
    id: "product-shot-pics-plz",
    utterance: "just need a product photo on white background pls",
    category: "product-shot",
    expectedMode: "product-shot",
    expectedResearchDepth: "deep",
    note: "Messy filler ('pls') but 'product photo' keyword lands; short brief escalates depth.",
  },
  {
    id: "product-shot-catalog",
    utterance: "catalog photo of my new mug",
    category: "product-shot",
    expectedMode: "product-shot",
    expectedResearchDepth: "deep",
  },

  // ── Commercial ads — ad-creative-pack ──
  {
    id: "ad-pack-meta-bunch",
    utterance: "make me a bunch of meta ads for my brand",
    category: "ad-creative-pack",
    expectedMode: "ad-creative-pack",
    expectedResearchDepth: "deep",
    note: "'meta ads' keyword; ad-creative-pack defaults to deep research.",
  },
  {
    id: "ad-pack-fb-creatives",
    utterance: "i want a set of ads, fb creatives basically",
    category: "ad-creative-pack",
    expectedMode: "ad-creative-pack",
    expectedResearchDepth: "deep",
  },
  {
    id: "ad-pack-cold-traffic",
    utterance: "performance creatives for my store cold traffic",
    category: "ad-creative-pack",
    expectedMode: "ad-creative-pack",
    expectedResearchDepth: "deep",
  },

  // ── Carousels ──
  {
    id: "carousel-ig",
    utterance: "make me a carousel for ig",
    category: "carousel",
    expectedMode: "social-carousel",
    expectedResearchDepth: "deep",
    note: "Abbreviation 'ig'; 'carousel' keyword still routes confidently.",
  },
  {
    id: "carousel-5-slide-swipe",
    utterance: "5 slide swipe through about my app",
    category: "carousel",
    expectedMode: "social-carousel",
    expectedResearchDepth: "deep",
  },

  // ── Image packs (Amazon listing — the SUPPORTED image-pack mode) ──
  {
    id: "image-pack-amazon-listing",
    utterance: "amazon listing images for my product",
    category: "image-pack",
    expectedMode: "amazon-listing",
    expectedResearchDepth: "deep",
    note: "Amazon image-pack; app-store packs are NOT a first-class mode (see too-little-info).",
  },
  {
    id: "image-pack-amazon-photos",
    utterance: "amazon photos for my listing",
    category: "image-pack",
    expectedMode: "amazon-listing",
    expectedResearchDepth: "deep",
  },

  // ── Podcast clips / audio-to-video ──
  {
    id: "podcast-to-video",
    utterance: "podcast to video plz",
    category: "podcast-clip",
    expectedMode: "podcast-video",
    expectedResearchDepth: "deep",
  },
  {
    id: "podcast-longform-audio",
    utterance: "make a long form video from this audio file",
    category: "podcast-clip",
    expectedMode: "podcast-video",
    expectedResearchDepth: "deep",
  },

  // ── UGC reviews ──
  {
    id: "ugc-review-serum",
    utterance: "ugc review video of my serum",
    category: "ugc-review",
    expectedMode: "ugc-review",
    expectedResearchDepth: "deep",
  },
  {
    id: "ugc-review-honest",
    utterance: "honest review video of my product",
    category: "ugc-review",
    expectedMode: "ugc-review",
    expectedResearchDepth: "deep",
  },

  // ── Tutorials ──
  {
    id: "tutorial-how-to-app",
    utterance: "how to video for my app",
    category: "tutorial",
    expectedMode: "tutorial-ugc",
    expectedResearchDepth: "deep",
  },
  {
    id: "tutorial-step-by-step",
    utterance: "step by step tutorial showing how to use it",
    category: "tutorial",
    expectedMode: "tutorial-ugc",
    expectedResearchDepth: "deep",
  },

  // ── Unboxing ──
  {
    id: "unboxing-gadget",
    utterance: "unboxing video of my gadget",
    category: "unboxing",
    expectedMode: "unboxing-ugc",
    expectedResearchDepth: "deep",
  },

  // ── Other stills ──
  {
    id: "lifestyle-product-kitchen",
    utterance: "lifestyle photo of my product in a kitchen",
    category: "still-other",
    expectedMode: "lifestyle-scene",
    expectedResearchDepth: "quick",
    note: "lifestyle-scene defaults to quick; nothing escalates → stays quick.",
  },
  {
    id: "closeup-holding-product",
    utterance: "closeup of person holding my product",
    category: "still-other",
    expectedMode: "closeup-product-with-person",
    expectedResearchDepth: "deep",
  },
  {
    id: "pinterest-pin-recipe",
    utterance: "pinterest pin for my recipe",
    category: "still-other",
    expectedMode: "pinterest-pin",
    expectedResearchDepth: "deep",
  },
  {
    id: "hero-banner-website",
    utterance: "hero banner for my website",
    category: "still-other",
    expectedMode: "hero-banner",
    expectedResearchDepth: "deep",
  },
  {
    id: "restyle-watercolor",
    utterance: "restyle this photo as a watercolor",
    category: "still-other",
    expectedMode: "restyle",
    expectedResearchDepth: "none",
    note: "restyle defaults to none; detail-ish brief, no trigger → stays none.",
  },
  {
    id: "conceptual-key-visual",
    utterance: "surreal artistic key visual for the campaign",
    category: "still-other",
    expectedMode: "conceptual-product",
    expectedResearchDepth: "deep",
  },
  {
    id: "virtual-model-jacket",
    utterance: "show my jacket on a virtual model",
    category: "still-other",
    expectedMode: "virtual-model-tryout",
    expectedResearchDepth: "deep",
  },

  // ── Other video / motion ──
  {
    id: "tv-ad-brand",
    utterance: "tv commercial for my brand",
    category: "video-other",
    expectedMode: "tv-ad",
    expectedResearchDepth: "deep",
  },
  {
    id: "cartoon-mascot",
    utterance: "make a 2d cartoon animation with my mascot",
    category: "video-other",
    expectedMode: "cartoon-animation",
    expectedResearchDepth: "deep",
  },
  {
    id: "motion-logo-animation",
    utterance: "logo animation",
    category: "motion",
    expectedMode: "motion-design",
    expectedResearchDepth: "deep",
  },
  {
    id: "typography-lyric",
    utterance: "kinetic typography lyric video",
    category: "motion",
    expectedMode: "typography-animation",
    expectedResearchDepth: "none",
    note: "typography-animation defaults to none + the detailed phrase suppresses the low-detail trigger.",
  },
  {
    id: "infographic-stats",
    utterance: "animated infographic of these stats",
    category: "motion",
    expectedMode: "infographic-animation",
    expectedResearchDepth: "deep",
  },
];

// ─── Ambiguous / too-little-info prompts (must NOT confidently mis-route) ─────
//
// The product risk: a low-tech user types a vague one-liner and the agent
// confidently routes it to the WRONG mode + burns paid generation. The contract
// is the agent stays ambiguous (asks a question) instead. These fixtures assert
// `classification.ambiguous === true` (mode null, below the confidence floor, or
// a tie) — NOT a specific mode. Off-domain English strings exercise the same
// low-keyword path without any foreign-language fixture (English-only on disk).

const AMBIGUOUS: LowTechFixture[] = [
  {
    id: "vague-tiktok-about-app",
    utterance: "make me something for tiktok about my app",
    category: "ambiguous",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
    note: "Names a platform + a subject but no content kind — could be ugc / carousel / tutorial.",
  },
  {
    id: "vague-smth-viral",
    utterance: "smth viral",
    category: "ambiguous",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
    note: "A goal, not a content kind. Must ask, not guess.",
  },
  {
    id: "vague-make-a-video",
    utterance: "make me a video",
    category: "ambiguous",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
    note: "Names the format container but no intent — the classic vague ask.",
  },
  {
    id: "vague-something-cool",
    utterance: "make something cool for my socials",
    category: "ambiguous",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
  },
  {
    id: "too-little-need-content",
    utterance: "i need content",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
  },
  {
    id: "too-little-grow-following",
    utterance: "i want to grow my following",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
    note: "A business outcome, no deliverable named.",
  },
  {
    id: "too-little-help-marketing",
    utterance: "help me with my marketing",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
  },
  {
    id: "too-little-any-ideas",
    utterance: "got any ideas for me",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
  },
  {
    id: "app-store-screenshots-unsupported",
    utterance: "app store screenshots for my ios app",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "none",
    ambiguous: true,
    note: "App-store image packs are NOT a first-class mode — must stay ambiguous, not mis-route to amazon-listing.",
  },
  {
    id: "off-domain-printer-toner",
    utterance: "the office printer needs more toner cartridges",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "none",
    ambiguous: true,
    note: "Off-domain English (not a content request at all) — the no-foreign-language stand-in. Nothing scores.",
  },
  {
    id: "off-domain-dentist",
    utterance: "schedule a dentist appointment for next thursday",
    category: "too-little-info",
    expectedMode: null,
    expectedResearchDepth: "deep",
    ambiguous: true,
    note: "Off-domain English. Classifier scores nothing → ambiguous (depth still escalates on word count, which is fine — research can't hurt a non-job).",
  },
];

/** The full benchmark corpus (clear-intent + ambiguous/too-little-info). */
export const LOW_TECH_FIXTURES: LowTechFixture[] = [...CLEAR_INTENT, ...AMBIGUOUS];

/** Clear-intent fixtures (must classify + plan confidently). */
export const CLEAR_INTENT_FIXTURES: LowTechFixture[] = CLEAR_INTENT;

/** Ambiguous / too-little-info fixtures (must stay ambiguous, no confident mis-route). */
export const AMBIGUOUS_FIXTURES: LowTechFixture[] = AMBIGUOUS;
