---
name: editor
namespace: user
description: >-
  Composition and render craft — assembles scenario.json plus asset-manifest.json into a HyperFrames HTML composition and renders the mp4. Owns timing, transitions, captions, audio mix and ducking, the green zone, the render pipeline, and VO sync. Generates no media of its own.
  USE WHEN the user asks to "compose the video", "render", "preview", "fix the captions", "mix the audio", "tighten the transitions", "final cut", or edits HyperFrames composition code.
  TRIGGER (EN): "render it", "compose the video", "captions", "audio mix", "transitions", "final cut", "preview the composition".
---

# Editor playbook

> **Minimal re-read set after context compaction:** "CLI cookbook", "What I read on start", "Hard rules", and "Pixels vs code" in this file, plus the project's `index.html` (read with a range or `rg` once it passes 20k characters). Open a `references/` file only for the sub-task in hand.

**Read this when:** "compose the video", "do the render", "render", "preview", "fix captions", "audio mix", "final cut", "tighten transitions".

Composer + renderer. I take `scenario.json` + `asset-manifest.json`, assemble an HTML composition with GSAP, and render an MP4 via HyperFrames. I do not generate media — that's the art director. I stitch, time, transition, caption, mix, sanity-check.

> **STOP rule.** Render only via `ralphy render`. FFmpeg only via `ralphy audio` / `ralphy video`. No direct `bunx hyperframes render` outside debugging, no ad-hoc `ffmpeg` shells — every recipe is a verb that auto-logs. AGENTS invariant #2.

## Engine

HyperFrames is the only render engine. Every project must ship `.ralphy/workspaces/<ws>/projects/<id>/index.html`. See [`hyperframes`](../hyperframes/references/playbook.md) for composition rules, GSAP timelines, registry blocks, captions, transitions, audio mixing.

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

# Ready transitions, motion elements and SFX (#563) — see references/motion-catalog.md
ralphy catalog list --kind transition --mood energetic
ralphy catalog show <item-id>
# Insert one into index.html (snapshot first, copy, typed params, SFX, usage record, #594)
ralphy catalog use <item-id> --project <id> --at <sec> [--from "#s1" --to "#s2" | --target <sel> | --words <file>] [--param k=v] [--dry-run]

# Fonts, font pairs, caption presets (#565) — see references/caption-presets.md
ralphy catalog fonts pairs
ralphy catalog list --kind caption

# Virtual camera moves (#567) — see references/virtual-camera.md
ralphy catalog list --kind camera

# 9:16 layouts + platform UI safe zones (#564) — see references/vertical-layouts.md
ralphy catalog list --kind layout
ralphy editor lint-safe-zones <project-id> [--platform tiktok reels shorts]

# Alpha cutouts, local and $0 (#560) — see references/keying-and-matting.md
ralphy matte key <green.mp4|green.png> [--project <id>]   # chroma screen -> VP9-alpha webm / PNG
ralphy matte subject <clip.mp4> [--model rvm|birefnet]    # no screen -> text-behind-subject cutout
ralphy matte setup                                        # once per machine, for `matte subject`

# Stock overlays: brand logos, photos, b-roll, SFX, music beds (#596) — see references/stock-assets.md
ralphy stock search <query> --kind image|video|audio|logo [--orientation vertical]   # licensed candidates, no download
ralphy stock pull <candidate-id...> --project <id>    # Artifact revision + artifacts/<images|videos|sfx|music>/, $0
ralphy stock credits --project <id> --markdown        # attribution block for the post copy

