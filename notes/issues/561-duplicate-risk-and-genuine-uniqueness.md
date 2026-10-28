# Duplicate-risk awareness and genuine uniqueness for variants

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** research + feature / distribution

## Context

The owner wants the agent to know when what it makes would count as a duplicate (or "unoriginal / reused content") and avoid making it, and to make variants that are actually unique. Platforms detect reuse with perceptual video hashes and audio fingerprints and demote or strike unoriginal uploads; cosmetic tweaks (mirror, 1.2x speed, LUT, trimming a second) are widely believed to beat this but the evidence is mixed and the account risk is real.

## What

1. Research the published originality policies of TikTok, Instagram and YouTube, and what is known about how they match duplicates. Record which changes plausibly matter (new hook, new VO, re-edit and reorder, new B-roll, new layout) and which are cosmetic.
2. A local similarity check, `ralphy unit originality <unit>`: perceptual hash over sampled frames and an audio fingerprint, compared against the workspace's earlier units and the reference source. Report a similarity score per axis (visual, audio, script) and flag likely-duplicate output before render or publish.
3. A variant planner that changes substance: hook rewrite, structure reorder, VO re-record, B-roll swap, layout swap, pacing, plus cosmetic transforms as an optional last layer. Each variant records what changed so #558 can attribute results.

## Scope / acceptance

- `docs/research/originality.md` with the policy summary and the substantive-vs-cosmetic table.
- The originality verb works offline and has tests on synthetic near-duplicates.
- Variant tournament (#421) uses the planner and refuses to emit a variant whose similarity to a sibling exceeds a threshold.

## Notes

- Scoped to real uniqueness, not to a filter stack whose only purpose is to slip the same video past duplicate detection.
