# Normalize-skills skill + auto-generate missing icons

> **Status:** todo
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** medium
> **Category:** skills / landing

## Context

After the `053` de-prefix + scope cut, skills need a maintenance pass: consistent
frontmatter, and the skills page needs an icon per skill. An icon pipeline
already exists from note `008` phase 3b — `landing/scripts/gen-skill-icons.sh` +
`landing/scripts/build-skill-icons.py`, throwaway project `landing-skill-icons-001`,
output `landing/public/assets/skills/<slug>.webp`. New/renamed skills lack icons.

## What

1. A skill (e.g. `/normalize-skills`) that audits every `.agents/skills/*/SKILL.md`
   for frontmatter health (name regex, description ≤1536, category metadata,
   symlink presence) and reports/fixes drift.
2. It detects skills **without an icon** and generates them via the existing
   pipeline (chroma-green gen → Pillow chroma-key → fixed-box tile → webp), then
   commits the new webp tiles + pushes.
3. **Extract the icon-generation recipe into a template** (per `052`, format =
   `image`, an "app/skill pixel-icon tile" style) so the recipe is reusable, not
   buried in a bash script.

## Scope / acceptance

- New skill under `.agents/skills/` (de-prefixed); `lint:skills` green.
- Reuses + (if needed) generalizes `gen-skill-icons.sh` / `build-skill-icons.py`
  for arbitrary new slugs; respects the chroma-key + category-bg conventions.
- Only generates for skills missing a webp; never regenerates existing tiles
  without explicit ask (append-only).
- `landing` builds clean with all skill detail pages getting an icon.

## Why it matters

Keeps the skills marketplace visually complete as skills are renamed/added, and
turns a one-off icon script into a first-class reusable template.

## Notes

- Depends on `053` (final skill set + names) + `052` (icon-gen template).
- Needs `OPENROUTER_API_KEY`. ~$0.15/icon (per `008` phase 3b).
