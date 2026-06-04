# Missing verbs: `project verify` and `project assets --json`

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

There is no `ralphy project verify <id>` (ffprobe-based truth check on manifest claims) and no `ralphy project assets <id> --json` (real durations + dimensions + codecs). Every multi-clip project re-invents an ad-hoc `ffprobe -show_entries` loop, often inheriting wrong duration constants from sibling projects.

## What

- `kbo-broadcast-001`: #5 — trim scripts hardcoded `clip_dur=3000ms` and silently cut scene-24 speech because real duration was 4s.
- `noski-people-001`: #2 + workflow-fixes #4 — "ffprobe real durations" rule emerged from the same pain.
- `tokyo-y2k-001`: raw `ffprobe` loops + manual sum-in-head for music gap analysis.

## Why it matters

Manifest claims drift from disk reality (especially around kling/seedance ~1s duration overshoot — see issue 042). Without a verify verb the agent trusts the manifest and ships defects.

## Suggested fix

- `cli/commands/project.ts`:
  - `ralphy project assets <id> [--kind video|image] --json` → array of `{slot, path, duration_s, width, height, fps, codecs, size_bytes}`.
  - `ralphy project verify <id>` → flag every slot whose ffprobe truth diverges from manifest claim by >100ms or size or dimension.
- Recipe in `cli/lib/ffmpeg-recipes.ts`.

## Sources

- `workspace/projects/kbo-broadcast-001/postmortem/03-cli-issues.md` — #5
- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #2
- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — #4
- `workspace/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` — #3
