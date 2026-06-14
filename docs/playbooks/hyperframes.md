# HyperFrames playbook

**Read this when:** writing or modifying HyperFrames code — compositions, GSAP animation timelines, captions, transitions, audio mixing, registry blocks. This is the *primary* composer + renderer reference for new Ralphy projects.

HyperFrames is the render engine. Compositions are plain HTML files with `data-*` timing attributes, animated by a paused GSAP timeline the runtime seeks deterministically, rendered to MP4 via Puppeteer + FFmpeg. No React, no bundler, no JSX.

## Source of truth

The full HyperFrames domain knowledge lives in the **`.agents/skills/hyperframes/*`** skill bodies, installed via `bunx hyperframes skills`. Read those first when you need API specifics:

| Skill | When to read |
|---|---|
| `hyperframes` | Composition authoring, scene structure, layout-before-animation rule, prompt expansion. **Start here.** |
| `hyperframes-cli` | CLI verbs (`init`, `lint`, `inspect`, `preview`, `render`, `doctor`). |
| `hyperframes-media` | TTS (Kokoro), transcription (Whisper), background removal (u2net). |
| `hyperframes-registry` | `hyperframes add <block>` — install caption styles, VFX blocks, transitions. |
| `gsap` | `gsap.timeline({ paused: true })`, `tl.to/from/fromTo`, position parameter, eases, stagger. |
| `css-animations` | CSS-keyframe motion that the runtime seeks. |
| `lottie` | Embed `.lottie` / lottie-web JSON; register on `window.__hfLottie`. |
| `animejs` | Anime.js timelines registered on `window.__hfAnime`. |
| `three` / `typegpu` / `waapi` | Three.js scenes, raw WebGPU, Web Animations API — all deterministic. |
| `tailwind` | Tailwind v4 browser-runtime usage inside compositions. |
| `website-to-hyperframes` | URL → captured composition. |
| `contribute-catalog` | Ship a new registry block upstream. |

## First reads — top-5 high-leverage files

The skill table above lists *where* knowledge lives. These five files are *what* to read before authoring any composition more ambitious than a title card. Most quality regressions come from skipping these — not from missing API knowledge.

| # | File | What it gives you |
|---|---|---|
| 1 | [`.agents/skills/hyperframes/references/motion-principles.md`](../../.agents/skills/hyperframes/references/motion-principles.md) | Easing emotion (`.out` enter, `.in` exit, `.inOut` between positions), direction rules, "speed = weight", scene structure (build / breathe / resolve). Prevents 80% of amateurish motion. |
| 2 | [`.agents/skills/hyperframes/references/beat-direction.md`](../../.agents/skills/hyperframes/references/beat-direction.md) | Per-beat concept + mood direction + animation verbs (**SLAMS / CASCADE / FLOATS / DRIFTS**). Rule: if you can't name the motion with a verb, it isn't designed. |
| 3 | [`.agents/skills/hyperframes/references/video-composition.md`](../../.agents/skills/hyperframes/references/video-composition.md) | Density (**8–10 visible elements per scene** — background texture + midground content + foreground accents), color presence (15–25%), scale (web sizes invisible on video — pump up). Prevents empty frames. |
| 4 | [`.agents/skills/hyperframes/references/dynamic-techniques.md`](../../.agents/skills/hyperframes/references/dynamic-techniques.md) | Caption-animation energy table (high → karaoke + glow + scale-pop; low → karaoke + warm + slow). **Audio-reactive captions are mandatory for any music-driven scene** — non-negotiable. |
| 5 | [`.agents/skills/hyperframes/references/transitions.md`](../../.agents/skills/hyperframes/references/transitions.md) + [`transitions/catalog.md`](../../.agents/skills/hyperframes/references/transitions/catalog.md) | Energy → transition mapping (calm: blur, medium: push, high: zoom-through). 14 CSS-class categories (dissolve / light / push / cover / blur / 3D / mechanical / scale / distortion / destruction / radial / grid / other). One primary transition for 60–70% of scenes + 1–2 accents. |

