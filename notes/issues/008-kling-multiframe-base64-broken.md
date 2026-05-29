# `kling-v3.0-pro` multi-frame submissions always fail; no CLI preflight

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

`kwaivgi/kling-v3.0-pro` with both `--first-frame` AND `--last-frame` consistently returns `400 "File is not in a valid base64 format"` on OpenRouter — reproduced across 6+ days and multiple projects. Single-frame kling works. The CLI lets the call through every time, burning ~$0.70 + 3 min per rediscovery.

## What

- `flipper-hypermotion-001`: 6/8 i2v multi-frame calls failed; ~$0.84 sunk.
- `glitter-cream-001`: 4 wasted kling multi-frame submits in one session.
- `playdate-pixel-001` and `venom-bodywash-001`: same pattern, agent falls back to single-frame or seedance.
- The flipper postmortem already documented this but the CLI was never updated to preflight.

## Why it matters

Recurring tax on every i2v-extend or anchored-motion project. The right answer (seedance multi-frame) exists; the CLI just doesn't route to it.

## Suggested fix

- Preflight check in `cli/lib/providers/media.ts → generateVideo()`:
  - If `model === 'kwaivgi/kling-v3.0-pro'` AND both `--first-frame` AND `--last-frame` are set → reject locally with a clear error pointing to `bytedance/seedance-2.0`.
  - Also confirm/fix base64 encoding for the second image before declaring it terminal — issue may be CLI-side.
- Add a "Discovered model breakage" section to MODELS.md and add a row for kling multi-frame.
- Per-model `maxPromptChars` validator while we're in this code path — kling rejects >2500 with a 400 only after round-trip (`glitter-cream-001` lost 4 submits).

## Sources

- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md` — 6/8 i2v fails
- `workspace/projects/glitter-cream-001/POSTMORTEM.md` — 4 wasted submits + prompt-length 400
- `workspace/projects/playdate-pixel-001/postmortem/03-cli-issues.md` — #3
- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — #2
- MEMORY: `project_kling_practical_limits`
