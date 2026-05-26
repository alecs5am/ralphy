# Composition — talking-head-rant

HyperFrames, 9:16, 30fps, 1080×1920. Length = video clip + 0.5s outro fade.

## Layer stack

A single-take talking-head composition with an optional Reddit/headline hook overlay.

1. **Talking-head video** — full duration, full-bleed. `<video data-start="0" data-volume="0">` (audio muted; VO is its own track).
2. **Hook screenshot overlay** (optional, first 3-4s) — full-screen overlay at 60-70% of canvas, semi-transparent dark backdrop, GSAP fade-out in the last 30 frames of its duration.
3. **Captions** — a karaoke / kinetic caption block from the HyperFrames registry (`bunx hyperframes add karaoke-warm` or `kinetic-slam`). Starts after the hook fades.
4. **VO** — `<audio data-start="0" data-volume="1">` mono mp3 128 kbps.
5. **Music bed** — `<audio data-start="0" data-volume="0.10">` low, constant, NOT ducked.

## Component choices

- **Captions:** kinetic-slam (default) — best for rant impact. Switch to karaoke-warm for a more intimate feel.
- **Caption start:** after the hook fades. Word-level timestamps in `captions.json` already sit on the VO timeline, so they line up automatically.
- **Caption position:** Y 1100-1300 — the supporting / CTA zone of the green safe area.
- **No transitions** — single continuous clip, no cuts. The talking-head must look continuous.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 | mono, mp3 128kbps |
| Music bed | 0.10 (constant) | very low — NOT ducked, always at the floor |

Loudnorm post-render via `ralphy render <id> --loudnorm`.

## Composition shape

Author at `workspace/projects/<id>/index.html`. The root needs `data-composition-id`, `data-width="1080"`, `data-height="1920"`, `data-start="0"`. A paused GSAP timeline drives the hook overlay opacity and the caption block reveal; the runtime owns video/audio playback via `data-start` / `data-duration` / `data-volume`.

See [`docs/playbooks/hyperframes.md`](../../../docs/playbooks/hyperframes.md) for the full authoring rules and `bunx hyperframes catalog` for available caption / hook overlay blocks.

## Quirks / gotchas

- **veo-3.1 lip-sync requires an audio reference in the request.** See `model-stack.md` Stage 2 — current `generateVideo` doesn't pass audio yet (tracked follow-on).
- **kling fallback is not lip-synced.** Captions help hide desync; don't compose a tight close-up on the mouth in this mode.
- **Hook timing.** If the scenarist picks a longer hook (5-6s), bump the overlay duration accordingly. Captions automatically start later.
- **Single take.** Do NOT cut. The talking-head must read as a continuous take or the intimacy breaks.
