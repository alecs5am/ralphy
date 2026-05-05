import { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily: fontLight } = loadFont("normal", {
  weights: ["300"],
  subsets: ["latin", "cyrillic"],
});
const { fontFamily: fontBold } = loadFont("normal", {
  weights: ["700"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Luxury Minimal captions — Iman Gadzhi style.
 * All lowercase, white only, NO colors. The animation IS the font weight
 * transitioning from light (300) to bold (700) on the active word.
 * Radical simplicity that signals premium/luxury.
 */

export type LuxuryMinimalCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  fontSize?: number;
};

export const LuxuryMinimalCaptions: React.FC<LuxuryMinimalCaptionsProps> = ({
  captions,
  combineMs = 1200,
  fontSize = 52,
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
            <LuxuryPage page={page} fontSize={fontSize} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const LuxuryPage: React.FC<{
  page: any;
  fontSize: number;
}> = ({ page, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          fontSize,
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.4,
          letterSpacing: 1,
        }}
      >
        {page.tokens.map((token: any, i: number) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;
          const isPast = token.toMs <= currentTimeMs;

          return (
            <span
              key={i}
              style={{
                fontFamily: isActive || isPast ? fontBold : fontLight,
                fontWeight: isActive || isPast ? 700 : 300,
                color: isActive ? "rgba(255,255,255,1)" : isPast ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)",
                textTransform: "lowercase",
                transition: "font-weight 0.15s, color 0.15s",
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
