import { Fragment } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export const FPS = 30;

type Clip = { slug: string; durationSec: number };

const CLIPS: Clip[] = [
  { slug: "clip-01-morning-kitchen",   durationSec: 8 },
  { slug: "clip-02-walk-to-factory",   durationSec: 7 },
  { slug: "clip-03-shop-floor",        durationSec: 8 },
  { slug: "clip-04-canteen-tray",      durationSec: 8 },
  { slug: "clip-05-walk-home-evening", durationSec: 7 },
  { slug: "clip-06-family-dinner",     durationSec: 9 },
];

const OUTRO_SEC = 2;
const TRANSITION_FRAMES = 12;

const CLIP_FRAMES = CLIPS.map((c) => c.durationSec * FPS);
const RAW = CLIP_FRAMES.reduce((s, f) => s + f, 0);
export const CLIPS_TOTAL_FRAMES = RAW - TRANSITION_FRAMES * (CLIPS.length - 1);
export const TOTAL_FRAMES = CLIPS_TOTAL_FRAMES + OUTRO_SEC * FPS;

const CLIP_STARTS = CLIP_FRAMES.reduce<number[]>((acc, _f, i) => {
  if (i === 0) return [0];
  acc.push(acc[i - 1] + CLIP_FRAMES[i - 1] - TRANSITION_FRAMES);
  return acc;
}, []);

const P = "project-soviet-engineer-001";
const clipSrc = (slug: string) => `${P}/assets/clips/${slug}.mp4`;
const voiceSrc = (slug: string) => `${P}/assets/voiceover/${slug}.mp3`;
const MUSIC = `${P}/assets/music/trend-soviet-bed.mp3`;

export const SovietEngineer001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence from={0} durationInFrames={CLIPS_TOTAL_FRAMES + OUTRO_SEC * FPS}>
        <SovietBed totalFrames={CLIPS_TOTAL_FRAMES + OUTRO_SEC * FPS} />
      </Sequence>

      <TransitionSeries>
        {CLIPS.map((c, i) => (
          <Fragment key={c.slug}>
            <TransitionSeries.Sequence durationInFrames={CLIP_FRAMES[i]}>
              <OffthreadVideo
                src={staticFile(clipSrc(c.slug))}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
              {i === CLIPS.length - 1 ? (
                <TitleOverlay totalFrames={CLIP_FRAMES[i]} />
              ) : null}
            </TransitionSeries.Sequence>
            {i < CLIPS.length - 1 ? (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />
            ) : null}
          </Fragment>
        ))}
      </TransitionSeries>

      {CLIPS.map((c, i) => (
        <Sequence
          key={`vo-${c.slug}`}
          from={CLIP_STARTS[i]}
          durationInFrames={CLIP_FRAMES[i]}
        >
          <Audio
            src={staticFile(voiceSrc(c.slug))}
            volume={(f) =>
              interpolate(
                f,
                [0, 6, CLIP_FRAMES[i] - 6, CLIP_FRAMES[i]],
                [0, 1, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            }
          />
        </Sequence>
      ))}

      <Sequence from={CLIPS_TOTAL_FRAMES} durationInFrames={OUTRO_SEC * FPS}>
        <OutroCard durationFrames={OUTRO_SEC * FPS} />
      </Sequence>
    </AbsoluteFill>
  );
};

const SovietBed: React.FC<{ totalFrames: number }> = ({ totalFrames }) => (
  <Audio
    src={staticFile(MUSIC)}
    volume={(f) =>
      interpolate(
        f,
        [0, FPS, totalFrames - FPS * 1.5, totalFrames],
        [0, 0.16, 0.16, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    }
  />
);

const TitleOverlay: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const start = totalFrames - FPS * 2.2;
  const end = totalFrames - FPS * 1.2;
  const opacity = interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 220,
      }}
    >
      <div
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontWeight: 400,
          fontSize: 54,
          letterSpacing: 6,
          color: "#f4e7cc",
          opacity,
          textShadow: "0 2px 14px rgba(0,0,0,0.65)",
          textAlign: "center",
        }}
      >
        BACK THEN IT WAS SIMPLER
      </div>
    </AbsoluteFill>
  );
};

const OutroCard: React.FC<{ durationFrames: number }> = ({ durationFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationFrames - 10, durationFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = Math.min(fadeIn, fadeOut);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b0a07",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontWeight: 400,
          fontSize: 64,
          letterSpacing: 8,
          color: "#f4e7cc",
        }}
      >
        USSR · 1978
      </div>
      <div
        style={{
          marginTop: 26,
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontWeight: 400,
          fontSize: 22,
          letterSpacing: 3,
          color: "#8a7f6a",
        }}
      >
        we just lived
      </div>
    </AbsoluteFill>
  );
};
