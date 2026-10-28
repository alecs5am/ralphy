# Post-production virtual camera recipes

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / craft library

## Context

The post-production half of camera work, kept separate from prompt vocabulary (#566): moves applied in the edit to footage or stills.

## What

HyperFrames recipes with parameters and previews: punch-in on a beat or word, slow push, handheld shake with seeded noise, whip pan, rotation, parallax on cut-out layers (uses #560 mattes), Ken Burns for stills, and a follow-cam that keeps a tracked subject framed (uses #559 tracks). Each is deterministic under seek.

## Scope / acceptance

- At least 12 recipes in the #563 catalog with previews.
- Editor skill reference that says when each move helps and when it distracts.
- Determinism test: two renders of the same composition are frame-identical.

## Notes

- Sequence after #559 and #563.
