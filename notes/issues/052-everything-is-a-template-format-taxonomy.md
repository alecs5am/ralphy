# "Everything is a template" — format → styles taxonomy rework

> **Status:** todo
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** high (foundational — blocks 053-058)
> **Category:** templates / architecture

## Context

Ralphy produces ANY media content — IG carousels, short videos, single images,
Facebook/Meta creatives, motion design in HyperFrames, posters, Telegram sticker
packs. The current model (note `008-skills-vs-templates-rework`) made niche
content *skills* the default route and templates a remix-only afterthought. The
user has reversed that: **the template is the universal unit of reusable media
know-how**, and skills are demoted to technical operations only (see `053`).

## What

Make **template** the single first-class concept, organized by **media format**,
with a **general → styles** hierarchy inside each format:

- Top dimension = media **format**: `video`, `carousel`, `image`, `fb-creative`,
  `motion-design`, `poster`, `sticker-pack`, … (extensible).
- Each format has a **general template** (the format's baseline how-to) plus N
  **style** templates that specialize it (e.g. carousel → 20 styles; video →
  analog-horror, GTA, unboxing, …).
- A user can use the general format template OR a specific style.

## Scope / acceptance

1. Add a `format` field + a `parent`/`style_of` relationship to the template
   schema (`cli/lib/schemas/template.ts`, `template.yaml`). Keep the existing 5
   persona categories as a secondary facet, not the primary axis.
2. Define the format enum + the general↔style relationship; document in
   `docs/skills-vs-templates.md` (rewritten under `053`) and a new
   `templates/FORMATS.md` manifest.
3. **Normalize all ~55 existing templates** into the new taxonomy: assign a
   `format`, mark each as general or a style-of a general, keep slugs stable
   (aliases for any rename). Convert retired niche `ralphy-ugc-*` skill content
   into style templates where it is real know-how (coordinate with `053`).
4. Update the loader (`landing/lib`, `cli` template loader) + `ralphy template
   list/show/suggest/use` to be format-aware. `bun run lint:templates` green.
5. Add `sticker-pack` as a format (feeds `058` Free Air VPN extraction) and
   confirm `motion-design` (HyperFrames) is representable.

## Why it matters

Every downstream item (library redesign, results gallery, extract-to-template,
backfill) keys off this taxonomy. Get the data model right once.

## Notes

- Supersedes the "open question" in `008` (38 vibe-style templates vs niche
  skills) — resolve in favor of templates.
- Sequence FIRST. All collisions on `template.yaml`/schema happen here.