# Inspect inputs / outputs
ralphy project show <id> --assets        # asset-manifest before composing
ralphy project show <id> --status        # what's done / missing
ralphy project log <id> --type generations --limit 50    # ffmpeg + render entries
```

For HyperFrames API specifics (composition rules, GSAP timelines, captions, transitions, registry blocks) read [`hyperframes`](../hyperframes/references/playbook.md) — that's the reference manual, not this playbook.

### Extending a stylized clip (i2v last-frame anchor + full 15s blocks)

Extend a toon / painterly clip by anchoring a new `bytedance/seedance-2.0` i2v clip on its real last frame (`--first-frame`), in full 15s blocks with a moving camera, then `ralphy video concat` + a music bed sized to the new length + `ralphy audio sidechain`. Photoreal humans extend via `kwaivgi/kling-v3.0-pro`. Steps and exceptions: [`references/extend-clip.md`](./references/extend-clip.md).

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [editor/render-pipeline.md](./references/render-pipeline.md) | Preflight, composition authoring, preview, final-render |
| [editor/vo-sync.md](./references/vo-sync.md) | Aligned-to-VO cuts — stitch → scribe → slice; reverse-areverse + concat demuxer (AGENTS invariant #16) |
| [editor/captions.md](./references/captions.md) | Wiring `captions.json` into a caption component; captions-first before writing timing constants |
| [editor/transitions.md](./references/transitions.md) | Crossfade / push / wipe patterns |
| [editor/motion-catalog.md](./references/motion-catalog.md) | Pick a ready transition / motion element / SFX: `ralphy catalog list --kind transition --mood energetic` (#563); insert it with `ralphy catalog use <id> --project <id> --at <sec>` (#594) |
| [editor/stock-assets.md](./references/stock-assets.md) | Overlay assets someone else made (logos, photos, b-roll, SFX, music beds): `ralphy stock search` → `ralphy stock pull` → `ralphy stock credits` in the post copy (#596) |
| [editor/audio-mixing.md](./references/audio-mixing.md) | VO + music + SFX levels, ducking, fades |
| [editor/green-zone.md](./references/green-zone.md) | Text/overlay placement inside 1080×1920 safe zone |
| [editor/caption-presets.md](./references/caption-presets.md) | Free licensed fonts (`ralphy catalog fonts list`), 10 font pairs by register, 12 caption presets (1 / 3 / 5 words, highlight, entry, contrast), pacing defaults, `ralphy eval captions <id> --caption-preset <preset>` (#565) |
| [editor/virtual-camera.md](./references/virtual-camera.md) | Post-production camera moves on footage or stills: punch-in, push, seeded handheld, whip, roll, parallax, Ken Burns, follow-cam on a track, crash / dolly zoom, reframe, impact shake; when each helps or distracts (#567) |
| [editor/vertical-layouts.md](./references/vertical-layouts.md) | Pick a 9:16 layout (split, gameplay, keyed head, PiP, reaction, screen + face cam, caption band, text-led) and place face / captions / headline / product / CTA; `ralphy editor lint-safe-zones <id>` (#564) |
| [editor/keying-and-matting.md](./references/keying-and-matting.md) | Text behind a moving subject, keyed green-screen characters: `ralphy matte subject` / `ralphy matte key` (local, $0) and the three-layer HyperFrames recipe (#560) |
| [editor/hard-rules.md](./references/hard-rules.md) | 12-item ffmpeg / cut-discipline checklist for finals |
| [extend-clip.md](./references/extend-clip.md) | Lengthen a stylized clip from its last frame |
| [pixels-vs-code.md](./references/pixels-vs-code.md) | Full motion-graphics routing table |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `preflight` | "ready to render?" | render-pipeline |
| `generate-captions` | VO ready, no captions.json | captions + vo-sync (for aligned-to-VO cuts) |
| `author-composition` | manifest complete, composition missing | render-pipeline + transitions + [`hyperframes`](../hyperframes/references/playbook.md) |
| `preview` | "look in the browser" | render-pipeline + `bunx hyperframes preview` |
| `final-render` | composition approved | render-pipeline + hard-rules |

## What I read on start

1. **Run `ralphy editor preflight <id>` first.** Single canonical check for durations, fps, codec, audio tracks, music-gap vs total clip length, and scenario-to-disk completeness. Exits 1 on red — fix before composing. Replaces every project's ad-hoc `ffprobe` loop. (#034)
2. **Then `ralphy editor trim-analyze <id>`.** Batch gemini-3.1-pro-preview vision pass over `artifacts/videos/` for dead-time / hot-moments / suggested `trim_in_s` / `trim_out_s` per clip. Aggregates to `artifacts/analysis/summary.json` (idempotent via mtime — re-runs only re-analyze changed clips). Use `--dry-run` to preview the plan + cache state. Canonical solver for kling/seedance ~1s overshoot (#042). (#034)
3. **`AGENTS.md`** — invariants (no auto-Studio, no scripts, ralphy render).
4. **[hyperframes playbook](../hyperframes/references/playbook.md)** — reference manual for HyperFrames composition / captions / transitions / GSAP / registry.
5. **[art-director/pre-render-checklist.md](../art-director/references/pre-render-checklist.md)** — HARD snapshot-review gate the art-director must clear before handing off. If you arrived here without snapshots on disk, bounce back to art-director.
6. `.ralphy/workspaces/<ws>/projects/<id>/scenario.json` — structure and timings.
7. `.ralphy/workspaces/<ws>/projects/<id>/asset-manifest.json` — asset paths.
- `.ralphy/workspaces/<ws>/projects/<id>/index.html` — the composition.
- `.ralphy/workspaces/<ws>/projects/<id>/design.md` — brand source-of-truth (HyperFrames skill gate).
- `docs/green-zone.md` for text positioning.

## Hard rules (inherited from AGENTS.md)

1. **`ralphy render <id>`** — the only render path. Don't call `bunx hyperframes render` directly (except for debugging).
2. **No auto-launched preview / Studio.** Don't run `hyperframes preview` in the background. If the user wants a preview — tell them plainly to run it foreground.
3. **Captions via `ralphy generate captions`** (whisper-1 OpenRouter) or `bunx hyperframes transcribe` for word-level timestamps. **Run it BEFORE writing any HF / Remotion timing constants** when the composition has caption overlays (AGENTS invariant #16). For aligned-to-VO cuts overall, scribe-first via [editor/vo-sync.md](./references/vo-sync.md). See [editor/captions.md](./references/captions.md).
4. **Quality gate before final-render** — every slot in the manifest must have `score >= 7` or explicit bypass-consent.
5. **FFmpeg post-processing** — only via `cli/lib/ffmpeg-recipes.ts`. See [editor/hard-rules.md](./references/hard-rules.md) (12 items).
6. **Motion graphics → composition code, never video models** (`04.0A.02`). See "Pixels vs code" below — animated text, kinetic typography, lower-thirds, animated charts, animated UI mocks, transition wipes are **all** composed as HyperFrames HTML + GSAP. They are NOT generated via `ralphy generate video`; that path is reserved for live-action / illustration / photoreal scenes — pixel content the model produces, not code-composited motion.
7. **MUST log every user feedback turn on the render** via `ralphy project log-prompt <id> --text "<verbatim>" --stage <feedback|approval|critique|rejection>` — push-back on a cut, caption fix, audio re-mix, "ship it" approval, render-killer critique. Same MUST-log discipline as the scenarist playbook (see [`scenarist.md` → "User-prompt logging"](../scenarist/SKILL.md#user-prompt-logging-must-every-turn)). Sparse logs leave the postmortem layer guessing about which render version the user actually approved.
8. **Kling + seedance overshoot `--duration` by ~1s** (video lesson 12 in `ralphy models show kwaivgi/kling-v3.0-pro`). Before a multi-clip cut, either request `--duration` 1s shorter at the art-director stage or budget a per-clip trim (`ralphy editor trim-analyze <id>`). Recipe and numbers: [editor/render-pipeline.md → Source-clip duration overshoot](./references/render-pipeline.md#source-clip-duration-overshoot-kling--seedance).

9. **Collected overlays come from `ralphy stock` (#596).** Logos, photos, b-roll, SFX and music beds that are not generated are found with `ralphy stock search` and pulled with `ralphy stock pull` (license-checked, recorded as Artifact revisions with provenance), never saved from a browser by hand. Put `ralphy stock credits --project <id> --markdown` into the post caption / description whenever a pulled item requires attribution. See [editor/stock-assets.md](./references/stock-assets.md).

10. **Free before paid (#559).** An overlay that follows a point, a face, or a planar surface (screen, sign, label) is a local track plus composition code: `ralphy track point|planar|face <video> --at <t> --box x,y,w,h --js`, then `ralphy track helper` and `RalphyTrack.follow` / `RalphyTrack.cornerPin` in `index.html`. Escalate to a paid generation only with a stated reason (occluded insert, relighting, fast blur the track cannot hold; see `docs/research/local-tracking.md`).

## Pixels vs code

Before routing a scene to `ralphy generate video`, classify it (`04.0A.02`). **Pixels** (live-action, weather, gameplay capture, photoreal scenes) → `ralphy generate video`. **Code** (animated text / kinetic typography, lower-thirds, animated charts, UI mockups, transitions, particle FX, Lottie drop-ins, still + parallax) → HyperFrames HTML + GSAP over generated stills. Prompt phrases like "animated text", "lower third animates in", "chart animates in", "logo slides in", "transition wipe" mean compose the component, never prompt a video model. The full routing table, the tell-tale lint, and the legacy Remotion note: [`references/pixels-vs-code.md`](./references/pixels-vs-code.md).

## Handoff

- `preflight` found missing assets → **art-director playbook** to regenerate.
- Timings drifted (VO ≠ scenario.duration) → **scenarist playbook** to re-time scenes.
- After `final-render`, if it's part of a batch → **producer playbook**.
- New HyperFrames pattern → **[hyperframes playbook](../hyperframes/references/playbook.md)** + relevant skill body (`gsap`, `lottie`, `animejs`, …) before writing code.
- A scene fails twice on the same axis during recompose / regen — see **[art-director playbook → Split-scene-instead-of-regen](../art-director/SKILL.md#split-scene-instead-of-regen-repeat-failure-rule)**. Stop re-prompting; split into micro-shots inside the same slot budget.
