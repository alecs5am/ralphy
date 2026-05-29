# Missing verbs: `asset chromakey`, `ref rasterize`, `image cutout/fit`

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

Three image-post primitives have no CLI verb:
- **Chroma key** for greenscreen monster/mascot cutouts.
- **SVG rasterize** for crisp scaled brand logos.
- **Flood-fill cutout + alpha-trim + crop** for sticker packs (the "Pure look" recipe).

All three are recurring needs. `hyperframes remove-background` is u2net (salient-object), which cuts the die-cut outline off — wrong tool for sticker work.

## What

- `ralphy-vs-higgsfield-001`: #6 — 7 monster cutouts keyed by raw ffmpeg `colorkey=0x00b140`, re-keyed after each regen.
- `ralphy-carousel-001`: #1 — mascot SVG → PNG required 95-line Playwright helper outside ralphy.
- `free-air-vpn-stickerpack`: #1, #2, #3 — ~1.5h on cutout/sizing; flood-fill connectivity keyer is the right recipe but lives in user-land Python.

## Why it matters

Each image-post project re-derives the recipe. The sticker flood-fill recipe in particular took 1.5h to figure out and is documented only in one project's lessons.

## Suggested fix

- `ralphy asset chromakey <img> [--color 0x00b140] [--despill] [--feather 0.8]` → transparent PNG.
- `ralphy ref rasterize <file.svg> --size 1024 [--bg <hex>]`; teach `--ref` to accept `.svg` (rasterize in-process).
- `ralphy image cutout <img> --bg flood|chroma [--color <hex>]` — flood-fill connectivity keyer preserving die-cut outline + islands.
- `ralphy image fit --long 512 --trim-alpha [--telegram]` — alpha-trim + crop + scale.
- Recipes in new `cli/lib/image/cutout.ts`.

## Sources

- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/03-cli-issues.md` — #6
- `workspace/projects/ralphy-carousel-001/postmortem/03-cli-issues.md` — #1
- `workspace/projects/free-air-vpn-stickerpack/postmortem/03-cli-issues.md` — #1–#3
- `workspace/projects/free-air-vpn-stickerpack/postmortem/02-lessons.md` — §5
- MEMORY: `feedback_sticker_cutout_floodfill`
