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
import { loadFont } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily } = loadFont("normal", {
  weights: ["500"],
  subsets: ["latin", "cyrillic"],
});

/**
 * Typewriter captions — characters appear one by one with a blinking cursor.
 * Monospace font, hacker/tech aesthetic. Popular for tech, AI, coding content.
 */

export type TypewriterCaptionsProps = {
  captions: Caption[];
  combineMs?: number;
  textColor?: string;
  cursorColor?: string;
  fontSize?: number;
};

export const TypewriterCaptions: React.FC<TypewriterCaptionsProps> = ({
  captions,
  combineMs = 1500,
  textColor = "#00FF88",
  cursorColor = "#00FF88",
  fontSize = 42,
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
            <TypewriterPage
              page={page}
              totalDuration={Math.round(endFrame - startFrame)}
              textColor={textColor}
              cursorColor={cursorColor}
              fontSize={fontSize}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const TypewriterPage: React.FC<{
  page: any;
  totalDuration: number;
  textColor: string;
  cursorColor: string;
  fontSize: number;
}> = ({ page, totalDuration, textColor, cursorColor, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fullText = page.tokens.map((t: any) => t.text).join("");

  // Characters appear over 60% of the duration, rest is hold
  const typeFrames = Math.round(totalDuration * 0.6);
  const charsVisible = Math.round(
    interpolate(frame, [0, typeFrames], [0, fullText.length], {
      extrapolateRight: "clamp",
    })
  );

  const visibleText = fullText.substring(0, charsVisible);

  // Blinking cursor
  const cursorOpacity = Math.sin(frame * 0.4) > 0 ? 1 : 0;

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "12px 20px",
          borderRadius: 8,
          border: `1px solid ${textColor}30`,
          maxWidth: "85%",
        }}
      >
        <span
          style={{
            fontFamily,
            fontSize,
            fontWeight: 500,
            color: textColor,
            letterSpacing: -0.5,
          }}
        >
          {visibleText}
        </span>
        <span
          style={{
            fontFamily,
            fontSize,
            color: cursorColor,
            opacity: cursorOpacity,
          }}
        >
          |
        </span>
      </div>
    </AbsoluteFill>
  );
};
