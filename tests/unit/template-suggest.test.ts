// `ralphy template suggest` — keyword scorer + LLM-classify fallback.
//
// TDD baseline. The current `cli/commands/template.ts` does literal-substring
// matching against tags + description + first 500 chars of TEMPLATE.md. That
// works for "tokyo y2k" but fails on Russian utterances, paraphrase,
// concept-level matching, and typos. The new `suggestTemplates()` adds an
// LLM-rerank fallback that fires only when the keyword scorer's top-1 is
// below a threshold.

import { describe, test, expect, mock } from "bun:test";
import {
  keywordScore,
  suggestTemplates,
  type Candidate,
} from "../../cli/lib/templater/suggest.js";

// ─── Fixtures: a compact slice of the real catalog to test against ───────────
const TEMPLATES: Candidate[] = [
  {
    slug: "tokyo-y2k-cinematic",
    name: "Tokyo Y2K Cinematic",
    description:
      "Long-form 75s tokyo-night y2k cinematic — neon-soaked alley dollies, rain-on-glass macro, JP signage typography slams, 16:9 letterboxed final cut.",
    tags: ["tokyo", "y2k", "cinematic", "neon", "japanese", "letterbox"],
    doc: "",
  },
  {
    slug: "broadcast-caught-on-tv-square",
    name: "Broadcast Caught-on-TV (Square)",
    description:
      "Square 1:1 caught-on-live-broadcast realism — audience-cam reaction beat, gpt-5.4-image-2 anchor then Kling 15s i2v with ambient announcer.",
    tags: ["broadcast", "sports", "square", "audience-cam", "1:1", "caught-on-tv"],
    doc: "",
  },
  {
    slug: "noski-deadpan-2hander",
    name: "Noski Deadpan 2-Hander",
    description:
      "Deadpan-philosophical 2-hander in @americanbaron register — couch conversation, heads back, eyes up, almost-whispered half-rhetorical questions.",
    tags: ["deadpan", "philosophy", "couch", "creator-lifestyle", "americanbaron"],
    doc: "",
  },
  {
    slug: "pixel-art-product-reveal",
    name: "Pixel Art Product Reveal",
    description:
      "Photoreal hero device as only chroma in a hand-illustrated duotone halftone world. 8 hyper-motion cuts orbit the product gimmick. Playdate / Panic Inc.",
    tags: ["pixel-art", "playdate", "duotone", "halftone", "product-reveal", "panic"],
    doc: "",
  },
  {
    slug: "analog-horror-psa",
    name: "Analog Horror PSA",
    description:
      "EBS-style emergency-broadcast PSA with cold robo VO, IF/DO-NOT/BUT/AND beat structure, glitchx font, yellow pixelated PSA icons.",
    tags: ["analog-horror", "psa", "broadcast", "ebs", "robo-voice", "vhs"],
    doc: "",
  },
  {
    slug: "comic-spiderverse-action",
    name: "Comic Spider-Verse Action",
    description:
      "16:9 painterly action duel in Spider-Verse / Arcane register. Two contrasting silhouettes trading named-trick beats.",
    tags: ["comic", "spider-verse", "arcane", "action", "painterly", "duel"],
    doc: "",
  },
  {
    slug: "japanese-hypermotion-product-ad",
    name: "Japanese Hypermotion Product Ad",
    description:
      "15s 9:16 hyperpop product ad — 8 hard-cuts at ~1.9s avg over pink-and-cyan tile-grid 3D stage with chibi mascots, drum-sting on every cut.",
    tags: ["hypermotion", "japanese", "product-ad", "chibi", "hyperpop", "tile-grid"],
    doc: "",
  },
  {
    slug: "italian-brainrot",
    name: "Italian Brainrot",
    description:
      "Single-character AI-meme (Tralalero Tralala, Tung Tung Sahur, Ballerina Cappuccina) with Italian-gibberish VO.",
    tags: ["brainrot", "italian", "meme", "ai-character", "viral"],
    doc: "",
  },
];

// ─── keywordScore — pure substring scorer ────────────────────────────────────

describe("keywordScore", () => {
  test("exact tag match scores high", () => {
    const r = keywordScore("tokyo y2k", TEMPLATES);
    expect(r[0].slug).toBe("tokyo-y2k-cinematic");
    // Two tokens, both tag-matches → tagHits=2, hits=2, score = 4 / (2*2) = 1.0
    expect(r[0].score).toBeGreaterThanOrEqual(0.7);
  });

  test("tag matches outrank description-only matches", () => {
    // "playdate" is a tag on pixel-art; might appear nowhere else
    const r = keywordScore("playdate", TEMPLATES);
    expect(r[0].slug).toBe("pixel-art-product-reveal");
  });

  test("Russian utterance produces near-zero score across EN templates", () => {
    const r = keywordScore("хочу спортивные трибуны", TEMPLATES);
    expect(r[0].score).toBeLessThan(0.3);
  });

  test("paraphrase produces low score (concept-level matching fails)", () => {
    // "found-footage horror" never appears literally in any template tag/desc
    // The closest fit (analog-horror-psa) has "vhs" / "robo-voice" but not "found-footage"
    const r = keywordScore("found footage horror video", TEMPLATES);
    expect(r[0].score).toBeLessThan(0.5);
  });

  test("typo doesn't fully match (substring is strict)", () => {
    const r = keywordScore("playdte reveal", TEMPLATES);
    // "reveal" hits "product-reveal" tag → 1 tag hit (2× weight)
    // "playdte" doesn't substring-match "playdate" → 0 hits
    // Score = (1 hit + 1 tagHit) / (2 tokens × 2) = 0.5 — exactly at the weak/strong boundary
    // A clean "playdate reveal" would score 1.0; the typo halves it. That's the
    // signal the LLM-rerank path should pick up to surface the right template.
    expect(r[0].score).toBeLessThanOrEqual(0.5);
    expect(r[0].tier).not.toBe("strong");
  });

  test("returns results sorted by score descending", () => {
    const r = keywordScore("japanese", TEMPLATES);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].score).toBeLessThanOrEqual(r[i - 1].score);
    }
  });

  test("scores tier into strong / weak / below-threshold", () => {
    const r = keywordScore("tokyo y2k cinematic", TEMPLATES);
    expect(r[0].tier).toBe("strong");
    const weak = keywordScore("неон ночь", TEMPLATES);
    expect(weak[0].tier).toBe("below-threshold");
  });
});

