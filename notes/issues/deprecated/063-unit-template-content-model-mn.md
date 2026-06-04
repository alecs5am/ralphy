# Content model: Unit + typed building blocks (Template / Style / Recipe / Asset)

> **Status:** SUPERSEDED — 2026-06-05 — model implemented and evolved past (typed blocks + recipe-vs-tag #082; Blueprint #074-#080)
> **Filed:** 2026-05-31
> **Folder:** issues
> **Severity:** high (foundational direction)
> **Category:** architecture / content-model

## Context

Design discussion 2026-05-31 (library review session, continued). The first pass of
this issue modeled the world as a single `Template` entity ("a pattern / lens") with a
Unit ↔ Template many-to-many. The follow-up session **evolved that** into a set of
**distinct typed building blocks** that compose into a Unit, because one entity type
could not express the user's real ask: "use this template, but voxel style like that
video, and this photo treatment, and swap the location keeping the characters." Style,
treatment, and asset are independent axes that cross-cut every template — they cannot
be sub-rows of one `Template` table without collapsing back into a tree.

The library's primary surface is a Pinterest / higgsfield / artlist feed of concrete
content pieces (#065). Target scale: **tens of thousands** of pieces + blocks, plus
user uploads (#067). Storage is DB + blob (#064 — Supabase Postgres + S3, provisioned).

## What

A two-tier model. **Guidelines + Skills stay the invisible craft foundation** ("how
not to shoot your foot" — applied by the engine under the hood); they are NOT content
entities and never appear in the library feed. The **content system** below is the
user-facing, uploadable, browsable layer.

### Output entity

- **Unit** — a deliverable content piece holding **1..N media items**; its shape is set
  by `format`. `video` = 1 clip; `sticker-pack` = 32+ stills; `carousel` = N slides;
  `podcast-cuts` = N clips cut from one source; `fb-creative` = a set of silent videos
  + cards; `poster`/`image` = 1 still. Replaces the old "showcase output" concept —
  every produced or uploaded deliverable is a Unit. The library's primary browse item.
  **Naming `Unit` stays** (`sparks` rejected); the UI label may differ (open).

### Building blocks (typed, first-class, composable, uploadable, addressable)

- **Template** — the **structure / skeleton ONLY**, style-agnostic: the beat or layout
  pattern (choose-the-door, before/after, tier-list, IF/DO-NOT/BUT/AND PSA, hook→body→cta).
  *This de-conflates Template from style* (the change vs #052 and vs this issue's first pass).
- **Style** — the visual register / look + model picks + **reference examples** (voxel,
  PS1, analog-horror, photoreal, liminal-Undertale). Its examples are dual-purpose: the
  proof gallery AND the `--ref` images fed into `ralphy generate` so the look actually lands.
- **Recipe** — a composable treatment / effect, **many per Unit**, cross-cutting (VHS
  stack, chroma-split, grain-encode, trend photo-processing, lantern-glow). Carries a
  before/after pair + the executable recipe (ffmpeg / HyperFrames graph or prompt rider).
- **Asset** — concrete reusable media, by kind: `character` / `location` / `prop` /
  `music`. Carries master-shots (identity-lock `--ref`). **`location` is an Asset kind**,
  not part of Style — so the user can swap location while keeping style (and vice versa).

`Format` is a facet on both Unit and Template.

### Composition + the two link kinds

A Unit is produced from exactly **1 Template + 1 Style + N Recipes + M Assets** in a
`Format`. That ingredient list is the join. Two link kinds (generalizing the original
provenance/applicable split across all axes — load-bearing, do not collapse):

1. **provenance** (`produced-with`): the exact blocks that made this Unit. Factual,
   per-axis, auto-created at generation time.
2. **applicable** (`fits-slot`): alternative blocks that fit a given slot — "other
   styles that suit this template," "other characters for this slot." NOT auto-created;
   curation / embedding-suggested, a grow-into layer. Powers the slot-swap picker (#066)
   and cross-discovery (pivot from any block → feed of Units using it).

## Why it matters

- Typed blocks make the user's remix sentence directly expressible as **slot swaps**
  ("keep characters, change location"; "keep everything, swap characters") — see #066.
  The single-Template-pattern model could only express this as "pick a different
  applicable template," which loses the per-axis precision the user asked for.
- Units as first-class + addressable is what scales the feed to tens of thousands (#065).
- provenance vs applicable, now per-axis, is the difference between "what made this"
  (factual) and "what else fits here" (the swap menu). Invest in applicable over time;
  provenance is free at gen time.

## Scope / acceptance

Design / spec round only (no code until #064 infra direction is locked):

- Written model spec with all five entities + the composition join, e.g.:
  - `Unit { id, format, media[] (blob refs), aspect, caption, tags[], slotValues?, createdAt, ownerId? }`
  - `Template { id, slug, name, format, structure (beats/slots), slots[] }`
  - `Style { id, slug, name, modelPicks, promptSpine, exampleRefs[] (blob) }`
  - `Recipe { id, slug, name, kind (ffmpeg|hf|prompt), spec, beforeAfter[] (blob) }`
  - `Asset { id, slug, kind (character|location|prop|music), masterRefs[] (blob) }`
  - `unit_block { unitId, blockType, blockId, kind: "provenance" | "applicable", confidence? }`
- Migration map: every current `showcase.json` output → a Unit with `provenance` links;
  the 38 `vibe-style` cookbook templates + the 4 `guidelines/*` registers → seed Styles;
  asset-pool kinds → seed Assets; analog-horror VFX / encode recipes → seed Recipes.
- Decision log: (a) typed building blocks over single-Template-pattern; (b) Unit holds
  1..N media (collection); (c) Style/Asset/Recipe carry gen-ref examples; (d) location is
  an Asset, not Style; (e) provenance vs applicable now per-axis; (f) naming
  Template/Style/Recipe/Asset/Unit (confirm `Recipe` vs `Treatment`, `Template`=structure).
- Reconcile with #052 (mark its "template-as-unit / single style_of tree" superseded),
  #054/#065 (feed), #066 (slot-swap + block pages), #064 (schema), #059 (repo ownership).

## Notes

- **Supersedes this issue's own first pass** (single `Template` pattern/lens + Unit↔Template
  M:N, filed 2026-05-31 AM). Evolved to typed building blocks the same day.
- **Sequence: foundational — before #065, #066, #067.** Pairs with #064 (infra).
- Related: #052, #054, #056 (publish must now emit 5 entity types — see #056 update), #062.
- Open: do applicable links live per-Unit, or are they derived live from block/unit
  embeddings at query time? Cost vs freshness. Same question, now per-axis.
