---
name: art-director
namespace: user
description: >-
  Prompt and asset generation craft — turns an approved scenario into prompts.json and generated media through `ralphy generate`. Owns anchor order (location-master-plate first), character fit, photoreal-human prompting, model choice and cost preview, the reference-photo policy, regeneration rules, and the image/video quality gate.
  USE WHEN the user asks to "generate prompts", "generate assets", "make images / video / voiceover / music", "regenerate scene-XX", "try a different model", "A/B variant", "how much will this cost".
  TRIGGER (EN): "generate prompts", "make the images", "regenerate scene", "model swap", "cost preview", "A/B variant", "redo this shot".
---

# Art director playbook

> **Minimal re-read set after context compaction:** the anchor-order block, "CLI cookbook", and "Hard rules" in this file, plus the project's `STYLE_LOCK.md` and `STORYBOARD.md`. Open a `references/` file only for the sub-task in the table below; read large project files (`prompts.json`, `generations.jsonl`) with a range or `rg`, not whole.

**Read this when:** "generate prompts", "generate assets", "make images / video / VO / music", "regenerate scene-XX <slot>", "try a different model", "A/B variant", "how much will it cost".

> **Anchor order discipline (every multi-scene project)** — full wording and postmortem evidence in [`references/anchor-order.md`](./references/anchor-order.md):
> 1. **Location-master-plate first** whenever ≥2 scenes share a setting; pass it as `--ref` on every later scene gen. ≥25-scene projects need ≥3 anchor angles per recurring subject. CLI shape: [`location-plate.md`](./references/location-plate.md). The single highest-leverage rule here.
> 2. **Character / persona masters second**, each with the location plate as `--ref`.
> 3. **Scene anchors third**, one at a time with user approval; batch 4-6 only after two solo approvals.
> 4. **i2v / video last** — never i2v an unapproved anchor.
>
> **Photoreal humans:** read [`photoreal-humans.md`](./references/photoreal-humans.md) first (still-photo register, not TV-commercial).
>
> **Aesthetic-lock checkpoint (HARD gate, before anchor fan-out):** after plate + character masters are approved, name the register in one phrase, run the [`character-fit.md`](./references/character-fit.md) check, write the aesthetic-lock string into `STORYBOARD.md`, and surface one cover per register. **Refuse to fan out scene anchors until the cover is approved.** Unsure of the register → `ralphy ref pull <url> --frames` and READ the frames.
>
> **Model drift:** **one retry max** on a missed kling / seedance prompt, then redesign the scene ([`regeneration.md`](./references/regeneration.md)).

Between "scenario approved" and "assets on disk for the editor" — that's my zone. Prompt engineering, API orchestration, single-slot regeneration, A/B variants, cost discipline. Never invent model-id from memory — pick from the `MODELS.md` index and confirm with `ralphy models show <id>`.

> **STOP rule.** Every model call goes through `ralphy generate`. No raw `fetch` / `curl` / `bunx tsx` against a media API — gen-log + asset-manifest + cost rollup all depend on the CLI. AGENTS invariant #2.

## CLI cookbook

**Every model call goes through `ralphy generate`. No raw `fetch` / `curl` / `bunx tsx` against media APIs — the gen-log + asset-manifest depend on it.** Confirm any `--model` override with `ralphy models show <id>`.

