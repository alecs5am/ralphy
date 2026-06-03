# Library unit detail — surface the full Blueprint (zero open questions)

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

The unit detail page (#066) shows the ingredient list (metadata blocks). With Blueprints
(#074/#077) we can show the complete reproduction recipe inline.

## What

Extend `/library/u/<id>` with a **Blueprint** panel that renders, copy-pasteable and complete:
the scenario / scene table, every per-beat prompt, the composition + the components/registry
blocks it uses, the model stack + params, the recipes (with values), and **downloadable hard
assets** (char masters, music). Goal: a user or agent reading the page has nothing left to ask
to reproduce the unit.

## Why it matters

This is the user-facing payoff — "get all the info for a specific unit" in one place.

## Scope / acceptance

- Unit page renders the Blueprint when present (prompts, scenario, composition, models, assets).
- Hard assets are downloadable from Storage; prompts/scenario are selectable text.
- Graceful when a unit has no Blueprint yet (show the metadata ingredients only).

## Notes

- Depends on #074, #077; extends #066 (unit-detail IA), #054/#065 (library at scale).
