// TakeAMinute — APP-MOTION-FORWARD ad v9.
// 15s @ 30fps = 450 frames.
// USER PIVOT #2: ≥50% of content must be APP motion (not series footage).
// Series clips become brief teasers; the rest is app UI in action.
// Time budget: 11.0s app motion (73%), 4.0s series teasers (27%).

export const FPS = 30;
export const DURATION_SEC = 15.0;
export const TOTAL_FRAMES = Math.ceil(DURATION_SEC * FPS); // 450

export type TextLine = {
  text: string;
  font: "anton" | "bebas" | "bowlby";
  size: number;
  position: "top" | "center" | "bottom";
  animation: "spring-pop" | "shake-pop" | "scale-bounce" | "slide-up" | "fade-zoom";
  delay?: number;
  /** Frame relative to scene start at which text fades out (6f fade window). */
  exitDelay?: number;
  outline?: boolean;
};

export type Scene = {
  id: string;
  from: number;
  durationInFrames: number;
  asset: string;
  startFrom?: number;
  flashFrames?: number;
  shakeFrames?: number;
  text?: TextLine[];
  /** Mask the AI-generated brand header strip (covers misspelled "TekeAMinute" + "Trendlog Now").
   *  Bounds in % of full frame. Show only when frame >= showFromFrame. */
  brandStripMask?: { top: number; left: number; width: number; height: number; showFromFrame: number };
  label: string;
};

export const SCENES: Scene[] = [
  // ── 0.0-1.5s — HOOK: romantic-drama tease ───────────────────────────────
  // (10% — real series teaser, romance vibe matches app tonality)
  {
    id: "01-hook-drama",
    label: "HOOK: 'I met the love of my life' romantic moment",
    from: 0,
    durationInFrames: 45, // 1.5s
    asset: "refs/series-clips/series-3.mp4",
    startFrom: 30, // mid-shot of smiling guy
    text: [
      {
        text: "POV: {ONE EPISODE}",
        font: "bebas",
        size: 68,
        position: "top",
        animation: "slide-up",
        delay: 4,
        exitDelay: 42,
        outline: true,
      },
    ],
  },

  // ── 1.5-5.5s — APP TAP-TO-OPEN (wan-2.7 first+last) ─────────────────────
  // (27% — app motion: thumb taps icon → red burst → home page reveals)
  {
    id: "02-app-tap",
    label: "APP: tap-to-open animation (wan-2.7 first+last)",
    from: 45,
    durationInFrames: 120, // 4.0s — full clip
    asset: "assets/videos/app-tap-vid.mp4",
    startFrom: 0,
    text: [
      {
        text: "{TURNED INTO 20.}",
        font: "bebas",
        size: 64,
        position: "top",
        animation: "slide-up",
        delay: 8,
        exitDelay: 48,
        outline: true,
      },
      {
        text: "{1000+} DRAMAS.",
        font: "anton",
        size: 80,
        position: "bottom",
        animation: "spring-pop",
        delay: 60,
        exitDelay: 115,
        outline: true,
      },
    ],
    // Mask the AI-misspelled "TekeAMinute" + "Trondlog Now" header.
    // Covers both rows: brand header (~y=10-13%) + section heading (~y=15-18%).
    // Phone screen interior x range in this wan-2.7 clip: ~22-72% of full frame.
    brandStripMask: { top: 9.5, left: 21, width: 54, height: 11, showFromFrame: 50 },
  },

  // ── 5.5-7.5s — DRAMA TEASE #2 ───────────────────────────────────────────
  // (13% — real kiss/embrace teaser, shows what's IN the app)
  {
    id: "03-drama-tease",
    label: "Real drama: passionate kiss in red dress",
    from: 165,
    durationInFrames: 60, // 2.0s
    asset: "refs/series-clips/clip-bucket-1.mp4",
    startFrom: 25,
  },

  // ── 7.5-11.5s — APP PLAYER-RACING (NEW seedance/wan-2.7) ────────────────
  // (27% — app motion: progress bar 10%→95%, NEXT EP appears)
  {
    id: "04-app-player",
    label: "APP: player UI motion — progress bar races + NEXT EP",
    from: 225,
    durationInFrames: 120, // 4.0s
    asset: "assets/videos/app-player-vid.mp4",
    startFrom: 0,
    text: [
      {
        text: "EACH EP =",
        font: "anton",
        size: 80,
        position: "top",
        animation: "spring-pop",
        delay: 14,
        exitDelay: 60,
        outline: true,
      },
      {
        text: "{1 MINUTE.}",
        font: "anton",
        size: 96,
        position: "top",
        animation: "spring-pop",
        delay: 60,
        exitDelay: 115,
        outline: true,
      },
    ],
  },

  // ── 11.5-15.0s — CTA (existing CTA clip, full hold) ─────────────────────
  // (23% — app motion: TM icon burst + CTA)
  {
    id: "05-cta",
    label: "FINAL CTA — burned-in 'START WATCHING FREE'",
    from: 345,
    durationInFrames: 105, // 3.5s
    asset: "assets/videos/scene-06-cta-vid.mp4",
    startFrom: 5,
    // No overlay — the CTA video already has burned-in
    // "START WATCHING FREE / New Episodes Daily / OPEN ON APP STORE / TakeAMinute"
  },
];

/** Active music. Cinematic = matches drama emotional tone. */
export const MUSIC_FILE = "music-b-cinematic.mp3";
