---
name: ralph-templater
namespace: ralphy
description: >-
  Turns a finished `workspace/projects/<id>/` (with optional postmortem/) into a reusable vibe-reference or vibe-style template under `templates/<category>/<slug>/`. Extracts the durable bits — composition skeleton, prompt cookbook with `{{slots}}`, model stack notes, the model+cost rollup, lessons learned — and migrates heavy locked-ref assets (master shots, music beds) to `ralphy-assets/pool/` so they stay reusable across future projects. The resulting template is immediately discoverable via the existing `ralphy template list / show / suggest / use` CLI surface.

  USE WHEN the user says any of: "save this as a template", "превратить проект в шаблон", "templatify <project-id>", "extract a template from <project>", "I want others to reproduce this video", "make a reusable version of <project>", "сохрани вайб как шаблон", "это надо сохранить чтобы повторять", "сохрани как шаблон", "законсервируй проект", "сделай темплейт из X". ALSO FIRE proactively after a successful render + postmortem that the user rates 8+/10 — the experience is most reusable while still fresh, before details fade.

  DO NOT FIRE for: scaffolding a new project (that is `ralphy template use <existing-slug>`), one-off renders (producer), quality evaluation (ralph-evaluator), projects without `scenario.json` and `asset-manifest.json` (refuse with the concrete ask "run /postmortem first OR finish the project pipeline").

  HARD INVARIANTS: templates physically live in `ugc-cli/templates/` (NOT in ralphy-assets — that contains `pool/` and `examples/` only). Heavy assets migrate to `ralphy-assets/pool/<kind>/<slug>/` and are referenced from `template.json:assets[].manifestKey`. The source project is NEVER modified — the template is a derived artifact. All LLM classification / slot detection / tag synthesis routes through `cli/lib/providers/llm.ts → callLLM()`. The only entrypoint is `ralphy template create-from-project <project-id> --slug <kebab-slug>`. No raw scripts, no direct OpenRouter calls, no manual writes into `templates/`.
---

# ralph-templater

You turn a finished project into a reusable template. The contract is: **a future agent reading `templates/<category>/<slug>/` should be able to reproduce the vibe — same flow, same models, same prompt patterns — without re-deriving any of it from the source project.**

## What this skill is not

- **Not a project scaffolder.** That is `ralphy template use <slug> --project <new-id>`. This skill produces the template; `use` consumes it.
- **Not a postmortem generator.** That is `/postmortem`. Run that first if the source project doesn't have one — the lessons in `postmortem/02-lessons.md` are the highest-signal input here.
- **Not an asset uploader.** Heavy-asset migration to `ralphy-assets/pool/` is a side effect when the project has locked refs / music beds the template should re-use. The skill does NOT push arbitrary mp4s or final renders — those go to `ralphy-assets/examples/` via a different flow.
- **Not for unfinished projects.** A project without a final render is not yet a candidate. Refuse and point at the missing pieces.

## Source-of-truth files in the source project

Every extraction is keyed to a known file. If a file is missing, the skill degrades gracefully (per the table below), it does not invent content.

| Source file in `workspace/projects/<id>/` | What gets pulled | Output target |
|---|---|---|
| `scenario.json` (required) | Scene skeleton: beats + durations + speaker map + VO/SFX flags | `composition.md` (vibe-reference) — pure structure, no prompts |
| `prompts.json` (preferred) | Per-stage prompts (image / video / VO / music / captions) | `prompt-cookbook.md` — with `{{slots}}` replacing brand / product / persona names |
| `asset-manifest.json` (required) | Locked refs, music beds, character masters, location plates | `template.json:assets` map + pool migration of heavy items |
| `logs/generations.jsonl` (required) | Per-stage model picks + actual params + cost rollup | `model-stack.md` — model defaults + what to avoid + cost ballpark |
| `composition-props.json` (vibe-ref only) | Remotion composition id + per-template defaults | `template.json:compositionTemplate.{id, defaults}` |
| `BRIEF.md` (preferred) | The original user brief — sentence-level intent | Drives category classification + initial description draft |
| `postmortem/02-lessons.md` (preferred) | Top rules + anti-patterns + workflow ordering | `TEMPLATE.md` "Key rules" section (top 5–7 distilled) |
| `postmortem/04-models-and-cost.md` (preferred) | Spend rollup per stage | `README.md` "Cost ballpark" + `model-stack.md` defaults |
| `postmortem/05-workflow-fixes.md` (preferred) | Playbook fixes raised during the session | `TEMPLATE.md` "Workflow" ordered list |

