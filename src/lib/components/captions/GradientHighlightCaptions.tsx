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
import { loadFont } from "@remotion/google-fonts/Outfit";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "800"],
  subsets: ["latin"],
});

/**
 * Gradient Highlight captions — active word fills with a gradient wipe left-to-right.
 * Smooth, modern, premium feel. Popular with tech brands and SaaS content.
 * White text, active word gets gradient fill animation.
 */

export type GradientHighlightCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  gradientFrom?: string;
  gradientTo?: string;
  fontSize?: number;
};

export const GradientHighlightCaptions: React.FC<GradientHighlightCaptionsProps> = ({
  captions,
  combineMs = 1200,
  gradientFrom = "#667EEA",
  gradientTo = "#764BA2",
  fontSize = 60,
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
            <GradientPage
              page={page}
              gradientFrom={gradientFrom}
              gradientTo={gradientTo}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const GradientPage: React.FC<{
  page: any;
  gradientFrom: string;
  gradientTo: string;
  fontSize: number;
}> = ({ page, gradientFrom, gradientTo, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const fadeIn = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 140,
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          fontSize,
          fontFamily,
          fontWeight: 800,
          textAlign: "center",
          maxWidth: "85%",
          lineHeight: 1.2,
          textShadow: "0 2px 10px rgba(0,0,0,0.6)",
        }}
      >
        {page.tokens.map((token: any, i: number) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          // Gradient fill progress for active word
          const progress = isActive
            ? interpolate(
                currentTimeMs - token.fromMs,
                [0, token.toMs - token.fromMs],
                [0, 100],
                { extrapolateRight: "clamp" }
              )
            : token.toMs <= currentTimeMs
              ? 100
              : 0;

          const isPast = token.toMs <= currentTimeMs;

          const style: React.CSSProperties = {
            display: "inline",
            transition: "all 0.05s",
          };

          if (isActive || isPast) {
            style.backgroundImage = `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`;
            style.WebkitBackgroundClip = "text";
            style.backgroundClip = "text";
            style.color = "transparent";
            if (isActive) {
              // Mask to show gradient filling left to right
              style.backgroundSize = `${progress}% 100%`;
              style.backgroundRepeat = "no-repeat";
              // Fallback: just show full gradient when active
              style.backgroundSize = "100% 100%";
            }
          } else {
            style.color = "rgba(255, 255, 255, 0.6)";
          }

          return (
            <span key={i} style={style}>
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
