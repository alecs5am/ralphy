# Normalize the 23 recipe blocks into real-recipes vs tags + prune dup

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues

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
