// Auto-built timeline from scenes-27.json (gemini analysis of the source video).
// Each entry is one shot; videoFile is null for title-cards (rendered as text).

export type SceneKind = "video" | "title" | "title-cycle";

export type SceneEntry = {
  id: number;
  start: number;     // seconds
  end: number;       // seconds
  duration: number;  // seconds (end - start)
  kind: SceneKind;
  videoFile?: string;        // relative to public/nothing-hp1-001/
  text?: string;             // for title cards
  textSequence?: string[];   // for the cycling endcard
};

export const SCENES: SceneEntry[] = [
  // 01 — title "NOTHING (R)"
  { id: 1, start: 0.0, end: 1.2, duration: 1.2, kind: "title", text: "NOTHING (R)" },

  // 02-22 — generated i2v clips
  { id: 2,  start: 1.2,  end: 4.5,  duration: 3.3, kind: "video", videoFile: "scenes/02/scene-02-kling-v2.mp4" },
  { id: 3,  start: 4.5,  end: 6.5,  duration: 2.0, kind: "video", videoFile: "scenes/03/scene-03-kling.mp4" },
  { id: 4,  start: 6.5,  end: 11.7, duration: 5.2, kind: "video", videoFile: "scenes/04/scene-04-kling-v3.mp4" },
  { id: 5,  start: 11.7, end: 13.4, duration: 1.7, kind: "video", videoFile: "scenes/05/scene-05-kling.mp4" },
  { id: 6,  start: 13.4, end: 15.9, duration: 2.5, kind: "video", videoFile: "scenes/06/scene-06-kling-v3.mp4" },
  { id: 7,  start: 15.9, end: 18.0, duration: 2.1, kind: "video", videoFile: "scenes/07/scene-07-kling.mp4" },
  { id: 8,  start: 18.0, end: 19.4, duration: 1.4, kind: "video", videoFile: "scenes/08/scene-08-kling.mp4" },
  { id: 9,  start: 19.4, end: 20.9, duration: 1.5, kind: "video", videoFile: "scenes/09/scene-09-kling-v4.mp4" },
  { id: 10, start: 20.9, end: 23.7, duration: 2.8, kind: "video", videoFile: "scenes/10/scene-10-kling.mp4" },
  { id: 11, start: 23.7, end: 25.7, duration: 2.0, kind: "video", videoFile: "scenes/11/scene-11-kling.mp4" },
  { id: 12, start: 25.7, end: 27.7, duration: 2.0, kind: "video", videoFile: "scenes/12/scene-12-kling-v2.mp4" },
  { id: 13, start: 27.7, end: 29.8, duration: 2.1, kind: "video", videoFile: "scenes/13/scene-13-kling.mp4" },
  { id: 14, start: 29.8, end: 32.4, duration: 2.6, kind: "video", videoFile: "scenes/14/scene-14-kling.mp4" },
  { id: 15, start: 32.4, end: 34.9, duration: 2.5, kind: "video", videoFile: "scenes/15/scene-15-kling.mp4" },
  { id: 16, start: 34.9, end: 36.5, duration: 1.6, kind: "video", videoFile: "scenes/16/scene-16-kling.mp4" },
  { id: 17, start: 36.5, end: 37.3, duration: 0.8, kind: "video", videoFile: "scenes/17/scene-17-kling.mp4" },
  { id: 18, start: 37.3, end: 39.1, duration: 1.8, kind: "video", videoFile: "scenes/18/scene-18-kling.mp4" },
  { id: 19, start: 39.1, end: 40.4, duration: 1.3, kind: "video", videoFile: "scenes/19/scene-19-kling.mp4" },
  { id: 20, start: 40.4, end: 41.5, duration: 1.1, kind: "video", videoFile: "scenes/20/scene-20-kling.mp4" },
  { id: 21, start: 41.5, end: 43.0, duration: 1.5, kind: "video", videoFile: "scenes/21/scene-21-kling.mp4" },
  { id: 22, start: 43.0, end: 45.3, duration: 2.3, kind: "video", videoFile: "scenes/22/scene-22-kling.mp4" },

  // 23 — title "headphone (1)"
  { id: 23, start: 45.3, end: 47.3, duration: 2.0, kind: "title", text: "headphone (1)" },

  // 24 — handheld dance close-up (no dedicated gen — fallback to scene 21 clip)
  { id: 24, start: 47.3, end: 48.2, duration: 0.9, kind: "video", videoFile: "scenes/21/scene-21-kling.mp4" },

  // 25 — hands macro fingers adjust dial (no dedicated gen — fallback to scene 14 clip)
  { id: 25, start: 48.2, end: 49.0, duration: 0.8, kind: "video", videoFile: "scenes/14/scene-14-kling.mp4" },

  // 26 — title "control your sound"
  { id: 26, start: 49.0, end: 50.0, duration: 1.0, kind: "title", text: "control your sound" },

  // 27 — endcard text cycle "control your sound → NOTHING (R) → nothing.tech → (blank)"
  {
    id: 27,
    start: 50.0,
    end: 54.0,
    duration: 4.0,
    kind: "title-cycle",
    textSequence: ["control your sound", "NOTHING (R)", "nothing.tech", ""],
  },
];

export const FPS = 30;
export const DURATION_SEC = 54.0;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS);
export const SEC_TO_FRAMES = (sec: number) => Math.round(sec * FPS);
