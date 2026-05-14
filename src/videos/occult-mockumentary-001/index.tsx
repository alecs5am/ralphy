import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

export const FPS = 30;

// v3 structure: 6 scenes × 5s each, with mockumentary-style hard cuts (5-frame glitch flash between scenes).
// Scenes A–E in Hi8 register, Scene F in cinema register with jump-scare lunge ending in signal-loss.
const SCENE = Math.round(5.04 * FPS);
const GAP = 5; // 5-frame VHS-glitch interstitial flash between scenes
const END_CARD = Math.round(1.7 * FPS);

const S_A = 0;
const S_B = S_A + SCENE + GAP;
const S_C = S_B + SCENE + GAP;
const S_D = S_C + SCENE + GAP;
const S_E = S_D + SCENE + GAP;
const S_F = S_E + SCENE + GAP;
const S_END = S_F + SCENE;

export const TOTAL_FRAMES = S_END + END_CARD;

const P = "project-occult-mockumentary-001";
const SCENE_A = `${P}/assets/videos/scene-a-v1.mp4`;
const SCENE_B = `${P}/assets/videos/scene-b-v1.mp4`;
const SCENE_C = `${P}/assets/videos/scene-c-v1.mp4`;
const SCENE_D = `${P}/assets/videos/scene-d-v1.mp4`;
const SCENE_E = `${P}/assets/videos/scene-e-v1.mp4`;
const SCENE_F = `${P}/assets/videos/scene-f-v1.mp4`;
const MUSIC = `${P}/assets/music/bg-horror-ambient.mp3`;
const SFX_INHALE = `${P}/assets/music/sfx-wet-inhale.mp3`;
const SFX_DROP = `${P}/assets/music/sfx-camera-drop.mp3`;
const SFX_CRUNCH = `${P}/assets/music/sfx-wet-crunch-multistep.mp3`;
const SFX_CHANT = `${P}/assets/music/sfx-chant-whisper.mp3`;

// VHS HUD covers Scenes A–E (Hi8 register). Scene F is cinema register, no HUD.
const HUD_END = S_F;

// Scene F internal beats: 2s static → 0.2s lunge start → 1s impact → 1.8s signal-loss glitch.
const SCENE_F_LUNGE_START = S_F + Math.round(2.0 * FPS);
const SCENE_F_GLITCH_START = S_F + Math.round(3.0 * FPS);

const VhsHud: React.FC<{ startSeconds: number }> = ({ startSeconds }) => {
  const frame = useCurrentFrame();
  const seconds = Math.floor(frame / FPS) + startSeconds;
  const recFlash = (Math.floor(frame / 15) % 2) === 0;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", fontFamily: "Courier New, monospace", color: "#e8e8e8", fontWeight: 700, textShadow: "0 0 4px rgba(0,0,0,0.9)" }}>
      <div style={{ position: "absolute", top: 36, left: 36, display: "flex", alignItems: "center", gap: 12, fontSize: 36, letterSpacing: 1 }}>
        <span style={{ width: 22, height: 22, borderRadius: 999, backgroundColor: recFlash ? "#d22" : "#722", boxShadow: "0 0 12px rgba(220,40,40,0.55)" }} />
        <span>REC</span>
      </div>
      <div style={{ position: "absolute", bottom: 48, right: 40, fontSize: 32, letterSpacing: 1, lineHeight: 1.2, textAlign: "right" }}>
        AUG 15 2003<br />23:47:{seconds.toString().padStart(2, "0")}
      </div>
    </AbsoluteFill>
  );
};

const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 2px, transparent 3px)",
      mixBlendMode: "multiply",
      opacity: 0.5,
    }}
  />
);

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 95%)",
    }}
  />
);

