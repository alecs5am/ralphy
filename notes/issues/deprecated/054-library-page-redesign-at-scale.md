# Library page redesign — full-width, deep-linkable, infinite-scroll at scale

> **Status:** SUPERSEDED — 2026-06-05 by the shipped library-v2 (#092/#093/#100); depended on the deprecated #052 taxonomy
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** high
> **Category:** landing

## Context

`landing/app/library/` is framed narrowly as a "remix collection" (note `008`
phase 4) and overlaps the separate `landing/app/templates/` page. With `052`
making templates the universal unit across many formats, the library must become
the primary discovery surface and scale to tens of thousands of templates.

## What

Rebuild `/library` as a Pinterest-style, full-width, format-first browse + search
surface over the `052` taxonomy.

## Scope / acceptance

1. **Full-width layout** — masonry/grid using the whole viewport, not a centered
   column. No visible borders (memory rule); separate via bg-tint + shadow.
2. **Format → styles navigation**: top level lists formats (video, carousel,
   image, fb-creative, motion-design, poster, sticker-pack). Entering a format
   shows its general template + style grid.
3. **Deep links via query params**: `?format=carousel&style=...&q=...&tag=...`
   are the source of truth, shareable and back/forward-correct.
4. **Infinite scroll** (windowed/virtualized) + search that stays fast at 10k+
   templates (precomputed search index at build time; client filter).
5. **Copy-tag button** on every template (covered in detail by `055`/this issue):
   one click copies the `ralphy` tag/command to reproduce the template with the
   user's own data + refs.
6. **Fold `/templates` into `/library`** (or redirect) — one surface, no overlap.

## Why it matters

Discovery is the product surface users actually touch. At scale it must be fast,
shareable, and format-organized — the current centered remix page does not scale.

## Notes

- Depends on `052` (taxonomy) + `053` (skill scope, since skills leave the
  library). Pairs with `055` (results gallery).
- Reuse existing `landing/lib/library-*.ts` loaders; extend, don't rewrite blind.
