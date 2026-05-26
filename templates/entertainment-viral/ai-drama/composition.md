# Composition — ai-drama

HyperFrames, 9:16, 30fps, 1080×1920. Composition length = number of scenes × 8s. Default 7 scenes × 8s = 56s.

## What this composition does and does not do

**Does:**
- Plays the concatenated Veo mp4 (which already carries dialogue + minimal ambient + silence-between-lines audio).
- Overlays single-word popup captions in TheBoldFont via a kinetic-slam style block.

**Does NOT:**
- Add a separate VO `<audio>` track (Veo audio IS the VO).
- Add a separate music `<audio>` track (the no-music clause keeps Veo from generating any, and we don't layer one on top).
- Add transition effects between scenes — Veo gives each clip its own cut feel and the captions punch the rhythm. Adding crossfades smudges the pop-word spring animation.

If you find yourself adding `<audio src="music.mp3">` to this composition, **STOP** — you're re-introducing the double-music bug. Re-read `model-stack.md → Stage 5`.

## Layer stack

1. **Concatenated Veo video** — `<video class="clip" data-start="0" data-duration="<total>" data-volume="1" src="assets/veo-concat.mp4">`. The video carries its own dialogue audio; `data-volume="1"` preserves it.
2. **Pop-word captions** — install a single-word kinetic-pop caption block: `bunx hyperframes add kinetic-slam workspace/projects/<id>`. Point it at `captions.json` and configure for one-word reveals with a spring scale-in.
3. **(optional) Title card / outro** — overlay `<div class="clip" data-start="<end-2>" data-duration="2">` with brand mark + URL, GSAP fade in / out.

## Audio

| Track | Volume | Notes |
|---|---|---|
| Concatenated Veo video | 1.0 | Veo audio IS the VO. Do NOT add a separate VO track. |
| Music | — | No music bed. Veo's no-music clause keeps it clean. |

Loudnorm post-render via `ralphy render <id> --loudnorm`.

## Authoring

The root needs `data-composition-id`, `data-width="1080"`, `data-height="1920"`, `data-start="0"`. The paused GSAP timeline only drives the caption pop-ins and the optional title-card fade — the video is owned by the runtime via `data-start` / `data-duration`.

See [`docs/playbooks/hyperframes.md`](../../../docs/playbooks/hyperframes.md) for the full authoring rules and `bunx hyperframes catalog` for caption / overlay blocks.