const GlitchFlash: React.FC<{ active: boolean }> = ({ active }) => {
  const frame = useCurrentFrame();
  if (!active) return null;
  const shift = Math.sin(frame * 1.7) * 14;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(0,0,0,0.9) 2px, rgba(255,255,255,0.3) 5px, rgba(0,0,0,0.95) 8px)",
          transform: `translateX(${shift}px)`,
          mixBlendMode: "screen",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "rgba(180,40,40,0.08)" }} />
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ text: string; fadeInFrames?: number; fadeOutFrames?: number; totalFrames: number }> = ({ text, fadeInFrames = 12, fadeOutFrames = 14, totalFrames }) => {
  const frame = useCurrentFrame();
  const opacity =
    frame < fadeInFrames
      ? interpolate(frame, [0, fadeInFrames], [0, 1])
      : frame > totalFrames - fadeOutFrames
        ? interpolate(frame, [totalFrames - fadeOutFrames, totalFrames], [1, 0])
        : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", justifyContent: "flex-end", alignItems: "center", paddingBottom: 360 }}>
      <div
        style={{
          opacity,
          fontFamily: "Courier New, monospace",
          fontSize: 56,
          fontWeight: 700,
          color: "#fafafa",
          letterSpacing: 2,
          textShadow: "0 2px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const HeavyGlitch: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = (Math.sin(frame * 1.7) * 22) | 0;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(255,80,80,0.28) 0px, transparent 4px, rgba(80,80,255,0.28) 8px, transparent 14px)",
          transform: `translateX(${shift}px)`,
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "rgba(255,255,255,0.10)" }} />
    </AbsoluteFill>
  );
};

const SignalLostCard: React.FC = () => {
  const frame = useCurrentFrame();
  const noiseSeed = Math.floor(frame / 2);
  const flicker = (noiseSeed % 5) === 0 ? 1 : 0.9;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
      <AbsoluteFill
        style={{
          opacity: 0.22,
          background:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 2px, transparent 4px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          fontFamily: "Courier New, monospace",
          fontSize: 96,
          fontWeight: 800,
          color: "#e8e8e8",
          letterSpacing: 6,
          textShadow: "0 0 14px rgba(220,40,40,0.7)",
          opacity: flicker,
        }}
      >
        SIGNAL LOST
      </div>
    </AbsoluteFill>
  );
};

