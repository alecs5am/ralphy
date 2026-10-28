# Reference digest bundle and contact-sheet quality/cost eval

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** research + feature / reference analysis

## Context

The owner wants the agent to fully analyze a top reference in one request: transcript, structure, metrics and a contact sheet with a frame every 0.25 s. At 0.25 s a 30 s video is 120 frames and a 60 s video is 240; after vision-model downscaling one sheet may stop being readable. Ref-pack contact sheets exist (#449) but were never evaluated for analysis quality or cost.

## What

1. `ralphy ref digest <video|url>`: one bundle with word-level transcript, scene cuts, timing structure (hook, beats, CTA), metrics when known, and one or more contact sheets.
2. An eval that finds the balance between quality and cost:
   - Variants: fixed cadence (0.25 / 0.5 / 1 s), cut-adaptive (one frame per shot plus extra in fast shots), tiles per sheet (16 / 36 / 64 / 120), tile resolution, sheet count.
   - Fixed question set on a labeled reference set (about 20 videos): cut count and positions, on-screen text, hook mechanics, transitions used, B-roll vs talking head, CTA timing.
   - Score = answer accuracy against labels; cost = input tokens and wall time per model.
3. Pick a default from the Pareto front and expose the knobs for later tuning.

## Scope / acceptance

- `docs/research/contact-sheet-eval.md` with the baseline table, the Pareto chart data, the chosen default and why.
- The labeled reference set and question set kept as a calibration dataset under `cli/lib/eval/calibration-datasets/`.
- `ralphy ref digest` ships with the chosen default and flags for cadence and layout.
- Tests for sheet layout math and cut-adaptive sampling.

## Notes

- Free: frame extraction and sheets are local ffmpeg; only the vision scoring costs tokens.
- Feeds #556 (a digest per corpus video) and #571.
