// Podcast-clip render — test-podcast-yt-001.
// Reads cut-01.mp4 + captions.json (word-level, shifted to clip-local ms)
// from public/project-test-podcast-yt-001/ (symlinked by `ralphy render`).
//
// Composition layout:
//   - Smart-crop (static-center fallback): re-project the 16:9 source into
//     9:16 by scaling to fit height and centering horizontally. The transcript
//     pulled from Scribe doesn't include diarization in our current shape,
//     and we have no face-bbox json — so this stays static-center (per the
//     prompt-cookbook "fallback when smart-crop confidence < 0.6").
//   - Title-banner: Hormozi-yellow, top 12%, slide-in 0-12f, hold 12-60f,
//     fade-out 60-72f.
//   - Karaoke captions: word-by-word active-yellow on white, bottom 18%,
//     grouped into 5-word phrases.

import { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
});

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number;
  confidence: number | null;
};

export type PodcastClip001Props = {
  /** Path relative to public/ (e.g. "project-test-podcast-yt-001/cut-01.mp4") */
  cutSrc: string;
  captions: Caption[];
  titleLine1: string;
  titleLine2: string;
};

export const FPS = 30;
export const TOTAL_FRAMES = Math.round(40.84 * FPS); // 1225 frames at 30fps

// Title banner animation windows
const BANNER_SLIDE_IN_END = 12; // 0.4s
const BANNER_FADE_START = 60;   // 2.0s
const BANNER_FADE_END = 72;     // 2.4s

const WORDS_PER_LINE = 5;

interface WordGroup {
  words: Caption[];
  startMs: number;
  endMs: number;
}

function buildWordGroups(captions: Caption[]): WordGroup[] {
  // Drop disfluencies that have no text payload
  const cleaned = captions.filter((c) => c.text && c.text.trim().length > 0);
  const groups: WordGroup[] = [];
  for (let i = 0; i < cleaned.length; i += WORDS_PER_LINE) {
    const chunk = cleaned.slice(i, i + WORDS_PER_LINE);
    groups.push({
      words: chunk,
      startMs: chunk[0].startMs,
      endMs: chunk[chunk.length - 1].endMs,
    });
  }
  return groups;
}

export const PodcastClip001: React.FC<PodcastClip001Props> = ({
  cutSrc,
  captions,
  titleLine1,
  titleLine2,
}) => {
  const { fps } = useVideoConfig();
  const groups = useMemo(() => buildWordGroups(captions), [captions]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* 16:9 source re-projected into 9:16 — fit-height (1920) crops horizontal,
          source 1920x1080 at fit-height becomes 3413x1920, centered → middle 1080. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <OffthreadVideo
          src={staticFile(cutSrc)}
          style={{
            width: "auto",
            height: "100%",
          }}
          volume={1}
        />
      </AbsoluteFill>

      {/* Title banner — Hormozi-yellow at top 12% */}
      <Sequence durationInFrames={BANNER_FADE_END}>
        <TitleBanner line1={titleLine1} line2={titleLine2} />
      </Sequence>

      {/* Karaoke captions */}
      {groups.map((group, index) => {
        const startFrame = Math.round((group.startMs / 1000) * fps);
        const nextGroup = groups[index + 1];
        const endFrame = nextGroup
          ? Math.round((nextGroup.startMs / 1000) * fps)
          : Math.round((group.endMs / 1000) * fps) + 9; // 300ms tail

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

const TitleBanner: React.FC<{ line1: string; line2: string }> = ({
  line1,
  line2,
}) => {
  const frame = useCurrentFrame();

  // Slide-in from y=-160 to y=0 over 0-12 frames
  const translateY = interpolate(frame, [0, BANNER_SLIDE_IN_END], [-160, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hold opacity 1.0 from 0-60, fade out 60-72
  const opacity = interpolate(frame, [BANNER_FADE_START, BANNER_FADE_END], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "stretch",
        paddingTop: 60,
        paddingLeft: 24,
        paddingRight: 24,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          backgroundColor: "#FFD500",
          padding: "26px 32px",
          width: "100%",
          borderRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 64,
            fontWeight: 900,
            color: "#000",
            textAlign: "center",
            lineHeight: 1.1,
            letterSpacing: -0.5,
          }}
        >
          {line1}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 64,
            fontWeight: 900,
            color: "#000",
            textAlign: "center",
            lineHeight: 1.1,
            letterSpacing: -0.5,
            marginTop: 6,
          }}
        >
          {line2}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const KaraokeLine: React.FC<{ group: WordGroup }> = ({ group }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Sequence-local frame → absolute clip ms based on group.startMs
  const currentTimeMs = group.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 280,
        paddingLeft: 40,
        paddingRight: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
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
                fontFamily,
                fontSize: 56,
                fontWeight: 900,
                color: isActive ? "#FFD500" : "#FFFFFF",
                transform: isActive ? "scale(1.06)" : "scale(1.0)",
                transition: "transform 80ms ease-out",
                textShadow:
                  "2px 4px 6px rgba(0,0,0,0.85), 1px 2px 3px rgba(0,0,0,0.6)",
                lineHeight: 1.05,
                letterSpacing: 0.2,
                display: "inline-block",
              }}
            >
              {word.text.toUpperCase().replace(/[,.?!]$/, "")}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Helper: project-asset src factory, since render symlinks
// workspace/projects/<id>/assets → public/project-<id>/
export const projectAsset = (projectId: string, name: string) =>
  staticFile(`project-${projectId}/${name}`);
