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

A skill (e.g. `/publish-template`) that, from the active project context,
**decomposes the finished project into the #063 entity set** and publishes them:

1. **Factor the project into entities** (#063): the render(s) → one or more **Units**;
   the beat structure → a **Template**; the look + its anchor refs → a **Style**; the
   VFX / encode / overlay recipes used → **Recipes**; the locked character/location/prop/
   music refs → **Assets**. Match each against existing blocks first; only propose a NEW
   block for a genuine gap. Confirm format + placement with the user.
2. Fills each entity's metadata (slots, tags, model stack, cost rollup, lessons from the
   postmortem; Style/Asset/Recipe example refs) and links the Units to their provenance
   blocks (#063).
3. Migrates heavy refs to blob storage (#064) / `ralphy-assets/pool/`.
4. **Commits + pushes** (seed) and/or writes to the backend (#064) — same channel
   discipline as `/dev-release`. Reports the live `/library` URL.

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

- Depends on `063` (entity set — publish now emits 5 entity types, not one template) +
  `064` (where they land) + reuses the existing extract verb (`062` removes its blockers).
- This is the maintainer-internal contribute flow; `067` is the untrusted-user variant —
  share the decomposition + validation logic.
- Model it on `/dev-release` (3-channel publish discipline).
