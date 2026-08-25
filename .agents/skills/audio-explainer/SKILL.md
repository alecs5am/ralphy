---
name: audio-explainer
namespace: user
description: >-
  Audio-first long-form explainer pipeline — takes one audio file (or a YouTube/podcast URL → audio) and produces a faceless overlay-driven video in the dev-essay / tech-podcast style (5-30 minutes, 16:9, no talking head). Orchestrates the existing `ralphy` primitives: yt-dlp pull → silence-remove → ElevenLabs Scribe v1 word-level transcript → Gemini audio-describe → LLM claim segmentation → per-claim overlay-type planner (code-block / terminal / tweet-card / browser-frame / screenshot / meme / diagram / quote-card / chapter-card / logo-pop) → asset prep (Playwright for screenshots, `ralphy generate image` for memes, ElevenLabs Music for the bed, ElevenLabs SFX for whoosh/pop/hit) → HyperFrames composition with chapter sub-compositions → `ralphy render`.
  USE WHEN the user drops an audio file (mp3 / wav / m4a) or a YouTube / podcast URL and asks for a long-form video edited on top, says "make a video from this audio / podcast", "monter ce podcast" (FR), "smontiruy podkast v video" (RU transliteration), "audio to video", "long-form essay video", "faceless overlay video from audio".
  TRIGGER (EN): "audio to video", "podcast to video", "edit my podcast into a video", "make a long-form video from this audio", "faceless explainer from audio", "overlay-driven video from podcast", "monter le podcast", "smontiruy podkast".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# audio-explainer

## Trigger refinements

**ALSO FIRE** when the user drops a YouTube / podcast URL whose duration is > 4 minutes AND asks for "a video" (not "a clip" / "a short" / "a cut") — that is the audio-to-longform path, not the short-form cut path. Long-form on a URL: pull `--audio-only`, then run this skill on the audio.

**DO NOT FIRE** for:
- Short-form cuts (< 4 min) from a long-form source — route to `podcast-clip` template.
- Talking-head essays where the user wants their face on screen — route to `yap-talking-head` or `green-screen-explainer`.
- Multi-speaker debates / interviews — route to `interview-dialog` (split-screen) or `podcast-clip` (cut viral moments).
- Music videos / non-speech audio — route to `music-video` template.
- Once the project has `index.html` composed and the user wants render / preview tweaks — handback to the **editor** playbook.

## Hard invariants