**Honorable mentions** — read on demand:
- [`hyperframes/references/typography.md`](../../.agents/skills/hyperframes/references/typography.md) — banned fonts (Inter / Poppins / Syne), weight-contrast rules (300 vs 900), display sizes ≥60px, body ≥20px on video.
- [`hyperframes/references/prompt-expansion.md`](../../.agents/skills/hyperframes/references/prompt-expansion.md) — the single quality multiplier: enrich user-seed into per-beat production spec (atmosphere layers, secondary motion, transition choreography). **Never pass-through, always enrich.**
- [`hyperframes/references/captions.md`](../../.agents/skills/hyperframes/references/captions.md) — language rule (never `.en` unless target IS English; use `--language <code>`), style detection (corporate / energetic / storytelling / technical / social).
- [`hyperframes/references/audio-reactive.md`](../../.agents/skills/hyperframes/references/audio-reactive.md) — bands-array mapping (bass → scale pulse, treble → glow). Rule: **content drives vocabulary, audio drives intensity** — no generic equalizer bars.
- [`hyperframes/house-style.md`](../../.agents/skills/hyperframes/house-style.md) — defaults to *question* (gradient text, neon, centered), background-layer requirements (2–5 decoratives), contrast enforcement.
- [`hyperframes/palettes/`](../../.agents/skills/hyperframes/palettes/) — 9 ready palettes (pastel-soft / neon-electric / warm-editorial / jewel-rich / clean-corporate / dark-premium / bold-energetic / nature-earth / monochrome).

## Project shape

A Ralphy workspace project that renders via HyperFrames has at least:

```
.ralphy/workspaces/<ws>/projects/<id>/
├── index.html                ← root composition (REQUIRED — this is what `ralphy render` looks for)
├── design.md                 ← brand/style source-of-truth (colors, fonts, mood, ratios)
├── meta.json                 ← optional HyperFrames project metadata
├── compositions/             ← optional sub-compositions loaded via data-composition-src
├── artifacts/                ← media by kind: images/ videos/ voiceover/ music/ sfx/ captions/ fonts/ refs/ (referenced from index.html)
├── render/                   ← final.mp4 lands here
└── logs/                     ← generations.jsonl, user-prompts.jsonl (ralphy convention)
```

`index.html` minimum:

```html
<div id="root" data-composition-id="<id>"
     data-width="1920" data-height="1080">
  <div class="clip" data-start="0" data-duration="5" data-track-index="0">
    <h1 id="title">Your title</h1>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.from("#title", { opacity: 0, y: 40, duration: 1 }, 0);
    window.__timelines = window.__timelines || {};
    window.__timelines["<id>"] = tl;
  </script>
</div>
```

**Hard invariants (from the skill bodies + upstream `AGENTS.md` — keep these in mind, never relax):**
- Timelines MUST be created `{ paused: true }`. The runtime drives playback.
- Use the GSAP position parameter (3rd arg) for absolute timing.
- Layout-before-animation: position elements at their hero frame in CSS, then `gsap.from()` to ease them in.
- The `.scene-content` container fills the scene with `width: 100%; height: 100%; padding: Npx; box-sizing: border-box`. NEVER use `position: absolute; top: Npx` on a content container.
- `data-composition-id`, `data-width`, `data-height` are required on the root. `data-start="0"` on the root too — the runtime needs it to begin playback.
- **Determinism.** No `Date.now()`, no unseeded `Math.random()`, no render-time `fetch()` / network calls. Same input → identical output, every time. If you need randomness, seed it.
- **Synchronous timeline construction.** No `async` / `await` while building the timeline. The seeker needs the full timeline graph after the script tag runs.
- **No manual media playback.** `video.play()`, `video.pause()`, `audio.currentTime = …` are forbidden — the runtime owns media sync via `data-start` / `data-media-start` / `data-volume`. Use GSAP only for visual properties (opacity, transform, color, filter).
- **Composition duration = timeline duration.** If your last animation ends at 8s but the video file is 22s, the composition cuts off at 8s. Extend with `tl.set({}, {}, 22)` to match.

## Hard kills — silent quality killers

These break the render *without erroring loudly*. Each one is a real footgun the upstream `common-mistakes.mdx` calls out — lint won't catch most of them.

