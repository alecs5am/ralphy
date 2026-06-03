# Blueprint entity — the per-unit, reproduction-grade recipe

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

The library publishes Units + the four #063 metadata blocks (Template/Style/Recipe/Asset),
but those are **blurb-only** (verified on `choose-silenthill`: every block `refs: 0`, no
prompts / scenario / composition / asset files). A user copying a unit from the website,
with no `workspace/projects/<id>/` (it is gitignored), gets the video + one-line blurbs —
not enough for the user OR an agent to reproduce the result. The reproduction payload only
exists in the gitignored project. We need a first-class entity that carries everything.

## What

Introduce **Blueprint** — a self-contained, ultra-detailed guide to reproduce ONE unit
end-to-end, from empty project to final deliverable, leaving zero open questions for a
human or an agent reading it. A Blueprint captures, concretely (not summarized):

- **Scenario / scene table** — every beat, duration, fork labels, VO lines, SFX flags.
- **Per-stage prompts** — image, i2v, VO, music, captions (verbatim, with `{{slots}}` noted).
- **Composition** — the HyperFrames `index.html` (or skeleton), the `A[]`/`SEG[]` timing
  arrays, and **which components/registry blocks/overlay functions** it uses.
- **Hard assets** — the actual files (character masters, music bed, ref images), not names.
- **Model stack + params** — per stage: model id, key flags, voice ids, cost rollup.
- **Recipes / effects** — the concrete ffmpeg/encode/overlay recipes with values.

Cardinality: **Template 1→N Units; Unit 1→1 Blueprint.** A Blueprint belongs to exactly one
Unit and is the exact recipe for it; a Template generalizes across many Units (see #075).

## Why it matters

Without it, the library is an index, not a knowledge base — every reproduction re-derives
prompts/scene-timing/composition by re-watching the video, re-paying the original iteration
cost. Blueprint is the difference between "here is what we made" and "here is how to make it."

## Scope / acceptance

- New `Blueprint` type in `landing/lib/library-v2/types.ts` + a CLI Zod schema
  `cli/lib/schemas/blueprint.ts`, fields covering the six payload axes above + `unitId` (1:1).
- A `blueprints` shape in the data model (DB table seed-ready; see #064/#077).
- Decision recorded: **does Blueprint REPLACE the 4 block kinds, or LAYER on top?**
  Recommendation: **layer** — keep blocks as the generic discovery vocabulary, Blueprint
  references them + adds the full payload (least disruptive; 107 blocks already live).
- Types compile; a hand-written sample Blueprint for `choose-silenthill` validates.

## Notes

- Foundational — blocks #076 (`ralphy blueprint`), #077 (publish), #078 (UI), #079 (reproduce),
  #080 (templater), #081 (backfill).
- Reconcile with #063 (5-entity model), #069 (units), #064 (backend infra).
- Open question: Blueprint payload size (composition + assets) vs Supabase object caps — see #073/#077.
