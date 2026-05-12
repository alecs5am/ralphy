import { Fragment } from "react";
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
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { HormoziCaptions } from "../../lib/components/captions/HormoziCaptions";
import { captions } from "./captions";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin"],
});

export const FPS = 30;

// VO timings (measured from concat): scene durations in seconds
// s1=5.62, s2=3.29, s3=9.33, s4=11.23, s5=7.24, s6=2.87 ; total = 39.58
// add 1.4s pad → 41s total
const PROJ = "project-test-tutorial-yt-001";
const TRANSITION_FRAMES = 12; // 0.4s named-transition wipe

type Scene = {
  id: string;
  durationSec: number;
  stepLabel?: string;
  counter?: string;
  overlayMain: string;
  overlayAccent?: string;
  videoSlot?: string;
  imageSlot: string;
  transitionLabel?: string;
  transitionKind?: "slide-left" | "wipe-left" | "fade";
};

const SCENES: Scene[] = [
  {
    id: "scene-01",
    durationSec: 5.62,
    overlayMain: "STOP",
    overlayAccent: "#FFEB3B",
    imageSlot: "scene-01-bg.png",
  },
  {
    id: "scene-02",
    durationSec: 3.29,
    overlayMain: "1,000 SUBS",
    overlayAccent: "#FFFFFF",
    videoSlot: "scene-02-clip.mp4",
    imageSlot: "scene-02-bg.png",
    transitionKind: "slide-left",
    transitionLabel: "Here's how",
  },
  {
    id: "scene-03",
    durationSec: 9.33,
    counter: "1/3",
    overlayMain: "HUNT KEYWORDS",
    imageSlot: "scene-03-bg.png",
    transitionKind: "slide-left",
    transitionLabel: "First move",
  },
  {
    id: "scene-04",
    durationSec: 11.23,
    counter: "2/3",
    overlayMain: "STACK + YEAR",
    videoSlot: "scene-04-clip.mp4",
    imageSlot: "scene-04-bg.png",
    transitionKind: "wipe-left",
    transitionLabel: "Now the trick",
  },
  {
    id: "scene-05",
    durationSec: 7.24,
    counter: "3/3",
    overlayMain: "CLICK-TEST",
    imageSlot: "scene-05-bg.png",
    transitionKind: "slide-left",
    transitionLabel: "Last move",
  },
  {
    id: "scene-06",
    durationSec: 2.87,
    overlayMain: "SAVE THIS.\nTRY STEP 3 FIRST.",
    overlayAccent: "#FFEB3B",
    imageSlot: "scene-05-bg.png",
    transitionKind: "fade",
  },
];

const PAD_SEC = 1.4;
export const DURATION_SEC = SCENES.reduce((a, s) => a + s.durationSec, 0) + PAD_SEC; // 41.0s
export const TOTAL_FRAMES = Math.round(DURATION_SEC * FPS);

const SCENE_FRAMES = SCENES.map((s) => Math.round(s.durationSec * FPS));
const SCENE_STARTS: number[] = [];
{
  let acc = 0;
  for (const f of SCENE_FRAMES) {
    SCENE_STARTS.push(acc);
    acc += f;
  }
}

