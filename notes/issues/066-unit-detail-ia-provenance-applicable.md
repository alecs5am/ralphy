# Unit detail page + IA: provenance, applicable templates, dual copy intents

> **Status:** exploring (design-first — depends on #063)
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

A **Unit detail page** plus the navigation model (information architecture):

- Shows the Unit (full media) + metadata (format, tags, created).
- **Provenance:** "Made with **Template X**" (the producing template, usually one).
- **Applicable templates:** "Templates you can use to make this" (the N
  `reproducible-via` matches from #063) — each links to its Template page.
- **Two explicit actions** (the copy-intent separation):
  1. **Remix this Unit** — reproduce this exact piece with a swap (uses the producing
     template + the Unit's own inputs/slot-values). Maps to a per-Unit reproduce tag.
  2. **Use a template** — pick one of the N templates → generate fresh / batch a farm.
     Maps to `@template:<slug>`.
- Template detail page cross-links back to **its Units** (close the loop).
- Keep navigation a clean **2-level loop** (feed → Unit → Template → its Units), not
  an infinite maze.

## Why it matters

- Realizes the copy-separation the user repeatedly asked for (Unit vs Template).
- The provenance + applicable split (#063) becomes visible and useful: factual origin
  vs "other recipes that fit."

## Scope / acceptance

- Route `/unit/<id>` (or equivalent) rendering provenance + applicable lists + both
  actions, reading the #064 API.
- Two copy actions emit the correct strings/tags: template-level `@template:<slug>`
  vs a Unit-reproduce tag (e.g. `@template:<slug>/<unit-id>` — ties to the "two-level
  addressable tags" idea captured earlier; the agent/CLI side is a separate Phase-2
  effort).
- Template detail lists its Units (provenance) and is reachable from a Unit's
  applicable list.
- IA doc: the feed → unit → template → units loop, with explicit guards against maze
  navigation.

## Notes

- **Sequence: after #063; pairs with #065.**
- The Unit-reproduce tag (`@template:slug/unit`) and the template tag are the
  "two distinct copy intents" — capture both; agent-side resolution (AGENTS.md routing,
  `ralphy template use`, unit-seed reproduction) is a later CLI phase.
- Related: #056 (publish flow), #062.
