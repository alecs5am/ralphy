import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile } from "remotion";
import { ensureNothingFonts } from "./fonts";
import { SCENES, SEC_TO_FRAMES, FPS, DURATION_SEC, TOTAL_FRAMES } from "./scenes";
import { TitleCard, TitleCardCycle } from "./TitleCard";

export { FPS, DURATION_SEC, TOTAL_FRAMES };

const STATIC_ROOT = "nothing-hp1-001";

export const NothingHP1001: React.FC = () => {
  ensureNothingFonts();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SCENES.map((scene) => {
        const startFrame = SEC_TO_FRAMES(scene.start);
        const durationInFrames = Math.max(1, SEC_TO_FRAMES(scene.end) - startFrame);

        let content: React.ReactNode;
        if (scene.kind === "video" && scene.videoFile) {
          // Always play the clip from frame 0 (mid-motion start was prompted into the gen).
          // Sequence durationInFrames trims the clip to the gemini-measured shot length.
          content = (
            <OffthreadVideo
              src={staticFile(`${STATIC_ROOT}/${scene.videoFile}`)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              muted
            />
          );
        } else if (scene.kind === "title" && scene.text) {
          content = <TitleCard text={scene.text} logoStyle={scene.id === 1 || scene.id === 23} />;
        } else if (scene.kind === "title-cycle" && scene.textSequence) {
          content = (
            <TitleCardCycle sequence={scene.textSequence} totalDurationSec={scene.duration} />
          );
        }

        return (
          <Sequence
            key={scene.id}
            from={startFrame}
            durationInFrames={durationInFrames}
            name={`scene-${String(scene.id).padStart(2, "0")}`}
          >
            {content}
          </Sequence>
        );
      })}

      {/* Source audio 1:1 — extracted from the original 54s commercial */}
      <Audio src={staticFile(`${STATIC_ROOT}/source-audio.mp3`)} />
    </AbsoluteFill>
  );
};
