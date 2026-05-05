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
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily } = loadFont("normal", {
  weights: ["600", "800"],
  subsets: ["latin", "latin-ext"],
});

/**
 * Glow/Neon captions — trendy aesthetic style.
 * Soft glow around text, active word has bright neon pulse.
 * Clean minimalist look popular in lifestyle/wellness content.
 */

export type GlowCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  glowColor?: string;
  activeColor?: string;
  fontSize?: number;
};

export const GlowCaptions: React.FC<GlowCaptionsProps> = ({
  captions,
  combineMs = 1000,
  glowColor = "#A855F7",
  activeColor = "#E879F9",
  fontSize = 56,
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
            <GlowPage
              page={page}
              glowColor={glowColor}
              activeColor={activeColor}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const GlowPage: React.FC<{
  page: TikTokPage;
  glowColor: string;
  activeColor: string;
  fontSize: number;
}> = ({ page, glowColor, activeColor, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const fadeIn = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });

  const slideUp = interpolate(frame, [0, 8], [15, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 140,
      }}
    >
      <div
        style={{
          fontSize,
          fontFamily,
          fontWeight: 800,
          whiteSpace: "pre",
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.3,
          opacity: fadeIn,
          transform: `translateY(${slideUp}px)`,
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          const glowIntensity = isActive
            ? interpolate(
                currentTimeMs - token.fromMs,
                [0, 100, 200],
                [0, 1, 0.7],
                { extrapolateRight: "clamp" }
              )
            : 0;

          const scale = isActive ? 1 + glowIntensity * 0.08 : 1;

          const textShadow = isActive
            ? `0 0 ${10 + glowIntensity * 30}px ${activeColor}, 0 0 ${60 + glowIntensity * 40}px ${activeColor}60`
            : `0 0 10px ${glowColor}40`;

          return (
            <span
              key={i}
              style={{
                color: isActive ? activeColor : `${glowColor}CC`,
                display: "inline-block",
                transform: `scale(${scale})`,
                textShadow,
                transition: "color 0.08s",
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
