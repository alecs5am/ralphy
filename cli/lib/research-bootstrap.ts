// Research bootstrap — the deterministic depth decision (issue #416).
//
// Makes trend/niche research an OPINIONATED DEFAULT: given a brief (+ an
// optionally-resolved content mode), decide whether to run NO research, QUICK
// research (brand/product/site grounding + 3-5 benchmark refs), or DEEP research
// (competitor scan + creator/format scan + trend scan + style/offer synthesis)
// BEFORE drafting the production plan.
//
// This module ONLY decides the depth — it builds no new crawler. The agent
// routes the decision to the EXISTING research surfaces:
//   • quick → site-grounding sub-agent (AGENTS.md #15, docs/playbooks/site-grounding.md)
//             → artifacts/refs/research.md, OR `ralphy ref pull` for a few
//             benchmark refs. No `report.md` is regenerated here.
//   • deep  → `ralphy research run "<niche/question>"` (the deep engine,
//             cli/lib/research/orchestrator.ts) and/or `ralphy research
//             scrape-profile <handle>` for the creator/format scan.
// The structured distillate of either flow is `ProductBrandFacts`
// (cli/lib/schemas/research-facts.ts), persisted to artifacts/refs/research-facts.json.
//
// DETERMINISTIC: no LLM, no network. The decision composes the #412 content-mode
// `defaultResearchDepth` baseline with trigger detection on the brief, taking the
// MAX depth. `none` survives only when nothing triggers AND the mode default is
// none. The result carries the matched trigger list + a human reason so the
// agent can explain (and the test can assert) why it landed where it did.

import { classifyContentMode, getContentMode, type ResearchDepth } from "./content-modes.js";

// ─── Trigger taxonomy (mirrors the issue's auto-trigger list) ──────────────────

/** The trigger ids the issue enumerates. Stable — append, never repurpose. */
export const RESEARCH_TRIGGERS = [
  "product-url",
  "brand-url",
  "creator-url",
  "niche-low-detail",
  "multi-unit-farm",
  "platform-performance-goal",
] as const;

export type ResearchTrigger = (typeof RESEARCH_TRIGGERS)[number];

/** Ordering of depths for MAX composition. */
const DEPTH_RANK: Record<ResearchDepth, number> = { none: 0, quick: 1, deep: 2 };

/** Take the deeper of two depths. */
function maxDepth(a: ResearchDepth, b: ResearchDepth): ResearchDepth {
  return DEPTH_RANK[a] >= DEPTH_RANK[b] ? a : b;
}

/** The depth each trigger DEMANDS on its own (before composing with the mode default). */
const TRIGGER_DEPTH: Record<ResearchTrigger, ResearchDepth> = {
  // A product/brand/creator URL needs at minimum quick grounding; escalation to
  // deep happens when a farm / performance-goal trigger ALSO fires (see below).
  "product-url": "quick",
  "brand-url": "quick",
  "creator-url": "quick",
  // A bare niche with no creative detail can't be ground from a single URL —
  // it needs the competitor/format/trend scan.
  "niche-low-detail": "deep",
  // A content farm / multi-Unit batch always justifies the deep scan (it amortizes).
  "multi-unit-farm": "deep",
  // A platform-specific performance goal needs the format/trend scan to ground it.
  "platform-performance-goal": "deep",
} as const;

// ─── Detectors (deterministic, no network) ─────────────────────────────────────

const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;

/** Social/creator hosts whose URL/handle implies a creator-profile reference. */
const CREATOR_HOST_RE =
  /\b(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|reddit\.com|facebook\.com|twitch\.tv)\b/i;

/** A bare `@handle` token (not an email — guarded by requiring word boundaries). */
const HANDLE_RE = /(?:^|\s)@[a-z0-9_.]{2,}/i;

/**
 * Brand/product wording near a URL. Used only to LABEL a non-creator URL as a
 * product vs brand reference; both map to `quick` so the label is informational.
 * A URL that names a checkout / product path leans product; a bare domain /
 * marketing path leans brand.
 */
const PRODUCT_PATH_RE = /\/(?:product|products|p|item|shop|store|buy|checkout|listing|sku)s?(?:\/|\b)/i;

/** Phrases that signal a multi-Unit / content-farm request. */
const FARM_PHRASES = [
  "content farm",
  "content-farm",
  "batch of",
  "set of",
  "multiple units",
  "multiple videos",
  "many videos",
  "n videos",
  "creative matrix",
  "ad pack",
  "creative pack",
  "variations",
  "variants",
  "every day",
  "daily content",
  "at scale",
  "pipeline of",
];

/** Phrases that signal a platform-specific performance goal. */
const PERFORMANCE_PHRASES = [
  "go viral",
  "viral",
  "ctr",
  "click-through",
  "conversion",
  "convert",
  "roas",
  "cpa",
  "retention",
  "scroll-stop",
  "scroll stop",
  "watch time",
  "for cold traffic",
  "cold-traffic",
  "performance creative",
  "performing",
  "engagement",
  "reach",
];

