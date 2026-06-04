# Template detail = results/showcase gallery + copy-tag

> **Status:** SUPERSEDED — 2026-06-05 by the unit/blueprint detail pages (#094/#095/#096)
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / data-model

## Context

A template's value is proven by the work made with it. The user's vision: open
the "analog horror" template and see 1000+ videos produced from it. Today a
template detail page shows the recipe, not the outputs.

## What

Give every template detail page a **results gallery** of concrete outputs made
with that template, plus a prominent **copy-tag** action.

## Scope / acceptance

1. **Results data model**: each template references a list of showcase outputs
   (video/image/carousel) with thumbnail, optional caption, optional source
   project id. Stored alongside the template (e.g. `showcase/` manifest) and/or
   pulled from `ralphy-assets`. Must scale to many entries (paginated/lazy).
2. **Detail page** (`landing/app/library/[slug]`): hero recipe + masonry results
   grid (lazy-loaded, lightbox). Style templates also surface their parent
   general template and sibling styles.
3. **Copy-tag button**: copies the exact reproduce command/tag, e.g.
   `@template:<slug>` or `ralphy template use <slug> --project <id> --brief "..."`,
   pre-filled so the user only swaps in their data + refs. Confirm round-trips
   with the CLI verb.
4. Seed galleries from the templates extracted in `058`.

## Why it matters

Social proof + instant reproduce is the conversion moment. "Show me 1000 videos
from this template, then let me copy one tag and make my own" is the core loop.

## Notes

- Depends on `052` + `054`. Showcase assets are heavy → likely live in
  `ralphy-assets` (coordinate with the `059` split plan).
