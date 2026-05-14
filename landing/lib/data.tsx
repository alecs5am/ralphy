import type { ReactNode } from "react";

export const site = {
  name: "Ralphy",
  tagline: "Open-source content factory CLI. Turn your coding agent into a video marketer.",
  repo: "https://github.com/alecs5am/ralphy",
  docs: "https://github.com/alecs5am/ralphy#readme",
  discord: "https://discord.gg/ralphy",
  x: "https://twitter.com/ralphy_studio",
  install: "curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh",
  /**
   * Display value, "fake-it-till-you-make-it". The real GitHub star count is
   * fetched at build time via {@link getDisplayStars}; we show whichever is
   * higher between this and the live count.
   */
  fakeStars: 2400,
};

function formatStars(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k.toFixed(k < 10 ? 1 : 0).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

/**
 * Server-side fetch of the live star count.
 * Falls back silently to {@link site.fakeStars} on any network / parse error.
 * Cached for 1h so we don't hammer GitHub on every render.
 */
async function fetchRealStars(): Promise<number> {
  try {
    const res = await fetch("https://api.github.com/repos/alecs5am/ralphy", {
      next: { revalidate: 3600 },
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as { stargazers_count?: number };
    return typeof json.stargazers_count === "number" ? json.stargazers_count : 0;
  } catch {
    return 0;
  }
}

/** Returns `max(fakeStars, realStars)`, formatted as e.g. "2.4k". */
export async function getDisplayStars(): Promise<string> {
  const real = await fetchRealStars();
  return formatStars(Math.max(site.fakeStars, real));
}

export const navItems = [
  { label: "How it works", href: "#how" },
  { label: "Showcase", href: "#showcase" },
  { label: "Templates", href: "#templates" },
  { label: "Pipeline", href: "#pipeline" },
  { label: "Stack", href: "#stack" },
  { label: "Community", href: "#community" },
];

export type Workflow = { n: string; title: string; copy: ReactNode; glyph: string };

export const workflow: Workflow[] = [
  {
    n: "01 · trend-watch",
    title: "See what's spiking",
    copy: (
      <>
        Drop a niche or an <span className="inl">@handle</span>. Ralphy crawls TikTok, Reels & Shorts and reports
        what's gaining velocity <em>before</em> it peaks — hooks, formats, references attached.
      </>
    ),
    glyph: "trend",
  },
  {
    n: "02 · style-clone",
    title: "Clone any look",
    copy: (
      <>
        Paste any URL or fork a template — <span className="inl">commercials</span>,{" "}
        <span className="inl">hyper-motion</span>, <span className="inl">horror</span>,{" "}
        <span className="inl">fruit drama</span>, <span className="inl">talking head</span>. Look transfers, script
        stays yours.
      </>
    ),
    glyph: "clone",
  },
  {
    n: "03 · iterate",
    title: "Learn from the numbers",
    copy: (
      <>
        Plug your views, watch-time, and conversions back in. Ralphy doubles down on variants that move the needle
        and retires the ones that don't — automatically, on the next run.
      </>
    ),
    glyph: "loop",
  },
  {
    n: "04 · unlock revenue",
    title: "Customers. Reach. Famous.",
    copy: (
      <>
        Ship daily. Compounding reach pulls in users, subs, and revenue without an agency in the loop. You stayed
        inside <span className="inl">claude</span>. The market caught up.
      </>
    ),
    glyph: "up",
  },
];

export type StyleFamily = {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  status: "live" | "soon";
};

export const styles: StyleFamily[] = [
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
    copy: "60-second creep-outs with cold lighting and a twist hook. Wildly over-indexes for retention; plug your CTA at the end.",
    status: "soon",
  },
  {
    id: "fruit-drama",
    kicker: "04 · fruit drama",
    title: "Fruit dramas",
    copy: "Absurdist, character-driven micro-stories with maximum charm-per-second. Format that printed views in 2025; rebrand-friendly.",
    status: "soon",
  },
  {
    id: "talking-head",
    kicker: "05 · talking head",
    title: "Talking head",
    copy: "Founder monologue with B-roll and captions. Cheapest format we ship; perfect for daily build-in-public posts and LinkedIn.",
    status: "live",
  },
];

export const pipeline = [
  { n: "01 · idea", t: "Capture", d: "One sentence in chat. Ralphy stretches it into a brief." },
  { n: "02 · prompt", t: "Optimize", d: "Templates + model rules turn the brief into shot prompts." },
  { n: "03 · board", t: "Plan", d: "A 5-shot storyboard, references attached, durations locked." },
  { n: "04 · render", t: "Generate", d: "Image · video · voice · music — composed through Remotion." },
  { n: "05 · refine", t: "Iterate", d: "Critic scores, sliders move, the loop closes itself." },
];

export type Clip = {
  id: string;
  src: string;
  poster: string;
  label: string;
  title: string;
  span: "v1" | "v2" | "h2" | "h3" | "sq";
};

// 12-tile mosaic — 2 v2 (4 cells each) + 10 v1 (1 each) = 18 cells = 3 rows
// on a 6-col grid. Adding more clips here without matching the cell math
// will leave dense-flow gaps; trim or re-balance v2 spans accordingly.
export const clips: Clip[] = [
  // Real Ralphy renders from ralphy-assets/examples/showcase — hero tiles.
  { id: "nothing-hp1-001", src: "/assets/showcase/nothing-hp1-001.mp4", poster: "/assets/showcase/posters/nothing-hp1-001.jpg", label: "Product Ad", title: "Nothing HP1 launch", span: "v2" },
  { id: "flipper-hypermotion-001", src: "/assets/showcase/flipper-hypermotion-001.mp4", poster: "/assets/showcase/posters/flipper-hypermotion-001.jpg", label: "Hyper Motion", title: "Flipper Zero ad", span: "v1" },
  { id: "occult-mockumentary-001", src: "/assets/showcase/occult-mockumentary-001.mp4", poster: "/assets/showcase/posters/occult-mockumentary-001.jpg", label: "Horror Short", title: "Occult mockumentary", span: "v1" },
  { id: "glitter-cream-001", src: "/assets/showcase/glitter-cream-001.mp4", poster: "/assets/showcase/posters/glitter-cream-001.jpg", label: "UGC Selfie", title: "Glitter-cream review", span: "v2" },
  { id: "analog-horror-fridge-001", src: "/assets/showcase/analog-horror-fridge-001.mp4", poster: "/assets/showcase/posters/analog-horror-fridge-001.jpg", label: "Analog Horror", title: "Compliance Bulletin 9-D", span: "v1" },

  // Legacy reference fillers — kept to round out the mosaic to 12 tiles.
  { id: "metal-04", src: "/assets/videos/metal-04.mp4", poster: "/assets/posters/metal-04.jpg", label: "Hyper Motion", title: "The commission", span: "v1" },
  { id: "soviet-03", src: "/assets/videos/soviet-03.mp4", poster: "/assets/posters/soviet-03.jpg", label: "Horror Short", title: "Shop floor", span: "v1" },
  { id: "metal-07", src: "/assets/videos/metal-07.mp4", poster: "/assets/posters/metal-07.jpg", label: "Brand Spot", title: "The cap, worn", span: "v1" },
  { id: "soviet-02", src: "/assets/videos/soviet-02.mp4", poster: "/assets/posters/soviet-02.jpg", label: "Lifestyle", title: "Walk to factory", span: "v1" },
  { id: "metal-08", src: "/assets/videos/metal-08.mp4", poster: "/assets/posters/metal-08.jpg", label: "Brand Spot", title: "Still life · cap", span: "v1" },
  { id: "soviet-04", src: "/assets/videos/soviet-04.mp4", poster: "/assets/posters/soviet-04.jpg", label: "Documentary", title: "Canteen tray", span: "v1" },
  { id: "metal-02", src: "/assets/videos/metal-02.mp4", poster: "/assets/posters/metal-02.jpg", label: "Hyper Motion", title: "Lab microscope", span: "v1" },
];

export type StackChip = { icon: string | null; label: string; muted?: boolean };

export const stack: { inside: StackChip[]; powered: StackChip[]; ship: StackChip[] } = {
  inside: [
    { icon: "claude", label: "Claude Code" },
    { icon: "cursor", label: "Cursor" },
    { icon: "codex", label: "Codex" },
    { icon: "term", label: "any agent CLI", muted: true },
    { icon: "term", label: "bare $ ralphy", muted: true },
  ],
  powered: [
    { icon: "or", label: "OpenRouter" },
    { icon: "vc", label: "Vercel AI Gateway" },
    { icon: "el", label: "ElevenLabs" },
    { icon: "rm", label: "Remotion" },
    { icon: "gemini", label: "gemini-3-pro", muted: true },
    { icon: "kling", label: "kling-v3", muted: true },
    { icon: "veo", label: "veo-3.1", muted: true },
    { icon: "seedance", label: "seedance-2.0", muted: true },
  ],
  ship: [
    { icon: "tt", label: "TikTok" },
    { icon: "rl", label: "Reels" },
    { icon: "yt", label: "YouTube Shorts" },
    { icon: "x_brand", label: "X" },
    { icon: "meta", label: "Meta ads" },
    { icon: "amazon", label: "Amazon listings" },
    { icon: null, label: "…or any channel you ship to", muted: true },
  ],
};

export const ways = [
  { hl: "template", head: "Ship a template", copy: "Found a format that prints engagement? Bundle the style, refs, prompts — push it. Anyone running Ralphy installs your playbook in one command." },
  { hl: "skill", head: "Write a skill", copy: "A skill is a single markdown file in your repo — add a new model, a new transition, an analytics hook, a caption style. Drop it in, Ralphy picks it up on the next run." },
  { hl: "use case", head: "Bring a use case", copy: "Drop your funnel, your numbers, your bottleneck in #ideas. The community picks up what feels obvious in hindsight, ships it next week." },
  { hl: "use it", head: "Just use it", copy: "Star the repo, post the render that landed, tell us which step felt slow. That's how we know which corner to polish first." },
];

export const channels = [
  { id: "discord", title: "Discord", desc: "Where founders, marketers, and indie operators trade prompts, templates, and that one weird ffmpeg flag. Dev team hangs in #beta.", arr: "join the campfire →", href: site.discord },
  { id: "github", title: "GitHub", desc: "Source, issues, releases — and the template library. Open a PR, get your style family into the next install.", arr: "fork & ship →", href: site.repo },
  { id: "x", title: "X / Twitter", desc: "Daily render drops, model news, what just landed in main. Tag @ralphy_studio with your numbers to get reposted.", arr: "follow →", href: site.x },
  { id: "docs", title: "Docs · Mintlify", desc: "CLI reference, skill authoring, model registry, template authoring — searchable, with worked examples for each family.", arr: "read the docs →", href: site.docs },
];
