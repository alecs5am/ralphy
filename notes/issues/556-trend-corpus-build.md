# Trend corpus build: ingest, refresh, outliers, cohorts

> **Status:** todo (blocked on #555)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / trend-watch

## Context

Implementation half of #555. The design doc from #555 decides sources and schema; this issue builds it.

## What

- SQLite tables for creators, videos, metric snapshots, cohorts, and digests (#557), under the domain store.
- Ingest from the methods #555 selects, idempotent on platform video id.
- A scheduled refresh that re-snapshots metrics for videos younger than N days and discovers new ones.
- An outlier score per video: each metric against the creator's rolling median, normalized by age.
- Cohort labels (niche, format, hook type, length band, creator size band); deterministic where possible, LLM classification through `callLLM()` where not.
- Query verbs, e.g. `ralphy trends top --niche <n> --since 14d --by outlier`, `ralphy trends creator <handle>`.

## Scope / acceptance

- Corpus reaches 10,000 videos in one niche end-to-end, then the path to 100k+ is shown as a cost and time projection from real runs.
- The refresh job runs headless and is safe to re-run.
- `ralphy trends top` returns ranked videos with outlier score, metrics, cohort labels and a digest link.
- Integration tests on fixture data; `bun run lint` and `bun test` pass.
- `docs/cli-surface.generated.md` regenerated.

## Notes

- Sequence after #555. Content-plan work (intake, producer) reads from this.
