# Slot-id validator too strict; no auto-normalize

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** low
> **Category:** cli

## Context

Slot-id validator rejects uppercase letters, underscores, leading digit / underscore, and spaces with a correct-but-rigid error message ("expected lowercase kebab-case"). Agents trip it repeatedly across sessions and rename to `-alt1/-alt2` by hand.

## What

- `noski-people-001`: rejected `top-down-wide-reveal-A`.
- `appstore-takeaminute-001`, `flipper-hypermotion-001`, `glitter-cream-001`: ~5 retries per session on bad slot ids (`music-A-orchestral`, `_smoke-test`, `scene-01-A-firstframe`).

## Why it matters

Small but recurring papercut. Easy fix; visible across nearly every session.

## Suggested fix

- In the slot validator (likely `cli/lib/asset-manifest.ts`):
  - Auto-lowercase + replace `_`/space with `-`.
  - Warn on stderr that normalization happened: "normalized `_smoke-test` → `smoke-test`".
  - On hard rejection, list the valid character set in the error and suggest the sanitized form: "did you mean `smoke-test`?".

## Sources

- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #4
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md`
- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md`
- `workspace/projects/glitter-cream-001/POSTMORTEM.md`
