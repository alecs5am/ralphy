# Transitions

## Default — `TransitionSeries`

Use `@remotion/transitions` `TransitionSeries` with `<Sequence>` per scene. UGC defaults:

- `fade` for smooth scene change (180ms / 6 frames @ 30fps)
- `slide` (direction: left | right) for narrative transitions
- `wipe` for retro/vhs vibe (only if the template demands it)
- `clockWipe` / `flip` — rarer, for acceleration

See `/remotion-best-practices` rules/transitions.md for the full API.

## Duration

- **30fps default** in this project. 6 frames = 200ms — the sweet spot.
- Don't use >12 frames (400ms) — feels slow for UGC. <3 frames (100ms) — jarring.

## Hard rules

- **Audio fades in transitions:** 30ms fade-in/out for VO at segment boundaries to avoid click-pop.
- **Composing a transition between scenes with different background brightness:** `fade` through black (`fadeWithBackground` color="#000") is safer than a direct fade.
- **For the talking-head template** transitions between clips are NOT needed — talking-head should look continuous. Use `<Series>` without TransitionSeries.

## Hook-screenshot overlay

If the first 3-4s contain a hook screenshot (Reddit post, news headline) over the videostream — use the `HookScreenshot` component from `src/lib/components/overlays/`. Fade-out the last 30 frames.

## Source

All API details — `/remotion-best-practices` rules. Don't invent TransitionSeries patterns from memory.
