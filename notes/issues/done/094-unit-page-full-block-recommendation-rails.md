# Unit page — full block-recommendation rails (more in type / tag / template / …)

> **Status:** done — 2026-06-04 (page.tsx buildRails computes per-dimension rails IN-MEMORY from one getUnits()+getBlocks() — template→each tag→each recipe→each asset→format, deduped across rails via a seen set, self-excluded, capped 12, empties dropped; MoreFrom renders N rails as UnitRail/Carousel; no per-id source calls; next build SSGs all 42 unit pages green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium-high
> **Category:** landing / frontend / IA

## Context

The unit page (`/library/u/<id>`) has a `MoreFrom` rail (more from this template /
more with this look-tag). The user wants the page to scroll down into a richer set
of recommendations across ALL the unit's dimensions — "more in this type", "more
in this tag", "more from this template", "uses this recipe", "uses this asset" —
so a visitor can keep discovering related units (the Pinterest browse goal).

## What

Extend the unit page with one recommendation rail PER dimension the unit has:
- more in this **format/type**
- more with each **tag** (the look + any other tags)
- more from this **template**
- units that share each **recipe**
- units that share each **asset** (character/location/prop/music)

Each rail is a `<Carousel>` (#090) of `<UnitCard>`s (#089), only rendered when it
has ≥1 other unit, scrollable below the fold. Order them most-relevant-first; cap
each rail + dedup units across rails so the page doesn't repeat the same unit endlessly.

## Why it matters

Realizes the unit-detail discovery IA (#066) and the user's "scroll down to see
other units" ask — turns each unit page into a browse hub, not a dead end.

## Scope / acceptance

- The unit page renders the per-dimension rails (format / tags / template / recipes
  / assets), each a Carousel of UnitCards, present-only-when-non-empty, deduped.
- Reuses the loader relations (`unitsUsing`, `unitsWithTag`); no N+1 / heavy queries.
- `bunx next build` green; no borders.

## Notes

- Depends on #089 (UnitCard) + #090 (Carousel). Concretizes #066 (unit-detail IA)
  now that the page is built. Replaces/extends the current single MoreFrom rail.
  Part of #086.