If `postmortem/` is missing, the skill writes a slimmer template: `TEMPLATE.md` gets only the brief + scenario summary (no "Key rules", no "Workflow" — those sections are noted as "TODO: run /postmortem"). The skill warns the user and offers to pause for postmortem first.

See `references/extraction-rules.md` for the per-file extraction details and edge cases.

## The workflow

One CLI verb covers everything. The skill orchestrates the workflow but never reaches around the CLI.

```bash
ralphy template create-from-project <project-id> \
  --slug <kebab-slug>                  # required, e.g. tokyo-y2k-cinematic
  [--kind vibe-reference|vibe-style]   # auto-detect; see references/kind-decision.md
  [--category <one-of-5>]              # LLM-suggest; b2b-saas | dtc-commerce | creator-lifestyle | entertainment-viral | cinematic-narrative
  [--description "<one-liner>"]        # LLM-draft from BRIEF.md
  [--tags tag1,tag2,...]               # LLM-suggest from scenario + manifest + cookbook
  [--no-push-assets]                   # OFF heavy-asset migration (default is ON)
  [--manifest-key-prefix <prefix>]     # ralphy-assets/pool/ key prefix (default = `<slug>/`)
  [--dry-run]                          # print bundle to stdout, no writes
  [--force]                            # overwrite existing template at the target path
```

Output (JSON, pipe-friendly):

```json
{
  "slug": "tokyo-y2k-cinematic",
  "kind": "vibe-reference",
  "category": "cinematic-narrative",
  "template_dir": "templates/cinematic-narrative/tokyo-y2k-cinematic",
  "files_written": ["template.json", "TEMPLATE.md", "composition.md", "prompt-cookbook.md", "model-stack.md", "reference-example.md"],
  "slots_detected": ["{{brand_name}}", "{{product_name}}", "{{target_language}}", "{{location_master_plate}}"],
  "pool_assets_migrated": [
    { "key": "tokyo-y2k-cinematic/master-night-alley.png", "size_mb": 0.8, "from": "workspace/projects/tokyo-y2k-001/assets/images/master-night-alley.png" }
  ],
  "suggest_rank_for_original_brief": { "rank": 1, "score": 0.82 },
  "warnings": []
}
```

## Workflow

1. **Validate the source project.** Required files: `scenario.json` + `asset-manifest.json` + `logs/generations.jsonl`. If any is missing, refuse with a concrete ask: "Run /producer to finish the pipeline, or point me at the right project id." Never proceed on a half-finished project — the template inherits the gaps.

2. **Read `BRIEF.md` (if present) + `scenario.json` headers** to get the elevator pitch. This grounds the LLM passes that follow.

3. **Auto-detect `--kind`** via the rules in `references/kind-decision.md`. Default to `vibe-reference` if all four exist: `scenario.json`, `prompts.json`, `asset-manifest.json`, `composition-props.json`. Otherwise `vibe-style` (prompt cookbook only, no Remotion composition wiring).

4. **LLM pass — classify `--category`** through `callLLM()` using the prompt in `references/category-classifier.md`. The five segment-persona folders are defined there. User override via `--category` always wins.

5. **LLM pass — extract `{{slots}}` from prompts.json** via the patterns in `references/slot-detection.md`. Full-auto: the LLM proposes a complete slot map (brand / product / character names / location plate keys / target language / etc.) and the skill applies the substitutions across `prompts.json` → `prompt-cookbook.md` without asking the user for confirmation. The user can edit slots after the fact by editing the template file directly — that is faster than an interactive gate, and the cost of a wrong slot is just a regen.

6. **LLM pass — synthesize tags + description.** From the scenario summary + cookbook excerpts + category, propose a 10–20 tag set and a one-paragraph description. These feed `ralphy template suggest` ranking.

7. **EXTRACTION** per the table above. Read the source files, write the template files. Files are listed in `references/extraction-rules.md`. The skill writes ONLY to `templates/<category>/<slug>/` — never modifies the source.

8. **Pool migration** (if `--no-push-assets` is NOT set, which is the default). For each `asset-manifest.json` entry tagged as a locked-ref / character-master / location-plate / music-bed:
   - Copy the file to `/Users/maximovchinnikov/github/ralphy-assets/pool/<kind>/<slug>/<name>`
   - Compute SHA-256, file size
   - Update `ralphy-assets/manifest.json` with the new entry (key = `<slug>/<filename>`, kind = inferred from extension + slot role)
   - Regenerate `docs/assets-catalog.md` via `ralphy assets catalog --write`
   - In `template.json:assets`, reference the pool entry via `{ remote: true, manifestKey: "<slug>/<filename>", required: true }`
   - See `references/pool-migration.md` for the migration algorithm + kind-mapping rules.

