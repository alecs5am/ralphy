# Camera language for video-generation prompts

> **Status:** done — 2026-10-30 (free part: `camera-language-video` guideline, 30 moves with per-model notes, all marked untested; paid test matrix planned in docs/research/camera-language-test-plan.md, $35.58 minimum, waits for owner approval)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** knowledge base / prompts

## Context

Most of the camera work the owner wants is for prompts: shot sizes, angles, handheld shake, push-ins and zooms, fly-throughs, orbits, rotation, multi-angle coverage. Models differ in which phrases they obey. `seedance-prompts` covers one model; nothing covers camera language across the models in `MODELS.md`.

## What

- A per-model camera vocabulary: for each current video model in `MODELS.md`, which camera terms it follows, which it ignores, and which cause artifacts.
- A small paid test matrix (same scene, one camera instruction per run) to verify the table. Needs owner approval of the spend before it runs.
- A guideline (`ralphy guideline` entry) the art-director folds into prompts, plus examples of multi-shot coverage for one scene.

## Scope / acceptance

- Guideline with at least 25 camera moves, each with per-model notes and a verified example clip.
- Art-director skill references the guideline for any video prompt that names camera motion.
- Spend logged through gen-log.

## Notes

- Post-production camera moves are #567.
