---
name: dev-publish-template
namespace: maintainer
description: >-
  Turn the active finished project into a published, library-discoverable template in one shot — infer its media `format` (video/image/carousel/fb-creative/motion-design/poster/sticker-pack), confirm format + slug + category with the user, run `ralphy template extract`, fill the generated `template.yaml` (tags, model stack, cost rollup + lessons from the project's `postmortem/`), seed a forward-compatible showcase entry from the render (issue 055), migrate heavy locked refs to `ralphy-assets/pool/`, then commit + push to `origin` main and report the live `/library` URL. Models the 3-channel discipline of `dev-release` but ships a template instead of a binary.
  USE WHEN the user types `/dev-publish-template`, says "publish this as a template", "ship this project to the library", "extract and publish a template", "make this a public template", or after a successful render + postmortem they want others to be able to reproduce and remix.
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS. This is a MAINTAINER skill — it commits to the public repo. For the human how-to walkthrough without the publish step, see the `templater` skill.
---

# dev-publish-template — one-shot extract + publish to the library

This is a **maintainer** skill. It commits + pushes a template to the public `origin` repo, exactly like `dev-release` commits + pushes a binary. The job: from the **active project context**, turn `workspace/projects/<id>/` into a published template under `templates/<category>/<slug>/`, discoverable at `/library`, with one user confirmation and one push.

The mechanical extraction is owned by the `ralphy template extract` verb (issue 033) + the `templater` skill (the human how-to). This skill is the `dev-release`-style automation layer on top: it infers the media format, confirms slug/category/format with the user, runs extract, enriches the manifest, seeds a showcase entry, migrates heavy assets, and ships it.

## Relationship to neighboring skills

- **`templater`** (`namespace: user`) — the manual walkthrough of extracting a project into a template. Read it for the per-source-file extraction details. `dev-publish-template` reuses that knowledge but adds the format-inference + confirm + commit-and-push automation.
- **`dev-release`** (`namespace: maintainer`) — the model for this skill's rigor: a one-shot publish across a public surface with explicit pre-push confirmation and HARD INVARIANTS. Match its structure.
- This skill **never** ships the CLI binary, touches `npm/` / brew, or cuts a version tag. That is `dev-release`. This skill ships content (a template) only.

## Trigger

Hard triggers (do it):
- User types `/dev-publish-template`.
- "publish this as a template" / "ship this project to the library" / "make this a public template".
- "extract and publish a template from `<project-id>`".

Proactive triggers (offer it, don't auto-execute):
- A render just shipped, the user rated it 8+/10, and a `postmortem/` exists — the experience is most reusable while fresh.
- The user finished `/postmortem` and says the workflow is worth keeping for others.

## ALSO FIRE

- After `templater` would have fired but the user explicitly wants it **published** (committed + pushed), not just written to the working tree.
- When the user names a finished project id and says "library" / "publish" / "share so others can remix".

## DO NOT FIRE

- **Project not finished.** No `scenario.json` / no `asset-manifest.json` / no final render → refuse with the same concrete ask the `templater` skill uses: "Run `/producer` to finish the pipeline (or `/postmortem` first), then point me at the project id." Templates crystallize finished experience; a half-done project inherits the gaps.
- **Scaffolding a new project** — that is `ralphy template use <existing-slug>`.
- **Write-only, no publish** — if the user wants the template in the working tree for review but NOT committed/pushed, hand back to the `templater` skill.
- **Binary / CLI release** — that is `dev-release`.
- **The user said "don't push" / "let's review first"** earlier in the session — produce the template + showcase locally and stop before the commit step.

## HARD INVARIANTS

1. **Confirm before extract AND before push.** Never run `ralphy template extract` until the user has confirmed the inferred `format` + `slug` + `category`. Never `git push` until the user has confirmed the file list. Two gates, both explicit ("yes" / "go").
2. **Append-only (AGENTS.md #14).** Re-running on the same project **versions the showcase, never clobbers the template.** If `templates/<category>/<slug>/` already exists, do NOT pass `--force` unless the user explicitly asked for a destructive overwrite — instead append a new showcase entry (a new `output-NN` row) and report that the recipe is unchanged. The source project is NEVER modified by extraction (the verb guarantees this).
3. **Idempotent.** A second run with the same project + slug must not create a duplicate template, must not double-commit an unchanged tree, and must only add a new showcase row if the render actually changed. If `git status` shows no diff after the enrichment step, report "already published, nothing to ship" and stop.
4. **English-only on disk.** Every file you write or edit — `template.yaml`, `README.md`, showcase manifest, commit message — lands in English. Before committing, run the Cyrillic gate and treat empty output as the pass:
   ```bash
   rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' templates/<category>/<slug>/
   ```
   Non-empty → fix before committing. (Repo-wide rule per `docs/developing-ralphy.md`.)
5. **`ralphy` is the only extraction entrypoint.** Never hand-copy files into `templates/`, never `curl` a provider, never write the template dir by hand. The verb writes the manifest the loader expects; manual writes drift from the schema and break `ralphy template list / show / suggest / use`.
6. **Push to `origin` only.** Per repo memory: `origin` is GitHub `alecs5am/ralphy`. NEVER push to `gitlab`. This repo commits directly to `main` (no feature branch) per the user's standing override.

## Source-of-truth files (read before extracting)

These live in `workspace/projects/<project-id>/`. The extract verb consumes them; you read them to infer the format and enrich the manifest afterward.

| File | What it tells you |
|---|---|
| `scenario.json` (**required**) | Scene skeleton, durations, speaker map. Extract refuses without it (`E_FILE_UNREADABLE`). |
| `asset-manifest.json` (**required** for a real template) | Locked refs, masters, music beds → which heavy assets to lift to the pool. |
| `index.html` | Present → HyperFrames composition → likely `video` or `motion-design` format. Absent → still-image formats. |
| `prompts/` | Per-scene prompt files; copied verbatim by extract. |
| `logs/generations.jsonl` | The real model stack + per-call cost → fills `model-stack` notes + cost rollup. |
| `render/` | The final mp4 / png → the showcase entry's source artifact. |
| `postmortem/02-lessons.md`, `postmortem/04-models-and-cost.md` | Lessons + spend rollup → `README.md` "Lessons learned" + cost ballpark. |
| `BRIEF.md` | The original brief → drafts the description + tags. |

If `postmortem/` is missing, proceed but warn: the README will lack the lessons/cost sections (extract stubs them as TODO). Offer to pause for `/postmortem` first.

## Step 1 — Validate the active project

Confirm the project id from the active context. Verify the required artifacts exist:

```bash
PROJ=<project-id>
ls workspace/projects/$PROJ/scenario.json \
   workspace/projects/$PROJ/asset-manifest.json \
   workspace/projects/$PROJ/render/ 2>&1
```

Missing any of these → **refuse** with the DO-NOT-FIRE ask. Do not improvise content for a half-finished project.

## Step 2 — Infer the media `format` + general-vs-style placement

The `--format` flag (issue 052) is the primary axis. Infer it from the project, then **confirm with the user** — never guess silently.

| Signal in the project | Inferred `format` |
|---|---|
| `index.html` + `render/*.mp4` from generated i2v/t2v footage | `video` |
| `index.html` that is code/animation-driven (kinetic type, geometric splits, no camera footage) | `motion-design` |
| Single still `render/*.png` as the deliverable, no video | `image` |
| Single high-impact key-art still (drop poster / flyer / album-cover) | `poster` |
| Multiple stills as one swipeable post | `carousel` |
| Numbered stills tuned for the ads manager + `ads-copy.md` | `fb-creative` |
| A set of die-cut sticker images sharing one mascot | `sticker-pack` |

For **general vs style placement** (issue 052): a project that froze one concrete aesthetic / one reproducible video is a **style** template — after extraction, set `style_of: <parent-general-slug>` in `template.yaml` if a general baseline for that format already exists (check `ralphy template list --format <f>`). A project that is the format's baseline how-to is **general** (leave `style_of` unset). Extraction always produces a `kind` of `vibe-style` by default; pass `--kind vibe-reference` when the project ships a full HyperFrames composition worth reproducing wholesale.

**Confirm with the user** in one line before extracting:

> *"Inferring format=`video`, category=`creator-lifestyle`, slug=`tokyo-y2k-night-run`, kind=`vibe-reference`, style_of=(none/general). Extract with these?"*

Wait for explicit confirmation. The user's `--category` / `--slug` / `--format` override always wins.

## Step 3 — Run the extraction

Use the **real** `ralphy template extract` flags (verified from the verb):

```bash
ralphy template extract $PROJ \
  --format <video|image|carousel|fb-creative|motion-design|poster|sticker-pack> \
  --category <b2b-saas|dtc-commerce|creator-lifestyle|entertainment-viral|cinematic-narrative> \
  --slug <kebab-slug> \
  --kind <vibe-style|vibe-reference> \
  --name "<Human Readable Name>" \
  --description "<one-line description>" \
  --tags <comma,separated,tags>
```

Heavy-asset migration (step 6) is a **separate flag on the same verb** — do not add it yet; default behavior COPIES refs in place (per AGENTS.md #14). The full verified flag set:

- `--category <c>` (required) — `b2b-saas|dtc-commerce|creator-lifestyle|entertainment-viral|cinematic-narrative`.
- `--slug <s>` (required) — kebab-case; rejected if it embeds a banned creator/brand token (`DENIED_SLUG_TOKENS`).
- `--kind <k>` — `vibe-reference|vibe-style` (default `vibe-style`).
- `--format <f>` — `video|image|carousel|fb-creative|motion-design|poster|sticker-pack` (default `video`).
- `--name <n>` — human-readable name (defaults from slug).
- `--description <d>` — one-line description (defaults to an extracted-template stub).
- `--tags <list>` — comma-separated tags (default empty).
- `--lift-heavy` — MOVE refs >1MB into `ralphy-assets/pool/<slug>/` (default COPIES everything in place). Used in step 6.
- `--assets-repo <path>` — path to the ralphy-assets checkout; **required when `--lift-heavy` is set**.
- `--force` — overwrite the target template dir if it already exists. **Only with explicit user consent** (invariant #2).

The verb writes `templates/<category>/<slug>/`: `template.json` (loader manifest), `scenario-template.json` (slot-substituted scenario), `TEMPLATE.md`, `README.md` (drafted from POSTMORTEM lessons), `prompts/`, `refs/`, `sample-remix.md`, and `composition-variables.json` when the project is a HyperFrames composition.

> Note: the verb writes a `template.json` manifest. The typed `template.yaml` (issue 052) carries `format` + `style_of` for the format-aware surfaces (`list --format`, `suggest --format`). If extraction wrote `format`/`style_of` only into `template.json`, mirror them into a `template.yaml` conforming to `cli/lib/schemas/template.ts` so `ralphy template list --format <f>` finds the new slug — verify with the gate in step 7.

## Step 4 — Enrich the manifest

Open the generated `template.yaml` (or `template.json`) and fill what extraction could only stub:

- **`tags`** — synthesize 10–20 from the scenario + brief + cookbook so `ralphy template suggest` ranks the slug for its own brief.
- **Model stack** — read `logs/generations.jsonl` for the real per-stage model picks and params; record them in the template's `model-stack` notes (which model for which stage, what to avoid). Read `MODELS.md` to confirm ids are current.
- **Cost rollup** — sum per-stage spend from `generations.jsonl` (or lift `postmortem/04-models-and-cost.md`); set `estimated_cost_usd` + a "Cost ballpark" line in `README.md`.
- **Lessons** — if `postmortem/02-lessons.md` exists, the README already carries them; distil the top 5–7 into a "Key rules" section. If not, leave the TODO stub and warn the user.

## Step 5 — Seed a showcase entry (issue 055)

Issue 055 (the per-template results gallery) **has not finalized its schema** — its spec says outputs are "stored alongside the template (e.g. `showcase/` manifest) and/or pulled from `ralphy-assets`", and to "seed galleries from the templates extracted in 058". Do NOT invent a conflicting schema. Write a **minimal, forward-compatible** manifest and let 055 migrate it:

Create `templates/<category>/<slug>/showcase/showcase.json` with an append-only `outputs` array. One entry per published render:

```json
{
  "version": 1,
  "slug": "<slug>",
  "outputs": [
    {
      "id": "output-01",
      "source_project": "<project-id>",
      "media": "render/<final>.mp4",
      "format": "<video|image|...>",
      "caption": "<one-line, optional>",
      "created": "<YYYY-MM-DD>"
    }
  ]
}
```

Rules:
- Keep fields minimal (`id`, `source_project`, `media`, `format`, `caption`, `created`). These are the lowest common denominator of what 055 will consume; richer fields (thumbnail, dimensions) are 055's to add.
- **Append-only.** Re-running on the same project adds `output-02`, `output-03`, … — it never rewrites an existing entry (invariant #2).
- The render file itself is heavy → it migrates to `ralphy-assets` in step 6 (showcase media coordinates with the 059 split, per 055's notes). For now, reference the in-repo render path or the pool path if lifted; 055 will repoint.
- **Flag the dependency in your report:** state plainly that the showcase schema is provisional pending issue 055, and that 055 may repoint `media` to a `ralphy-assets` location.

## Step 6 — Migrate heavy locked refs to the pool

Mirror the `templater` skill's guidance. For locked refs / masters / music beds the template should re-use across remixes, lift them out of the repo into the companion pool (keeps the repo light, makes the asset reusable):

```bash
ralphy template extract $PROJ \
  --format <f> --category <c> --slug <s> \
  --lift-heavy \
  --assets-repo /Users/maximovchinnikov/github/ralphy-assets \
  --force   # only if re-extracting an existing slug with explicit consent
```

`--lift-heavy` MOVES refs ≥1MB to `ralphy-assets/pool/<slug>/`; the template references them remotely. If you already extracted in step 3 without `--lift-heavy`, lifting requires re-running with `--force` (gated on user consent per invariant #2) OR manually moving only the heavy refs and updating `template.json:assets` to `{ remote: true, manifestKey, required }`. After any pool change, regenerate the catalog: `ralphy assets catalog --write`. If total heavy assets exceed ~50MB, confirm with the user first (GitHub raw limit is 100MB).

## Step 7 — Verify before committing

Run the discovery + lint gates and assert their output:

```bash
ralphy template list --format <f>          # new slug must appear, source=repo
ralphy template show <slug>                # TEMPLATE.md parses, no broken frontmatter
ralphy template suggest "<original brief>" # new slug ranks top-3, score ≥ 0.5
bun run lint:templates                     # template.yaml schema + slug validity → green
bun run lint:skills                        # this skill (+ all) → green
rg '\p{Cyrillic}' --pcre2 --hidden -g '!.git' templates/<category>/<slug>/   # empty = pass
```

If `suggest` ranks the slug below 0.5, the tags/description are too generic — fix step 4 before shipping. If lint or the Cyrillic gate fails, fix before committing. (Note: do not rely on husky hooks — they have a known flaky test; run these manually.)

## Step 8 — Commit + push (the `dev-release` discipline)

Two repos may change: `ugc-cli` (the template dir) and, if you lifted heavy assets, `ralphy-assets` (the pool + manifest).

**Show the user the exact file list and wait for explicit confirmation before any `git` mutation** (invariant #1). Then, in `ugc-cli`:

```bash
git add templates/<category>/<slug>/
git commit -m "feat(templates): publish <slug> (<format>) from <project-id>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin main
```

If heavy assets were lifted, commit + push the companion repo too (its own `git add pool/<slug>/ manifest.json` → commit → `git push origin main`), and regenerate `docs/assets-catalog.md` in `ugc-cli` in the same template commit.

Commit directly to `main` (the user's standing override for this repo); push to `origin` only — NEVER `gitlab` (repo memory: gitlab is an unrelated project).

## Outputs

On success, report a single summary with the live `/library` URL:

```
Published <slug> (<format>, <category>):
  • template  → templates/<category>/<slug>/        (committed + pushed to origin/main)
  • library   → https://ralphy.dev/library/<slug>
  • showcase  → 1 output seeded (provisional schema, pending issue 055)
  • suggest   → ranks #1 for the original brief (score 0.NN)
```

If nothing changed (idempotent re-run), report "already published, nothing to ship" and stop.

## Cookbook

**Publish a finished video project:**
> "Publish this as a template" → infer `format=video`, confirm slug/category, `ralphy template extract <id> --format video --category creator-lifestyle --slug <slug>`, enrich, seed showcase, push, report `/library` URL.

**Publish a poster project:**
> A single key-art still in `render/` → infer `format=poster`, `--format poster`, no composition-variables sidecar, showcase media is the png.

**Re-run on an already-published project (idempotent):**
> Template dir exists, no recipe change → append `output-02` to the showcase, commit only the showcase delta (or nothing if the render is unchanged), never `--force`.

**Refusal — half-finished project:**
> No `asset-manifest.json` → "This project isn't finished — run `/producer` to complete the pipeline (and `/postmortem` for lessons), then I can publish it."
