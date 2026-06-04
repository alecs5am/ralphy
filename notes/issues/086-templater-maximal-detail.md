# Make the /templater skill do the full pipeline in maximum detail

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues

## Context

The user ran the templater flow manually and wants the skill to do the whole thing,
thoroughly, end-to-end: decompose a finished project into components, format ALL
blocks, match against existing blocks to avoid duplication, capture a detailed
Blueprint per unit, and push + publish everything — with the new recipe-vs-tag
discipline baked in.

## What

Rewrite/extend `.agents/skills/templater/SKILL.md` (+ references) so a single
invocation is the maximal-detail pipeline:
1. EXTRACT + CLASSIFY the 5 entities (Unit + Template/Style/Recipe/Asset) — already
   there from #070/#080.
2. **Recipe-vs-tag classification** (#082/#083): for each candidate effect, decide
   real-recipe (extractable artifact → author body+artifact+demo) vs tag (a
   descriptor → unit tag). Never publish an empty recipe.
3. **Per-unit Blueprint** via `ralphy blueprint create` (#080) — verbatim prompts,
   composition, model stack, recipes, hard assets.
4. **De-dup**: match every block + recipe + asset against the live library first;
   reuse, don't duplicate (cite the existing slug).
5. **Publish**: print/run the exact publish-entity.ts commands for units, blocks,
   tags, and `--blueprint` — the full set, in order, with dry-run-first guidance.
6. English-only-on-disk reminder for any captured prose (e.g. translate folklore
   terms — the swamp `нечисть`->`the unclean` lesson from #081).

## Acceptance

- The skill describes the complete extract → classify (incl. recipe-vs-tag) →
  blueprint → de-dup → publish flow in detail; `lint:skills` green (desc <=1536).
- A maintainer following it reproduces what the user did by hand.

## Notes

- Depends conceptually on #082/#083 (recipe-vs-tag) + #080 (blueprint emit). Can be
  written in parallel; finalize the recipe-vs-tag wording after #082 lands.
