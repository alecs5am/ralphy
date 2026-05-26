# Composition — before-after-product

HyperFrames, 9:16, 30fps, 1080×1920. Total length: 15-18s.

## Beat structure

The canonical before/after split lands the reveal at the 5s mark.

| Phase | Window | Content | Music |
|---|---|---|---|
| Before | 0–5s | 2-3 short pain-state clips (total ~5s) | `music-before.mp3` — flat, slightly melancholic, low energy |
| Reveal | 5.0–6.5s | 1–1.5s product reveal clip | crossfade music tracks across 30 frames |
| After | 6.5–15.0s | 2-3 solution clips (total ~9s) | `music-after.mp3` — upbeat, brighter |

## Layer stack

1. **Before clips** — `<video class="clip" data-start="<off>" data-duration="<dur>" data-volume="0">` stacked with 6-frame crossfades.
2. **Reveal clip** — `<video class="clip" data-start="5.0" data-duration="1.5" data-volume="0">` with a GSAP scale-in (`back.out(2)`) for impact.
3. **After clips** — same pattern, with brighter color grade applied via CSS `filter` on the wrapping `<div>`.
4. **Captions (before)** — minimal style block, low-energy (`bunx hyperframes add karaoke-warm` with a muted accent color).
5. **Captions (after)** — kinetic-slam block (`bunx hyperframes add kinetic-slam`) with high-energy reveals.
6. **VO (before)** — `<audio data-start="0" data-volume="1" src="assets/voiceover/vo-before.mp3">`.
7. **VO (after)** — `<audio data-start="<after-start>" data-volume="1" src="assets/voiceover/vo-after.mp3">`.
8. **Music before** — `<audio data-start="0" data-volume="0.12" src="assets/music/music-before.mp3">`. GSAP fades volume to 0 across the reveal window.
9. **Music after** — `<audio data-start="<reveal-end>" data-volume="0" src="assets/music/music-after.mp3">`. GSAP fades volume from 0 to 0.15 across the reveal window.

## Component choices

- **Captions:** karaoke-warm (calm, muted) for the before phase; kinetic-slam (energetic) for the after phase. The contrast in caption energy reinforces the emotional flip.
- **Transition:** 6-frame fade between adjacent clips. The reveal itself uses a GSAP scale-in, not a transition block.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 | mono mp3, two separate files for before / after halves |
| Music before | 0.12 | ducks to 0 over reveal window |
| Music after | 0 → 0.15 | ramps in over reveal window |

Loudnorm post-render via `ralphy render <id> --loudnorm`.

## Authoring

Build offsets in JS inside the `<script>` tag, register the timeline on `window.__timelines["<id>"]`, mark all timed elements with `class="clip"` and `data-start` / `data-duration` attributes. The root needs `data-composition-id`, `data-width="1080"`, `data-height="1920"`, `data-start="0"`.

See [`docs/playbooks/hyperframes.md`](../../../docs/playbooks/hyperframes.md) for the full authoring rules and `bunx hyperframes catalog` for caption / transition / overlay blocks.
