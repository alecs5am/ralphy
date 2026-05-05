import { AbsoluteFill, Img, useCurrentFrame, interpolate } from "remotion";

/**
 * Show a screenshot (Reddit post, chat, news headline) overlaid on the
 * underlying video for the first N frames, fading out at the end.
 *
 * Pattern from vargHQ/sdk text-to-tiktok cookbook + openshorts hooks.py.
 *
 * Use inside a <Sequence from={0} durationInFrames={...}> wrapper
 * so the screenshot only shows during the hook window.
 */

export type HookScreenshotProps = {
  /** Static-file URL or import. Recommended: PNG with transparent background */
  src: string;
  /** Total visible duration in frames. Default 120 (= 4s @ 30fps) */
  durationFrames?: number;
  /** Frames over which the fade-out happens at the end. Default 30 (= 1s) */
  fadeFrames?: number;
  /** Where to anchor the screenshot. Default "center" */
  position?: "center" | "top" | "bottom";
  /** Width as a fraction of the canvas (1080). Default 0.83 (= 900px = green-zone width) */
  widthFrac?: number;
};

export const HookScreenshot: React.FC<HookScreenshotProps> = ({
  src,
  durationFrames = 120,
  fadeFrames = 30,
  position = "center",
  widthFrac = 0.83,
}) => {
  const frame = useCurrentFrame();

  // Fade in (8 frames) and fade out (last `fadeFrames`).
  const opacity = interpolate(
    frame,
    [0, 8, durationFrames - fadeFrames, durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const justifyContent =
    position === "top" ? "flex-start" : position === "bottom" ? "flex-end" : "center";

  return (
    <AbsoluteFill
      style={{
        justifyContent,
        alignItems: "center",
        paddingTop: position === "top" ? 220 : 0,
        paddingBottom: position === "bottom" ? 220 : 0,
        opacity,
      }}
    >
      <Img
        src={src}
        style={{
          width: `${widthFrac * 100}%`,
          maxWidth: 900,
          height: "auto",
          borderRadius: 16,
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
        }}
      />
    </AbsoluteFill>
  );
};
