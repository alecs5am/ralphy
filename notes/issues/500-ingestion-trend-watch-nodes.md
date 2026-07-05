# Ingestion nodes and scheduled trend-watch

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** medium
> **Category:** research / ingestion / orchestration

## Context

The farm's entry point is "ralphy watches sources and decides what to make"
(`docs/architecture/farm-node-graph.md`, node category D). Research substrate
exists (`ralphy research run`, `ref pull`, scrape-profile) but is pull-only and
session-driven; there is no scheduled delta-detection ("what's new since the
last tick") and no normalized item shape downstream nodes can consume.

## What

Implement the ingestion node family: `web-scrape` (firecrawl), `actor` (apify
actor id + input), `rss` (native, since-cursor), and the composite
`trend-watch` (topics + schedule + dedup window, emits only the delta). All
emit a normalized `source-item` (url, title, text, ts, source, engagement
signals). Plus a persistent `dedup` store so the farm never makes two videos
about the same news item.

## Why it matters

Without delta-detection ingestion the farm is a renderer, not a farm — the
user is back to hand-feeding ideas. Normalization keeps downstream nodes
source-agnostic so a workspace can swap X for RSS without touching the graph.

## Scope / acceptance

- `source-item` schema in `cli/lib/schemas/` + a normalizer per backend.
- Firecrawl + apify connectors follow the registered-connector discipline
  (own `envVar`, no ad-hoc curl; invariant #1 pattern like `fal.ts`).
- `rss` backend has no key and works offline against fixture feeds.
- `trend-watch` composes the backends: per-topic queries, `since` cursor
  persisted per workspace, `dedup_window`, output = fresh items only.
- Dedup store: content-hash + url seen-set, workspace-scoped, append-only.
- Node executors registered against the #498 types; runnable standalone via
  `ralphy workflow run-node` or equivalent debug verb for testing.
- Tests: normalization per backend (fixtures), cursor advance, dedup across
  ticks, empty-delta tick is a no-op (no downstream spend).

## Notes

- Sequence after #498. Consumed by #503 (scheduler ticks) and #509 (pilot).
- `http` generic node: include only with an allowlisted-hosts param, or defer —
  implementer's call, note the choice.
