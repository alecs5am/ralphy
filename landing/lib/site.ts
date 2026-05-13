export const site = {
  name: "Ralphy",
  tagline:
    "Open-source content factory CLI. Turn your coding agent into a video marketer.",
  repo: "https://github.com/alecs5am/ralphy",
  docs: "https://docs.ralphy.dev",
  discord: "https://discord.gg/ralphy",
  x: "https://twitter.com/ralphy_studio",
  install:
    "curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh",
  stars: "1.2k",
} as const;

export const nav = [
  { label: "How it works", href: "#what" },
  { label: "Install", href: "#install" },
  { label: "Pipeline", href: "#flow" },
  { label: "Templates", href: "#gallery" },
  { label: "Stack", href: "#stack" },
  { label: "Community", href: "#community" },
];

/** Style families that ship in the template library. The agent forks
 *  one of these, restyles it against the operator's product, ships. */
export type VideoStyle = {
  id: string;
  /** Pixel-font header line above the title */
  kicker: string;
  /** Italic display title */
  title: string;
  /** Short paragraph describing the format */
  copy: string;
  /** Status pill: "live" templates have a worked example, "soon" are queued */
  status: "live" | "soon";
};

export const videoStyles: VideoStyle[] = [
  {
    id: "commercials",
    kicker: "01 · commercials",
    title: "Brand spots",
    copy: "Premium product spots à la Nothing Phone — clean studio light, beauty pans, cinematic copy. Drop your product, keep the polish.",
    status: "live",
  },
  {
    id: "hyper-motion",
    kicker: "02 · hyper-motion",
    title: "Hyper-motion",
    copy: "Macro speed-ramps and impossible camera work — the Flipper-style hardware reveal that stops a scroll dead. Built for launches.",
    status: "live",
  },
  {
    id: "horror",
    kicker: "03 · horror",
    title: "Horror shorts",
    copy: "60-second creep-outs with cold lighting and a twist hook. Wildly over-indexes for retention; use sparingly, plug your CTA at the end.",
    status: "soon",
  },
  {
    id: "fruit-drama",
    kicker: "04 · fruit drama",
    title: "Fruit dramas",
    copy: "Absurdist, character-driven micro-stories with maximum charm-per-second. The format that printed views all of 2025; rebrand-friendly.",
    status: "soon",
  },
  {
    id: "talking-head",
    kicker: "05 · talking head",
    title: "Talking head",
    copy: "Founder/operator monologue with B-roll and captions. Cheapest format we ship; perfect for daily build-in-public posts and LinkedIn.",
    status: "live",
  },
];

export type VideoClip = {
  id: string;
  src: string;
  poster: string;
  /** Pixel-font label above the title */
  label: string;
  title: string;
  duration: string;
  /** Format hint shown in the corner pill */
  ratio: string;
  /** "for-you-page"-style stat strip */
  stats: { likes: string; comments: string; shares: string };
};

/** 12 motion clips generated from AI keyframes (gemini-3-pro-image + kling-v3),
 *  rendered through Ralphy's profile system. All 1080×1920 (9:16). */
export const clips: VideoClip[] = [
  {
    id: "soviet-01",
    src: "/videos/soviet-01.mp4",
    poster: "/posters/soviet-01.jpg",
    label: "soviet-engineer · 01",
    title: "Morning kitchen",
    duration: "0:06",
    ratio: "9:16 · gemini-3-pro",
    stats: { likes: "12.4k", comments: "318", shares: "1.1k" },
  },
  {
    id: "metal-04",
    src: "/videos/metal-04.mp4",
    poster: "/posters/metal-04.jpg",
    label: "solutions-metal · 04",
    title: "The commission",
    duration: "0:06",
    ratio: "9:16 · kling-v3",
    stats: { likes: "21.9k", comments: "542", shares: "2.4k" },
  },
  {
    id: "soviet-03",
    src: "/videos/soviet-03.mp4",
    poster: "/posters/soviet-03.jpg",
    label: "soviet-engineer · 03",
    title: "Shop floor",
    duration: "0:06",
    ratio: "9:16 · gemini-3-pro",
    stats: { likes: "9.3k", comments: "281", shares: "734" },
  },
  {
    id: "metal-07",
    src: "/videos/metal-07.mp4",
    poster: "/posters/metal-07.jpg",
    label: "solutions-metal · 07",
    title: "The cap, worn",
    duration: "0:06",
    ratio: "9:16 · seedance-2.0",
    stats: { likes: "8.7k", comments: "204", shares: "612" },
  },
  {
    id: "soviet-02",
    src: "/videos/soviet-02.mp4",
    poster: "/posters/soviet-02.jpg",
    label: "soviet-engineer · 02",
    title: "Walk to factory",
    duration: "0:06",
    ratio: "9:16 · gemini-3-pro",
    stats: { likes: "6.2k", comments: "143", shares: "488" },
  },
  {
    id: "metal-01",
    src: "/videos/metal-01.mp4",
    poster: "/posters/metal-01.jpg",
    label: "solutions-metal · 01",
    title: "Hands & notebook",
    duration: "0:06",
    ratio: "9:16 · gemini-3-pro",
    stats: { likes: "14.1k", comments: "402", shares: "1.6k" },
  },
  {
    id: "soviet-05",
    src: "/videos/soviet-05.mp4",
    poster: "/posters/soviet-05.jpg",
    label: "soviet-engineer · 05",
    title: "Walk home, evening",
    duration: "0:06",
    ratio: "9:16 · veo-3.1",
    stats: { likes: "5.4k", comments: "118", shares: "402" },
  },
  {
    id: "metal-08",
    src: "/videos/metal-08.mp4",
    poster: "/posters/metal-08.jpg",
    label: "solutions-metal · 08",
    title: "Still life · cap",
    duration: "0:06",
    ratio: "9:16 · kling-v3",
    stats: { likes: "11.2k", comments: "267", shares: "780" },
  },
  {
    id: "soviet-04",
    src: "/videos/soviet-04.mp4",
    poster: "/posters/soviet-04.jpg",
    label: "soviet-engineer · 04",
    title: "Canteen tray",
    duration: "0:06",
    ratio: "9:16 · gemini-3-pro",
    stats: { likes: "3.9k", comments: "94", shares: "215" },
  },
  {
    id: "metal-02",
    src: "/videos/metal-02.mp4",
    poster: "/posters/metal-02.jpg",
    label: "solutions-metal · 02",
    title: "Lab microscope",
    duration: "0:06",
    ratio: "9:16 · seedance-2.0",
    stats: { likes: "7.5k", comments: "190", shares: "548" },
  },
  {
    id: "soviet-06",
    src: "/videos/soviet-06.mp4",
    poster: "/posters/soviet-06.jpg",
    label: "soviet-engineer · 06",
    title: "Family dinner",
    duration: "0:06",
    ratio: "9:16 · veo-3.1",
    stats: { likes: "18.8k", comments: "511", shares: "1.9k" },
  },
  {
    id: "metal-06",
    src: "/videos/metal-06.mp4",
    poster: "/posters/metal-06.jpg",
    label: "solutions-metal · 06",
    title: "Notebook reveal",
    duration: "0:06",
    ratio: "9:16 · kling-v3",
    stats: { likes: "10.7k", comments: "245", shares: "692" },
  },
];
