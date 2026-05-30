# Backfill templates from the last 20-30 projects

> **Status:** todo
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** medium
> **Category:** templates / content

## Context

~70 projects sit in `workspace/projects/`. The good ones should become templates
in the new library (`052`). Quality signal: a project with a `postmortem/` set
likely shipped and was rated; a project with **no postmortem is likely abandoned
/ low quality** (user's heuristic). Free Air VPN sticker pack is a confirmed
keeper and seeds the `sticker-pack` format.

## What

Review the most recent 20-30 projects, judge quality, and extract the keepers
into the `052` taxonomy via the `056` publish skill.

## Scope / acceptance

1. Rank recent projects: postmortem present + score ≥ ~8 = candidate; no
   postmortem = skip unless visibly strong.
2. **Definitely extract**: `free-air-vpn-stickerpack` → `sticker-pack` format
   (reuse the gemini multi-ref + flood-fill cutout method, per memory).
3. For each keeper: pick format + general/style placement, run `056`, seed a
   showcase entry (`055`) from its render, migrate heavy refs to `ralphy-assets`.
4. Confirmed-strong recent projects to consider: `openrouter-ship-001`
   (ship-style announcement), `noski-people-001` (photoreal register),
   `biofix-hypnic-en-001`, plus any other with a clean postmortem + render.
5. Each extraction committed + pushed individually.

## Why it matters

Turns sunk experiment cost into reusable templates and gives `054`/`055` real
content + showcase galleries to render.

## Notes

- Depends on `052` + `056`. Run AFTER the publish skill exists.
- Do NOT extract abandoned/low-quality projects; surface the shortlist with a
  one-line rationale before extracting if any candidate is borderline.
