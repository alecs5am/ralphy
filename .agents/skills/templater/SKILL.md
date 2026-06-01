---
name: templater
namespace: user
description: >-
  Decompose a finished `workspace/projects/<id>/` into the content-entity model (#063): read its `units/*/unit.json` (#069) as the Unit source of truth, then factor the project into ALL FIVE entities — Unit + the four typed blocks Template (structure), Style (look), Recipe (effect/treatment), Asset (concrete reusable media). Match each candidate block against existing library blocks FIRST; only propose a NEW block for a genuine gap. The output is an EXTRACT + CLASSIFY pass: a structured entity bundle (units + their provenance + the new blocks worth keeping), optionally a local `templates/<category>/<slug>/` artifact. The actual push to the library is handed to the #056 publish path (`landing/scripts/publish-entity.ts`), NOT done here.

  USE WHEN the user says any of: "save this as a template", "turn the project into a template", "templatify <project-id>", "extract a template from <project>", "decompose this project into blocks", "what units/blocks did this project produce", "I want others to reproduce this", "make a reusable version of <project>", "extract the entities from <project>", "classify this project", "freeze this project". ALSO FIRE proactively after a successful render + postmortem the user rates 8+/10 — the experience is most reusable while still fresh.

  DO NOT FIRE for: scaffolding a new project (that is `ralphy template use <existing-slug>`), one-off renders (producer), quality evaluation (evaluator), or pushing to the live Supabase library (that is the #056 publish path / `publish-entity.ts`). See body for HARD INVARIANTS.
---

# templater

You decompose a finished project into the **content-entity model** (#063) and classify its pieces into reusable blocks. The contract is: **a future agent should be able to reproduce the work — same units, same blocks (Template / Style / Recipe / Asset) — without re-deriving any of it from the raw `assets/` dump.**

This skill does two jobs and exactly two: **EXTRACT** (read the project's finished deliverables) and **CLASSIFY** (factor them into the five entities, matching existing blocks first). It does **not** publish. Publishing to the live library (Supabase DB + Storage + the committed `published.ts`) is a separate primitive — see [Hand-off to publish](#hand-off-to-publish-056).

## The five entities (read this first)

The library model (`landing/lib/library-v2/types.ts`) has five entities. Every project decomposes into them:

- **Unit** — a finished deliverable in a Format (`video`, `carousel`, `sticker-pack`, `podcast-cuts`, `fb-creative`, `motion-design`, `poster`, `image`), holding 1..N ordered media items. A Unit = exactly **1 Template + 1 Style + N Recipes + M Assets**. That ingredient list is the Unit's **provenance**.
- **Template** (block, single-per-unit) — the STRUCTURE / skeleton only, style-agnostic. The beat structure, the slide count + slot layout, the composition skeleton.
- **Style** (block, single-per-unit) — the visual look / register. The aesthetic + its anchor reference images.
- **Recipe** (block, multi-per-unit) — a composable effect / treatment. A VFX layer, an encode recipe, an overlay pass, a caption style.
- **Asset** (block, multi-per-unit, has a `sub`: `character` / `location` / `prop` / `music`) — concrete reusable media: a locked character master, a location plate, a prop, a music bed.

The **Unit source of truth is `workspace/projects/<id>/units/*/unit.json`** (formed by `ralphy unit create`, #069). Each `unit.json` already carries `format`, ordered `media`, and a `provenance` block (`template` / `style` / `recipes[]` / `assets[]` slugs) — so much of the decomposition is reading, not inventing. The `postmortem/06-units.md` record (if the project has one) is the second-highest-signal input: it already marks each provenance block NEW vs. REUSED.

## What this skill is NOT

- **Not a project scaffolder.** That is `ralphy template use <slug> --project <new-id>`.
- **Not a postmortem generator.** That is `/postmortem`. Run it first if the source has none — `postmortem/02-lessons.md` (lessons) and `postmortem/06-units.md` (units + provenance) are the highest-signal inputs here.
- **Not the library publisher.** It does NOT push to Supabase, does NOT edit `landing/lib/library-v2/published.ts`, does NOT run `seed-supabase.ts`. The publish step is the #056 primitive `landing/scripts/publish-entity.ts` (`--unit` / `--block` modes). templater produces the classified bundle; publish pushes it.
- **Not a single-template extractor.** The old `create-from-project` "one template per project" framing is retired. A project produces a SET of entities (often several units + several blocks), not one template.

## Source-of-truth files in the source project

Every extraction is keyed to a known file. If a file is missing, the skill degrades gracefully (it derives what it can, never invents). **`scenario.json` is PREFERRED, not required** — scenario-less still / HyperFrames projects (sticker packs, FB packs, poster sets) are valid; derive structure from `asset-manifest.json` + `units/` + `index.html` and skip the scene table (the #062 fix).

| Source file in `workspace/projects/<id>/` | Required? | What gets pulled | Maps to entity |
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

1. **Resolve the project + read its Units.** `ralphy unit list <project-id>` and read each `units/<slug>/unit.json`. These are the Units. Read `postmortem/06-units.md` if present — it pre-classifies the provenance blocks (NEW vs REUSED). NEVER fabricate units from the raw `assets/` dump.

2. **Read `BRIEF.md` + (if present) `scenario.json` headers** for the elevator pitch. This grounds the classification passes.

3. **Decompose into the five entities.** For each Unit, resolve its provenance into concrete block candidates:
   - **Template** — from `scenario.json` (beats) or, for scenario-less projects, from `index.html` (composition skeleton) / the slide-slot layout. Structure only, style-agnostic.
   - **Style** — from `prompts.json` + the locked anchor refs. The look + its reference images.
   - **Recipes** — VFX layers, encode recipes (`-tune grain`, CRF), overlay passes, caption styles. From `index.html` + `prompts.json` + postmortem lessons. Multi-value.
   - **Assets** — locked character masters, location plates, props, music beds from `asset-manifest.json`. Each carries a `sub` (`character`/`location`/`prop`/`music`). Multi-value.

4. **Match existing blocks FIRST.** Before proposing any NEW block, check whether an existing library block already covers it. Use `ralphy template list` / `ralphy template suggest` for template/style candidates and `ralphy assets list --kind <kind>` for asset candidates. If `postmortem/06-units.md` already marked a block REUSED, trust that. Only propose a **NEW** block for a genuine gap — a structure / look / effect / asset the library does not yet have. Over-creating duplicate blocks is the failure mode this step prevents.

5. **Classify slots + tags (LLM, via `callLLM()`).** Through `cli/lib/providers/llm.ts → callLLM()`:
   - **Slots** — extract `{{slots}}` (brand / product / character names / location keys / target language) from `prompts.json` per `references/slot-detection.md`, so the Style block's prompt cookbook is reusable across subjects.
   - **Format** — confirm each Unit's `format` (it is in `unit.json`; validate it against the eight library formats).
   - **Category + tags + description** — per `references/category-classifier.md`, for any local `templates/<category>/<slug>/` artifact.

6. **Emit the entity bundle.** The primary output is a classified bundle: the Units with resolved provenance, plus the NEW blocks worth keeping (each with kind, slug, blurb, the slots/refs/lessons that define it). Mark every block NEW vs REUSED. This bundle is what the publish primitive consumes. Print it as JSON (see [Output](#output)).

7. **(Optional) Write a local `templates/<category>/<slug>/` artifact.** When the user wants a downloadable repo template (the `vibe-reference` / `vibe-style` form), write it under `templates/<category>/<slug>/` so `ralphy template list / show / suggest / use` pick it up. This is ONE optional output, not the skill's reason for being — the entity publish is the #056 primitive. Schema is the one `cli/commands/template.ts` consumes. Never modify the source project.

8. **Hand off to publish (#056).** Do NOT push to the library here. Print the exact `publish-entity.ts` commands the user can run (see below) and stop. The user (or a maintainer skill) drives the actual push.

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
      "publish_cmd": "cd landing && bun run scripts/publish-entity.ts --unit workspace/projects/free-air-vpn-stickerpack/units/stickers-outline"
    }
  ],
  "new_blocks": [
    { "kind": "style", "slug": "free-air-jelly-pure", "blurb": "...", "publish_cmd": "cd landing && bun run scripts/publish-entity.ts --block-file <spec.json>" },
    { "kind": "recipe", "slug": "floodfill-diecut-cutout", "blurb": "..." },
    { "kind": "asset", "slug": "free-air-mascot", "sub": "character", "blurb": "..." }
  ],
  "reused_blocks": [{ "kind": "template", "slug": "sticker-set" }],
  "local_template_artifact": null,
  "scenario_present": false,
  "warnings": []
}
```

## Hand-off to publish (#056)

templater extracts + classifies; the **publish to library is the #056 primitive**, `landing/scripts/publish-entity.ts`. It has two independent modes (both first-class — a Unit and a standalone Block publish on their own):

```bash
# Publish a finished Unit (its media -> Storage, units row + provenance rows, append to published.ts):
cd landing && bun run scripts/publish-entity.ts --unit workspace/projects/<id>/units/<slug>          # dry-run
cd landing && bun run scripts/publish-entity.ts --unit workspace/projects/<id>/units/<slug> --push    # actually push

# Publish a standalone Block (a Style / Recipe / Asset can be pushed without a Unit):
cd landing && bun run scripts/publish-entity.ts --block-file <block-spec.json>          # dry-run
cd landing && bun run scripts/publish-entity.ts --block-file <block-spec.json> --push    # actually push
```

A `--block` spec is `{ kind, id, name, blurb, sub?, refs?[] }`. The script writes to Supabase (DB + Storage) AND appends to the committed open-source `landing/lib/library-v2/published.ts` (idempotent by id, append-only). Default run is DRY-RUN. **templater never invokes `--push`** — it prints the commands and hands control back. The maintainer one-shot that runs them is `dev-publish-template` (#056).

## Edge cases & refusals

- **No `units/` AND no finished deliverables in `asset-manifest.json`** → the project isn't done. Refuse, point at what's missing (run /producer or finish the pipeline).
- **No `units/` but finished media exists** → DO NOT refuse. Surface the gap, suggest `ralphy unit create`, classify candidate blocks from the manifest anyway. (This is the #062 fix in spirit — never hard-block scenario-less / unit-thin projects.)
- **No `scenario.json`** → DO NOT refuse (the #062 fix). Derive the Template block's structure from `index.html` / slide layout, skip the scene table.
- **No `postmortem/`** → proceed but warn. Block classification leans harder on `prompts.json` + `asset-manifest.json`; offer to `/postmortem` (now a 7-file set incl. `06-units.md`) first for a cleaner NEW/REUSED split.
- **A block looks like an existing one** → match it, mark REUSED, do NOT create a duplicate. When genuinely unsure, prefer REUSED and flag the uncertainty in `warnings`.
- **Slug collision in `templates/`** (only if writing the optional local artifact) → refuse unless `--force`, show the diff first.

## Why this skill exists

A finished project's postmortem captures the expensive lessons; `units/*/unit.json` captures the finished deliverables and their provenance. Without templater, those sit unindexed — the next agent re-derives the structure, the look, the effects from scratch. templater is the **compression + classification layer**: it factors the project into the five reusable entities and matches them against the library so the next project starts at the library's wisdom level. The publish primitive (#056) then makes those entities discoverable. This skill is the bridge between "we shipped deliverables" and "we shipped reusable blocks."

## References

- `references/extraction-rules.md` — per-source-file extraction details + edge cases.
- `references/slot-detection.md` — LLM prompt + heuristics for `{{slots}}` in prompts.json.
- `references/kind-decision.md` — vibe-reference vs vibe-style decision tree (for the optional local artifact).
- `references/category-classifier.md` — the five segment-persona categories + LLM classification prompt.
- `references/pool-migration.md` — heavy-asset migration to `ralphy-assets/pool/` (for Asset blocks / the local artifact).
- `cli/lib/schemas/unit.ts` — the `unit.json` Zod schema (the Unit source of truth, #069).
- `landing/lib/library-v2/types.ts` — the five-entity shapes (Format / Unit / Block kinds).
- `landing/scripts/publish-entity.ts` — the publish primitive (#056); templater hands off to it.
- `docs/skills-vs-templates.md` — templater = extract/classify; #056 = the Supabase→library writer.
- `.agents/skills/dev-publish-template/SKILL.md` — the maintainer one-shot that runs the publish for you.
