# Normalize the 23 recipe blocks into real-recipes vs tags + prune dup

> **Status:** partly done (2026-06-04) — enrichment + prune shipped; tag-demotion deferred
> **Filed:** 2026-06-04
> **Folder:** issues

## Done (2026-06-04, live)

- 16 recipes classified REAL and enriched (recipeKind + body + artifact + params),
  5 with live-runnable HyperFrames `demo.html`; published to Supabase + the mirror.
- `choosepath-soundtrack` published with the real soundtrack.mp3 (asset page plays it).
- Dup `choose-path-xfade-master` pruned (DB block row + published.ts mirror).

## Remaining — DECISION NEEDED (deferred)

The 6 pure-descriptor recipes (`rain-overlay`, `lantern-glow`, `halftone`,
`light-leak`, `bloom`, `halation`) were found to be referenced by **20+ catalog
units** (bloom×9, halftone×9, rain-overlay×2, lantern-glow×1) — NOT "no units" as
first assumed. Demoting them to tags is therefore a base-`catalog.ts` migration
across many units + DB `unit_blocks` rewrites. Two options for the user:
(a) **demote** — move them from each unit's `recipeIds` to `tags[]` (catalog.ts +
DB migration, ~20 units); or (b) **enrich** — author real artifacts for them too
(they are standard ffmpeg/CSS effects) and keep them as recipes. Pick one in a
focused follow-up; do not do it blind at session end.

## Context

After #082 lands the model, the 23 live recipe blocks need auditing + enriching.
Most are genuine recipes (chroma-split = ffmpeg rgbashift; play-freeze-fork,
smpte-countdown-disc = HyperFrames death-screen beats; old-radio-ps1-vo = an audio
recipe); a few may be pure descriptors that should be tags.

## What

For each of the 23 recipe blocks:
1. **Classify** real-recipe vs tag (per the #082 definition).
2. **Real recipes** → author `recipeKind` + `body` + `artifact` (sourced from the
   #081 blueprints' `recipes[]` command/params, and from `cli/lib/ffmpeg-recipes.ts`
   for the ffmpeg ones) + a `demo` (embedded HF snippet for HF recipes; before/after
   frames pulled from a unit for ffmpeg/grade recipes).
3. **Tags** → demote: remove from the recipe kind, attach as `tags[]` on the units
   that referenced them.
4. **Prune the dup**: `choose-path-xfade-master` == canonical `ffmpeg-xfade-master`
   — delete the dup from Supabase (DB) + remove from `published.ts`, repoint any
   unit referencing it to `ffmpeg-xfade-master` (the deferred #081 cleanup).
5. Republish the enriched recipe blocks + the demoted tags (publish-entity.ts).

## Acceptance

- Every recipe block on the site is either a real recipe (with body+artifact+demo)
  or has been demoted to a unit tag. No empty `refs:0` recipe with no content.
- `choose-path-xfade-master` gone from DB + mirror; no unit references it.
- `/library/u/choose-magicschool` Chroma Split shows what it is + how to use it.

## Notes

- Depends on #082, #084 (UI to render the enriched recipe). Pairs with #081 (prune).
