# Composition — ai-vegetables

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Длина композиции = sum(scene clips) + outro fade.

## Skeleton

```tsx
// src/videos/ai-vegetables-<slug>/index.tsx
import { AbsoluteFill, Audio, Sequence, Video, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
// or TikTokCaptions per scenario.captionStyle

const FADE_FRAMES = 6; // 200ms @ 30fps

export const AiVegetablesVideo = ({ scenes, captions, musicSrc }: Props) => {
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

      {/* Captions overlay — read from captions.json (Caption[]) */}
      <HormoziCaptions captions={captions} />

      {/* VO + music — duck music under VO */}
      <Audio src={staticFile("voiceover/master.mp3")} />
      <Audio
        src={staticFile(musicSrc)}
        volume={(f) => {
          const voActiveAt = (f: number) => /* derive from scenes[i].voEndFrame */;
          return voActiveAt(f) ? 0.12 : 0.7;
        }}
      />
    </AbsoluteFill>
  );
};
```

## Component choices

- **Captions:** `HormoziCaptions` (default) — large pop, white + black outline. Works well с photorealistic vegetable backgrounds.
- **Captions alt:** `TikTokCaptions` — если scenario.captionStyle = "tiktok" (less aggressive).
- **Transitions:** `fade` 6 frames между scenes. Не используй wipe / slide — стилистически выпадают.
- **Hook overlay:** **NOT** в этом template'е (15s слишком коротко для hook-screenshot). Вся attention — на самом первом keyframe.

## Audio mix

| Track | Volume | Notes |
|---|---|---|
| VO master | 1.0 (baseline) | mono, mp3 128kbps |
| Music bed | 0.12 при VO активной, 0.7 в паузах | duck via `interpolate` |

Loudnorm post-render через `ralphy render <id> --loudnorm` (EBU R128 -16 LUFS for TikTok).

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

`durationFrames` рассчитывается editor'ом: `durationSec * 30`.

## Register в Root.tsx

```tsx
<Composition
  id="AiVegetablesVideo"
  component={AiVegetablesVideo}
  durationInFrames={SCENES_TOTAL_FRAMES}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{...}}
/>
```

Под `Folder` "Videos" в `src/Root.tsx`.

## Render

```bash
ralphy render <project-id>                # default — final.mp4
ralphy render <project-id> --loudnorm     # EBU R128 post-process
```

## Quirks / gotchas

- **Photorealistic vegetable consistency** — kling-v3.0-pro иногда морфит лимбы между frames. Если score'нут ≥3/10 на motion — regenерь с короче clip (3s вместо 5s).
- **Captions безопасно ставить** в Y 280-340 (hook) или Y 1100 (supporting). НЕ под овощем (visual conflict).
- **Negative space на overlay** — оставляй 200px margin от right edge в hook scene; TikTok engagement column пересечётся.
