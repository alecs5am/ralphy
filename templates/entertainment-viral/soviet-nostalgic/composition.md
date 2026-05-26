# HyperFrames composition pattern

Skeleton for a `soviet-nostalgic` project. Author the composition at `workspace/projects/<id>/index.html` and drive playback with a paused GSAP timeline on `window.__timelines["<id>"]`.

## Aspect / frame

- **Aspect:** 9:16
- **Resolution:** 1080×1920
- **FPS:** 30

## Beat structure

The canonical soviet-nostalgic run has 8 clips with a music-era flip between clip 5 and clip 6 (Soviet bed → modern hip-hop bed), short crossfades between clips, and a 2-second outro card.

| # | Slug | Duration | Music bed |
|---|---|---|---|
| 1 | clip-01 | 9s | soviet-bed.mp3 |
| 2 | clip-02 | 11s | soviet-bed.mp3 |
| 3 | clip-03 | 7s | soviet-bed.mp3 |
| 4 | clip-04 | 10s | soviet-bed.mp3 |
| 5 | clip-05 | 5s | soviet-bed.mp3 |
| 6 | clip-06 | 7s | hiphop-bed.mp3 |
| 7 | clip-07 | 8s | hiphop-bed.mp3 |
| 8 | clip-08 | 8s | hiphop-bed.mp3 |
| outro | OutroCard | 2s | hiphop-bed.mp3 |

Crossfade duration: 12 frames (0.4s) between adjacent clips. The music era-flip is a hard swap at the start of clip-06 (no crossfade between music tracks).

## Layer stack

1. **Video clips** — each `<video class="clip" data-start="<offset>" data-duration="<dur>" data-volume="0" src="assets/clip-NN.mp4">`. Adjacent clips overlap by 12 frames; the GSAP timeline fades the incoming opacity from 0 to 1 across that window.
2. **Title card** — `{BRAND}TitleCard` block. Drop in via `bunx hyperframes add lower-third` or hand-roll an HTML/GSAP card with the brand tagline and reveal timing.
3. **Captions** — a karaoke / kinetic caption block from the registry (`bunx hyperframes add karaoke-warm` or `kinetic-slam`).
4. **Music bed (era 1)** — `<audio data-start="0" data-duration="<sum of clips 1..5>" data-volume="0.18" src="assets/music/soviet-bed.mp3">`.
5. **Music bed (era 2)** — `<audio data-start="<flip>" data-volume="0.20" src="assets/music/hiphop-bed.mp3">`.
6. **Outro card** — final 2s, brand wordmark + URL.

## Authoring tips

- Build the offsets in plain JS at the top of the `<script>` tag — `let t = 0; for (const dur of [9,11,7,10,5,7,8,8]) { ... t += dur - 0.4; }`. The 0.4 is the crossfade overlap.
- GSAP timeline: `tl.fromTo("#clip-02", { opacity: 0 }, { opacity: 1, duration: 0.4 }, clip01End - 0.4)` per crossfade.
- The root element needs `data-composition-id`, `data-width="1080"`, `data-height="1920"`, `data-start="0"`.
- Pass the brand wordmark + tagline + clip durations as `data-composition-variables` on the root so `ralphy template use` can substitute them.

See [`docs/playbooks/hyperframes.md`](../../../docs/playbooks/hyperframes.md) for the full authoring rules and `bunx hyperframes catalog` for available blocks.
