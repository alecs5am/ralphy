# Post-production virtual camera recipes

> **Status:** done — 2026-10-30 (checkpoint: 12 camera recipes as catalog items with previews, seek-order determinism test for all 12, two-render frame identity for three, editor reference; gaps listed below)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / craft library

## Context

The post-production half of camera work, kept separate from prompt vocabulary (#566): moves applied in the edit to footage or stills.

## What

HyperFrames recipes with parameters and previews: punch-in on a beat or word, slow push, handheld shake with seeded noise, whip pan, rotation, parallax on cut-out layers (uses #560 mattes), Ken Burns for stills, and a follow-cam that keeps a tracked subject framed (uses #559 tracks). Each is deterministic under seek.

## Scope / acceptance

- At least 12 recipes in the #563 catalog with previews.
- Editor skill reference that says when each move helps and when it distracts.
- Determinism test: two renders of the same composition are frame-identical.

## Notes

- Sequence after #559 and #563.

## Checkpoint (2026-10-30)

**Landed.**

- New catalog kind `camera` (schema: a required `camera` block with `input` = footage | still | layers | track and the minimum `overscan` scale). 12 recipes under `catalog/items/camera/`, each `function catalog_<id>(tl, o)` with typed params, use / avoid notes and a rendered 9:16 preview:
  - `cam-punch-in` (instant zoom cuts on beats or word starts; hold or pulse), `cam-slow-push`, `cam-handheld` (seeded value noise on x, y, roll), `cam-whip-pan` (in-shot whip across a wide plate with horizontal SVG blur, whoosh cue), `cam-roll` (dutch roll with exact corner-cover scale), `cam-parallax` (bg / mid / subject / fg layers; cutouts from `ralphy matte subject`, #560), `cam-ken-burns` (zoom between two focus points), `cam-follow` (follow-cam from a `ralphy.track/v1` point or face track, #559, with source-to-composition mapping, moving-average smoothing and plate-bound clamping);
  - four more: `cam-crash-zoom` (fast zoom to a point with overshoot and blur, swoosh cue), `cam-dolly-zoom` (vertigo on cut-out layers), `cam-pan-reframe` (pan-and-scan a 16:9 plate inside 9:16), `cam-impact-shake` (seeded decaying shake on a hit, impact cue).
- Preview harness: a camera stage with a 2160 x 2400 layered plate (sky, midground, foreground, subject), a demo subject that walks the plate for the tracking and reframe recipes, and the same path handed to `cam-follow` as a point track (the shape `ralphy track point` writes).
- **Determinism.** `tests/integration/catalog-camera-determinism.test.ts` loads every recipe's preview in headless Chromium and seeks 10 sample times forward, in reverse, in a seeded shuffle, and from a fresh page per time; the frame state (computed transform, origin, filter and opacity of the camera target and every layer, plus SVG blur attributes) must match in every order. The test caught two real leaks, both fixed: `cam-impact-shake` applied a non-zero offset at progress 0 when seeking back before the hit, and the first `cam-follow` drove the frame from a proxy `onUpdate` that left an offset before its start (now one linear fromTo per track segment). Screenshot hashes are not used: headless Chromium chooses a layer's raster scale from its transform history, so identical DOM state can rasterise a few pixels differently after different seek orders.
- **Two renders frame-identical.** `cam-handheld` (153 frames), `cam-impact-shake` (72) and `cam-follow` (171) were each rendered twice with `ralphy catalog build-previews` (the second with `--force`); `ffmpeg -f framemd5` of the decoded video matches frame for frame.
- Editor reference: `.agents/skills/editor/references/virtual-camera.md` (when each move helps and when it distracts, one move per shot, overscan and upscale budget, captions outside the camera target, track and matte wiring, how to keep a new move deterministic), linked from the editor skill and `motion-catalog.md`.
- `tests/unit/catalog-manifest.test.ts` checks the 12 recipes, the required `camera` block, params used by each fragment, and the lint-clean preview assembly.

## Gaps after the checkpoint

- **Real media.** Previews move a DOM plate; no recipe has been rendered over a real `<video>` (HyperFrames frame-accurate video seeking under a transformed parent), a real alpha cutout for parallax / dolly zoom, or a real `ralphy track` output for the follow-cam.
- **Beat source.** `cam-punch-in` takes beat times by hand; wire it to word starts from `captions.json` and to a music beat map so punches land automatically.
- **Motion blur.** Only the whip and crash zoom blur (SVG / CSS); shake and fast pushes have no motion blur, which reads synthetic at high amplitude.
- **Stabilise and reverse.** No stabilisation of real handheld footage (ffmpeg `vidstabdetect` is missing from the Homebrew build, see #559) and no "match the move of the source shot" recipe.
- **Pixel identity coverage.** Frame-identical renders were checked for three recipes; the other nine rely on the state-level seek test.
- **Splice verb.** No `ralphy catalog use <recipe> --project <id> --target <selector>` (shared #563 gap).
- **CLI surface doc.** `docs/cli-surface.generated.md` not regenerated (owner instruction).
