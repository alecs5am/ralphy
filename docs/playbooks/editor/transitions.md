# Transitions

## Default — registry blocks

Install a transition via `bunx hyperframes add <transition-slug> .ralphy/workspaces/<ws>/projects/<id>` and wire it between two scene `<div class="clip">` elements. UGC defaults:

- `fade` for smooth scene change (~200ms)
- `push` (slide left / right) for narrative transitions
- `wipe` for retro/VHS vibe (only if the template demands it)
- `glitch` / `light-leak` / `thermal-distortion` — for high-energy beats

See `bunx hyperframes catalog` for the live registry and [`../hyperframes.md`](../hyperframes.md) for the wiring patterns.

## Duration

- **30fps default** in this project. ~6 frames = 200ms — the sweet spot.
- Don't go >400ms — feels slow for UGC. <100ms — jarring.

## Hard rules

- **Audio fades in transitions:** ~30ms fade-in/out for VO at segment boundaries to avoid click-pop.
- **Transition between scenes with different background brightness:** fade through black is safer than a direct fade.
- **For the talking-head template** transitions between clips are NOT needed — talking-head should look continuous. Stack the clips back-to-back without a transition block.

## Crossfade BETWEEN VIDEO CLIPS — bake it, don't composite it

A dissolve / crossfade **between two video clips** does NOT work as an
in-composition opacity tween (alternating-track `<video>` wrappers, or animating
a `<video>` / wrapper opacity with GSAP). The capture engine hard-switches video
sources at clip boundaries; the opacity tween does not composite during render,
so it ships as a quick cut, not a dissolve — lint passes, the mp4 hard-cuts.

Bake the dissolve into a single master with `ffmpeg xfade` instead:

- Trim each beat (`ralphy video extract-segment`), then chain with
  `xfade=transition=fade:duration=0.6`. Offset for the k-th xfade =
  `sum_{i=0..k} dur_i - (k+1)*d` (d = crossfade seconds) = clip k+1's start on the
  faded timeline. Total = `sum(dur) - (N-1)*d`.
- Normalize every xfade input first (`fps=30,format=yuv420p,setsar=1,settb=AVTB`)
  or the filter errors / desyncs.
- Drive the baked master with ONE `<video>`; compute overlay (caption / label)
  times from the embedded clip-start array so they stay locked to the cuts.
- There is no `ralphy video xfade` verb yet — this is the one
  sanctioned-by-necessity direct-ffmpeg step; trims still go through
  `ralphy video extract-segment`.

Does **NOT** apply to: transitions between TEXT / DIV scene overlays (those DO
crossfade in-composition via GSAP opacity, and the transitions registry blocks
work) · dip-to-black overlay transitions (a `#blackout` div fading in/out works
in-composition) · single-clip compositions · still-image parallax scenes.

## Faceless long-form essay — never hold a static visual

For a faceless VO-essay / explainer cut, NEVER bind one static visual to a whole
VO line. Decouple a SHOT timeline (visual cuts every ~3–4.5s, every shot in
continuous motion — container slow-zoom + inner ken-burns) from an independent
CAPTION layer (2–4-word chunks punching in every ~1.2–1.8s). A frame that holds
still for more than a few seconds is the killer defect for this format — cut away
from a draw-once archetype (graph / card / diagram) ~2s after it finishes so it
never freezes. Measure any reference first with `ralphy ref analyze-video`
(it reports shot count, median shot length, and longest static hold).

Does **NOT** apply to: short-form choose-path TikTok reels (own baked pacing);
poster / carousel stills; analog-horror PSAs (deliberate slow dread is the
genre). Only fires for the faceless long-form essay / explainer cut where
retention depends on perpetual motion.

## Hook-screenshot overlay

If the first 3-4s contain a hook screenshot (Reddit post, news headline) over the videostream — wire it as a positioned `<div class="clip">` with its own `data-start` / `data-duration` and a GSAP fade-out near the end.

## Source

All API details — see [`../hyperframes.md`](../hyperframes.md) (the index) and the matching `.agents/skills/hyperframes*/SKILL.md` bodies. Don't invent transition patterns from memory.
