# Managed cloud factory design seam

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** medium
> **Category:** cloud / design-only

## Context

The approved launch tracks are agent substrate and desktop/chat product. A cloud
media factory is not the immediate build target, but the ideal state includes
producing media in any quantity. The local architecture should not make a future
managed cloud version impossible.

## What

Write a design seam for a future managed Ralphy factory: remote workers, shared
storage, accounts, billing, team permissions, job queues, asset CDN, library
sync, and direct publishing. This is design-only until the local substrate and
desktop product prove the workflow.

## Why it matters

Some decisions made for the local CLI can block later scaling if not named
early: path assumptions, auth, provider secrets, job ids, artifact URIs,
workspace identity, and billing ownership.

## Scope / acceptance

1. **Design doc.** Add a design note under `docs/architecture/` describing the
   future cloud boundary and what must remain portable in the local system.
2. **Non-goals.** Explicitly state that this does not implement cloud workers,
   accounts, or billing now.
3. **Portability checklist.** Identify local assumptions that future cloud work
   would need to abstract: filesystem paths, process spawning, provider keys,
   queue state, artifact serving, and user approvals.
4. **API sketch.** Sketch job, artifact, Unit, spend, and workspace APIs at a
   high level.
5. **Risk list.** Capture security, cost-control, abuse, copyright, and platform
   publishing risks.
6. **Decision hooks.** Link back to #452, #453, #460, and #461 so local work can
   keep the seam in mind.

## Dependencies and linked work

- Agent substrate: #452.
- Desktop MVP: #453.
- Scale operations: #460.
- Universal artifact model: #461.

## Notes

- Do not build this before the local/desktop product proves repeatable quality.
  This issue exists to prevent architectural dead ends.
