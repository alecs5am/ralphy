# HyperFrames playbook

**Read this when:** writing or modifying HyperFrames code — compositions, GSAP animation timelines, captions, transitions, audio mixing, registry blocks. This is the *primary* composer + renderer reference for new Ralphy projects.

HyperFrames is now the default render engine. Compositions are plain HTML files with `data-*` timing attributes, animated by a paused GSAP timeline the runtime seeks deterministically, rendered to MP4 via Puppeteer + FFmpeg. No React, no bundler, no JSX.

> Legacy projects under `src/videos/*` (and any workspace project shipping a `composition-props.json`) still use the [Remotion playbook](remotion.md) as a fallback. New work goes here.

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
| `remotion-to-hyperframes` | Port a legacy Remotion composition to HTML. |
| `contribute-catalog` | Ship a new registry block upstream. |

## Project shape

A Ralphy workspace project that renders via HyperFrames has at least:

```
workspace/projects/<id>/
├── index.html                ← root composition (REQUIRED — this is what `ralphy render` looks for)
├── design.md                 ← brand/style source-of-truth (colors, fonts, mood, ratios)
├── meta.json                 ← optional HyperFrames project metadata
├── compositions/             ← optional sub-compositions loaded via data-composition-src
├── assets/                   ← images, audio, video, fonts (referenced from index.html)
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

**Hard invariants (from the skill bodies — keep these in mind, never relax):**
- Timelines MUST be created `{ paused: true }`. The runtime drives playback.
- Use the GSAP position parameter (3rd arg) for absolute timing.
- Layout-before-animation: position elements at their hero frame in CSS, then `gsap.from()` to ease them in.
- The `.scene-content` container fills the scene with `width: 100%; height: 100%; padding: Npx; box-sizing: border-box`. NEVER use `position: absolute; top: Npx` on a content container.
- `data-composition-id`, `data-width`, `data-height` are required on the root.

## CLI cookbook

```bash
# Render the project (HyperFrames is the default engine when index.html is present)
ralphy render <project-id>
ralphy render <project-id> --engine hyperframes        # explicit
ralphy render <project-id> --fps 60 --quality high     # bump quality
ralphy render <project-id> --resolution portrait        # 1080×1920 portrait via DPR
ralphy render <project-id> --loudnorm                   # +EBU R128 -16 LUFS post-pass

# Iterate
bunx hyperframes preview workspace/projects/<id>        # live-reload browser preview (foreground)
bunx hyperframes lint     workspace/projects/<id>       # validate composition shape
bunx hyperframes inspect  workspace/projects/<id>       # visual layout across the timeline
bunx hyperframes snapshot workspace/projects/<id>       # keyframe PNGs for QA
bunx hyperframes doctor                                 # env check (node, ffmpeg, chrome)

# Install registry blocks (catalog has 50+ items)
bunx hyperframes add <block-slug> workspace/projects/<id>

# Asset preprocessing
bunx hyperframes tts        --text "..."  -o assets/vo.wav
bunx hyperframes transcribe --in vo.wav   -o captions.json
bunx hyperframes remove-background --in shot.mp4 -o shot-alpha.webm
```

> **STOP rule.** Final render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. Direct `bunx hyperframes preview / lint / inspect / snapshot` is fine for iteration; direct `hyperframes render` outside debugging defeats the gen-log. AGENTS invariant #2.

## What I read on start

- **`AGENTS.md`** — invariants (no auto-Studio, ralphy render, no ad-hoc ffmpeg).
- **`.agents/skills/hyperframes/SKILL.md`** — composition rules, layout-before-animation, design.md gate.
- **`.agents/skills/gsap/SKILL.md`** — timeline grammar.
- **`workspace/projects/<id>/design.md`** — brand/style source-of-truth (if absent, ask the user before writing CSS).
- **`workspace/projects/<id>/scenario.json`** — beat structure, timings.
- **`workspace/projects/<id>/asset-manifest.json`** — asset paths.
- **`docs/green-zone.md`** — text positioning safe zone for 1080×1920.

## Pixels vs code — motion-graphics decision tree (HyperFrames variant)

Same principle as the Remotion playbook: code-composited motion belongs in the HTML composition, not in `ralphy generate video`. The route table:

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
- Porting a legacy Remotion composition → invoke the **remotion-to-hyperframes** skill, or fall back to [`remotion.md`](remotion.md) and keep it on the Remotion engine via `--engine remotion`.
- HyperFrames API specifics you don't find in this file → read the matching `.agents/skills/<topic>/SKILL.md` body.
