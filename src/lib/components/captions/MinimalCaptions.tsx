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
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Minimal/Clean captions — small, professional, non-intrusive.
 * Thin white text at the bottom with subtle background blur effect.
 * Netflix/documentary style. For cinematic content, travel, product showcases.
 */

export type MinimalCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  textColor?: string;
  fontSize?: number;
};

export const MinimalCaptions: React.FC<MinimalCaptionsProps> = ({
  captions,
  combineMs = 2000,
  textColor = "#FFFFFFDD",
  fontSize = 36,
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
            <MinimalPage
              page={page}
              textColor={textColor}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const MinimalPage: React.FC<{
  page: any;
  textColor: string;
  fontSize: number;
}> = ({ page, textColor, fontSize }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  const text = page.tokens.map((t: any) => t.text).join("");

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 80 }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          padding: "8px 20px",
          borderRadius: 8,
          opacity,
        }}
      >
        <span
          style={{
            fontFamily,
            fontSize,
            fontWeight: 500,
            color: textColor,
            letterSpacing: 0.3,
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
