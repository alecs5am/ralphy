import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FONT_NDOT } from "./fonts";
import { FPS } from "./scenes";

type Props = {
  text: string;
  /** When true, render with the small-pixel "logo" style instead of plain text. */
  logoStyle?: boolean;
};

/** Static title card — black background, Ndot font, white text. */
export const TitleCard: React.FC<Props> = ({ text, logoStyle = false }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONT_NDOT,
          color: "#fff",
          fontSize: logoStyle ? 110 : 90,
          letterSpacing: logoStyle ? 4 : 1,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

type CycleProps = {
  /** Each entry is shown for `duration / sequence.length` seconds. Empty string = blank screen. */
  sequence: string[];
  /** Total duration in seconds across all states. */
  totalDurationSec: number;
};

/** Endcard cycle — text changes every 1/N of total duration. */
export const TitleCardCycle: React.FC<CycleProps> = ({ sequence, totalDurationSec }) => {
  const frame = useCurrentFrame();
  const totalFrames = totalDurationSec * FPS;
  const perStateFrames = totalFrames / sequence.length;
  const activeIndex = Math.min(Math.floor(frame / perStateFrames), sequence.length - 1);
  const text = sequence[activeIndex];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {text ? (
        <div
          style={{
            fontFamily: FONT_NDOT,
            color: "#fff",
            fontSize: 90,
            letterSpacing: 2,
            textAlign: "center",
          }}
        >
          {text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
