// Playdate — 1-Bit Halftone Hyper-Motion Ad scene timeline.
// 8 cuts, 16.4s @ 30fps = 492 frames (extended from 15s to let outro freeze fully play).
// Hard cuts between all scenes. Each i2v clip is 4s (120f) or 5s (150f); `startFrom` trims into the dynamic window.

export const FPS = 30;
export const DURATION_SEC = 16.4;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS); // 492

export type Scene = {
  id: string;
  from: number;
  durationInFrames: number;
  videoFile: string;
  startFrom: number;
  label: string;
};

export const SCENES: Scene[] = [
  {
    id: "01",
    label: "HOOK / Entrance slam",
    from: 0,
    durationInFrames: 54, // 1.8s
    videoFile: "scene-01-vid.mp4",
    startFrom: 30,
  },
  {
    id: "02",
    label: "Macro tease / Pixel character reveal",
    from: 54,
    durationInFrames: 54, // 1.8s
    videoFile: "scene-02-vid.mp4",
    startFrom: 20,
  },
  {
    id: "03",
    label: "Photoreal hand crank 180° orbit",
    from: 108,
    durationInFrames: 60, // 2.0s
    videoFile: "scene-03-vid.mp4",
    startFrom: 30,
  },
  {
    id: "03b",
    label: "Crank macro + halftone sparkles",
    from: 168,
    durationInFrames: 24, // 0.8s
    videoFile: "scene-03b-vid.mp4",
    startFrom: 50,
  },
  {
    id: "04",
    label: "Pixel-character runway across body",
    from: 192,
    durationInFrames: 54, // 1.8s
    videoFile: "scene-04-vid.mp4",
    startFrom: 40,
  },
  {
    id: "05",
    label: "24-game grid burst from screen",
    from: 246,
    durationInFrames: 72, // 2.4s
    videoFile: "scene-05-vid.mp4",
    startFrom: 25,
  },
  {
    id: "05b",
    label: "HYPER METEOR shimmer macro",
    from: 318,
    durationInFrames: 24, // 0.8s
    videoFile: "scene-05b-vid.mp4",
    startFrom: 40,
  },
  {
    id: "06",
    label: "Snap-back outro + playdate wordmark",
    from: 342,
    durationInFrames: 150, // 5.0s — full clip, lets the freeze breathe
    videoFile: "scene-06-vid.mp4",
    startFrom: 0,
  },
];

/** Active music track — swap by editing this constant. */
export const MUSIC_FILE = "music-c-arcade-pop.mp3";
