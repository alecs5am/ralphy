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
export const DURATION_SEC = 26.27;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS);

// Brand — flat, no glow
const EMERALD = "#1FB874";
const BLACK = "#0A0A0A";
const WHITE = "#FFFFFF";

// Frame-break (inside sc-01)
const FRAME_BREAK_START = 2.6;
const FRAME_BREAK_PEAK = 3.4;
const FRAME_BREAK_END = 3.8;

const MEME_HEADER = "WHEN COMMERCIALS HAD NO LIMITS 💀";

// NO LIMITS slam (sc-02) — Scribe v1: "No" t=5.78, "limits" t=6.46-7.16
const NL_SLAM_START = 5.65;
const NL_SLAM_PEAK = 5.85;
const NL_SLAM_OUT_START = 7.20;
const NL_SLAM_OUT_END = 7.55;

// Ramp-up cards (sc-2a / sc-2b)
type RampCard = { text: string; start: number; end: number };
const RAMP_CARDS: RampCard[] = [
  { text: "HE DOESN'T RUN", start: 9.30, end: 11.00 },
  { text: "HE JUMPS IN", start: 12.15, end: 14.10 },
];

// Location cycle cards (sc-03)
const LOC_CARDS: RampCard[] = [
  { text: "THE SUMMIT", start: 17.50, end: 18.50 },
  { text: "THE SHOWER", start: 18.55, end: 19.55 },
  { text: "THE DESERT", start: 19.60, end: 20.20 },
];

// End-card (sc-04)
const END_CARD_START = 21.50;
const END_CARD_HERO_START = 21.85;
const END_CARD_BADGE_START = 23.65;
const END_CARD_BOUNDS_START = 25.00;

const BEBAS = "Bebas Neue, Impact, sans-serif";

// ============================================================================
// Letterbox overlay (Sc-01)
// ============================================================================

const LetterboxOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t >= FRAME_BREAK_END) return null;

  const breakProgress = interpolate(
    t,
    [FRAME_BREAK_START, FRAME_BREAK_PEAK, FRAME_BREAK_END],
    [0, 0.6, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );

  const topBarTranslateY = interpolate(breakProgress, [0, 1], [0, -100]);
  const bottomBarTranslateY = interpolate(breakProgress, [0, 1], [0, 100]);
  const headerOpacity = interpolate(breakProgress, [0, 0.5, 1], [1, 0.4, 0]);
  const headerY = interpolate(breakProgress, [0, 1], [0, -160]);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "18%",
          background: WHITE,
          transform: `translateY(${topBarTranslateY}%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 40px",
        }}
      >
        <div
          style={{
            transform: `translateY(${headerY}%)`,
            opacity: headerOpacity,
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontWeight: 700,
            fontSize: 60,
            color: BLACK,
            textAlign: "center",
            lineHeight: 1.05,
            letterSpacing: -0.5,
          }}
        >
          {MEME_HEADER}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "18%",
          background: WHITE,
          transform: `translateY(${bottomBarTranslateY}%)`,
        }}
      />
    </>
  );
};

// ============================================================================
// NO LIMITS slam — flat dense color block, NO shadow / NO glow
// "NO" on white block, "LIMITS" on emerald block — stacked, sharp edges
// ============================================================================

const NoLimitsSlam: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < NL_SLAM_START || t > NL_SLAM_OUT_END) return null;

  // Each block enters from its side: white block slides from left, emerald from right
  const slamProgress = interpolate(t, [NL_SLAM_START, NL_SLAM_PEAK], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const outProgress = interpolate(t, [NL_SLAM_OUT_START, NL_SLAM_OUT_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // Block 1 (NO, white bg) slides in from left, exits to left
  const whiteX = interpolate(
    slamProgress + outProgress,
    [0, 1, 2],
    [-120, 0, -120],
  );
  // Block 2 (LIMITS, emerald bg) slides in from right, exits to right
  const emeraldX = interpolate(
    slamProgress + outProgress,
    [0, 1, 2],
    [120, 0, 120],
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* NO — black text on flat white block */}
      <div
        style={{
          background: WHITE,
          padding: "24px 88px",
          marginBottom: 14,
          transform: `translateX(${whiteX}%)`,
        }}
      >
        <div
          style={{
            fontFamily: BEBAS,
            fontSize: 320,
            lineHeight: 0.85,
            color: BLACK,
            letterSpacing: 14,
          }}
        >
          NO
        </div>
      </div>
      {/* LIMITS — white text on flat emerald block */}
      <div
        style={{
          background: EMERALD,
          padding: "24px 56px",
          transform: `translateX(${emeraldX}%)`,
        }}
      >
        <div
          style={{
            fontFamily: BEBAS,
            fontSize: 320,
            lineHeight: 0.85,
            color: WHITE,
            letterSpacing: 14,
          }}
        >
          LIMITS
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Slide-in card — solid color block, NO bar, NO shadow
// ============================================================================

const SlideCard: React.FC<{ card: RampCard; large?: boolean }> = ({ card, large }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < card.start || t > card.end) return null;

  const local = (t - card.start) / (card.end - card.start);

  const inAnim = interpolate(local, [0, 0.18], [600, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const outAnim = interpolate(local, [0.78, 1], [0, -600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const translateX = local < 0.5 ? inAnim : outAnim;
  const opacityIn = interpolate(local, [0, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacityOut = interpolate(local, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(opacityIn, opacityOut);

  const fontSize = large ? 130 : 110;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "72%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: EMERALD,
          padding: "12px 36px",
          transform: `translateX(${translateX}px)`,
          opacity,
        }}
      >
        <div
          style={{
            fontFamily: BEBAS,
            fontSize,
            color: WHITE,
            letterSpacing: 8,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {card.text}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// End-card — solid blocks, NO shadow / NO glow
// ============================================================================

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < END_CARD_START) return null;

  // Backdrop dim — flat dark bottom-half overlay
  const dimOpacity = interpolate(t, [END_CARD_START, END_CARD_START + 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Hero "VENOM SNAKEBITE" (on solid emerald block)
  const heroProg = interpolate(t, [END_CARD_HERO_START, END_CARD_HERO_START + 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const heroX = interpolate(heroProg, [0, 1], [-600, 0]);
  const heroOpacity = heroProg;

  // 3 IN 1 badge (on solid white block this time — inverse contrast)
  const badgeProg = interpolate(t, [END_CARD_BADGE_START, END_CARD_BADGE_START + 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const badgeX = interpolate(badgeProg, [0, 1], [600, 0]);
  const badgeOpacity = badgeProg;

  // NO BOUNDS char-stagger (just flat emerald text on photo, no block, no shadow)
  const boundsText = "NO BOUNDS";
  const boundsChars = boundsText.split("");

  return (
    <>
      {/* Flat backdrop dim — no gradient, just a darker layer in bottom half */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
          background: "rgba(0,0,0,0.45)",
          opacity: dimOpacity,
        }}
      />
      {/* End-card stack */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "0 32px 80px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* 3 IN 1 badge — solid WHITE block with BLACK text */}
        <div
          style={{
            background: WHITE,
            padding: "14px 36px",
            transform: `translateX(${badgeX}px)`,
            opacity: badgeOpacity,
          }}
        >
          <div
            style={{
              fontFamily: BEBAS,
              fontSize: 44,
              color: BLACK,
              letterSpacing: 6,
              lineHeight: 1,
            }}
          >
            3 IN 1 · BODY · HAIR · FACE
          </div>
        </div>

        {/* VENOM SNAKEBITE hero — on solid EMERALD block, white text */}
        <div
          style={{
            background: EMERALD,
            padding: "20px 40px",
            transform: `translateX(${heroX}px)`,
            opacity: heroOpacity,
          }}
        >
          <div
            style={{
              fontFamily: BEBAS,
              fontSize: 152,
              color: WHITE,
              letterSpacing: 10,
              lineHeight: 0.95,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            VENOM SNAKEBITE
          </div>
        </div>

        {/* NO BOUNDS — flat emerald text directly on photo, char-stagger, NO shadow */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          {boundsChars.map((ch, i) => {
            const charStart = END_CARD_BOUNDS_START + i * 0.04;
            const charProg = interpolate(t, [charStart, charStart + 0.22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            const charY = interpolate(charProg, [0, 1], [14, 0]);
            return (
              <span
                key={i}
                style={{
                  opacity: charProg,
                  transform: `translateY(${charY}px)`,
                  display: "inline-block",
                  whiteSpace: "pre",
                  fontFamily: BEBAS,
                  fontSize: 72,
                  color: EMERALD,
                  letterSpacing: 14,
                  lineHeight: 1,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ============================================================================
// Root
// ============================================================================

export const VenomBodywash001: React.FC = () => {
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
    <AbsoluteFill style={{ backgroundColor: BLACK }}>
      <OffthreadVideo
        src={staticFile("venom-bodywash-001/snakebite-with-music.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <LetterboxOverlay />
      <NoLimitsSlam />
      {RAMP_CARDS.map((c, i) => (
        <SlideCard key={`ramp-${i}`} card={c} large />
      ))}
      {LOC_CARDS.map((c, i) => (
        <SlideCard key={`loc-${i}`} card={c} />
      ))}
      <EndCard />
    </AbsoluteFill>
  );
};
