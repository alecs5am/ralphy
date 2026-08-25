# Editor playbook

**Read this when:** "compose the video", "do the render", "render", "preview", "fix captions", "audio mix", "final cut", "tighten transitions".

Composer + renderer. I take `scenario.json` + `asset-manifest.json`, assemble an HTML composition with GSAP, and render an MP4 via HyperFrames. I do not generate media — that's the art director. I stitch, time, transition, caption, mix, sanity-check.

> **STOP rule.** Render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. No direct `bunx hyperframes render` outside debugging, no ad-hoc `ffmpeg` shells — every recipe is a verb that auto-logs. AGENTS invariant #2.

## Engine

HyperFrames is the only render engine. Every project must ship `.ralphy/workspaces/<ws>/projects/<id>/index.html`. See [`hyperframes.md`](hyperframes.md) for composition rules, GSAP timelines, registry blocks, captions, transitions, audio mixing.

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
bunx hyperframes preview .ralphy/workspaces/<ws>/projects/<id>
bunx hyperframes lint    .ralphy/workspaces/<ws>/projects/<id>
bunx hyperframes inspect .ralphy/workspaces/<ws>/projects/<id>
bunx hyperframes add <block-slug> .ralphy/workspaces/<ws>/projects/<id>

# Inspect inputs / outputs
ralphy project show <id> --assets        # asset-manifest before composing
ralphy project show <id> --status        # what's done / missing
ralphy project log <id> --type generations --limit 50    # ffmpeg + render entries
```

For HyperFrames API specifics (composition rules, GSAP timelines, captions, transitions, registry blocks) read [`hyperframes.md`](hyperframes.md) — that's the reference manual, not this playbook.

### Extending a stylized clip (i2v last-frame anchor + full 15s blocks)

When the user asks to "extend" / lengthen an existing stylized clip (toon, painterly, Spider-Verse / Arcane register), don't generate a fresh disconnected clip — **anchor a new i2v clip from the last frame of the existing one** so the join is seamless:

1. Extract the final frame: `ralphy video extract-segment` (or an `ffmpeg -sseof` tail-frame grab via a `ralphy video` recipe) of the last ~0.15s → one PNG.
2. Feed that PNG as the `--first-frame` of a new `ralphy generate video` i2v call on `bytedance/seedance-2.0`. The new clip starts on the real last frame, so the cut is invisible. (Stylized/painterly anchors don't trip seedance's photoreal-human privacy filter — that filter only fires on photoreal human faces, see `feedback_seedance_rejects_realistic_people`.)
3. Default the extension to a **full 15s block, not 5s.** Short extensions feel rushed and lose dynamics; a 15s block has room for a real beat (e.g. solo → camera orbit revealing the crowd → finale) and the stylized register comes through stronger on action-heavy long blocks than on static wides. Emphasize a moving camera (orbit / crane) for dynamics. Keep the SUBJECT / STYLE / AUDIO-POLICY prompt blocks verbatim across blocks.
4. `ralphy video concat` the blocks, regenerate a music bed sized to the FULL new length with the climax aligned to the finale, then `ralphy audio sidechain` (duck music under VO) and copy to `render/final.mp4`.

**Does NOT apply to:** photoreal-human clips (seedance rejects the anchor — extend via `kwaivgi/kling-v3.0-pro` instead); slow static / dialogue-driven beats where a 5s extension is the right length; cases where the new beat is a hard scene change rather than a continuation (then it's a new scene, not an extend, and the last-frame anchor is unnecessary).

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [editor/render-pipeline.md](editor/render-pipeline.md) | Preflight, composition authoring, preview, final-render |
| [editor/vo-sync.md](editor/vo-sync.md) | Aligned-to-VO cuts — stitch → scribe → slice; reverse-areverse + concat demuxer (AGENTS invariant #16) |
| [editor/captions.md](editor/captions.md) | Wiring `captions.json` into a caption component; captions-first before writing timing constants |
| [editor/transitions.md](editor/transitions.md) | Crossfade / push / wipe patterns |
| [editor/audio-mixing.md](editor/audio-mixing.md) | VO + music + SFX levels, ducking, fades |
| [editor/green-zone.md](editor/green-zone.md) | Text/overlay placement inside 1080×1920 safe zone |
| [editor/hard-rules.md](editor/hard-rules.md) | 12-item ffmpeg / cut-discipline checklist for finals |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `preflight` | "ready to render?" | render-pipeline |
| `generate-captions` | VO ready, no captions.json | captions + vo-sync (for aligned-to-VO cuts) |
| `author-composition` | manifest complete, composition missing | render-pipeline + transitions + [hyperframes.md](hyperframes.md) |
| `preview` | "look in the browser" | render-pipeline + `bunx hyperframes preview` |
| `final-render` | composition approved | render-pipeline + hard-rules |

## What I read on start

1. **Run `ralphy editor preflight <id>` first.** Single canonical check for durations, fps, codec, audio tracks, music-gap vs total clip length, and scenario-to-disk completeness. Exits 1 on red — fix before composing. Replaces every project's ad-hoc `ffprobe` loop. (#034)
2. **Then `ralphy editor trim-analyze <id>`.** Batch gemini-3.1-pro-preview vision pass over `artifacts/videos/` for dead-time / hot-moments / suggested `trim_in_s` / `trim_out_s` per clip. Aggregates to `artifacts/analysis/summary.json` (idempotent via mtime — re-runs only re-analyze changed clips). Use `--dry-run` to preview the plan + cache state. Canonical solver for kling/seedance ~1s overshoot (#042). (#034)
3. **`AGENTS.md`** — invariants (no auto-Studio, no scripts, ralphy render).
4. **[hyperframes playbook](hyperframes.md)** — reference manual for HyperFrames composition / captions / transitions / GSAP / registry.
5. **[art-director/pre-render-checklist.md](art-director/pre-render-checklist.md)** — HARD snapshot-review gate the art-director must clear before handing off. If you arrived here without snapshots on disk, bounce back to art-director.
6. `.ralphy/workspaces/<ws>/projects/<id>/scenario.json` — structure and timings.
7. `.ralphy/workspaces/<ws>/projects/<id>/asset-manifest.json` — asset paths.
- `.ralphy/workspaces/<ws>/projects/<id>/index.html` — the composition.
- `.ralphy/workspaces/<ws>/projects/<id>/design.md` — brand source-of-truth (HyperFrames skill gate).
- `docs/green-zone.md` for text positioning.

## Hard rules (inherited from AGENTS.md)

1. **`ralphy render <id>`** — the only render path. Don't call `bunx hyperframes render` directly (except for debugging).
2. **No auto-launched preview / Studio.** Don't run `hyperframes preview` in the background. If the user wants a preview — tell them plainly to run it foreground.
3. **Captions via `ralphy generate captions`** (whisper-1 OpenRouter) or `bunx hyperframes transcribe` for word-level timestamps. **Run it BEFORE writing any HF / Remotion timing constants** when the composition has caption overlays (AGENTS invariant #16). For aligned-to-VO cuts overall, scribe-first via [editor/vo-sync.md](editor/vo-sync.md). See [editor/captions.md](editor/captions.md).
4. **Quality gate before final-render** — every slot in the manifest must have `score >= 7` or explicit bypass-consent.
5. **FFmpeg post-processing** — only via `cli/lib/ffmpeg-recipes.ts`. See [editor/hard-rules.md](editor/hard-rules.md) (12 items).
6. **Motion graphics → composition code, never video models** (`04.0A.02`). See the decision tree below — animated text, kinetic typography, lower-thirds, animated charts, animated UI mocks, transition wipes are **all** composed as HyperFrames HTML + GSAP. They are NOT generated via `ralphy generate video`; that path is reserved for live-action / illustration / photoreal scenes — pixel content the model produces, not code-composited motion.
7. **MUST log every user feedback turn on the render** via `ralphy project log-prompt <id> --text "<verbatim>" --stage <feedback|approval|critique|rejection>` — push-back on a cut, caption fix, audio re-mix, "ship it" approval, render-killer critique. Same MUST-log discipline as the scenarist playbook (see [`scenarist.md` → "User-prompt logging"](scenarist.md#user-prompt-logging-must-every-turn)). Sparse logs leave the postmortem layer guessing about which render version the user actually approved.
8. **Kling + seedance overshoot `--duration` by ~1s.** Every clip from `kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0` lands ~1s longer than the requested duration (tokyo-y2k-001 measured 5s/4s/9s → 6.04/5.04/10.04). Before composing a multi-clip cut, either (a) request `--duration` 1s shorter at art-director stage, or (b) budget a per-clip vision-trim pass. Full recipe + numbers in [editor/render-pipeline.md → Source-clip duration overshoot](editor/render-pipeline.md#source-clip-duration-overshoot-kling--seedance). Structural solution lives in the future `ralphy editor trim-analyze` verb (issue [034](../../notes/issues/done/034-no-editor-preflight-and-trim-analyze.md)).

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

> **Historical aside (Remotion).** If you're spelunking a pre-`92ef823` branch or a postmortem that mentions `STATIC_ROOT` / `composition-props.json`, the legacy Remotion convention is documented at [editor/render-pipeline.md → Legacy: Remotion `STATIC_ROOT` recipe](editor/render-pipeline.md#legacy-remotion-static_root-recipe-archived-for-postmortem-cross-reference). Not relevant to current HyperFrames work.

## Handoff

- `preflight` found missing assets → **art-director playbook** to regenerate.
- Timings drifted (VO ≠ scenario.duration) → **scenarist playbook** to re-time scenes.
- After `final-render`, if it's part of a batch → **producer playbook**.
- New HyperFrames pattern → **[hyperframes playbook](hyperframes.md)** + relevant skill body (`gsap`, `lottie`, `animejs`, …) before writing code.
- A scene fails twice on the same axis during recompose / regen — see **[art-director playbook → Split-scene-instead-of-regen](art-director.md#split-scene-instead-of-regen-repeat-failure-rule)**. Stop re-prompting; split into micro-shots inside the same slot budget.
