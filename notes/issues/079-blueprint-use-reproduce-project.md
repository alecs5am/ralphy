# `ralphy blueprint use` — scaffold a reproducible project from a published Blueprint

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

The point of Blueprints (#074): a user with NO original workspace can reproduce a unit
end-to-end. That needs a scaffold verb that materializes a project from a published Blueprint.

## What

`ralphy blueprint use <unit-id> --project <new-id>`: fetch the published Blueprint
(#077), then lay down a ready-to-run project — download the hard-asset refs into
`assets/`, write the prompt files + scenario, drop the composition (`index.html`), set the
model stack — so the agent can run the normal pipeline (`generate` → bake → `render`) and
land the same final unit. Complements `ralphy template use` (which scaffolds from the
GENERIC Template, #075); this reproduces a SPECIFIC unit.

## Why it matters

It is the end-to-end proof the whole system exists for: copy a unit → reproduce it exactly,
from empty project to final deliverable, no tribal knowledge.

## Scope / acceptance

- `ralphy blueprint use <unit-id> --project <id>` builds a project that renders to a unit
  matching the source (spot-check `choose-silenthill`).
- Pulls hard assets from Storage; respects the reference-required + append-only invariants.
- Works offline against the committed mirror when Supabase is absent (graceful degrade).

## Notes

- Depends on #074, #076, #077. Pairs with #075 (`template use`).
