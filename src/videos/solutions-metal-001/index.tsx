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
  { slug: "clip-01", durationSec: 9 },
  { slug: "clip-02", durationSec: 11 },
  { slug: "clip-03", durationSec: 7 },
  { slug: "clip-04", durationSec: 10 },
  { slug: "clip-05", durationSec: 5 },
  { slug: "clip-06", durationSec: 7 },
  { slug: "clip-07", durationSec: 8 },
  { slug: "clip-08", durationSec: 8 },
];

const OUTRO_SEC = 2;
const TRANSITION_FRAMES = 12; // 0.4s crossfade between clips

const CLIP_FRAMES = CLIPS.map((c) => c.durationSec * FPS);
const RAW_CLIPS_FRAMES = CLIP_FRAMES.reduce((s, f) => s + f, 0);
// Total visible video frames after crossfades shorten the timeline
export const CLIPS_TOTAL_FRAMES =
  RAW_CLIPS_FRAMES - TRANSITION_FRAMES * (CLIPS.length - 1);
export const TOTAL_FRAMES = CLIPS_TOTAL_FRAMES + OUTRO_SEC * FPS;

// Effective start frame of each clip on the post-transition timeline.
// clip_i visually starts at sum(clip_0..i-1) - i * TRANSITION_FRAMES
const CLIP_STARTS = CLIP_FRAMES.reduce<number[]>((acc, f, i) => {
  if (i === 0) return [0];
  acc.push(acc[i - 1] + CLIP_FRAMES[i - 1] - TRANSITION_FRAMES);
  return acc;
}, []);

const asset = (slug: string) => `project-solutions-metal-001/renders/${slug}-kling.mp4`;
const voice = (slug: string) => `project-solutions-metal-001/voiceover/${slug}.mp3`;

export const SolutionsMetal001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Music — Soviet nostalgic for grandfather's era (clips 1-5),
          hip-hop drops at clip 6 boundary for Gleb's era. */}
      <Sequence from={0} durationInFrames={CLIP_STARTS[5]}>
        <SovietBed totalFrames={CLIP_STARTS[5]} />
      </Sequence>
      <Sequence
        from={CLIP_STARTS[5]}
        durationInFrames={CLIPS_TOTAL_FRAMES - CLIP_STARTS[5]}
      >
        <HipHopBed totalFrames={CLIPS_TOTAL_FRAMES - CLIP_STARTS[5]} />
      </Sequence>

      {/* Videos with soft fade crossfades between clips */}
      <TransitionSeries>
        {CLIPS.map((c, i) => (
          <Fragment key={c.slug}>
            <TransitionSeries.Sequence durationInFrames={CLIP_FRAMES[i]}>
              <OffthreadVideo
                src={staticFile(asset(c.slug))}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
              {c.slug === "clip-08" ? (
                <CottonMetalTitle totalFrames={CLIP_FRAMES[i]} />
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

      {/* Voiceover per scene — anchored to each clip's effective start with
          a tiny fade-in/out so VO-to-VO handoffs are smooth, not abrupt. */}
      {CLIPS.map((c, i) => (
        <Sequence
          key={`vo-${c.slug}`}
          from={CLIP_STARTS[i]}
          durationInFrames={CLIP_FRAMES[i]}
        >
          <Audio
            src={staticFile(voice(c.slug))}
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

      {/* Outro card: .solutions / nobody.solutions on black */}
      <Sequence from={CLIPS_TOTAL_FRAMES} durationInFrames={OUTRO_SEC * FPS}>
        <OutroCard durationFrames={OUTRO_SEC * FPS} />
      </Sequence>
    </AbsoluteFill>
  );
};

// Soviet nostalgic bed — fades in over 1s, hard duck in the last 0.2s
// (5 frames) so the hip-hop drop feels like a DJ cut.
const SovietBed: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const fadeIn = FPS;
  const duckOut = 5;
  return (
    <Audio
      src={staticFile("project-solutions-metal-001/music/tiktok-loop.mp3")}
      volume={(f) =>
        interpolate(
          f,
          [0, fadeIn, totalFrames - duckOut, totalFrames],
          [0, 0.14, 0.14, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      }
    />
  );
};

// Hip-hop bed — kicks in punchy (2-frame ramp to kill the click),
// fades out 2s at end for the outro.
const HipHopBed: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const attack = 2;
  const fadeOut = FPS * 2;
  return (
    <Audio
      src={staticFile("project-solutions-metal-001/music/hiphop-gleb.mp3")}
      volume={(f) =>
        interpolate(
          f,
          [0, attack, totalFrames - fadeOut, totalFrames],
          [0, 0.28, 0.28, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      }
    />
  );
};

const CottonMetalTitle: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const appearStart = totalFrames - FPS * 1.5;
  const appearEnd = totalFrames - FPS * 0.7;
  const opacity = interpolate(frame, [appearStart, appearEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 160,
      }}
    >
      <div
        style={{
          fontFamily: "Helvetica Neue, Inter, sans-serif",
          fontWeight: 200,
          fontSize: 58,
          letterSpacing: 14,
          color: "#fff",
          opacity,
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
        }}
      >
        COTTON METAL
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
        backgroundColor: "#000",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: "Helvetica Neue, Inter, sans-serif",
          fontWeight: 200,
          fontSize: 56,
          letterSpacing: 4,
          color: "#fff",
        }}
      >
        .solutions
      </div>
      <div
        style={{
          marginTop: 28,
          fontFamily: "Helvetica Neue, Inter, sans-serif",
          fontWeight: 200,
          fontSize: 28,
          letterSpacing: 2,
          color: "#888",
        }}
      >
        nobody.solutions
      </div>
    </AbsoluteFill>
  );
};
