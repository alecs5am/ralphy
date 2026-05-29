# Kling / seedance clip duration overshoots `--duration` by ~1s, undocumented

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** playbook

## Context

Both `kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0` return clips ~1 second longer than the `--duration` you request. Editor playbook silently assumes art-director clips total the planned duration, so the overshoot surprises the editor stage and forces a per-clip trim pass.

## What

- `tokyo-y2k-001`: workflow-fixes #3 — storyboard planned `5s/4s/9s`, actual mp4s on disk were `6.04 / 5.04 / 10.04`. Total raw 90.7s vs 75s music. Gap surprised the editor at turn 3.

## Why it matters

Predictable surprise costs an extra trim iteration on every multi-clip project. Knowing the overshoot up front lets the art-director request shorter clips, or the editor budget a vision-trim pass.

## Suggested fix

- Add to `docs/playbooks/editor.md` (or new `editor/preflight.md`):
  - "Source-clip duration ALWAYS overshoots `--duration` by ~1s on kling and seedance. Either request 1s shorter at art-director stage, or budget a per-clip vision-trim pass."
- Add the same row to MODELS.md per model (see issue 026).
- Pairs with `ralphy editor trim-analyze` (issue 034) — that verb's primary output is suggested trim_in/trim_out per clip.

## Sources

- `workspace/projects/tokyo-y2k-001/postmortem/05-workflow-fixes.md` — #3
