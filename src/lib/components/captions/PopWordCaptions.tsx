import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import type { Caption } from "@remotion/captions";

const FONT_FAMILY = "TheBoldFont";

let fontLoaded = false;
const ensureFont = () => {
  if (fontLoaded || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `@font-face { font-family: "${FONT_FAMILY}"; src: url("${staticFile(
    "fonts/TheBoldFont.ttf"
  )}") format("truetype"); font-weight: 700; font-style: normal; font-display: block; }`;
  document.head.appendChild(style);
  fontLoaded = true;
};

export type PopWordCaptionsProps = {
  captions: Caption[];
  fontSize?: number;
  bottomOffset?: number;
};

/**
 * One-word-at-a-time popup captions in the TheBoldFont style popularized by
 * Hormozi / MrBeast / fruittales viral creators. Spring scale-in per word,
 * white fill with heavy black stroke + drop shadow. Bottom-center anchored.
 *
 * Companion font ships at `public/fonts/TheBoldFont.ttf` (43KB TTF).
 *
 * Pair with `@remotion/captions` word-level Caption[] — one cue per word,
 * no token grouping.
 */
export const PopWordCaptions: React.FC<PopWordCaptionsProps> = ({
  captions,
  fontSize = 140,
  bottomOffset = 360,
}) => {
  ensureFont();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      {captions.map((c, i) => {
        const next = captions[i + 1];
        const startMs = c.startMs;
        const endMs = next ? next.startMs : c.endMs + 200;
        const startFrame = Math.round((startMs / 1000) * fps);
        const endFrame = Math.round((endMs / 1000) * fps);
        const duration = Math.max(1, endFrame - startFrame);
        const word = c.text.trim().replace(/^,/, "");
        if (!word) return null;
        return (
          <Sequence key={i} from={startFrame} durationInFrames={duration}>
            <PopWord text={word} fontSize={fontSize} bottomOffset={bottomOffset} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const PopWord: React.FC<{ text: string; fontSize: number; bottomOffset: number }> = ({
  text,
  fontSize,
  bottomOffset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 230, mass: 0.45 },
  });
  const scale = interpolate(pop, [0, 1], [0.55, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          marginBottom: bottomOffset,
          fontFamily: `"${FONT_FAMILY}", "Arial Black", system-ui, sans-serif`,
          fontWeight: 700,
          fontSize,
          color: "#FFFFFF",
          textTransform: "uppercase",
          lineHeight: 1,
          letterSpacing: "0.5px",
          whiteSpace: "nowrap",
          transform: `scale(${scale})`,
          textShadow:
            "0 4px 0 rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.9)",
          WebkitTextStroke: "4px rgba(0,0,0,0.95)",
          paintOrder: "stroke fill",
        }}
      >
        {text.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};
