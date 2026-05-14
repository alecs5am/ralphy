import { useEffect, useRef } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadVT323 } from "@remotion/google-fonts/VT323";

const { fontFamily: VT323_FONT } = loadVT323();

export const FPS = 30;
const P = "project-analog-horror-fridge-001";

type Scene = {
  id: string;
  icon: string;
  vo: string;
  text: string;
  durSec: number;
  voOffsetSec?: number;
  extraSfx?: { file: string; offsetSec?: number; volume?: number }[];
  /** Trailing climax-static window (in seconds, counted from scene start) */
  climaxFromSec?: number;
};

const SCENES: Scene[] = [
  {
    id: "scene-01",
    icon: "scene-01-icon-ebs.png",
    vo: "scene-01-vo.mp3",
    text: "COMPLIANCE BULLETIN 9-D",
    durSec: 3.0,
    voOffsetSec: 0.3,
    extraSfx: [{ file: "ebs-alert-tone.mp3", offsetSec: 0, volume: 0.55 }],
  },
  {
    id: "scene-02",
    icon: "scene-02-icon-dog-silhouette.png",
    vo: "scene-02-vo.mp3",
    text: "RESIDENTIAL BEHAVIORAL ALERT",
    durSec: 3.0,
    voOffsetSec: 0.2,
  },
  {
    id: "scene-03",
    icon: "scene-03-icon-dog-bed-watcher.png",
    vo: "scene-03-vo.mp3",
    text: "IF YOUR DOG WATCHES YOU SLEEP",
    durSec: 2.72,
    voOffsetSec: 0.2,
    extraSfx: [{ file: "dog-breath-slow.mp3", offsetSec: 0.1, volume: 0.5 }],
  },
  {
    id: "scene-04",
    icon: "scene-04-icon-dog-mirror.png",
    vo: "scene-04-vo.mp3",
    text: "IF ITS REFLECTION DOES NOT BLINK",
    durSec: 2.53,
    voOffsetSec: 0.2,
    extraSfx: [{ file: "mirror-shimmer.mp3", offsetSec: 0, volume: 0.45 }],
  },
  {
    id: "scene-05",
    icon: "scene-05-icon-dog-whisper.png",
    vo: "scene-05-vo.mp3",
    text: "IF IT WHISPERS YOUR NAME WHEN ALONE",
    durSec: 2.82,
    voOffsetSec: 0.2,
    extraSfx: [{ file: "child-whisper-buried.mp3", offsetSec: 0.2, volume: 0.35 }],
  },
  {
    id: "scene-06",
    icon: "scene-06-icon-no-eye-contact.png",
    vo: "scene-06-vo.mp3",
    text: "DO NOT LOOK IN ITS EYES AFTER SUNSET",
    durSec: 2.69,
    voOffsetSec: 0.2,
    extraSfx: [{ file: "low-drone-bed.mp3", offsetSec: 0, volume: 0.4 }],
  },
  {
    id: "scene-07",
    icon: "scene-07-icon-no-old-name.png",
    vo: "scene-07-vo.mp3",
    text: "DO NOT SAY ITS OLD NAME",
    durSec: 2.14,
    voOffsetSec: 0.2,
    extraSfx: [{ file: "distant-bark-slowed.mp3", offsetSec: 0.3, volume: 0.45 }],
  },
  {
    id: "scene-08",
    icon: "scene-08-icon-no-bed.png",
    vo: "scene-08-vo.mp3",
    text: "DO NOT LET IT ON YOUR BED",
    durSec: 2.19,
    voOffsetSec: 0.2,
    extraSfx: [{ file: "low-growl-rise.mp3", offsetSec: 0.1, volume: 0.5 }],
  },
  {
    id: "scene-09",
    icon: "scene-09-icon-empty-collar.png",
    vo: "scene-09-vo.mp3",
    text: "BUT YOUR DOG DIED THREE YEARS AGO",
    durSec: 3.12,
    voOffsetSec: 0.2,
    extraSfx: [
      { file: "wind-through-trees.mp3", offsetSec: 0, volume: 0.45 },
      { file: "collar-jingle-stops.mp3", offsetSec: 1.3, volume: 0.55 },
    ],
  },
  {
    id: "scene-10",
    icon: "scene-10-icon-dog-grin.png",
    vo: "scene-10-vo.mp3",
    text: "AND TONIGHT IT STOPS PRETENDING",
    durSec: 5.12,
    voOffsetSec: 0.2,
    climaxFromSec: 2.6,
    extraSfx: [
      { file: "rgb-static-burst.mp3", offsetSec: 2.5, volume: 0.7 },
      { file: "signal-lost-tone.mp3", offsetSec: 2.7, volume: 0.55 },
      // Layer 4 monstrous growl variants for a wall-of-sound climax (replaces the chihuahua-sounding low-growl-rise)
      { file: "climax-growl-v2.mp3", offsetSec: 1.5, volume: 0.55 },
      { file: "climax-growl-v3.mp3", offsetSec: 1.8, volume: 0.55 },
      { file: "climax-growl-v4.mp3", offsetSec: 1.9, volume: 0.6 },
      { file: "climax-growl-v5.mp3", offsetSec: 2.1, volume: 0.55 },
    ],
  },
];

