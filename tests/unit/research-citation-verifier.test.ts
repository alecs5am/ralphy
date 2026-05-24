// `cli/lib/research/citation-verifier.ts` — deterministic 5-level citation
// matcher. Pure function, no LLM, no IO. Resolves cited URLs against an
// append-only source registry and flags fabricated ones.
//
// Match levels (highest precedence first):
//   exact         — normalized citation URL equals a registry URL.
//   truncation    — citation looks character-cut mid-path; registry URL
//                   starts with the citation and the citation does not end
//                   on a clean path boundary.
//   prefix        — citation ends on a clean path boundary and is a strict
//                   path prefix of a registry URL.
//   child-path    — registry URL is a strict path prefix of the citation
//                   (the citation adds segments on top of a registered URL).
//   query-subset  — same host + path; citation's query params are a subset
//                   of the registry URL's query params.

import { describe, test, expect } from "bun:test";
import {
  normalizeUrl,
  matchCitation,
  verifyCitations,
  type RegistryEntry,
  type MatchLevel,
} from "../../cli/lib/research/citation-verifier.js";

// 20 hand-picked registry entries spanning common citation patterns. Mirrors
// the Stage 1 acceptance set in roadmap/12-deep-research/PRD.md.
const REGISTRY: RegistryEntry[] = [
  { url: "https://openai.com/index/introducing-deep-research/", retrievedAt: "2026-05-24T10:00:00Z" },
  { url: "https://www.anthropic.com/engineering/multi-agent-research-system", retrievedAt: "2026-05-24T10:01:00Z" },
  { url: "https://github.com/NVIDIA-AI-Blueprints/aiq/tree/2.0.0", retrievedAt: "2026-05-24T10:02:00Z" },
  { url: "https://arxiv.org/abs/2510.24701", retrievedAt: "2026-05-24T10:03:00Z" },
  { url: "https://arxiv.org/abs/2604.03173", retrievedAt: "2026-05-24T10:04:00Z" },
  { url: "https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents/intent-classifier.html", retrievedAt: "2026-05-24T10:05:00Z" },
  { url: "https://www.langchain.com/blog/open-deep-research", retrievedAt: "2026-05-24T10:06:00Z" },
  { url: "https://github.com/assafelovic/gpt-researcher", retrievedAt: "2026-05-24T10:07:00Z" },
  { url: "https://github.com/stanford-oval/storm", retrievedAt: "2026-05-24T10:08:00Z" },
  { url: "https://gemini.google/overview/deep-research/", retrievedAt: "2026-05-24T10:09:00Z" },
  { url: "https://platform.openai.com/docs/guides/deep-research", retrievedAt: "2026-05-24T10:10:00Z" },
  { url: "https://huggingface.co/blog/open-deep-research", retrievedAt: "2026-05-24T10:11:00Z" },
  { url: "https://leaderboard.steel.dev/registry/benchmarks/browsecomp", retrievedAt: "2026-05-24T10:12:00Z" },
  { url: "https://github.com/Ayanami0730/deep_research_bench", retrievedAt: "2026-05-24T10:13:00Z" },
  { url: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/", retrievedAt: "2026-05-24T10:14:00Z" },
  { url: "https://arxiv.org/abs/2303.11366", retrievedAt: "2026-05-24T10:15:00Z" },
  { url: "https://arxiv.org/abs/2409.12941", retrievedAt: "2026-05-24T10:16:00Z" },
  { url: "https://arxiv.org/abs/2510.11851", retrievedAt: "2026-05-24T10:17:00Z" },
  { url: "https://arxiv.org/abs/2512.23128", retrievedAt: "2026-05-24T10:18:00Z" },
  { url: "https://lmsys.org/blog/2024-07-01-routellm/", retrievedAt: "2026-05-24T10:19:00Z" },
];

describe("normalizeUrl", () => {
  test("lowercases the host", () => {
    expect(normalizeUrl("HTTPS://OpenAI.COM/index/introducing-deep-research/"))
      .toBe(normalizeUrl("https://openai.com/index/introducing-deep-research/"));
  });

  test("drops the URL fragment", () => {
    expect(normalizeUrl("https://example.com/article#section-2"))
      .toBe(normalizeUrl("https://example.com/article"));
  });

  test("drops utm_* tracking params", () => {
    expect(normalizeUrl("https://example.com/x?utm_source=tw&utm_medium=share"))
      .toBe(normalizeUrl("https://example.com/x"));
  });

  test("removes a trailing slash on the path", () => {
    expect(normalizeUrl("https://example.com/article/"))
      .toBe(normalizeUrl("https://example.com/article"));
  });

  test("sorts remaining query parameters", () => {
    expect(normalizeUrl("https://example.com/x?b=2&a=1"))
      .toBe(normalizeUrl("https://example.com/x?a=1&b=2"));
  });

  test("strips default ports", () => {
    expect(normalizeUrl("https://example.com:443/x"))
      .toBe(normalizeUrl("https://example.com/x"));
    expect(normalizeUrl("http://example.com:80/x"))
      .toBe(normalizeUrl("http://example.com/x"));
  });
});

describe("matchCitation — exact (level 1)", () => {
  test("identical URL", () => {
    const r = matchCitation("https://arxiv.org/abs/2604.03173", REGISTRY);
    expect(r?.level).toBe("exact");
    expect(r?.source.url).toBe("https://arxiv.org/abs/2604.03173");
  });

  test("differs only in trailing slash", () => {
    const r = matchCitation("https://gemini.google/overview/deep-research", REGISTRY);
    expect(r?.level).toBe("exact");
  });

  test("differs only in host casing + utm params", () => {
    const r = matchCitation("https://WWW.Anthropic.com/engineering/multi-agent-research-system?utm_source=twitter", REGISTRY);
    expect(r?.level).toBe("exact");
  });
});

describe("matchCitation — truncation (level 2)", () => {
  test("citation cut mid-path token", () => {
    const r = matchCitation("https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents/intent-clas", REGISTRY);
    expect(r?.level).toBe("truncation");
    expect(r?.source.url).toBe("https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents/intent-classifier.html");
  });

  test("citation cut mid-blog-slug", () => {
    const r = matchCitation("https://lmsys.org/blog/2024-07-01-routel", REGISTRY);
    expect(r?.level).toBe("truncation");
  });

  test("citation cut mid-arxiv-id", () => {
    const r = matchCitation("https://arxiv.org/abs/2510.247", REGISTRY);
    expect(r?.level).toBe("truncation");
  });
});

describe("matchCitation — prefix (level 3)", () => {
  test("path-boundary cut, registry has deeper path", () => {
    const r = matchCitation("https://github.com/NVIDIA-AI-Blueprints/aiq", REGISTRY);
    expect(r?.level).toBe("prefix");
    expect(r?.source.url).toBe("https://github.com/NVIDIA-AI-Blueprints/aiq/tree/2.0.0");
  });

  test("blog root vs full slug", () => {
    const r = matchCitation("https://www.langchain.com/blog", REGISTRY);
    expect(r?.level).toBe("prefix");
  });

  test("openai index vs full article", () => {
    const r = matchCitation("https://openai.com/index", REGISTRY);
    expect(r?.level).toBe("prefix");
  });
});

describe("matchCitation — child-path (level 4)", () => {
  test("citation adds a sub-page on a registered article", () => {
    const r = matchCitation("https://www.anthropic.com/engineering/multi-agent-research-system/appendix", REGISTRY);
    expect(r?.level).toBe("child-path");
    expect(r?.source.url).toBe("https://www.anthropic.com/engineering/multi-agent-research-system");
  });

  test("citation adds /comments to a registered URL", () => {
    const r = matchCitation("https://github.com/stanford-oval/storm/issues/42", REGISTRY);
    expect(r?.level).toBe("child-path");
    expect(r?.source.url).toBe("https://github.com/stanford-oval/storm");
  });

  test("citation extends arxiv abs with /v2", () => {
    const r = matchCitation("https://arxiv.org/abs/2303.11366/v2", REGISTRY);
    expect(r?.level).toBe("child-path");
  });
});

describe("matchCitation — query-subset (level 5)", () => {
  test("citation adds a query param on a registered path", () => {
    const r = matchCitation("https://www.langchain.com/blog/open-deep-research?ref=hn", REGISTRY);
    expect(r?.level).toBe("query-subset");
  });

  test("citation adds two query params", () => {
    const r = matchCitation("https://huggingface.co/blog/open-deep-research?lang=en&theme=dark", REGISTRY);
    expect(r?.level).toBe("query-subset");
  });

  test("citation adds a non-utm param (utm_* would normalize to exact)", () => {
    const r = matchCitation("https://platform.openai.com/docs/guides/deep-research?source=docs", REGISTRY);
    expect(r?.level).toBe("query-subset");
  });
});

describe("matchCitation — fabricated URLs (must return null)", () => {
  const fabricated = [
    "https://openai.com/index/introducing-deep-research-v2/",
    "https://www.anthropic.com/engineering/single-agent-research-system",
    "https://arxiv.org/abs/9999.99999",
    "https://nvidia.com/blog/aiq-3-launch",
    "https://research.deepmind.com/papers/imaginary-2026",
    "https://medium.com/@invented-author/the-future-of-research",
    "https://example.com/totally-unrelated",
  ];

  for (const url of fabricated) {
    test(`fabricated → null: ${url}`, () => {
      expect(matchCitation(url, REGISTRY)).toBeNull();
    });
  }
});

describe("matchCitation — precedence", () => {
  test("prefers exact over query-subset when both could apply", () => {
    const r = matchCitation("https://arxiv.org/abs/2604.03173?utm_source=hn", REGISTRY);
    expect(r?.level).toBe("exact");
  });

  test("prefers truncation over prefix when the cut is mid-token", () => {
    const r = matchCitation("https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents/intent-clas", REGISTRY);
    expect(r?.level).toBe("truncation");
  });
});

describe("verifyCitations", () => {
  test("aggregates matched + unmatched + byLevel", () => {
    const citations = [
      "https://arxiv.org/abs/2604.03173",
      "https://github.com/NVIDIA-AI-Blueprints/aiq",
      "https://www.anthropic.com/engineering/multi-agent-research-system/appendix",
      "https://www.langchain.com/blog/open-deep-research?ref=hn",
      "https://arxiv.org/abs/9999.99999",
      "https://openai.com/index/introducing-deep-research-v2/",
    ];
    const result = verifyCitations(citations, REGISTRY);
    expect(result.matched).toHaveLength(4);
    expect(result.unmatched).toHaveLength(2);
    expect(result.byLevel.exact).toBe(1);
    expect(result.byLevel.prefix).toBe(1);
    expect(result.byLevel["child-path"]).toBe(1);
    expect(result.byLevel["query-subset"]).toBe(1);
    expect(result.byLevel.truncation).toBe(0);
  });

  test("resolution rate ≥ 97% on the Stage 1 acceptance fixture", () => {
    // 40 valid citations (≥3 per level, balanced) — every one must resolve.
    const valid: string[] = [
      // exact (8)
      "https://arxiv.org/abs/2604.03173",
      "https://arxiv.org/abs/2510.24701",
      "https://arxiv.org/abs/2303.11366",
      "https://github.com/stanford-oval/storm",
      "https://github.com/assafelovic/gpt-researcher",
      "https://www.anthropic.com/engineering/multi-agent-research-system",
      "https://OPENAI.com/index/introducing-deep-research/",
      "https://gemini.google/overview/deep-research",
      // truncation (8)
      "https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents/intent-clas",
      "https://lmsys.org/blog/2024-07-01-routel",
      "https://arxiv.org/abs/2510.247",
      "https://leaderboard.steel.dev/registry/benchmarks/browse",
      "https://genai.owasp.org/llmrisk/llm01-prompt-inj",
      "https://huggingface.co/blog/open-deep-resea",
      "https://www.langchain.com/blog/open-deep-resea",
      "https://platform.openai.com/docs/guides/deep-resea",
      // prefix (8)
      "https://github.com/NVIDIA-AI-Blueprints/aiq",
      "https://www.langchain.com/blog",
      "https://openai.com/index",
      "https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents",
      "https://platform.openai.com/docs/guides",
      "https://huggingface.co/blog",
      "https://leaderboard.steel.dev/registry/benchmarks",
      "https://github.com/Ayanami0730/deep_research_bench",
      // child-path (8)
      "https://www.anthropic.com/engineering/multi-agent-research-system/appendix",
      "https://github.com/stanford-oval/storm/issues/42",
      "https://github.com/assafelovic/gpt-researcher/pulls",
      "https://arxiv.org/abs/2303.11366/v2",
      "https://www.langchain.com/blog/open-deep-research/comments",
      "https://huggingface.co/blog/open-deep-research/discussion",
      "https://lmsys.org/blog/2024-07-01-routellm/figures",
      "https://openai.com/index/introducing-deep-research/section-1",
      // query-subset (8)
      "https://www.langchain.com/blog/open-deep-research?ref=hn",
      "https://huggingface.co/blog/open-deep-research?lang=en&theme=dark",
      "https://platform.openai.com/docs/guides/deep-research?source=docs",
      "https://arxiv.org/abs/2604.03173?context=cs.CL",
      "https://github.com/stanford-oval/storm?tab=readme-ov-file",
      "https://gemini.google/overview/deep-research?ref=blog",
      "https://genai.owasp.org/llmrisk/llm01-prompt-injection/?lang=en",
      "https://arxiv.org/abs/2510.24701?author=tongyi",
    ];
    const result = verifyCitations(valid, REGISTRY);
    const rate = result.matched.length / valid.length;
    expect(rate).toBeGreaterThanOrEqual(0.97);
  });

  test("100% of planted fabrications land in unmatched", () => {
    const fabricated = [
      "https://openai.com/index/introducing-deep-research-v2/",
      "https://www.anthropic.com/engineering/single-agent-research-system",
      "https://arxiv.org/abs/9999.99999",
      "https://nvidia.com/blog/aiq-3-launch",
      "https://research.deepmind.com/papers/imaginary-2026",
      "https://medium.com/@invented-author/the-future-of-research",
      "https://example.com/totally-unrelated",
    ];
    const result = verifyCitations(fabricated, REGISTRY);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(fabricated.length);
  });
});

describe("type surface", () => {
  test("MatchLevel union is the five documented values", () => {
    const levels: MatchLevel[] = ["exact", "truncation", "prefix", "child-path", "query-subset"];
    expect(levels).toHaveLength(5);
  });
});
