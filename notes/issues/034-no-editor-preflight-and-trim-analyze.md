# Missing verbs: `editor preflight` and `editor trim-analyze`

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

Two standard editor-phase steps have no CLI wrapper:
- `editor preflight <id>` — durations / fps / music-gap / completeness check before composition.
- `editor trim-analyze <id>` — batch per-clip vision pass (`ralphy ref analyze-video`) to surface dead-time / overshoot per clip.

Every multi-clip project reinvents both as bash glue around `ffprobe` and `analyze-video`.

## What

- `tokyo-y2k-001`: #3 + #6 — raw `ffprobe` loops + manual sum-in-head for music gap; 25-line bash batch script for gemini analyze-video; trim-analysis is an unnamed pipeline phase.
- Violates AGENTS invariant #2 for read-only inspection — there's no verb to read against.

## Why it matters

These are standard phases of any multi-clip cut. Without verbs, every project re-derives them with subtle differences, and the phase boundary doesn't exist in the agent's mental model.

## Suggested fix

- New `cli/commands/editor.ts`:
  - `editor preflight <id>` — table of {slot, duration, fps, codec, has-audio}, music gap, "ready to compose" status.
  - `editor trim-analyze <id>` — parallel gemini analyze-video over all clips, writes `assets/analysis/summary.json` with `{slot, dead_time_s, hot_moments[], suggested_trim_in_s, suggested_trim_out_s}`. Idempotent via mtime check.
- Update `docs/playbooks/editor.md` "what I read on start" to call these as the first two steps.

## Sources

- `workspace/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` — #3, #6
- `workspace/projects/tokyo-y2k-001/postmortem/05-workflow-fixes.md` — Findings A + B
