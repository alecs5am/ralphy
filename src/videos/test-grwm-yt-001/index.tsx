import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
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
// VO transcribed at 46.9s; pad to 47s outro tail.
export const DURATION_SEC = 47;
export const TOTAL_FRAMES = DURATION_SEC * FPS;

const P = "project-test-grwm-yt-001";

// Beat windows (seconds) — the two kling clips are 5s each.
// 0-5  scene-01 video (hook)
// 5-12 anchor still A (Ken Burns slow zoom-in)
// 12-17 scene-03 video (twist)
// 17-32 anchor still B (Ken Burns slow zoom-out)
// 32-47 anchor still C (Ken Burns slow pan-right)

const sec = (s: number) => Math.round(s * FPS);

const KenBurns: React.FC<{
  src: string;
  durationFrames: number;
  scaleFrom?: number;
  scaleTo?: number;
  txFrom?: number;
  txTo?: number;
}> = ({ src, durationFrames, scaleFrom = 1.0, scaleTo = 1.06, txFrom = 0, txTo = 0 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, durationFrames], [scaleFrom, scaleTo], {
    extrapolateRight: "clamp",
  });
  const tx = interpolate(frame, [0, durationFrames], [txFrom, txTo], {
    extrapolateRight: "clamp",
  });
  return (
    <Img
      src={src}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${scale}) translateX(${tx}px)`,
      }}
    />
  );
};

export const TestGrwmYT001: React.FC = () => {
  const anchorSrc = staticFile(`${P}/images/persona-anchor.png`);
  const scene01Vid = staticFile(`${P}/videos/scene-01-vid.mp4`);
  const scene03Vid = staticFile(`${P}/videos/scene-03-vid.mp4`);
  const voSrc = staticFile(`${P}/voiceover/scene-full-vo.mp3`);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Scene 01 — video clip, 0..5s */}
      <Sequence from={0} durationInFrames={sec(5)}>
        <AbsoluteFill>
          <OffthreadVideo
            src={scene01Vid}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            volume={0}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 02 — anchor still A, 5..12s (7s zoom-in) */}
      <Sequence from={sec(5)} durationInFrames={sec(7)}>
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <KenBurns
            src={anchorSrc}
            durationFrames={sec(7)}
            scaleFrom={1.0}
            scaleTo={1.08}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 03 — video clip, 12..17s */}
      <Sequence from={sec(12)} durationInFrames={sec(5)}>
        <AbsoluteFill>
          <OffthreadVideo
            src={scene03Vid}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            volume={0}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 04 — anchor still B, 17..32s (15s zoom-out) */}
      <Sequence from={sec(17)} durationInFrames={sec(15)}>
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <KenBurns
            src={anchorSrc}
            durationFrames={sec(15)}
            scaleFrom={1.10}
            scaleTo={1.0}
            txFrom={8}
            txTo={-8}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 05 — anchor still C, 32..47s (15s pan-right) */}
      <Sequence from={sec(32)} durationInFrames={sec(15)}>
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <KenBurns
            src={anchorSrc}
            durationFrames={sec(15)}
            scaleFrom={1.05}
            scaleTo={1.10}
            txFrom={-12}
            txTo={12}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Captions — Hormozi-yellow across full duration */}
      <HormoziCaptions
        captions={captions}
        accentColor="#FFEB3B"
        fontSize={84}
        combineMs={500}
      />

      {/* VO — single continuous track */}
      <Audio src={voSrc} volume={1.0} />

      {/* AI-generated disclosure */}
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
