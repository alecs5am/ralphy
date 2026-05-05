import { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Rubik";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "800"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Bounce captions — each word bounces in with staggered spring animation.
 * Colorful, fun, high energy. Popular for Gen Z content, comedy, lifestyle reels.
 * Words appear one by one with scale+rotation bounce.
 */

const WORD_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF",
  "#5856D6", "#FF2D55", "#AF52DE", "#FF6B6B", "#48DBFB",
];

export type BounceCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  colors?: string[];
  fontSize?: number;
};

export const BounceCaptions: React.FC<BounceCaptionsProps> = ({
  captions,
  combineMs = 1200,
  colors = WORD_COLORS,
  fontSize = 64,
}) => {
  const { fps } = useVideoConfig();

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: combineMs,
      }),
    [captions, combineMs]
  );

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = nextPage
          ? (nextPage.startMs / 1000) * fps
          : startFrame + (combineMs / 1000) * fps;

        return (
          <Sequence
            key={index}
            from={Math.round(startFrame)}
            durationInFrames={Math.max(1, Math.round(endFrame - startFrame))}
          >
            <BouncePage
              page={page}
              colors={colors}
              fontSize={fontSize}
              pageIndex={index}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const BouncePage: React.FC<{
  page: any;
  colors: string[];
  fontSize: number;
  pageIndex: number;
}> = ({ page, colors, fontSize, pageIndex }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 8,
          maxWidth: "85%",
        }}
      >
        {page.tokens.map((token: any, i: number) => {
          // Stagger each word's entrance by a few frames
          const delay = i * 2;
          const wordFrame = Math.max(0, frame - delay);

          const scale = spring({
            frame: wordFrame,
            fps,
            config: { damping: 8, stiffness: 200, mass: 0.5 },
          });

          const rotate = spring({
            frame: wordFrame,
            fps,
            config: { damping: 10, stiffness: 150 },
            from: -8,
            to: 0,
          });

          const opacity = wordFrame > 0 ? 1 : 0;
          const color = colors[(pageIndex * 3 + i) % colors.length];

          return (
            <span
              key={i}
              style={{
                fontFamily,
                fontSize,
                fontWeight: 800,
                color,
                display: "inline-block",
                transform: `scale(${scale}) rotate(${rotate}deg)`,
                opacity,
                textShadow: "2px 2px 0 rgba(0,0,0,0.4), 0 0 10px rgba(0,0,0,0.3)",
              }}
            >
              {token.text.trim()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
