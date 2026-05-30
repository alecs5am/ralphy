# `ralphy audio sidechain` ffmpeg filter graph is broken

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

`ralphy audio sidechain` (the canonical editor verb for VO+music ducking) uses single-letter labels `[v]` and `[m]` in its ffmpeg filter graph. ffmpeg parses single letters as stream specifiers, not filter labels, so the call exits 234 with `"Stream specifier 'v' matches no streams"`. The verb is unusable; agents fall back to hand-rolled 200-character ffmpeg one-liners on every VO+music mix.

## What

- `venom-bodywash-001`: 3 sidechain calls all failed with exit 234; raw ffmpeg workaround used for every cut.
- Documented in `venom-bodywash-001/postmortem/05-workflow-fixes.md` #5.

## Why it matters

VO+music ducking is in every UGC ad. The canonical CLI verb is broken, so agents bypass it — which means no `generations.jsonl` row, no consistent loudness, no faststart guarantee.

## Suggested fix

- `cli/lib/ffmpeg-recipes.ts → sidechainCompress()`:
  - Rename internal filter labels to multi-char: `[voice]`, `[music]`, `[mducked]`, `[mixed]`.
  - Add chained `--loudnorm` option (LUFS target).
  - Add unit test that runs the filter graph against a 1s synthetic VO + music and asserts non-zero output.

## Sources

- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — #3
- `workspace/projects/venom-bodywash-001/postmortem/05-workflow-fixes.md` — #5
