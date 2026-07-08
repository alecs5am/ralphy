# Postiz scheduled-post reconcile for the publish ledger

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** medium
> **Category:** publishing / correctness

## Context

The publish exactly-once ledger (#531) guards against double-posting with a
per-workspace append-only ledger (`.ralphy/workspaces/<ws>/publish-ledger.jsonl`):
before firing a target we check the ledger, and right after the platform accepts
we append the ledger record (belt), ahead of the unit-manifest provenance append.

The #531 spec asked for a SECOND belt: a remote confirm against Postiz's
already-scheduled state before deciding to publish (belt-and-suspenders — ledger
first, remote confirm second). The Postiz public API connector
(`cli/lib/providers/postiz.ts`) exposes only `GET /integrations`, `POST /upload`,
`POST /posts`, and `GET /analytics/post/{postId}` — there is NO scheduled-post
LOOKUP / list endpoint documented. So #531 shipped LEDGER-ONLY and this issue
tracks the missing remote confirm.

## What

Add a Postiz scheduled-post lookup to the connector (if/when the public API
documents one) and wire it into `publishUnit` as the second reconcile belt:
after the ledger check misses, query Postiz for an already-scheduled post
matching this (unit, target, slot) and skip if one exists.

## Why it matters

The ledger-only guard leaves a small crash window: if the process dies AFTER
Postiz accepts the post but BEFORE `appendPublishLedger` returns, the ledger
has no record and a re-run WILL re-fire that one target — a double-post. The
window is the single `fs.appendFileSync` between platform-accept and the ledger
record. A remote confirm closes it: even with no ledger record, the re-run
would see the already-scheduled post and skip.

## Scope / acceptance

- Verify against the live Postiz public-API docs whether a scheduled-post
  lookup/list endpoint exists (do NOT invent an undocumented one).
- If it exists: add a tolerant connector fn (mirrors `postizPostAnalytics`),
  then in `publishUnit` reconcile after the ledger miss and before the
  `postizCreatePost` fire; a remote match becomes an `idempotent-skip`.
- If it does not: document the residual crash window in the ledger header and
  keep this issue open pending a Postiz API change.
- Tests: crash-after-accept-before-ledger reconciled via the remote confirm
  (zero-network mock, mirror `tests/unit/publish-ledger.test.ts`).

## Notes

- Filed as the documented gap fallback per #531's scope note.
- Sequence after #531 (`cli/lib/publish/ledger.ts`).
- **Also unguarded by #531:** the `x-post` node executor
  (`cli/lib/workflow/executors/publish.ts` `xPostExecutor`) fires
  `postizCreatePost` directly rather than through `publishUnit`, so it bypasses
  the exactly-once ledger entirely — a resumed/retried x-post thread can
  double-post. Closing it means threading the same `publishIdempotencyKey` +
  `findLedgerEntry` + `appendPublishLedger` guard through that executor. Small,
  but a real hole in the "only irreversible node class" guarantee.
