# recipe-vs-tag

The #082/#083 classification discipline. Read this before you emit ANY `kind:"recipe"` block. It is the rule that keeps the library's recipe pages real instead of a "tag cloud" of empty chips.

## The split (settled — do not redesign)

`../ralphy-web/lib/library-v2/types.ts` enshrines two distinct concepts. Every candidate "effect / treatment / look" you find in a project is one of them, never both:

- **Recipe** = an **EXTRACTABLE, APPLICABLE artifact**. It STAYS a Block (`kind:"recipe"`) and earns a detail page. A recipe is the thing you *reproduce*.
- **Tag** = a pure **textual descriptor** with NO extractable artifact. It is NOT a block, gets NO detail page, and becomes a `tags[]` entry on the Unit(s) that used it. A tag is the thing you *filter by*.

## The decision rule (the wording committed)

> **A candidate is a RECIPE only if you can author a real, copyable artifact for it — an ffmpeg filtergraph, an encode/bake command, a HyperFrames snippet, or a concrete prompt-style technique — sourced from the project's own files, never invented. If you cannot extract a real artifact, it is a TAG: a descriptor that becomes a `tags[]` entry on the Unit, with no block and no detail page. Never publish an empty recipe block (refs:0, no `body`, no `artifact`) — that empty chip is the "tag cloud" anti-pattern this split exists to kill.**

Rule of thumb: ask "could a stranger paste this and get the effect?" If yes → recipe (author the artifact). If it is only a vibe word the project applied with no isolatable code or technique → tag.

## What a kept Recipe must carry (author ALL of these)

When you keep a candidate as a recipe, author the enriched-recipe payload (`Block` fields, #082) — a bare recipe with only a name is a defect:

- **`recipeKind`** — the treatment class, one of `ffmpeg` | `encode` | `overlay` | `bake` | `hyperframes` | `prompt`.
- **`body`** — markdown how-to: what it is + how to use it standalone ("## What it is", "## When to use it", "## Knobs"). The `ffmpeg-xfade-master` block in `published.ts` is the model to imitate.
- **`artifact`** — the REAL copyable code, sourced — never invented — from one of:
  - `cli/lib/ffmpeg-recipes.ts` (the canonical builders: `buildVhsFilter`, `buildColorGradeFilter`, `buildSidechainFilter`, `buildMixMusicFilter`, `buildContactSheetFilter`, the CRF/encode helpers) — for ffmpeg / encode / overlay recipes.
  - the project's own bake / stitch scripts under `.ralphy/workspaces/<ws>/projects/<id>/scripts/` (the `tmp-bake-*.sh` / `tmp-i2v-*.sh` family) and the captured `blueprint.json`'s `recipes[].command` — for bake recipes.
  - the project's `index.html` (the GSAP overlay fn, the registry block, the CSS keyframes) — for HyperFrames recipes.
  - the verbatim prompt + technique from the gen-log / `prompts/**` — for `prompt` recipes (e.g. a "PS1 Harry Potter look" prompt spine).
- **`params`** — the named knobs/values for the artifact (e.g. `{ "D": 0.5, "fps": 24, "crf": 30 }`).
- **`demo`** — a live or visual demo so the library page is interactive:
  - `recipeKind:"hyperframes"` → a self-contained runnable `demo.html` (inlined as `demo.html` or referenced via `storageUrl`). It must run standalone (no project deps).
  - ffmpeg / encode / bake → before/after media (`beforeUrl` + `afterUrl`) **when real frames exist** in a unit; a single `afterUrl` when only the result exists. Do NOT fabricate frames — if none exist, ship the recipe without a media demo and note it.

## Worked example — recipe vs tag in one project (choose-magicschool)

- **Chroma Split** → **RECIPE**. It is `ffmpeg rgbashift` (a real filtergraph). Author `recipeKind:"ffmpeg"`, `body` (what/when/knobs), `artifact` = the rgbashift filter string from the project's bake script, `params` = the per-channel pixel offsets, `demo` = before/after frames from the death beat. Earns a detail page.
- **play-freeze-fork**, **smpte-countdown-disc** → **RECIPES**. HyperFrames death-screen / fork beats. `recipeKind:"hyperframes"`, `artifact` = the GSAP overlay snippet from `index.html`, `demo` = a runnable `demo.html`.
- **"rain overlay" / "soft bloom"** applied only as a vibe with no isolatable filter or snippet → **TAGS**. They become `tags:["rain overlay","soft bloom"]` on the unit. No block, no page.

## Worked cautionary example — the de-dup that #083 had to clean up

`choose-path-xfade-master` was published as a NEW recipe when the canonical `ffmpeg-xfade-master` already existed and covered it exactly — a duplicate block. The fix (#081/#083): delete the dup from Supabase + `published.ts`, repoint every unit that referenced it to `ffmpeg-xfade-master`. **The lesson for this skill: de-dup BEFORE you author.** Before writing a NEW recipe's `body`/`artifact`, match it against the live library (`PUBLISHED_BLOCKS` in `published.ts` + `ralphy template list`); if an existing recipe already carries that artifact, REUSE its slug and cite it — never publish a second copy.

## Where this lands in the publish step

- A kept recipe publishes via `publish-entity.ts --block-file <spec.json>` carrying `recipeKind` + `body` + `artifact` + `params` + `demo`. Those pack into the `blocks.recipe_kind` column + the `blocks.data` jsonb. The `demo`'s `demo.html` / before-after media + any `refs` ride along to Storage so the page is interactive.
- A tag carries NO block. It lands as a string in the Unit's `unit.json` `tags[]` and publishes with the Unit (`--unit`), into the `units.tags` jsonb column → the feed's `TAGS` filter facet.
