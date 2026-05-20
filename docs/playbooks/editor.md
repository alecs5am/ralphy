# Editor playbook

**Read this when:** "compose the video", "do the render", "render", "preview", "fix captions", "audio mix", "final cut", "tighten transitions".

Composer + renderer. I take `scenario.json` + `asset-manifest.json`, assemble the Remotion composition, and render an MP4. I do not generate media — that's the art director. I stitch, time, transition, caption, mix, sanity-check.

> **STOP rule.** Render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. No direct `bunx remotion render` outside debugging, no ad-hoc `ffmpeg` shells — every recipe is a verb that auto-logs. AGENTS invariant #2.

## CLI cookbook

**Render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. Never call `bunx remotion render` directly outside debugging, and never shell out to ad-hoc ffmpeg — every recipe below is a verb that auto-logs.**

```bash
# Final render (Remotion → mp4). --loudnorm adds EBU R128 -16 LUFS post-pass.
ralphy render <project-id> [--loudnorm]

# Captions (the editor's caption pass — separate from researcher's transcript)
ralphy generate captions --project <id> --audio <vo.mp3>     # → captions.json (Caption[])

# Audio recipes — wrap cli/lib/ffmpeg-recipes.ts
ralphy audio loudnorm  --in <vo.mp3>  --out <vo-norm.mp3>           # -16 LUFS for TikTok / Reels
ralphy audio sidechain --voice <vo>   --music <m> --out <mix.mp3>   # duck music under VO
ralphy audio concat    --files a.mp3,b.mp3,c.mp3 --out concat.mp3   # lossless concat

# Video recipes
ralphy video extract-segment --in <src.mp4> --start 1.2 --end 4.5 --out <seg.mp4>
ralphy video burn-subs       --in <src.mp4> --srt <subs.srt> --out <final.mp4>   # last step
ralphy video tonemap-hdr     --in <hdr.mp4> --out <sdr.mp4>                       # HDR → Rec.709
ralphy video concat          --files a.mp4,b.mp4 --out concat.mp4

# Inspect inputs / outputs
ralphy project show <id> --assets        # asset-manifest before composing
ralphy project show <id> --status        # what's done / missing
ralphy project log <id> --type generations --limit 50    # ffmpeg + render entries
```

For Remotion API specifics (captions component, transitions, audio primitives) read [`remotion.md`](remotion.md) — that's the reference manual, not this playbook.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [editor/render-pipeline.md](editor/render-pipeline.md) | Preflight, composition authoring, preview, final-render |
| [editor/captions.md](editor/captions.md) | Wiring `captions.json` into a caption component |
| [editor/transitions.md](editor/transitions.md) | TransitionSeries patterns (crossfade / push / wipe) |
| [editor/audio-mixing.md](editor/audio-mixing.md) | VO + music + SFX levels, ducking, fades |
| [editor/green-zone.md](editor/green-zone.md) | Text/overlay placement inside 1080×1920 safe zone |
| [editor/hard-rules.md](editor/hard-rules.md) | 12-item ffmpeg / cut-discipline checklist for finals |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `preflight` | "ready to render?" | render-pipeline |
| `generate-captions` | VO ready, no captions.json | captions |
| `author-composition` | manifest complete, composition missing | render-pipeline + transitions |
| `preview` | "look in Studio" | render-pipeline |
| `final-render` | composition approved | render-pipeline + hard-rules |

## What I read on start

- **`AGENTS.md`** — invariants (no auto-Studio, no scripts, ralphy render).
- **[remotion playbook](remotion.md)** — reference manual for captions/transitions/audio/ffmpeg.
- `workspace/projects/<id>/scenario.json` — structure and timings.
- `workspace/projects/<id>/asset-manifest.json` — asset paths.
- `workspace/projects/<id>/composition-props.json` if present.
- `src/lib/components/` — durable library (12 caption styles, overlays, layouts). **Don't duplicate — import.**
- `workspace/templates/<slug>/composition.md` if the project was scaffolded.
- `docs/green-zone.md` for text positioning.

## Hard rules (inherited from AGENTS.md)

1. **`ralphy render <id>`** — the only render path. Don't call `bunx remotion render` directly (except for debugging).
2. **No auto-launched Studio.** Don't run `bun run dev` in the background. If the user wants a preview — tell them plainly to run `bun run dev` foreground.
3. **Captions via `ralphy generate captions`** (whisper-1 OpenRouter). See [editor/captions.md](editor/captions.md).
4. **Quality gate before final-render** — every slot in the manifest must have `score >= 7` or explicit bypass-consent.
5. **FFmpeg post-processing** — only via `cli/lib/ffmpeg-recipes.ts`. See [editor/hard-rules.md](editor/hard-rules.md) (12 items).
6. **Motion graphics → Remotion components, never video models** (`04.0A.02`). See the decision tree below — animated text, kinetic typography, lower-thirds, animated charts, animated UI mocks, transition wipes are **all** composed as React components under `src/lib/` (or `~/.ralphy/render-cache/<id>/components/` for standalone installs). They are NOT generated via `ralphy generate video`; that path is reserved for live-action / illustration / photoreal scenes — pixel content the model produces, not code-composited motion.

## Pixels vs code — the motion-graphics decision tree (04.0A.02)

Before routing a scene to `ralphy generate video`, classify the output:

| Pattern | Route | Why |
|---|---|---|
| Live-action scene (person, room, action, weather, gameplay capture) | `ralphy generate video` (i2v / t2v) | Model produces pixels the code can't fake |
| Photoreal still + parallax | `ralphy generate image` + Remotion `interpolate` / `spring` | Image is the asset; motion is the composition |
| Animated text / kinetic typography / "WORDS SLAM IN" | Remotion component (`src/lib/captions/*` or new component) | Code controls timing and exact spelling; video model will smear letters and drift fonts |
| Lower-third / name card / chyron | Remotion component | Trivially parameterized; pixel-route would re-render fonts every gen |
| Animated chart / data viz | Remotion component (Recharts / D3 + `interpolate`) | Code is the source of truth for the data; pixel-route would hallucinate values |
| Animated UI mockup / app screen recording | Remotion component (build the UI in JSX + animate) or genuine screen capture | Pixel-route invents UI affordances; the result reads as AI slop |
| Transition wipe between two clips | `<TransitionSeries>` / `<linearTiming>` in Remotion | The two clips are the assets; the transition is a code recipe |
| Particle / FX overlay | Remotion component (CSS / SVG / Canvas) | Repeatable; pixel-route is non-deterministic |
| Lottie animation drop-in | Remotion `<Lottie />` | Lottie file is the asset; Remotion plays it deterministically |

**Tell-tale signs** (the lint at `bun run lint:templates` will flag known offenders in `prompts.json`): "animated text", "kinetic typography", "lower third animates in", "chart animates in", "logo slides in", "transition wipe" → these go to the Remotion side, not the video model. If you find yourself writing one of those phrases as a `--prompt` to `ralphy generate video`, stop and compose the component instead.

Cross-link: read [`remotion.md`](remotion.md) for the API specifics (TransitionSeries, interpolate, spring, Lottie, fonts).

## Handoff

- `preflight` found missing assets → **art-director playbook** to regenerate.
- Timings drifted (VO ≠ scenario.duration) → **scenarist playbook** to re-time scenes.
- After `final-render`, if it's part of a batch → **producer playbook**.
- New Remotion pattern → **[remotion playbook](remotion.md)** before writing code.
