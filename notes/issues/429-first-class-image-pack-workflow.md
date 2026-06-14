# First-class image-pack workflow

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

The TakeAMinute App Store pack was a real production mode: 32 stills, 8 selected winners, competitor refs, per-slot roles, variant comparison, final ZIPs, and no video timeline. Today this shape is forced through generic project scaffolding and manual folder conventions.

## What

Add a first-class image-pack workflow for App Store screenshots, Play Store screenshots, social image packs, ad creative packs, and other multi-still deliverables.

## Why it matters

Not every high-value Unit is a video. Image packs are commercially important and need the same discipline: ref intake, slot roles, variants, selection, packaging, provenance, and distribution handoff.

## Scope / acceptance

- Add or document a project kind/content mode route for image packs.
- Scaffold expected folders: `artifacts/images/`, `artifacts/refs/`, `selected/`, prompts, logs, and pack metadata.
- Define slot roles and composition classes before generation.
- Integrate `generate image --batch` / `--variants` from #024.
- Add selected-set packaging and ZIP creation through a Ralphy verb, not ad-hoc shell.
- Add image-pack eval rubric: text quality, role match, brand fidelity, safe areas, aspect, and selected-set cohesion.
- Add fixtures using an App Store pack shape and an ad creative pack shape.

## Notes

- Related: #412 content modes, #413 mode backfill, #421 variant tournament, #423 distribution pack, and #426 reference packs.
