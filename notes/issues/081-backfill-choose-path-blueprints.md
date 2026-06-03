# Backfill full Blueprints for the 6 published choose-path units + prune dup block

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

The choose-path series (silenthill, spaceship, swamp, backrooms, warofworlds, magicschool)
was published 2026-06-03 as Units with metadata blocks but **no reproduction payload** —
`choose-silenthill` confirmed metadata-only (`refs: 0`). Once #074-#077 land, backfill them.

## What

For each of the 6 units, `ralphy blueprint create` (#076) from its
`workspace/projects/<id>/` (the projects are intact locally) and `publish-entity.ts
--blueprint --push` (#077): the real per-scene prompts, the `index.html` composition + the
components it uses, the char-master + soundtrack files, the model stack (gemini images /
seedance i2v / kling fallback / ElevenLabs voices), and the recipes (xfade-master,
vhs-pause-freeze, smpte-countdown, old-radio-vo, boomerang, etc).

Also: **prune the orphan duplicate recipe block `choose-path-xfade-master`** (== canonical
`ffmpeg-xfade-master`) — DB delete + remove from `published.ts` between the sentinels.

## Why it matters

Turns the 6 live units from "watchable + an ingredient list" into fully reproducible — the
concrete deliverable that motivated this whole thread.

## Scope / acceptance

- All 6 units have a published Blueprint; `/library/u/choose-silenthill` shows prompts +
  composition + downloadable assets + model stack.
- `ralphy blueprint use choose-silenthill --project test` reproduces a matching render.
- `choose-path-xfade-master` removed from Supabase + the mirror; no unit references it.

## Notes

- Depends on #074-#077 (and #079 for the reproduce check). Last in the sequence.
- Optional: also attach a slotted prompt-cookbook to the styles (so the generic Template side, #075, gains depth).
