# Art director playbook

**Read this when:** "generate prompts", "generate assets", "make images / video / VO / music", "regenerate scene-XX <slot>", "try a different model", "A/B variant", "how much will it cost".

> **Anchor order discipline (every multi-scene project):**
> 1. **Location-master-plate first** — for any project where ≥2 scenes share a setting, generate the room / location plate as **anchor #1**, BEFORE any character or scene anchor. Pass the plate as `--ref` alongside character masters on every subsequent scene gen. Skipping this cost noski-people-001 ~$4.50 + 45 min ("на всех картинках они сидят на разных диванах а я просил на одном"). This is the single highest-leverage rule in this playbook.
> 2. **Character / persona masters second** — one per cast member, each generated with the location plate as `--ref`. Pass both (location + character) on every downstream scene gen to lock identity + setting.
> 3. **Scene anchors third** — scene-01 first, surfaced to user → wait → scene-02 → wait → … only batch 4-6 anchors at a time AFTER two solo gens land with user approval.
> 4. **i2v / video generation last** — never i2v an unapproved scene anchor.
>
> **Photoreal-human projects:** read [`art-director/photoreal-humans.md`](art-director/photoreal-humans.md) before drafting prompts — TV-commercial register (Tom-Ford / chiaroscuro / marble) is the wrong default for natural-feeling UGC; use Sony A7 IV + Sigma 35/85mm + Kodak Portra 400 still-photo register instead. Venom-bodywash-001 burned ~$3 on this miscalibration.
>
> **Model drift handling:** read [`art-director/regeneration.md`](art-director/regeneration.md) — **one retry max** on a kling/seedance prompt that misses; then **redesign the scene**, don't fight model basins. Glitter-cream-001 lost 2× $0.42 fighting "jar near cheek → powder compact" drift across 3 retries.

Between "scenario approved" and "assets on disk for the editor" — that's my zone. Prompt engineering, API orchestration, single-slot regeneration, A/B variants, cost discipline. Never invent model-id from memory — always cross-check `MODELS.md`.

> **STOP rule.** Every model call goes through `ralphy generate`. No raw `fetch` / `curl` / `bunx tsx` against a media API — gen-log + asset-manifest + cost rollup all depend on the CLI. AGENTS invariant #2.

## CLI cookbook

**Every model call goes through `ralphy generate`. No raw `fetch` / `curl` / `bunx tsx` against media APIs — the gen-log + asset-manifest depend on it.** Cross-check `MODELS.md` for `--model` overrides.

```bash
# Image (default model: google/gemini-3-pro-image-preview)
ralphy generate image --project <id> --slot scene-01-bg --prompt "<text>" \
  [--ref <url> ...] [--model <id>] [--size 1080x1920] [--negative "<text>"]

# Video (default model: kwaivgi/kling-v3.0-pro)
ralphy generate video --project <id> --slot scene-01-vid --prompt "<motion>" \
  --duration 5 [--image <ref-url>] [--model <id>] [--audio]   # --audio only with veo-3.1

# Voiceover via ElevenLabs (eleven_multilingual_v2)
ralphy generate voiceover --project <id> --slot scene-01-vo --voice <voiceId> --text "<line>"

# Music bed via ElevenLabs Music
ralphy generate music --project <id> --slot bed-01 --prompt "<genre, tempo, mood>" --duration 30

# Captions via ElevenLabs Scribe v1 (word-level, ≤25MB audio)
ralphy generate captions --project <id> --audio <vo.mp3>

# Single-slot regen — APPEND-ONLY: new file lands at <slot>.v<N>.<ext>, never overwrites.
# Manifest gets a new version entry; the previous file stays on disk for diff / rollback.
ralphy generate video --project <id> --slot scene-03-vid --prompt "<new>" --duration 5

# Inspect what's on disk + cost so far
ralphy project show <id> --assets        # asset-manifest.json
ralphy project show <id> --prompts       # prompts.json
ralphy project log <id> --type generations --limit 50    # cost + latency + errors
ralphy asset list --project <id>         # disk inventory by slot
```

If you reach for a backend that isn't covered (e.g. lipsync, image editing, talking-head) — STOP. Don't write a script. Either `MODELS.md` already documents the route, or propose adding the verb to `cli/commands/generate.ts`.

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
- **`docs/templates-index.md`** — single-doc roster of all 21 templates (4 vibe-reference + 15 vibe-style cookbooks). Pair with `ralphy template suggest "<utterance>"` to pick the right one before authoring prompts from scratch.
- **`workspace/personas/ARCHETYPES.md`** — 8 archetypes (when there's a persona slot).
- **`workspace/scenes/SETTINGS.md`** — 9 scene settings (when you need to pick a setting).
- `workspace/projects/<id>/scenario.json` — slots + VO text.
- `workspace/projects/<id>/prompts.json` — what already exists.
- `workspace/projects/<id>/asset-manifest.json` — what's already on disk (skip).
- `workspace/projects/<id>/logs/generations.jsonl` — on regeneration, to avoid repeating a failure.
- `templates/<slug>/{TEMPLATE,hooks,prompt-cookbook}.md` (or `workspace/templates/<slug>/`) — if the project was scaffolded from a template, the cookbook is your prompt-writing reference.

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
