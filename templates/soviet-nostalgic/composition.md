# Remotion composition pattern

Skeleton for a project video composition. Drop into `src/videos/{project-id}/index.tsx` and register in `src/Root.tsx`.

Adjust:
- `CLIPS` durations to match your actual VO lengths (use `Math.ceil(vo_seconds)`)
- `music/soviet-bed.mp3` and `music/hiphop-bed.mp3` paths (under `project-{id}/music/` in public)
- `CottonMetalTitle` → `{BRAND}TitleCard` with your tagline + reveal timing
- `OutroCard` content

```tsx
import { Fragment } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export const FPS = 30;

type Clip = { slug: string; durationSec: number };

const CLIPS: Clip[] = [
  { slug: "clip-01", durationSec: 9 },
  { slug: "clip-02", durationSec: 11 },
  { slug: "clip-03", durationSec: 7 },
  { slug: "clip-04", durationSec: 10 },
  { slug: "clip-05", durationSec: 5 },
  { slug: "clip-06", durationSec: 7 },
  { slug: "clip-07", durationSec: 8 },
  { slug: "clip-08", durationSec: 8 },
];

const OUTRO_SEC = 2;
const TRANSITION_FRAMES = 12;           // 0.4s crossfade
const ERA_FLIP_INDEX = 5;               // music flips at the start of this clip (0-indexed)

const CLIP_FRAMES = CLIPS.map((c) => c.durationSec * FPS);
const RAW_TOTAL = CLIP_FRAMES.reduce((s, f) => s + f, 0);
export const CLIPS_TOTAL_FRAMES = RAW_TOTAL - TRANSITION_FRAMES * (CLIPS.length - 1);
export const TOTAL_FRAMES = CLIPS_TOTAL_FRAMES + OUTRO_SEC * FPS;

// Effective start frame of each clip on the post-transition timeline.
const CLIP_STARTS = CLIP_FRAMES.reduce<number[]>((acc, _f, i) => {
  if (i === 0) return [0];
  acc.push(acc[i - 1] + CLIP_FRAMES[i - 1] - TRANSITION_FRAMES);
  return acc;
}, []);

const PROJECT_SLUG = "project-{PROJECT_ID}"; // e.g. "project-solutions-metal-001"
const asset = (slug: string) => `${PROJECT_SLUG}/renders/${slug}-kling.mp4`;
const voice = (slug: string) => `${PROJECT_SLUG}/voiceover/${slug}.mp3`;
const SOVIET_MUSIC = `${PROJECT_SLUG}/music/soviet-bed.mp3`;
const HIPHOP_MUSIC = `${PROJECT_SLUG}/music/hiphop-bed.mp3`;

export const Video: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Music split: Soviet on era-1 clips, hip-hop on era-2 clips */}
      <Sequence from={0} durationInFrames={CLIP_STARTS[ERA_FLIP_INDEX]}>
        <SovietBed totalFrames={CLIP_STARTS[ERA_FLIP_INDEX]} />
      </Sequence>
      <Sequence
        from={CLIP_STARTS[ERA_FLIP_INDEX]}
        durationInFrames={CLIPS_TOTAL_FRAMES - CLIP_STARTS[ERA_FLIP_INDEX]}
      >
        <HipHopBed totalFrames={CLIPS_TOTAL_FRAMES - CLIP_STARTS[ERA_FLIP_INDEX]} />
      </Sequence>

      {/* Videos with soft fade crossfades */}
      <TransitionSeries>
        {CLIPS.map((c, i) => (
          <Fragment key={c.slug}>
            <TransitionSeries.Sequence durationInFrames={CLIP_FRAMES[i]}>
              <OffthreadVideo
                src={staticFile(asset(c.slug))}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
              {/* Title overlay only on final clip */}
              {i === CLIPS.length - 1 ? (
                <TitleOverlay totalFrames={CLIP_FRAMES[i]} />
              ) : null}
            </TransitionSeries.Sequence>
            {i < CLIPS.length - 1 ? (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />
            ) : null}
          </Fragment>
        ))}
      </TransitionSeries>

      {/* Per-scene VO anchored to effective clip starts, with 6-frame fades */}
      {CLIPS.map((c, i) => (
        <Sequence
          key={`vo-${c.slug}`}
          from={CLIP_STARTS[i]}
          durationInFrames={CLIP_FRAMES[i]}
        >
          <Audio
            src={staticFile(voice(c.slug))}
            volume={(f) =>
              interpolate(
                f,
                [0, 6, CLIP_FRAMES[i] - 6, CLIP_FRAMES[i]],
                [0, 1, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            }
          />
        </Sequence>
      ))}

      {/* Outro card */}
      <Sequence from={CLIPS_TOTAL_FRAMES} durationInFrames={OUTRO_SEC * FPS}>
        <OutroCard durationFrames={OUTRO_SEC * FPS} />
      </Sequence>
    </AbsoluteFill>
  );
};

// Soviet bed — fades in 1s, hard duck in last 5 frames so hip-hop lands clean
const SovietBed: React.FC<{ totalFrames: number }> = ({ totalFrames }) => (
  <Audio
    src={staticFile(SOVIET_MUSIC)}
    volume={(f) =>
      interpolate(
        f,
        [0, FPS, totalFrames - 5, totalFrames],
        [0, 0.14, 0.14, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    }
  />
);

// Hip-hop bed — punchy 2-frame attack, 2s fade-out at end for outro
const HipHopBed: React.FC<{ totalFrames: number }> = ({ totalFrames }) => (
  <Audio
    src={staticFile(HIPHOP_MUSIC)}
    volume={(f) =>
      interpolate(
        f,
        [0, 2, totalFrames - FPS * 2, totalFrames],
        [0, 0.28, 0.28, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    }
  />
);

const TitleOverlay: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const appearStart = totalFrames - FPS * 1.5;
  const appearEnd = totalFrames - FPS * 0.7;
  const opacity = interpolate(frame, [appearStart, appearEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 160 }}>
      <div
        style={{
          fontFamily: "Helvetica Neue, Inter, sans-serif",
          fontWeight: 200,
          fontSize: 58,
          letterSpacing: 14,
          color: "#fff",
          opacity,
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
        }}
      >
        {/* Replace with {PRODUCT_NAME} */}
        PRODUCT NAME
      </div>
    </AbsoluteFill>
  );
};

const OutroCard: React.FC<{ durationFrames: number }> = ({ durationFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationFrames - 10, durationFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", justifyContent: "center", alignItems: "center", opacity }}>
      <div style={{ fontFamily: "Helvetica Neue, Inter, sans-serif", fontWeight: 200, fontSize: 56, letterSpacing: 4, color: "#fff" }}>
        {/* Replace with {BRAND_SHORT} */}
        .brand
      </div>
      <div style={{ marginTop: 28, fontFamily: "Helvetica Neue, Inter, sans-serif", fontWeight: 200, fontSize: 28, letterSpacing: 2, color: "#888" }}>
        {/* Replace with {BRAND_DOMAIN} */}
        brand.domain
      </div>
    </AbsoluteFill>
  );
};
```

## Registering in `src/Root.tsx`

```tsx
import { YourVideo, TOTAL_FRAMES } from "./videos/{project-id}";

<Composition
  id="YourVideoId"
  component={YourVideo}
  durationInFrames={TOTAL_FRAMES}
  fps={30}
  width={1080}
  height={1920}
/>
```

## Public symlink for staticFile()

```bash
ln -s ../workspace/projects/{project-id} public/project-{project-id}
```

This lets `staticFile("project-{project-id}/renders/clip-01-kling.mp4")` resolve during preview/render without copying files.

## Render command

```bash
npx remotion render YourVideoId workspace/projects/{project-id}/renders/final.mp4 --concurrency=6
```

Typical render time: ~2 minutes for 65s @ 1080×1920.
