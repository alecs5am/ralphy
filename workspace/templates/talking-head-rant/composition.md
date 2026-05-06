# Composition — talking-head-rant

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Длина = video clip + 0.5s outro fade.

## Skeleton

```tsx
// src/videos/talking-head-rant-<slug>/index.tsx
import { AbsoluteFill, Audio, Sequence, Video, staticFile } from "remotion";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
// HookScreenshot — TODO component, see "Hook screenshot overlay" below

const FPS = 30;

export const TalkingHeadRant = ({
  videoSrc,
  voSrc,
  musicSrc,
  captions,
  hookScreenshotSrc,    // optional
  hookDurationSec,       // 3-4
  totalDurationSec,
}: Props) => {
  const totalFrames = totalDurationSec * FPS;
  const hookFrames = (hookDurationSec ?? 0) * FPS;

  return (
    <AbsoluteFill>
      {/* Talking-head video — full duration */}
      <Video src={staticFile(videoSrc)} muted />

      {/* Hook screenshot overlay — first 3-4 seconds, fade-out last 30 frames */}
      {hookScreenshotSrc && (
        <Sequence from={0} durationInFrames={hookFrames}>
          <HookScreenshot
            src={staticFile(hookScreenshotSrc)}
            durationFrames={hookFrames}
            fadeFrames={30}
            position="center"
          />
        </Sequence>
      )}

      {/* Captions — start after hook fade-out */}
      <Sequence from={hookFrames}>
        <HormoziCaptions captions={captions} />
      </Sequence>

      {/* VO — full duration */}
      <Audio src={staticFile(voSrc)} />

      {/* Music bed — very low volume */}
      <Audio src={staticFile(musicSrc)} volume={0.10} />
    </AbsoluteFill>
  );
};
```

## Hook screenshot overlay

**Component:** `src/lib/components/overlays/HookScreenshot.tsx` (TODO — to create in followup).

Contract:
```ts
type Props = {
  src: string;            // staticFile path
  durationFrames?: number;  // default 120 (4s @ 30fps)
  fadeFrames?: number;      // default 30 (1s)
  position?: "center" | "top";
};
```

Displays full-screen overlay scaled 60-70% of canvas, semi-transparent dark backdrop, fades out in last `fadeFrames` of duration. Uses `interpolate(frame, [duration-fadeFrames, duration], [1, 0])`.

Fallback while component не создан — use static `<Img>` с manual fade:

```tsx
import { Img, interpolate, useCurrentFrame } from "remotion";

const HookFallback = ({ src, hookFrames }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [hookFrames - 30, hookFrames], [1, 0], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: "rgba(0,0,0,0.4)", opacity }}>
      <Img src={src} style={{ width: "70%", margin: "auto", marginTop: "20%" }} />
    </AbsoluteFill>
  );
};
```

## Component choices

- **Captions:** `HormoziCaptions` (default) — best для rant impact. `KaraokeCaptions` если more intimate.
- **Caption timing:** start at `hookFrames` (после hook fade-out). Word-level timestamps в `captions.json` уже adjusted к VO timing.
- **Caption position:** Y 1100-1300 range — supporting/CTA zone из green-zone.
- **NO transitions** — single clip, no cuts. talking-head must look continuous.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 | mono, mp3 128kbps |
| Music bed | 0.10 (constant) | very low — NOT ducked, всегда minimum |

Loudnorm post через `ralphy render <id> --loudnorm`.

## Composition props shape

```json
{
  "compositionId": "TalkingHeadRant",
  "durationSec": 18,
  "videoSrc": "videos/talking-head.mp4",
  "voSrc": "voiceover/vo-master.mp3",
  "musicSrc": "music/bed.mp3",
  "captionsSrc": "captions.json",
  "hookScreenshotSrc": "uploaded/hook-reddit-post.png",
  "hookDurationSec": 4
}
```

`captions` — Caption[] загружается из `captionsSrc`.

## Register

```tsx
<Composition
  id="TalkingHeadRant"
  component={TalkingHeadRant}
  durationInFrames={18 * 30}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={...}
/>
```

## Quirks / gotchas

- **veo-3.1 lip-sync requires audio in request** — see `model-stack.md` Stage 2 ВАЖНО note.
- **kling fallback не lip-sync** — captions помогают спрятать desync; не показывай сильный close-up на mouth.
- **Hook screenshot timing** — если scenarist выбрал longer hook (5-6s), увеличь `hookDurationSec` accordingly. Captions автоматически start позже.
- **Single take** — НЕ используй TransitionSeries с cuts. talking-head must be continuous.
