# HyperFrames edge-case rules need to be hard rules, not lint warnings

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** render-engine

## Context

Two recurring HyperFrames defects only surface at render time, after silent freeze:
1. Many short same-track `<video>` clips back-to-back mis-render — only the first plays.
2. `<video>` element needs `id` + `data-start` on the element itself, not on a wrapper div. Lint flags `media_missing_id` / `media_missing_data_start` only at render.

## What

- `ralphy-vs-higgsfield-001`: lessons rule 6 + workflow-fixes #2 — 6×2s clips on `data-track-index=0` rendered only the first; others frozen/blank.
- `ralphy-vs-higgsfield-001`: workflow-fixes #3 — common `<video>` wrapper pattern from `ugc-ad-test` silently freezes; rule discovered only via render-time lint output.

## Why it matters

Silent-render-time freeze is the worst failure class — no error, no log row, just a wrong-looking mp4 that the QA gate (if it ran) might not catch.

## Suggested fix

- Fix in HyperFrames runtime: handle many-short-same-track video correctly. If unfixable, document the rule prominently.
- Promote lint checks to author-time:
  - `media_missing_id` / `media_missing_data_start` → block lint pass.
  - "many short same-track video clips" pattern → warning with concat-fix suggestion.
- Document as HARD rules in `.agents/skills/hyperframes/SKILL.md`:
  - "Timed media carries `id` + `data-start` on the element itself, never on a wrapper."
  - "For a montage of N short clips on one track, concat them into a single video; runtime cannot reliably switch between many short same-track video clips during capture."

## Sources

- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/02-lessons.md` — rule 6
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/05-workflow-fixes.md` — #2, #3
