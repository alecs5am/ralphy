// Smart-crop math for repurposing 16:9 video into 9:16 shorts.
// Pure math, no Remotion deps. Math ported from
// mutonby/openshorts (SmoothedCameraman + SpeakerTracker).
//
// Usage:
//   const path = computeCameraPath({ frames, bboxes, target, source, speakerHints });
//   // path[i] = { x, y, scale } per source frame; lerp between for sub-frame.
//
// In a Remotion composition:
//   <SmartReframe src={...} bboxes={...} target={9,16} />
// (component in src/lib/components/layouts/SmartReframe.tsx)

export type Bbox = { x: number; y: number; width: number; height: number; score?: number };

export type FrameBboxes = {
  frameSec: number;        // timestamp in source video
  bboxes: Bbox[];
};

export type CameraTransform = {
  /** Center X of the source-coordinate region we crop to */
  centerX: number;
  /** Center Y of the source-coordinate region we crop to */
  centerY: number;
  /** Width of crop region (height = width * targetAspectInverse) */
  cropWidth: number;
};

export type ComputeCameraInput = {
  /** Full timeline of detected faces, sorted by frameSec */
  frames: FrameBboxes[];
  /** Source video dimensions */
  source: { width: number; height: number };
  /** Target aspect ratio numerator/denominator (e.g. 9/16) */
  target: { aspect: number };  // height / width, so 9:16 = 16/9 = 1.778
  /** FPS of source — used to convert speed/cooldown into per-frame rates */
  fps: number;
  /** Optional: per-frame speaker hints (e.g. from diarization). Maps frameSec → bbox index */
  speakerHints?: Map<number, number>;
};

const SAFE_ZONE_RADIUS = 0.25;       // 25% — don't move if subject inside
const SLOW_PX_PER_FRAME = 3;
const FAST_PX_PER_FRAME = 15;
const FAST_THRESHOLD = 0.5;          // distance > 50% crop-width → fast pan
const SCORE_DECAY = 0.85;            // per-frame for non-current speaker
const STICKY_BONUS = 3.0;            // multiplier for current speaker's score
const SWITCH_COOLDOWN_FRAMES = 30;
const FACE_MEMORY_SEC = 1.0;

