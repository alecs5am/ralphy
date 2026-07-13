---
name: templater
namespace: user
description: >-
  The full extract → classify → blueprint → de-dup → publish pipeline for a finished `.ralphy/workspaces/<ws>/projects/<id>/`. Reads its `units/*/unit.json` (#069) as the Unit source of truth, then factors the project into ALL FIVE entities — Unit + the four typed blocks Template (structure), Style (look), Recipe (effect/treatment), Asset (reusable media). Applies the recipe-vs-tag split (#082/#083): a candidate is a Recipe only if it carries an extractable artifact (ffmpeg filtergraph / HyperFrames snippet / encode recipe / prompt technique); otherwise it is a Tag on the Unit. Captures a per-unit Blueprint (#080), de-dups every block against the live library FIRST, then prints the exact ordered `publish-entity.ts` commands (dry-run → --push). Publishing itself is the #056 path.

  USE WHEN the user says any of: "save this as a template", "turn the project into a template", "templatify <project-id>", "extract a template from <project>", "decompose this project into blocks", "what units/blocks did this project produce", "I want others to reproduce this", "make a reusable version of <project>", "extract the entities from <project>", "classify this project", "freeze this project". ALSO FIRE proactively after a successful render + postmortem the user rates 8+/10 — the experience is most reusable while still fresh.

  DO NOT FIRE for scaffolding a new project, one-off renders, or quality evaluation — see the DO NOT FIRE section in the body.
---

# templater

You decompose a finished project into the **content-entity model** (#063) and classify its pieces into reusable blocks. The contract is: **a future agent should be able to reproduce the work — same units, same blocks (Template / Style / Recipe / Asset) — without re-deriving any of it from the raw `artifacts/` dump.**

> **Where this sits in the Unit lifecycle.** templater runs AFTER Unit formation (phase 17) in the canonical [Unit lifecycle](../../../docs/playbooks/unit-lifecycle.md) — it reads each `units/<slug>/unit.json`. Only extract/publish a project whose Unit is **polished**: the render must have passed the native-video final gate (`ralphy project status <id> --contract` → `polished === true`, #411). A keyframe-only eval does not qualify.

## Two exits: library entities vs workspace bundle

Reusable know-how leaves the repo through TWO distinct doors. Pick the door before running anything:

- **Project → library entities (THIS skill).** The user wants the work **browsable and reproducible per unit** — "publish this to the library", "others should reproduce this style", "extract the blocks". Scope: ONE finished project, factored into Unit + Template/Style/Recipe/Asset blocks. The publishing implementation lives in the sibling `ralphy-web` repository.

## DO NOT FIRE

- **Scaffolding a new project** — that is `ralphy template use <existing-slug>`, not this skill.
- **One-off renders** — that is the producer playbook.
- **Quality evaluation** — that is `/evaluator`.
- **Pushing to the live library** — that is the #056 publish path in `../ralphy-web/scripts/publish-entity.ts`; templater stops at printing the ordered commands. See HARD INVARIANTS below.

This skill is the **full maximal-detail pipeline**: one invocation, followed end-to-end, reproduces what a careful maintainer does by hand. The six stages are **EXTRACT** (read the finished deliverables) → **CLASSIFY** (factor into the five entities, incl. the recipe-vs-tag split) → **BLUEPRINT** (capture a per-unit reproduction payload) → **DE-DUP** (match every candidate against the live library first) → **EMIT** the entity bundle → **PRINT the publish runbook** (the exact ordered `publish-entity.ts` commands).

templater does the extraction, classification, blueprint capture, and de-dup itself. It does **not** invoke the live push (`--push`) — that is the user's deliberate step. It prints the full, ordered command set (dry-run first, then `--push`) and hands control back. Publishing to the live library is owned by the sibling `ralphy-web` repository — see [Publish runbook](#publish-runbook-056).

## The five entities (read this first)

The library model (`../ralphy-web/lib/library-v2/types.ts`) has five entities. Every project decomposes into them:

- **Unit** — a finished deliverable in a Format (`video`, `carousel`, `sticker-pack`, `podcast-cuts`, `fb-creative`, `motion-design`, `poster`, `image`), holding 1..N ordered media items. A Unit = exactly **1 Template + 1 Style + N Recipes + M Assets**. That ingredient list is the Unit's **provenance**.
- **Template** (block, single-per-unit) — the STRUCTURE / skeleton only, style-agnostic. The beat structure, the slide count + slot layout, the composition skeleton.
- **Style** (block, single-per-unit) — the visual look / register. The aesthetic + its anchor reference images.
- **Recipe** (block, multi-per-unit) — a composable effect / treatment. A VFX layer, an encode recipe, an overlay pass, a caption style.
- **Asset** (block, multi-per-unit, has a `sub`: `character` / `location` / `prop` / `music`) — concrete reusable media: a locked character master, a location plate, a prop, a music bed.

The **Unit source of truth is `.ralphy/workspaces/<ws>/projects/<id>/units/*/unit.json`** (formed by `ralphy unit create`, #069). Each `unit.json` already carries `format`, ordered `media`, and a `provenance` block (`template` / `style` / `recipes[]` / `assets[]` slugs) — so much of the decomposition is reading, not inventing. The `postmortem/06-units.md` record (if the project has one) is the second-highest-signal input: it already marks each provenance block NEW vs. REUSED.

## What this skill is NOT

- **Not a project scaffolder.** That is `ralphy template use <slug> --project <new-id>`.
- **Not a postmortem generator.** That is `/postmortem`. Run it first if the source has none — `postmortem/02-lessons.md` (lessons) and `postmortem/06-units.md` (units + provenance) are the highest-signal inputs here.
- **Not the library publisher.** The publish step is the #056 primitive in `../ralphy-web/scripts/publish-entity.ts`. templater produces the classified bundle; the web repository publishes it.
- **Not a single-template extractor.** The old `create-from-project` "one template per project" framing is retired. A project produces a SET of entities (often several units + several blocks), not one template.

## Source-of-truth files in the source project

Every extraction is keyed to a known file. If a file is missing, the skill degrades gracefully (it derives what it can, never invents). **`scenario.json` is PREFERRED, not required** — scenario-less still / HyperFrames projects (sticker packs, FB packs, poster sets) are valid; derive structure from `asset-manifest.json` + `units/` + `index.html` and skip the scene table (the #062 fix).

| Source file in `.ralphy/workspaces/<ws>/projects/<id>/` | Required? | What gets pulled | Maps to entity |
|---|---|---|---|
| `units/*/unit.json` | **REQUIRED** | Finished deliverables + ordered media + provenance block slugs (#069) | **Unit** (+ seeds all four block axes via `provenance`) |
| `asset-manifest.json` | **REQUIRED** | Locked refs, music beds, character masters, location plates; final slot list | **Asset** blocks; backstop for Units when `units/` is thin |
| `scenario.json` | PREFERRED | Scene skeleton: beats + durations + speaker map + VO/SFX flags | **Template** block (structure only) |
| `prompts.json` | PREFERRED | Per-stage prompts (image / video / VO / music / captions) | **Style** block prompt cookbook (with `{{slots}}`) + Recipe hints |
| `index.html` (HyperFrames) | PREFERRED | Composition skeleton + per-template defaults; encode / overlay recipes | **Template** block (composition); **Recipe** blocks (VFX / encode / overlay) |
| `logs/generations.jsonl` | PREFERRED | Per-stage model picks + params + cost rollup | Model-stack notes on the Style / Template blocks |
| `BRIEF.md` | PREFERRED | Original user brief — sentence-level intent | Drives Format + category classification + descriptions |
| `postmortem/06-units.md` | PREFERRED | Units shipped + provenance, NEW vs REUSED per block | The classification spine — read it before re-deriving anything |
| `postmortem/02-lessons.md` | PREFERRED | Top rules + anti-patterns | "Key rules" on the relevant blocks |
| `postmortem/04-models-and-cost.md` | PREFERRED | Spend rollup per stage | Cost ballpark on the blocks |

If `units/` is genuinely empty AND `asset-manifest.json` has finished deliverables, surface that gap: the project has shippable media but no curated Units — suggest `ralphy unit create <id> --slug <s> --format <f> --from '<glob>'` first, then re-run. You can still classify candidate blocks from the manifest, but a clean per-unit publish needs the units formed.

See `references/extraction-rules.md` for the per-file extraction details and edge cases.

## The workflow

1. **Resolve the project + read its Units.** `ralphy unit list <project-id>` and read each `units/<slug>/unit.json`. These are the Units. Read `postmortem/06-units.md` if present — it pre-classifies the provenance blocks (NEW vs REUSED). NEVER fabricate units from the raw `artifacts/` dump.

2. **Read `BRIEF.md` + (if present) `scenario.json` headers** for the elevator pitch. This grounds the classification passes.

3. **Decompose into the five entities.** For each Unit, resolve its provenance into concrete block candidates:
   - **Template** — from `scenario.json` (beats) or, for scenario-less projects, from `index.html` (composition skeleton) / the slide-slot layout. Structure only, style-agnostic.
   - **Style** — from `prompts.json` + the locked anchor refs. The look + its reference images.
   - **Recipe candidates** — VFX layers, encode recipes (`-tune grain`, CRF), overlay passes, caption styles, baked transitions, prompt techniques. From `index.html` + `prompts.json` + bake scripts + postmortem lessons. Each candidate is then split recipe-vs-tag in step 4.
   - **Assets** — locked character masters, location plates, props, music beds from `asset-manifest.json`. Each carries a `sub` (`character`/`location`/`prop`/`music`). Multi-value.

4. **Recipe-vs-tag split (the #082/#083 discipline — read `references/recipe-vs-tag.md`).** For EACH recipe candidate from step 3, decide:
   - **Recipe** (stays a block, earns a detail page) ONLY if you can author a real, copyable **artifact** — an ffmpeg filtergraph, an encode/bake command, a HyperFrames snippet, or a concrete prompt-style technique — **sourced from the project's own files, never invented**: `cli/lib/ffmpeg-recipes.ts` (the canonical builders) for ffmpeg/encode/overlay, the project's `scripts/*.sh` bake scripts + the captured `blueprint.json` `recipes[].command` for bakes, `index.html` for HyperFrames overlays, the gen-log / `prompts/**` for prompt recipes. When kept, author the FULL enriched payload: `recipeKind` (`ffmpeg`/`encode`/`overlay`/`bake`/`hyperframes`/`prompt`) + `body` (markdown how-to) + `artifact` (the real code) + `params` (named knobs) + `demo` (a self-contained runnable `demo.html` for HyperFrames recipes; before/after media for ffmpeg recipes **when real frames exist** — never fabricated).
   - **Tag** (NOT a block, no detail page) if it is a pure textual descriptor with NO extractable artifact (e.g. "rain overlay" / "soft bloom" applied only as a vibe). It becomes a `tags[]` entry on the Unit(s) that used it, carried in `unit.json`.
   - **The failure mode to kill: never publish an EMPTY recipe block** (refs:0, no `body`, no `artifact`). That empty chip is the "tag cloud" anti-pattern. If you cannot author a real artifact, it is a tag.

5. **Match existing blocks FIRST (de-dup before you author).** Before proposing ANY new block — and before authoring a kept recipe's `body`/`artifact` — check whether an existing library block already covers it. Read `../ralphy-web/lib/library-v2/library.json`, and use `ralphy template list` / `ralphy template suggest` for template/style candidates and `ralphy assets list --kind <kind>` for asset candidates. If `postmortem/06-units.md` already marked a block REUSED, trust that. Only propose a **NEW** block for a genuine gap. **Worked cautionary example:** `choose-path-xfade-master` was published as a NEW recipe when the canonical `ffmpeg-xfade-master` already carried that exact artifact — a duplicate that #081/#083 had to delete and repoint. Reuse + cite the existing slug; never publish a second copy. Over-creating duplicate blocks is the failure mode this step prevents.

6. **Classify slots + tags + descriptions (LLM, via `callLLM()`).** Through `cli/lib/providers/llm.ts → callLLM()`:
   - **Slots** — extract `{{slots}}` (brand / product / character names / location keys / target language) from `prompts.json` per `references/slot-detection.md`, so the Style block's prompt cookbook is reusable across subjects.
   - **Format** — confirm each Unit's `format` (it is in `unit.json`; validate it against the eight library formats).
   - **Unit tags** — the descriptors demoted from step 4 land in each Unit's `unit.json` `tags[]` (filter-only labels for the feed's `TAGS` facet).
   - **Category + description** — per `references/category-classifier.md`, for any local `templates/<category>/<slug>/` artifact.
   - **English-only on disk.** ANY captured prose — storyboards, prompts, VO lines, block bodies, tags, descriptions — must land in English. Translate folklore / foreign terms before they touch a file (the swamp lesson: the Russian word *nechist* → "the unclean"). The user can chat in any language; the on-disk artifact is English. This is `docs/developing-ralphy.md`'s hard rule — the publish gate `rg '\p{Cyrillic}'` must come back empty.

7. **Capture each Unit's Blueprint (#080 — local + free).** For EACH Unit, run `ralphy blueprint create <project-id> --unit <slug>`. This is the per-unit reproduction recipe: it reads the (gitignored) project files and writes a self-contained `units/<slug>/blueprint/` payload (`blueprint.json` + copied `index.html` / prompt files / hard-asset files), validated against `BlueprintSchema`. It is **extraction only** — reads local files, makes no network call, costs nothing, and is **append-only** (a re-run on a slug that already has a `blueprint/` writes `blueprint.v2/`, never overwrites). Record the result in the bundle as `units[].blueprint` (status `NEW` if this run created the first `blueprint/`, `REUSED` if a prior capture already existed, with the payload path `units/<slug>/blueprint/`). See `references/extraction-rules.md` → "Blueprint capture (per Unit)".

8. **Emit the entity bundle.** The primary output is a classified bundle: the Units (with resolved provenance, demoted `tags[]`, AND each Unit's captured Blueprint), plus the NEW blocks worth keeping — each recipe carrying its full `recipeKind`/`body`/`artifact`/`params`/`demo`. Mark every block NEW vs REUSED. This bundle is what the publish primitive consumes. Print it as JSON (see [Output](#output)).

9. **(Optional) Write a local `templates/<category>/<slug>/` artifact.** When the user wants a downloadable repo template (the `vibe-reference` / `vibe-style` form), write it under `templates/<category>/<slug>/` so `ralphy template list / show / suggest / use` pick it up. This is ONE optional output, not the skill's reason for being — the entity publish is the #056 primitive. Schema is the one `cli/commands/template.ts` consumes. Never modify the source project.

10. **Print the publish runbook (#056), do NOT push.** Print the exact ordered `publish-entity.ts` commands the user runs — dry-run first, then `--push` — for the NEW blocks (`--block-file`, recipes carrying the enriched fields), the Units (`--unit`, carrying `unit.json.tags`), and each Unit's Blueprint (`--blueprint`). See [Publish runbook](#publish-runbook-056) for the full ordered set + the DB-migration prerequisite. Then stop. The user (or `dev-publish-template`) drives the actual push.

## Output

JSON, pipe-friendly:

```json
{
  "project": "free-air-vpn-stickerpack",
  "units": [
    {
      "slug": "stickers-outline",
      "format": "sticker-pack",
      "media_count": 32,
      "provenance": {
        "template": { "slug": "sticker-set", "status": "REUSED" },
        "style": { "slug": "free-air-jelly-pure", "status": "NEW" },
        "recipes": [{ "slug": "floodfill-diecut-cutout", "status": "NEW" }],
        "assets": [{ "slug": "free-air-mascot", "sub": "character", "status": "NEW" }]
      },
      "tags": ["white die-cut outline", "jelly mascot"],
      "blueprint": {
        "status": "NEW",
        "path": ".ralphy/workspaces/<ws>/projects/free-air-vpn-stickerpack/units/stickers-outline/blueprint",
        "publish_cmd": "cd ../ralphy-web && bun run scripts/publish-entity.ts --blueprint <absolute-blueprint-dir>"
      },
      "publish_cmd": "cd ../ralphy-web && bun run scripts/publish-entity.ts --unit <absolute-unit-dir>"
    }
  ],
  "new_blocks": [
    { "kind": "style", "slug": "free-air-jelly-pure", "blurb": "...", "publish_cmd": "cd ../ralphy-web && bun run scripts/publish-entity.ts --block-file <spec.json>" },
    {
      "kind": "recipe",
      "slug": "floodfill-diecut-cutout",
      "blurb": "...",
      "recipeKind": "ffmpeg",
      "body": "## What it is ...",
      "artifact": "colorkey=0xffffff:0.1:0.0,despill=...",
      "params": { "key": "0xffffff", "similarity": 0.1 },
      "demo": { "kind": "media", "beforeUrl": "...", "afterUrl": "..." }
    },
    { "kind": "asset", "slug": "free-air-mascot", "sub": "character", "blurb": "..." }
  ],
  "reused_blocks": [{ "kind": "template", "slug": "sticker-set" }],
  "demoted_tags": ["white die-cut outline", "jelly mascot"],
  "local_template_artifact": null,
  "scenario_present": false,
  "warnings": []
}
```

## Publish runbook (#056)

templater extracts + classifies + blueprints + de-dups; the **publish to library is the #056 primitive** in `../ralphy-web/scripts/publish-entity.ts`. Print commands in the required order (blocks → units → blueprints), each as a dry-run line then the `--push` line. **templater never runs `--push`** — it prints the runbook and stops; the user (or `dev-publish-template`) runs it from the web repository.

### 0. Web repository prerequisite

Before ANY `--push`, verify that `../ralphy-web` is present, clean, on its expected branch, and has its publishing credentials configured. Dry-runs touch nothing remote, so they are always safe to print/run first.

### 1. NEW blocks first (so unit provenance + tag facets resolve)

Each NEW block is a `--block-file <spec.json>`. A block spec is `{ kind, id, name, blurb, sub?, refs?[] }`; a **recipe** spec ALSO carries the enriched payload `{ recipeKind, body, artifact, params, demo }` (#082) — which pack into the `blocks.recipe_kind` column + the `blocks.data` jsonb. The recipe's `demo` (`demo.html` for HyperFrames, before/after media for ffmpeg) + any `refs` ride along to Storage so the library page is interactive (live recipe demo, audio player for a music asset). Tags are NOT blocks — they carry no `--block-file` line; they ride on the Unit.

```bash
cd ../ralphy-web && bun run scripts/publish-entity.ts --block-file <block-spec.json>           # dry-run (per NEW block)
cd ../ralphy-web && bun run scripts/publish-entity.ts --block-file <block-spec.json> --push     # push
```

### 2. Units next (carrying unit.json.tags + provenance links)

```bash
cd ../ralphy-web && bun run scripts/publish-entity.ts --unit <absolute-unit-dir>          # dry-run (per Unit)
cd ../ralphy-web && bun run scripts/publish-entity.ts --unit <absolute-unit-dir> --push    # push
```

The unit's media uploads to the configured CDN and the committed library entry receives its provenance and tags. A missing provenance block is warned and skipped, never fabricated — which is why blocks publish FIRST.

### 3. Blueprints last (the per-unit reproduction payload, one per Unit)

```bash
cd ../ralphy-web && bun run scripts/publish-entity.ts --blueprint <absolute-blueprint-dir>          # dry-run (per Unit)
cd ../ralphy-web && bun run scripts/publish-entity.ts --blueprint <absolute-blueprint-dir> --push    # push
```

The `--blueprint` dir is the `units/<slug>/blueprint/` payload step 7 captured (`blueprint.json` + copied `index.html` / prompts / hard assets). It uploads the payload to Storage under `blueprints/<unitId>/`, upserts the 1:1 `blueprints` row, and appends to `PUBLISHED_BLUEPRINTS`.

Every mode updates the committed library data and uploads media through the web repository's configured storage path (idempotent by id / unitId, append-only). Default run is DRY-RUN. The maintainer one-shot that runs the whole runbook for you is `dev-publish-template` (#056).

## Edge cases & refusals

- **No `units/` AND no finished deliverables in `asset-manifest.json`** → the project isn't done. Refuse, point at what's missing (run /producer or finish the pipeline).
- **No `units/` but finished media exists** → DO NOT refuse. Surface the gap, suggest `ralphy unit create`, classify candidate blocks from the manifest anyway. (This is the #062 fix in spirit — never hard-block scenario-less / unit-thin projects.)
- **No `scenario.json`** → DO NOT refuse (the #062 fix). Derive the Template block's structure from `index.html` / slide layout, skip the scene table.
- **No `postmortem/`** → proceed but warn. Block classification leans harder on `prompts.json` + `asset-manifest.json`; offer to `/postmortem` (now a 7-file set incl. `06-units.md`) first for a cleaner NEW/REUSED split.
- **A block looks like an existing one** → match it, mark REUSED, do NOT create a duplicate. When genuinely unsure, prefer REUSED and flag the uncertainty in `warnings`. (The `choose-path-xfade-master` == `ffmpeg-xfade-master` dup is the canonical cautionary case — see `references/recipe-vs-tag.md`.)
- **A recipe candidate has no extractable artifact** → it is a TAG, not a block. Demote it to the Unit's `tags[]`; never publish an empty `refs:0` recipe block. See `references/recipe-vs-tag.md`.
- **Captured prose contains non-English** (folklore, foreign brand copy, RU/other-script VO) → translate before writing it to any file. English-only on disk; the `rg '\p{Cyrillic}'` gate must come back empty.
- **Slug collision in `templates/`** (only if writing the optional local artifact) → refuse unless `--force`, show the diff first.

## Why this skill exists

A finished project's postmortem captures the expensive lessons; `units/*/unit.json` captures the finished deliverables and their provenance. Without templater, those sit unindexed — the next agent re-derives the structure, the look, the effects from scratch. templater is the **compression + classification layer**: it factors the project into the five reusable entities and matches them against the library so the next project starts at the library's wisdom level. The publish primitive (#056) then makes those entities discoverable. This skill is the bridge between "we shipped deliverables" and "we shipped reusable blocks."

## References

- `references/recipe-vs-tag.md` — the #082/#083 split: the decision rule, the enriched-recipe payload to author, where to source artifacts, the de-dup cautionary example.
- `references/extraction-rules.md` — per-source-file extraction details + edge cases.
- `references/slot-detection.md` — LLM prompt + heuristics for `{{slots}}` in prompts.json.
- `references/kind-decision.md` — vibe-reference vs vibe-style decision tree (for the optional local artifact).
- `references/category-classifier.md` — the five segment-persona categories + LLM classification prompt.
- `references/pool-migration.md` — heavy-asset migration to `ralphy-assets/pool/` (for Asset blocks / the local artifact).
- `cli/lib/schemas/unit.ts` — the `unit.json` Zod schema (the Unit source of truth, #069).
- `cli/commands/blueprint.ts` — the `ralphy blueprint create|show|list|use` surface (#076/#079); templater runs `blueprint create` per Unit in step 7.
- `cli/lib/schemas/blueprint.ts` — the `BlueprintSchema` Zod shape (#074): the six reproduction axes a captured Blueprint carries.
- `cli/lib/ffmpeg-recipes.ts` — the canonical ffmpeg/encode/overlay builders (`buildVhsFilter`, `buildColorGradeFilter`, `buildSidechainFilter`, `buildMixMusicFilter`, CRF helpers); the source-of-truth for a kept recipe's `artifact`.
- `../ralphy-web/lib/library-v2/types.ts` — the five-entity shapes (Format / Unit / Block kinds), the enriched-Recipe fields (#082: `recipeKind`/`body`/`artifact`/`params`/`demo`), and `Unit.tags`.
- `supabase/migrations/0001_init_library_v2.sql` — the schema (the `blueprints` table + `blocks.recipe_kind` / `blocks.data` / `units.tags` columns) that must exist before any `--push`.
- `../ralphy-web/scripts/publish-entity.ts` — the publish primitive (#056); templater hands off to it.
- `docs/skills-vs-templates.md` — templater = extract/classify; #056 = the web library writer.
- `.agents/skills/dev-publish-template/SKILL.md` — the maintainer one-shot that runs the publish for you.
