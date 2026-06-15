# Queue daemon production hardening

> **Status:** done — 2026-06-15
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Several postmortems hit queue/daemon pain: image jobs triggered OpenRouter burst caps, global concurrency did not match endpoint realities, failed jobs were hard to retry by tag, pending jobs were hard to cancel in bulk, and queue summaries hid the slot/prompt needed for diagnosis. Some underlying pieces are already fixed by #005 and #024, but the queue daemon still needs production ergonomics.

## What

Harden the queue daemon for real creative batches: endpoint-aware scheduling, min-interval throttles, retry/cancel by tag, better failure summaries, and provider-specific hints for burst-cap errors.

## Why it matters

Chat-native content farms need reliable batch execution. If the queue fails silently or requires hand-written bash to recover, agents will bypass it and lose provenance, cost rollups, and repeatability.

## Scope / acceptance

- Add endpoint/model-aware scheduling defaults: image, video, voice, music, captions, and eval.
- Add queue min-interval/backoff behavior for burst-cap-prone endpoints.
- Add `queue retry --tag <tag> --state failed` or equivalent.
- Add `queue cancel --tag <tag> --state pending` or equivalent.
- Expand `queue list --json` summaries with slot, model, ref count, prompt preview, attempts, and last error.
- Rewrite known OpenRouter burst-cap messages into actionable hints.
- Add tests with fixture jobs covering retry, cancel, summary shape, and burst-cap classification.

## Notes

- Related done work: #005 transient retries and #024 batch/variants.
- Sources: TakeAMinute, Analog Horror PSA, and App Store image-pack postmortems.
