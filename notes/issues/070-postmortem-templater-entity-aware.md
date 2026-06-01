# Make postmortem + templater entity-aware (units + blocks)

> **Status:** todo
> **Filed:** 2026-06-01
> **Folder:** issues
> **Severity:** medium
> **Category:** skills / architecture

## Context

The two project-harvest skills predate the content-entity model (#063) and the
project-local `units/` (#069). Neither knows about Unit / Style / Recipe / Asset
blocks. The user wants both to recognise and surface the new semantic blocks, and
templater to decompose-and-publish (blocks straight away, units separately) through
our Supabase envs → the site library.

## What

1. **postmortem** — add a section "Units produced + provenance" (which `units/` the
   project shipped, each with its template/style/recipe/asset slugs). Keeps it a retro
   (no extraction/publish), but records the blocks so templater/publish can consume them.
   New template file under the skill's `references/`. Keep the 6-file set + append-only.
2. **templater** — stop being a single-template extractor:
   - Decompose the project into ALL five entities (Unit + the 4 typed blocks), reusing
     `units/*/unit.json` (#069) as the Unit source of truth.
   - Tolerate scenario-less still/HyperFrames projects (the #062 fix — sticker packs,
     FB packs have no `scenario.json`).
   - Hand publishing to the #056 path (do NOT keep a parallel single-template writer as
     the library route). templater's job becomes "extract + classify into blocks";
     "publish to Supabase → library" is #056.

## Scope / acceptance

- `postmortem/SKILL.md` + a new `references/06-units.template.md`; lint:skills green.
- `templater/SKILL.md` rewritten to the entity model: read `units/`, emit the 5 entities,
  defer the publish step to #056, drop the "refuse if no scenario.json" hard gate.
- `docs/skills-vs-templates.md` cross-links updated (templater = extract/classify;
  #056 publish skill = the Supabase→library writer).
- English-only on disk; both skills pass `lint:skills` (≤1536-char desc).

## Why it matters

Closes the loop the user described: a finished project's deliverables and the blocks
that made them get recognised, classified, and pushed to the library without hand work.

## Notes

- Depends on #069 (units source) + #056 (publish path) + #062 (scenario-less extract).
- Pairs with #063 (the entity model these skills now speak).
