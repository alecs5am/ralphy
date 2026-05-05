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
import type { Caption } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["800"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Boxed Captions — text in colored rounded boxes.
 * MrBeast / mainstream YouTube style. Each phrase gets a colored pill background.
 * Active word highlights with different box color.
 */

export type BoxedCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  boxColor?: string;
  activeBoxColor?: string;
  textColor?: string;
  fontSize?: number;
};

export const BoxedCaptions: React.FC<BoxedCaptionsProps> = ({
  captions,
  combineMs = 1200,
  boxColor = "#000000CC",
  activeBoxColor = "#FFD700",
  textColor = "#FFFFFF",
  fontSize = 58,
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
            <BoxedPage
              page={page}
              boxColor={boxColor}
              activeBoxColor={activeBoxColor}
              textColor={textColor}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const BoxedPage: React.FC<{
  page: any;
  boxColor: string;
  activeBoxColor: string;
  textColor: string;
  fontSize: number;
}> = ({ page, boxColor, activeBoxColor, textColor, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const scaleIn = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 160 }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 6,
          maxWidth: "85%",
          transform: `scale(${scaleIn})`,
        }}
      >
        {page.tokens.map((token: any, i: number) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          const wordScale = isActive ? 1.05 : 1;

          return (
            <span
              key={i}
              style={{
                fontFamily,
                fontSize,
                fontWeight: 800,
                color: isActive ? "#000" : textColor,
                backgroundColor: isActive ? activeBoxColor : boxColor,
                padding: "4px 14px",
                borderRadius: 10,
                display: "inline-block",
                transform: `scale(${wordScale})`,
                transition: "all 0.1s ease",
                lineHeight: 1.3,
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
