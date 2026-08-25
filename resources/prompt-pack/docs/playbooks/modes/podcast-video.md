# Mode quality playbook — `podcast-video`

> A long-form audio-driven faceless video built on top of an audio file / podcast — an overlay-driven explainer (5-30 min, 16:9, no talking head). Backing skill: [`/audio-explainer`](../../../.agents/skills/audio-explainer/SKILL.md). Route: `intake → editor → ralphy render`.

## Creative objective

Keep a long-form listener watching by overlaying the right visual at the right moment. A podcast video wins on **claim-synced overlays + a clean reading rhythm**: each spoken claim gets a purposeful overlay (code-block, terminal, tweet-card, browser-frame, screenshot, meme, diagram, quote-card, chapter-card, logo-pop) that lands on the word, never a static hold. The audio is the spine; visuals punctuate it.

## Required inputs

- Audio file (mp3 / wav / m4a) or a long-form URL (> 4 min).

## Reference requirements

No model-reference gate at intake — the audio is the source. The reference-required gate applies per-overlay only when an overlay generates a named real entity / branded product through `ralphy generate image`. Screenshots are captured via the Playwright helper (real source), not invented.

## Prompt spine (pipeline discipline, not a text prompt)

The piece is orchestrated from `ralphy` primitives — the "spine" is the workflow:
1. **Pull / copy audio** into the project (long-form URL → `--audio-only`).
2. **Silence-remove** the VO track.
3. **Word-level transcript** — `ralphy generate captions` (Scribe). Every overlay + cut timing snaps to a word-level `startMs` (AGENTS #16); never hand-write timing.
4. **Audio-describe + claim segmentation** (LLM) → chapters.
5. **Overlay-type assignment** (LLM, rule-driven) → `overlay-plan.json` (append-only; regen writes `.v2`).
6. **Asset prep per overlay** — Playwright screenshots, `ralphy generate image` memes, `ralphy generate music` bed, `ralphy generate sfx` (whoosh/pop/hit).
7. **Emit `index.html` + per-chapter sub-compositions**, deterministic (no `Date.now()` / random / render-time fetch) → `ralphy render`.

## Model recommendations

Verify against `MODELS.md` every run.
- **Transcript:** ElevenLabs Scribe (`ralphy generate captions`) — word-level.
- **Claim segmentation / overlay planning:** the LLM via `callLLM`.
- **Meme / image overlays:** `google/gemini-3-pro-image-preview` default; `openai/gpt-5.4-image-2` for crisp baked text.
- **Music + SFX:** ElevenLabs Music + SFX; no artist names.
- **Render:** HyperFrames → `ralphy render <id>` (the only render path).

## Style / visual constraints

- ZERO static holds — cut / move the overlay every claim; one-static-visual-per-line reads dead on long-form (`MEMORY.md` faceless-essay-pacing).
- Caption chunks punch every 1-2s; visuals change every ~3-4.5s with constant subtle motion (slow zoom).
- 16:9 faceless; letterbox vertical b-roll into the frame rather than stretching it.
- On-disk files English even when the audio is another language (`vo_text` keeps the source language; comments / filenames / annotations English).

## Common failure modes

- **Static one-visual-per-line pacing** → cut overlays every claim, constant motion.
- **Timing from imagined word boundaries** → snap every overlay/cut to a transcript `startMs`.
- **Mutating `overlay-plan.json` in place** → append-only, regen writes `.v2`.
- **Raw `ffmpeg` / `yt-dlp` / SDK calls** → every step is a `ralphy` verb or `callLLM` (AGENTS #2).

## Evaluation criteria

`scoreVideo` gate (refuses, not warns). Beyond the gate: overlays land on the right claim and the right word, no static holds, captions match the transcript, chapter rhythm holds across the full runtime. Optional `/evaluator` post-render pass.

## Does NOT apply to:

- A short-form cut (< 4 min) from a long-form source → that is the `personal-clipper` mode ([modes/personal-clipper.md](personal-clipper.md)) / a podcast-clip template, not this mode.
- A talking-head essay where the user wants their face on screen → a talking-head video mode.
- A multi-speaker debate / interview → a split-screen interview format.
- Music videos / non-speech audio → match a music-video format.
- Re-narrating the audio in another language (dub) → a separate dub workflow.
