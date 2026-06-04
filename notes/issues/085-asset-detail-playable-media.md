# Asset detail page — playable media (music player, image/video preview)

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues

## Context

On `/library/u/choose-magicschool` the user clicks the asset "Choose-Path
Soundtrack" and wants to PLAY it — but the 6 music asset blocks are `refs: 0` with
no playable URL, and the asset block page shows a schematic placeholder.

## What

1. **Populate music-asset media**: give each music Asset block a playable audio URL
   (upload the bed to Supabase Storage under `blocks/asset/<id>/...` via
   publish-entity.ts `--block`/`refs`, or point at the existing soundtrack file).
   Start with `choosepath-soundtrack`; cover the other 5 music beds.
2. **Asset detail page** (`/library/b/asset/<id>`): render a real player by `sub`:
   - `music` → inline `<audio controls>` (play the bed).
   - `character`/`location`/`prop` → the reference image(s) in a viewer.
   - video refs → `<video controls>`.
3. **Ensure links resolve**: the asset/recipe chips on the unit detail page +
   blueprint panel must link to working block pages that show the real media.

## Acceptance

- `/library/u/choose-magicschool` → click "Choose-Path Soundtrack" → an audio
  player that plays the soundtrack.
- Recipe + asset links from unit pages all resolve to pages with real content.
- `next build` passes.

## Notes

- Depends on #082 (asset media field if needed). Pairs with #084 (block page split).
