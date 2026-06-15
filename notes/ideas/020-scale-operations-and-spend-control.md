# Scale operations and spend control

> **Status:** idea
> **Filed:** 2026-06-15
> **Folder:** ideas

## Context

"Any amount of media" implies queues, concurrency, budgets, retries, resumability, batch review, and multiple agents. The current local-agent model needs operational discipline before cloud-scale ambitions.

## What

Ralphy should provide production operations for media agents: queue scheduling, endpoint-aware concurrency, spend ledger, approval scopes, retry policies, batch status, worker handoff, progress summaries, artifact browsing, and post-run cost/quality reports. The same primitives should work locally first and later in Desktop or cloud workers.

## Why it matters

High-volume generation without operations creates waste and confusion. At scale, reliability and budget control become part of product quality.

## Notes

- Related issues: #410, #428, #444, #451, #107.
- Local-first milestone: an agent can safely run a 100-Unit batch with budget cap, resumable queue, and clear triage.
- Cloud milestone comes later: shared storage, workers, accounts, billing, and team permissions.
