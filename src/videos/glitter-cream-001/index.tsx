import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from "remotion";

export const FPS = 30;

const CLIP1_FRAMES = Math.round(9.04 * FPS);
const CLIP2_FRAMES = Math.round(8.04 * FPS);
export const TOTAL_FRAMES = CLIP1_FRAMES + CLIP2_FRAMES;

const P = "project-glitter-cream-001";
const CLIP1 = `${P}/assets/videos/opt-b-clip1-v3-charms.mp4`;
const CLIP2 = `${P}/assets/videos/opt-b-clip2-v3-tiltlight.mp4`;
const MUSIC = `${P}/assets/music/bg-music-v1-lofi.mp3`;

export const GlitterCream001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Sequence from={0} durationInFrames={CLIP1_FRAMES}>
        <OffthreadVideo src={staticFile(CLIP1)} />
      </Sequence>
      <Sequence from={CLIP1_FRAMES} durationInFrames={CLIP2_FRAMES}>
        <OffthreadVideo src={staticFile(CLIP2)} />
      </Sequence>
      <Audio src={staticFile(MUSIC)} volume={0.18} />
    </AbsoluteFill>
  );
};
