# Model constraint preflight

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Many prior fixes were specific model constraints: max prompt chars, unsupported multi-frame modes, ignored size flags, natural aspect, supported audio, ref count, and endpoint concurrency. These should be surfaced before submit as a shared preflight layer.

## What

Add a model constraint preflight that validates a planned generation call against known model/provider limits before spending or queueing.

## Why it matters

Provider 400s are cheap but costly in iteration time. A shared preflight prevents rediscovery and gives agents immediate next actions.

## Scope / acceptance

- Define constraint metadata per model/provider: max prompt chars, supported inputs, refs, aspect/size behavior, audio support, duration limits, known broken combinations, and concurrency hints.
- Validate `generate image`, `generate video`, voice/music/sfx, and eval calls.
- Return actionable hints and recommended fallback models.
- Add tests for known constraints already captured in done issues.
- Keep MODELS.md and runtime metadata from drifting, or document the generation path for both.

## Notes

- Related done issues: #008, #023, #024, #051.
