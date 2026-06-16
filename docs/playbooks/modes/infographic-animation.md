# Mode quality playbook — `infographic-animation`

> An animated infographic — data, metrics, comparisons, and callouts turned into narrated chart / overlay motion. Backing skills: [`/hyperframes`](../../../.agents/skills/hyperframes/SKILL.md) + [`/gsap`](../../../.agents/skills/gsap/SKILL.md) (the data-in-motion craft). Route: `intake → art-director → editor → ralphy render`. Authored as `<project>/index.html`, NOT a generate-video call.

## Creative objective

Make the numbers land. An animated infographic wins on **a truthful, legible data story told with paced motion** — each stat enters, holds long enough to read, and resolves into the next so the viewer follows the argument, not a fireworks show. The motion serves comprehension: a bar that grows TO its value, a counter that ticks UP to it, a comparison that reveals the gap. Every animated figure is a fact the user can defend.

## Required inputs

- Structured data OR a brief stating the stats / metrics to visualize — a CSV / table, a bullet list of metrics, a product comparison, or stats derived from a named source URL. Without concrete figures the agent asks before building (you cannot animate data you do not have).

## Reference requirements

No model-reference gate — this mode is authored in HyperFrames code, not generated from a prompt. The harder gate here is **provenance, not model-reference**: every factual claim on screen must trace to source-cited data OR user-provided data. If the brief asserts a stat without a source, ask for the source or have the user confirm the number before it goes on a frame — never invent or round a figure to make a chart cleaner. (#19 research-bootstrap auto-triggers a `quick` crawl when a source URL is given; distill the stats into `artifacts/refs/research-facts.json` and cite them.) The reference-required gate (#3) only re-enters if a baked still / logo is sourced through `ralphy generate image`.

## Prompt spine (composition discipline, not a text prompt)

This mode produces a HyperFrames composition, so the "spine" is the build pattern:
1. **One opacity-gated composition.** A multi-beat infographic is ONE composition with opacity-gated scene divs on a single paused GSAP timeline registered on `window.__timelines` — NOT `data-composition-src` sub-comps (they do not time-gate reliably). See `MEMORY.md` hyperframes-multiscene-gating.
2. **Build modular, ship one comp.** Per-beat modules (one per stat / chart) + a components module (the reusable chart / counter / callout primitives) + real `styles.css` + real `timeline.js` + a thin orchestrator — never a monolith. Output stays one opacity-gated composition. See `MEMORY.md` modular-composition-build.
3. **Chart / overlay components + fallback visuals.** Reach for the data-in-motion primitives the `/hyperframes` + `/gsap` skills supply — animated bar / column charts, line / area draws, donut / pie reveals, count-up number tickers, progress rings, comparison bars, and labelled callout / annotation overlays. When a data shape has no chart primitive (a single headline metric, a ratio, a yes/no), fall back to a **big-number counter card** or a **comparison callout** rather than forcing an ill-fitting chart. Drive every value with GSAP (e.g. tween a counter from 0 to its value, `drawSVG` a line, scale a bar to its height) so the figure is the animation.
4. **Seek-deterministic motion.** No `Date.now()` / unseeded `Math.random()` / render-time `fetch()`. CSS `@keyframes` are NOT reliably seek-captured by the renderer — drive motion via GSAP/WAAPI on the timeline.
5. **Snapshot before restructure.** `ralphy hyperframes save-version <project>` before any non-trivial `index.html` edit (`compositions/v<N>.html`, append-only).

## Model recommendations

Verify against `MODELS.md` every run.
- **Engine:** HyperFrames + GSAP (the editor playbook + [`/gsap`](../../../.agents/skills/gsap/SKILL.md)) → `ralphy render <id>`. `ralphy render` is the only render path; direct `bunx hyperframes render` is debug-only.
- **Narration (optional):** Kling `--audio` for EN; ElevenLabs for non-EN — confirm target language. When synced, derive caption / beat timing from a word-level transcript (`ralphy generate captions`), snap timing constants to `startMs` (AGENTS #16).
- **Baked stills (logo / icon):** `google/gemini-3-pro-image-preview` default; `openai/gpt-5.4-image-2` when a baked element needs crisp typography.
- **Music:** ElevenLabs Music post-mix; no artist names.

## Style / visual constraints

- One visual system (palette, type, chart styling) held across every beat; honor the brand palette exactly when supplied.
- **Truthful encoding:** bar / axis scales start at a sensible baseline (no truncated axes that exaggerate a gap); a value's visual size is proportional to its number.
- **Text density:** one idea per beat — a stat, its label, and at most a short takeaway. Do not crowd a frame with a table; split into beats and let each breathe.
- **Pacing:** each figure holds on screen long enough to read after its motion settles (a count-up plus a beat of hold, not an instant flash).
- **Accessibility:** legible type size + strong contrast on every label / number; do not encode meaning by color alone (pair color with a label / icon / position) — colorblind-safe palettes. This is also what makes the piece scroll-stop-readable on mute.
- Verify the render with ffmpeg frame-grabs, not just the snapshot (snapshot suppresses `tl.call`; captured SVGs need `xmlns`).

## Common failure modes

- **Invented / unsourced figures** → require source-cited or user-provided data; never round for prettiness.
- **`data-composition-src` sub-comps don't time-gate** → one opacity-gated composition.
- **Monolithic build script** → modular per-beat scenes / components / styles / timeline + thin orchestrator.
- **CSS `@keyframes` not captured on seek** → drive via GSAP/WAAPI.
- **Misleading encoding** (truncated axis, non-proportional bars) → honest baselines + proportional sizing.
- **Overcrowded frame** (whole table on one beat) → split into beats, one idea each.
- **Stat flashes too fast to read** → hold each figure after its motion settles.

## Evaluation criteria

`scoreVideo` gate (refuses, not warns — two fails → stop). Beyond the gate, judge on:
- **Readability** — every number / label legible at its on-screen moment, contrast + size sufficient on mute.
- **Truthfulness** — figures match the cited / provided data; encodings are honest (baselines, proportions).
- **Pacing** — each stat holds long enough to read; motion settles before the cut.
- **Text density** — one idea per beat, no crowded frames.

Distribution + accessibility tie-in: the finished Unit feeds the distribution pack ([`image-pack.md`](image-pack.md) / #423 variant tournament for any still derivatives) — keep the accessibility checks above in the eval so the piece is mute-legible and colorblind-safe before it ships.

## Does NOT apply to:

- Abstract graphic motion / logo motion where there is NO data story → use [`motion-design.md`](motion-design.md).
- Kinetic TEXT where animated type IS the visual (lyric / quote / hook) with no charts → use [`typography-animation.md`](typography-animation.md).
- A talking-head creator explaining stats to camera → match a UGC video mode ([`ugc-review.md`](ugc-review.md) / [`tutorial-ugc.md`](tutorial-ugc.md)).
- A long-form audio-driven faceless explainer built on top of an audio file → use [`podcast-video.md`](podcast-video.md).
- A static infographic still / marketplace listing slot (no motion) → match an image mode (e.g. `amazon-listing`'s infographic slot).
