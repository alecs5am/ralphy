# Library component-system + design-consistency refactor (umbrella)

> **Status:** done — 2026-06-04 (umbrella: children #087-#097 all landed; RemixModal thumb also routed through <Media>; zero bespoke media/card/audio/carousel markup remains in app/library; next build 166 pages + tsc green, no borders, English-only; component audit table in lib/library-v2/MIGRATION.md)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** high
> **Category:** landing / frontend / design-system

## Context

The `/library` surface grew page-by-page (feed, unit detail, block pages,
blueprint modal, recipe/asset detail). Media rendering, unit cards, audio, and
recommendation rails are copy-pasted with subtle drift. The user wants a revision:
extract reusable components, raise design consistency, kill duplicated blocks, and
improve UX. This is the umbrella that ties the concrete issues #087–#097 together.

## What

Audit every page under `landing/app/library/` and factor the repeated UI into a
small set of shared, design-consistent components built on a common base (shadcn,
#087). Eliminate per-page duplication; one component per concept used everywhere.

The concrete pieces (filed separately):
- #087 install shadcn/ui as the component base.
- #088 shared `<Media>` (image/video, aspect-preserving, click→lightbox).
- #089 shared `<UnitCard>` (dedup the copied unit tiles).
- #090 `<Carousel>` for recommendation rows.
- #091 `<AudioPlayer>` (designed, replaces default `<audio>`).
- #092 main-feed infinite scroll + perf.
- #093 main-feed tag cloud.
- #094 unit-page full block-recommendation rails.
- #095 blueprint-modal download bug.
- #096 use-in-ralphy refinement.
- #097 Supabase-API library-wide verification.

## Why it matters

Consistency + dedup lowers maintenance cost and bug surface (the sizing/placeholder
bugs we just fixed were per-page divergence), and a coherent component system makes
every future library page cheap + correct by default.

## Scope / acceptance

- A component audit of `landing/app/library/**`: list every duplicated UI concept
  (media tiles, unit cards, chips, modals, players, rails) and the single shared
  component each collapses to.
- After #087–#095 land, no library page renders media / unit cards / audio / a
  carousel with bespoke per-page markup — all go through the shared components.
- `landing` `bunx next build` + `bunx tsc --noEmit` green; no visible borders
  (memory rule); English-only.

## Notes

- Concretizes the design-stage #054 (library redesign at scale), #065 (units feed),
  #066 (unit-detail IA) now that library-v2 is BUILT.
- Execution order: #087 (foundation) → #088/#089/#090/#091 (components) →
  #092/#093/#094 (feed + unit-page features, consume the components) →
  #095/#096 (UX fixes) → #097 (verify against the Supabase API when it lands).
