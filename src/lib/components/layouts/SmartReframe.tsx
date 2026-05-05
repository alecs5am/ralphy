import { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  computeCameraPath,
  transformToCss,
  type FrameBboxes,
} from "../../utils/smart-crop";

/**
 * Repurpose a 16:9 (or arbitrary aspect) video into 9:16 by following the
 * detected speaker(s) with a smooth virtual camera. Pure-React port of
 * mutonby/openshorts SmoothedCameraman + SpeakerTracker math.
 *
 * Expected workflow:
 *   1. Run `cli/lib/face-bbox.ts` → detectFaces() to get FrameBboxes[]
 *      (cached at workspace/projects/<id>/face-bboxes.json).
 *   2. Pass it to <SmartReframe bboxes={...} src={...} />.
 *   3. The component re-projects the source video into the composition's
 *      width/height via CSS transform on the underlying <OffthreadVideo>.
 */

export type SmartReframeProps = {
  src: string;
  /** Bboxes output from cli/lib/face-bbox.ts */
  bboxes: FrameBboxes[];
  /** Source video dimensions */
  source: { width: number; height: number };
  /** FPS of source video (used to align bbox timestamps to frames) */
  sourceFps?: number;
};

export const SmartReframe: React.FC<SmartReframeProps> = ({
  src,
  bboxes,
  source,
  sourceFps,
}) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();

  const path = useMemo(() => {
    return computeCameraPath({
      frames: bboxes,
      source,
      target: { aspect: config.height / config.width },
      fps: sourceFps ?? config.fps,
    });
  }, [bboxes, source, config.height, config.width, config.fps, sourceFps]);

  // Map composition frame → source frame (assume 1:1 if same fps; otherwise
  // proportional by time).
  const srcFps = sourceFps ?? config.fps;
  const srcFrameIdx = Math.min(
    path.length - 1,
    Math.max(0, Math.floor((frame / config.fps) * srcFps))
  );
  const cam = path[srcFrameIdx] ?? {
    centerX: source.width / 2,
    centerY: source.height / 2,
    cropWidth: source.width,
  };

  const tx = transformToCss(cam, source, {
    width: config.width,
    height: config.height,
  });

  return (
    <AbsoluteFill style={{ background: "black", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: source.width,
          height: source.height,
          transformOrigin: "0 0",
          transform: `translate(${tx.translateX}px, ${tx.translateY}px) scale(${tx.scale})`,
        }}
      >
        <OffthreadVideo src={src} />
      </div>
    </AbsoluteFill>
  );
};
