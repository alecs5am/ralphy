# Editor playbook

**Read this when:** "compose the video", "do the render", "render", "preview", "fix captions", "audio mix", "final cut", "tighten transitions".

Composer + renderer. I take `scenario.json` + `asset-manifest.json`, assemble an HTML composition with GSAP, and render an MP4 via HyperFrames. I do not generate media — that's the art director. I stitch, time, transition, caption, mix, sanity-check.

> **STOP rule.** Render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. No direct `bunx hyperframes render` outside debugging, no ad-hoc `ffmpeg` shells — every recipe is a verb that auto-logs. AGENTS invariant #2.

## Engine

HyperFrames is the only render engine. Every project must ship `workspace/projects/<id>/index.html`. See [`hyperframes.md`](hyperframes.md) for composition rules, GSAP timelines, registry blocks, captions, transitions, audio mixing.

## CLI cookbook

**Render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. Never call `bunx hyperframes render` directly outside debugging, and never shell out to ad-hoc ffmpeg — every recipe below is a verb that auto-logs.**

```bash
# Final render
ralphy render <project-id> [--loudnorm]
ralphy render <project-id> --fps 60 --quality high

# Captions
ralphy generate captions --project <id> --audio <vo.mp3>     # → captions.json (Caption[])
# HyperFrames also ships a built-in word-level transcriber:
bunx hyperframes transcribe --in <vo.wav> -o captions.json

# Audio recipes — wrap cli/lib/ffmpeg-recipes.ts
ralphy audio loudnorm  --in <vo.mp3>  --out <vo-norm.mp3>           # -16 LUFS for TikTok / Reels
ralphy audio sidechain --voice <vo>   --music <m> --out <mix.mp3>   # duck music under VO
ralphy audio concat    --files a.mp3,b.mp3,c.mp3 --out concat.mp3   # lossless concat

# Video recipes
ralphy video extract-segment --in <src.mp4> --start 1.2 --end 4.5 --out <seg.mp4>
ralphy video burn-subs       --in <src.mp4> --srt <subs.srt> --out <final.mp4>   # last step
ralphy video tonemap-hdr     --in <hdr.mp4> --out <sdr.mp4>                       # HDR → Rec.709
ralphy video concat          --files a.mp4,b.mp4 --out concat.mp4

# HyperFrames iteration loop (foreground only — no auto-Studio)
bunx hyperframes preview workspace/projects/<id>
bunx hyperframes lint    workspace/projects/<id>
bunx hyperframes inspect workspace/projects/<id>
bunx hyperframes add <block-slug> workspace/projects/<id>

# Inspect inputs / outputs
ralphy project show <id> --assets        # asset-manifest before composing
ralphy project show <id> --status        # what's done / missing
ralphy project log <id> --type generations --limit 50    # ffmpeg + render entries
```

For HyperFrames API specifics (composition rules, GSAP timelines, captions, transitions, registry blocks) read [`hyperframes.md`](hyperframes.md) — that's the reference manual, not this playbook.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [editor/render-pipeline.md](editor/render-pipeline.md) | Preflight, composition authoring, preview, final-render |
| [editor/captions.md](editor/captions.md) | Wiring `captions.json` into a caption component |
| [editor/transitions.md](editor/transitions.md) | Crossfade / push / wipe patterns |
| [editor/audio-mixing.md](editor/audio-mixing.md) | VO + music + SFX levels, ducking, fades |
| [editor/green-zone.md](editor/green-zone.md) | Text/overlay placement inside 1080×1920 safe zone |
| [editor/hard-rules.md](editor/hard-rules.md) | 12-item ffmpeg / cut-discipline checklist for finals |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `preflight` | "ready to render?" | render-pipeline |
| `generate-captions` | VO ready, no captions.json | captions |
| `author-composition` | manifest complete, composition missing | render-pipeline + transitions + [hyperframes.md](hyperframes.md) |
| `preview` | "look in the browser" | render-pipeline + `bunx hyperframes preview` |
| `final-render` | composition approved | render-pipeline + hard-rules |

