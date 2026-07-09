# Long-horizon topic dedup against published history

> **Status:** done — 2026-07-09 (lexical-primary long-horizon topic dedup w/ embedding seam, no new provider: topic-index.ts signature (token+shingle Jaccard) + append-only topic-index.jsonl (45d window, 0.5 block / 0.35 follow-up); consulted in dedupExecutor after the #500 same-item filter → topic-duplicate-skip event, suppress default / param-gated follow-up; recordCoveredTopic writes ONLY on publish success (stale-drops record nothing, #542 consistent); surfaced in farm report + campaign status. 23 tests.)
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** high
> **Category:** ingestion / quality / content-farm

## Context

The dedup store (#500) prevents re-ingesting the SAME source item within a
tick's dedup window — url/content-hash, short horizon. It does NOT stop the
farm from covering the SAME TOPIC twice across weeks from two different source
items (a story that resurfaces, a follow-up article, the same launch reported
by three outlets). For a news farm this is the #1 self-embarrassment: three
near-identical "OpenAI launched X" shorts a week apart.

## What

A published-history topic index the ingestion/selection path consults before
committing a source item to production: an embedding (or strong lexical)
similarity check of a candidate item against the workspace's already-produced/
published units over a long window; above a similarity threshold, the candidate
is suppressed (or routed to an "update/follow-up" angle instead of a fresh
duplicate). The index is built from unit metadata + source facts, workspace-
scoped, append-only.

## Why it matters

Topic repetition reads as a low-effort bot channel and burns audience trust and
budget. Long-horizon dedup is what makes a high-frequency news farm look like a
curated channel rather than an RSS-to-video regurgitator.

## Scope / acceptance

- Topic signature per produced unit: title + key claims + entities +
  source-fact digest -> an embedding (via the existing LLM/embedding provider
  path) plus a lexical fallback when embeddings are unavailable.
- Published-history index (`.ralphy/workspaces/<ws>/topic-index.jsonl`,
  append-only) covering a configurable window (default e.g. 30-60 days).
- Ingestion/selection consult: a candidate above the similarity threshold is
  suppressed with a journal event (`topic-duplicate-skip`) carrying the prior
  unit it matched; a near-but-not-identical match can route to a follow-up
  angle (param-gated, default suppress).
- Threshold + window configurable per workspace + bundled defaults (#502);
  conservative default (favor suppression).
- Surfaced: `campaign status` (#528) and `farm report` (#518) show suppressed
  duplicates so the operator sees what was skipped and why (silent suppression
  reads as coverage gaps otherwise).
- Tests: exact-topic suppression, cross-source same-story suppression,
  distinct-topic pass, follow-up routing, window expiry (old topic no longer
  blocks), lexical fallback path.

## Notes

- Sequence after #500 and the article/campaign tranche (#526/#528) for the
  full cross-format story; the video-only version is useful standalone.
- Embedding cost is tiny; still route through the connector discipline, no
  ad-hoc calls.
