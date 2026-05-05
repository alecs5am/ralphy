import { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Bangers";

const { fontFamily } = loadFont("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

/**
 * Karaoke-style captions — MrBeast / Hormozi trend.
 * One word at a time, huge bold text with colored background box,
 * bouncy pop-in animation. Each word fills the screen.
 */

export type KaraokeCaptionsProps = {
  captions: Caption[];
  colors?: string[];
  fontSize?: number;
};

const DEFAULT_COLORS = ["#FF3B30", "#FFCC00", "#34C759", "#007AFF", "#FF2D92", "#FF9500"];

export const KaraokeCaptions: React.FC<KaraokeCaptionsProps> = ({
  captions,
  colors = DEFAULT_COLORS,
  fontSize = 100,
}) => {
  const { fps } = useVideoConfig();

  // One word at a time
  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: 0,
      }),
    [captions]
  );

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const endFrame = nextPage
          ? Math.round((nextPage.startMs / 1000) * fps)
          : startFrame + 15;
        const durationInFrames = Math.max(1, endFrame - startFrame);

        return (
          <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
            <KaraokeWord
              text={page.tokens.map((t) => t.text).join("").trim()}
              color={colors[index % colors.length]}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const KaraokeWord: React.FC<{
  text: string;
  color: string;
  fontSize: number;
}> = ({ text, color, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.5 },
  });

  const rotate = interpolate(frame, [0, 3], [-3, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          display: "inline-block",
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize,
            fontWeight: 400,
            color: "white",
            backgroundColor: color,
            padding: "8px 24px",
            borderRadius: 12,
            textTransform: "uppercase",
            letterSpacing: 2,
            textShadow: "2px 2px 0 rgba(0,0,0,0.3)",
            boxShadow: `0 4px 20px ${color}80`,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
