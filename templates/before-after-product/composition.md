# Composition — before-after-product

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Total length: 15-18s.

## Skeleton

```tsx
// src/videos/before-after-<slug>/index.tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, Video, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
import { MinimalCaptions } from "../../lib/components/captions/MinimalCaptions";
import type { Caption } from "@remotion/captions";

const FPS = 30;
const FADE_FRAMES = 6;
const SPLIT_FRAME = 150; // 5s mark — pain → solution split
const MUSIC_CROSSFADE_FRAMES = 30; // 1s

type Scene = { id: string; durationSec: number; videoSrc: string };
type Props = {
  beforeScenes: Scene[];   // 2-3 clips, total ~5s
  revealClip: Scene;       // 1-1.5s
  afterScenes: Scene[];    // 2-3 clips, total ~9s
  voBeforeSrc: string;
  voAfterSrc: string;
  captionsBefore: Caption[];
  captionsAfter: Caption[];
  musicBeforeSrc: string;
  musicAfterSrc: string;
  totalDurationSec: number;
};

export const BeforeAfterProduct: React.FC<Props> = ({
  beforeScenes, revealClip, afterScenes,
  voBeforeSrc, voAfterSrc,
  captionsBefore, captionsAfter,
  musicBeforeSrc, musicAfterSrc,
}) => {
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

      {/* Music cross-fade at SPLIT_FRAME */}
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

- **Captions split:** `HormoziCaptions` (before) → `MinimalCaptions` (after). Visual mirror of the emotional arc.
- **Transitions:** `fade` 6 frames between every scene. The reveal frame fades in from black over 6 frames for subtle drama.
- **No hook screenshot** in this template — the pain visual is itself the hook.

## Audio mix

| Track | Volume | Duck under VO? |
|---|---|---|
| VO before | 1.0 | — |
| VO after | 1.0 | — |
| Music before | 0.6 baseline, fade out at split | yes (duck to 0.15 while VO is active) |
| Music after | 0.6 baseline, fade in at split | yes (duck to 0.15 while VO is active) |

For full ducking, wrap each music's `volume` lambda in another `interpolate` checking the VO active windows. See `ralph-editor/rules/audio-mixing.md` for the ducking pattern.

Loudnorm post-render via `ralphy render <id> --loudnorm`.

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
  "captionsBefore": [],
  "captionsAfter": [],
  "musicBeforeSrc": "music/music-before.mp3",
  "musicAfterSrc": "music/music-after.mp3"
}
```

## Quirks / gotchas

- **Reveal timing is critical.** `SPLIT_FRAME = 150` (5s @ 30fps). If the reveal doesn't land exactly on this frame, the emotional arc breaks. The editor must confirm the reveal clip's "moment of reveal" aligns with the split.
- **Music cross-fade is 30 frames (1s) — short.** Don't lengthen it; a longer fade smears the reveal between two tracks and kills the emotional payoff.
- **Caption-style switch can feel jarring.** If the scenarist wants something smoother, keep `HormoziCaptions` for the full duration and scale it down in the "after" section (custom `scale` prop).
- **Logo accuracy in the reveal.** Pre-render `scoreImage` ≥ 8 on the reveal frame. If the model hallucinated the logo, regen the reveal frame before generating video — fixing it later is a per-frame headache.
