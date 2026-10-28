# Transitions and motion catalog with a browsable preview page

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / craft library

## Context

The owner wants a base of transitions (zoom, cut, mask, blur, whip, glitch and so on) and motion graphics elements with their sound effects, viewable on a page as ready video assets, like https://hyperframes.heygen.com/catalog. Format is the agent's call. There are about 316 SFX files across existing projects under `.ralphy/workspaces/*/projects/*/artifacts/sfx/`. Idea 006 (HyperFrames overlay blocks) overlaps and should be folded in.

## What

1. Inventory what exists: HyperFrames registry blocks, our compositions, recipes in the library.
2. Harvest SFX from past projects: copy (never move) into a shared SFX pack, dedupe by audio fingerprint, tag by use (whoosh, hit, riser, pop, glitch, click), loudness-normalize.
3. Study catalogs of strong motion designers and template marketplaces; break down the patterns (timing, easing, layering, sound sync) and implement our own versions. Do not copy their assets or code.
4. Each catalog item: HyperFrames implementation, parameters, a rendered 9:16 preview mp4 with its SFX, when to use, when not to, and a link to its #558 ledger stats once data exists.
5. A static catalog page (filters by type, mood, energy) built from the item manifest.
6. When the base exists, write a spec of what is still missing.

## Scope / acceptance

- At least 40 transitions and 30 motion elements with previews.
- The catalog page renders locally and lists every item with a playable preview.
- Agents can query it: `ralphy catalog list --kind transition --mood energetic`.
- A gaps spec filed as a follow-up issue.

## Notes

- Sequence before #564 and #565, which add their own items to the same catalog.
- Append-only: SFX harvest copies, source project files stay untouched (AGENTS.md invariant 14).
