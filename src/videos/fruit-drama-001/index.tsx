import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { PopWordCaptions } from "./PopWordCaptions";
import { captions } from "./captions";

export const FPS = 30;
export const DURATION_SEC = 56.1;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS);

export const FruitDrama001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile("fruit-drama-001/render/final.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <PopWordCaptions captions={captions} fontSize={140} bottomOffset={340} />
    </AbsoluteFill>
  );
};
