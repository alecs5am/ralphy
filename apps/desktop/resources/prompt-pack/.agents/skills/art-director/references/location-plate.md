# Location master plate — anchor #1 for multi-scene-same-room projects

**Read this when:** the project has ≥2 scenes sharing a setting (apartment, café, garage, office, store interior, any "same room" recurrence). Read BEFORE drafting any character or scene anchor.

## The rule

**Location lock — generate one wide `location-master-plate` anchor BEFORE any scene anchor.** Pass it as `--ref` on every subsequent character master and every scene anchor. No exceptions for projects that share a room across scenes.

Concretely:

1. **Anchor #0 (added implicitly by this rule) = `location-master-plate`.** A wide establishing shot of the room. No characters in frame, no close props in the foreground — the camera describes the *space*. This is the only artifact whose job is to lock the setting.
2. **Character / persona masters** — each generated with the location plate as `--ref`. The character now exists *inside the locked room*, not in an invented one.
3. **Scene anchors** — each scene-anchor gen receives BOTH the location plate AND the relevant character master(s) as `--ref`. The room's couch, lamp, window, wall color, floor, plant, ceiling fixture all stay constant across scenes.
4. **i2v** — same `--ref` discipline applies; never i2v a scene anchor that wasn't generated against the location plate.

## Why — the noski-people-001 worked example

`noski-people-001` is the canonical "I forgot the location plate" failure:

- 25-scene project, single recurring living-room setting, two cast members on a couch.
- First three scene anchors were generated in parallel without a location plate. The model invented **three different couches** (different fabric, different arm shape, different cushion count), **three different wall arts**, and **three different lamp placements**.
- User caught it on review: *"in every shot they're sitting on a different couch and I asked for the same one."*
- Cost to recover: **$0.45 in image regens** + **45 minutes of user-feedback loop** (re-prompt → check → reject → re-prompt across three scenes).
- Root cause locked in the postmortem's `02-lessons.md` Rule 1 and `05-workflow-fixes.md` #2 (P0, ~100% recurrence on multi-scene-same-room projects without this rule).
- Structural fix: a single up-front `location-master-plate` gen (~$0.15) that all three scene anchors reference. Net saving: ~$0.30 + the 45 min, plus continuity that holds across scenes 4-25 instead of degrading further.

The plate is the single highest-leverage anchor in any multi-scene-same-room project. It is also the cheapest insurance you can buy — one image gen, ~$0.05-$0.15 depending on model — against the most common identity defect class in the postmortem corpus.

## Anchor-to-scene ratio heuristic (≥25-scene projects)

For projects with ≥25 scenes, one location plate is necessary but not sufficient. As the scene count grows, the model needs more angle coverage of any recurring subject (location, character, hero prop) or it starts hallucinating new angles when prompted for "another shot of the same room from over by the window".

Heuristic: **≥3 unique anchor angles per recurring subject for ≥25-scene projects.** Examples:

- **Location** with ≥25 scenes → wide master plate + medium 3/4 angle + reverse / mirror angle. All three feed downstream scene anchors based on the scene's camera position.
- **Hero character** with ≥25 scenes → front master + 3/4 profile + back / over-shoulder. Pick by scene framing.
- **Hero product** with ≥25 scenes → straight-on hero shot + macro detail + in-hand context shot.

For 5-15 scene projects, one plate per recurring subject is enough. The angle-coverage rule kicks in once the scene count crosses the threshold where the model's "imagine an unseen angle" tendency starts to override its "match the reference" tendency. The threshold isn't precise — 25 is the conservative number; treat 20+ as a yellow flag.

## CLI shape

```bash
# Step 0 — generate the location plate BEFORE any other anchor.
ralphy generate image \
  --project <id> \
  --slot location-master-plate \
  --prompt "<wide establishing shot of the room — describe space, light, key furniture, palette. No characters.>"

# Step 1 — character master, anchored against the plate.
ralphy generate image \
  --project <id> \
  --slot persona-master-anya \
  --prompt "<character description>" \
  --ref .ralphy/workspaces/<ws>/projects/<id>/assets/location-master-plate.png

# Step 2 — scene anchor, anchored against BOTH plate AND character.
ralphy generate image \
  --project <id> \
  --slot scene-01-anchor \
  --prompt "<scene-specific composition>" \
  --ref .ralphy/workspaces/<ws>/projects/<id>/assets/location-master-plate.png \
  --ref .ralphy/workspaces/<ws>/projects/<id>/assets/persona-master-anya.png
```

The slot name `location-master-plate` is canonical — use it verbatim so downstream tooling (manifest checks, pre-render snapshot review, future lint) can recognize the anchor.

## What the plate prompt should describe

The location plate is the only artifact whose job is the *space*. Lean into:

- **Camera + lens.** Wide establishing — 24mm or 35mm equivalent, eye-level or slightly low.
- **Walls, floor, ceiling.** Color, material, condition. ("Warm white plaster walls, oak parquet floor, low matte-white ceiling.")
- **Key furniture.** The pieces that will appear in multiple scenes. Specify shape, fabric, color, count. ("One three-seat boucle couch in oat color, two cushions, no throw blanket.")
- **Light source.** Window direction, time of day, practical lamps. ("Single south-facing window camera-left, golden-hour soft warm light; one floor lamp camera-right, off.")
- **Palette.** Two or three dominant colors. ("Oat / warm-white / muted forest-green plant accent.")
- **What is NOT in the room.** Negative space matters as much as positive — the model will invent if you don't constrain. ("No TV, no rug, no art on walls, no other furniture.")

The plate is allowed to be slightly boring. Its job isn't to be cinematic; its job is to lock the room.

## Failure modes the plate prevents

| Failure | Without plate | With plate |
|---|---|---|
| Couch drift across scenes | 3 different couches in 3 scenes (noski-people-001) | One couch, locked |
| Wall art appears / disappears | Each scene invents new art | Plate's wall stays the wall |
| Window position shifts | Camera-left in scene-01, camera-right in scene-04 | Window stays where the plate put it |
| Lighting flips warm ↔ cool | Each scene re-rolls light | Plate's golden hour holds |
| Floor material shifts | Parquet in scene-01, concrete in scene-07 | Parquet, period |
| Ceiling height grows / shrinks | Low matte in scene-01, vaulted in scene-08 | Locked at plate's spec |

Every row above is a real identity defect from the postmortem corpus. The plate is the structural fix for all of them at once.

## Pre-render gate cross-reference

The plate also feeds the **pre-render self-review** (see [pre-render-checklist.md](./pre-render-checklist.md)) — the "MUST eyeball every snapshot for location continuity" check is only meaningful if there's a plate to compare snapshots against. Without a plate, the snapshot review degenerates to "the snapshots look pretty" and the location-drift defect class slips through to the rendered mp4.

## Cross-references

- **Anchor-order discipline** at the top of [`..`](../SKILL.md) — the plate is rule #1 in that discipline.
- [pre-render-checklist.md](./pre-render-checklist.md) — location-continuity eyeball happens against the plate.
- [regeneration.md](./regeneration.md) — if a scene anchor drifts off the plate, regen that single scene against the plate; don't regen the plate.
- [`intake`](../../intake/SKILL.md) — step 3 of intake names the plate as anchor #1 in the step-by-step generation loop; this sub-doc is what that step links to.
- `.ralphy/workspaces/<ws>/projects/noski-people-001/postmortem/02-lessons.md` (Rule 1) and `05-workflow-fixes.md` (#2, P0) — origin postmortem.
- MEMORY: `feedback_super_original_refs` — the broader "lock refs to prevent identity drift" pattern. Location plates are the room-shaped instance of it.
