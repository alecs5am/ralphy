// Content-mode taxonomy — the routing-vocabulary layer (issue #412).
//
// A `content_mode` is a PRODUCTION-INTENT label. It sits ONE layer ABOVE the
// media `format` taxonomy (`video | image | carousel | fb-creative |
// motion-design | poster | sticker-pack`, defined in `cli/lib/schemas/template.ts`).
//
//   format  = the media CONTAINER the deliverable ships as.
//   mode    = WHAT the user is trying to produce + HOW the agent routes it
//             (which role chain, what inputs to demand, how deep to research,
//             which template lookup to run, which quality gates to enforce,
//             what the finished Unit should look like).
//
// Modes do NOT redefine formats — every `supportedFormats` entry is a member of
// the format taxonomy. The agent emits a `content_mode` FIRST (via the fast
// `classifyContentMode()` pre-classifier below or by reading the registry),
// then uses the mode's `templateLookup` to match a template by format + tags,
// then loads any matching craft-overlay skill / guideline on top.
//
// This file is the machine-readable source of truth. The agent-facing prose
// reference is `docs/content-modes.md`. Downstream issues (#413/#414/#417/#410)
// build on this registry.

import { TEMPLATE_FORMATS, type TemplateFormat } from "./schemas/template.js";
import { type RefType } from "./schemas/ref-pack.js";

/** Production-intent labels. New modes are additive — append, never repurpose. */
export const CONTENT_MODES_LIST = [
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
] as const;

export type ContentMode = (typeof CONTENT_MODES_LIST)[number];

/** How deep the agent researches before drafting prompts for this mode. */
export type ResearchDepth = "none" | "quick" | "deep";

/**
 * The expected shape of the finished deliverable (the library Unit, #063/#069):
 * which format it ships as and roughly how many media files it carries.
 */
export interface ExpectedUnitShape {
  /** The Unit's container format (a member of the format taxonomy). */
  format: TemplateFormat;
  /** Lower bound on ordered media files in the Unit. */
  minMedia: number;
  /** Upper bound on ordered media files in the Unit (null = open-ended / N). */
  maxMedia: number | null;
  /** One-line description of what the Unit is. */
  note: string;
}

/**
 * How the agent finds a template for this mode: which format(s) to query and
 * which tag keywords to rank against (`ralphy template suggest "<brief>"
 * --format <f>`). `tagQuery` mirrors the vocabulary the template library uses
 * for this kind of content.
 */
export interface TemplateLookup {
  /** Primary format to pass to `ralphy template suggest --format <f>`. */
  primaryFormat: TemplateFormat;
  /** Tag keywords to rank against in the library. */
  tagQuery: string[];
}

/**
 * Whether this mode requires a locked guideline / style before generation, and
 * which guideline slugs apply when known (slugs live in `guidelines/`).
 */
export interface GuidelineOrStyleLock {
  /** True when a style/guideline MUST be locked before generation. */
  required: boolean;
  /** Known guideline slugs that commonly apply (may be empty). */
  guidelineSlugs: string[];
  /** One-line rationale for the lock decision. */
  note: string;
}

/** Which kind of artifact a mode's implementation unit is. */
export type ImplementationUnitKind =
  | "skill" // a craft-overlay SKILL.md under .agents/skills/
  | "guideline-route" // a `ralphy generate` route locked by an existing guideline + the art-director playbook
  | "render-engine" // the HyperFrames render engine + editor playbook (motion / typography)
  | "none"; // no concrete unit yet — a deferred gap

/**
 * How a mode is implemented today: the concrete artifact the agent reaches for
 * (a craft-overlay skill, a guideline-locked generate route, the render engine),
 * or `none` when the mode is a deferred gap. This is the "default route" half of
 * the #413 supported bar — `supported` is derived from `kind !== "none"`.
 *
 * #058 (content-niche → format-template conversion) will replace the `skill`
 * units with published format templates; the matrix in
 * `docs/content-mode-coverage.md` tracks that migration.
 */
export interface ImplementationUnit {
  /** What kind of artifact backs this mode. */
  kind: ImplementationUnitKind;
  /** Craft-overlay skill slugs that supply the know-how (`.agents/skills/<slug>/`). */
  skills: string[];
  /** Guideline slugs the route locks (subset of the live `guidelines/` set). */
  guidelines: string[];
  /** The `ralphy` verb(s) the route runs through. */
  cliVerbs: string[];
  /** One-line citation of the existing artifact this maps onto. */
  note: string;
  /** For a deferred gap: the recommended unit to author (per #058). Empty when not a gap. */
  recommendedUnit?: string;
}

