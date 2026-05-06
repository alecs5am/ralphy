# Composition — before-after-product

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Длина = 15-18s.

## Skeleton

```tsx
// src/videos/before-after-<slug>/index.tsx
import { AbsoluteFill, Audio, Sequence, Video, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
import { MinimalCaptions } from "../../lib/components/captions/MinimalCaptions";

const FPS = 30;
const FADE_FRAMES = 6;
const SPLIT_FRAME = 150; // 5s mark — pain → solution split
const MUSIC_CROSSFADE_FRAMES = 30;

export const BeforeAfterProduct = ({
  beforeScenes,    // 2-3 clips, total ~5s
  revealClip,      // 1-1.5s
  afterScenes,     // 2-3 clips, total ~9s
  voBeforeSrc,
  voAfterSrc,
  captionsBefore,  // Caption[]
  captionsAfter,   // Caption[]
  musicBeforeSrc,
  musicAfterSrc,
  totalDurationSec,
}: Props) => {
  const totalFrames = totalDurationSec * FPS;

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {/* "Before" section: pain scenes (~5s) */}
        {beforeScenes.map((scene, i) => (
          <React.Fragment key={`before-${i}`}>
            <TransitionSeries.Sequence durationInFrames={Math.round(scene.durationSec * FPS)}>
              <Video src={staticFile(scene.videoSrc)} muted />
            </TransitionSeries.Sequence>
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: FADE_FRAMES })}
            />
          </React.Fragment>
        ))}

        {/* Reveal: 1-1.5s */}
        <TransitionSeries.Sequence durationInFrames={Math.round(revealClip.durationSec * FPS)}>
          <Video src={staticFile(revealClip.videoSrc)} muted />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />

        {/* "After" section: demo + outro (~9s) */}
        {afterScenes.map((scene, i) => (
          <React.Fragment key={`after-${i}`}>
            <TransitionSeries.Sequence durationInFrames={Math.round(scene.durationSec * FPS)}>
              <Video src={staticFile(scene.videoSrc)} muted />
            </TransitionSeries.Sequence>
            {i < afterScenes.length - 1 && (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: FADE_FRAMES })}
              />
            )}
          </React.Fragment>
        ))}
      </TransitionSeries>

      {/* Captions split — Hormozi for "before", Minimal for "after" */}
      <Sequence from={0} durationInFrames={SPLIT_FRAME}>
        <HormoziCaptions captions={captionsBefore} />
      </Sequence>
      <Sequence from={SPLIT_FRAME}>
        <MinimalCaptions captions={captionsAfter} />
      </Sequence>

      {/* VO split */}
      <Sequence from={0} durationInFrames={SPLIT_FRAME}>
        <Audio src={staticFile(voBeforeSrc)} />
      </Sequence>
      <Sequence from={SPLIT_FRAME}>
        <Audio src={staticFile(voAfterSrc)} />
      </Sequence>

      {/* Music cross-fade на SPLIT_FRAME */}
      <Audio
        src={staticFile(musicBeforeSrc)}
        volume={(f) => {
          if (f < SPLIT_FRAME - MUSIC_CROSSFADE_FRAMES) return 0.6;
          if (f < SPLIT_FRAME) {
            const t = (f - (SPLIT_FRAME - MUSIC_CROSSFADE_FRAMES)) / MUSIC_CROSSFADE_FRAMES;
            return 0.6 * (1 - t);
          }
          return 0;
        }}
      />
      <Audio
        src={staticFile(musicAfterSrc)}
        volume={(f) => {
          if (f < SPLIT_FRAME) return 0;
          if (f < SPLIT_FRAME + MUSIC_CROSSFADE_FRAMES) {
            const t = (f - SPLIT_FRAME) / MUSIC_CROSSFADE_FRAMES;
            return 0.6 * t;
          }
          return 0.6;
        }}
        startFrom={0}
      />
    </AbsoluteFill>
  );
};
```

## Component choices

- **Captions split:** `HormoziCaptions` (before) → `MinimalCaptions` (after). Stylistic mirror of emotional arc.
- **Transitions:** `fade` 6 frames между всеми сценами. Reveal frame fades in from black за 6 frames для subtle drama.
- **NO hook screenshot** в этом template — pain hook сам по себе acts as visual hook.

## Audio mix

| Track | Volume | Duck under VO? |
|---|---|---|
| VO before | 1.0 | — |
| VO after | 1.0 | — |
| Music before | 0.6 baseline, fade out @ split | yes (duck к 0.15 при VO) |
| Music after | 0.6 baseline, fade in @ split | yes (duck к 0.15 при VO) |

For full ducking — wrap each music's `volume` lambda inside another `interpolate` checking VO active windows. См. `ralph-editor/rules/audio-mixing.md` для ducking pattern.

Loudnorm post через `ralphy render <id> --loudnorm`.

## Composition props shape

```json
{
  "compositionId": "BeforeAfterProduct",
  "totalDurationSec": 15,
  "beforeScenes": [
    { "id": "scene-before-01", "durationSec": 2, "videoSrc": "videos/scene-before-01.mp4" },
    { "id": "scene-before-02", "durationSec": 3, "videoSrc": "videos/scene-before-02.mp4" }
  ],
  "revealClip": { "id": "scene-reveal", "durationSec": 1, "videoSrc": "videos/scene-reveal.mp4" },
  "afterScenes": [
    { "id": "scene-after-01", "durationSec": 4, "videoSrc": "videos/scene-after-01.mp4" },
    { "id": "scene-after-02", "durationSec": 3, "videoSrc": "videos/scene-after-02.mp4" },
    { "id": "scene-outro", "durationSec": 2, "videoSrc": "videos/scene-outro.mp4" }
  ],
  "voBeforeSrc": "voiceover/vo-before.mp3",
  "voAfterSrc": "voiceover/vo-after.mp3",
  "captionsBefore": [...],
  "captionsAfter": [...],
  "musicBeforeSrc": "music/music-before.mp3",
  "musicAfterSrc": "music/music-after.mp3"
}
```

## Quirks / gotchas

- **Reveal timing critical.** `SPLIT_FRAME = 150` (5s @ 30fps). Если reveal не lands ровно в этой точке — emotional arc ломается. Editor должен confirm reveal video clip's "moment of reveal" совпадает с split.
- **Music cross-fade** длиной 30 frames (1s) — short. Не делай длиннее, иначе reveal "размывается" между двумя tracks.
- **Captions caption-style switch может быть jarring** — если scenarist хочет smoother — оставь HormoziCaptions всю длину но scale-down к "after" (custom scale prop).
- **Logo accuracy в reveal** — pre-render `scoreImage` ≥8 на reveal frame. Если AI gallluc'нул лого — re-render reveal frame перед video gen.
