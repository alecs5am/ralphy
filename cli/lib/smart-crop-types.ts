// Smart-crop face bbox types. Historically defined in the deleted
// `src/lib/utils/smart-crop.ts` (Remotion <SmartReframe> component). The
// shape lives here now so the bbox detector + HyperFrames overlay layer
// stay decoupled from any concrete renderer.

export type Bbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FrameBboxes = {
  /** Frame timestamp in seconds (1 fps sampling, see cli/lib/face-bbox.ts). */
  frameSec: number;
  /** Detected face boxes, in source-pixel space, ordered by detection confidence. */
  bboxes: Bbox[];
};
