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

## Handoff

- `preflight` found missing assets → **art-director playbook** to regenerate.
- Timings drifted (VO ≠ scenario.duration) → **scenarist playbook** to re-time scenes.
- After `final-render`, if it's part of a batch → **producer playbook**.
- New Remotion pattern → **[remotion playbook](remotion.md)** before writing code.
