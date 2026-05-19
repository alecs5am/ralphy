import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SCENES, MUSIC_FILE, FPS, DURATION_SEC, TOTAL_FRAMES, type Scene, type TextLine } from "./scenes";

export { FPS, DURATION_SEC, TOTAL_FRAMES };

const STATIC_ROOT = "appstore-takeaminute-001";
const RED = "#FF2D55";
const WHITE = "#FFFFFF";

const FONT_FAMILY: Record<TextLine["font"], string> = {
  anton: "Anton, Impact, sans-serif",
  bebas: "BebasNeue, Impact, sans-serif",
  bowlby: "BowlbyOne, Arial Black, sans-serif",
};

/** Render a string that has {RED-ACCENT} parts wrapped in braces. */
const RichText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("{") && p.endsWith("}")) {
          return (
            <span key={i} style={{ color: RED }}>
              {p.slice(1, -1)}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
};

const TextOverlay: React.FC<{ line: TextLine; sceneDuration: number }> = ({ line, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = line.delay ?? 0;
  const localFrame = frame - delay;

  // exitDelay: frames after `delay` when text begins fading out.
  // If not set, text stays until end of scene.
  const exitDelay = line.exitDelay;
  const FADE_OUT_FRAMES = 6;
  const sceneEnd = sceneDuration - delay;
  const exitFrame = exitDelay !== undefined ? exitDelay - delay : sceneEnd;
  const fadeOutMultiplier = exitDelay !== undefined
    ? interpolate(localFrame, [exitFrame - FADE_OUT_FRAMES, exitFrame], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  if (localFrame < 0) return null;
  if (exitDelay !== undefined && frame >= exitDelay) return null;

  // Common base style
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: FONT_FAMILY[line.font],
    fontSize: line.size,
    color: WHITE,
    lineHeight: 1.02,
    letterSpacing: line.font === "bebas" ? 2 : 0,
    textTransform: "uppercase",
    fontWeight: 900,
    padding: "0 36px",
    pointerEvents: "none",
  };

  // Position
  if (line.position === "top") {
    baseStyle.top = "8%";
  } else if (line.position === "center") {
    baseStyle.top = "40%";
  } else {
    baseStyle.bottom = "11%";
  }

  // Outline: large dark outline via multiple text-shadow stacks for legibility
  if (line.outline) {
    baseStyle.textShadow = [
      "-4px -4px 0 #000",
      "4px -4px 0 #000",
      "-4px 4px 0 #000",
      "4px 4px 0 #000",
      "0 6px 24px rgba(255,45,85,0.65)",
    ].join(", ");
    baseStyle.WebkitTextStroke = "1px #000";
  } else {
    baseStyle.textShadow = "0 4px 14px rgba(0,0,0,0.85)";
  }

  // Animation
  let transform = "";
  let opacity = 1;

  switch (line.animation) {
    case "spring-pop": {
      const s = spring({ frame: localFrame, fps, config: { damping: 9, stiffness: 180, mass: 0.5 } });
      const scale = interpolate(s, [0, 1], [0.4, 1.0]);
      transform = `scale(${scale})`;
      opacity = interpolate(localFrame, [0, 4], [0, 1], { extrapolateRight: "clamp" });
      break;
    }
    case "shake-pop": {
      const s = spring({ frame: localFrame, fps, config: { damping: 7, stiffness: 220, mass: 0.4 } });
      const scale = interpolate(s, [0, 1], [0.5, 1.0]);
      const shakeX = localFrame < 8 ? Math.sin(localFrame * 2.5) * (8 - localFrame) * 3 : 0;
      const shakeY = localFrame < 8 ? Math.cos(localFrame * 2.1) * (8 - localFrame) * 2 : 0;
      transform = `translate(${shakeX}px, ${shakeY}px) scale(${scale})`;
      opacity = interpolate(localFrame, [0, 2], [0, 1], { extrapolateRight: "clamp" });
      break;
    }
    case "scale-bounce": {
      const s = spring({ frame: localFrame, fps, config: { damping: 11, stiffness: 130, mass: 0.6 } });
      const scale = interpolate(s, [0, 1], [0.7, 1.0]);
      transform = `scale(${scale})`;
      opacity = interpolate(localFrame, [0, 4], [0, 1], { extrapolateRight: "clamp" });
      break;
    }
    case "slide-up": {
      const s = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 110, mass: 0.7 } });
      const ty = interpolate(s, [0, 1], [80, 0]);
      transform = `translateY(${ty}px)`;
      opacity = interpolate(localFrame, [0, 4], [0, 1], { extrapolateRight: "clamp" });
      break;
    }
    case "fade-zoom": {
      const scale = interpolate(localFrame, [0, 14], [0.92, 1.06], { extrapolateRight: "clamp" });
      transform = `scale(${scale})`;
      opacity = interpolate(localFrame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
      break;
    }
  }

  return (
    <div
      style={{
        ...baseStyle,
        transform,
        opacity: opacity * fadeOutMultiplier,
      }}
    >
      <RichText text={line.text} />
    </div>
  );
};

