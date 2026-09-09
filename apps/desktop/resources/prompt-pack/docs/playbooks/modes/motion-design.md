# Mode quality playbook — `motion-design`

> An abstract / graphic motion-design piece — animated shapes, logo motion, kinetic graphics. Backing skills: [`/hyperframes`](../../../.agents/skills/hyperframes/SKILL.md) + [`/gsap`](../../../.agents/skills/gsap/SKILL.md). Route: `intake → art-director → editor → ralphy render`. Authored as `<project>/index.html`, NOT a generate-video call.

## Creative objective

Move graphics with intent, not decoration. A motion-design piece wins on **a clear visual system + purposeful, well-eased motion** that carries one message (a logo reveal, a stat, a brand mnemonic). Every animated element earns its motion — eased, staggered, and timed to a beat — so the piece reads as designed, not as a screensaver.

## Required inputs

- Concept or message (what the motion communicates).

## Reference requirements

No model-reference gate — this mode is authored in HyperFrames code, not generated from a prompt. Brand assets (logo SVG, palette) are craft inputs, not a gate. The reference-required gate is not in play unless a generated still / logo is sourced through `ralphy generate image` for a baked element (then the normal gate applies to that element).

## Prompt spine (composition discipline, not a text prompt)

This mode produces a HyperFrames composition, so the "spine" is the build pattern:
1. **One opacity-gated composition.** A multi-scene piece is ONE composition with opacity-gated scene divs on a single paused GSAP timeline registered on `window.__timelines` — NOT `data-composition-src` sub-comps (they do not time-gate reliably). See `MEMORY.md` hyperframes-multiscene-gating.
2. **Build modular, ship one comp.** For any hand-authored build-script composition: per-scene modules + a components module + real `styles.css` + real `timeline.js` + a thin orchestrator — never a monolith. Output stays one opacity-gated composition. See `MEMORY.md` modular-composition-build.
3. **Seek-deterministic motion.** No `Date.now()` / unseeded `Math.random()` / render-time `fetch()`. CSS `@keyframes` are NOT reliably seek-captured by the renderer — drive motion via GSAP/WAAPI on the timeline.
4. **Snapshot before restructure.** `ralphy hyperframes save-version <project>` before any non-trivial `index.html` edit (`compositions/v<N>.html`, append-only).

## Model recommendations

Verify against `MODELS.md` every run.
- **Engine:** HyperFrames + GSAP (the editor playbook + [`/gsap`](../../../.agents/skills/gsap/SKILL.md)) → `ralphy render <id>`. `ralphy render` is the only render path; direct `bunx hyperframes render` is debug-only.
- **Baked stills (logo / texture):** `google/gemini-3-pro-image-preview` default; `openai/gpt-5.4-image-2` when a baked element needs crisp typography.
- **Music:** ElevenLabs Music post-mix; no artist names.

## Style / visual constraints

- One visual system (palette, type, shape language) held across the piece.
- Eased + staggered motion — no linear tweens, no everything-at-once.
- Honor the brand palette / logo geometry exactly when supplied.
- Verify the render with ffmpeg frame-grabs, not just the snapshot (snapshot suppresses `tl.call`; captured SVGs need `xmlns`).

## Common failure modes

- **`data-composition-src` sub-comps don't time-gate** → one opacity-gated composition.
- **Monolithic build script** → modular scenes/components/styles/timeline + thin orchestrator.
- **CSS `@keyframes` not captured on seek** → drive via GSAP/WAAPI.
- **Non-deterministic composition** (`Date.now()` / random / fetch) → seedless, render-safe only.

## Evaluation criteria

`scoreVideo` gate (refuses, not warns — two fails → stop). Beyond the gate: motion is purposeful and well-eased, the visual system holds, timing reads to a beat, the render is deterministic (frame-grab verified), brand assets honored.

## Does NOT apply to:

- Kinetic TEXT where animated type IS the visual → use [`typography-animation.md`](typography-animation.md).
- A character-driven cartoon animation → use [`cartoon-animation.md`](cartoon-animation.md).
- A photoreal live-action / generated video → match a video mode.
- A static graphic / poster → match an image mode.
