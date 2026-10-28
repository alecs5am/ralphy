# Free typography and caption presets (English first, Cyrillic supported)

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / craft library

## Context

The owner wants font pairs, fonts, colors and caption presets (1, 3 or 5 words on screen at a time), using anything free from the internet or GitHub. English is the focus; Cyrillic must work. Pacing is the agent's call, grounded in metrics.

## What

- Harvest free fonts (Google Fonts, OFL / Apache fonts on GitHub). Record license per font; keep only licenses that allow commercial video use.
- Check glyph coverage for Latin and Cyrillic automatically; tag each font.
- Curated font pairs by register (bold creator, editorial, tech, playful, luxury, horror).
- Caption presets as HyperFrames components: words-per-screen 1 / 3 / 5, active-word highlight, pop or slide entry, stroke and shadow, color schemes with contrast checks.
- Default pacing rules from the course material (#571) and later from #558 ledger outcomes.
- Previews in the #563 catalog.

## Scope / acceptance

- Fonts stored as shared assets with a license manifest; a lint fails on a font without a recorded license.
- At least 12 caption presets and 10 font pairs, each previewed in English and Russian.
- The caption gate (#441) reads preset metadata for readability limits.

## Notes

- Sequence after #563.
