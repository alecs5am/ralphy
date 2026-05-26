# Composition — ai-vegetables

HyperFrames, 9:16, 30fps, 1080×1920. Composition length = sum(scene clip durations) + outro fade.

## Layer stack

1. **Scene videos** — each `<video class="clip" data-start="<offset>" data-duration="<dur>" data-volume="0" src="assets/videos/scene-NN-vid.mp4">`. Adjacent scenes overlap by 6 frames; GSAP fades opacity for the crossfade.
2. **Captions** — install a kinetic-slam caption block (`bunx hyperframes add kinetic-slam workspace/projects/<id>`) and point it at `captions.json`. Alt: a TikTok-style softer block if `scenario.captionStyle === "tiktok"`.
3. **VO master** — `<audio data-start="0" data-volume="1" src="assets/voiceover/master.mp3">`.
4. **Music bed** — `<audio data-start="0" data-volume="0.12" src="assets/music/bed.mp3">`. Schedule a GSAP tween on `data-volume` to lift to 0.7 in the gaps between VO sentences.

## Component choices

- **Captions:** kinetic-slam (default). Large pop, white fill with a black outline. Reads cleanly over photorealistic vegetable backgrounds.
- **Captions alt:** TikTok-style block if the scenario wants a less aggressive feel — better for narrative scenes.
- **Transitions:** 6-frame opacity fade between scenes (GSAP). Don't use wipe / slide / shader transitions — they break the deadpan tone.
- **Hook overlay:** **not used** in this template. 15s is too short for a hook-screenshot card; the very first keyframe is the hook.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 (baseline) | mono, mp3 128kbps |
| Music bed | 0.12 while VO is active, 0.7 in the gaps | GSAP-keyframed `data-volume` schedule |

Loudnorm post-render via `ralphy render <id> --loudnorm` (EBU R128 -16 LUFS for TikTok).

## Scene shape

`workspace/projects/<id>/scenario.json` carries the scene list; the editor wires each into `index.html`:

```json
{
  "scenes": [
    { "id": "scene-01", "durationSec": 4, "videoSrc": "videos/scene-01-vid.mp4" },
    { "id": "scene-02", "durationSec": 4, "videoSrc": "videos/scene-02-vid.mp4" },
    { "id": "scene-03", "durationSec": 4, "videoSrc": "videos/scene-03-vid.mp4" },
    { "id": "scene-04", "durationSec": 3, "videoSrc": "videos/scene-04-vid.mp4" }
  ],
  "captionStyle": "kinetic-slam",
  "musicSrc": "music/bed.mp3"
}
```

## Render

```bash
ralphy render <project-id>                # default — final.mp4
ralphy render <project-id> --loudnorm     # EBU R128 post-process
```

## Quirks / gotchas

- **Limb consistency.** kling-v3.0-pro occasionally morphs vegetable limbs between frames. If `scoreVideo` motion ≤ 3/10, regen with a shorter clip (3s instead of 5s) — short clips give the motion model less room to drift.
- **Caption placement.** Safe rectangles: hook at Y 280-340, supporting text at Y 1100. Don't place captions directly over the vegetable — visual conflict, the eye doesn't know where to go.
- **TikTok engagement column.** Leave 200px of margin from the right edge in the hook scene; the like/share/comment column on TikTok will overlap otherwise.

See [`docs/playbooks/hyperframes.md`](../../../docs/playbooks/hyperframes.md) for the full authoring rules.
