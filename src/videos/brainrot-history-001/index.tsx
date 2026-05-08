import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Series,
  staticFile,
} from "remotion";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
import { captions as rawCaptions } from "./captions";

// Scribe v1 emits word tokens without leading whitespace. HormoziCaptions
// renders tokens inline with no separator, so we prepend a space to every
// non-first word so "Did you know" doesn't render as "Didyouknow".
const captions = rawCaptions.map((c, i) =>
  i === 0 ? c : { ...c, text: c.text.startsWith(" ") ? c.text : ` ${c.text}` }
);

const GAMEPLAY_LOOP_FRAMES = 45 * 30;
const TOP_CLIP_FRAMES = 5 * 30;
const TOP_CLIP_SLOTS = [
  "scene-01-top",
  "scene-02-top",
  "scene-03-top",
  "scene-04-top",
  "scene-05-top",
  "scene-06-top",
  "scene-07-top",
  "scene-08-top",
  "scene-09-top",
  "scene-10-top",
  "scene-11-top",
] as const;

export const FPS = 30;
export const DURATION_SEC = 55;
export const TOTAL_FRAMES = DURATION_SEC * FPS;

const P = "project-brainrot-history-001";

export const BrainrotHistory001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ height: 960, top: 0, overflow: "hidden" }}>
        <Series>
          {TOP_CLIP_SLOTS.map((slot) => (
            <Series.Sequence key={slot} durationInFrames={TOP_CLIP_FRAMES}>
              <OffthreadVideo
                src={staticFile(`${P}/videos/${slot}.mp4`)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
            </Series.Sequence>
          ))}
        </Series>
      </AbsoluteFill>

      <AbsoluteFill style={{ top: 960, height: 960, overflow: "hidden" }}>
        <Loop durationInFrames={GAMEPLAY_LOOP_FRAMES}>
          <OffthreadVideo
            src={staticFile(`${P}/uploaded/gameplay-loop.mp4`)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            volume={0.08}
          />
        </Loop>
      </AbsoluteFill>

      <HormoziCaptions
        captions={captions}
        accentColor="#FFEB3B"
        fontSize={84}
        combineMs={500}
      />

      <Audio
        src={staticFile(`${P}/voiceover/vo-primary.mp3`)}
        volume={1.0}
      />

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 40,
            fontSize: 24,
            opacity: 0.7,
            fontWeight: 700,
            color: "white",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textShadow: "1px 1px 0 rgba(0,0,0,0.6)",
          }}
        >
          AI-generated
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
