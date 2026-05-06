# Composition — talking-head-rant

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Length = video clip + 0.5s outro fade.

## Skeleton

```tsx
// src/videos/talking-head-rant-<slug>/index.tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, Video, Img, staticFile, interpolate, useCurrentFrame } from "remotion";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
// HookScreenshot is the dedicated component (TODO — see "Hook screenshot overlay" below).

const FPS = 30;

type Props = {
  videoSrc: string;
  voSrc: string;
  musicSrc: string;
  captions: Caption[];
  hookScreenshotSrc?: string;
  hookDurationSec?: number; // 3-4
  totalDurationSec: number;
};

export const TalkingHeadRant: React.FC<Props> = ({
  videoSrc, voSrc, musicSrc, captions,
  hookScreenshotSrc, hookDurationSec, totalDurationSec,
}) => {
  const hookFrames = (hookDurationSec ?? 0) * FPS;

  return (
    <AbsoluteFill>
      {/* Talking-head video — full duration */}
      <Video src={staticFile(videoSrc)} muted />

      {/* Hook screenshot overlay — first 3-4 seconds, fade-out last 30 frames */}
      {hookScreenshotSrc && (
        <Sequence from={0} durationInFrames={hookFrames}>
          <HookOverlay src={staticFile(hookScreenshotSrc)} hookFrames={hookFrames} />
        </Sequence>
      )}

      {/* Captions — start after the hook fades */}
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

// Inline fallback while the dedicated HookScreenshot component is still TODO.
const HookOverlay: React.FC<{ src: string; hookFrames: number }> = ({ src, hookFrames }) => {
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

## Hook screenshot overlay

**Component:** `src/lib/components/overlays/HookScreenshot.tsx` (TODO — to create as a follow-on).

Contract:
```ts
type Props = {
  src: string;             // staticFile path
  durationFrames?: number; // default 120 (4s @ 30fps)
  fadeFrames?: number;     // default 30 (1s)
  position?: "center" | "top";
};
```

Displays a full-screen overlay scaled to 60-70% of the canvas with a semi-transparent dark backdrop, fading out in the last `fadeFrames` of its duration via `interpolate(frame, [duration-fadeFrames, duration], [1, 0])`.

Until the dedicated component is created, the inline `HookOverlay` above does the same job.

## Component choices

- **Captions:** `HormoziCaptions` (default) — best for rant impact. Switch to `KaraokeCaptions` for a more intimate feel.
- **Caption start frame:** `hookFrames` (after the hook fades). Word-level timestamps in `captions.json` already sit on the VO timeline, so they'll line up automatically.
- **Caption position:** Y 1100-1300 — the supporting / CTA zone of the green safe area.
- **No transitions** — single continuous clip, no cuts. The talking-head must look continuous.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 | mono, mp3 128kbps |
| Music bed | 0.10 (constant) | very low — NOT ducked, always at the floor |

Loudnorm post-render via `ralphy render <id> --loudnorm`.

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

`captions` — load `Caption[]` from `captionsSrc` at the editor stage and pass it as a prop.

## Register

```tsx
<Composition
  id="TalkingHeadRant"
  component={TalkingHeadRant}
  durationInFrames={18 * 30}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{ /* ... */ }}
/>
```

## Quirks / gotchas

- **veo-3.1 lip-sync requires an audio reference in the request.** See `model-stack.md` Stage 2 — current `generateVideo` doesn't pass audio yet (tracked follow-on).
- **kling fallback is not lip-synced.** Captions help hide desync; don't compose a tight close-up on the mouth in this mode.
- **Hook timing.** If the scenarist picks a longer hook (5-6s), bump `hookDurationSec` accordingly. Captions automatically start later because they're sequenced from `hookFrames`.
- **Single take.** Do NOT use `TransitionSeries` with cuts. The talking-head must read as a continuous take or the intimacy breaks.