const SCENE_FRAMES = SCENES.map((s) => Math.round(s.durSec * FPS));
const SCENE_STARTS = SCENE_FRAMES.reduce<number[]>((acc, _, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SCENE_FRAMES[i - 1]);
  return acc;
}, []);
export const TOTAL_FRAMES = SCENE_FRAMES.reduce((a, b) => a + b, 0);

const ASSET = (kind: "images" | "voiceover" | "sfx" | "music", file: string) =>
  staticFile(`${P}/assets/${kind}/${file}`);

const ICON_ASSET = (file: string) => staticFile(`${P}/assets/images-keyed/${file}`);

// ─── Scene icon + caption ────────────────────────────────────────────────────

const SceneIcon: React.FC<{ scene: Scene; localFrame: number; sceneFrames: number }> = ({
  scene,
  localFrame,
  sceneFrames,
}) => {
  // Icon fades in over first 4 frames, holds, then for climax fades out at climaxFromSec
  const climaxFrame = scene.climaxFromSec ? Math.round(scene.climaxFromSec * FPS) : sceneFrames;
  const iconOpacity = localFrame >= climaxFrame ? 0 : interpolate(localFrame, [0, 3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Subtle horizontal jitter per scene (analog-tape feel)
  const jitterX = Math.round((random(`${scene.id}-jx-${Math.floor(localFrame / 3)}`) - 0.5) * 4);
  const jitterY = Math.round((random(`${scene.id}-jy-${Math.floor(localFrame / 3)}`) - 0.5) * 2);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          position: "relative",
          width: 1080,
          height: 1300,
          transform: `translate(${jitterX}px, ${jitterY}px)`,
          opacity: iconOpacity,
        }}
      >
        <Img
          src={ICON_ASSET(scene.icon)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const SceneCaption: React.FC<{ scene: Scene; localFrame: number; sceneFrames: number }> = ({
  scene,
  localFrame,
  sceneFrames,
}) => {
  const climaxFrame = scene.climaxFromSec ? Math.round(scene.climaxFromSec * FPS) : sceneFrames;
  if (localFrame >= climaxFrame) return null;

  const fadeIn = interpolate(localFrame, [4, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Caption color: red for the EBS hook (scene-01), yellow for the rest
  const isHook = scene.id === "scene-01";
  const fill = isHook ? "#ff1a1a" : "#ffd400";
  const shadow = isHook ? "#3a0000" : "#3a2a00";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 220,
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: 940,
          textAlign: "center",
          fontFamily: `${VT323_FONT}, monospace`,
          fontSize: 96,
          fontWeight: 400,
          lineHeight: 1,
          letterSpacing: 2,
          color: fill,
          textShadow: `4px 0 0 ${shadow}, -4px 0 0 #001a33, 0 0 18px rgba(0,0,0,0.9)`,
        }}
      >
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};

// ─── Effects layers ──────────────────────────────────────────────────────────

const Scanlines: React.FC<{ intense?: boolean }> = ({ intense }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: intense
          ? "repeating-linear-gradient(to bottom, rgba(0,0,0,0.58) 0px, rgba(0,0,0,0.58) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px)"
          : "repeating-linear-gradient(to bottom, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px)",
        mixBlendMode: "multiply",
        pointerEvents: "none",
      }}
    />
  );
};

const Grain: React.FC<{ intense?: boolean }> = ({ intense }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / (intense ? 1 : 2)); // 1-frame stutter in intense mode
  const count = intense ? 260 : 60;
  const dots = Array.from({ length: count }, (_, i) => {
    const x = random(`grain-x-${seed}-${i}`) * 1080;
    const y = random(`grain-y-${seed}-${i}`) * 1920;
    const a = random(`grain-a-${seed}-${i}`) * (intense ? 0.42 : 0.18) + (intense ? 0.12 : 0.05);
    const s = Math.round(random(`grain-s-${seed}-${i}`) * 3) + 2;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: s,
          height: s,
          background: `rgba(255,255,210,${a})`,
        }}
      />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{dots}</AbsoluteFill>;
};

