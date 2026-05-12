# Composition — ai-drama

Remotion 4.0.441, 9:16, 30fps, 1080×1920. Composition length = number of scenes × 8s (= 240 frames per scene). Default 7 scenes × 8s = 56s = 1680 frames.

## What this composition does and does not do

**Does:**
- Plays the concatenated Veo mp4 (which already carries dialogue + minimal ambient + silence-between-lines audio)
- Overlays single-word popup captions in TheBoldFont via `PopWordCaptions`

**Does NOT:**
- Add a separate `<Audio>` component for VO (Veo audio IS the VO)
- Add a separate `<Audio>` component for music (the no-music clause keeps Veo from generating any, and we don't layer one on top)
- Add transition effects between scenes — Veo gives each clip its own cut feel and the captions punch the rhythm. Adding cross-fades smudges the popwords spring animation.

If you find yourself adding `<Audio src={musicBed} />` to this composition, **STOP** — you're re-introducing the double-music bug. Re-read `model-stack.md → Stage 5`.

## Skeleton

```tsx
// src/videos/<project-slug>/index.tsx
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { PopWordCaptions } from "../../lib/components/captions/PopWordCaptions";
import { captions } from "./captions";

export const FPS = 30;
export const DURATION_SEC = 56;            // adjust to actual concat duration
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS);

export const AiDramaVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile("<project-slug>/render/final.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <PopWordCaptions
        captions={captions}
        fontSize={140}
        bottomOffset={360}
      />
    </AbsoluteFill>
  );
};
```

Notes:
- `<OffthreadVideo>` is mandatory. Plain `<Video>` reads the whole clip into RAM and stalls on 56s 1080p assets.
- `staticFile()` resolves against `public/`. The convention is `public/<project-slug>` symlinked to `workspace/projects/<project-slug>`. See "Staging" below.
- `captions` is a TypeScript module that re-exports the `Caption[]` from `captions.json` (so the bundle doesn't have to read JSON at runtime).
- `PopWordCaptions` defaults are tuned for 1080×1920. If you're rendering at a different size, scale `fontSize` proportionally.

## Captions module

```ts
// src/videos/<project-slug>/captions.ts
import type { Caption } from "@remotion/captions";
export const captions: Caption[] = /* …paste captions.json array… */;
```

Generate with:

```bash
P=workspace/projects/<project-slug>
ralphy generate captions \
  --project <project-slug> \
  --audio $P/render/final.mp4 \
  --language en

# Then copy captions.json into src/videos/<project-slug>/captions.ts:
echo "import type { Caption } from '@remotion/captions';" > src/videos/<slug>/captions.ts
echo "export const captions: Caption[] = " >> src/videos/<slug>/captions.ts
cat workspace/projects/<slug>/captions.json >> src/videos/<slug>/captions.ts
echo ";" >> src/videos/<slug>/captions.ts
```

## Staging — getting `final.mp4` reachable via `staticFile()`

Remotion's `staticFile()` resolves paths against the project's `public/` directory. Per-project assets live in `workspace/projects/<slug>/` (gitignored). We symlink so the composition stays declarative:

```bash
cd public
ln -s ../workspace/projects/<project-slug> <project-slug>
```

After the link, `staticFile("<project-slug>/render/final.mp4")` resolves to `workspace/projects/<project-slug>/render/final.mp4`.

## Register in Root.tsx

Under the `Videos` folder:

```tsx
import { AiDramaVideo, TOTAL_FRAMES as AI_DRAMA_FRAMES } from "./videos/<project-slug>";

<Composition
  id="<ProjectCompositionId>"   // e.g. "FruitDrama001"
  component={AiDramaVideo}
  durationInFrames={AI_DRAMA_FRAMES}
  fps={30}
  width={1080}
  height={1920}
/>
```

## Render

```bash
# Render the popwords-overlaid final
bunx remotion render src/index.ts <ProjectCompositionId> \
  workspace/projects/<slug>/render/final-popwords.mp4 \
  --codec h264 --crf 18 --concurrency 4
```

Or via `ralphy render <slug>` once `composition-props.json` is wired (optional).

## Audio mix table

| Track | Source | Volume | Notes |
|---|---|---|---|
| Veo native dialogue | `<OffthreadVideo>` baked-in audio | 1.0 (baseline) | Carries dialogue + minimal diegetic ambient |
| ~~VO~~ | — | — | **NOT USED** — Veo native IS the VO |
| ~~Music bed~~ | — | — | **NOT USED** — the no-music clause keeps the Veo audio clean |

Loudnorm to TikTok target is done at the ffmpeg concat step, before the Remotion render:

```bash
ffmpeg -i concat.mp4 \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:v copy -c:a aac -b:a 192k \
  final.mp4
```

## Quirks / gotchas

- **Font flash on first render.** `PopWordCaptions` loads TheBoldFont via injected `@font-face` — the first frame can render with the system fallback if the font isn't preloaded in the browser cache. Mitigate by setting `font-display: block` (already in the component) and running a dry-render preview first.
- **Caption-on-mouth conflict.** The `bottomOffset={360}` default keeps the captions ABOVE the character's lower jaw at ~y=1420. If your scenes frame the character lower in canvas, bump `bottomOffset` to 280 (sits higher). Don't go below 240 — overlaps TikTok's engagement column.
- **Word-level timing rolls over scene cuts.** `captions.json` is timestamped against the *concatenated* audio, not per scene. As long as the Remotion composition's video source is also `concat.mp4` (or its loudnorm'd derivative), timestamps line up perfectly.
- **Cyrillic in TheBoldFont.** The shipped TTF supports Latin only. If your dialogue is Russian, fall back to `HormoziCaptions` (Montserrat 900 with Cyrillic) — accept the per-page grouping difference, or source a TheBoldFont Cyrillic variant separately.

## What to do when the audio QA fails

If after concat the `silencedetect=noise=-35dB:d=0.4` check finds NO silence gaps in a clip that has dialogue pauses, Veo generated music despite the no-music clause. Two recovery paths:

1. **Re-render the offending scene** with stronger anti-music wording: bump the no-music clause to ALL CAPS, repeat it twice, add "totally silent backing track."
2. **Strip the Veo music** from the clip in post: nearly impossible — Veo mixes dialogue + ambient + music into one track. Stem-splitting (e.g. Demucs) introduces artifacts that destroy lip-sync. Re-rendering is the right move.
