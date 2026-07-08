# Publish exactly-once idempotency ledger

> **Status:** todo
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** high
> **Category:** publishing / correctness / content-farm

## Context

The publish executor (#501/#527) records `postId` on success but has no guard
against re-publishing the SAME unit to the SAME target. The runner resumes
from the journal (#503) and retries nodes (#519); a crash after the platform
accepted the post but before the journal recorded it, or a targeted retry of a
partially-succeeded multi-target publish, can double-post. Publishing is
irreversible and outward-facing — the one place in the farm where at-least-
once semantics are unacceptable.

## What

A per-workspace publish ledger keyed by a stable idempotency key
(`workspace + unit-id + target-platform + campaign-cell/slot`). Before any
publish, check the ledger AND reconcile against the platform's/Postiz's
already-scheduled state; skip if already published/scheduled (journal a
`publish-idempotent-skip`), publish + record atomically otherwise. Multi-
target publishes record per target so a retry only fills the missing ones.

## Why it matters

A duplicated YouTube upload or X post is embarrassing, hurts reach (platform
dedup/spam heuristics), and cannot be undone cleanly. Exactly-once is a
correctness invariant for the only irreversible node class in the system.

## Scope / acceptance

- Ledger at `.ralphy/workspaces/<ws>/publish-ledger.jsonl` (append-only):
  {idempotency key, target, postId, scheduledAt, status, ts}.
- Idempotency key derivation documented + stable across resume/retry (NOT
  derived from a timestamp or run id).
- Pre-publish check + post-publish record are ordered so a crash between them
  is recoverable: on restart, reconcile by querying the platform/Postiz for
  the scheduled post before deciding (belt-and-suspenders — ledger first,
  remote confirm second).
- Per-target granularity: a 3-target publish that got 2/3 out records those 2;
  `farm retry` (#519) publishes only the missing target.
- Interacts with cadence resampling (#525): a re-run must reuse the ALREADY
  recorded schedule time, not resample a new one for an already-scheduled post.
- Tests: double-publish blocked, crash-between-accept-and-record reconciled,
  partial multi-target retry, cadence-time stability on re-run.

## Notes

- Sequence after #501/#527 and #519.
- The reconcile query depends on Postiz exposing scheduled-post lookup; if it
  does not, fall back to ledger-only + a documented small double-post window,
  and file the gap.