export interface ContentModeEntry {
  /** Canonical mode id. */
  mode: ContentMode;
  /** One-line, agent-facing summary of the production intent. */
  summary: string;
  /**
   * Whether this mode is a FIRST-CLASS route (#413). A mode is `supported` iff
   * it has a concrete implementation unit (`implementationUnit.kind !== "none"`)
   * AND quality gates AND a Unit shape — the latter two are present for every
   * mode, so in practice `supported === (implementationUnit.kind !== "none")`.
   * The invariant is asserted in `tests/unit/mode-coverage.test.ts`.
   *
   * `classifyContentMode` still returns UNSUPPORTED modes (the agent must be
   * able to recognize the intent); `supported` gates what the agent may PROMISE
   * and what #417 checks guideline coverage for. Never expose an unsupported
   * mode name to the user as a deliverable — route to the closest supported
   * mode or say it is not yet a first-class route (see `docs/content-modes.md`).
   */
  supported: boolean;
  /** The concrete artifact backing this mode today (or a deferred gap). */
  implementationUnit: ImplementationUnit;
  /** Formats this mode can ship as. First = the default. All ∈ format taxonomy. */
  supportedFormats: TemplateFormat[];
  /** Inputs the agent MUST have before generation (else ask / refuse). */
  requiredInputs: string[];
  /**
   * OPTIONAL ref-pack types (#426) the mode's reference pack should carry before
   * prompt fan-out — the typed counterpart to the free-text `requiredInputs`.
   * Populated only for high-frequency commercial modes where a missing ref type
   * is a known quality risk. The fidelity gate (#422) + plan grader own
   * ENFORCEMENT; this field is just the declaration `missingRequiredRefTypes()`
   * reports against. Absent = the mode declares no required pack types.
   */
  requiredRefTypes?: RefType[];
  /** Inputs that improve the result but are not blocking. */
  optionalInputs: string[];
  /** Default research depth before drafting prompts. */
  defaultResearchDepth: ResearchDepth;
  /** Ordered role chain (playbook order) the request flows through. */
  roleChain: string[];
  /** How to find a template for this mode. */
  templateLookup: TemplateLookup;
  /** Style/guideline lock requirement. */
  guidelineOrStyleLock: GuidelineOrStyleLock;
  /**
   * OPTIONAL golden-benchmark-set slug (#419) this mode is measured against — a
   * `benchmarks/<slug>/` set of good/acceptable/bad examples + pass/fail
   * features. Populated for modes with a curated set; absent = none authored yet.
   * Resolved via `benchmarkSetForMode()`; cited in the STYLE_LOCK scaffold + the
   * eval/council scoring context.
   */
  benchmarkSet?: string;
  /** Quality gates that must pass before the Unit is formed (AGENTS #4). */
  qualityGates: string[];
  /** What the finished Unit looks like. */
  expectedUnitShape: ExpectedUnitShape;
  /**
   * Deterministic keyword/phrase cues the classifier scores against. English
   * only (English-only-on-disk). Multi-word phrases score 2× a single token.
   */
  keywords: string[];
}

// ─── The registry ────────────────────────────────────────────────────────────

