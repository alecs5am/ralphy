# Reference pack contact sheet and lint

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

#426 defines reference packs. Agents still need a fast way to visually inspect whether a pack is complete, mislabeled, low-resolution, duplicated, expired, or unsuitable for the selected mode.

## What

Add a reference-pack lint and contact-sheet generator. It should create a compact visual summary and structured warnings for all refs that a project will use.

## Why it matters

Bad refs poison generation. A contact sheet catches wrong screenshots, stale temporary files, missing product masters, and inconsistent style refs before paid generation.

## Scope / acceptance

- Generate a contact sheet grouped by ref type.
- Lint for missing files, unsupported formats, tiny resolution, duplicate hashes, suspicious temporary paths, and missing provenance.
- Warn when required ref types for the selected mode are absent.
- Link the output from the production plan and council preflight.
- Add fixtures for a healthy pack and a broken pack.

## Notes

- Related: #426 reference pack builder and #422 product fidelity.
