# Mode quality playbook — `typography-animation`

> A kinetic-typography piece where animated text IS the visual — lyric / quote / hook animation. Backing skills: [`/hyperframes`](../../../.agents/skills/hyperframes/SKILL.md) + [`/gsap`](../../../.agents/skills/gsap/SKILL.md) + [`/waapi`](../../../.agents/skills/waapi/SKILL.md). Route: `intake → art-director → editor → ralphy render`. Authored as `<project>/index.html`.

## Creative objective

Make the words perform. Kinetic typography wins on **legibility through motion + rhythm locked to audio**. The text is the whole frame, so every word must be readable at its moment on screen, and the cuts / emphasis must hit the beat or the VO syllable. The viewer reads with their ears as much as their eyes — pacing is the craft.

## Required inputs

- The text / copy to animate.

## Reference requirements

No model-reference gate — authored in HyperFrames code, not generated from a prompt. If the piece syncs to a VO or music track, that audio is a craft input (drive timing off its word boundaries, see below). The reference-required gate is not in play unless a baked still is sourced through `ralphy generate image`.

## Prompt spine (composition discipline, not a text prompt)

1. **Sync to real word boundaries.** When the piece is aligned to a VO, derive timing from a word-level transcript — run `ralphy generate captions` on the VO and snap every timing constant to a word-level `startMs`. Never hand-write timing from imagined word boundaries (AGENTS #16).
2. **One opacity-gated composition** on a single paused GSAP timeline (`window.__timelines`); per-word / per-line reveals via GSAP SplitText or WAAPI per-char timelines.
3. **Embed the font as woff2 under a NON-Google family name.** JS-injected caption text is invisible to the HyperFrames font subsetter → it ships an empty subset → silent Courier fallback. Embed the full woff2 base64 `@font-face` under a custom family name (e.g. `PixCRT`). See `MEMORY.md` hyperframes-js-caption-font.
4. **Seek-deterministic.** No `Date.now()` / unseeded random / render-time fetch; CSS `@keyframes` are not reliably seek-captured — drive via GSAP/WAAPI.
5. **Snapshot before restructure** (`ralphy hyperframes save-version <project>`).

## Model recommendations

Verify against `MODELS.md` every run.
- **Engine:** HyperFrames + GSAP SplitText / WAAPI per-char timelines → `ralphy render <id>` (the only render path).
- **VO (when synced):** Kling `--audio` for EN; ElevenLabs for non-EN — confirm target language.
- **Music:** ElevenLabs Music post-mix; no artist names.

## Style / visual constraints

- Each word legible at its on-screen moment — weight, size, contrast tuned for motion.
- One type system; emphasis (scale / color / weight) reserved for the words that carry meaning.
- Rhythm locked to the audio beat / syllable, not to round numbers.
- Verify with ffmpeg frame-grabs (font fallback + chromatic flicker are invisible in the snapshot).

## Common failure modes

- **Timing from imagined word boundaries** → captions/scribe the VO, snap to `startMs`.
- **Empty font subset → silent Courier fallback** → embed full woff2 under a non-Google family name.
- **CSS `@keyframes` not captured on seek** → drive via GSAP/WAAPI.
- **Everything emphasized** → reserve emphasis for the meaning-carrying words.

## Evaluation criteria

`scoreVideo` gate (refuses, not warns). Beyond the gate: every word readable at its moment, cuts hit the beat / syllable, the intended font actually renders (frame-grab verified), one coherent type system.

## Does NOT apply to:

- Abstract graphic motion / logo motion where text is secondary → use [`motion-design.md`](motion-design.md).
- A character-driven cartoon animation → use [`cartoon-animation.md`](cartoon-animation.md).
- A meme-header / baked-caption still or video where text is static → match the matching image/video mode.
- A photoreal live-action video → match a video mode.