// Extra 90s-CRT effects layered only when noisy mode is on.
const CrtNoise: React.FC = () => {
  const frame = useCurrentFrame();

  // Iridescent diagonal sheen — slow soft animation, bottom-right → top-left
  // Position shifts ±60px on a 180-frame loop (6s) to give a subtle drift.
  const sheenT = (frame % 180) / 180; // 0..1
  const sheenShift = Math.sin(sheenT * Math.PI * 2) * 60;

  // CRT phosphor brightness flicker
  const flicker = 0.92 + random(`flicker-${Math.floor(frame / 4)}`) * 0.16;

  // 10 static horizontal glitch bars — positions stay fixed for ~25-frame windows,
  // then re-randomize to new positions (so they "stutter" not "scroll")
  const barSeed = Math.floor(frame / 25);
  const bars = Array.from({ length: 10 }, (_, i) => {
    const y = random(`hbar-y-${barSeed}-${i}`) * 1820 + 30;
    const w = 200 + random(`hbar-w-${barSeed}-${i}`) * 700;
    const left = random(`hbar-x-${barSeed}-${i}`) * (1080 - w);
    const h = Math.round(random(`hbar-h-${barSeed}-${i}`) * 4) + 2;
    const a = random(`hbar-a-${barSeed}-${i}`) * 0.35 + 0.18;
    const colorRoll = random(`hbar-c-${barSeed}-${i}`);
    const color =
      colorRoll < 0.7
        ? `rgba(220,220,220,${a})`
        : colorRoll < 0.88
        ? `rgba(200,160,140,${a})` // sepia/brown tape-burn tone
        : `rgba(130,180,210,${a})`; // cold-blue dropout
    // Visible only when this bar's "alive" flag passes (some bars are off in a window)
    const alive = random(`hbar-alive-${barSeed}-${i}`) > 0.18;
    if (!alive) return null;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left,
          top: y,
          width: w,
          height: h,
          background: color,
          filter: "blur(1.2px)",
          pointerEvents: "none",
        }}
      />
    );
  });

  // Snow specks — denser
  const seed = Math.floor(frame / 1);
  const snow = Array.from({ length: 70 }, (_, i) => {
    const x = random(`snow-x-${seed}-${i}`) * 1080;
    const y = random(`snow-y-${seed}-${i}`) * 1920;
    const s = Math.round(random(`snow-s-${seed}-${i}`) * 3) + 1;
    const a = random(`snow-a-${seed}-${i}`) * 0.35 + 0.15;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: s,
          height: s,
          background: `rgba(255,255,255,${a})`,
        }}
      />
    );
  });

  return (
    <>
      {/* Iridescent diagonal sheen — pearly CRT gradient from bottom-right → top-left.
          Uses TWO stacked gradients for a soft "oil sheen" feel. Animates by shifting position. */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${135 + sheenShift * 0.05}deg,
            rgba(200,210,225,0) 0%,
            rgba(200,210,225,0) ${40 - sheenShift * 0.04}%,
            rgba(210,220,235,0.10) ${55 - sheenShift * 0.04}%,
            rgba(225,200,215,0.08) ${68 - sheenShift * 0.04}%,
            rgba(195,215,225,0.06) ${80 - sheenShift * 0.04}%,
            rgba(200,210,225,0) 100%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(${130 - sheenShift * 0.03}deg,
            rgba(170,190,210,0) 0%,
            rgba(170,190,210,0) 30%,
            rgba(190,210,220,0.06) 60%,
            rgba(170,190,210,0) 100%)`,
          mixBlendMode: "screen",
          pointerEvents: "none",
          transform: `translate(${sheenShift * 0.3}px, ${-sheenShift * 0.3}px)`,
        }}
      />

      {/* Phosphor flicker — translucent overlay */}
      <AbsoluteFill
        style={{
          background: `rgba(255,255,255,${(flicker - 1) * 0.25})`,
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />

      {/* 10 static horizontal glitch bars at random fixed positions per ~25-frame window */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>{bars}</AbsoluteFill>

      {/* Snow specks */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>{snow}</AbsoluteFill>

      {/* Vignette darkening at corners — CRT tube shape */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.35) 75%, rgba(0,0,0,0.85) 100%)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
    </>
  );
};

const ChromaticAberration: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const shift = 2 + Math.round(random(`ca-${Math.floor(frame / 4)}`) * 2);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, opacity: 0.6, mixBlendMode: "screen" }}>
        <AbsoluteFill style={{ transform: `translateX(-${shift}px)`, filter: "hue-rotate(-30deg)" }}>
          {children}
        </AbsoluteFill>
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: 0.6, mixBlendMode: "screen" }}>
        <AbsoluteFill style={{ transform: `translateX(${shift}px)`, filter: "hue-rotate(30deg)" }}>
          {children}
        </AbsoluteFill>
      </div>
      <AbsoluteFill>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.85) 100%)",
        pointerEvents: "none",
      }}
    />
  );
};

// ─── Climax full-screen RGB static ───────────────────────────────────────────

// SMPTE-style "no signal" colour bars climax — degraded VHS look
const SignalLostColorBars: React.FC = () => {
  const frame = useCurrentFrame();

  // 3 big vertical bars top (the dominant analog-horror palette)
  const TOP_BARS = [
    "#1ce0e0", // cyan
    "#39d639", // green
    "#d83fd8", // magenta
  ];
  // Bottom strip — multiple narrower bars (mix of opposite colors + saturated grades)
  const BOTTOM_BARS = ["#d83fd8", "#181818", "#1ce0e0", "#39d639", "#d83fd8"];

  // Horizontal sync-glitch jitter — per-frame offset (the whole pattern shifts left/right)
  const syncX = Math.round((random(`sync-${frame}`) - 0.5) * 18);
  // Vertical roll glitch — once every ~6 frames, push the image up/down
  const rollY = Math.round((random(`roll-${Math.floor(frame / 6)}`) - 0.5) * 8);

  // Tracking-error rolling bars (horizontal washed-out streaks that move down)
  const trackY = ((frame * 18) % 2200) - 200;

  // Random dust specks + dropouts
  const seed = Math.floor(frame / 2);
  const specks = Array.from({ length: 28 }, (_, i) => {
    const x = random(`speck-x-${seed}-${i}`) * 1080;
    const y = random(`speck-y-${seed}-${i}`) * 1920;
    const s = Math.round(random(`speck-s-${seed}-${i}`) * 5) + 2;
    const dark = random(`speck-d-${seed}-${i}`) > 0.5;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: s,
          height: s * 1.6,
          background: dark ? "#000" : "rgba(255,255,255,0.55)",
          opacity: 0.85,
        }}
      />
    );
  });

  // Short horizontal scratch lines (white)
  const scratches = Array.from({ length: 5 }, (_, i) => {
    const x = random(`scr-x-${seed}-${i}`) * 1080;
    const y = random(`scr-y-${seed}-${i}`) * 1920;
    const w = 60 + Math.round(random(`scr-w-${seed}-${i}`) * 240);
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: 2,
          background: "rgba(255,255,255,0.6)",
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${syncX}px, ${rollY}px)`,
          filter: "blur(2.5px) saturate(1.15)",
        }}
      >
        {/* Top 78% — three big vertical bars */}
        <div style={{ position: "absolute", inset: 0, height: "78%", display: "flex" }}>
          {TOP_BARS.map((c, i) => (
            <div key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
        {/* Bottom 22% — multi-color strip with one black gap */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "78%",
            bottom: 0,
            display: "flex",
          }}
        >
          {BOTTOM_BARS.map((c, i) => (
            <div key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
      </div>

      {/* Chromatic-aberration ghost layer (red shift left) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${syncX - 6}px, ${rollY}px)`,
          filter: "blur(4px) hue-rotate(40deg)",
          mixBlendMode: "screen",
          opacity: 0.45,
        }}
      >
        <div style={{ position: "absolute", inset: 0, height: "78%", display: "flex" }}>
          {TOP_BARS.map((c, i) => (
            <div key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "78%",
            bottom: 0,
            display: "flex",
          }}
        >
          {BOTTOM_BARS.map((c, i) => (
            <div key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
      </div>

      {/* Tracking-error horizontal bands — washed-out streaks moving down */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: trackY,
          height: 80,
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0) 100%)",
          filter: "blur(4px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: trackY - 220,
          height: 50,
          background: "rgba(255,255,255,0.18)",
          filter: "blur(5px)",
        }}
      />

      {/* Heavy noisy scanlines on top of the bars */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)",
          mixBlendMode: "multiply",
        }}
      />

      {/* Dust + scratches + dropouts */}
      {specks}
      {scratches}
    </AbsoluteFill>
  );
};

