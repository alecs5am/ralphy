---
name: art-director
namespace: user
description: >-
  Prompt and asset generation craft — turns an approved scenario into prompts.json and generated media through `ralphy generate`. Owns anchor order (location-master-plate first), character fit, photoreal-human prompting, model choice and cost preview, the reference-photo policy, regeneration rules, and the image/video quality gate.
  USE WHEN the user asks to "generate prompts", "generate assets", "make images / video / voiceover / music", "regenerate scene-XX", "try a different model", "A/B variant", "how much will this cost".
  TRIGGER (EN): "generate prompts", "make the images", "regenerate scene", "model swap", "cost preview", "A/B variant", "redo this shot".
---

# Art director playbook

**Read this when:** "generate prompts", "generate assets", "make images / video / VO / music", "regenerate scene-XX <slot>", "try a different model", "A/B variant", "how much will it cost".

> **Anchor order discipline (every multi-scene project):**
> 1. **Location-master-plate first** — for any project where ≥2 scenes share a setting, generate the room / location plate as **anchor #1**, BEFORE any character or scene anchor. Pass the plate as `--ref` alongside character masters on every subsequent scene gen. Skipping this cost noski-people-001 $0.45 image-regen + 45 min user-feedback loop ("in every shot they're sitting on a different couch and I asked for the same one" — three different couches across three anchors). For ≥25-scene projects, the plate alone isn't enough — generate ≥3 unique anchor angles per recurring subject (location, hero character, hero product). Full discipline + CLI shape + worked example: [`art-director/location-plate.md`](./references/location-plate.md). This is the single highest-leverage rule in this playbook.
> 2. **Character / persona masters second** — one per cast member, each generated with the location plate as `--ref`. Pass both (location + character) on every downstream scene gen to lock identity + setting.
> 3. **Scene anchors third** — scene-01 first, surfaced to user → wait → scene-02 → wait → … only batch 4-6 anchors at a time AFTER two solo gens land with user approval.
> 4. **i2v / video generation last** — never i2v an unapproved scene anchor.
>
> **Photoreal-human projects:** read [`art-director/photoreal-humans.md`](./references/photoreal-humans.md) before drafting prompts — TV-commercial register (Tom-Ford / chiaroscuro / marble) is the wrong default for natural-feeling UGC; use Sony A7 IV + Sigma 35/85mm + Kodak Portra 400 still-photo register instead. Venom-bodywash-001 burned ~$3 on this miscalibration.
>
> **Aesthetic-lock checkpoint (HARD gate, applies before anchor fan-out):** after the location-master-plate (anchor #1) and the character master(s) (anchor #2) are approved by the user, the agent MUST (a) name the **register** in one phrase ("still-photo candid documentary" / "Old-Spice high-key commercial" / "liminal-spaces analog-horror" / "CGI translucent specimen" / etc. — taxonomy at the top of [`photoreal-humans.md`](./references/photoreal-humans.md)), (b) run the [`character-fit.md`](./references/character-fit.md) check (clean mascot + gritty register? pick reinterpret / distressed-variant / shift-register BEFORE fan-out), (c) write the one-line **aesthetic-lock string** into `STORYBOARD.md`, and (d) generate **one cover per register** and surface it to the user. **Refuse to fan out scene anchors until the cover is approved.** Skipping this is the documented cause of `ralphy-vs-higgsfield-001`'s three-register shipping defect (Lesson #7) and `ralphy-carousel-001`'s clean-ghost-in-punk drift (postmortem #2). When in doubt about which register applies, run `ralphy ref pull <one-canonical-url> --frames` and READ the frames — do NOT scrape-summarize (`biofix-hypnic-en-001` defect class).
>
> **Model drift handling:** read [`art-director/regeneration.md`](./references/regeneration.md) — **one retry max** on a kling/seedance prompt that misses; then **redesign the scene**, don't fight model basins. Glitter-cream-001 lost 2× $0.42 fighting "jar near cheek → powder compact" drift across 3 retries.

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

If you reach for a backend that isn't covered (e.g. lipsync, image editing, talking-head) — STOP. Don't write a script. Either `MODELS.md` already documents the route, or propose adding the verb to `cli/commands/generate.ts`.

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
4. **MODELS.md is the only source.** See [art-director/model-choice.md](./references/model-choice.md). Always pick the best model per kind — there is no "cheaper draft" path. Budget caps (`.agents/skills/producer/SKILL.md#budget`) are the lever to control cost, not model downgrade (`04.0A.03`).
5. **Iterate by single-slot regen, never overwrite.** "Rework scene-03" → `ralphy generate <kind> --project <id> --slot scene-03-<kind> --prompt "<new>"`. Append-only versioning writes `<slot>.v2.<ext>` (then `v3`, `v4`, …). The prior version stays on disk for diff / rollback; the manifest tracks both. Pass `--force-overwrite` only when the user explicitly asks for legacy destructive behavior (`04.01.03`).
6. **Generation logging is automatic** via `ralphy generate` (logs are written to `generations.jsonl`). **User-prompt logging is NOT automatic — you MUST log it.** Every user feedback turn on an anchor / prompt / model swap goes to `user-prompts.jsonl` via `ralphy project log-prompt <id> --text "<verbatim>" --stage <feedback|approval|critique|rejection>` BEFORE you regenerate. Same MUST-log discipline as the scenarist playbook (see [`scenarist.md` → "User-prompt logging"](../scenarist/SKILL.md#user-prompt-logging-must-every-turn)). "Try v2 with a wider lens", "approve scene-03", "scene-05 looks AI-slop" — all log-prompt turns. Sparse logs are the documented cause of unreliable postmortems.
7. **Style-lock gate before any prompt (#408).** Prompt preparation MUST cite the project's `STYLE_LOCK.md` — the locked visual register / pacing / hook / caption+audio / do-not-do list / benchmark refs / model implications are the source of truth every slot prompt is written against (and the same artifact the eval deep-vision pass scores against). For a **covered content mode** (the ones whose `guidelineOrStyleLock.required` is true in `cli/lib/content-modes.ts` — currently `product-shot`, `closeup-product-with-person`, `social-carousel`, `ad-creative-pack`, `virtual-model-tryout`, `tv-ad`, `cartoon-animation`, `restyle`, `amazon-listing`), a missing `STYLE_LOCK.md` is a **refuse-not-warn** condition: run `ralphy project style-lock <id> --check` (it exits non-zero with `refuse:true` when the lock is missing for a covered mode), and if it refuses, **stop and scaffold the lock first** with `ralphy project style-lock <id>` — do NOT start prompt fan-out over a missing lock. Derivation routes: a URL/handle in the brief → route through the [`researcher`](../researcher/SKILL.md) skill / site-grounding (AGENTS #15), fold the digest into the lock; otherwise derive the register from the matched template, the applicable guideline slugs, and memory. Read the lock's "Do-not-do" + "Model-specific implications" sections before every slot prompt.

## Prompt hygiene

Three small rules every `ralphy generate` call should clear before submit. Each is a one-liner; each saves one regen cycle (~$0.15–$1) per occurrence and was filed from a real postmortem. See [notes/issues/done/050-anti-mockup-and-prompt-hygiene.md](../../../notes/issues/done/050-anti-mockup-and-prompt-hygiene.md) for the bundle.

### 1. Anti-mockup directive (nano-banana / gemini-3-pro-image-preview)

`nano-banana` defaults to a **tiny iPhone-mockup-in-corner** composition unless the prompt explicitly forbids it. Without the forbid-string, even a clearly full-bleed brief (poster, hero, magazine layout) comes back with a postage-stamp phone floating in the lower third. Validated on `appstore-takeaminute-001` (`screen-01-hero-v2`/`-v4` both leaked mockups; 2 paid regens at $0.15 each before the directive went in; ~8 further regens prevented across the run).

**Rule.** Any full-bleed slot prompt for nano-banana / gemini-3-pro-image-preview MUST lead with the verbatim block below. The HERO / TROPE / CTA register from `appstore-takeaminute-001` is the canonical wording:

```
CRITICAL: This is a FULL-BLEED MAGAZINE POSTER LAYOUT — NO iPhone
device frame, NO phone mockup, NO screen bezel. The poster IS the
entire image edge-to-edge.
```

The player-UI-overlay variant (HD / video-content register) — use when the slot is "video still with player chrome drawn on top", not a poster:

```
CRITICAL: This is FULL-BLEED video content with a PLAYER UI OVERLAY
drawn directly on top — NO iPhone device frame, NO phone-mockup bezel
around the image. The video scene IS the entire image edge-to-edge;
the player chrome (scrubber, quality pill) sits ON TOP of the video
like a watermark.
```

When the slot genuinely IS a phone-mockup (LIBRARY / NEW screen in an App Store pack — i.e. the phone is the intended subject), invert the rule and **name the mockup explicitly** so nano-banana places it deliberately instead of as a leak:

```
CENTER VISUAL: sleek 3D angled iPhone mockup floating tilted, screen
showing <concrete scene description with named in-app content>. Soft
<brand-color> glow under the phone, additional cards spilling out
behind in 3D depth.
```

Naming actual in-app content (real series titles, real card text, the brand's real palette) makes nano-banana populate the mockup with plausible on-brand artwork instead of generic placeholders. Source: `.ralphy/workspaces/<ws>/projects/appstore-takeaminute-001/POSTMORTEM.md` § "Prompt patterns that worked (verbatim)".

### 2. Markdown punctuation in quoted strings

Markdown emphasis (`**bold**`, `_italic_`, `~strike~`) inside a typography slot **bakes literal asterisks / underscores into the rendered glyphs**. `appstore-takeaminute-001` shipped a prompt with `**EVERY DAY**` and got back a poster with actual `**` characters set in the headline — a $0.15 regen.

**Rule.** Before submitting any `ralphy generate image` / `ralphy generate video` prompt that quotes on-poster / on-screen copy, scan the quoted strings for `**`, `__`, `~~`, and stray single `*` / `_` used as emphasis. Strip them, OR replace them with a non-markdown emphasis directive (e.g. `the word EVERY DAY set larger / in the accent color`). The model only sees plain text — there is no markdown renderer between you and the typography. The CLI-side fix (auto-strip at the `cli/lib/providers/media.ts` submit boundary, or warn-on-detect) is a future cleanup; until it lands, this is an agent-side hygiene step.

### 3. Background-job file hygiene

Mirror of AGENTS.md invariant #17. `ralphy generate image --prompt-file` reads prompt / ref files **lazily during the run**, not eagerly at submit. Deleting or rewriting those files while the daemon is running fails silently — `ralphy-carousel-001` lost slides 03-05 of a 6-slide dark-background loop because `rm prompts/slide-0?.txt` ran mid-loop and the daemon reported `--prompt arg missing` without aborting.

**Rule.** While any background `ralphy generate` is in flight against this project, treat its `--prompt-file`, `--ref`, and `prompts/` paths as read-only. To swap a prompt, kill the job first and relaunch; do not edit-in-flight. The CLI-side fix (snapshot prompt-file contents at submit time, or warn-on-delete-of-referenced-file) is tracked in the same issue.

## Split-scene-instead-of-regen (repeat-failure rule)

**Rule.** When a single scene fails twice on the same axis — the same motion beat, the same camera move, the same physically-impossible action — **stop re-prompting and split it into N micro-shots inside the original slot's time budget.** Don't try a third prompt variant; that loop converges nowhere.

The default agent instinct is re-prompt-on-fail (tweak verbs, try a different model, add a negative). For "one beat the model can't deliver" failures, that instinct is wrong. Splitting converts an impossible 5s shot into three possible ~1.6s shots — each a beat the model *can* hit — and the editor stitches them within the same slot duration. The total cost is usually lower than a third regen and the result actually lands.

**Concrete example — `flipper-hypermotion-001` scene-03 (POSTMORTEM rule #11).** Scene-03 was a single 5s hypermotion shot the model couldn't sustain; two regens on the same prompt axis drifted the same way. The redo (one scene, split into micro-shots) cost **$1.28 — ~10% of the entire project budget** — and produced more lessons per dollar than the rest of phase 3 combined. The lesson the postmortem locked in: the second failure on the same axis is the signal to restructure, not to re-prompt.

**Structural pairing.** Splitting becomes much cheaper once `ralphy ref extract-frame` + `ralphy generate video --extend-from <slot>` ship (see [notes/issues/done/012-no-frame-extract-or-i2v-extend-verbs.md](../../../notes/issues/done/012-no-frame-extract-or-i2v-extend-verbs.md)) — that pair lets you i2v-anchor each micro-shot from the previous one's last frame, keeping continuity without a fresh anchor for every sub-beat. Until those verbs land, hand-author the split by reusing the scene anchor as `--ref` on every micro-shot.

**Operationally.**

1. After the second failure on the same axis, write down the axis in one line ("camera can't crash-zoom through the prop on contact") and stop regenerating.
2. Rewrite the scene as 2-4 micro-shots whose durations sum to the original slot. Each micro-shot must be a beat the model has hit in this project before.
3. Update `scenario.json` slot list (`scene-03a`, `scene-03b`, …) via `ralphy project update`, regenerate prompts for the new slots only, then `ralphy generate` each.
4. Editor stitches the micro-shots back into the original scene's time window.

## Pre-render self-review (HARD gate)

Before handing the project to the editor for `ralphy render <id>` — every project, no exceptions — walk the pre-render checklist. This is not a soft "should snapshot key beats"; it is a refuse-not-warn gate.

- **MUST snapshot every beat** in `STORYBOARD.md` via `bunx hyperframes snapshot .ralphy/workspaces/<ws>/projects/<id>` before render.
- **MUST eyeball every snapshot for anatomy** (hands, eyes, limb clipping — the `noski-people-001` failure class).
- **MUST eyeball every snapshot for location continuity** (same couch / wall / light across scenes that share a setting).
- **MUST eyeball every snapshot for pivot / camera-axis sanity** (180° line, camera height, no v1→v2 mirror flip).
- **MUST cross-check identity locks** against each cast master shot.
- **MUST verify on-prompt props** present at the right timestamp.

A single fail aborts the render — fix at this layer via `regeneration.md`, then re-snapshot. Full worked rationale + `noski-people-001` / `odindoma-fb-ad-001` postmortem evidence in [art-director/pre-render-checklist.md](./references/pre-render-checklist.md).

The future `--require-snapshot-review` flag on the `ralphy hyperframes render` namespace (out of scope here — tracked in [notes/issues/028](../../../notes/issues/done/028-no-ralphy-hyperframes-namespace.md)) will mechanise this gate. Until it ships, the agent enforces by reading the sub-doc.

## Handoff

- After `generate-assets` with all slots filled → **editor playbook** (compose + render).
- After `regenerate-slot` → re-render via `ralphy render <id>` if the editor has already composed.
- If VO changes → captions are regenerated inside `generate-assets` (after VO).
- If the scenario doesn't hold up → handback to **scenarist playbook**.