export function computeCameraPath(input: ComputeCameraInput): CameraTransform[] {
  const { frames, source, target, fps, speakerHints } = input;

  // Crop region: vertical bar with target aspect, fitted to source height.
  // For 16:9 source (1920×1080) → 9:16 crop = 607×1080 (height-fit).
  const cropHeight = source.height;
  const cropWidth = Math.round(cropHeight / target.aspect);

  const transforms: CameraTransform[] = [];
  let currentCenterX = source.width / 2;
  let currentCenterY = source.height / 2;
  let currentSpeakerKey: string | null = null;
  let cooldownFrames = 0;

  // Score map: face-key (rough position bucket) → recent score.
  const scoreMap = new Map<string, { x: number; y: number; score: number; lastSeenSec: number }>();

  // Iterate in source-frame steps (assume 1 transform per source frame).
  // Caller can decimate if they sampled bboxes at e.g. 1fps.
  const totalSourceFrames = frames.length > 0
    ? Math.ceil(frames[frames.length - 1].frameSec * fps) + 1
    : 0;

  let bboxIdx = 0;
  for (let f = 0; f < totalSourceFrames; f++) {
    const sec = f / fps;

    // Advance bboxIdx to the latest entry whose frameSec ≤ sec.
    while (
      bboxIdx + 1 < frames.length &&
      frames[bboxIdx + 1].frameSec <= sec
    ) {
      bboxIdx++;
    }
    const cur = frames[bboxIdx];

    // Decay all scores per source frame.
    for (const [k, v] of scoreMap) {
      // Forget faces unseen for FACE_MEMORY_SEC.
      if (sec - v.lastSeenSec > FACE_MEMORY_SEC) {
        scoreMap.delete(k);
        continue;
      }
      v.score *= SCORE_DECAY;
    }

    // Update scores from current bboxes.
    if (cur && cur.frameSec >= 0) {
      for (const b of cur.bboxes) {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        // Bucket key — round to 5% of source width to merge same speaker across frames.
        const key = `${Math.round(cx / (source.width * 0.05))}|${Math.round(cy / (source.height * 0.05))}`;
        const baseScore = (b.score ?? 1) * (b.width * b.height);
        const stickyMult = key === currentSpeakerKey ? STICKY_BONUS : 1;
        const prev = scoreMap.get(key) ?? { x: cx, y: cy, score: 0, lastSeenSec: sec };
        prev.x = cx;
        prev.y = cy;
        prev.score += baseScore * stickyMult;
        prev.lastSeenSec = sec;
        scoreMap.set(key, prev);
      }
    }

    // Pick top-scored speaker if cooldown allows.
    let bestKey: string | null = null;
    let bestScore = -Infinity;
    for (const [k, v] of scoreMap) {
      if (v.score > bestScore) {
        bestScore = v.score;
        bestKey = k;
      }
    }

    // Optional override from speaker hints (diarization-driven).
    const hintIdx = speakerHints?.get(Math.round(sec * 10) / 10);
    if (hintIdx != null && cur?.bboxes[hintIdx]) {
      const b = cur.bboxes[hintIdx];
      bestKey = `${Math.round((b.x + b.width / 2) / (source.width * 0.05))}|${Math.round((b.y + b.height / 2) / (source.height * 0.05))}`;
    }

    if (bestKey && bestKey !== currentSpeakerKey && cooldownFrames <= 0) {
      currentSpeakerKey = bestKey;
      cooldownFrames = SWITCH_COOLDOWN_FRAMES;
    } else if (cooldownFrames > 0) {
      cooldownFrames--;
    }

    // Target position from current speaker.
    const targetSpeaker = currentSpeakerKey ? scoreMap.get(currentSpeakerKey) : null;
    const targetX = targetSpeaker?.x ?? source.width / 2;
    const targetY = targetSpeaker?.y ?? source.height / 2;

    // Distance from current camera to target.
    const dx = targetX - currentCenterX;
    const dy = targetY - currentCenterY;
    const dist = Math.hypot(dx, dy);

    // Safe zone: if target within 25% of crop, don't move.
    const safeRadius = cropWidth * SAFE_ZONE_RADIUS;
    if (dist <= safeRadius) {
      // hold
    } else {
      const speed =
        dist > cropWidth * FAST_THRESHOLD ? FAST_PX_PER_FRAME : SLOW_PX_PER_FRAME;
      const stepX = (dx / Math.max(dist, 1)) * speed;
      const stepY = (dy / Math.max(dist, 1)) * speed;
      currentCenterX += stepX;
      currentCenterY += stepY;
    }

    // Clamp camera so crop region stays inside source.
    currentCenterX = Math.max(cropWidth / 2, Math.min(source.width - cropWidth / 2, currentCenterX));
    currentCenterY = Math.max(cropHeight / 2, Math.min(source.height - cropHeight / 2, currentCenterY));

    transforms.push({
      centerX: currentCenterX,
      centerY: currentCenterY,
      cropWidth,
    });
  }

  return transforms;
}

// Convenience: get the [translateX, translateY, scale] for a Remotion <Video>
// to render (sourceWidth × sourceHeight) cropped to (targetWidth × targetHeight)
// with the given camera transform.
//
// Resulting CSS transform string: `translate(${tx}px, ${ty}px) scale(${scale})`.
export function transformToCss(
  cam: CameraTransform,
  source: { width: number; height: number },
  target: { width: number; height: number }
): { translateX: number; translateY: number; scale: number } {
  const scale = target.height / source.height;  // height-fit crop
  const translateX = target.width / 2 - cam.centerX * scale;
  const translateY = target.height / 2 - cam.centerY * scale;
  return { translateX, translateY, scale };
}