## What I read on start

- **`AGENTS.md`** — invariants (no auto-Studio, no scripts, ralphy render).
- **[hyperframes playbook](hyperframes.md)** — reference manual for HyperFrames composition / captions / transitions / GSAP / registry.
- `workspace/projects/<id>/scenario.json` — structure and timings.
- `workspace/projects/<id>/asset-manifest.json` — asset paths.
- `workspace/projects/<id>/index.html` — the composition.
- `workspace/projects/<id>/design.md` — brand source-of-truth (HyperFrames skill gate).
- `docs/green-zone.md` for text positioning.

## Hard rules (inherited from AGENTS.md)

1. **`ralphy render <id>`** — the only render path. Don't call `bunx hyperframes render` directly (except for debugging).
2. **No auto-launched preview / Studio.** Don't run `hyperframes preview` in the background. If the user wants a preview — tell them plainly to run it foreground.
3. **Captions via `ralphy generate captions`** (whisper-1 OpenRouter) or `bunx hyperframes transcribe` for word-level timestamps. See [editor/captions.md](editor/captions.md).
4. **Quality gate before final-render** — every slot in the manifest must have `score >= 7` or explicit bypass-consent.
5. **FFmpeg post-processing** — only via `cli/lib/ffmpeg-recipes.ts`. See [editor/hard-rules.md](editor/hard-rules.md) (12 items).
6. **Motion graphics → composition code, never video models** (`04.0A.02`). See the decision tree below — animated text, kinetic typography, lower-thirds, animated charts, animated UI mocks, transition wipes are **all** composed as HyperFrames HTML + GSAP. They are NOT generated via `ralphy generate video`; that path is reserved for live-action / illustration / photoreal scenes — pixel content the model produces, not code-composited motion.

## Pixels vs code — the motion-graphics decision tree (04.0A.02)

Before routing a scene to `ralphy generate video`, classify the output:

| Pattern | Route | Why |
|---|---|---|
| Live-action scene (person, room, action, weather, gameplay capture) | `ralphy generate video` (i2v / t2v) | Model produces pixels the code can't fake |
| Photoreal still + parallax | `ralphy generate image` + HyperFrames GSAP tween | Image is the asset; motion is the composition |
| Animated text / kinetic typography / "WORDS SLAM IN" | HyperFrames component + GSAP timeline | Code controls timing and exact spelling; video model will smear letters and drift fonts |
| Lower-third / name card / chyron | HyperFrames HTML + GSAP | Trivially parameterized; pixel-route would re-render fonts every gen |
| Animated chart / data viz | HyperFrames HTML + GSAP / Three.js | Code is the source of truth for the data; pixel-route would hallucinate values |
| Animated UI mockup / app screen | HyperFrames HTML + GSAP | Pixel-route invents UI affordances; the result reads as AI slop |
| Transition between two clips | HyperFrames shader/crossfade registry block | The two clips are the assets; the transition is a code recipe |
| Particle / FX overlay | HyperFrames CSS/SVG/Canvas/WebGPU | Repeatable; pixel-route is non-deterministic |
| Lottie animation drop-in | HyperFrames `lottie` adapter | Lottie file is the asset; runtime plays it deterministically |

**Tell-tale signs** (the lint at `bun run lint:templates` flags known offenders in `prompts.json`): "animated text", "kinetic typography", "lower third animates in", "chart animates in", "logo slides in", "transition wipe" → these go to the HTML+GSAP side, not the video model. If you find yourself writing one of those phrases as a `--prompt` to `ralphy generate video`, stop and compose the component instead.

Cross-link: read [`hyperframes.md`](hyperframes.md) for the API specifics.

## Handoff

- `preflight` found missing assets → **art-director playbook** to regenerate.
- Timings drifted (VO ≠ scenario.duration) → **scenarist playbook** to re-time scenes.
- After `final-render`, if it's part of a batch → **producer playbook**.
- New HyperFrames pattern → **[hyperframes playbook](hyperframes.md)** + relevant skill body (`gsap`, `lottie`, `animejs`, …) before writing code.
