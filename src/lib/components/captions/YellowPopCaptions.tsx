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
import { loadFont } from "@remotion/google-fonts/Oswald";

const { fontFamily } = loadFont("normal", {
  weights: ["700"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Yellow Pop captions — high contrast yellow on dark.
 * Podcast/interview style. Bold yellow text, slight rotation on active word.
 * Popular with Gary Vee, podcast clips, motivational content.
 */

export type YellowPopCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  primaryColor?: string;
  activeColor?: string;
  fontSize?: number;
};

export const YellowPopCaptions: React.FC<YellowPopCaptionsProps> = ({
  captions,
  combineMs = 1000,
  primaryColor = "#FFFFFF",
  activeColor = "#FFD700",
  fontSize = 62,
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
            <YellowPage
              page={page}
              primaryColor={primaryColor}
              activeColor={activeColor}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const YellowPage: React.FC<{
  page: any;
  primaryColor: string;
  activeColor: string;
  fontSize: number;
}> = ({ page, primaryColor, activeColor, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const enter = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 130 }}
    >
      <div
        style={{
          fontSize,
          fontFamily,
          fontWeight: 700,
          textAlign: "center",
          maxWidth: "85%",
          lineHeight: 1.2,
          textTransform: "uppercase",
          transform: `scale(${enter})`,
          textShadow: "2px 2px 0 #000, 0 0 20px rgba(0,0,0,0.8)",
        }}
      >
        {page.tokens.map((token: any, i: number) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          const rotate = isActive
            ? interpolate(currentTimeMs - token.fromMs, [0, 50], [-2, 0], {
                extrapolateRight: "clamp",
              })
            : 0;

          const scale = isActive ? 1.12 : 1;

          return (
            <span
              key={i}
              style={{
                color: isActive ? activeColor : primaryColor,
                display: "inline-block",
                transform: `scale(${scale}) rotate(${rotate}deg)`,
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