/**
 * Numeric/count signals for a multi-Unit request — a leading count ("32 FB
 * creatives", "make 10 ads"). Captures N≥4 to match the ad-pack / farm threshold.
 */
const COUNT_RE = /\b(\d{1,4})\s*(?:x\b|×|of\b|fb\b|facebook\b|meta\b|ads?\b|creatives?\b|videos?\b|posts?\b|slides?\b|units?\b|pins?\b|variations?\b|variants?\b)/i;

function hasPhrase(haystack: string, phrases: string[]): boolean {
  return phrases.some((p) => haystack.includes(p));
}

/**
 * Whether the brief is "low-detail" — names a niche/topic but gives the agent
 * too little creative direction to plan from. Heuristic + deterministic:
 *   - SHORT (few content words), AND
 *   - carries no URL / handle (those route to the URL triggers instead), AND
 *   - carries no rich creative detail markers (style/look/format/pacing words).
 * The threshold is intentionally conservative so a detailed brief never
 * mis-fires this. Off-domain English fixtures exercise the same path.
 */
const DETAIL_MARKERS = [
  "style",
  "aesthetic",
  "look",
  "palette",
  "color",
  "colour",
  "tone",
  "register",
  "vibe",
  "mood",
  "pacing",
  "cut",
  "hook",
  "scene",
  "shot",
  "duration",
  "seconds",
  "voiceover",
  "voice over",
  "captions",
  "music",
  "font",
  "typography",
  "format",
  "9:16",
  "16:9",
  "1:1",
  "like this",
  "in the style of",
  "reference",
];

/** Content-word count after stripping punctuation — a coarse "how detailed" proxy. */
function contentWordCount(text: string): number {
  return text
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2).length;
}

function detectLowDetailNiche(normalized: string, rawHasUrlOrHandle: boolean): boolean {
  if (rawHasUrlOrHandle) return false; // URL/handle triggers cover these
  const words = contentWordCount(normalized);
  // An empty / near-empty brief names no niche at all — there is nothing to
  // research. The low-detail trigger fires on a brief that DOES name a niche but
  // gives too little creative direction (a 2-14 content-word band).
  if (words < 2) return false;
  // A short brief (≤ ~14 content words) with no creative-detail marker is the
  // "niche named without enough detail" case the issue targets.
  const detailed = hasPhrase(normalized, DETAIL_MARKERS);
  return words <= 14 && !detailed;
}

// ─── Input + result ────────────────────────────────────────────────────────────

export interface ResearchBootstrapInput {
  /** The user's brief (verbatim). The primary signal. */
  brief: string;
  /**
   * Resolved content mode (#412), if the agent already classified one. When
   * omitted, the bootstrap classifies the brief itself to read the mode's
   * `defaultResearchDepth` baseline.
   */
  contentMode?: string | null;
  /**
   * Explicit Unit count when the agent already knows the batch size (e.g. from
   * intake). N≥4 forces the multi-unit-farm trigger regardless of wording.
   */
  unitCount?: number;
}

export interface ResearchDepthDecision {
  /** The chosen depth. */
  depth: ResearchDepth;
  /** Trigger ids that fired, in detection order. */
  triggers: ResearchTrigger[];
  /** Human-readable reason composing the mode baseline + the fired triggers. */
  reason: string;
  /** The #412 content-mode baseline depth the decision started from. */
  modeBaseline: ResearchDepth;
  /** The resolved content mode the baseline came from (null when none classified). */
  contentMode: string | null;
}

// ─── The decision ──────────────────────────────────────────────────────────────

/**
 * Decide the research depth for a brief. DETERMINISTIC — no LLM, no network.
 *
 * Composition: the #412 content-mode `defaultResearchDepth` is the BASELINE;
 * each detected trigger demands its own depth; the result is the MAX of the
 * baseline and every fired trigger. So:
 *   - a `product-shot` mode (default none) + a brand URL → `quick`;
 *   - a brand URL + a farm request → `deep` (farm escalates);
 *   - an `ad-creative-pack` mode (default deep) → stays `deep`;
 *   - `none` survives only when NOTHING triggers AND the mode default is `none`.
 *
 * @example
 *   chooseResearchDepth({ brief: "make ads for https://acme.com/products/widget" })
 *   // → { depth: "quick", triggers: ["product-url"], ... }
 */
