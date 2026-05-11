# Composition — ai-vegetables

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Composition length = sum(scene clip durations) + outro fade.

## Skeleton

```tsx
// src/videos/ai-vegetables-<slug>/index.tsx
import React from "react";
import { AbsoluteFill, Audio, Video, staticFile, useVideoConfig, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
// or TikTokCaptions, depending on scenario.captionStyle

const FADE_FRAMES = 6; // ~200ms @ 30fps

type Scene = { id: string; durationSec: number; videoSrc: string; voEndFrame?: number };
type Props = { scenes: Scene[]; captions: Caption[]; musicSrc: string };

export const AiVegetablesVideo: React.FC<Props> = ({ scenes, captions, musicSrc }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {scenes.map((scene, i) => (
          <React.Fragment key={scene.id}>
            <TransitionSeries.Sequence durationInFrames={Math.round(scene.durationSec * fps)}>
              <Video src={staticFile(scene.videoSrc)} muted />
            </TransitionSeries.Sequence>
            {i < scenes.length - 1 && (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: FADE_FRAMES })}
              />
            )}
          </React.Fragment>
        ))}
      </TransitionSeries>

      {/* Captions overlay — read from captions.json (Caption[] format) */}
      <HormoziCaptions captions={captions} />

      {/* VO + music — duck music under VO */}
      <Audio src={staticFile("voiceover/master.mp3")} />
      <Audio
        src={staticFile(musicSrc)}
        volume={(f) => duckUnderVO(f, scenes, fps)}
      />
    </AbsoluteFill>
  );
};

// Helper: 0.12 while any VO is active, 0.7 in the gaps.
const duckUnderVO = (frame: number, scenes: Scene[], fps: number): number => {
  // ...derive VO active windows from scene.voEndFrame and scene start frames...
  // Replace with the actual ducking math you generate from scenario.json.
  return 0.7;
};
```

## Component choices

- **Captions:** `HormoziCaptions` (default). Large pop, white fill with a black outline. Reads cleanly over photorealistic vegetable backgrounds.
- **Captions alt:** `TikTokCaptions` if `scenario.captionStyle === "tiktok"` (less aggressive — better for narrative scenes).
- **Transitions:** `fade` 6 frames between scenes. Don't use wipe / slide — they break the deadpan tone.
- **Hook overlay:** **not used** in this template. 15s is too short for a hook-screenshot card; the very first keyframe is the hook.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 (baseline) | mono, mp3 128kbps |
| Music bed | 0.12 while VO is active, 0.7 in the gaps | duck via `interpolate` |

Loudnorm post-render via `ralphy render <id> --loudnorm` (EBU R128 -16 LUFS for TikTok).

## Composition props shape

`workspace/projects/<id>/composition-props.json`:

```json
{
  "compositionId": "AiVegetablesVideo",
  "durationSec": 15,
  "scenes": [
    { "id": "scene-01", "durationSec": 4, "videoSrc": "videos/scene-01-vid.mp4" },
    { "id": "scene-02", "durationSec": 4, "videoSrc": "videos/scene-02-vid.mp4" },
    { "id": "scene-03", "durationSec": 4, "videoSrc": "videos/scene-03-vid.mp4" },
    { "id": "scene-04", "durationSec": 3, "videoSrc": "videos/scene-04-vid.mp4" }
  ],
  "captionStyle": "hormozi",
  "musicSrc": "music/bed.mp3"
}
```

`durationFrames` is computed by the editor: `durationSec * 30`.

## Register in Root.tsx

```tsx
<Composition
  id="AiVegetablesVideo"
  component={AiVegetablesVideo}
  durationInFrames={SCENES_TOTAL_FRAMES}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{ /* ... */ }}
/>
```

Place it under the `Videos` `<Folder>` in `src/Root.tsx`.

## Render

```bash
ralphy render <project-id>                # default — final.mp4
ralphy render <project-id> --loudnorm     # EBU R128 post-process
```

## Quirks / gotchas

- **Limb consistency.** kling-v3.0-pro occasionally morphs vegetable limbs between frames. If `scoreVideo` motion ≤ 3/10, regen with a shorter clip (3s instead of 5s) — short clips give the motion model less room to drift.
- **Caption placement.** Safe rectangles: hook at Y 280-340, supporting text at Y 1100. Don't place captions directly over the vegetable — visual conflict, the eye doesn't know where to go.
- **TikTok engagement column.** Leave 200px of margin from the right edge in the hook scene; the like/share/comment column on TikTok will overlap otherwise.
