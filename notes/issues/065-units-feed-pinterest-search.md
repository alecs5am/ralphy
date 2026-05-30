# Units feed: Pinterest / higgsfield / artlist-style searchable feed

> **Status:** exploring (design-first — depends on #063 + #064)
> **Filed:** 2026-05-31
> **Folder:** issues
> **Severity:** high
> **Category:** landing / frontend

## Context

Design discussion 2026-05-31. The user wants the library's primary surface to be a
feed of concrete content pieces (Units, #063) — "like Pinterest, or the
higgsfield / artlist feed" — searchable across both Units and Templates, scaling to
tens of thousands of items. This evolves #054 (which made the grid a Pinterest-style
view over the *current static template taxonomy*); here the grid is **Units-first** and
backed by the DB (#064), not build-time files.

## What

Rebuild the `/library` main grid as an **infinite feed of Units**:

- Each tile is a Unit (video/image/sticker/etc.), media from blob storage (#064).
- A single search box matches **both Units and Templates** (name, caption, tags,
  format, the template a Unit was produced by).
- Filters: format, tag, and "from template X".
- Windowed infinite scroll (the existing `LibraryListing` IntersectionObserver
  windowing pattern carries over).
- Looping muted video previews on Unit tiles (already the card behavior).
- Tile click → Unit detail (#066).

## Why it matters

- Units are visual and numerous → the best discovery/inspiration surface and the one
  that actually scales to tens of thousands.
- Aligns the product with the higgsfield/artlist mental model the user referenced.

## Scope / acceptance

- Feed UI queries the #064 API for Units (paginated, filtered by format/tag/template).
- Search returns mixed Unit + Template results (clearly distinguished in the UI).
- Format + tag + from-template filters drive URL params (keep deep-linkable +
  back/forward, like the current listing).
- Infinite scroll over large result sets without holding the whole list in the DOM.
- Until #064 lands, may prototype over a "showcase-outputs-as-Units" adapter against
  the current static index to validate the IA.

## Notes

- **Sequence: after #063 (model) + #064 (backend).**
- **Evolves #054** — units-first feed vs templates-first grid. Cross-link; #054's
  windowing/URL-param work is reusable. Decide whether #054 is folded into this.
- Pairs with #066 (Unit detail). Related: #052.
