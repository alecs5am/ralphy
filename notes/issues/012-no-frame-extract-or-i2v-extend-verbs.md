# Missing verbs: `video frame` and `video extend`

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

Extracting a frame from a clip (for i2v anchoring, QA still, poster) and chaining `last-frame → new i2v clip` (multi-block i2v extend) are two of the most-repeated operations in any multi-clip project. Neither is wrapped in `ralphy`, so agents shell out to raw `ffmpeg -sseof -1 -frames:v 1` every time, bypassing the gen-log and dropping temp PNGs in `/tmp` outside the project.

## What

- `arena-rocker-001`: 7+ raw `ffmpeg -frames:v 1` invocations in one session.
- `noski-people-001`: same pattern in the workaround inventory.
- `odindoma-fb-ad-001`: extract-frames #8 in CLI-issues list.
- Multi-block i2v extend pattern (validated seam-free, MEMORY: `feedback_seedance_multiblock_i2v_extend`) lives only in agent memory — not a verb.

## Why it matters

Every i2v-extend project re-invents the pattern, with temp files outside the manifest. The append-only invariant doesn't cover work that never lands in `workspace/projects/<id>/`.

## Suggested fix

- `cli/commands/video.ts`:
  - `ralphy video frame <clip> --at <sec|last> --out <png>` — writes into the project, logs to manifest.
  - `ralphy video extend <clip> --slot <new> --duration 15 --prompt "..." [--model bytedance/seedance-2.0]` — grabs last frame, runs i2v, records the lineage (`extends: <clip-slot>`) in the manifest.
- Recipe in `cli/lib/ffmpeg-recipes.ts`.
- Tag the manifest entry with `kind: i2v-extend` so postmortems can rollup extend chains.

## Sources

- `workspace/projects/arena-rocker-001/postmortem/03-cli-issues.md` — #1, #2 top of roadmap
- `workspace/projects/arena-rocker-001/postmortem/05-workflow-fixes.md` — Finding A
- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — workaround inventory
- `workspace/projects/odindoma-fb-ad-001/postmortem/03-cli-issues.md` — #8
- MEMORY: `feedback_seedance_multiblock_i2v_extend`
