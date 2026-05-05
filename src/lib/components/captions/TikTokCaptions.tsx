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
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin", "cyrillic"],
});

/**
 * TikTok-style captions — the classic green highlight word-by-word.
 * Big bold white text, active word pops green with scale.
 */

export type TikTokCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  highlightColor?: string;
  fontSize?: number;
  position?: "center" | "bottom";
};

export const TikTokCaptions: React.FC<TikTokCaptionsProps> = ({
  captions,
  combineMs = 1200,
  highlightColor = "#39E508",
  fontSize = 68,
  position = "center",
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
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (combineMs / 1000) * fps
        );
        const durationInFrames = Math.max(1, Math.round(endFrame - startFrame));

        return (
          <Sequence
            key={index}
            from={Math.round(startFrame)}
            durationInFrames={durationInFrames}
          >
            <TikTokPage
              page={page}
              highlightColor={highlightColor}
              fontSize={fontSize}
              position={position}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const TikTokPage: React.FC<{
  page: TikTokPage;
  highlightColor: string;
  fontSize: number;
  position: "center" | "bottom";
}> = ({ page, highlightColor, fontSize, position }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const enterScale = spring({ frame, fps, config: { damping: 15 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: position === "bottom" ? "flex-end" : "center",
        alignItems: "center",
        paddingBottom: position === "bottom" ? 120 : 0,
      }}
    >
      <div
        style={{
          fontSize,
          fontFamily,
          fontWeight: 900,
          whiteSpace: "pre",
          textAlign: "center",
          maxWidth: "85%",
          lineHeight: 1.2,
          transform: `scale(${enterScale})`,
          textShadow:
            "0 2px 8px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.4)",
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          const wordScale = isActive
            ? interpolate(
                currentTimeMs - token.fromMs,
                [0, 80],
                [1.15, 1.05],
                { extrapolateRight: "clamp" }
              )
            : 1;

          return (
            <span
              key={i}
              style={{
                color: isActive ? highlightColor : "white",
                display: "inline-block",
                transform: `scale(${wordScale})`,
                transition: "color 0.05s",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
