# Comic Spider-Verse Action

> 27-second 16:9 painterly action scene in a comic-panel split + halftone dot bleed + ink-stroke caption aesthetic. Two stylized characters mid-action over an urban backdrop, rendered as 2 stitched seedance-2.0 t2v clips with diegetic-only audio, then mixed with a post-render ElevenLabs music bed under sidechain duck. Spider-Verse / Arcane painterly grammar, no copyrighted reference frames bundled.

## Use this template when

- You want a **painterly action scene** with named-trick physics (kickflip, ollie, parkour vault, surf cutback, martial-arts roundhouse, etc.) and seedance-2.0's motion fidelity.
- You want a **two-character duel / chase / line** where contrasting silhouettes carry the visual differentiation.
- The deliverable is **16:9 landscape** (YT Shorts landscape / TikTok wide / Reels / X video).
- You want **comic-panel impact text** painted INTO the frames (KRRRACK / SLAM / FWIP / WHOOSH), not as a separate kinetic-typography overlay.
- You want **post-render music with sidechain duck**, not music baked into the seedance clip.
- You're OK with **no voiceover lane** — this format is diegetic SFX + post-mix music only.

## Don't use this template when

- You need a **photoreal human face** with consistent identity across shots — go to `creator-lifestyle` templates with kling-v3.0-pro + a locked reference photo.
- You need a **9:16 vertical TikTok** as the primary deliverable — this is 16:9. (You can re-edit the 16:9 cut into a 9:16 with a meme-header treatment as a secondary deliverable; see `feedback_meme_header_tiktok_format` in user memory.)
- You need **dialogue / voiceover** as the narrative spine — author with `creator-lifestyle` (2-hander) or a scenarist-led format instead.
- The action is **default UGC selfie motion** (talking head, light gesture, walk-and-talk) — use kling-v3.0-pro and a UGC-creator-lifestyle template.

## How to use

```bash
ralphy template use comic-spiderverse-action \
  --project <new-project-id> \
  --brief "<one-line brief: action subject + archetype + location + caption words + music style>"
```

This scaffolds `workspace/projects/<new-project-id>/` and writes `TEMPLATE_ORIGIN.md` pointing the next agent at this template's `TEMPLATE.md` + `prompt-cookbook.md`. The next agent fills the slots from the brief, then runs the pipeline.

Slots to fill: `{{action_subject}}`, `{{action_archetype}}`, `{{urban_location}}`, `{{character_a}}`, `{{character_b}}`, `{{caption_style_words}}` (optional), `{{scene_continuity_anchor}}`, `{{music_style_keywords}}`, `{{target_language}}` (optional). Full reference in `TEMPLATE.md` § Required inputs.

## What this template ships

```
templates/cinematic-narrative/comic-spiderverse-action/
├── template.json          — metadata + slot map + stack summary
├── TEMPLATE.md            — vibe + key rules + workflow + anti-patterns
├── prompt-cookbook.md     — verbatim image / video / music prompts with slots
├── model-stack.md         — model picks per stage + costs + what worked / dropped
├── hooks.md               — 0–2s comic-panel zoom-in + ink-stroke title patterns
├── examples.md            — 2 worked variants (skater duel + parkour chase)
├── README.md              — this file
└── assets/                — empty (no copyrighted reference frames bundled)
```

## Cost ballpark

| Configuration | Cost |
|---|---|
| Video-only, 1 music bed | **~$4.20** |
| Video-only, 3 music bed variants (A/B/C) | ~$4.20 (variants are free on subscription) |
| With optional VS character-card marketing poster | ~$4.35 |

Source project actual: **$6.65** (included one unused $2.10 standalone duel clip + $0.35 poster iteration). 1.5× minimum-viable: **$6.30**. Following the template rules brings it down to **$4.20–$4.55**.

## Stack at a glance

| Stage | Model | Cost |
|---|---|---|
| Image — VS poster (OPTIONAL) | `google/gemini-3-pro-image-preview` via OpenRouter | $0.15 |
| Video — both clips | `bytedance/seedance-2.0` via OpenRouter (15s @ 1080p 16:9 --audio) | $2.10 per clip |
| Music | `elevenlabs/music_v1` (post-render) | $0 (subscription) |
| Mix | `ffmpeg` via `ralphy video concat` + `ralphy video add-music --duck` | $0 |

## Reference example

The canonical "what this template produces" pointer:

- **Source project:** `workspace/projects/skater-spiderverse-001/`
- **Final render:** `workspace/projects/skater-spiderverse-001/render/skater-cut-v4-thps-ducked.mp4` (27.06s, 31MB, THPS skate-punk + boom-bap, sidechain-ducked mix)
- **Style:** Two skaters duel in a downtown LA bowl at golden hour, exit onto the open street, painterly Spider-Verse / Arcane register, diegetic SFX + post-mix music with sidechain duck.

The render is NOT bundled into this template — pull from the source project or watch in `workspace/projects/skater-spiderverse-001/render/`.

## Anti-patterns at a glance

(Full list in `TEMPLATE.md`.)

- DO NOT use kling-v3.0-pro for kickflip / parkour / non-default-physics action — kling is selfie-tuned.
- DO NOT use i2v with a photoreal-human anchor on seedance — privacy filter blocks even AI-generated anchors.
- DO NOT name modern recording artists in music prompts — ElevenLabs Music ToS rejects current rappers.
- DO NOT skip the AUDIO POLICY block in seedance prompts — without it the model invents music that doubles up with the post-mix.
- DO NOT use flat amix when SFX + music coexist — use `--duck` with threshold 0.04 ratio 6 for musical breathing.
- DO NOT generate a VS marketing poster if the deliverable is video-only — saves $0.35 + 4 min.
- DO NOT try to seedance last_frame → first_frame for continuity — hand-engineer it in prompt text instead.

## Reference frames + copyright

This template references the **Spider-Verse / Arcane painterly aesthetic by name** in prompts, but does NOT bundle copyrighted frames from Across the Spider-Verse, Spider-Man: Into the Spider-Verse, or Arcane (Netflix). The painterly STYLE block in `prompt-cookbook.md` is purely textual ("large summarized flat color blocks, hard-edge brush strokes, painterly gouache texture, chunky variable-weight ink linework, halftone dot patterns, chromatic-aberration RGB offset"). Consumers who want richer moodboards should run `ralphy ref analyze-video <slug>` on their own reference URLs (gemini-3.1-pro on full mp4) to extract style descriptors — never commit copyrighted frames into a project's `refs/`.

The only reference asset in the source project's `refs/` was a user-supplied screenshot of a fighting-game VS character-select layout (`template-vs-layout.png`) used to anchor the optional marketing poster. That asset is NOT bundled here — it is layout-only, and consumers should supply their own fighting-game / lookbook reference if they want the marketing poster variant.

## Origin

Crystallized from `workspace/projects/skater-spiderverse-001/` (3.5h session, 2026-05-18). Lessons distilled from `postmortem/02-lessons.md` + `postmortem/04-models-and-cost.md` + `postmortem/05-workflow-fixes.md`. Final render: `skater-cut-v4-thps-ducked.mp4`.
