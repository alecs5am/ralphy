# Extract-and-publish-template skill (one-shot, like /release)

> **Status:** done — 2026-06-05 (shipped as the `dev-publish-template` skill)
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

1. **Factor the project into entities** (#063): the project's `units/*/unit.json` (#069)
   → **Units**; the beat structure → a **Template**; the look + its anchor refs → a
   **Style**; the VFX / encode / overlay recipes → **Recipes**; the locked character/
   location/prop/music refs → **Assets**. Match each against existing blocks first; only
   propose a NEW block for a genuine gap. Confirm format + placement with the user.
2. Fills each entity's metadata (slots, tags, model stack, cost rollup, lessons from the
   postmortem; Style/Asset/Recipe example refs) and links the Units to their provenance
   blocks (#063).
3. **Publish, two separable targets** (the user wants both): **(a) publish blocks** on
   their own (a Style / Recipe / Asset can be pushed to the library without a Unit), and
   **(b) publish units** separately (a Unit + its provenance links). Both write to our
   **Supabase** project — DB rows + Storage media — via the existing `landing/scripts/
   seed-supabase.ts` infra (S3 upload + idempotent seed SQL applied over the pooled
   Postgres in `.env.local`); then the data surfaces in the site library. Heavy refs
   also mirror to `ralphy-assets/pool/` + the committed open-source catalog (so the
   library stays downloadable — two-store model, #064).
4. Idempotent + append-only: re-publishing upserts rows / versions media, never clobbers.
   Reports the live `/library` URL(s) for what was pushed.

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

- Depends on `063` (entity set) + `069` (units source) + `064` (Supabase — now LIVE:
  schema + seed-supabase.ts + creds in `.env.local`) + reuses the extract verb (`062`).
- Two publish modes are first-class and independent: **publish-blocks** and
  **publish-units** (the user explicitly wants to push blocks on their own, units apart).
- This is the maintainer-internal contribute flow; `067` is the untrusted-user variant —
  share the decomposition + validation logic.
- Model it on `/dev-release` (3-channel publish discipline) + the Supabase seed path.
