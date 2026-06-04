# `<Carousel>` component for recommendation rails (replace raw horizontal scroll)

> **Status:** done — 2026-06-04 (zero-dep scroll-snap <Carousel>: prev/next scrollBy + drag + keyboard + end-detection + graceful small-count wrap; swapped into UnitRail internals, MoreFrom unchanged; rail-item fixed width re-supplied; no new deps — registry-flaky, embla avoided; next build green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend / design-system

## Context

The unit-page recommendation rails ("more from this template", etc) are a raw
horizontal-scroll row of unit cards. The user wants a proper Carousel component
(prev/next controls, snap, keyboard/drag) instead of a bare overflow-scroll.

## What

A reusable `<Carousel>` (built on shadcn / embla-carousel, the shadcn-recommended
base) that holds a row of `<UnitCard>`s (#089) with: snap scrolling, prev/next
buttons, drag, keyboard nav, and graceful wrap on small counts. Used for every
horizontal recommendation rail in the library.

## Why it matters

A bare horizontal scroll is poor UX (no affordance, no controls); a real carousel
makes the recommendation rows discoverable + navigable, consistent across the site.

## Scope / acceptance

- `landing/app/library/_shared/Carousel.tsx` (embla or shadcn carousel) rendering
  `<UnitCard>` children with prev/next + snap + drag + keyboard.
- The unit-page rails (#093 / `MoreFrom`) use `<Carousel>` instead of raw
  `overflow-x` scroll.
- No visible borders; `bunx next build` green; works at all viewport widths.

## Notes

- Depends on #087 + #089. Consumed by #093 + `MoreFrom`. Part of #086.
