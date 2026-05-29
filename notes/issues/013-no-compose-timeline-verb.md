# Missing verb: `ralphy compose` (timeline-aware cut)

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

Hard-cut + VO + music + caption composition has no `ralphy compose` / `ralphy project compose` wrapper. Every project re-implements the same ffmpeg pipeline: concat-demuxer with 50ms audio fades to avoid clicks, speech-aware trim from scribe timings, VO track with gaps, captions bound to phrases. `choose-your-guide-001` ran 60+ raw ffmpeg invocations in a single session for this.

## What

- `choose-your-guide-001`: GAP-1 (CRITICAL) + GAP-11 — 17-iteration ffmpeg cycle; structural edit = manual 3-way desync of video/VO/captions; concat clicks at every boundary by default; loudnorm + logging silently skipped.
- `noski-people-001`: #8 in CLI-issues.
- `arena-rocker-001`: workaround `cp final.mp4 render/`.

## Why it matters

Composition is the load-bearing editor step. Without a timeline model, every structural edit (`--remove-segment <name>`) means hand-redo of three pipelines. Quality compounds: missing loudnorm, click artifacts, caption drift.

## Suggested fix

- New `cli/commands/compose.ts` + `cli/lib/composer.ts`:
  - Timeline object: `segments[]` with durations, VO track with explicit gaps, captions bound to scribe phrases.
  - `--remove-segment <name>` re-flows everything (VO trim, captions shift, music re-fade).
  - Default 50ms audio fade on every segment boundary.
  - Speech-aware trim from scribe timings (see issue 019).
  - Always pass through loudnorm + faststart + manifest row.
- Recipe lives in `cli/lib/ffmpeg-recipes.ts`.

## Sources

- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-1, GAP-11
- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #8
- `workspace/projects/arena-rocker-001/postmortem/03-cli-issues.md` — workaround