export function chooseResearchDepth(input: ResearchBootstrapInput): ResearchDepthDecision {
  const brief = (input.brief ?? "").trim();
  const normalized = ` ${brief.toLowerCase()} `;

  // ── Resolve the #412 baseline ──
  const modeId =
    input.contentMode ?? (brief ? classifyContentMode(brief).mode : null);
  const modeEntry = modeId ? getContentMode(modeId) : undefined;
  const modeBaseline: ResearchDepth = modeEntry?.defaultResearchDepth ?? "none";

  // ── Detect triggers ──
  const triggers: ResearchTrigger[] = [];

  const urls = brief.match(URL_RE) ?? [];
  const hasHandle = HANDLE_RE.test(brief);
  const creatorUrl = urls.find((u) => CREATOR_HOST_RE.test(u));
  const nonCreatorUrls = urls.filter((u) => !CREATOR_HOST_RE.test(u));

  // Creator / profile / reference URL (or a bare @handle).
  if (creatorUrl || hasHandle) triggers.push("creator-url");

  // Product vs brand URL: a non-creator URL with a product/checkout path is a
  // product URL; any other non-creator URL is a brand URL. (Both → quick.)
  if (nonCreatorUrls.length > 0) {
    const hasProductPath = nonCreatorUrls.some((u) => PRODUCT_PATH_RE.test(u));
    triggers.push(hasProductPath ? "product-url" : "brand-url");
  }

  // Multi-Unit / content-farm: explicit count ≥4, a count-phrase, or farm wording.
  const countMatch = brief.match(COUNT_RE);
  const countN = countMatch ? parseInt(countMatch[1]!, 10) : 0;
  const farmByCount = (input.unitCount ?? 0) >= 4 || countN >= 4;
  if (farmByCount || hasPhrase(normalized, FARM_PHRASES)) {
    triggers.push("multi-unit-farm");
  }

  // Platform-specific performance goal: a performance phrase, optionally + a platform.
  const hasPerformance = hasPhrase(normalized, PERFORMANCE_PHRASES);
  if (hasPerformance) triggers.push("platform-performance-goal");

  // Low-detail niche (only when no URL/handle already routed it).
  const rawHasUrlOrHandle = urls.length > 0 || hasHandle;
  if (detectLowDetailNiche(normalized, rawHasUrlOrHandle)) {
    triggers.push("niche-low-detail");
  }

  // ── Compose depth: MAX(baseline, every fired trigger) ──
  let depth = modeBaseline;
  for (const t of triggers) depth = maxDepth(depth, TRIGGER_DEPTH[t]);

  // ── Human reason ──
  const reason = buildReason(depth, triggers, modeBaseline, modeId ?? null);

  return { depth, triggers, reason, modeBaseline, contentMode: modeId ?? null };
}

/** Map a trigger id to its short human label (for the reason string). */
const TRIGGER_LABEL: Record<ResearchTrigger, string> = {
  "product-url": "a product URL",
  "brand-url": "a brand URL",
  "creator-url": "a creator / reference URL",
  "niche-low-detail": "a niche named without enough creative detail",
  "multi-unit-farm": "a multi-Unit / content-farm request",
  "platform-performance-goal": "a platform-specific performance goal",
};

function buildReason(
  depth: ResearchDepth,
  triggers: ResearchTrigger[],
  baseline: ResearchDepth,
  modeId: string | null,
): string {
  const baselinePart = modeId
    ? `content mode \`${modeId}\` defaults to ${baseline} research`
    : `no content mode classified (baseline ${baseline})`;

  if (triggers.length === 0) {
    return depth === "none"
      ? `${baselinePart}; nothing escalated it — skip research and plan from the brief.`
      : `${baselinePart}; no extra trigger fired, so research stays at the mode default (${depth}).`;
  }

  const triggerPart = triggers.map((t) => TRIGGER_LABEL[t]).join(", ");
  const route =
    depth === "deep"
      ? "run the deep research engine (`ralphy research run` / `scrape-profile`)"
      : "run quick grounding (site-grounding sub-agent / a few benchmark `ralphy ref pull`s)";
  return `${baselinePart}; detected ${triggerPart} → escalate to ${depth} and ${route}.`;
}

// ─── Routing reference (no new crawling) ────────────────────────────────────────
//
// The agent reads this to pick the EXISTING verb/flow per depth. Pure data —
// kept here so the doc, the wiring, and the test reference one source.

/** Which existing research surface each depth routes to. No new crawler. */
export const DEPTH_ROUTING: Record<ResearchDepth, { surface: string; note: string }> = {
  none: {
    surface: "(skip)",
    note: "No research — plan directly from the brief (mode default is none and nothing triggered).",
  },
  quick: {
    surface: "site-grounding sub-agent (AGENTS.md #15) → artifacts/refs/research.md; OR `ralphy ref pull <url>` for 3-5 benchmark refs",
    note: "Brand/product/site grounding + a small benchmark set. No report.md regenerated.",
  },
  deep: {
    surface: "`ralphy research run \"<niche/question>\"` (deep engine) + `ralphy research scrape-profile <handle>` for the creator/format scan",
    note: "Competitor scan + creator/format scan + trend scan + style/offer synthesis → workspace/research/<topic>/report.md + sources.json.",
  },
};
