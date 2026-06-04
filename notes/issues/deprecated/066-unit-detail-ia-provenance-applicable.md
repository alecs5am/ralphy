# Unit detail page + IA: provenance, applicable templates, dual copy intents

> **Status:** SUPERSEDED — 2026-06-05 by the shipped unit detail pages (#094/#095/#096)
> **Filed:** 2026-05-31
> **Folder:** issues
> **Severity:** medium-high
> **Category:** landing / frontend / IA

## Context

Design discussion 2026-05-31. With Units as the primary browse item (#063, #065), the
user wants: open a Unit → see the N Templates that correspond to it → jump to a
Template → see its Units. And the long-standing ask: separate "copy the base template"
from "I liked THIS specific piece, give me that." The M:N model (#063) makes this
expressible; this issue is the surface + navigation that realizes it.

## What

A **Unit detail page** built around the **ingredient list** (#063 typed blocks), plus
the navigation model (information architecture):

- Shows the Unit (full media — 1..N items per its format) + metadata (format, tags, created).
- **Ingredient slots** — the Unit's `provenance` blocks, one row per axis, each with a
  `change` control:
  - Template (structure) · Style (look) · Recipe[] (effects) · Asset[] (characters /
    location / props / music).
  - Each slot value links to that block's page (pivot). Clicking `change` opens the
    **applicable picker** for that slot: other fitting blocks (#063 applicable links) ·
    "describe a new one" (generate) · "upload" (ref). The non-changed slots stay pinned.
- This realizes the user's remix sentences as **per-slot swaps**, e.g. keep both
  Characters + Style, change Location; or keep everything, swap Characters.
- **Two explicit copy actions** (the copy-intent separation):
  1. **Remix this Unit** — reproduce this exact piece with one or more slot swaps (uses
     the provenance blocks minus the swapped slots). Maps to a per-Unit reproduce tag.
  2. **Use a building block** — jump to any block's page and start fresh / batch a farm
     from it (e.g. "use this Template", "use this Style"). Maps to `@template:<slug>` and
     the equivalent per-block tags.
- **Building-block pages** (Template / Style / Recipe / Asset): each = the block's
  definition + its reference examples (Style look-refs, Asset master-shots, Recipe
  before/after) + a **filtered feed of Units that use it**. Same feed component as #065.
- Keep navigation a clean **2-level loop** (feed → Unit → block → that block's Units),
  not an infinite maze.

## Why it matters

- Realizes the copy-separation the user repeatedly asked for (Unit vs Template).
- The provenance + applicable split (#063) becomes visible and useful: factual origin
  vs "other recipes that fit."

## Scope / acceptance

- Route `/unit/<id>` (or equivalent) rendering the ingredient slots (provenance) with a
  per-slot `change` → applicable picker (other block / describe-new / upload), reading
  the #064 API. Non-changed slots stay pinned across a remix.
- Block pages `/template|style|recipe|asset/<slug>` = definition + reference examples +
  filtered Unit feed.
- Copy actions emit the correct strings/tags: a Unit-reproduce tag (e.g.
  `@template:<slug>/<unit-id>`, carrying the slot swaps) vs per-block tags
  (`@template:<slug>`, and equivalents for style/recipe/asset). Agent/CLI resolution is
  a separate Phase-2 effort.
- IA doc: the feed → unit → block → that-block's-units loop, with explicit guards
  against maze navigation.

## Notes

- **Sequence: after #063; pairs with #065.**
- The Unit-reproduce tag (`@template:slug/unit`) and the template tag are the
  "two distinct copy intents" — capture both; agent-side resolution (AGENTS.md routing,
  `ralphy template use`, unit-seed reproduction) is a later CLI phase.
- Related: #056 (publish flow), #062.