// ─── Scene component ─────────────────────────────────────────────────────────

const SceneBlock: React.FC<{ scene: Scene; sceneFrames: number }> = ({ scene, sceneFrames }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      {/* Icon + caption layer (faded out during climax window) */}
      <ChromaticAberration>
        <SceneIcon scene={scene} localFrame={frame} sceneFrames={sceneFrames} />
      </ChromaticAberration>
      <SceneCaption scene={scene} localFrame={frame} sceneFrames={sceneFrames} />

      {/* Climax — SMPTE-style colour bars inside scene-10 */}
      {scene.climaxFromSec && frame >= Math.round(scene.climaxFromSec * FPS) && (
        <SignalLostColorBars />
      )}

      {/* Per-scene VO (delayed by voOffsetSec via Sequence) */}
      <Sequence from={Math.round((scene.voOffsetSec ?? 0) * FPS)}>
        <Audio src={ASSET("voiceover", scene.vo)} volume={1.0} />
      </Sequence>

      {/* Per-scene SFX (static-pop at start of every scene) */}
      <Audio src={ASSET("sfx", "static-pop.mp3")} volume={0.55} />

      {/* Per-scene extra SFX */}
      {scene.extraSfx?.map((s, i) => (
        <Sequence key={i} from={Math.round((s.offsetSec ?? 0) * FPS)}>
          <Audio src={ASSET("sfx", s.file)} volume={s.volume ?? 0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// ─── Root ────────────────────────────────────────────────────────────────────

export const AnalogHorrorFridge001: React.FC<{ noisy?: boolean }> = ({ noisy = false }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Pure black background — matches the icons' transparent areas perfectly so no visible rectangle */}

      {/* Scene stack */}
      {SCENES.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={SCENE_STARTS[i]}
          durationInFrames={SCENE_FRAMES[i]}
          name={scene.id}
        >
          <SceneBlock scene={scene} sceneFrames={SCENE_FRAMES[i]} />
        </Sequence>
      ))}

      {/* Global overlays (intensity scales with noisy) */}
      <Grain intense={noisy} />
      <Scanlines intense={noisy} />
      <Vignette />

      {/* Heavy 90s-CRT TV effects — only in noisy mode */}
      {noisy && <CrtNoise />}

      {/* Global ambient beds (loop the whole video) */}
      <Audio src={ASSET("sfx", "vhs-hiss-bed.mp3")} volume={noisy ? 0.32 : 0.18} loop />
      <Audio src={ASSET("sfx", "low-drone-bed.mp3")} volume={0.12} loop />

      {/* Music bed — creepy synth tension from "Sound Production Gin" */}
      <Audio src={ASSET("music", "bed-creepy-synth.mp3")} volume={0.4} />
    </AbsoluteFill>
  );
};

export const AnalogHorrorFridge001Noisy: React.FC = () => <AnalogHorrorFridge001 noisy />;

// ─── Mobius1-style CRT/VCR effect (https://codepen.io/Mobius1/pen/ZNgwbr) ───
// Snow canvas (Uint32 random noise) + VCR tracking canvas (20 dotted streaks with tails)
// + CSS scanlines (2px horiz lines + 3px RGB sub-pixel pattern). NO vignette.

function getRandInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SnowCanvas: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(w, h);
    const buf32 = new Uint32Array(imageData.data.buffer);
    for (let i = 0; i < buf32.length; i++) {
      buf32[i] = ((255 * Math.random()) | 0) << 24;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [frame, w, h]);

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#aaa",
        opacity: 0.2,
        pointerEvents: "none",
      }}
    />
  );
};

