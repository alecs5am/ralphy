import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
import { captions as rawCaptions } from "./captions";

// Scribe v1 word tokens have no leading whitespace. HormoziCaptions concatenates
// inline — prepend a space to every non-first token.
const captions = rawCaptions.map((c, i) =>
  i === 0 ? c : { ...c, text: c.text.startsWith(" ") ? c.text : ` ${c.text}` }
);

export const FPS = 30;
// VO is ~40.3s; pad 1s tail for outro
export const DURATION_SEC = 42;
export const TOTAL_FRAMES = DURATION_SEC * FPS;

const P = "project-test-brainrot-yt-001";

const KenBurnsImage: React.FC = () => {
  const frame = useCurrentFrame();
  // 1.0 → 1.06 over full duration
  const scale = interpolate(frame, [0, TOTAL_FRAMES], [1.0, 1.06], {
    extrapolateRight: "clamp",
  });
  const tx = interpolate(frame, [0, TOTAL_FRAMES], [-10, 10], {
    extrapolateRight: "clamp",
  });
  return (
    <Img
      src={staticFile(`${P}/images/top-image.png`)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${scale}) translateX(${tx}px)`,
      }}
    />
  );
};

export const BrainrotYT001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Top half — 1080×960 anchored y=0 */}
      <AbsoluteFill style={{ height: 960, top: 0, overflow: "hidden" }}>
        <KenBurnsImage />
      </AbsoluteFill>

      {/* Bottom half — 1080×960 anchored y=960 (gameplay loop) */}
      <AbsoluteFill style={{ top: 960, height: 960, overflow: "hidden" }}>
        <Loop durationInFrames={56 * FPS}>
          <OffthreadVideo
            src={staticFile(`${P}/uploaded/cs-surf-loop.mp4`)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            volume={0.08}
          />
        </Loop>
      </AbsoluteFill>

      {/* Captions — sit on the seam at y≈830, full-bleed */}
      <HormoziCaptions
        captions={captions}
        accentColor="#FFEB3B"
        fontSize={84}
        combineMs={500}
      />

      {/* VO */}
      <Audio
        src={staticFile(`${P}/voiceover/vo-primary.mp3`)}
        volume={1.0}
      />

      {/* AI-generated disclosure overlay (C2PA on-screen) */}
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
