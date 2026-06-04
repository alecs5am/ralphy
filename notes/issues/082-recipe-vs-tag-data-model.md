# Recipe-vs-tag split — data model (enrich Recipe, introduce Tag)

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues

## Context

The library treats recipes as a tag cloud: 23 recipe blocks, all `refs: 0`, no
described content, no copyable artifact, no preview. The `Block` type has no field
for recipe body/code/preview, and there is no Tag concept at all. The user wants a
clean split (decided 2026-06-04):

- **Tag** = a textual characteristic for finding similar videos. No extractable
  recipe. Filter-only — a chip, NOT a detail page.
- **Recipe** = something you can actually extract and apply standalone (an ffmpeg
  filtergraph, a HyperFrames snippet/effect, a prompt-style recipe like "PS1 Harry
  Potter look"). Must be described + maximally interactive on the site.

## What

1. **Enrich the Recipe block** (`landing/lib/library-v2/types.ts` + CLI mirror):
   add `recipeKind` (`ffmpeg`|`encode`|`overlay`|`bake`|`hyperframes`|`prompt`),
   `body` (markdown how-to), `artifact` (the copyable reusable code: the ffmpeg
   filtergraph / HF snippet / prompt template), `params?`, and `demo` — either an
   embedded HF composition (`html`/`storageUrl`, live-runnable) or before/after
   media (`beforeUrl`/`afterUrl`) for non-runnable kinds. All optional/additive.
2. **Introduce Tag** as a lightweight unit-level label: `tags: string[]` on `Unit`
   (+ a `TAGS` facet in the loader for filtering). NOT a block; no detail page.
3. **DB**: extend the `blueprints`/`blocks`/`units` schema as needed — a `recipes`
   detail column or reuse `blocks.refs`/a new jsonb `data` column for the enriched
   recipe payload; a `units.tags` jsonb column. Idempotent migration.
4. Keep `Block.refs` working; everything additive so existing entries still load.

## Acceptance

- Types + Zod mirror compile; `next build` passes; existing blocks/units validate.
- A recipe can carry body+artifact+demo; a unit can carry tags.
- Migration is `if not exists` / additive.

## Notes

- Foundation for #083 (normalize), #084 (recipe UI), #085 (asset player).
- Recipe artifact content source: the blueprints published in #081 carry
  `recipes[]` with `command`+`params` — the canonical content to author from.
