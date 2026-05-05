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

import { captions as captions01 } from "./captions-01";
import { captions as captions02 } from "./captions-02";
import { captions as captions03 } from "./captions-03";
import { captions as captions04 } from "./captions-04";
import { captions as captions05 } from "./captions-05";
import { captions as captions06 } from "./captions-06";
import { captions as captions07 } from "./captions-07";
import { captions as captions08 } from "./captions-08";
import { captions as captions09 } from "./captions-09";
import { captions as captions10 } from "./captions-10";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
});

export const captionsMap: Record<string, Caption[]> = {
  "01": captions01,
  "02": captions02,
  "03": captions03,
  "04": captions04,
  "05": captions05,
  "06": captions06,
  "07": captions07,
  "08": captions08,
  "09": captions09,
  "10": captions10,
};

const titlesMap: Record<string, string> = {
  "01": "\u00ABWhy do investors\ninvest in startups?\u00BB",
  "02": "\u00ABHow to 10x\nyour valuation?\u00BB",
  "03": "\u00ABThe biggest mistake\nfounders make\u00BB",
  "04": "\u00ABThere's no point doing\nanything cheap in IT\u00BB",
  "05": "\u00ABThe #1 skill\nof an entrepreneur\u00BB",
  "06": "\u00ABThe biggest risk\nfor an investor\u00BB",
  "07": "\u00ABDoes money\nbuy happiness?\u00BB",
  "08": "\u00ABThe Segway founder\ndied on a Segway\u00BB",
  "09": "\u00ABCan you make billions\nin any niche?\u00BB",
  "10": "\u00ABSuccessful startups\nare extremely rare\u00BB",
};

const WORDS_PER_LINE = 3;
const TITLE_DURATION_FRAMES = 105; // ~3.5s at 30fps

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
      words: chunk.map((c) => ({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
      })),
      startMs: chunk[0].startMs,
      endMs: chunk[chunk.length - 1].endMs,
    });
  }
  return groups;
}

export const LyadovEpisode: React.FC<{ episode: string }> = ({ episode }) => {
  const { fps } = useVideoConfig();
  const captions = captionsMap[episode];
  const groups = useMemo(() => buildWordGroups(captions), [captions]);
  const title = titlesMap[episode];

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={staticFile(`lyadov-podcast-001/ep${episode}_video.mp4`)}
        volume={0}
        style={{ width: "100%", height: "100%" }}
      />

      <Audio
        src={staticFile(`lyadov-podcast-001/ep${episode}_audio.m4a`)}
        volume={1}
      />

      {/* Title banner — first 3.5 seconds */}
      {title && (
        <Sequence durationInFrames={TITLE_DURATION_FRAMES}>
          <TitleBanner text={title} />
        </Sequence>
      )}

      {/* Karaoke subtitles */}
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

/** Red title banner — full width, slides in from top */
const TitleBanner: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();

  // Slide in from top: frames 0-10
  const slideIn = interpolate(frame, [0, 10], [-120, 0], {
    extrapolateRight: "clamp",
  });
  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade out at end
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
          backgroundColor: "#FE2B02",
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
                    backgroundColor: "#FE0100",
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

export const LyadovPodcast: React.FC = () => <LyadovEpisode episode="01" />;
