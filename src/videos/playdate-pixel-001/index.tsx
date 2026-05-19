import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from "remotion";
import { SCENES, MUSIC_FILE, FPS, DURATION_SEC, TOTAL_FRAMES } from "./scenes";

export { FPS, DURATION_SEC, TOTAL_FRAMES };

const STATIC_ROOT = "playdate-pixel-001";

export const PlaydatePixel001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#B0AB94" }}>
      {SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
          name={`scene-${scene.id}`}
        >
          <OffthreadVideo
            src={staticFile(`${STATIC_ROOT}/assets/videos/${scene.videoFile}`)}
            startFrom={scene.startFrom}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
          />
        </Sequence>
      ))}

      <Audio src={staticFile(`${STATIC_ROOT}/assets/music/${MUSIC_FILE}`)} volume={0.85} />
    </AbsoluteFill>
  );
};
