# Vertical (9:16) edit layouts and safe zones

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / craft library

## Context

The owner wants edit layouts (split screen, green screen, element placement guidelines). Focus is vertical only for now.

## What

- A 9:16 layout set as HyperFrames compositions with slots: top/bottom split, gameplay or satisfying B-roll split, talking head over keyed background (uses #560), picture-in-picture, reaction, screen recording with face cam, full-bleed B-roll with caption band, text-led.
- Safe zones per platform UI (TikTok, Reels, Shorts): where captions, the face and key text must not go. Encode as a lint the editor runs on the composition.
- A placement guideline doc: face position, caption height, headline zone, product zone, CTA zone.
- Each layout added to the #563 catalog with a preview.

## Scope / acceptance

- At least 8 layouts with previews in the catalog.
- `ralphy editor lint-safe-zones <project>` flags elements in platform UI zones.
- Guideline at `.agents/skills/editor/references/vertical-layouts.md`.

## Notes

- Sequence after #563.
