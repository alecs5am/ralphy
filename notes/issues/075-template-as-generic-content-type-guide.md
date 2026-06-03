# Template = the generic "how to make this content type" entity (vs Blueprint)

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

Today "Template" is overloaded: it is both one of the four #063 metadata block kinds
(structure skeleton) AND the repo `templates/<category>/<slug>/` artifact (prompt-cookbook,
model-stack, composition skeleton, slots). The user's mental model splits cleanly into two
entities: **Template** (general) and **Blueprint** (specific, #074).

## What

Define **Template** as the generic, reusable guide to a CONTENT TYPE — not a single unit:
how to make this kind of content, how to prompt it (a slotted prompt-cookbook), which
assets/models are commonly used, the craft rules and anti-patterns. It is the
learn/discover/build-from entity. The repo `templates/.../` dirs (e.g.
`analog-horror-pick-a-door`: `prompt-cookbook.md`, `composition-skeleton.html`,
`model-stack.md`, `{{slots}}`) ALREADY are this — formalize them as the Template entity and
make `ralphy template use <slug>` the scaffold-a-new-project path from a Template.

## Why it matters

Clear separation: **Template** answers "how do I make a video like this?"; **Blueprint**
answers "how do I reproduce THIS exact video?". One Template fans out to many Units; each
Unit has one Blueprint. Removes the current ambiguity that left units metadata-only.

## Scope / acceptance

- `skills-vs-templates.md` + `library-v2/types.ts` updated to state the Template(generic) /
  Unit / Blueprint(specific) cardinality and what each carries.
- A Template surfaces its prompt-cookbook + slots + common assets/models in the library and
  via `ralphy template show`; `ralphy template use` scaffolds from it.
- The existing "Template block kind" question resolved against #074's layer-vs-replace decision.

## Notes

- Pairs with #074 (Blueprint). Touches #008 (skills-vs-templates rework), #062 (extract/discovery),
  #066 (unit detail), #056 (publish).