// ── Background renderer per scene: video if available, otherwise Ken-Burns image
const SceneBackground: React.FC<{ scene: Scene; sceneFrames: number }> = ({
  scene,
  sceneFrames,
}) => {
  if (scene.videoSlot) {
    return (
      <OffthreadVideo
        src={staticFile(`${PROJ}/assets/videos/${scene.videoSlot}`)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted
      />
    );
  }
  // Ken-Burns slow zoom on the still image
  return <KenBurns src={staticFile(`${PROJ}/assets/images/${scene.imageSlot}`)} totalFrames={sceneFrames} />;
};

const KenBurns: React.FC<{ src: string; totalFrames: number }> = ({ src, totalFrames }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, totalFrames], [1.04, 1.14], {
    extrapolateRight: "clamp",
  });
  const tx = interpolate(frame, [0, totalFrames], [-8, 8], {
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

// ── Micro-cut shake: a quick scale snap every ~1.5s inside long scenes to break monotony
const MicroCutPunch: React.FC<{ sceneFrames: number }> = ({ sceneFrames }) => {
  const frame = useCurrentFrame();
  // Punch every 45 frames (1.5s)
  const beatLen = 45;
  const inBeat = frame % beatLen;
  const punch = inBeat < 3 ? 1.04 : 1.0;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${punch})`,
        pointerEvents: "none",
      }}
    />
  );
};

// ── Step counter chip (top-left, sticks the entire scene)
const StepCounter: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 60,
        backgroundColor: "rgba(0,0,0,0.7)",
        color: "#FFEB3B",
        fontFamily,
        fontWeight: 900,
        fontSize: 100,
        padding: "12px 28px",
        borderRadius: 24,
        border: "4px solid #FFEB3B",
        lineHeight: 1,
        zIndex: 50,
      }}
    >
      {text}
    </div>
  );
};

// ── Named-transition title card (overlaid first 0.5s of incoming scene)
const NamedCard: React.FC<{ label: string; sceneFrames: number }> = ({ label, sceneFrames }) => {
  const frame = useCurrentFrame();
  const FADE_IN = 6;
  const HOLD = 8;
  const FADE_OUT = 8;
  const total = FADE_IN + HOLD + FADE_OUT;
  if (frame > total) return null;
  const opacity =
    frame < FADE_IN
      ? frame / FADE_IN
      : frame < FADE_IN + HOLD
        ? 1
        : 1 - (frame - FADE_IN - HOLD) / FADE_OUT;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        pointerEvents: "none",
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.78)",
          color: "#FFEB3B",
          fontFamily,
          fontWeight: 900,
          fontSize: 96,
          padding: "32px 56px",
          borderRadius: 32,
          textTransform: "uppercase",
          letterSpacing: 2,
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
};

// ── Big hook/step overlay (the on-screen anchor)
const Overlay: React.FC<{ text: string; accent?: string; large?: boolean }> = ({
  text,
  accent = "#FFFFFF",
  large = false,
}) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 10], [0.6, 1.0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: large ? "30%" : "auto",
        bottom: large ? "auto" : 280,
        left: 0,
        right: 0,
        textAlign: "center",
        color: accent,
        fontFamily,
        fontWeight: 900,
        fontSize: large ? 240 : 100,
        lineHeight: 1.05,
        textShadow: "0 6px 0 rgba(0,0,0,0.7), 0 0 24px rgba(0,0,0,0.6)",
        whiteSpace: "pre-line",
        transform: `scale(${pop})`,
        zIndex: 40,
        padding: "0 40px",
      }}
    >
      {text}
    </div>
  );
};

// ── Per-scene composite that goes inside TransitionSeries.Sequence
const SceneContent: React.FC<{ scene: Scene; sceneFrames: number }> = ({
  scene,
  sceneFrames,
}) => {
  const isHook = scene.id === "scene-01";
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <SceneBackground scene={scene} sceneFrames={sceneFrames} />

      {/* Dark vignette for text legibility */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {scene.counter ? <StepCounter text={scene.counter} /> : null}

      <Overlay text={scene.overlayMain} accent={scene.overlayAccent} large={isHook} />

      {scene.transitionLabel ? (
        <NamedCard label={scene.transitionLabel} sceneFrames={sceneFrames} />
      ) : null}

      <MicroCutPunch sceneFrames={sceneFrames} />
    </AbsoluteFill>
  );
};

// ── Pick transition presentation for the gap between scene i and scene i+1
const transitionForScene = (next: Scene) => {
  switch (next.transitionKind) {
    case "wipe-left":
      return wipe({ direction: "from-right" });
    case "fade":
      return fade();
    case "slide-left":
    default:
      return slide({ direction: "from-right" });
  }
};

export const TestTutorialYT001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {SCENES.map((s, i) => (
          <Fragment key={s.id}>
            <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[i]}>
              <SceneContent scene={s} sceneFrames={SCENE_FRAMES[i]} />
            </TransitionSeries.Sequence>
            {i < SCENES.length - 1 ? (
              <TransitionSeries.Transition
                presentation={transitionForScene(SCENES[i + 1])}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />
            ) : null}
          </Fragment>
        ))}
      </TransitionSeries>

      {/* VOs — laid in sequentially per scene start */}
      {SCENES.map((s, i) => (
        <Sequence key={`vo-${s.id}`} from={SCENE_STARTS[i]} durationInFrames={SCENE_FRAMES[i] + 6}>
          <Audio
            src={staticFile(`${PROJ}/assets/voiceover/${s.id}-voice.mp3`)}
            volume={1.0}
          />
        </Sequence>
      ))}

      {/* Music bed under all */}
      <Audio src={staticFile(`${PROJ}/assets/music/bed-01.mp3`)} volume={0.10} />

      {/* Hormozi captions on top */}
      <HormoziCaptions
        captions={captions}
        accentColor="#FFEB3B"
        fontSize={80}
        combineMs={350}
      />

      {/* AI-generated disclosure */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 32,
            fontSize: 22,
            opacity: 0.65,
            fontWeight: 700,
            color: "white",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textShadow: "1px 1px 0 rgba(0,0,0,0.6)",
            zIndex: 70,
          }}
        >
          AI-generated
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