const VcrTrackingCanvas: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";

    const renderTail = (x: number, y: number, radius: number) => {
      const n = getRandInt(1, 50);
      const dir = Math.random() < 0.5 ? 1 : -1;
      let r = radius;
      let xPos = x;
      let curRad = radius;
      for (let i = 0; i < n; i++) {
        const step = 0.01;
        r = getRandInt(curRad - step, radius);
        const dx = getRandInt(1, 4) * dir;
        curRad -= 0.1;
        xPos += dx;
        ctx.fillRect(xPos, y, r, r);
      }
    };

    let posy1 = 0;
    let posy2 = canvas.height;
    let posy3 = 0;
    const num = 20;
    const radius = 2;

    ctx.beginPath();
    for (let i = 0; i <= num; i++) {
      const x = Math.random() * canvas.width;
      posy1 += 3;
      posy3 -= 3;
      const y1 = getRandInt(posy1, posy2);
      const y2 = getRandInt(0, posy3);
      ctx.fillRect(x, y1, radius, radius);
      ctx.fillRect(x, y2, radius, radius);
      ctx.fill();
      renderTail(x, y1, radius);
      renderTail(x, y2, radius);
    }
    ctx.closePath();
  }, [frame]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        filter: "blur(1px)",
        pointerEvents: "none",
      }}
    />
  );
};

const MobiusScanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%), linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06))",
      backgroundSize: "100% 2px, 3px 100%",
      pointerEvents: "none",
    }}
  />
);

// Tiny per-frame transform jitter applied to a wrapper (Mobius's wobblex/wobbley).
const MobiusWobble: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  // 100ms cycle on wobblex ≈ 3 frames at 30fps. Translate 1px on tick.
  const x = frame % 3 === 1 ? 1 : 0;
  const y = frame % 3 === 0 ? 1 : 0;
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px)` }}>{children}</AbsoluteFill>
  );
};

// ─── GLITCHXploitR-inspired variant: chromatic RGB-split caption + Sys font ──
// https://codepen.io/GLITCHXploitR/pen/OxGKrq
// Reuses SnowCanvas + MobiusScanlines, NO vignette. Captions are five stacked
// spans with per-frame jerk/glitch transforms — heavy chromatic aberration.

const GLITCH_FONT = '"Sys", "Terminal", monospace';

const GlitchCaption: React.FC<{ scene: Scene; localFrame: number; sceneFrames: number }> = ({
  scene,
  localFrame,
  sceneFrames,
}) => {
  const climaxFrame = scene.climaxFromSec ? Math.round(scene.climaxFromSec * FPS) : sceneFrames;
  if (localFrame >= climaxFrame) return null;

  const fadeIn = interpolate(localFrame, [4, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // jerk (every ~2 frames translateX ±1) and jerkup (every ~3 frames translateY ±1)
  const jerkX = localFrame % 2 === 0 ? 1 : 0;
  const jerkY = localFrame % 3 === 0 ? 1 : 0;

  // glitch1/glitch2: every ~30 frames push +10/-10px for 1 frame
  const beat = localFrame % 30;
  const glitchA = beat === 9 ? 10 : 0;
  const glitchB = beat === 21 ? -10 : 0;

  const isHook = scene.id === "scene-01";
  const baseSize = 88;

  const TEXT = scene.text;

  const layer = (
    color: string,
    dx: number,
    dy: number,
    blur: number,
    opacity = 1,
    shadow?: string
  ): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    color,
    textAlign: "center",
    transform: `translate(${dx}px, ${dy}px)`,
    filter: `blur(${blur}px)`,
    opacity,
    textShadow: shadow,
    fontFamily: GLITCH_FONT,
    fontSize: baseSize,
    letterSpacing: 2,
    lineHeight: 1.05,
    fontWeight: 400,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 230,
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 940,
          height: 260,
          transform: `translate(${jerkX}px, ${jerkY}px)`,
        }}
      >
        {/* Red layer — shifted left, blurred */}
        <div style={layer(isHook ? "#ff5050" : "#ff0033", -3 + glitchA, 0, 2, 0.85)}>{TEXT}</div>
        {/* Green/lime layer — shifted right, blurred */}
        <div style={layer(isHook ? "#ffaa50" : "#00ff7a", 3 + glitchB, jerkY ? 1 : 0, 2, 0.85)}>
          {TEXT}
        </div>
        {/* Blue layer — center, with glitch jump */}
        <div style={layer("#3a9eff", glitchA + glitchB, 0, 1.5, 0.85)}>{TEXT}</div>
        {/* White core — solid readable with strong shadow */}
        <div
          style={layer(
            "#ffffff",
            0,
            0,
            0.8,
            1,
            "0 0 6px rgba(255,255,255,0.6), 0 0 14px rgba(255,255,255,0.4)"
          )}
        >
          {TEXT}
        </div>
        {/* Wide soft white glow */}
        <div style={layer("rgba(255,255,255,0.18)", 0, 0, 15, 1)}>{TEXT}</div>
      </div>
    </AbsoluteFill>
  );
};

const GlitchSceneBlock: React.FC<{ scene: Scene; sceneFrames: number }> = ({
  scene,
  sceneFrames,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <ChromaticAberration>
        <SceneIcon scene={scene} localFrame={frame} sceneFrames={sceneFrames} />
      </ChromaticAberration>
      <GlitchCaption scene={scene} localFrame={frame} sceneFrames={sceneFrames} />

      {scene.climaxFromSec && frame >= Math.round(scene.climaxFromSec * FPS) && (
        <SignalLostColorBars />
      )}

      <Sequence from={Math.round((scene.voOffsetSec ?? 0) * FPS)}>
        <Audio src={ASSET("voiceover", scene.vo)} volume={1.0} />
      </Sequence>
      <Audio src={ASSET("sfx", "static-pop.mp3")} volume={0.55} />
      {scene.extraSfx?.map((s, i) => (
        <Sequence key={i} from={Math.round((s.offsetSec ?? 0) * FPS)}>
          <Audio src={ASSET("sfx", s.file)} volume={s.volume ?? 0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Inline @font-face using staticFile so the bundler doesn't try to resolve at build time.
const GLITCH_FONT_CSS = `
@font-face {
  font-family: "Sys";
  src: url('${staticFile("fonts/glitchx/sys.ttf")}') format('truetype');
  font-display: block;
}
@font-face {
  font-family: "Terminal";
  src: url('${staticFile("fonts/glitchx/terminal_copy.ttf")}') format('truetype');
  font-display: block;
}
`;

// Icon variant with the same chromatic-aberration + jerk + glitch1/2 treatment as GlitchCaption.
const GlitchXIcon: React.FC<{ scene: Scene; localFrame: number; sceneFrames: number }> = ({
  scene,
  localFrame,
  sceneFrames,
}) => {
  const climaxFrame = scene.climaxFromSec ? Math.round(scene.climaxFromSec * FPS) : sceneFrames;
  const iconOpacity = localFrame >= climaxFrame
    ? 0
    : interpolate(localFrame, [0, 3], [0, 1], { extrapolateRight: "clamp" });

  // jerk every 2 frames, jerkup every 3 frames
  const jerkX = localFrame % 2 === 0 ? 1 : 0;
  const jerkY = localFrame % 3 === 0 ? 1 : 0;
  // Frequent glitch impulses — every 18 frames (~0.6s) we get +/- 16px jumps for 2 frames
  const beat = localFrame % 18;
  const glitchA = beat <= 1 ? 16 : 0;
  const glitchB = beat >= 9 && beat <= 10 ? -16 : 0;
  // Extra rare big tear — every 60 frames, one frame of huge offset on red layer
  const tear = localFrame % 60 === 30 ? 30 : 0;

  // Heavier base jitter (random per ~2-frame window)
  const baseJitX = Math.round((random(`${scene.id}-ijx-${Math.floor(localFrame / 2)}`) - 0.5) * 6);
  const baseJitY = Math.round((random(`${scene.id}-ijy-${Math.floor(localFrame / 2)}`) - 0.5) * 4);
  // Subtle scale wobble — breathing analog-tape feel
  const scaleW = 1 + (random(`${scene.id}-sw-${Math.floor(localFrame / 4)}`) - 0.5) * 0.018;

  // Random opacity flicker on the blue ghost (rare dropouts)
  const blueAlive = random(`${scene.id}-bb-${Math.floor(localFrame / 4)}`) > 0.12 ? 0.75 : 0.15;

  const ICON_W = 1080;
  const ICON_H = 1300;

  const iconLayer = (
    dx: number,
    dy: number,
    blur: number,
    hue: number,
    opacity: number,
    blend: React.CSSProperties["mixBlendMode"] = "screen"
  ) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate(${dx}px, ${dy}px)`,
        filter: `blur(${blur}px) hue-rotate(${hue}deg)`,
        opacity,
        mixBlendMode: hue !== 0 ? blend : "normal",
      }}
    >
      <Img
        src={ICON_ASSET(scene.icon)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
    </div>
  );

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          position: "relative",
          width: ICON_W,
          height: ICON_H,
          transform: `translate(${baseJitX + jerkX}px, ${baseJitY + jerkY}px) scale(${scaleW})`,
          opacity: iconOpacity,
        }}
      >
        {/* Wide soft halo (very blurred) — bottom layer */}
        {iconLayer(0, 0, 22, 0, 0.55, "normal")}
        {/* Red ghost — shifted hard left, blurred, hue → red */}
        {iconLayer(-12 + glitchA - tear, 1, 4, -40, 0.85)}
        {/* Green/lime ghost — shifted hard right, hue → green */}
        {iconLayer(12 + glitchB, jerkY ? 1 : 0, 4, 60, 0.85)}
        {/* Blue/cyan ghost — random glitch shift + flicker dropout */}
        {iconLayer(glitchA + glitchB + tear, 0, 3, 180, blueAlive)}
        {/* Second red ghost layer for extra bleed */}
        {iconLayer(-6 + glitchB, 0, 6, -40, 0.4)}
        {/* Core sharp icon — slightly soft so it doesn't read as crisp vector */}
        {iconLayer(0, 0, 0.9, 0, 1, "normal")}
      </div>
    </AbsoluteFill>
  );
};

