# Library main-feed unit card redesign — media-first Pinterest "Visual Feed"

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** high
> **Category:** landing / frontend / design-system

## Context

Design handoff (`design_handoff_visual_feed`, 2026-06-04) redesigns the **main
`/library` feed unit card**. During fast scrolling the card should carry **no
text beyond a one-line title** — the unit TYPE reads purely visually (icon-only
format badge in the format hue + the format's aspect + structural multi-item
shape + the per-format colour). Only on **hover / focus-within** does the card
reveal the recipe panel: format · count eyebrow, the ingredient **genome**
strip, the Template + look chips, and Open / Remix actions over a bottom scrim.

Decisions (confirmed with user, 2026-06-04):
- **Scope: main feed ONLY.** Keep the existing compact `<UnitCard>` on
  block-page grids (`UnitGrid`) and unit-page recommendation rails (`UnitRail`).
- **Masonry: keep the existing JS row-major shortest-column packer** + the
  IntersectionObserver infinite scroll + incremental packing (#092) — preserves
  newest-first left-to-right reading order. Apply the new card's visuals inside it.

## Integration deltas from the prototype

- **Real media, not the schematic `.fm` gradient.** Units have real media; render
  via the existing `<Media>` / `MediaCell` / `UnitMediaShape` (which already does
  the per-format structural shapes — contact sheet / deck / stack — with real
  media). Layer the badge / play / hover overlay / caption on top. The schematic
  `.fm` gradient + `--ang/--gx/--gy` hash is NOT used.
- **Style is a TAG, not a block** (the app folded `styleId` → `tags[]` in
  #082/#084). Genome segment-1 = `▦` template + `✸` lead look-tag; the `.gnames`
  chips = Template `BlockChip` + lead `TagChip` (not two BlockChips).
- **No prototype top bar.** `/library` already has the app `<Nav>` + hero +
  toolbar + tag cloud (#093). Keep them; only the card changes.
- **JS packer body estimate.** The new card's caption is one line (~30px) vs the
  old tile's ~132px body — update `TILE_BODY_PX` (and the video/podcast 4/5 feed
  crop) so columns balance.

## What

A new media-first feed card (`.gcard`) used by `LibraryListing`'s masonry:
- Resting: media (real, via the existing renderer) + icon-only `.gbadge` (format
  glyph in `--hue`) + `.ph-play` for video/motion-design + one-line `.gcap`
  caption (cdot + title). Video / podcast-cuts cropped to `4/5` in the feed.
- Hover/focus-within: `.gover` scrim + `.gover-actions` (Open / Remix pills,
  `.va`) + `.gover-info` (eyebrow + `.vc-genome` + Template/look chips). Media
  zoom 1.045, card lift, shadow grow. Genome encodes template/look/recipes/
  assets-by-sub as glyph segments.
- Whole card links to `/library/u/<id>`; Remix stops propagation → existing
  `RemixModal` (reuse `remixForUnit`).

Reuse app helpers: `fhue`, `blockGlyph`, `SUB_META`, `KIND_META`, `mediaUrl`,
`unitTileAspect`, `BlockChip`/`TagChip`, `PlayIcon`/`OpenIcon`/`RemixIcon`, the
`.ph-*` peek classes, the `--block-ink` tokens. Port the `.vc-genome` / `.va`
styles into `library2.css`.

## Scope / acceptance

- New feed card renders in the `/library` masonry; the compact `<UnitCard>` stays
  on grids + rails.
- Type reads at a glance (badge + aspect + shape + hue); detail only on hover.
- Genome + chips reflect the app model (Template block + look tag + recipes +
  assets-by-sub).
- Column balance correct (packer body estimate updated); video/podcast 4/5 crop.
- No visible borders (bg-tint + shadow + spacing); reduced-motion honored;
  `bunx next build` + `bunx tsc --noEmit` green; English-only.

## Notes

- Brief + runnable prototype: `design_handoff_visual_feed/` (README + `reference/`).
- The "DNA Feed" variant (genome always visible under the title) is reference
  only — not the chosen direction.
- Builds on #087–#094 (shadcn base, `<Media>`, `<UnitCard>`, masonry, rails).
