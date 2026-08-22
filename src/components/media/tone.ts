/* The three media players are mounted on both a black widget (the asset modal stage, a media
   tile's frame, a social mockup) and a light one (the shared artifact viewer's stage, a build
   output plate). Ink and surface have to be chosen together, by the player, from one prop — a
   caller that repainted half the pair from CSS is how a light plate ended up carrying on-dark ink
   at 1.06:1. This is the same split SelectMenu's and MarkdownView's `tone` props make.
   `instrument` is the default because most hosts are black. */
export type PlayerTone = "instrument" | "surface";

export function playerTone(tone: PlayerTone | undefined): PlayerTone {
  return tone ?? "instrument";
}

/* The mat a picture or a waveform stands on, one step off its host's surface. */
export const PLAYER_MAT: Record<PlayerTone, string> = {
  instrument: "bg-instrument-raised",
  surface: "bg-surface-sunken",
};

/* The ink a player writes with, and the muted step under it. */
export const PLAYER_INK: Record<PlayerTone, { strong: string; muted: string }> = {
  instrument: { strong: "text-on-instrument", muted: "text-on-instrument-muted" },
  surface: { strong: "text-ink", muted: "text-muted" },
};

/* Geometry only: a round transport control, sized by whoever mounts it. A shared base never
   carries a surface or an ink, so the pair below is appended at the call site in one string. */
export const PLAYER_CONTROL = "inline-grid flex-none place-items-center rounded-control";

/* A transport or zoom cluster floating over media: the plate, the control pair, the read-outs
   between them, and the focus ring that reads on that plate. The 90% is the scrim opacity the
   stylesheet used for both clusters; a separate task owns unifying the media scrims. */
export const PLAYER_CHROME: Record<PlayerTone, { plate: string; control: string; read: string; ring: string; slider: string; wave: { played: string; rest: string } }> = {
  instrument: {
    plate: "bg-instrument/90",
    control: "text-on-instrument-muted not-disabled:hover:bg-instrument-hover not-disabled:hover:text-on-instrument disabled:text-on-instrument-muted-decorative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument",
    read: "text-on-instrument-muted",
    ring: "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-instrument",
    /* SnappySlider paints its track, range and thumb with `bg-ink`, which is #141414 in the light
       theme — black on a black transport. The slider on a black plate takes the on-dark ink, at
       the same 14% track alpha the component uses. */
    slider: "[&_.snappy-slider-track]:bg-on-instrument/14 [&_.snappy-slider-range]:bg-on-instrument [&_.snappy-slider-thumb]:bg-on-instrument [&_.snappy-slider-mark]:bg-on-instrument/48",
    /* The streaming preview's bars are a surface, not an ink, so they take the same pair one step
       over: played is the strong tone, the rest is the muted one. */
    wave: { played: "bg-on-instrument", rest: "bg-on-instrument-muted" },
  },
  surface: {
    plate: "bg-surface/90",
    control: "text-muted not-disabled:hover:bg-surface-hover not-disabled:hover:text-ink disabled:text-muted-decorative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
    read: "text-muted",
    ring: "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    /* The component's own ink is already the theme ink, so a light plate needs no restatement. */
    slider: "",
    wave: { played: "bg-ink", rest: "bg-muted" },
  },
};
