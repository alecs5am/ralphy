# Streamed workspace export for large trend corpora

> **Status:** todo (sequence after #576)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** domain store / portability

## Context

#556 found that `workspace.export` fails with an explicit error at roughly 21k trend videos: the package manifest is capped at 64 MiB. The approved dataset (`docs/research/trend-dataset-spec.md`) needs about 30k videos per niche and four niches, and portable transfer through `workspace.export` / `workspace.import` is the repository's rule for moving state.

## What

A streamed package format for large tables (at least the `trend_*` tables): rows written as chunked NDJSON (or the store's existing chunk mechanism if one fits) with per-chunk hashes, so manifest size no longer grows with row count. Import streams the chunks back and verifies hashes. Small workspaces keep the current format, or the new one is used everywhere if simpler; old packages stay importable.

## Scope / acceptance

- Export and import of a 120k-video synthetic corpus succeed with bounded memory; round trip is row-identical for every exported table (baseline caches excluded as today).
- Packages from the current format still import.
- Store, portable and migration tests pass; `docs/domain-store.md` updated.
