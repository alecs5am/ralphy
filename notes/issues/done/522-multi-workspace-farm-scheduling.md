# Multi-workspace farm: fair scheduling and provider rate limits

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** runtime / operations / scale

## Context

`ralphy farm start` (#503) drives one workspace per process, and nothing
coordinates provider pressure across concurrent work: two workspaces (or one
workspace's parallel branches after #510) can pile onto the same provider,
hitting rate limits that today surface as opaque node failures. Known
provider concurrency facts live in memory ("seedance i2v parallelizes ~8
wide", "concurrency cap of 1 only applies to multi-block extend") and in
scattered `concurrency.ts` logic, not in a place the runner consults.

## What

1. **One daemon, N workspaces** — `ralphy farm start` (no `--workspace`) runs
   every farm-enabled workspace: per-workspace tick queues, round-robin
   dispatch, per-workspace budget/trust isolation (already enforced by
   #481/#505 — verify under concurrency), `farm status` grouped by workspace.
2. **Provider concurrency budgets** — per-connector (optionally per
   (model, capability)) max-in-flight declared in the connector registry,
   seeded from the documented facts; a shared semaphore in the daemon gates
   node dispatch; excess queues rather than fails.

## Why it matters

The server story (#506) is "your channels", plural — a user with three
workspaces should not need three deployments, and provider 429s should be a
queueing concern, not a failure mode that wakes anyone up.

## Scope / acceptance

- Daemon refactor: workspace-scoped scheduler state, no cross-workspace
  leakage of budget, trust, dedup, cache; a workspace crash-loop doesn't
  starve siblings (per-workspace backoff).
- Concurrency schema in the registry + seeds (OpenRouter, fal, ElevenLabs,
  seedance-specific width) with `source` citations; unknown = a conservative
  default, logged once.
- Dispatch semaphore honored by all paid executors (#511/#512); queued-on-
  limit is a journal event, not a retry.
- 429/rate-limit provider errors classify as `transient` (#519) and feed the
  limiter (halve in-flight temporarily — simple adaptive rule, documented).
- `farm status` shows per-provider in-flight/queued; report (#518) rolls up
  queue-wait time.
- Tests: two-workspace fixture fairness, semaphore cap under parallel
  branches, isolation of budget halt to its workspace, adaptive backoff on
  simulated 429s.

## Notes

- Sequence after #510 (parallel branches create the pressure) and #503.
- Docker compose (#506) stays one container; multi-workspace is in-process.