export const CONTENT_MODES: Record<ContentMode, ContentModeEntry> = {
  "product-shot": {
    mode: "product-shot",
    summary: "A clean studio still of a product on a controlled background — e-commerce hero / catalog still.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: ["cgi-product-renders"],
      cliVerbs: ["generate image"],
      note: "art-director image route locked by the cgi-product-renders guideline; json-prompt-engine overlay for the structured prompt.",
    },
    supportedFormats: ["image", "poster"],
    requiredInputs: ["product reference image"],
    requiredRefTypes: ["product"],
    optionalInputs: ["brand palette", "background spec", "lighting register", "aspect ratio"],
    defaultResearchDepth: "none",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["product-shot", "studio", "e-commerce", "still", "packshot"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: ["cgi-product-renders"], note: "Product realism is a known failure mode; lock a render/photo guideline." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 4, note: "One or a few studio stills of a single product." },
    keywords: ["product shot", "product photo", "studio shot", "packshot", "product still", "catalog photo", "e-commerce photo", "white background product", "product on white"],
  },

  "lifestyle-scene": {
    mode: "lifestyle-scene",
    summary: "A product placed in a real-world lifestyle context with people / environment around it.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: ["photoreal-studio-portraits"],
      cliVerbs: ["generate image"],
      note: "art-director image route; photoreal-studio-portraits guideline applies when people are in frame.",
    },
    supportedFormats: ["image", "video"],
    requiredInputs: ["product reference image"],
    optionalInputs: ["scene description", "model / persona", "location", "mood"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["lifestyle", "in-context", "environment", "scene", "product-in-use"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: ["photoreal-studio-portraits"], note: "Photoreal humans benefit from the portrait guideline but it is not blocking." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 6, note: "Lifestyle stills of a product in context." },
    keywords: ["lifestyle scene", "lifestyle photo", "in context", "real life", "product in use", "scene with people", "everyday setting", "in the wild", "natural setting"],
  },

  "closeup-product-with-person": {
    mode: "closeup-product-with-person",
    summary: "A tight shot of a person holding / using / wearing the product — hand-in-frame UGC-flavored still.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: ["photoreal-studio-portraits"],
      cliVerbs: ["generate image"],
      note: "art-director image route; photoreal-studio-portraits guideline locks the hand/skin realism near the product.",
    },
    supportedFormats: ["image", "video"],
    requiredInputs: ["product reference image"],
    optionalInputs: ["model / persona", "hand or face framing", "skin register"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["closeup", "product-in-hand", "person", "macro", "held"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: ["photoreal-studio-portraits"], note: "Hands and skin near the product are the realism failure point; lock the photoreal guideline." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 4, note: "Close-up stills of product + person." },
    keywords: ["close up", "closeup", "product in hand", "holding the product", "person holding", "hand holding", "wearing", "macro shot", "person using"],
  },

  "pinterest-pin": {
    mode: "pinterest-pin",
    summary: "A tall 2:3 Pinterest pin with baked overlay text — discovery-feed still.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["poster"],
      guidelines: [],
      cliVerbs: ["generate image"],
      note: "the poster skill's baked-overlay-text still architecture covers the pin; route through generate image at a 2:3 aspect.",
    },
    supportedFormats: ["image", "poster"],
    requiredInputs: ["topic or product"],
    optionalInputs: ["headline copy", "brand palette", "reference style"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["pinterest", "pin", "vertical", "2:3", "overlay-text"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Style is brief-driven; no mandatory lock." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 3, note: "One or a few 2:3 pins with baked text." },
    keywords: ["pinterest pin", "pinterest", "pin", "vertical pin", "idea pin", "2:3 pin", "discovery pin"],
  },

  "hero-banner": {
    mode: "hero-banner",
    summary: "A wide website / ad hero banner with headline + product / hero subject.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["poster"],
      guidelines: [],
      cliVerbs: ["generate image"],
      note: "the poster skill's wordmark→hero→copy architecture covers the banner; route through generate image at a wide aspect.",
    },
    supportedFormats: ["image", "poster"],
    requiredInputs: ["headline or value prop"],
    optionalInputs: ["product / hero reference", "brand palette", "banner dimensions", "CTA copy"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "poster", tagQuery: ["hero", "banner", "header", "wide", "landing"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Brand-driven; lock a style if the brief names a brand DNA." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 3, note: "One or a few wide banner stills." },
    keywords: ["hero banner", "hero image", "website hero", "banner", "header image", "landing hero", "web banner", "ad banner"],
  },

  "social-carousel": {
    mode: "social-carousel",
    summary: "A 5-10 slide swipe-through deck with baked text — IG / LinkedIn / TikTok carousel.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["carousel"],
      guidelines: [],
      cliVerbs: ["generate image"],
      note: "the carousel skill (cover-first checkpoint + dual-ref cohesion + per-style STYLE blocks) is the direct route.",
    },
    supportedFormats: ["carousel"],
    requiredInputs: ["topic or narrative"],
    optionalInputs: ["mascot / brand", "slide count", "aesthetic / style set", "copy outline"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "carousel", tagQuery: ["carousel", "slides", "swipe", "deck", "multi-slide"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: [], note: "Cover-first cohesion needs a locked style block per the carousel skill." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "carousel", minMedia: 5, maxMedia: 10, note: "5-10 ordered slides with baked text." },
    keywords: ["carousel", "swipe through", "swipe-through", "multi slide", "multi-slide", "slide deck", "5 slide", "10 slide", "story series", "swipe deck"],
  },

  "ad-creative-pack": {
    mode: "ad-creative-pack",
    summary: "A batch of N≥4 static performance creatives for a single brand — FB / Meta ad pack / creative matrix.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["fb-creatives", "researcher"],
      guidelines: [],
      cliVerbs: ["generate image"],
      note: "the fb-creatives skill (5-set scaffold + site-grounding pre-flight); researcher overlay supplies the deep crawl (#15).",
    },
    supportedFormats: ["fb-creative", "image"],
    requiredInputs: ["brand site or brand reference", "hero / product reference"],
    requiredRefTypes: ["brand", "product"],
    optionalInputs: ["target audience", "offer / copy angles", "creative count"],
    defaultResearchDepth: "deep",
    roleChain: ["intake", "researcher", "art-director", "producer"],
    templateLookup: { primaryFormat: "fb-creative", tagQuery: ["fb-creative", "meta-ads", "performance", "creative-matrix", "ad-pack"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: [], note: "Site-grounding (AGENTS #15) locks the real palette + copy before any creative." },
    benchmarkSet: "app-store-image-pack",
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "fb-creative", minMedia: 4, maxMedia: null, note: "N≥4 numbered static creatives + copy doc." },
    keywords: ["ad pack", "fb creatives", "facebook creatives", "meta ads", "creative matrix", "performance creatives", "ad creatives", "set of ads", "cold traffic creatives"],
  },

  "virtual-model-tryout": {
    mode: "virtual-model-tryout",
    summary: "A product (apparel / accessory) shown worn by a generated virtual model — try-on still / video.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: ["photoreal-studio-portraits"],
      cliVerbs: ["generate image"],
      note: "art-director image route; photoreal-studio-portraits locks the worn-garment body / hand realism, json-prompt-engine builds the structured fitting prompt. Mode playbook carries the try-on craft + the high-hallucination-risk gates.",
    },
    supportedFormats: ["image", "video"],
    requiredInputs: ["product / garment reference image"],
    requiredRefTypes: ["product", "model-person"],
    optionalInputs: ["model spec (look, pose)", "fit / scale reference", "brand constraints", "background", "aspect ratio"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["try-on", "virtual-model", "apparel", "worn", "fashion"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: ["photoreal-studio-portraits"], note: "Worn-product realism on a human needs the photoreal guideline." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 6, note: "Try-on stills of the product on a model." },
    keywords: ["try on", "try-on", "virtual try on", "virtual model", "model wearing", "on a model", "tryout", "fit the product on", "garment on model"],
  },

  "conceptual-product": {
    mode: "conceptual-product",
    summary: "A surreal / artistic product concept image — campaign key-visual, not a literal catalog shot.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: [],
      cliVerbs: ["generate image"],
      note: "art-director image route; json-prompt-engine builds the dense surreal/concept prompt. Style is brief-driven (no mandatory lock).",
    },
    supportedFormats: ["image", "poster"],
    requiredInputs: ["product reference image", "concept direction"],
    optionalInputs: ["mood board", "color story", "surreal devices"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["conceptual", "surreal", "artistic", "key-visual", "campaign"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Concept is brief-driven; lock a style only if the brief names one." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 4, note: "Conceptual key-visual stills." },
    keywords: ["conceptual", "surreal product", "artistic product", "key visual", "concept shot", "campaign visual", "imaginative product", "abstract product"],
  },

  restyle: {
    mode: "restyle",
    summary: "Re-skin an existing image into a new aesthetic while keeping the subject — style transfer of a supplied reference.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: [],
      cliVerbs: ["generate image"],
      note: "art-director image route with the source as --ref; json-prompt-engine captures the target aesthetic. The target style is the locked register.",
    },
    supportedFormats: ["image"],
    requiredInputs: ["source image to restyle", "target style description"],
    optionalInputs: ["style reference image", "strength / fidelity"],
    defaultResearchDepth: "none",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["restyle", "style-transfer", "re-skin", "reimagine", "remix-style"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: [], note: "Restyle/remix is target-style-driven — the style IS the deliverable, so lock the register (target aesthetic, fidelity, do-not-do) up front (#408 covered set)." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 4, note: "Restyled variants of the source image." },
    keywords: ["restyle", "re-style", "re style", "style transfer", "reimagine", "re-skin", "reskin", "make this look like", "convert this to", "in the style of this image"],
  },

  "ugc-review": {
    mode: "ugc-review",
    summary: "A talking-head creator review / testimonial of a product — authentic UGC ad.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["ugc-ad"],
      guidelines: ["photoreal-studio-portraits"],
      cliVerbs: ["generate image", "generate video", "generate voiceover", "render"],
      note: "the ugc-ad skill (shooting-script shape + creator-persona + problem-mirror hook + 9:16 ~15s UGC defaults) is the direct route.",
    },
    supportedFormats: ["video"],
    requiredInputs: ["product reference"],
    requiredRefTypes: ["product"],
    optionalInputs: ["persona / archetype", "hook angle", "target language", "duration"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "scenarist", "art-director", "editor"],
    templateLookup: { primaryFormat: "video", tagQuery: ["ugc", "review", "testimonial", "talking-head", "creator"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: ["photoreal-studio-portraits"], note: "Talking-head realism benefits from the portrait guideline; not blocking." },
    benchmarkSet: "product-ugc-review",
    qualityGates: ["scoreScenario", "scoreImage", "scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: 1, note: "One short review video." },
    keywords: ["ugc review", "review video", "testimonial", "creator review", "talking head", "talking-head", "product review", "honest review", "creator talking about"],
  },

  "tutorial-ugc": {
    mode: "tutorial-ugc",
    summary: "A how-to / step-by-step UGC video showing a product or task in use.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["ugc-ad"],
      guidelines: [],
      cliVerbs: ["generate image", "generate video", "generate voiceover", "render"],
      note: "the ugc-ad skill carries the UGC craft (creator persona + shot/mannerism script); the step-by-step beat list specializes its scenario. A dedicated tutorial template is the #058 follow-up.",
    },
    supportedFormats: ["video"],
    requiredInputs: ["product or task to demo"],
    optionalInputs: ["persona", "step list", "duration", "captions language"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "scenarist", "art-director", "editor"],
    templateLookup: { primaryFormat: "video", tagQuery: ["tutorial", "how-to", "step-by-step", "demo", "ugc"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Style is brief-driven." },
    qualityGates: ["scoreScenario", "scoreImage", "scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: 1, note: "One how-to video." },
    keywords: ["tutorial", "how to", "how-to", "step by step", "step-by-step", "walkthrough", "demo video", "show me how", "guide video", "explainer ugc"],
  },

  "unboxing-ugc": {
    mode: "unboxing-ugc",
    summary: "An unboxing / first-impressions UGC video revealing a product from packaging.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["ugc-unboxing"],
      guidelines: [],
      cliVerbs: ["generate image", "generate video", "generate voiceover", "render"],
      note: "the ugc-unboxing skill (reveal beats + first-impressions UGC craft) is the direct route.",
    },
    supportedFormats: ["video"],
    requiredInputs: ["product reference", "packaging reference"],
    optionalInputs: ["persona", "reveal beats", "duration"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "scenarist", "art-director", "editor"],
    templateLookup: { primaryFormat: "video", tagQuery: ["unboxing", "reveal", "first-impressions", "haul", "ugc"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Style is brief-driven." },
    qualityGates: ["scoreScenario", "scoreImage", "scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: 1, note: "One unboxing video." },
    keywords: ["unboxing", "unbox", "first impressions", "opening the box", "package reveal", "haul", "what's inside", "unwrapping"],
  },

  "tv-ad": {
    mode: "tv-ad",
    summary: "A polished, broadcast-grade commercial spot — multi-scene cinematic ad.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["ugc-rockstar", "researcher"],
      guidelines: ["broadcast-realism-aspect", "cinematic-90s-film", "oldspice-absurd-spokesman"],
      cliVerbs: ["generate image", "generate video", "generate voiceover", "generate music", "render"],
      note: "cinematic register via the ugc-rockstar style overlay + one of the broadcast/cinematic/spokesman guidelines as the hard look-lock.",
    },
    supportedFormats: ["video"],
    requiredInputs: ["brand / product reference", "ad concept"],
    optionalInputs: ["script direction", "voiceover language", "music brief", "duration"],
    defaultResearchDepth: "deep",
    roleChain: ["intake", "researcher", "scenarist", "art-director", "editor", "producer"],
    templateLookup: { primaryFormat: "video", tagQuery: ["tv-ad", "commercial", "broadcast", "cinematic", "spot"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: ["broadcast-realism-aspect", "cinematic-90s-film", "oldspice-absurd-spokesman"], note: "Broadcast register is a hard look-lock; pick the matching guideline." },
    // ponytail: closest-match — there is no `analog-horror` registry mode; the
    // analog-horror-psa benchmark set is hung on `tv-ad` (the nearest video-ad
    // mode with a hard look-lock). Re-point if a dedicated PSA mode lands (#058).
    benchmarkSet: "analog-horror-psa",
    qualityGates: ["scoreScenario", "scoreImage", "scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: 1, note: "One multi-scene commercial spot." },
    keywords: ["tv ad", "tv commercial", "commercial spot", "broadcast ad", "tv spot", "advertising commercial", "30 second spot", "brand commercial"],
  },

  "cartoon-animation": {
    mode: "cartoon-animation",
    summary: "A stylized 2D / 3D cartoon-animated short — character-driven illustrated motion.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["ugc-toon-action", "seedance-prompts"],
      guidelines: [],
      cliVerbs: ["generate image", "generate video", "render"],
      note: "the ugc-toon-action skill (painterly t2v style block + GPT character-design discipline); seedance-prompts overlay for the t2v prompt craft.",
    },
    supportedFormats: ["video", "motion-design"],
    requiredInputs: ["story or concept"],
    optionalInputs: ["character designs", "art style", "duration", "voiceover"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "scenarist", "art-director", "editor"],
    templateLookup: { primaryFormat: "video", tagQuery: ["cartoon", "animation", "animated", "illustrated", "character"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: [], note: "Animation style must be locked up front for character consistency." },
    qualityGates: ["scoreScenario", "scoreImage", "scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: 1, note: "One animated cartoon short." },
    keywords: ["cartoon", "cartoon animation", "animated short", "2d animation", "3d animation", "animated cartoon", "illustrated video", "animated character"],
  },

  "motion-design": {
    mode: "motion-design",
    summary: "An abstract / graphic motion-design piece — animated shapes, logo motion, kinetic graphics.",
    supported: true,
    implementationUnit: {
      kind: "render-engine",
      skills: ["hyperframes", "gsap"],
      guidelines: [],
      cliVerbs: ["render"],
      note: "the HyperFrames render engine + editor playbook author the motion-design format directly (GSAP/WAAPI timelines → ralphy render).",
    },
    supportedFormats: ["motion-design", "video"],
    requiredInputs: ["concept or message"],
    optionalInputs: ["brand assets / logo", "palette", "duration", "music brief"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director", "editor"],
    templateLookup: { primaryFormat: "motion-design", tagQuery: ["motion-design", "kinetic", "graphic", "animated-graphics", "logo-motion"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Visual system is brief / brand driven." },
    qualityGates: ["scoreVideo"],
    expectedUnitShape: { format: "motion-design", minMedia: 1, maxMedia: 1, note: "One motion-design piece." },
    keywords: ["motion design", "motion graphics", "kinetic graphics", "animated graphics", "logo animation", "logo motion", "graphic animation", "abstract motion"],
  },

  "typography-animation": {
    mode: "typography-animation",
    summary: "A kinetic-typography piece where animated text IS the visual — lyric / quote / hook animation.",
    supported: true,
    implementationUnit: {
      kind: "render-engine",
      skills: ["hyperframes", "gsap", "waapi"],
      guidelines: [],
      cliVerbs: ["render"],
      note: "the HyperFrames render engine + editor playbook author kinetic type directly (GSAP SplitText / WAAPI per-char timelines → ralphy render).",
    },
    supportedFormats: ["motion-design", "video"],
    requiredInputs: ["the text / copy to animate"],
    optionalInputs: ["font / type system", "music or VO to sync to", "palette", "duration"],
    defaultResearchDepth: "none",
    roleChain: ["intake", "art-director", "editor"],
    templateLookup: { primaryFormat: "motion-design", tagQuery: ["typography", "kinetic-type", "text-animation", "lyric", "type"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Type system is brief-driven." },
    qualityGates: ["scoreVideo"],
    expectedUnitShape: { format: "motion-design", minMedia: 1, maxMedia: 1, note: "One kinetic-typography piece." },
    keywords: ["typography animation", "kinetic typography", "kinetic type", "text animation", "animated text", "lyric video", "word animation", "type animation"],
  },

  "podcast-video": {
    mode: "podcast-video",
    summary: "A long-form audio-driven faceless video built on top of an audio file / podcast — overlay-driven explainer.",
    supported: true,
    implementationUnit: {
      kind: "skill",
      skills: ["audio-explainer"],
      guidelines: [],
      cliVerbs: ["ref transcribe", "generate image", "generate music", "render"],
      note: "the audio-explainer skill (yt-dlp → silence-remove → Scribe → claim segmentation → per-claim overlay planner → HyperFrames) is the direct route.",
    },
    supportedFormats: ["video"],
    requiredInputs: ["audio file or long-form URL"],
    optionalInputs: ["overlay style", "chapter outline", "captions", "music bed"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "editor"],
    templateLookup: { primaryFormat: "video", tagQuery: ["podcast", "long-form", "audio-explainer", "faceless", "overlay"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Overlay style is brief-driven." },
    qualityGates: ["scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: 1, note: "One long-form audio-driven video." },
    keywords: ["podcast video", "podcast to video", "audio to video", "from this podcast", "from this audio", "long form video", "faceless video", "overlay video", "edit my audio", "make a video from this episode"],
  },

  "personal-clipper": {
    mode: "personal-clipper",
    summary: "Cut a long-form video / stream into short vertical clips — highlight / clip extraction.",
    supported: false,
    implementationUnit: {
      kind: "none",
      skills: [],
      guidelines: [],
      cliVerbs: [],
      note: "no clipper skill and no clip-extraction CLI verb exist yet; ref pull + ad-hoc ffmpeg is NOT a first-class route (AGENTS #2 bans ad-hoc ffmpeg).",
      recommendedUnit: "a `ralphy clip` verb (transcript-driven highlight detection → vertical crop + caption bake) plus a `personal-clipper` skill, #058.",
    },
    supportedFormats: ["video"],
    requiredInputs: ["source long-form video or URL"],
    optionalInputs: ["clip count", "target duration", "captions style", "platform"],
    defaultResearchDepth: "none",
    roleChain: ["intake", "editor"],
    templateLookup: { primaryFormat: "video", tagQuery: ["clipper", "clips", "highlights", "shorts", "cut-down"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "Caption / crop style is brief-driven." },
    qualityGates: ["scoreVideo"],
    expectedUnitShape: { format: "video", minMedia: 1, maxMedia: null, note: "N vertical clips cut from one source." },
    keywords: ["clip", "clipper", "clips", "highlights", "cut into clips", "cut up", "make shorts", "into shorts", "turn into shorts", "extract clips", "best moments", "clip my stream", "cut my stream", "cut my video"],
  },

  "amazon-listing": {
    mode: "amazon-listing",
    summary: "A set of marketplace listing images — main + infographic + lifestyle slots for Amazon / e-commerce.",
    supported: true,
    implementationUnit: {
      kind: "guideline-route",
      skills: ["json-prompt-engine"],
      guidelines: ["cgi-product-renders"],
      cliVerbs: ["generate image", "project image-pack"],
      note: "art-director image-pack route: scaffold the listing slot set with `ralphy project image-pack`, lock the render look with cgi-product-renders, build per-slot prompts with json-prompt-engine, then `generate image --batch`. Mode playbook carries the listing slot plan + claim-safe copy + safe-area discipline.",
    },
    supportedFormats: ["image", "carousel"],
    requiredInputs: ["product reference image", "key features / specs"],
    requiredRefTypes: ["product"],
    optionalInputs: ["brand palette", "competitor listings", "slot plan"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director"],
    templateLookup: { primaryFormat: "image", tagQuery: ["amazon", "listing", "marketplace", "infographic", "e-commerce"] },
    guidelineOrStyleLock: { required: true, guidelineSlugs: ["cgi-product-renders"], note: "Marketplace product renders need a locked render guideline." },
    qualityGates: ["scoreImage"],
    expectedUnitShape: { format: "image", minMedia: 5, maxMedia: 9, note: "A slot set of listing images (main + infographics + lifestyle)." },
    keywords: ["amazon listing", "amazon images", "listing images", "marketplace listing", "product listing", "amazon photos", "listing design", "infographic listing", "amazon a+ content"],
  },

  "infographic-animation": {
    mode: "infographic-animation",
    summary: "An animated infographic — data, metrics, comparisons, and callouts turned into narrated chart / overlay motion.",
    supported: true,
    implementationUnit: {
      kind: "render-engine",
      skills: ["hyperframes", "gsap"],
      guidelines: [],
      cliVerbs: ["render"],
      note: "the HyperFrames render engine + editor playbook author the animated charts / callouts directly (GSAP-driven bars / counters / comparison overlays on a single timeline → ralphy render). Data-in-motion craft via /hyperframes + /gsap.",
    },
    supportedFormats: ["motion-design", "video"],
    requiredInputs: ["structured data or a brief stating the stats / metrics to visualize"],
    optionalInputs: ["brand palette", "source URL for the stats", "narration / voiceover", "chapter outline", "duration"],
    defaultResearchDepth: "quick",
    roleChain: ["intake", "art-director", "editor"],
    templateLookup: { primaryFormat: "motion-design", tagQuery: ["infographic", "data-viz", "animated-chart", "data-in-motion", "explainer"] },
    guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "No register guideline; the data-in-motion craft floor lives in the mode playbook (no model-prompt look to lock — authored in HyperFrames)." },
    qualityGates: ["scoreVideo"],
    expectedUnitShape: { format: "motion-design", minMedia: 1, maxMedia: 1, note: "One animated-infographic piece." },
    keywords: ["infographic animation", "animated infographic", "animated chart", "data visualization video", "chart animation", "animated explainer", "data in motion", "animated stats", "animated data"],
  },
};

/** All registry entries as an array (stable order = `CONTENT_MODES_LIST`). */
export function allContentModes(): ContentModeEntry[] {
  return CONTENT_MODES_LIST.map((m) => CONTENT_MODES[m]);
}

export function getContentMode(mode: string): ContentModeEntry | undefined {
  return (CONTENT_MODES as Record<string, ContentModeEntry>)[mode];
}

export function isContentMode(value: unknown): value is ContentMode {
  return typeof value === "string" && (CONTENT_MODES_LIST as readonly string[]).includes(value);
}

// ─── Supported-mode helpers (#413) ───────────────────────────────────────────
//
// A mode is SUPPORTED iff it has a concrete implementation unit (a default
// route) AND quality gates AND a Unit shape. Gates + Unit shape are present for
// every #412 entry, so the load-bearing condition is the implementation unit —
// `supported === (implementationUnit.kind !== "none")`. The two are kept
// consistent here at module scope (the invariant is asserted in
// `tests/unit/mode-coverage.test.ts`); `#417` consumes `isModeSupported()` /
// `supportedContentModes()` so it only checks guideline coverage for modes that
// are first-class routes, and docs warn against promising unsupported modes.

/** True when the mode is a first-class route the agent may promise (#413). */
export function isModeSupported(mode: string): boolean {
  const entry = getContentMode(mode);
  return !!entry && entry.supported && entry.implementationUnit.kind !== "none";
}

/** All SUPPORTED modes (stable order = `CONTENT_MODES_LIST`). */
export function supportedContentModes(): ContentModeEntry[] {
  return allContentModes().filter((e) => e.supported);
}

/** All UNSUPPORTED (deferred-gap) modes (stable order = `CONTENT_MODES_LIST`). */
export function unsupportedContentModes(): ContentModeEntry[] {
  return allContentModes().filter((e) => !e.supported);
}

// ─── Commercial-mode gate (#422) ──────────────────────────────────────────────
//
// The product/brand fidelity gate (#422) only runs its strict checks for
// COMMERCIAL modes — ones whose deliverable is anchored to a real named product
// / brand / packaging. Rather than hardcode a list that drifts from the registry,
// we DERIVE it: a mode is commercial iff it declares a real-entity ref type
// (`product`/`brand` in `requiredRefTypes`) OR any `requiredInputs` string names
// a product / brand / packaging. This captures product-shot, lifestyle-scene,
// closeup, ad-creative-pack, ugc-review, tutorial-ugc, unboxing-ugc, tv-ad,
// conceptual-product, virtual-model-tryout, amazon-listing — and excludes the
// generic / craft modes (carousel, motion-design, typography, podcast, etc.).

// A requiredInput names a product/brand as a real anchor the gen MUST match —
// "product reference image", "brand / product reference", "packaging reference",
// "product or task to demo". The `(?<!or )` exclusion drops the "topic OR
// product" alternative phrasing (pinterest-pin) where the product is one
// optional subject choice, not a fidelity anchor.
const COMMERCIAL_INPUT_RE = /(?<!or )\b(product|brand|packaging|packshot)\b/i;

/**
 * True when a mode's deliverable is anchored to a real named product/brand and
 * therefore must clear the product/brand fidelity gate (#422) before a Unit
 * ships. Derived from the registry (`requiredRefTypes` + `requiredInputs`), so
 * adding a commercial mode auto-opts it in. Unknown mode → false (not gated).
 */
export function requiresFidelityGate(mode: string): boolean {
  const entry = getContentMode(mode);
  if (!entry) return false;
  const realEntityRef = (entry.requiredRefTypes ?? []).some((t) => t === "product" || t === "brand");
  const namesProduct = entry.requiredInputs.some((i) => COMMERCIAL_INPUT_RE.test(i));
  return realEntityRef || namesProduct;
}

// ─── Guideline-coverage resolver (#417) ──────────────────────────────────────
//
// #417 requires every SUPPORTED mode to carry mode-specific quality guidance —
// a linked `guidelines/<slug>/` register guideline OR a mode-level quality
// playbook at `docs/playbooks/modes/<mode>.md`. This resolver returns what a
// mode DECLARES it uses (the guideline slugs from its implementation unit +
// style lock, deduped, plus the conventional mode-playbook doc path), so the
// production plan (#407) can LIST it and the coverage lint
// (`scripts/lint-mode-guidelines.ts`) can verify the on-disk artifacts exist.
//
// This is PURE registry data — it does NOT touch the filesystem (the lint owns
// the existence check). The mode-playbook path is the convention every #417
// playbook follows; an empty `guidelineSlugs` array means the mode is covered
// by a mode-level playbook rather than a register guideline.

/** Conventional on-disk home for a mode-level quality playbook (#417). */
export function modePlaybookPath(mode: string): string {
  return `docs/playbooks/modes/${mode}.md`;
}

export interface ModeGuidelineCoverage {
  /** The mode this coverage describes. */
  mode: ContentMode;
  /** Register-guideline slugs the mode references (impl unit + style lock, deduped). */
  guidelineSlugs: string[];
  /** Conventional mode-level quality-playbook doc path (#417). */
  modePlaybook: string;
}

/**
 * Resolve the quality-guidance a mode declares it uses: the deduped set of
 * register-guideline slugs (from `implementationUnit.guidelines` +
 * `guidelineOrStyleLock.guidelineSlugs`) and the conventional mode-playbook doc
 * path. Returns `null` for an unknown mode. Pure — no filesystem access.
 */
export function modeGuidelineCoverage(mode: string): ModeGuidelineCoverage | null {
  const entry = getContentMode(mode);
  if (!entry) return null;
  const guidelineSlugs = [
    ...new Set([
      ...entry.implementationUnit.guidelines,
      ...entry.guidelineOrStyleLock.guidelineSlugs,
    ]),
  ];
  return { mode: entry.mode, guidelineSlugs, modePlaybook: modePlaybookPath(entry.mode) };
}

// ─── Classifier ────────────────────────────────────────────────────────────
//
// Deterministic keyword/phrase pre-classifier. NO LLM — this is the fast first
// pass the agent runs on a brief to emit a `content_mode` before any template
// lookup. When it can't decide (a tie, or nothing scores), it flags `ambiguous`
// and returns `alternatives` so the agent knows to ask the user.

export interface ContentModeClassification {
  /** Best mode, or null when nothing scored at all. */
  mode: ContentMode | null;
  /** 0.0-1.0 confidence in the best mode. */
  confidence: number;
  /** True when the agent should ask the user (tie, or nothing clears the floor). */
  ambiguous: boolean;
  /** Runner-up modes (descending score), excluding the winner. */
  alternatives: ContentMode[];
  /** All non-zero scores, descending — for debugging / surfacing. */
  scores: Array<{ mode: ContentMode; score: number }>;
}

const PHRASE_SPLIT = /[\s,.;:!?()/"'`]+/;

function normalize(utterance: string): string {
  return ` ${utterance.toLowerCase().replace(PHRASE_SPLIT, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * Score one mode against the normalized utterance. Multi-word keyword phrases
 * are worth 2 points (they are the most intentional signal); single-word
 * keywords are worth 1. The raw score is normalized to 0-1 against a small
 * saturation constant so a couple of strong phrase hits already approach 1.0.
 */
function scoreMode(entry: ContentModeEntry, normalized: string): number {
  let raw = 0;
  for (const kw of entry.keywords) {
    const phrase = ` ${kw.toLowerCase()} `;
    if (normalized.includes(phrase)) {
      raw += kw.includes(" ") ? 2 : 1;
    }
  }
  // Saturate: 4 points (e.g. two phrase hits) → 1.0.
  return Math.min(1, raw / 4);
}

/** Min winning score for a confident (non-ambiguous) classification. */
const CONFIDENCE_FLOOR = 0.25;
/** Max gap to the runner-up before we call it a tie / ambiguous. */
const TIE_MARGIN = 0.0001;

/**
 * Classify a free-text brief into a `content_mode`. Deterministic; no network.
 *
 * Returns `ambiguous: true` when either:
 *   - nothing scores above zero (low-detail / off-domain brief), OR
 *   - the top score is below the confidence floor, OR
 *   - the top two modes tie within `TIE_MARGIN`.
 *
 * In the ambiguous case `mode` is still the best guess (or null when nothing
 * scored), and `alternatives` carries the tied / next-best modes so the agent
 * can ask the user a single disambiguating question.
 */
export function classifyContentMode(utterance: string): ContentModeClassification {
  const normalized = normalize(utterance ?? "");

  const scored = allContentModes()
    .map((entry) => ({ mode: entry.mode, score: Number(scoreMode(entry, normalized).toFixed(3)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || CONTENT_MODES_LIST.indexOf(a.mode) - CONTENT_MODES_LIST.indexOf(b.mode));

  if (scored.length === 0) {
    return { mode: null, confidence: 0, ambiguous: true, alternatives: [], scores: [] };
  }

  const top = scored[0]!;
  const runnerUp = scored[1];
  const tied = runnerUp !== undefined && top.score - runnerUp.score <= TIE_MARGIN;
  const belowFloor = top.score < CONFIDENCE_FLOOR;
  const ambiguous = tied || belowFloor;

  return {
    mode: top.mode,
    confidence: top.score,
    ambiguous,
    alternatives: scored.slice(1).map((s) => s.mode),
    scores: scored,
  };
}

// Re-export the format taxonomy reference so downstream code can validate
// `supportedFormats` against it without a second import.
export { TEMPLATE_FORMATS };
