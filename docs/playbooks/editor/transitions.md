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

## Hook-screenshot overlay

If the first 3-4s contain a hook screenshot (Reddit post, news headline) over the videostream — wire it as a positioned `<div class="clip">` with its own `data-start` / `data-duration` and a GSAP fade-out near the end.

## Source

All API details — see [`../hyperframes.md`](../hyperframes.md) (the index) and the matching `.agents/skills/hyperframes*/SKILL.md` bodies. Don't invent transition patterns from memory.
