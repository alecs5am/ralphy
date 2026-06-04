# Shared `<UnitCard>` component — dedup the copied unit tiles

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend / design-system

## Context

Unit tiles render in several places — the main feed (`LibraryListing`), the
block-page "units that use this" grid (`BlockUnits`), and the unit-page "more
from" rails (`MoreFrom`). The user suspects the tile markup is copy-pasted with
drift (the recent full-width-video bug came from exactly this divergence). There
is a `_shared/UnitTile.tsx`, but the surrounding grid/rail wrappers diverge.

## What

Make ONE canonical `<UnitCard>` (tile) + a small set of layout wrappers, used by
every surface that lists units. Audit `UnitTile` + every caller; collapse the
divergent wrappers (feed masonry, block-units grid, more-from rail) onto shared
primitives so a unit tile looks + behaves identically everywhere.

## Why it matters

The sizing/grid bugs we hit were per-caller divergence. One card + shared
wrappers = consistent look, one place to fix, no more "full-width video in one
rail but a tile in another."

## Scope / acceptance

- A single `<UnitCard>` (renders media via `<Media>` #088, title, format chip,
  block/tag chips, hover/remix action) used by `LibraryListing`, `BlockUnits`,
  and `MoreFrom`.
- Layout wrappers consolidated: the feed masonry, the block-units grid, and the
  carousel rail (#090) all consume `<UnitCard>` — no bespoke tile markup per caller.
- No visual/behavior drift between surfaces; `bunx next build` green; no borders.

## Notes

- Depends on #087 + #088. Consumed by #090/#092/#093/#094. Part of #086.
