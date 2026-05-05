import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { GREEN_ZONE, getTextPreset } from "../../utils/green-zone";

/**
 * Bold hook-card text overlay — white rounded box with bold text + soft
 * drop-shadow. Pattern ported from mutonby/openshorts hooks.py (PIL → CSS).
 *
 * Cyrillic-safe via @remotion/google-fonts/Inter (subsets: latin + cyrillic).
 *
 * Use inside <Sequence from={0} durationInFrames={fps*3}> for the typical
 * 3s hook window.
 */

const { fontFamily } = loadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin", "cyrillic"],
});

export type HookCardProps = {
  text: string;
  /** Vertical anchor inside the green zone */
  position?: "top" | "center" | "bottom";
  /** Box opacity (0-1). Default 0.95 (almost solid white) */
  boxOpacity?: number;
  /** Override font size (px). Default scales by widthFrac */
  fontSize?: number;
  /** Override box width as fraction of canvas. Default 0.83 (= green-zone width) */
  widthFrac?: number;
  /** Background color of the box. Default white */
  background?: string;
  /** Text color. Default near-black */
  color?: string;
};

export const HookCard: React.FC<HookCardProps> = ({
  text,
  position = "top",
  boxOpacity = 0.95,
  fontSize,
  widthFrac = 0.83,
  background = "#ffffff",
  color = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();

  // Quick fade-in (8 frames) — no fade out so the card stays solid
  // until the parent <Sequence> ends.
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Vertical positioning maps to green-zone presets so text is always safe.
  const yMap = {
    top: getTextPreset("hook").y,
    center: 900,
    bottom: getTextPreset("supporting").y,
  };
  const y = yMap[position];

  // Default fontSize ≈ 5% of canvas width (1080) → 56px.
  const fs = fontSize ?? 56;

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          top: y,
          left: GREEN_ZONE.xMin + (GREEN_ZONE.width * (1 - widthFrac)) / 2,
          width: GREEN_ZONE.width * widthFrac,
          background,
          opacity: boxOpacity,
          borderRadius: 18,
          padding: "20px 28px",
          boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: fs,
            lineHeight: 1.15,
            color,
            textAlign: "center",
            letterSpacing: -0.3,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