// ─── suggestTemplates — orchestrator (keyword + LLM fallback) ────────────────

describe("suggestTemplates orchestrator", () => {
  test("returns keyword-only when top score >= threshold (skips LLM)", async () => {
    const llmFn = mock(async () => {
      throw new Error("LLM should not be called for high-confidence keyword matches");
    });
    const r = await suggestTemplates("tokyo y2k cinematic", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 3,
    });
    expect(llmFn).not.toHaveBeenCalled();
    expect(r.source).toBe("keyword");
    expect(r.results[0].slug).toBe("tokyo-y2k-cinematic");
    expect(r.results.length).toBeLessThanOrEqual(3);
  });

  test("falls through to LLM when keyword top score is below threshold", async () => {
    const llmFn = mock(async () =>
      JSON.stringify({
        results: [
          {
            slug: "broadcast-caught-on-tv-square",
            score: 0.92,
            reasoning: "sports broadcast realism is the closest fit for 'спортивные трибуны'",
          },
          { slug: "noski-deadpan-2hander", score: 0.45, reasoning: "creator-lifestyle adjacent" },
        ],
      }),
    );
    const r = await suggestTemplates("хочу спортивные трибуны", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 3,
    });
    expect(llmFn).toHaveBeenCalledTimes(1);
    expect(r.source).toBe("llm");
    expect(r.results[0].slug).toBe("broadcast-caught-on-tv-square");
    expect(r.results[0].reasoning).toBeDefined();
  });

  test("falls back to keyword if LLM throws (network out)", async () => {
    const llmFn = mock(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await suggestTemplates("хочу спортивные трибуны", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 3,
    });
    expect(llmFn).toHaveBeenCalledTimes(1);
    expect(r.source).toBe("keyword-fallback");
    expect(r.results.length).toBeGreaterThan(0);
  });

  test("falls back to keyword if LLM returns malformed JSON", async () => {
    const llmFn = mock(async () => "this is not JSON, sorry");
    const r = await suggestTemplates("хочу спортивные трибуны", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 3,
    });
    expect(r.source).toBe("keyword-fallback");
  });

  test("falls back to keyword if LLM returns unknown slug", async () => {
    const llmFn = mock(async () =>
      JSON.stringify({
        results: [{ slug: "totally-made-up-slug", score: 0.95, reasoning: "..." }],
      }),
    );
    const r = await suggestTemplates("хочу спортивные трибуны", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 3,
    });
    expect(r.source).toBe("keyword-fallback");
  });

  test("--no-llm forces keyword-only even when below threshold", async () => {
    const llmFn = mock(async () => "should not be called");
    const r = await suggestTemplates("хочу спортивные трибуны", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 3,
      disableLlm: true,
    });
    expect(llmFn).not.toHaveBeenCalled();
    expect(r.source).toBe("keyword");
  });

  test("respects limit on both paths", async () => {
    const llmFn = mock(async () =>
      JSON.stringify({
        results: [
          { slug: "broadcast-caught-on-tv-square", score: 0.92, reasoning: "x" },
          { slug: "noski-deadpan-2hander", score: 0.5, reasoning: "y" },
          { slug: "pixel-art-product-reveal", score: 0.3, reasoning: "z" },
          { slug: "analog-horror-psa", score: 0.2, reasoning: "w" },
        ],
      }),
    );
    const r = await suggestTemplates("хочу что-то странное", TEMPLATES, {
      llmFn,
      threshold: 0.7,
      limit: 2,
    });
    expect(r.results.length).toBeLessThanOrEqual(2);
  });
});

// ─── LLM prompt construction (verify the catalog compression) ────────────────

describe("LLM prompt construction", () => {
  test("compresses catalog to slug → one-liner per template", async () => {
    let capturedPrompt = "";
    const llmFn = mock(async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({ results: [] });
    });
    await suggestTemplates("vague request", TEMPLATES, { llmFn, threshold: 0.7, limit: 3 });
    // Every slug must appear in the prompt
    for (const t of TEMPLATES) {
      expect(capturedPrompt).toContain(t.slug);
    }
    // The user utterance must be in there too
    expect(capturedPrompt).toContain("vague request");
    // JSON output instruction must be present
    expect(capturedPrompt.toLowerCase()).toContain("json");
  });

  test("includes name + description in the catalog string", async () => {
    let capturedPrompt = "";
    const llmFn = mock(async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({ results: [] });
    });
    await suggestTemplates("vague", TEMPLATES, { llmFn, threshold: 0.7, limit: 3 });
    expect(capturedPrompt).toContain("Tokyo Y2K");
    expect(capturedPrompt).toContain("tokyo-night y2k cinematic");
  });
});