const SceneClip: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();

  const shakeFrames = scene.shakeFrames ?? 0;
  const flashFrames = scene.flashFrames ?? 0;

  const shakeX = shakeFrames > 0 && frame < shakeFrames
    ? Math.sin(frame * 2.4) * (shakeFrames - frame) * 1.8
    : 0;
  const shakeY = shakeFrames > 0 && frame < shakeFrames
    ? Math.cos(frame * 1.9) * (shakeFrames - frame) * 1.4
    : 0;

  const flashOpacity = flashFrames > 0
    ? interpolate(frame, [0, flashFrames * 0.4, flashFrames], [0.85, 0.4, 0], {
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px)` }}>
        <OffthreadVideo
          src={staticFile(`${STATIC_ROOT}/${scene.asset}`)}
          startFrom={scene.startFrom ?? 0}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </AbsoluteFill>
      {flashFrames > 0 && (
        <AbsoluteFill
          style={{
            backgroundColor: RED,
            opacity: flashOpacity,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      )}
      {scene.text?.map((line, i) => (
        <TextOverlay key={i} line={line} sceneDuration={scene.durationInFrames} />
      ))}
      {scene.brandStripMask && frame >= scene.brandStripMask.showFromFrame && (
        <div
          style={{
            position: "absolute",
            top: `${scene.brandStripMask.top}%`,
            left: `${scene.brandStripMask.left}%`,
            width: `${scene.brandStripMask.width}%`,
            height: `${scene.brandStripMask.height}%`,
            background: "#000",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "space-around",
            padding: "8px 14px",
            pointerEvents: "none",
            transform: `translate(${shakeX}px, ${shakeY}px)`,
          }}
        >
          {/* Row 1: TM brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: RED,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "8px solid transparent",
                  borderBottom: "8px solid transparent",
                  borderLeft: "12px solid white",
                  marginLeft: 3,
                }}
              />
            </div>
            <div
              style={{
                color: "white",
                fontFamily: "BebasNeue, Impact, sans-serif",
                fontSize: 36,
                fontWeight: 900,
                letterSpacing: 1.2,
                lineHeight: 1,
              }}
            >
              Take<span style={{ color: RED }}>A</span>Minute
            </div>
          </div>
          {/* Row 2: Section heading */}
          <div
            style={{
              color: "white",
              fontFamily: "Anton, Impact, sans-serif",
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: 0.5,
              opacity: 0.92,
              marginLeft: 2,
              textTransform: "none",
            }}
          >
            Trending Now
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const AppstoreTakeaminute001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Font loading via @font-face */}
      <style>{`
        @font-face { font-family: 'Anton'; src: url('${staticFile("fonts/Anton-Regular.ttf")}') format('truetype'); font-display: block; }
        @font-face { font-family: 'BebasNeue'; src: url('${staticFile("fonts/BebasNeue-Regular.ttf")}') format('truetype'); font-display: block; }
        @font-face { font-family: 'BowlbyOne'; src: url('${staticFile("fonts/BowlbyOne-Regular.ttf")}') format('truetype'); font-display: block; }
      `}</style>

      {SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
          name={`scene-${scene.id}`}
        >
          <SceneClip scene={scene} />
        </Sequence>
      ))}

      <Audio
        src={staticFile(`${STATIC_ROOT}/assets/music/${MUSIC_FILE}`)}
        volume={0.85}
      />
    </AbsoluteFill>
  );
};
