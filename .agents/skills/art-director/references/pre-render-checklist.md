# Pre-render snapshot review (HARD gate)

**Hard rule.** Before handing the project to the editor for `ralphy render <id>`, snapshot every beat in `STORYBOARD.md` and walk the checklist below. This is not a soft "should" — it is a refuse-not-warn gate, same class as the quality-gate two-fail rule.

Snapshot-before-render is the cheapest QA pass in the pipeline (~$0, ~10s). Skipping it costs $0.50–$3 per missed bug in regen + a round-trip with the user. `noski-people-001` shipped a boy's torso clipping through the back-cushion to v3 because this step was a soft "should". `odindoma-fb-ad-001` burned v1–v5 the same way — iteration time halved the moment the snapshot gate fired.

## When this fires

After `generate-assets` completes (every slot in the manifest has a file) AND before the editor playbook's `final-render` sub-task. If the user says "render it", you do this first, then render.

## MUST checklist

Walk every item. Each one is a MUST, not a SHOULD. A single fail aborts the render — fix at art-director layer (regenerate the offending slot per `regeneration.md`) and re-snapshot.

1. **MUST snapshot every beat in `STORYBOARD.md` before render.** Use `bunx hyperframes snapshot .ralphy/workspaces/<ws>/projects/<id>` to write per-keyframe PNGs into `compositions/snapshots/` (or the equivalent path the CLI surfaces). One PNG per scene at minimum; one per beat for multi-beat scenes.
2. **MUST eyeball every snapshot for anatomy.** Hands (count fingers, no fusion, no extra digit), eyes (gaze direction matches the beat, no third eye, no asymmetric pupils), limb articulation (no torso/joint clipping through other geometry, no impossible bend). This is the bug class that killed `noski-people-001`.
3. **MUST eyeball every snapshot for location continuity.** Same couch, same wall, same window light direction across all scenes that share a setting. If a location plate was generated as anchor #1 per the anchor-order discipline, every scene snapshot must read as the same room.
4. **MUST eyeball every snapshot for pivot / camera-axis sanity.** Subject is on the same side of the 180° line across cuts in a single scene. Camera height matches the beat's intent (low-angle for power, eye-level for confession, etc — per scenario). No accidental mirror-flip between v1 and a regenerated v2.
5. **MUST cross-check identity locks.** Master shot for each cast member (face, hairline, distinctive features) compared frame-by-frame against scene snapshots. If a face drifts, that scene needs a regen with the master passed as `--ref`, not a render with the drift baked in.
6. **MUST verify on-prompt props.** Every prop named in the scenario's per-scene prompt is present in the snapshot at the timestamp it's supposed to appear. Missing prop = regen, not "the editor can mask it".

## Worked example — `noski-people-001` scene-04

The failure: boy character was sitting on the back-cushion with his torso intersecting the upholstery, visible in the static anchor. Render proceeded. User caught it. Regen cost: $0.42 image + $0.84 video re-roll + ~12 min round-trip.

What the checklist catches: item #2 (anatomy / clipping) — a 5-second eyeball on the snapshot pre-render. ~$1.26 and 12 minutes saved.

## What "MUST" means here

Refuse, do not warn. If the snapshots aren't on disk, you don't render — you snapshot first. If a snapshot fails an item above, you don't render — you regenerate the offending slot. The user can override on a specific render with explicit consent ("I see the clipping, ship it anyway"), which goes to `user-prompts.jsonl` via `ralphy project log-prompt --stage no-snapshot-consent`.

## Future CLI enforcement

A `--require-snapshot-review` flag on the `ralphy hyperframes render` namespace will refuse to render when `compositions/snapshots/` is older than `index.html` (see [notes/issues/028](../../../../notes/issues/done/028-no-ralphy-hyperframes-namespace.md) for the namespace, this checklist for the policy it enforces). Until that flag ships, the agent enforces the gate by reading this file.

## Handoff

- All six items pass → editor playbook, `final-render` sub-task.
- Any item fails → back to `regeneration.md` for the offending slot, then re-snapshot.

## Pre-render self-review (HARD gate)

Before handing the project to the editor for `ralphy render <id>` — every project, no exceptions — walk the pre-render checklist. This is not a soft "should snapshot key beats"; it is a refuse-not-warn gate.

- **MUST snapshot every beat** in `STORYBOARD.md` via `bunx hyperframes snapshot .ralphy/workspaces/<ws>/projects/<id>` before render.
- **MUST eyeball every snapshot for anatomy** (hands, eyes, limb clipping — the `noski-people-001` failure class).
- **MUST eyeball every snapshot for location continuity** (same couch / wall / light across scenes that share a setting).
- **MUST eyeball every snapshot for pivot / camera-axis sanity** (180° line, camera height, no v1→v2 mirror flip).
- **MUST cross-check identity locks** against each cast master shot.
- **MUST verify on-prompt props** present at the right timestamp.

A single fail aborts the render — fix at this layer via `regeneration.md`, then re-snapshot. Full worked rationale + `noski-people-001` / `odindoma-fb-ad-001` postmortem evidence in [art-director/pre-render-checklist.md](./pre-render-checklist.md).

The future `--require-snapshot-review` flag on the `ralphy hyperframes render` namespace (out of scope here — tracked in [notes/issues/028](../../../../notes/issues/done/028-no-ralphy-hyperframes-namespace.md)) will mechanise this gate. Until it ships, the agent enforces by reading the sub-doc.