export const OccultMockumentary001: React.FC = () => {
  const frame = useCurrentFrame();

  // Glitch flash between scenes: active during the GAP frames.
  const inGap =
    (frame >= S_A + SCENE && frame < S_B) ||
    (frame >= S_B + SCENE && frame < S_C) ||
    (frame >= S_C + SCENE && frame < S_D) ||
    (frame >= S_D + SCENE && frame < S_E) ||
    (frame >= S_E + SCENE && frame < S_F);

  // Heavy glitch during scene F's signal-loss tail (frames after lunge impact).
  const sceneFGlitchActive = frame >= SCENE_F_GLITCH_START && frame < S_END;

  const isEndCard = frame >= S_END;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence from={S_A} durationInFrames={SCENE}>
        <OffthreadVideo src={staticFile(SCENE_A)} />
      </Sequence>
      <Sequence from={S_B} durationInFrames={SCENE}>
        <OffthreadVideo src={staticFile(SCENE_B)} />
      </Sequence>
      <Sequence from={S_C} durationInFrames={SCENE}>
        <OffthreadVideo src={staticFile(SCENE_C)} />
      </Sequence>
      <Sequence from={S_D} durationInFrames={SCENE}>
        <OffthreadVideo src={staticFile(SCENE_D)} />
      </Sequence>
      <Sequence from={S_E} durationInFrames={SCENE}>
        <OffthreadVideo src={staticFile(SCENE_E)} />
      </Sequence>
      <Sequence from={S_F} durationInFrames={SCENE}>
        <OffthreadVideo src={staticFile(SCENE_F)} />
      </Sequence>

      {/* Inter-scene mockumentary glitch flashes — 5-frame VHS scramble between cuts */}
      <GlitchFlash active={inGap} />

      {/* VHS overlay (scanlines + vignette + HUD) — Scenes A–E only */}
      <Sequence from={0} durationInFrames={HUD_END}>
        <Scanlines />
      </Sequence>
      <Sequence from={0} durationInFrames={HUD_END}>
        <Vignette />
      </Sequence>
      <Sequence from={S_A} durationInFrames={SCENE}>
        <VhsHud startSeconds={12} />
      </Sequence>
      <Sequence from={S_B} durationInFrames={SCENE}>
        <VhsHud startSeconds={19} />
      </Sequence>
      <Sequence from={S_C} durationInFrames={SCENE}>
        <VhsHud startSeconds={24} />
      </Sequence>
      <Sequence from={S_D} durationInFrames={SCENE}>
        <VhsHud startSeconds={31} />
      </Sequence>
      <Sequence from={S_E} durationInFrames={SCENE}>
        <VhsHud startSeconds={38} />
      </Sequence>

      {/* Captions */}
      <Sequence from={Math.round(0.8 * FPS)} durationInFrames={Math.round(3.2 * FPS)}>
        <Caption text="trail behind the lake" totalFrames={Math.round(3.2 * FPS)} />
      </Sequence>
      <Sequence from={S_D + Math.round(0.4 * FPS)} durationInFrames={Math.round(2.6 * FPS)}>
        <Caption text="they see me" totalFrames={Math.round(2.6 * FPS)} />
      </Sequence>

      {/* Heavy glitch on Scene F's signal-loss tail */}
      {sceneFGlitchActive && <HeavyGlitch />}

      {/* End card */}
      {isEndCard && (
        <Sequence from={S_END} durationInFrames={END_CARD}>
          <SignalLostCard />
        </Sequence>
      )}

      {/* Horror ambient bed */}
      <Audio src={staticFile(MUSIC)} volume={(f) => {
        if (f < FPS) return interpolate(f, [0, FPS], [0, 0.30]);
        if (f > TOTAL_FRAMES - FPS) return interpolate(f, [TOTAL_FRAMES - FPS, TOTAL_FRAMES], [0.30, 0]);
        if (f >= SCENE_F_GLITCH_START && f < S_END) return 0.10;
        if (f >= S_END && f < S_END + Math.round(0.3 * FPS)) return 0.05;
        return 0.30;
      }} />

      {/* Chant whisper — rises during Scenes B + C (peering + photo), cuts at the flash */}
      <Sequence from={S_B - Math.round(1 * FPS)} durationInFrames={Math.round(9 * FPS)}>
        <Audio src={staticFile(SFX_CHANT)} volume={(f) => {
          const total = Math.round(9 * FPS);
          if (f < FPS) return interpolate(f, [0, FPS], [0, 0.55]);
          if (f > total - FPS) return interpolate(f, [total - FPS, total], [0.55, 0]);
          return 0.55;
        }} />
      </Sequence>

      {/* Wet inhale — at the flash moment of Scene C (~1.65s into scene C) */}
      <Sequence from={S_C + Math.round(1.65 * FPS)} durationInFrames={Math.round(4 * FPS)}>
        <Audio src={staticFile(SFX_INHALE)} volume={0.8} />
      </Sequence>

      {/* Wet crunch — at Scene E (~1.0s into the scene when the crunch happens) */}
      <Sequence from={S_E + Math.round(1.0 * FPS)} durationInFrames={Math.round(4 * FPS)}>
        <Audio src={staticFile(SFX_CRUNCH)} volume={0.75} />
      </Sequence>

      {/* Drop / signal-loss thump + static — at Scene F lunge impact (~2.0s into F) */}
      <Sequence from={SCENE_F_LUNGE_START} durationInFrames={Math.round(4 * FPS)}>
        <Audio src={staticFile(SFX_DROP)} volume={(f) => {
          const total = Math.round(4 * FPS);
          if (f < 5) return interpolate(f, [0, 5], [0, 1.0]);
          if (f > total * 0.7) return interpolate(f, [total * 0.7, total], [1.0, 0]);
          return 1.0;
        }} />
      </Sequence>
    </AbsoluteFill>
  );
};
