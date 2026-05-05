# Remotion composition — talking-character

Структура `src/videos/<project-slug>/index.tsx` для talking-character template.

## Layout (single-scene, 9:16, 1080×1920)

```
┌───────────────────────────┐
│                           │
│       [Top UI safe]       │  ← Y < 210 — НЕ КЛАСТЬ ничего важного
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                           │
│   Talking-head video      │  ← Full-bleed <OffthreadVideo>
│   (wan-25 output)         │     900×1270 visible content area
│                           │
│   <HookCard>              │  ← (опц) первые 3s, Y=280
│                           │
│                           │
│   <Captions />            │  ← word-by-word, Y=1100 supporting,
│                           │     или Y=380 mid-upper
│                           │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│       [Bottom UI safe]    │  ← Y > 1480 — НЕ КЛАСТЬ
│                           │
└───────────────────────────┘
```

Для green-zone разметки см. `docs/green-zone.md`.

## Composition file structure

```tsx
import { AbsoluteFill, OffthreadVideo, Audio, Sequence,
         interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TikTokCaptions } from "../../lib/components/captions/TikTokCaptions";
import { HookCard } from "../../lib/components/overlays/HookCard";
import { HookScreenshot } from "../../lib/components/overlays/HookScreenshot";
import { GREEN_ZONE, getTextPreset } from "../../lib/utils/green-zone";

import captionsData from "../../../workspace/projects/<id>/captions.json";

const FPS = 30;
const DURATION_SEC = 10;     // или 5 — должно совпадать с wan-25 output
const DURATION_FRAMES = DURATION_SEC * FPS;

const HOOK_DURATION_FRAMES = 3 * FPS;   // hook visible first 3s
const MUSIC_FADE_IN_FRAMES = 0.5 * FPS;
const MUSIC_FADE_OUT_FRAMES = 1.0 * FPS;

export const TalkingCharacterComposition: React.FC<{
  videoSrc: string;       // staticFile("project-<id>/video/talking.mp4")
  audioSrc: string;       // staticFile("project-<id>/voiceover/master.mp3")
  musicSrc: string;       // staticFile("project-<id>/music/bed.mp3")
  hookText?: string;      // "Никто не скажет тебе..."
  hookScreenshot?: string;// optional: staticFile("project-<id>/hook.png")
}> = ({ videoSrc, audioSrc, musicSrc, hookText, hookScreenshot }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Music duck — fade in 0.5s, fade out 1s, hold at 0.12 in between
  const musicVolume = interpolate(
    frame,
    [
      0,
      MUSIC_FADE_IN_FRAMES,
      durationInFrames - MUSIC_FADE_OUT_FRAMES,
      durationInFrames,
    ],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ background: "black" }}>
      {/* Stage 1: full-bleed talking-head video */}
      <OffthreadVideo src={videoSrc} />

      {/* Stage 2: voiceover (already baked into wan-25 output, but for safety
          we can mute video and play audio separately if needed).
          В wan-25 output аудио уже встроено — НЕ дублировать. Если используешь
          сепаратное VO + silent video — раскомментируй: */}
      {/* <Audio src={audioSrc} /> */}

      {/* Stage 3: hook overlay (first 3s) */}
      {hookScreenshot && (
        <Sequence from={0} durationInFrames={HOOK_DURATION_FRAMES + 30}>
          <HookScreenshot src={hookScreenshot} durationFrames={HOOK_DURATION_FRAMES + 30} />
        </Sequence>
      )}
      {hookText && !hookScreenshot && (
        <Sequence from={0} durationInFrames={HOOK_DURATION_FRAMES}>
          <HookCard text={hookText} position="top" />
        </Sequence>
      )}

      {/* Stage 4: word-by-word captions */}
      <TikTokCaptions captions={captionsData} />

      {/* Stage 5: music bed (low) */}
      <Audio src={musicSrc} volume={musicVolume} />
    </AbsoluteFill>
  );
};
```

## Root.tsx registration

```tsx
import { Composition } from "remotion";
import { TalkingCharacterComposition } from "./videos/<project-slug>";

<Folder name="Videos">
  <Composition
    id="<project-slug>"
    component={TalkingCharacterComposition}
    durationInFrames={DURATION_SEC * FPS}      // 300 or 150
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={{
      videoSrc: staticFile("project-<id>/video/talking.mp4"),
      audioSrc: staticFile("project-<id>/voiceover/master.mp3"),
      musicSrc: staticFile("project-<id>/music/bed.mp3"),
      hookText: "<from scenario.json hook.primary>",
    }}
  />
</Folder>
```

## composition-props.json

```json
{
  "videoSrc": "project-<id>/video/talking.mp4",
  "audioSrc": "project-<id>/voiceover/master.mp3",
  "musicSrc": "project-<id>/music/bed.mp3",
  "hookText": "Никто тебе не скажет почему джуны не растут"
}
```

## Symlink before preview/render

```bash
ln -sfn ../../workspace/projects/<id>/assets public/project-<id>
```

## Render

```bash
bunx remotion render <project-slug> \
  --props workspace/projects/<id>/composition-props.json \
  --output workspace/projects/<id>/render/final.mp4
```

## Variations

- **С separate VO** (если хочешь скип wan-25 и юзать обычный i2v + post lipsync):
  - `<Audio src={audioSrc} />` раскомментить
  - i2v через `kling/v3/pro` (silent), потом `fal-ai/sync-lipsync` post-process,
    или `<Audio>` track поверх (приемлемо для quick-and-dirty без lipsync)

- **С hook screenshot** (Reddit post / chat / news headline):
  - Использовать `<HookScreenshot src={...} />` (Sprint 3.3) первые 4s

- **Multi-clip stitch** (если VO > 10s):
  - Делишь VO на куски ≤10s, каждый прогоняешь через wan-25 отдельно,
    потом `TransitionSeries` с `<Sequence>` для каждого.

## Anti-patterns

- Дублирование audio (wan-25 output + separate `<Audio>`) → echo. Выбери одно.
- Captions без green-zone → закроется UI платформы. Используй `getTextPreset`.
- Musik volume > 0.2 → перебивает VO → теряется hook clarity.
- TransitionSeries без причины — для talking-character один Sequence лучше.
