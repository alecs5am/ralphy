import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  delayRender,
  continueRender,
} from "remotion";

export const FPS = 30;
export const DURATION_SEC = 22.3;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS);

// Brand colour from the VENOM cobra
const EMERALD = "#1FB874";
const EMERALD_GLOW = "rgba(31, 184, 116, 0.45)";

// End-card window: last 2.3s of the spot
const CARD_START = 20.0;
const CARD_END = 22.3;

const TAGLINE = "STRIKE FIRST · SMELL LEGENDARY";

const useSpring = (
  frame: number,
  startSec: number,
  durSec: number,
  fps: number,
  ease: (n: number) => number = Easing.out(Easing.cubic),
) => {
  const startFr = startSec * fps;
  const endFr = (startSec + durSec) * fps;
  const raw = interpolate(frame, [startFr, endFr], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return ease(raw);
};

const BackdropDim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useSpring(frame, CARD_START, 0.4, fps);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.75) 100%)",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

const EmeraldBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useSpring(frame, CARD_START + 0.05, 0.35, fps, Easing.out(Easing.back(1.4)));
  const x = interpolate(t, [0, 1], [-40, 32]);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        transform: `translateX(${x}px)`,
        width: 8,
        background: EMERALD,
        boxShadow: `0 0 24px ${EMERALD_GLOW}`,
      }}
    />
  );
};

const VenomWord: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = useSpring(frame, CARD_START + 0.25, 0.55, fps, Easing.out(Easing.cubic));
  const slideY = interpolate(reveal, [0, 1], [60, 0]);
  // clip-path reveal from bottom — typographic mask
  const clipPct = interpolate(reveal, [0, 1], [100, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "55%",
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${slideY}px)`,
      }}
    >
      <div
        style={{
          fontFamily: "Bebas Neue, Impact, sans-serif",
          fontWeight: 400,
          fontSize: 280,
          lineHeight: 1,
          color: "#FFFFFF",
          letterSpacing: 12,
          clipPath: `inset(0 0 ${clipPct}% 0)`,
          filter: "drop-shadow(0 6px 24px rgba(0,0,0,0.6))",
        }}
      >
        VENOM
      </div>
    </div>
  );
};

const EmeraldRule: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sweep = useSpring(frame, CARD_START + 0.55, 0.45, fps, Easing.out(Easing.cubic));
  const width = interpolate(sweep, [0, 1], [0, 320]);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "75%",
        transform: "translateX(-50%)",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width,
          height: 4,
          background: EMERALD,
          boxShadow: `0 0 14px ${EMERALD_GLOW}`,
        }}
      />
    </div>
  );
};

const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const baseStartSec = CARD_START + 0.75;
  const opacityBase = useSpring(frame, baseStartSec, 0.45, fps);
  const chars = TAGLINE.split("");
  const perCharDelay = 0.018; // 18ms staggered fade
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "78%",
        display: "flex",
        justifyContent: "center",
        flexWrap: "nowrap",
      }}
    >
      <div
        style={{
          fontFamily: "Bebas Neue, Impact, sans-serif",
          fontWeight: 400,
          fontSize: 60,
          color: "#FFFFFF",
          letterSpacing: 14,
          opacity: opacityBase,
          textTransform: "uppercase",
          textShadow: "0 2px 14px rgba(0,0,0,0.55)",
          display: "flex",
          gap: 0,
        }}
      >
        {chars.map((ch, i) => {
          const charStart = baseStartSec + i * perCharDelay;
          const charOpacity = useSpring(frame, charStart, 0.25, fps);
          const charY = interpolate(charOpacity, [0, 1], [10, 0]);
          return (
            <span
              key={i}
              style={{
                opacity: charOpacity,
                transform: `translateY(${charY}px)`,
                display: "inline-block",
                whiteSpace: "pre",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFr = CARD_START * fps;
  const endFr = CARD_END * fps;
  if (frame < startFr || frame > endFr) return null;
  return (
    <>
      <BackdropDim />
      <EmeraldBar />
      <VenomWord />
      <EmeraldRule />
      <Tagline />
    </>
  );
};

export const VenomDeodorant001: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Bebas Neue"));

  useEffect(() => {
    const font = new FontFace(
      "Bebas Neue",
      `url(${staticFile("fonts/BebasNeue-Regular.ttf")}) format("truetype")`,
    );
    font
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Bebas Neue load failed", err);
        continueRender(handle);
      });
  }, [handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile("venom-deodorant-001/venom-with-music.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <EndCard />
    </AbsoluteFill>
  );
};