```bash
# Image (default model: google/gemini-3-pro-image-preview)
ralphy generate image --project <id> --slot scene-01-bg --prompt "<text>" \
  [--ref <url> ...] [--model <id>] [--size 1080x1920] [--negative "<text>"]

# Host-native image (Codex / Claude image tool output): the FREE path. Prefer it over a
# paid model when the host model fits the brief (photoreal, typography and multi-ref
# consistency may still need the registry pick). Always register it: one call copies it
# into the slot as a new revision, $0, no provider call.
ralphy generate image --import <file> --project <id> --slot scene-01-bg \
  [--prompt "<prompt the host tool got>"] [--model <host-model-name>] [--source host-native]

# Video (default model: kwaivgi/kling-v3.0-pro)
ralphy generate video --project <id> --slot scene-01-vid --prompt "<motion>" \
  --duration 5 [--image <ref-url>] [--model <id>] [--audio]   # --audio only with veo-3.1

# Several clips: submit them ALL first, then wait once (#575). Waiting on each
# clip in turn idled 2-3 min per clip in the #562 baseline.
ralphy generate video --project <id> --slot scene-01-vid ... --queue --queue-tag <id>-clips
ralphy generate video --project <id> --slot scene-02-vid ... --queue --queue-tag <id>-clips
ralphy queue list --tag <id>-clips        # poll once per minute, or `queue watch`

# Voiceover via ElevenLabs (eleven_multilingual_v2)
# Parallel calls targeting the SAME slot are serialized by an in-process file lock
# (#039) and verified via ffprobe after write — a corrupted 0-duration mp3 is
# treated as a transient blip and retried once before failing hard. Cross-slot
# fan-out stays parallel (TTS endpoint cap is 3 in-flight via #007 semaphore).
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

If you reach for a backend that isn't covered (e.g. lipsync, image editing, talking-head) — STOP. Don't write a script. Either the model registry (`ralphy models show <id>`) already documents the route, or propose adding the verb to `cli/commands/generate.ts`.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [art-director/location-plate.md](./references/location-plate.md) | Multi-scene-same-room project — generate one wide `location-master-plate` anchor BEFORE any character / scene anchor; ≥3 angles per recurring subject on ≥25-scene projects |
| [art-director/photoreal-humans.md](./references/photoreal-humans.md) | Photoreal human characters — still-photo register (Sony A7 IV + Sigma + Kodak Portra 400), 5-cue checklist, anti-AI-slop block, wider register taxonomy |
| [art-director/character-fit.md](./references/character-fit.md) | Clean brand mascot paired with a gritty register (punk / acid / horror / xerox) — three choices: reinterpret-in-medium, distressed variant, or shift register. Decide at cover-first checkpoint |
| [art-director/prompt-style.md](./references/prompt-style.md) | Authoring prompts — register-first axis, 4-layer structure, slot-specific rules |
| [art-director/model-choice.md](./references/model-choice.md) | Picking a model / cost preview / mid-project switch |
| [art-director/ref-photo-policy.md](./references/ref-photo-policy.md) | Named persona/brand in scenario — when to refuse / when to override |
| [art-director/regeneration.md](./references/regeneration.md) | Single-slot regen, A/B variants, seed/prompt drift |
| [art-director/quality-gate.md](./references/quality-gate.md) | scoreImage / scoreVideo gate after each generation |
| [art-director/pre-render-checklist.md](./references/pre-render-checklist.md) | HARD snapshot-review gate before handing to editor |
| [anchor-order.md](./references/anchor-order.md) | Full anchor-order, aesthetic-lock, and drift rules with postmortem evidence |
| [prompt-hygiene.md](./references/prompt-hygiene.md) | Verbatim anti-mockup blocks, markdown-in-copy, background-job file rules |
| [split-scene.md](./references/split-scene.md) | A scene failed twice on the same axis — split it into micro-shots |
| [style-lock-gate.md](./references/style-lock-gate.md) | Covered content modes and derivation routes for the `STYLE_LOCK.md` gate |

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
- **`MODELS.md` index + `ralphy models show <id>`** — every model call. Don't hardcode from memory, and don't read `docs/models/*.md` whole.
- **`.agents/skills/ugc-*`** (and `/poster`, `/carousel`, …) — the content-niche craft-overlay skill for the brief's *kind* of content, loaded on top of the matched format / template as the prompt-authoring overlay. The format / template is the primary route (`docs/templates-index.md`, `ralphy template suggest --help`); a *style* template doubles as a remix target only when the user pointed at a specific video to reproduce. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- **`docs/creative-library/personas/ARCHETYPES.md`** — 8 archetypes (when there's a persona slot).
- **`docs/creative-library/scenes/SETTINGS.md`** — 9 scene settings (when you need to pick a setting).
- `.ralphy/workspaces/<ws>/projects/<id>/scenario.json` — slots + VO text.
- `.ralphy/workspaces/<ws>/projects/<id>/prompts.json` — what already exists.
- `.ralphy/workspaces/<ws>/projects/<id>/asset-manifest.json` — what's already on disk (skip).
- `.ralphy/workspaces/<ws>/projects/<id>/logs/generations.jsonl` — on regeneration, to avoid repeating a failure.
- `templates/<slug>/{TEMPLATE,hooks,prompt-cookbook}.md` (or `.ralphy/workspaces/<ws>/templates/<slug>/`) — if the project was scaffolded from a template, the cookbook is your prompt-writing reference.

## Step 1 of every gen — read the library (02.0L.03)

Before writing a prompt for any slot, run `ralphy prompts library lookup --goal "<one-line description of the slot>"` and read the top-matched `entry.md`. The library is organized by goal/situation (not by model) — it carries the Bad / OK / Ideal worked-example pattern for hooks, product reveals, selfie monologs, caption styles, music modes, and so on.

`ralphy prompts modes --kind <video|voice|music>` lists the cookbook mode files when the agent already knows which model family to call. Pair the library entry (goal layer) with the per-model adapter (shape layer) — the adapter consumes a `NormalizedPrompt` and emits the model-specific syntax automatically (see `cli/lib/providers/prompt-adapter/`).

## Hard rules (inherited from AGENTS.md)

1. **All calls go through `ralphy generate {image|video|voiceover|music}`.** No runtime TS scripts in `.ralphy/workspaces/<ws>/projects/<id>/scripts/`. If an operation isn't covered — stop and extend `cli/commands/generate.ts`, don't copy code into the project.
2. **Reference-required gate (named real entities only).** See [art-director/ref-photo-policy.md](./references/ref-photo-policy.md). The gate fires for a named person / recognizable brand product / IP. Generic briefs do not trigger. Override path: `ralphy generate ... --no-ref-consent "<reason>"` on the specific failing call; the CLI auto-appends `stage: "no-ref-consent"` to `user-prompts.jsonl`.
3. **Quality gate.** See [art-director/quality-gate.md](./references/quality-gate.md). Two failures in a row → stop, report concrete options to the user. Refuse, do not warn (AGENTS invariant #4).
4. **The model registry is the only source** (`MODELS.md` index, `ralphy models show <id>` per model). See [art-director/model-choice.md](./references/model-choice.md). Always pick the best model per kind — there is no "cheaper draft" path. Budget caps (`.agents/skills/producer/SKILL.md#budget`) are the lever to control cost, not model downgrade (`04.0A.03`).
5. **Iterate by single-slot regen, never overwrite.** "Rework scene-03" → `ralphy generate <kind> --project <id> --slot scene-03-<kind> --prompt "<new>"`. Append-only versioning writes `<slot>.v2.<ext>` (then `v3`, `v4`, …). The prior version stays on disk for diff / rollback; the manifest tracks both. Pass `--force-overwrite` only when the user explicitly asks for legacy destructive behavior (`04.01.03`).
6. **Generation logging is automatic** via `ralphy generate` (logs are written to `generations.jsonl`). **User-prompt logging is NOT automatic — you MUST log it.** Every user feedback turn on an anchor / prompt / model swap goes to `user-prompts.jsonl` via `ralphy project log-prompt <id> --text "<verbatim>" --stage <feedback|approval|critique|rejection>` BEFORE you regenerate. Same MUST-log discipline as the scenarist playbook (see [`scenarist.md` → "User-prompt logging"](../scenarist/SKILL.md#user-prompt-logging-must-every-turn)). "Try v2 with a wider lens", "approve scene-03", "scene-05 looks AI-slop" — all log-prompt turns. Sparse logs are the documented cause of unreliable postmortems.
7. **Style-lock gate before any prompt (#408).** Every slot prompt cites the project's `STYLE_LOCK.md` (register, pacing, hook, caption/audio, do-not-do list, benchmark refs, model implications). For a covered content mode (`guidelineOrStyleLock.required` in `cli/lib/content-modes.ts`) a missing lock is **refuse-not-warn**: `ralphy project style-lock <id> --check` exits non-zero → stop and run `ralphy project style-lock <id>` before any prompt fan-out. Read the lock's "Do-not-do" and "Model-specific implications" before every slot prompt. Covered modes and derivation routes: [`references/style-lock-gate.md`](./references/style-lock-gate.md).

8. **Free before paid (#559).** Before a paid regen or model call, try the local path: tracking, object replacement, sticker / screen inserts, and face boxes come from `ralphy track point|planar|face` (OpenCV / MediaPipe, zero provider calls) plus HyperFrames compositing. Escalate to a provider only with a stated reason (for example "the insert must be relit and occluded by hands, which a corner pin cannot do"), and log that reason with `ralphy project log-prompt`.

## Prompt hygiene

Three checks before every submit (verbatim blocks and postmortem evidence in [`references/prompt-hygiene.md`](./references/prompt-hygiene.md)):

1. **Anti-mockup directive** — every full-bleed slot on nano-banana / `google/gemini-3-pro-image-preview` leads with the `CRITICAL: This is a FULL-BLEED … NO iPhone device frame` block (player-UI variant for video stills); when the phone IS the subject, name the mockup explicitly.
2. **No markdown emphasis in quoted on-screen copy** — strip `**`, `__`, `~~`, stray `*` / `_`; the model bakes them into the glyphs.
3. **Background-job file hygiene** (AGENTS #17) — while a `ralphy generate` job runs, its `--prompt-file`, `--ref`, and `prompts/` paths are read-only; kill and relaunch to swap a prompt.

## Split-scene-instead-of-regen (repeat-failure rule)

**Rule.** When a scene fails twice on the same axis (same motion beat, camera move, or impossible action), stop re-prompting: write the axis down in one line and split the scene into 2-4 micro-shots that sum to the original slot duration, each a beat the model has already hit in this project. Update the slot list via `ralphy project update`, regenerate prompts for the new slots only, and let the editor stitch them. Example (`flipper-hypermotion-001`) and continuity tips: [`references/split-scene.md`](./references/split-scene.md).

## Pre-render self-review (HARD gate)

Refuse-not-warn, every project, before handing to the editor: snapshot every `STORYBOARD.md` beat (`bunx hyperframes snapshot .ralphy/workspaces/<ws>/projects/<id>`) and check anatomy, location continuity, camera-axis sanity, identity locks against each cast master, and on-prompt props at the right timestamp. One fail aborts the render: fix via `regeneration.md` and re-snapshot. Full checklist and postmortem evidence: [`references/pre-render-checklist.md`](./references/pre-render-checklist.md).

## Handoff

- After `generate-assets` with all slots filled → **editor playbook** (compose + render).
- After `regenerate-slot` → re-render via `ralphy render <id>` if the editor has already composed.
- If VO changes → captions are regenerated inside `generate-assets` (after VO).
- If the scenario doesn't hold up → handback to **scenarist playbook**.
