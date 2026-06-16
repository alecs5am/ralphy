# Library data gap: nyastics-emotes-final has empty templateId

> **Status:** issue
> **Filed:** 2026-06-16
> **Folder:** issues

## Context

The `lint:library` QA check added in #448 surfaces one provenance warning against `landing/lib/library-v2/library.json`: the unit `nyastics-emotes-final` has an empty `templateId` (every other unit resolves a template cleanly). Left as a `warn` (not `fail`) so the real library stays green, with the gap surfaced for the maintainer rather than silently patched.

## What

Set `nyastics-emotes-final.templateId` to the correct template block id (or, if no template applies, decide whether a unit may legitimately carry no template and adjust the `lint:library` provenance rule accordingly). This is a data fix in the committed `library.json` + a possible Bunny re-upload via the existing publish path — not a code change.

## Why it matters

The library is execution input for agent routing (#063), not just a gallery. A unit with no template breaks the Unit = Template + Style + Recipes + Assets reproduction model and the blueprint/extract path.

## Scope / acceptance

- Determine the right `templateId` for the nyastics emotes unit (domain knowledge — likely the sticker-pack template it was extracted from).
- Update `library.json` (+ republish via `landing/scripts/publish-entity.ts` if the CDN copy must match).
- `bun run lint:library:fast` → 0 warnings.

## Notes

- Surfaced by #448. If a no-template unit is ever valid, the fix is to the lint rule instead of the data.
