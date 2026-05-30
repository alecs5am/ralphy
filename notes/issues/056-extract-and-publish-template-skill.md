# Extract-and-publish-template skill (one-shot, like /release)

> **Status:** todo
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** medium
> **Category:** skills / cli

## Context

`033` is done — `ralphy template extract <project-id>` exists. What is missing is
the `/release`-style one-shot: while chatting about a finished project, the user
says one phrase and a template is built, slotted into the library taxonomy, and
pushed — no manual category/slug/commit dance.

## What

A skill (e.g. `/publish-template`) that, from the active project context:

1. Runs `ralphy template extract` with the right `052` **format** + general/style
   placement (infers format from the project; confirms with user).
2. Fills the `template.yaml` (slots, tags, model stack, cost rollup, lessons from
   the postmortem) and seeds a showcase entry (`055`) from the project's render.
3. Migrates heavy locked refs to `ralphy-assets/pool/`.
4. **Commits + pushes** to `origin` (main) — same channel discipline as
   `/ralphy-dev-release`. Reports the live `/library` URL.

## Scope / acceptance

- New skill under `.agents/skills/` (de-prefixed per `053`), with ALSO FIRE /
  DO NOT FIRE / HARD INVARIANTS sections; `lint:skills` green.
- Idempotent: re-running on the same project versions the showcase, never
  clobbers the template (append-only invariant #14).
- English-only on disk; runs the pre-commit Cyrillic gate.
- Smoke: extract a real recent project end-to-end into `templates/<format>/...`.

## Why it matters

Makes templates compound automatically. The whole library grows from "say one
phrase in the project chat" instead of a manual multi-step extraction.

## Notes

- Depends on `052` (format placement) + reuses the existing extract verb.
- Model it on `/ralphy-dev-release` (3-channel publish discipline).
