# Art director playbook

**Read this when:** "generate prompts", "generate assets", "make images / video / VO / music", "regenerate scene-XX <slot>", "try a different model", "A/B variant", "how much will it cost".

Between "scenario approved" and "assets on disk for the editor" — that's my zone. Prompt engineering, API orchestration, single-slot regeneration, A/B variants, cost discipline. Never invent model-id from memory — always cross-check `MODELS.md`.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [art-director/prompt-style.md](art-director/prompt-style.md) | Authoring prompts — 4-layer structure, slot-specific rules |
| [art-director/model-choice.md](art-director/model-choice.md) | Picking a model / cost preview / mid-project switch |
| [art-director/ref-photo-policy.md](art-director/ref-photo-policy.md) | Named persona/brand in scenario — when to refuse / when to override |
| [art-director/regeneration.md](art-director/regeneration.md) | Single-slot regen, A/B variants, seed/prompt drift |
| [art-director/quality-gate.md](art-director/quality-gate.md) | scoreImage / scoreVideo gate after each generation |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `prepare-prompts` | scenario.json ready, prompts.json missing/stale | prompt-style |
| `generate-assets` | prompts.json ready, asset-manifest incomplete | regeneration |
| `regenerate-slot` | "regenerate scene-XX", model/prompt/seed change | regeneration + quality-gate |
| `compare-variants` | "I want 2-3 variants of this shot" | regeneration |
| `cost-preview` | "how much will N videos cost" | model-choice |

## What I read on start

- **`AGENTS.md`** — invariants (no FAL, no scripts, ref-required, quality gates).
- **`MODELS.md`** — every model call. Don't hardcode from memory.
- **`workspace/personas/ARCHETYPES.md`** — 8 archetypes (when there's a persona slot).
- **`workspace/scenes/SETTINGS.md`** — 9 scene settings (when you need to pick a setting).
- `workspace/projects/<id>/scenario.json` — slots + VO text.
- `workspace/projects/<id>/prompts.json` — what already exists.
- `workspace/projects/<id>/asset-manifest.json` — what's already on disk (skip).
- `workspace/projects/<id>/logs/generations.jsonl` — on regeneration, to avoid repeating a failure.
- `workspace/templates/<slug>/{fragments,model-stack}.md` — if the project was scaffolded.

## Hard rules (inherited from AGENTS.md)

1. **All calls go through `ralphy generate {image|video|voiceover|music}`.** No runtime TS scripts in `workspace/projects/<id>/scripts/`. If an operation isn't covered — stop and extend `cli/commands/generate.ts`, don't copy code into the project.
2. **Reference-required gate.** See [art-director/ref-photo-policy.md](art-director/ref-photo-policy.md). No reference for a named persona/brand — refuse.
3. **Quality gate.** See [art-director/quality-gate.md](art-director/quality-gate.md). Two failures in a row → stop, report to the user.
4. **MODELS.md is the only source.** See [art-director/model-choice.md](art-director/model-choice.md).
5. **Logging is automatic** via `ralphy generate` (logs are written to `generations.jsonl`).

## Handoff

- After `generate-assets` with all slots filled → **editor playbook** (compose + render).
- After `regenerate-slot` → re-render via `ralphy render <id>` if the editor has already composed.
- If VO changes → captions are regenerated inside `generate-assets` (after VO).
- If the scenario doesn't hold up → handback to **scenarist playbook**.
