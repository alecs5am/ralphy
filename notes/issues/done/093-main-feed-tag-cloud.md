# Main feed — tag cloud under the format cards (counts, sorted desc)

> **Status:** done — 2026-06-04 (TagCloud under format cards: counted chips sorted count-desc, top-24 + show-all expander, active tag always shown; clicking toggles the existing ?tag= filter; facet derived in page.tsx from loaded units so it tracks static-or-Supabase source; next build green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend

## Context

The `/library` main page has the format-type cards (All + 8 formats). The user
wants a tag cloud BELOW them: each tag shows the count of units carrying it, sorted
by count descending, so users can quickly find the popular looks/formats. The TAGS
facet (`unitsWithTag` + counts) already exists in the loader (#082 + the Style→tag
demotion), and tag chips already deep-link to `?tag=`.

## What

Render a tag-cloud row/section under the format cards on the main feed: every
distinct unit tag as a chip with its unit count, sorted count-descending. Clicking
a tag filters the feed via the existing `?tag=` filter. Cap the visible set (top-N
with a "show all" expander) so the cloud doesn't overwhelm.

## Why it matters

Tags are now the look/descriptor axis (post Style→tag); a sorted, counted cloud is
the fast path to popular content — the discovery affordance the user asked for.

## Scope / acceptance

- A tag-cloud section under the format cards in `LibraryListing` (or the feed
  header), reading the loader's TAGS facet (tag + count), sorted desc, top-N +
  expand.
- Clicking a tag sets `?tag=` (reuses the existing filter); active tag reflected.
- No borders; `bunx next build` green.

## Notes

- Depends on the TAGS facet (already shipped) + the `?tag=` filter (already
  shipped). Pairs with #092. Part of #086. Concretizes the tag-facet intent in #065.
