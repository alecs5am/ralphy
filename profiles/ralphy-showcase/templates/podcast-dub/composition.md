# Remotion composition pattern

Skeleton for a podcast-dub composition. Drop into `src/videos/{project-id}/index.tsx` and register in `src/Root.tsx` with one `<Composition>` per episode (`defaultProps={{ episode: "01" }}`, etc.).

Adjust:
- `titlesMap` — per-episode English headline (2 short lines).
- `WORDS_PER_LINE` — drop to 2 if your language has long words.
- Title / karaoke colors — read off the reference edited Russian short.
- `paddingBottom` for title + karaoke — read off the reference short.
- `durationInFrames` registration — `Math.ceil(max(videoSec, audioSec) * 30)` per episode.

```tsx
import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import type { Caption } from "@remotion/captions";

// Per-episode captions — one file per episode, imported explicitly
import { captions as captions01 } from "./captions-01";
import { captions as captions02 } from "./captions-02";
// ...

const { fontFamily } = loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
});

export const captionsMap: Record<string, Caption[]> = {
  "01": captions01,
  "02": captions02,
  // ...
};

const titlesMap: Record<string, string> = {
  "01": "«Why do investors\ninvest in startups?»",
  // ... 2 short lines each, « / » are « »
};

const WORDS_PER_LINE = 3;
const TITLE_DURATION_FRAMES = 105; // ~3.5s at 30fps
const TITLE_ACCENT = "#FE2B02";
const KARAOKE_ACTIVE = "#FE0100";

interface WordGroup {
  words: { text: string; startMs: number; endMs: number }[];
  startMs: number;
  endMs: number;
}

function buildWordGroups(captions: Caption[]): WordGroup[] {
  const groups: WordGroup[] = [];
  for (let i = 0; i < captions.length; i += WORDS_PER_LINE) {
    const chunk = captions.slice(i, i + WORDS_PER_LINE);
    groups.push({
      words: chunk.map((c) => ({ text: c.text, startMs: c.startMs, endMs: c.endMs })),
      startMs: chunk[0].startMs,
      endMs: chunk[chunk.length - 1].endMs,
    });
  }
  return groups;
}

const PROJECT_SLUG = "project-{PROJECT_ID}"; // e.g. "project-lyadov-podcast-001"

export const PodcastDubEpisode: React.FC<{ episode: string }> = ({ episode }) => {
  const { fps } = useVideoConfig();
  const captions = captionsMap[episode];
  const groups = useMemo(() => buildWordGroups(captions), [captions]);
  const title = titlesMap[episode];

  return (
    <AbsoluteFill>
      {/* Raw RU speaker video — MUTED. Source of image only. */}
      <OffthreadVideo
        src={staticFile(`${PROJECT_SLUG}/ep${episode}_video.mp4`)}
        volume={0}
        style={{ width: "100%", height: "100%" }}
      />

      {/* English dubbed audio track — full volume */}
      <Audio
        src={staticFile(`${PROJECT_SLUG}/ep${episode}_audio.m4a`)}
        volume={1}
      />

      {/* Red title banner — first ~3.5s */}
      {title && (
        <Sequence durationInFrames={TITLE_DURATION_FRAMES}>
          <TitleBanner text={title} />
        </Sequence>
      )}

      {/* Karaoke line: 3 words at a time, active word highlighted */}
      {groups.map((group, index) => {
        const startFrame = Math.round((group.startMs / 1000) * fps);
        const nextGroup = groups[index + 1];
        const endFrame = nextGroup
          ? Math.round((nextGroup.startMs / 1000) * fps)
          : Math.round((group.endMs / 1000) * fps) + 6;

        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={Math.max(1, endFrame - startFrame)}
          >
            <KaraokeLine group={group} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const TitleBanner: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const slideIn = interpolate(frame, [0, 10], [-120, 0], { extrapolateRight: "clamp" });
  const fadeIn = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(
    frame,
    [TITLE_DURATION_FRAMES - 12, TITLE_DURATION_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "stretch",
        paddingBottom: 534,
        opacity,
        transform: `translateY(${slideIn}px)`,
      }}
    >
      <div
        style={{
          backgroundColor: TITLE_ACCENT,
          padding: "18px 30px",
          width: "100%",
        }}
      >
        {text.split("\n").map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily,
              fontSize: 56,
              fontWeight: 900,
              color: "#FFFFFF",
              textAlign: "center",
              lineHeight: 1.3,
              textShadow: "2px 4px 8px rgba(0,0,0,0.6), 1px 2px 3px rgba(0,0,0,0.4)",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const KaraokeLine: React.FC<{ group: WordGroup }> = ({ group }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = group.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 288,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          maxWidth: "92%",
        }}
      >
        {group.words.map((word, i) => {
          const isActive =
            word.startMs <= currentTimeMs && word.endMs > currentTimeMs;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                position: "relative",
                padding: "4px 16px 8px",
                lineHeight: 1.2,
              }}
            >
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: KARAOKE_ACTIVE,
                    borderRadius: 14,
                  }}
                />
              )}
              <span
                style={{
                  position: "relative",
                  fontFamily,
                  fontSize: 62,
                  fontWeight: 900,
                  color: "#FFFFFF",
                  textShadow: "1px 3px 6px rgba(0,0,0,0.5)",
                }}
              >
                {word.text.toUpperCase()}
              </span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

## Registering in `src/Root.tsx`

Batch pattern — one `<Composition>` per episode inside a `<Folder>`:

```tsx
import { PodcastDubEpisode } from "./videos/{project-id}";

const EPISODES = [
  { ep: "01", frames: 1213 },
  { ep: "02", frames: 1215 },
  // one per episode; frames = Math.ceil(max(videoSec, audioSec) * 30)
];

<Folder name="{ProjectBrand}Podcast">
  {EPISODES.map(({ ep, frames }) => (
    <Composition
      key={ep}
      id={`PodcastDub-EP${ep}`}
      component={PodcastDubEpisode}
      durationInFrames={frames}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ episode: ep }}
    />
  ))}
</Folder>
```

## Public symlink for `staticFile()`

```bash
ln -s ../workspace/projects/{project-id}/assets public/{project-id}
```

Then `staticFile("{project-id}/ep01_video.mp4")` resolves from the project's `assets/` without copying. Adjust the symlink target if your layout puts video/audio in different subdirs.

## Render commands

Single episode:
```bash
npx remotion render PodcastDub-EP01 workspace/projects/{id}/render/ep01.mp4 --concurrency=6
```

Batch all episodes:
```bash
for ep in 01 02 03 04 05 06 07 08 09 10; do
  npx remotion render PodcastDub-EP$ep workspace/projects/{id}/render/ep$ep.mp4 --concurrency=6
done
```

Typical render time: ~1–2 min per minute of output at 1080×1920 @ 30fps.
