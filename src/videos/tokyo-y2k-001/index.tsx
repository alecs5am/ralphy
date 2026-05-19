import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  SCENES,
  MUSIC_FILE,
  FPS,
  DURATION_SEC,
  TOTAL_FRAMES,
  CANVAS,
  INNER,
  FADE_TO_BLACK_START_FRAME,
  FADE_TO_BLACK_END_FRAME,
} from "./scenes";

export { FPS, DURATION_SEC, TOTAL_FRAMES };

const STATIC_ROOT = "project-tokyo-y2k-001";

const FadeToBlack: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [FADE_TO_BLACK_START_FRAME, FADE_TO_BLACK_END_FRAME],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", opacity, pointerEvents: "none" }} />
  );
};

const VideoTrack: React.FC = () => (
  <>
    {SCENES.map((scene) => (
      <Sequence
        key={scene.id}
        from={scene.from}
        durationInFrames={scene.durationInFrames}
        name={`scene-${scene.id} — ${scene.label}`}
      >
        <OffthreadVideo
          src={staticFile(`${STATIC_ROOT}/videos/${scene.videoFile}`)}
          startFrom={Math.round(scene.startFromSec * FPS)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      </Sequence>
    ))}
  </>
);

const MusicTrack: React.FC = () => (
  <Audio src={staticFile(`${STATIC_ROOT}/music/${MUSIC_FILE}`)} volume={0.9} />
);

// 9:16 letterboxed inside 1.85:1 box — per storyboard (TikTok / Reels / Shorts).
export const TokyoY2k001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <div
        style={{
          position: "absolute",
          top: INNER.top,
          left: 0,
          width: INNER.width,
          height: INNER.height,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <VideoTrack />
      </div>
      <MusicTrack />
      <FadeToBlack />
    </AbsoluteFill>
  );
};

// 16:9 native — full-bleed for YouTube / desktop / players.
export const TokyoY2k001Wide: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <VideoTrack />
      <MusicTrack />
      <FadeToBlack />
    </AbsoluteFill>
  );
};

export { CANVAS };