| # | Mistake | What happens | Fix |
|---|---|---|---|
| 1 | Animating `width / height / top / left` on a `<video>` element | The framework **stops rendering frames** mid-clip | Wrap the video in a non-timed `<div>` and animate the wrapper. Let the video fill 100% via CSS. |
| 2 | Calling `video.play()`, `video.pause()`, or `audio.currentTime` in scripts | Runtime sync desyncs; audio drifts; video may freeze | Set `data-start`, `data-media-start`, `data-volume` and let the framework own playback. GSAP only for visual properties. |
| 3 | Composition shorter than the source video | Video cuts off when the timeline ends | Verify with `bunx hyperframes compositions`. Extend with `tl.set({}, {}, DURATION)` (no animation, just timeline length). |
| 4 | Missing `class="clip"` on timed elements | Elements render *always* (never hide) | Lint catches this — run `bunx hyperframes lint` before preview. Every element with `data-start` / `data-duration` needs `class="clip"`. |
| 5 | `window.__timelines["key"]` doesn't match `data-composition-id` | Animations silently never play; static frames render | The key on the timeline registration MUST be byte-equal to the root's `data-composition-id`. Case- and whitespace-sensitive. |
| 6 | Oversized source images (e.g. 7000×5000 JPEG) | Chrome decodes to RGBA (`w × h × 4` bytes) — a 2 MB JPEG balloons to ~140 MB RAM and renders crash on OOM | Resize sources to **≤ 2× canvas dimensions** (for 1920×1080, max 3840×2160). Use `sharp` / `ffmpeg -vf scale` before `artifacts/`. |
| 7 | Heavy `backdrop-filter: blur()` stacks | Compositor cost compounds per layer; render slows to a crawl or fails | Cap at 2–3 layers per region, radius ≤ 64px over large areas. For static blur, pre-render to a PNG and use it as a regular `<img>`. |
| 8 | `<video>` timed via a wrapper `<div>` (`data-start` / `data-track-index` on the wrapper, not on the `<video>`) — #047 | Capture engine reads timing from the media element directly; wrapper attrs are invisible. Silent freeze + only-first-frame at render. | `id` + `data-start` + `data-track-index` + `data-duration` go on the `<video>` itself. Use a non-timed wrapper for layout only. Enforced by `ralphy render`'s pre-render lint (`cli/lib/render/hyperframes-lint.ts`) — blocks before upstream render. |
| 9 | Many short (`< 3s`) same-track `<video>` clips back-to-back (e.g. 6×2s on `data-track-index=0`) — #047 | Runtime cannot reliably switch between same-track video sources during capture. Typically only the first plays; the rest render as static frames. No upstream lint catches it. | Concat the clips into a single video with `ffmpeg -f concat -i list.txt -c copy out.mp4` and reference it with one `<video>`. Or put each clip on its own `data-track-index`. Override (with caution): `data-allow-short-stack="true"` on any of the affected `<video>` tags. Warned at author time by `ralphy render`'s pre-render lint. |
| 10 | Multi-scene video built as a root that mounts per-scene files via `data-composition-src` + per-scene `data-composition-id` hosts | In runtime `0.6.31` those src-mounted sub-compositions are **not time-gated** — every scene renders simultaneously stacked from t=0, regardless of `class="clip"` or host `data-start`. (A trivial 2-comp test gates fine; complex scenes do not.) | Build it as ONE standalone `index.html`, all scenes inlined as full-frame `<div class="scene clip" data-scene="beat-N" data-start data-duration>`, ONE master timeline on `window.__timelines["root"]`. Gate each scene explicitly with opacity: CSS `#s2..#sN{opacity:0}` + `.scene{isolation:isolate}` (stops per-scene `z-index` leaking), then `tl.set(scene,{opacity:1},start); tl.set(scene,{opacity:0},end)` so exactly one scene is visible at a time (opacity is the reliable gate — the runtime's own `visibility:hidden` is bypassed by children with `will-change`/`filter` composited layers). Scope selectors per scene by **string concat, not template literals** (`` `${}` `` in querySelector crashes the bundler CSS parser → `template_literal_selector` lint error). |
| 11 | Caption / title text injected at runtime via JS (`el.textContent = …`) instead of static HTML | The HF font subsetter never sees those glyphs and ships a near-empty woff2 subset for the named Google font → the text silently renders in the Courier fallback ("the font didn't load", monospace instead of the intended pixel/CRT font). A hidden static charset `<div>` and clearing the font cache do NOT fix it. | Embed the full font directly, bypassing the subsetter — base64 the full woff2 and inject `@font-face{font-family:'PixCRT';src:url(data:font/woff2;base64,…) format('woff2')}` into the comp `<style>`, switch the caption `font-family` to it. **Use a NON-Google family name** (e.g. `PixCRT`, not `VT323`) so HF leaves the inline `@font-face` untouched instead of re-fetching/subsetting it. Adds ~24k of base64; renders deterministically. |
| 12 | Flicker / noise / grain motion authored as CSS `@keyframes` / `animation` | CSS animations are **not seek-deterministic** in the HF renderer (the harness seeks the paused GSAP timeline frame-by-frame); a CSS animation freezes at frame 0 and never appears in the mp4. | Drive every animated property through the GSAP timeline — `tl.set`/`tl.to` keyed across time (e.g. step a `--shadow` var or `backgroundPosition` every ~2 frames for grain churn). Seed any randomness with a deterministic LCG, not `Math.random`. Exception: motion routed through the `css-animations` HF adapter IS captured. |

When in doubt, run before sharing logs:
```bash
bunx hyperframes lint <project>      # static: missing attributes, timeline registration, tween conflicts
bunx hyperframes inspect <project>   # headless Chrome: text overflow, canvas clipping
bunx hyperframes validate <project>  # runtime: JS errors, missing assets, network failures
bunx hyperframes snapshot <project>  # frame capture at beat midpoints
```

`lint` before `preview`. `validate` + `snapshot` before `ralphy render`.

## Authoring discipline — modular source, single gated output

For any HyperFrames composition driven by a **build script** (the faceless-essay
/ guide-deck kits, anything more than a one-shot card), author the source
**modular from the start** — never a monolithic `build-index.mjs`:

- `build-index.mjs` = thin orchestrator (import components + plan → assemble → write).
- `build/components.mjs` = shared form builders, motifs, caption engine.
- `build/styles.css` = a REAL `.css` file (bake any dynamic value so there is no template literal).
- `build/timeline.js` = a REAL `.js` file for the GSAP timeline (reads injected `window.__HF_DATA`).
- `build/scenes/sNN.mjs` = ONE file per scene.

**Why:** a monolith scatters each scene's markup / CSS / motion / dispatch across
4 places, and putting GSAP inside a template literal forces double-escaping
(`\\w`, backticks, `${}`) that silently breaks animations. After the split,
editing a scene is one file and motion code needs no escaping. The user's
standing rule for build-script comps is: always author modular.

Does **NOT** change the OUTPUT: the rendered artifact stays ONE composition with
opacity-gated scene divs (hard-kill #10) — the split is SOURCE-only. Trivial
single-scene comps (a poster, a ship-style card, a short PSA) are genuinely
clearer as one small file; this is about build-script comps specifically. Note
`bunx hyperframes snapshot` is unreliable on grain/glitch-heavy comps in 0.6.31
(CDN GSAP not loaded in time) — QA those via `ralphy render` + `ffmpeg -ss`
frame-grabs instead of snapshot.

## CLI cookbook

```bash
# Render the project
ralphy render <project-id>
ralphy render <project-id> --fps 60 --quality high     # bump quality
ralphy render <project-id> --resolution portrait        # 1080×1920 portrait via DPR
ralphy render <project-id> --loudnorm                   # +EBU R128 -16 LUFS post-pass

# Iterate
bunx hyperframes preview .ralphy/workspaces/<ws>/projects/<id>        # live-reload browser preview (foreground)
bunx hyperframes lint     .ralphy/workspaces/<ws>/projects/<id>       # validate composition shape
bunx hyperframes inspect  .ralphy/workspaces/<ws>/projects/<id>       # visual layout across the timeline
bunx hyperframes snapshot .ralphy/workspaces/<ws>/projects/<id>       # keyframe PNGs for QA
bunx hyperframes doctor                                 # env check (node, ffmpeg, chrome)

# Install registry blocks (catalog has 70+ items — see Catalog section below)
bunx hyperframes add <block-slug> .ralphy/workspaces/<ws>/projects/<id>

# Asset preprocessing
bunx hyperframes tts        --text "..."  -o artifacts/voiceover/vo.wav
bunx hyperframes transcribe --in vo.wav   -o captions.json
bunx hyperframes remove-background --in shot.mp4 -o shot-alpha.webm
```

> **STOP rule.** Final render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. Direct `bunx hyperframes preview / lint / inspect / snapshot` is fine for iteration; direct `hyperframes render` outside debugging defeats the gen-log. AGENTS invariant #2.

## Vocabulary mapping — user intent → composition decisions

When the user (or the scenarist playbook upstream) hands you natural-language brief words, translate them through these tables. They come straight from the maintainers' `prompting.mdx` and operationalize "match feel to technique."

### Motion feel → GSAP easing

| User word | GSAP ease | When to use |
|---|---|---|
| smooth | `power2.out`, `power3.out` | Editorial reveals, Apple-keynote calm |
| snappy | `power4.out`, `expo.out` | Decisive entrances, tech-broadcast |
| bouncy | `back.out(1.7)` to `back.out(2.5)` | Playful, character-driven (e.g. mascot) |
| springy | `elastic.out(1, 0.3)` | Toy / sticker / pop-culture (use sparingly) |
| dramatic | `expo.out`, `power4.inOut` | Big slams, headline reveals |
| dreamy | `sine.inOut`, `power1.inOut` | Slow, symmetrical, hypnotic |

Rules: `.out` on **entrances**, `.in` on **exits**, `.inOut` on **between-positions** (translate / scale a thing that already exists). Speed = weight: short duration = light, long = heavy. Vary speeds per beat — back-to-back identical timings read as a single block.

### Caption tone → typography + animation stack

| Tone | Type stack | Animation | Size |
|---|---|---|---|
| hype | Heavy display (700–900) | Scale-pop + glow + slight rotation | 72–96px |
| corporate | Clean sans (400–600) | Fade-slide (8–16px translate) | 56–72px |
| tutorial | Monospace (400) | Typewriter (`steps(N)` over `width`) | 48–64px |
| storytelling | Editorial serif or warm sans | Soft fade + character delay | 56–80px |
| social | Bold + accent color + emoji-friendly | Karaoke (per-word highlight) + bounce | 64–88px |

**Karaoke baseline.** Per-word highlight is the default for any spoken-content video. Add intensity (glow / scale-pop) for high-energy beats; strip back to plain karaoke for low-energy.

### Energy level → transition primary

| Energy | Primary transition | Class category |
|---|---|---|
| Calm (slow editorial, dreamy) | Blur crossfade, focus pull | `css-blur`, `css-light` |
| Medium (default, presentation, B2B) | Push slide, soft scale | `css-push`, `css-scale` |
| High (broadcast, viral, tech-launch) | Zoom-through, overexposure, glitch | `css-3d`, `css-destruction`, `css-distortion` |

Pick **one primary transition for 60–70% of scene cuts**, then 1–2 accent transitions for emphasis (climax, scene-type changes). All 14 categories live under `.agents/skills/hyperframes/references/transitions/css-*.md`.

### Mood → transition flavor

| Mood | Use | Don't use |
|---|---|---|
| warm | Light leak, focus pull | Squeeze, grid, glitch |
| cold / clinical | Squeeze, grid push | Light leak, elastic |
| tech / cyber | Grid, glitch, RGB-split | Editorial dissolve, sine pulse |
| playful | Elastic, 3D flip, bouncy scale | Hard cut, sharp distortion |

### TTS voice → content type (Kokoro via `hyperframes-media`)

| Content | Recommended voices |
|---|---|
| Product demo | `af_heart`, `af_nova` (warm female) |
| Tutorial / how-to | `am_adam`, `bf_emma` (clear, calm) |
| Marketing / brand promo | `af_sky`, `am_michael` (confident, polished) |
| Documentation / VO | `am_eric`, `bf_alice` (neutral, broadcast) |

Always confirm target-audience language before defaulting to English ([[feedback_kling_no_ru_audio]] applies to TTS too — accent slip is real on non-English voices).

## Catalog — `bunx hyperframes add`

70+ pre-built blocks and components ship in the upstream registry. Reach for these *before* hand-rolling an effect. Discoverable via `.agents/skills/hyperframes-registry/SKILL.md` + the live catalog at https://hyperframes.heygen.com/catalog/.

Coarse taxonomy (read the SKILL.md body for exact slugs):

| Category | Examples | Use for |
|---|---|---|
| **Caption styles** (10+) | `kinetic-slam`, `matrix-decode`, `neon-accent`, `karaoke-warm` | Drop-in word-by-word reveal effects with audio-reactive variants |
| **Shader transitions** | `glitch`, `light-leak`, `thermal-distortion`, `chromatic-tear` | Inter-scene transitions that look genuinely VFX-grade |
| **VFX blocks** | `liquid-background`, `portal`, `shatter`, `vfx-iphone-device` | Hero-shot showpiece effects (GLTF, particles, WebGL shaders) |
| **Geo viz** | `us-map`, `world-map`, `spain-map` | Animated regional / global data viz |
| **Interactive UI mocks** | `apple-money-count`, `instagram-follow`, `spotify-now-playing` | Animated platform-UI screen captures without recording a real screen |
| **Overlays** | `grain-texture`, `grid-pixelate-wipe`, `shimmer-sweep`, `vignette-darken` | Atmospheric polish layer over any scene |

```bash
# Discover
bunx hyperframes catalog                         # browse the registry
# Install one into your project
bunx hyperframes add kinetic-slam .ralphy/workspaces/<ws>/projects/<id>
# Wire it into index.html (the skill walks you through it)
```

Asset preprocessing chains naturally with these — `bunx hyperframes tts` → `bunx hyperframes transcribe` → `add karaoke-warm` gives you a captioned-VO scene in three commands.

## Cold-start vs warm-start prompts

The maintainers identify two prompt structures (`prompting.mdx`). Use them as the contract between scenarist and editor playbooks.

**Cold-start** — describe from scratch. The brief must specify:
- Duration (`22s`, not "about 20s")
- Aspect ratio (`1920×1080`, `1080×1920`, `1080×1080`)
- Mood / style (1–2 named adjectives — pick from `.agents/skills/hyperframes/visual-styles.md`)
- Key elements (which logos / products / data / characters must appear)

Example: *"22s, 1920×1080, tech-broadcast slam, brand pink #E87BA1, AWS Diatype Mono + Fragment Mono, ghost mascot lockup at the end."*

**Warm-start** — transform existing source. Hand the agent a URL, transcript, document, or reference video. Output is **richer and more grounded** because the agent has something specific to write about. For URL drops use the `website-to-hyperframes` skill (7-step capture → design → script → storyboard → vo → build → validate flow).

**Iteration discipline.** After the first render, prefer *targeted edits* over re-prompts:
- ✅ "Make the beat-3 cards 20% bigger and ease them in `back.out(2)` instead of `power3.out`."
- ❌ "Make it better."
- ✅ "Replace the crossfade between beat 4 and beat 5 with a `glitch` shader from the catalog."
- ❌ "Try a different transition."

## What I read on start

- **`AGENTS.md`** — invariants (no auto-Studio, ralphy render, no ad-hoc ffmpeg).
- **`.agents/skills/hyperframes/SKILL.md`** — composition rules, layout-before-animation, design.md gate.
- **`.agents/skills/gsap/SKILL.md`** — timeline grammar.
- **`.ralphy/workspaces/<ws>/projects/<id>/design.md`** — brand/style source-of-truth (if absent, ask the user before writing CSS).
- **`.ralphy/workspaces/<ws>/projects/<id>/scenario.json`** — beat structure, timings.
- **`.ralphy/workspaces/<ws>/projects/<id>/asset-manifest.json`** — asset paths.
- **`docs/green-zone.md`** — text positioning safe zone for 1080×1920.

## Pixels vs code — motion-graphics decision tree

Code-composited motion belongs in the HTML composition, not in `ralphy generate video`. The route table:

| Pattern | Route | Why |
|---|---|---|
| Live-action scene (person, room, action, weather, gameplay) | `ralphy generate video` (i2v / t2v) | Model produces pixels code can't fake |
| Photoreal still + parallax | `ralphy generate image` + GSAP `tl.to(img, { scale, x, y })` | Image is the asset; motion is the composition |
| Animated text / kinetic typography | HyperFrames component + GSAP tween | Code controls timing + exact spelling; video model smears letters |
| Lower-third / name card / chyron | HyperFrames HTML element + GSAP | Trivially parameterized via `data-composition-variables` |
| Animated chart / data viz | HyperFrames HTML + GSAP or Three.js | Code is the source of truth for the data |
| Animated UI mockup / app screen | HyperFrames HTML + GSAP | Pixel-route invents UI affordances |
| Transition between scenes | HyperFrames shader/crossfade block (`hyperframes add`) | Two clips are the assets; transition is a code recipe |
| Particle / FX overlay | HyperFrames CSS/SVG/Canvas/WebGPU layer | Repeatable; pixel-route is non-deterministic |
| Lottie animation drop-in | HyperFrames Lottie adapter | After Effects export is the asset |

If you're typing one of "animated text", "kinetic typography", "lower third animates in", "chart animates in", "transition wipe" as a `--prompt` to `ralphy generate video`, **stop** — compose it as HTML + GSAP instead.

## Handoff

- Missing assets → **art-director playbook** to regenerate.
- Timings drift (VO ≠ scenario.duration) → **scenarist playbook** to re-time scenes.
- After final-render in a batch → **producer playbook**.
- HyperFrames API specifics you don't find in this file → read the matching `.agents/skills/<topic>/SKILL.md` body.