9. **Write `template.json` + supporting markdown files** to `templates/<category>/<slug>/`. Schema is the same one `cli/commands/template.ts` already consumes (so `list / show / use` all work out of the box).

10. **Verification gates.** Run these three CLI commands and assert their outputs:
    - `ralphy template list` → new slug must appear, source = repo, kind matches.
    - `ralphy template show <slug>` → TEMPLATE.md must parse (no broken frontmatter).
    - `ralphy template suggest "<original BRIEF.md sentence>"` → new slug must rank in top-3 with score ≥ 0.5. If not, surface the failure — usually means tags / description are too generic.

11. **Show the diff + commit summary** to the user. Two commits propose-stage:
    - `ugc-cli`: `templates/<category>/<slug>/` (8–15 files depending on kind)
    - `ralphy-assets`: `pool/<kind>/<slug>/` + `manifest.json` update (only if heavy assets migrated)
    
    Don't auto-push. Show the file list and one-liner per file, then ask the user before `git add` / `git commit` / `git push`. The user owns both repos, so it's a confirmation, not a permission gate.

## How to use the output template

Once the template is written and committed, the consumer flow (a future agent or the user) becomes one command:

```bash
ralphy template use <slug> --project <new-project-id> --brief "<one-line brief>"
```

This is the existing `template use` verb — nothing new on the consumer side. It:
- Scaffolds `workspace/projects/<new-id>/` with empty subdirs
- Copies required assets (locally if present, or pulls from `ralphy-assets/pool/` via the `assets-repo.ts` flow)
- Writes `TEMPLATE_ORIGIN.md` so the next agent reads the template's `TEMPLATE.md` + `prompt-cookbook.md` first
- The scenario is then authored fresh by `/ralph-ugc:create-scenario` using the template as vibe reference (NOT mechanically copied — see template.ts L321 for why)

The agent on the consumer side fills `{{slots}}` from the new project's brief, then runs the pipeline as normal.

## Edge cases & refusals

- **Source project not yet rendered** → refuse. Templates are crystallized experience; pre-render projects have nothing crystallized.
- **Slug already exists in `templates/`** → refuse unless `--force`. Show the diff first.
- **No `postmortem/`** → proceed but warn. The TEMPLATE.md will lack "Key rules" + "Workflow" sections; the user gets a clear suggestion to `/postmortem` first.
- **Heavy assets in workspace exceed 50 MB total** → confirm before pool migration. GitHub raw limit is 100 MB; the template should stream from `raw.githubusercontent.com` cleanly.
- **`--dry-run`** → print the proposed bundle as JSON (file → content), no writes anywhere. Useful for previewing before committing the slug.
- **LLM classification picks the wrong category** → user override via `--category` always wins. Surface the LLM's reasoning in the JSON output so the user can correct fast.

## Why this skill exists (the durable-experience angle)

Today every project's 6-file postmortem captures the most expensive lessons (which model produced bad anatomy, which prompt wording fixed an identity drift, which ffmpeg flag eliminated a click bug) — and then those lessons sit unindexed. The next agent who wants to make a similar video has no way to consume them short of reading the full postmortem.

A template is the compression layer: it crystallizes those lessons into a `prompt-cookbook.md` + `model-stack.md` + `TEMPLATE.md` rules section, then ships them into a discoverable surface (`ralphy template suggest`). The next agent types one CLI command and starts the next project at the postmortem's wisdom level, not at the pre-postmortem flailing level.

This skill is the bridge between "we shipped a render" and "we shipped a method." 

## References

- `references/extraction-rules.md` — per-source-file extraction details + edge cases.
- `references/slot-detection.md` — LLM prompt + heuristic patterns for finding `{{slots}}` in prompts.json.
- `references/kind-decision.md` — vibe-reference vs vibe-style decision tree.
- `references/category-classifier.md` — the five segment-persona categories + LLM classification prompt.
- `references/pool-migration.md` — heavy-asset migration algorithm + ralphy-assets manifest update flow.
- `cli/commands/template.ts` — the existing template surface (list / show / suggest / use / create). The new `create-from-project` subcommand lives in the same module to share helpers.
- `templates/CATEGORIES.md` — full slug-by-category roster (existing templates by category).
- `docs/playbooks/producer.md` — finished-project pipeline (the prerequisite to this skill firing).
