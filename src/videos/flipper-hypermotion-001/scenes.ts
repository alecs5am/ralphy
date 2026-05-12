// Flipper Zero — Japanese Hyper-Motion Ad scene timeline.
// 8 cuts, 15s @ 30fps = 450 frames. Hard cuts between all scenes.
// Each i2v clip is 4.04s (121 frames) or 5.04s (151f for scene-03);
// `startFrom` trims into the most-dynamic window of the source clip.

export const FPS = 30;
export const DURATION_SEC = 15.0;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS); // 450

export type Scene = {
  id: string;
  /** Offset (frames) into the master timeline */
  from: number;
  /** Length (frames) on the master timeline */
  durationInFrames: number;
  /** Source clip filename inside public/flipper-hypermotion-001/assets/videos/ */
  videoFile: string;
  /** Frame offset INTO the source clip (skips the lead-in if any) */
  startFrom: number;
  /** Optional human label */
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
    label: "Macro tease / OLED dolphin reveal",
    from: 54,
    durationInFrames: 54, // 1.8s
    videoFile: "scene-02-vid.mp4",
    startFrom: 20,
  },
  {
    id: "03a",
    label: "Contact spark + arcade counter incrementing",
    from: 108,
    durationInFrames: 30, // 1.0s
    videoFile: "scene-03a-vid.mp4",
    startFrom: 20,
  },
  {
    id: "03c",
    label: "Money-eyes greed face (anime kane-no-me trope)",
    from: 138,
    durationInFrames: 30, // 1.0s
    videoFile: "scene-03c-vid.mp4",
    startFrom: 15,
  },
  {
    id: "03b",
    label: "Coin-magnet macro insert",
    from: 168,
    durationInFrames: 24, // 0.8s
    videoFile: "scene-03b-vid.mp4",
    startFrom: 50,
  },
  {
    id: "04",
    label: "Chibi runway",
    from: 192,
    durationInFrames: 54, // 1.8s
    videoFile: "scene-04-vid.mp4",
    startFrom: 40,
  },
  {
    id: "05",
    label: "Vertical exploded reveal",
    from: 246,
    durationInFrames: 72, // 2.4s
    videoFile: "scene-05-vid.mp4",
    startFrom: 25,
  },
  {
    id: "05b",
    label: "GPIO pin-glint insert",
    from: 318,
    durationInFrames: 24, // 0.8s
    videoFile: "scene-05b-vid.mp4",
    startFrom: 40,
  },
  {
    id: "06",
    label: "Snap-back outro / logo + slogan",
    from: 342,
    durationInFrames: 108, // 3.6s
    videoFile: "scene-06-vid.mp4",
    startFrom: 5,
  },
];

/** Active music track — swap by editing this constant. */
export const MUSIC_FILE = "music-b-electronic.mp3";
