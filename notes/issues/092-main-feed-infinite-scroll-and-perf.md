# Main library feed — Pinterest infinite scroll + optimization

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** high
> **Category:** landing / frontend / performance

## Context

The `/library` main feed (`LibraryListing`) currently renders the full unit set in
a JS-packed masonry up front. The user wants Pinterest-style infinite scroll and a
generally optimized main page that scales as the library grows.

## What

Make the main feed an infinite-scroll Pinterest masonry: render an initial page,
load more on scroll (IntersectionObserver sentinel), windowed/virtualized so the
DOM stays light at thousands of units. Optimize the page overall: lazy media (via
`<Media>` #088), avoid re-packing the whole masonry on each append, keep the
`?format=`/`?tag=`/`?q=` filters fast.

## Why it matters

The feed is the primary discovery surface and must stay smooth as Units scale
(the long-standing #054/#065 goal); the current up-front render won't.

## Scope / acceptance

- `LibraryListing` paginates: initial batch + load-more-on-scroll sentinel; the
  masonry appends without a full re-pack; media lazy-loads.
- Filters (`?format`/`?tag`/`?q`) still apply across the full set and stay fast.
- Smooth at a few hundred units now; designed to window/virtualize for thousands.
- `bunx next build` green; no layout shift / borders.

## Notes

- Concretizes the infinite-scroll requirement in #054 + #065 (design-stage) now
  that the feed is built. Consumes `<UnitCard>` (#089) + `<Media>` (#088).
  Pairs with #093 (tag cloud). Part of #086.
