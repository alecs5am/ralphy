// Tokyo, slow shutter — scene timeline.
// 17 i2v clips trimmed via gemini-3.1-pro analysis (see logs/trim-analysis/).
// 24fps cinematic native; total 1800 frames = 75s (matches 75s music bed).
// Letterboxed 1.85:1 inside 9:16 canvas (1080×584 centered vertically with 668px bars top/bottom).
// Hard cuts between scenes (zero diegetic audio; cuts on musical phrasing, not strict beats).

export const FPS = 24;
export const DURATION_SEC = 75;
export const TOTAL_FRAMES = Math.round(DURATION_SEC * FPS); // 1800

export type Scene = {
  id: string;
  label: string;
  from: number;            // composition frame
  durationInFrames: number;
  videoFile: string;
  startFromSec: number;    // trim into source clip
};

// startFromSec is in seconds (converted to frames at render time).
export const SCENES: Scene[] = [
  // shot 0 — pastoral opener (v2 honeybee-DNA insert)
  { id: "00", label: "Pastoral opener (field, cumulonimbus)",        from: 0,    durationInFrames: 120, videoFile: "scene-00-video-shot.mp4",  startFromSec: 0.5 },
  // shot 1 — dawn Yamanote platform + sparrow takeoff (key beat at tail per gemini)
  { id: "01", label: "Dawn Yamanote platform, sparrow",              from: 120,  durationInFrames: 108, videoFile: "scene-01-video-shot.mp4",  startFromSec: 1.5 },
  // shot 2 — kissaten, she raises mju-II
  { id: "02", label: "Kissaten, she raises camera",                  from: 228,  durationInFrames: 96,  videoFile: "scene-02-video-shot.mp4",  startFromSec: 0.5 },
  // shot 3 — sliding door near-miss
  { id: "03", label: "Kissaten door swing (near-miss #1)",           from: 324,  durationInFrames: 84,  videoFile: "scene-03-video-shot.mp4",  startFromSec: 0   },
  // shot 4 — vinyl flip macro
  { id: "04", label: "He flips vinyl macro",                         from: 408,  durationInFrames: 120, videoFile: "scene-04-video-shot.mp4",  startFromSec: 0.5 },
  // shot 5 — platform near-miss across tracks (key reveal at ~3.5-4.5s)
  { id: "05", label: "Yamanote platform near-miss #2",               from: 528,  durationInFrames: 130, videoFile: "scene-05-video-shot.mp4",  startFromSec: 0   },
  // shot 6 — she shoots empty seat (foreshadow)
  { id: "06", label: "She photographs the empty seat",               from: 658,  durationInFrames: 96,  videoFile: "scene-06-video-shot.mp4",  startFromSec: 0.5 },
  // shot 7 — he, forehead on glass, neon sweep
  { id: "07", label: "He, forehead on train glass",                  from: 754,  durationInFrames: 120, videoFile: "scene-07-video-shot.mp4",  startFromSec: 1.0 },
  // shot 8 — vending alley, reloads Portra
  { id: "08", label: "Vending alley, she reloads film",              from: 874,  durationInFrames: 132, videoFile: "scene-08-video-shot.mp4",  startFromSec: 0   },
  // shot 8p — sakura breath-shot (v2 honeybee-DNA insert)
  { id: "08p",label: "Sakura courtyard breath-shot",                 from: 1006, durationInFrames: 72,  videoFile: "scene-08p-video-shot.mp4", startFromSec: 0.5 },
  // shot 9 — Shibuya intersection wide
  { id: "09", label: "Shibuya intersection, 30m apart",              from: 1078, durationInFrames: 108, videoFile: "scene-09-video-shot.mp4",  startFromSec: 0.5 },
  // shot 10a — umbrella pop sequence (she)
  { id: "10a",label: "Umbrellas pop, she has one",                   from: 1186, durationInFrames: 96,  videoFile: "scene-10a-video-shot.mp4", startFromSec: 0.5 },
  // shot 10b — he ducks awning, smiling at himself
  { id: "10b",label: "He under awning, hand to forehead",             from: 1282, durationInFrames: 108, videoFile: "scene-10b-video-shot.mp4", startFromSec: 0   },
  // shot 11 — record-shop reflection peak (held longest — emotional peak)
  { id: "11", label: "Record-shop window reflection (PEAK)",          from: 1390, durationInFrames: 192, videoFile: "scene-11-video-shot.mp4",  startFromSec: 1.0 },
  // shot 12 — trains pass, single-frame alignment
  { id: "12", label: "Trains passing, reflections align",             from: 1582, durationInFrames: 72,  videoFile: "scene-12-video-shot.mp4",  startFromSec: 0   },
  // shot 13 — her face, half-smile
  { id: "13", label: "Her face at window, half-smile",                from: 1654, durationInFrames: 60,  videoFile: "scene-13-video-shot.mp4",  startFromSec: 0   },
  // shot 14 — final empty platform (fade-to-black inside)
  { id: "14", label: "Empty night platform (fade to black)",          from: 1714, durationInFrames: 86,  videoFile: "scene-14-video-shot.mp4",  startFromSec: 0   },
];

// Last scene's last 36 frames (1.5s) hold a fade-to-black overlay.
export const FADE_TO_BLACK_START_FRAME = TOTAL_FRAMES - 36; // 1764
export const FADE_TO_BLACK_END_FRAME = TOTAL_FRAMES;        // 1800

export const MUSIC_FILE = "music-bed.mp3";

// Letterbox geometry — 1.85:1 inner box centered in 9:16 canvas.
export const CANVAS = { width: 1080, height: 1920 };
export const INNER = { width: 1080, height: 584, top: 668 };
