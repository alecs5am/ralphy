# 552 — Instagram alt text for SEO: no publish-path support

> **Status:** dropped (2026-07-21) — blocked upstream: the Postiz public API Media object is `{id, path}` only, no alt-text field. Revisit if Postiz adds per-media alt support (see the Blocker section).
> **Filed:** 2026-07-21
> **Folder:** issues/deprecated

## Context

The `ralphy-automaton` workspace `SOCIAL_STRATEGY.md` treats Instagram as a
search surface (Google/Bing index public posts from eligible accounts — see
help.instagram.com/147542625391305) and mandates, per image, "Alt text: describe
the creative using search phrases, on every image."

The publish path cannot set it. `captionForTarget` /`buildPostEntry`
(`cli/lib/publish/mapping.ts`) only produce `value[].content` (caption + tags)
and `value[].image` media refs. The Postiz media object is `{ id, path }` with no
alt/accessibility field:

- `PostizPostValue.image` is `Array<{ id?: string; path?: string }>`
  (`cli/lib/providers/postiz.ts`).
- The Postiz public API create-post schema documents the Media object as exactly
  `{ id (required), path (required) }` — no `alt` / `altText` / `description`
  (docs.postiz.com/public-api/posts/create, verified 2026-07-21).

So alt text is currently absent on every scheduled/published IG post, and there
is no supported way to send it through the Postiz public API. Plumbing an `alt`
field into `unit.json` + the mapping today would be dead code Postiz drops.

## Blocker

Upstream: the Postiz public API does not accept per-media alt text. This is not
fixable in the CLI alone.

## Task

- Confirm whether the Postiz app (self-hosted / cloud) accepts per-media alt text
  by any route: a `settings` field on the Instagram provider entry, an
  undocumented media property, or an `/upload` param. Check the Postiz app source
  (gitroom/postiz-app), not just the public docs.
- IF a route exists: add an optional per-media `alt` to the unit media schema
  (`cli/lib/schemas/unit.ts`), thread it through `buildPostEntry` →
  `PostizPostValue`/settings, and cover it in `tests/unit/publish-*.test.ts`.
  Author alt text via the existing `unit caption` seam (search-phrase grounded,
  per the SEO strategy), never a generic guess.
- IF no route exists: keep the schema field OFF (no dead plumbing). Add an
  `alt`-authoring helper that emits per-image alt text into `unit.json` for
  manual paste into Postiz/Instagram, and note the manual step in the
  social-publish skill.

## Notes

Origin: `ralphy-automaton` scheduled-IG SEO pass (2026-07-21). The 8 future IG
carousels/reels (2026-07-22..28) had their captions SEO-revised
(keyword-led first line, keyword body, backlink) via `unit caption --copy-file`
+ `publish --revise`; alt text was the one strategy checklist item that could not
be applied through the CLI. See related #551 (another Postiz-public-API shape
gap).