1. **`ralphy` is the only entry-point.** No direct `ffmpeg`, `yt-dlp`, `curl`, or `bunx tsx` against provider SDKs. Every step in the workflow below is either a `ralphy` verb (already shipped) or an LLM call routed through `cli/lib/providers/llm.ts → callLLM()`. AGENTS invariant #2.
2. **Append-only on the project dir.** Per AGENTS invariant #14, every regeneration writes `.v2` / `.v3` files. Never overwrite `overlay-plan.json`, `captions.json`, or any asset in `artifacts/`. The skill writes a new version; the user picks which to promote.
3. **English-only on disk.** Every file the skill writes lands in English. If the source audio is Russian / Spanish / etc., the on-disk `overlay-plan.json` keeps `vo_text` in the source language (it's transcript content) but every comment, log line, file name, and skill-generated annotation is English. Chat with the user matches their language.
4. **No raw API code.** Browser screenshots run through a Playwright helper script the skill calls via `bunx playwright`, not via raw `puppeteer.launch()` in inline code. Image generation goes through `ralphy generate image`. Music + SFX through `ralphy generate music` + `ralphy generate sfx`. No direct ElevenLabs HTTP calls.
5. **Composition must be deterministic.** The HyperFrames `index.html` the skill emits has no `Date.now()` / unseeded `Math.random()` / `fetch()` at render time. Per `.agents/skills/hyperframes/references/playbook.md` hard invariants.

---

## What this skill is

A one-shot orchestrator that turns audio into a long-form faceless video. The contract: **the user drops an audio source and a one-line topic gloss; the skill returns a rendered mp4** (or, if the user wants to iterate, a composed `index.html` ready for `bunx hyperframes preview`).

The skill is the editorial brain that the routing table in `AGENTS.md` points "audio podcast → faceless overlay video" requests to. It does not introduce new CLI verbs — every step it runs is an existing primitive.

## What this skill is not

- **Not a short-form cutter.** Use the `podcast-clip` template for ≤ 60s viral cuts.
- **Not a translator / dubber.** If the user wants to re-narrate the audio in another language, that is a separate `podcast-dub` workflow (different pipeline, voice cloning).
- **Not a publisher / uploader.** Output is `.ralphy/workspaces/<ws>/projects/<id>/render/final.mp4`. The user uploads it themselves.

## The workflow

```
[audio source]                  [topic gloss]
      │                              │
      ▼                              ▼
   step 1                         step 1
   pull/copy audio              (recorded in
   into project                  ralphy new
                                  prompt)
      │
      ▼
   step 2 — silence-remove pass on the VO track
      │ (ffmpeg recipe via cli/lib/ffmpeg-recipes.ts; until
      │  `ralphy audio remove-silence` ships, the skill calls
      │  the recipe lib directly through a thin tsx wrapper —
      │  see notes/ideas/007.)
      ▼
   step 3 — word-level transcript (`ralphy generate captions`)
      │
      ▼
   step 4 — audio describe (`ralphy ref audio-describe`)
      │
      ▼
   step 5 — claim segmentation + chapter detection (LLM)
      │
      ▼
   step 6 — overlay-type assignment (LLM, rule-driven prompt)
      │
      ▼
   step 7 — emit overlay-plan.json
      │
      ▼
   step 8 — asset prep (per overlay type)
      │       • screenshots → Playwright helper
      │       • memes / images → `ralphy generate image`
      │       • logos → curated set or generate
      ▼
   step 9 — music bed (`ralphy generate music`)
   step 10 — SFX set (`ralphy generate sfx` × 3)
      │
      ▼
   step 11 — emit index.html + compositions/chapter-NN.html
      │
      ▼
   step 12 — `ralphy editor preflight` && `ralphy render`
```

Each step writes to `.ralphy/workspaces/<ws>/projects/<id>/`. Re-running the skill detects existing artifacts and skips them (idempotent), matching the `researcher` resume pattern.

## Step-by-step

### Step 1 — ingest the audio

```bash
# Create the project from the topic gloss
ralphy new "long-form faceless explainer from audio about <topic>"
# → .ralphy/workspaces/<ws>/projects/<id>/

# If the source is a URL:
ralphy ref pull "<url>" --slug <ref-slug> --audio-only
cp .ralphy/references/<ref-slug>/source.mp3 \
   .ralphy/workspaces/<ws>/projects/<id>/artifacts/refs/source.mp3

# If the source is a local file:
cp /path/to/podcast.mp3 .ralphy/workspaces/<ws>/projects/<id>/artifacts/refs/source.mp3
```

### Step 2 — remove dead air

```bash
# Until `ralphy audio remove-silence` ships (see notes/ideas/007),
# the skill calls the ffmpeg recipe directly via:
bunx tsx -e 'import { removeSilence } from "./cli/lib/ffmpeg-recipes"; …'
# Threshold: -40 dBFS, min silence 0.6s.
# Output: .ralphy/workspaces/<ws>/projects/<id>/artifacts/audio/vo.mp3 (silence-removed)
#         .ralphy/workspaces/<ws>/projects/<id>/cut-map.json (original_t → trimmed_t)
```

The `cut-map.json` is informational; transcript timestamps are recomputed from the trimmed audio in step 3, not via remapping.

### Step 3 — transcribe (word-level)

```bash
ralphy generate captions \
  --audio .ralphy/workspaces/<ws>/projects/<id>/artifacts/audio/vo.mp3 \
  --out  .ralphy/workspaces/<ws>/projects/<id>/captions.json
```

Verify the output has per-word `start` / `end`. ElevenLabs Scribe v1 returns word-level for all supported languages — if the JSON is sentence-level only, surface a hard error.

### Step 4 — audio describe

```bash
ralphy ref audio-describe <ref-slug>     # if pulled from URL
# OR — if the source was a local file, run the equivalent
# `ralphy generate` LLM call over the mp3 via callLLM().
```

Read `audio-analysis.json` to set the music-bed style + emphasis-detection sensitivity.

### Step 5 — claim segmentation + chapter detection

LLM pass (default model: `anthropic/claude-sonnet-4-6` via OpenRouter — confirm against `MODELS.md`).

Prompt input: `captions.json` + `audio-analysis.json`.

Prompt instructions (skill emits them inline; do not paraphrase):
- Group words into claim blocks (2-8s each, target 4s, break on punctuation + pause > 350ms).
- Group claims into chapters (60-180s each, break on pause > 1.5s or discourse cue).
- Each chapter gets a 3-5 word name.
- Output strict JSON: `[{ chapter, chapter_name, claims: [{ start, end, vo_text }] }]`.

The full prompt template lives in `references/segmenter-prompt.md`.

### Step 6 — overlay-type assignment

Second LLM pass. Input: the segmented claims from step 5 + the topic gloss.

Prompt instructions:
- For each claim, pick exactly one overlay type from the fixed vocabulary in `templates/creator-lifestyle/podcast-explainer-longform/prompt-cookbook.md` § "Step 3 — assign overlay type".
- For each chosen type, emit the `content` shape specified in the cookbook.
- Apply rate-limits: ≤ 1 `logo-pop` per chapter unless the brand is the chapter topic. ≤ 2 `meme` per chapter. `quote-card-kinetic` reserved for punchlines (LLM-rated as high-emphasis) — ≤ 1 per chapter.
- Output: full `overlay-plan.json` matching the schema in the cookbook.

### Step 7 — emit `overlay-plan.json`

Write to `.ralphy/workspaces/<ws>/projects/<id>/overlay-plan.json`. If the file already exists, write `overlay-plan.v2.json` and show the user a diff summary. Never overwrite.

### Step 8 — asset prep

Iterate `overlay-plan.json`. For each entry:
- `code-block` / `terminal` / `tweet-card` / `quote-card-kinetic` / `chapter-card` / `diagram` → composition-time render, no asset prep needed.
- `browser-frame` → run a Playwright capture helper: `bunx tsx scripts/capture-screenshot.ts --url <url> --out artifacts/screenshots/<slug>.png`. (Helper script lives in the skill's `scripts/` folder.)
- `screenshot` / `meme` / `logo-pop` (when not in the curated set) → `ralphy generate image --project <id> --slot <id> --prompt "<content.image_prompt>"`.

Failed generations: do not retry blindly. Log the failure, mark the overlay slot with `status: "failed"`, surface the count to the user with a one-line summary at the end.

### Step 9 — music bed

```bash
# Read total duration from captions.json (last word's `end` value + 5s)
ralphy generate music --project <id> \
  --duration <total> \
  --style "lo-fi ambient electronic instrumental, 75-85 BPM, ..." \
  --instrumental \
  --out artifacts/audio/music.mp3
```

The full prompt template is in the cookbook. Style override (`lo-fi` / `ambient` / `cinematic`) comes from the user or, if absent, from `audio-analysis.json` (high-energy VO → cinematic; calm VO → lo-fi).

### Step 10 — SFX set

```bash
ralphy generate sfx --project <id> --label whoosh \
  --prompt "fast tape whoosh transition, 0.4s, dark and short"
ralphy generate sfx --project <id> --label pop \
  --prompt "soft UI pop click, 0.1s, glassy and dry"
ralphy generate sfx --project <id> --label hit \
  --prompt "deep sub-bass hit, 0.6s, cinematic punchline"
```

Three files at `artifacts/audio/whoosh.mp3` / `pop.mp3` / `hit.mp3`.

### Step 11 — compose HTML

Emit `index.html` + `compositions/chapter-NN.html` matching the skeleton in `templates/creator-lifestyle/podcast-explainer-longform/composition.md`. The skill walks the overlay plan and writes one `<div class="clip">` per overlay, inlining the per-type fallback HTML (since the registry blocks are not yet upstream — see `notes/ideas/006`).

Captions are injected as a paused GSAP timeline that `tl.set()`s the caption layer's innerHTML at each chunk boundary. Chunk boundaries are computed at compose-time from `captions.json` per the rules in the cookbook (8-15 words, break on punctuation).

### Step 12 — preflight + render

```bash
ralphy editor preflight <id>
ralphy render <id> --aspect 16:9 --loudnorm
```

Final output: `.ralphy/workspaces/<ws>/projects/<id>/render/final.mp4`. Show the user the path and the file size. Suggest `ralphy eval video <path>` for a quality gate before publishing.

## Inputs / outputs contract

**Inputs the user provides:**
1. Audio source (file path OR URL).
2. Topic gloss (one sentence).
3. Optional flags: `--aspect`, `--theme`, `--music-style`, `--opener`.

**Outputs the skill leaves on disk:**
- `.ralphy/workspaces/<ws>/projects/<id>/captions.json`
- `.ralphy/workspaces/<ws>/projects/<id>/overlay-plan.json` (the editorial decision record — preserve forever)
- `.ralphy/workspaces/<ws>/projects/<id>/artifacts/audio/{vo,music,whoosh,pop,hit}.mp3`
- `.ralphy/workspaces/<ws>/projects/<id>/artifacts/{screenshots,memes,images,logos}/*`
- `.ralphy/workspaces/<ws>/projects/<id>/index.html` + `compositions/chapter-NN.html`
- `.ralphy/workspaces/<ws>/projects/<id>/render/final.mp4`
- All generations logged to `.ralphy/workspaces/<ws>/projects/<id>/logs/generations.jsonl`.

## Handoff

When the user wants to iterate on a specific chapter or overlay choice, handback to the **editor** playbook with a pointer to the offending chapter / overlay id. The editor handles re-composition and re-render without re-running the segmentation.

If the user wants to evaluate the final mp4, route to `/evaluator`.

## References

- `templates/creator-lifestyle/podcast-explainer-longform/` — the template the skill targets.
- `references/segmenter-prompt.md` — the claim-segmentation LLM prompt.
- `references/overlay-assigner-prompt.md` — the overlay-type-assignment LLM prompt.
- `scripts/capture-screenshot.ts` — Playwright helper for `browser-frame` overlays.
- `.agents/skills/hyperframes/references/playbook.md` — composition rules, GSAP timelines, registry blocks.
- `.agents/skills/editor/SKILL.md` — render / preflight / iteration handback.
- `MODELS.md` — segmentation + planner model defaults.
- `notes/ideas/006-hyperframes-overlay-blocks.md` — upstream HyperFrames block contributions.
- `notes/ideas/007-ralphy-audio-remove-silence.md` — the missing CLI verb the skill works around for now.
