---
id: 12.01.01
status: todo
v1_0: yes
category: 12-deep-research
topic: "12.01 Stage 1 — verifier + registry"
title: "Deterministic 5-level citation verifier"
---

# 12.01.01 — Deterministic 5-level citation verifier

**v1.0:** yes

**Hypothesis:** A pure-TypeScript matcher that walks five normalization levels — exact / truncation / prefix / child-path / query-subset — can resolve cited URLs against an append-only source registry, return the match level for valid citations, and flag 100% of fabricated URLs, with no LLM in the verification loop.

**Acceptance criteria:**

- `cli/lib/research/citation-verifier.ts` exports `normalizeUrl(url)`, `matchCitation(citation, registry)`, and `verifyCitations(citations, registry)`.
- `matchCitation` returns `{ level, source } | null` where `level ∈ { "exact", "truncation", "prefix", "child-path", "query-subset" }`.
- `verifyCitations(citations, registry)` returns `{ matched: MatchedCitation[], unmatched: string[], byLevel: Record<MatchLevel, number> }`.
- `tests/unit/research-citation-verifier.test.ts` covers ≥3 fixtures per match level + ≥5 fabricated citations that must land in `unmatched`.
- `bun test tests/unit/research-citation-verifier.test.ts` exits 0.
- No LLM dependency; no network; no filesystem reads from inside the verifier.

**Implementation:** to land in this task.

**Notes:**

- The five-level scheme follows NVIDIA AI-Q v2's verifier, documented in [`docs/research/deep-research-architecture-foundations.md`](../../docs/research/deep-research-architecture-foundations.md) §6. Failure mode the verifier exists to prevent: 3–13% fabricated URLs from the synthesis model (Rao et al., arXiv 2604.03173).
- This task is the first of Stage 1 in [`roadmap/12-deep-research/PRD.md`](../12-deep-research/PRD.md). Follow-ups: append-only source registry IO, URL extractor for citation strings inside markdown, single-shot `ralphy research run` wiring.
- Pure-function module. No CLI verbs yet — wiring lands in a later task once the registry exists.