const GlitchXFullSceneBlock: React.FC<{ scene: Scene; sceneFrames: number }> = ({
  scene,
  sceneFrames,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <GlitchXIcon scene={scene} localFrame={frame} sceneFrames={sceneFrames} />
      <GlitchCaption scene={scene} localFrame={frame} sceneFrames={sceneFrames} />

      {scene.climaxFromSec && frame >= Math.round(scene.climaxFromSec * FPS) && (
        <SignalLostColorBars />
      )}

      <Sequence from={Math.round((scene.voOffsetSec ?? 0) * FPS)}>
        <Audio src={ASSET("voiceover", scene.vo)} volume={1.0} />
      </Sequence>
      <Audio src={ASSET("sfx", "static-pop.mp3")} volume={0.55} />
      {scene.extraSfx?.map((s, i) => (
        <Sequence key={i} from={Math.round((s.offsetSec ?? 0) * FPS)}>
          <Audio src={ASSET("sfx", s.file)} volume={s.volume ?? 0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const AnalogHorrorFridge001GlitchXFull: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <style>{GLITCH_FONT_CSS}</style>
      <MobiusWobble>
        {SCENES.map((scene, i) => (
          <Sequence
            key={scene.id}
            from={SCENE_STARTS[i]}
            durationInFrames={SCENE_FRAMES[i]}
            name={scene.id}
          >
            <GlitchXFullSceneBlock scene={scene} sceneFrames={SCENE_FRAMES[i]} />
          </Sequence>
        ))}
      </MobiusWobble>

      <VcrTrackingCanvas />
      <SnowCanvas />
      <MobiusScanlines />

      <Audio src={ASSET("sfx", "vhs-hiss-bed.mp3")} volume={0.22} loop />
      <Audio src={ASSET("sfx", "low-drone-bed.mp3")} volume={0.12} loop />
      <Audio src={ASSET("music", "bed-creepy-synth.mp3")} volume={0.4} />
    </AbsoluteFill>
  );
};

export const AnalogHorrorFridge001GlitchX: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <style>{GLITCH_FONT_CSS}</style>
      <MobiusWobble>
        {SCENES.map((scene, i) => (
          <Sequence
            key={scene.id}
            from={SCENE_STARTS[i]}
            durationInFrames={SCENE_FRAMES[i]}
            name={scene.id}
          >
            <GlitchSceneBlock scene={scene} sceneFrames={SCENE_FRAMES[i]} />
          </Sequence>
        ))}
      </MobiusWobble>

      {/* Mobius-derived noise stack (no vignette) */}
      <VcrTrackingCanvas />
      <SnowCanvas />
      <MobiusScanlines />

      <Audio src={ASSET("sfx", "vhs-hiss-bed.mp3")} volume={0.22} loop />
      <Audio src={ASSET("sfx", "low-drone-bed.mp3")} volume={0.12} loop />
      <Audio src={ASSET("music", "bed-creepy-synth.mp3")} volume={0.4} />
    </AbsoluteFill>
  );
};

export const AnalogHorrorFridge001Mobius: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Content + Mobius wobble */}
      <MobiusWobble>
        {SCENES.map((scene, i) => (
          <Sequence
            key={scene.id}
            from={SCENE_STARTS[i]}
            durationInFrames={SCENE_FRAMES[i]}
            name={scene.id}
          >
            <SceneBlock scene={scene} sceneFrames={SCENE_FRAMES[i]} />
          </Sequence>
        ))}
      </MobiusWobble>

      {/* Mobius1 effect stack — VCR tracking → snow → scanlines. NO vignette. */}
      <VcrTrackingCanvas />
      <SnowCanvas />
      <MobiusScanlines />

      {/* Audio: same beds + music as base composition */}
      <Audio src={ASSET("sfx", "vhs-hiss-bed.mp3")} volume={0.22} loop />
      <Audio src={ASSET("sfx", "low-drone-bed.mp3")} volume={0.12} loop />
      <Audio src={ASSET("music", "bed-creepy-synth.mp3")} volume={0.4} />
    </AbsoluteFill>
  );
};
