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
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", {
  weights: ["900"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Hormozi-style captions — giant bold centered text, 1-3 words at a time.
 * Massive font, heavy drop shadow, white text, active word in accent color.
 * The "talking head guru" style popularized by Alex Hormozi, Iman Gadzhi, etc.
 */

export type HormoziCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  accentColor?: string;
  fontSize?: number;
};

export const HormoziCaptions: React.FC<HormoziCaptionsProps> = ({
  captions,
  combineMs = 800,
  accentColor = "#FFD700",
  fontSize = 80,
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
            <HormoziPage
              page={page}
              accentColor={accentColor}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const HormoziPage: React.FC<{
  page: any;
  accentColor: string;
  fontSize: number;
}> = ({ page, accentColor, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  const pop = spring({ frame, fps, config: { damping: 10, stiffness: 200, mass: 0.4 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontSize,
          fontFamily,
          fontWeight: 900,
          textAlign: "center",
          maxWidth: "90%",
          lineHeight: 1.1,
          textTransform: "uppercase",
          transform: `scale(${pop})`,
          textShadow:
            "3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 4px 8px rgba(0,0,0,0.5)",
        }}
      >
        {page.tokens.map((token: any, i: number) => {
          const isActive =
            token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          return (
            <span
              key={i}
              style={{
                color: isActive ? accentColor : "white",
                display: "inline",
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
