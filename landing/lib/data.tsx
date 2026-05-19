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
  { label: "Roadmap", href: "#roadmap" },
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

// Masonry mosaic — Pinterest-style CSS multi-column flow. Each tile renders
// at its native aspect-ratio (span → aspect class in globals.css). Order here
// dictates column-fill order, not a strict grid layout.
export const clips: Clip[] = [
  // Order matters: drives top-of-column placement in the LPT packer.
  // First 3 portrait items land at the top of cols 0/1/2.
  { id: "noski-people-001", src: "/assets/showcase/noski-people-001.mp4", poster: "/assets/showcase/posters/noski-people-001.jpg", label: "Photoreal", title: "Socks or people", span: "v1" },
  { id: "nothing-hp1-001", src: "/assets/showcase/nothing-hp1-001.mp4", poster: "/assets/showcase/posters/nothing-hp1-001.jpg", label: "Product Ad", title: "Nothing HP1 launch", span: "v2" },
  { id: "analog-horror-fridge-001", src: "/assets/showcase/analog-horror-fridge-001.mp4", poster: "/assets/showcase/posters/analog-horror-fridge-001.jpg", label: "Analog Horror", title: "Compliance Bulletin 9-D", span: "v1" },
  { id: "flipper-hypermotion-001", src: "/assets/showcase/flipper-hypermotion-001.mp4", poster: "/assets/showcase/posters/flipper-hypermotion-001.jpg", label: "Hyper Motion", title: "Flipper Zero ad", span: "v1" },
  { id: "glitter-cream-001", src: "/assets/showcase/glitter-cream-001.mp4", poster: "/assets/showcase/posters/glitter-cream-001.jpg", label: "UGC Selfie", title: "Glitter-cream review", span: "v2" },
  { id: "occult-mockumentary-001", src: "/assets/showcase/occult-mockumentary-001.mp4", poster: "/assets/showcase/posters/occult-mockumentary-001.jpg", label: "Horror Short", title: "Occult mockumentary", span: "v1" },
  { id: "fruit-drama-001", src: "/assets/showcase/fruit-drama-001.mp4", poster: "/assets/showcase/posters/fruit-drama-001.jpg", label: "Anthropomorphic", title: "Fruit drama", span: "v1" },
  { id: "playdate-pixel-001", src: "/assets/showcase/playdate-pixel-001.mp4", poster: "/assets/showcase/posters/playdate-pixel-001.jpg", label: "Pixel Art", title: "Playdate reveal", span: "v1" },
  { id: "kbo-broadcast-001", src: "/assets/showcase/kbo-broadcast-001.mp4", poster: "/assets/showcase/posters/kbo-broadcast-001.jpg", label: "Broadcast", title: "KBO caught-on-TV", span: "sq" },
  { id: "tokyo-y2k-001", src: "/assets/showcase/tokyo-y2k-001.mp4", poster: "/assets/showcase/posters/tokyo-y2k-001.jpg", label: "Cinematic", title: "Tokyo Y2K", span: "h2" },
  { id: "skater-spiderverse-001", src: "/assets/showcase/skater-spiderverse-001.mp4", poster: "/assets/showcase/posters/skater-spiderverse-001.jpg", label: "Comic", title: "Skater duel", span: "h2" },
];

/* ─────────────────────────────────────────────────────────────
   Roadmap — public-facing trajectory, no dates.
   Two axes drive every category: more quality, less attention.
   Status: `done` (works on main), `in-progress` (partial / behind a flag),
   `planned` (committed direction, not yet started).
   ───────────────────────────────────────────────────────────── */

export type RoadmapStatus = "done" | "in-progress" | "planned";
export type RoadmapItem = { title: string; status: RoadmapStatus; copy: string };
export type RoadmapCategory = {
  n: string;
  slug: string;
  title: string;
  why: string;
  items: RoadmapItem[];
};

export const roadmap: RoadmapCategory[] = [
  {
    n: "01",
    slug: "autonomous-quality",
    title: "Autonomous quality",
    why: "Fewer eyes on the screen. The agent decides what to regenerate, what to keep, what to throw out — not you.",
    items: [
      {
        title: "Auto-rescore + auto-regen loop",
        status: "done",
        copy: "Quality gates retry a failing scene up to 3× before surfacing it. No human gate between scoring and regen.",
      },
      {
        title: "Multi-pass evaluator (scene / audio / captions)",
        status: "done",
        copy: "`ralphy eval` runs scene segmentation, loudness + dead-air, caption density, and per-scene vision pass — produces a structured report a fixer agent can act on.",
      },
      {
        title: "Identity lock via master shots",
        status: "done",
        copy: "Product and model master shots get pinned and passed via `--ref` to every generation — prevents identity drift between scenes.",
      },
      {
        title: "Model-aware fallback",
        status: "done",
        copy: "Kling for default UGC selfies, Seedance for horror / POV / non-default physics — routing rules in MODELS.md, not coded into prompts.",
      },
      {
        title: "Vision defect detector",
        status: "in-progress",
        copy: "Pre-VO pass that catches hands, eyes, text artifacts, and continuity breaks — kills the worst drift before it reaches render.",
      },
      {
        title: "Multi-variant + best-pick",
        status: "in-progress",
        copy: "Three takes per scene, vision-scored, the loser variants get garbage-collected. The agent never asks which to keep.",
      },
      {
        title: "Cross-scene continuity check",
        status: "planned",
        copy: "Wardrobe, lighting, and prop continuity verified across the full storyboard — not just within a single shot.",
      },
      {
        title: "Self-tuning quality thresholds per niche",
        status: "planned",
        copy: "Horror, talking-head, and product-spot have different floors. Thresholds learn from accepted vs rejected outputs over time.",
      },
      {
        title: "Auto-budget cap per scene",
        status: "planned",
        copy: "When auto-regen loops, the agent caps total spend per scene before escalating to the user — no runaway $50 retries.",
      },
    ],
  },
  {
    n: "02",
    slug: "reference-fidelity",
    title: "Reference fidelity",
    why: "The clone should be indistinguishable from the reference, not just in the right neighbourhood. Today this is where ralphy is strongest — and where most quality still lives.",
    items: [
      {
        title: "Multi-pass video analyzer (Gemini)",
        status: "done",
        copy: "References get decomposed into shot list, camera grammar, sound design, and cultural subtext — not just transcribed VO.",
      },
      {
        title: "Frame + timecode shot extraction",
        status: "done",
        copy: "`ralphy ref pull` runs yt-dlp, extracts keyframes, transcribes audio, runs vision per shot — feeds the analyzer with structured data, not raw mp4.",
      },
      {
        title: "VO re-voicing through ElevenLabs",
        status: "done",
        copy: "Reference VO transcript becomes the script; ElevenLabs re-voices it in any persona — same words, your brand voice.",
      },
      {
        title: "Camera grammar capture",
        status: "in-progress",
        copy: "Focal length, dolly, push-in, whip-pan — extracted as a vocabulary, injected into shot prompts so motion matches the reference, not just composition.",
      },
      {
        title: "Pacing & cut-rhythm replication",
        status: "in-progress",
        copy: "Edit timecodes lifted straight from the reference. Hooks land on the same beat as the source — viewers can't tell why it feels right.",
      },
      {
        title: "Audio fidelity match",
        status: "in-progress",
        copy: "Tone, energy, and ambient texture transferred — not just the spoken script. Music brief inferred from the reference's stem.",
      },
      {
        title: "Per-character voice cloning",
        status: "planned",
        copy: "ElevenLabs voice library indexed per project; the same character keeps the same voice across every render in the campaign.",
      },
      {
        title: "Music style match (stems-aware)",
        status: "planned",
        copy: "Detect tempo, key, instrument palette from the reference stem and brief the music model accordingly — not generic genre tags.",
      },
      {
        title: "Cultural subtext annotation",
        status: "planned",
        copy: "Slang, meme references, regional cues flagged in the analyzer's report so the scenarist either keeps them deliberately or substitutes for the target audience.",
      },
    ],
  },
  {
    n: "03",
    slug: "knowledge-pool",
    title: "Knowledge pool",
    why: "Fresh trends and curated assets on tap, so the agent never improvises a brand-new character or trending track from text alone.",
    items: [
      {
        title: "Companion asset repo (ralphy-assets)",
        status: "done",
        copy: "Brainrot characters, gameplay loops, and trend music live in alecs5am/ralphy-assets — sha-pinned, version-controlled, agent-installable.",
      },
      {
        title: "Asset catalog with pool-by-kind",
        status: "done",
        copy: "`ralphy assets list --kind <kind>` shows the curated pool before the agent writes a prompt naming a specific character or track.",
      },
      {
        title: "Vibe-reference + vibe-style templates",
        status: "done",
        copy: "5 full-stack production templates (composition.md + reference) and 38 prompt cookbooks shipped in-repo, indexed by 5 segment-persona categories.",
      },
      {
        title: "Top-20 viral-2026 playlist",
        status: "done",
        copy: "Curated cross-category roster for agent test-drives — the fastest path from blank workspace to a known-good render.",
      },
      {
        title: "Daily trend feed",
        status: "in-progress",
        copy: "What's spiking on TikTok / Reels / Shorts by niche, refreshed daily and queryable via `ralphy trend` — before formats peak.",
      },
      {
        title: "Per-niche playbooks",
        status: "in-progress",
        copy: "DTC commerce, B2B SaaS, creator-lifestyle, entertainment-viral, cinematic narrative — each with its own hook bank, model picks, and quality floor.",
      },
      {
        title: "Auto-template extraction from references",
        status: "planned",
        copy: "Drop 3 high-performing references in a niche → ralphy distils a vibe-reference template you can fork into new campaigns.",
      },
      {
        title: "Style cookbook → 200+",
        status: "planned",
        copy: "Current 38 vibe-style packs grow to 200+ via community contributions and auto-extraction from public references.",
      },
      {
        title: "Community template marketplace",
        status: "planned",
        copy: "Operators publish vibe-reference + vibe-style packs, the agent installs them on demand. Star-ranked, niche-indexed, MIT-licensed by default.",
      },
      {
        title: "Trend prediction model",
        status: "planned",
        copy: "Not just what's spiking — what's about to. Velocity + niche-saturation signals to flag formats while they're still cheap.",
      },
    ],
  },
  {
    n: "04",
    slug: "agent-native-surface",
    title: "Agent-native surface",
    why: "Ralphy is first a CLI + skills for coding agents — Claude Code, Codex, Cursor. The human Studio is a nice-to-have, not the product.",
    items: [
      {
        title: "AGENTS.md routing contract",
        status: "done",
        copy: "Every user request matched to a playbook before any generation. The hard discipline that prevents the agent from improvising on covered topics.",
      },
      {
        title: "Skill packs for Claude Code",
        status: "done",
        copy: "researcher / scenarist / art-director / editor / producer / evaluator / release / postmortem — drop into .claude/skills, auto-routed by AGENTS.md.",
      },
      {
        title: "JSON-first CLI output",
        status: "done",
        copy: "Every command defaults to machine-greppable JSON. `-p` for pretty tables when a human is reading. Agents never have to parse ANSI.",
      },
      {
        title: "Project memory logs (auto-written)",
        status: "done",
        copy: "Every gen, user prompt, and uploaded asset gets appended to JSONL logs under `workspace/projects/<id>/logs/`. The agent re-reads them across sessions.",
      },
      {
        title: "Front-stage CLI verbs",
        status: "in-progress",
        copy: "`trend` / `clone` / `make` / `iterate` collapse the current 40-command surface into four agent-friendly actions on top of the resource CRUD.",
      },
      {
        title: "MCP server",
        status: "in-progress",
        copy: "Ralphy callable from any MCP-aware runtime — Claude desktop, Cursor, ChatGPT — without installing the CLI. The agent owns the loop end-to-end.",
      },
      {
        title: "Codex + Cursor skill ports",
        status: "in-progress",
        copy: "Same playbooks, mirrored into Codex's AGENTS.md format and Cursor's rules layer. Skill discipline travels with the agent, not the IDE.",
      },
      {
        title: "Skill marketplace install",
        status: "planned",
        copy: "`ralphy skill install <pack>` for community-authored playbooks. Versioned, scoped, sandboxed — installing a skill never executes code on read.",
      },
      {
        title: "Web Studio (human fallback)",
        status: "planned",
        copy: "Drag-drop reference, preview, render — for the rare humans who'd rather click than chat. Secondary surface, never the canonical one.",
      },
    ],
  },
  {
    n: "05",
    slug: "pipeline-distribution",
    title: "Pipeline & distribution",
    why: "Between “mp4 ready” and “like landed” there should be zero of your minutes. Today render happens; everything between render and audience is still manual.",
    items: [
      {
        title: "Batch-from-template (N≥10)",
        status: "done",
        copy: "`ralphy batch-from-template` ships variant grids without a hand-held loop. Per-render cost + quality logged for rollup.",
      },
      {
        title: "Cost tracking per render",
        status: "done",
        copy: "Every model call (image / video / VO / music) writes input, output, and cost to generations.jsonl — total spend per project is a single jq away.",
      },
      {
        title: "ralphy doctor + status",
        status: "done",
        copy: "One-command health check: keys, deps, render env, model availability — surfaces what's broken before the first render fails.",
      },
      {
        title: "Cross-platform install (brew / curl / npm / ps1)",
        status: "done",
        copy: "macOS, Linux, Windows — same binary, four install paths, all referencing the same GitHub Release. install.sh handles quarantine + PATH automatically.",
      },
      {
        title: "Cloud rendering",
        status: "in-progress",
        copy: "Remotion Lambda / serverless GPU — the laptop fan stops, render time decouples from your hardware, batches finish overnight.",
      },
      {
        title: "Analytics fetch from platforms",
        status: "in-progress",
        copy: "Pull views, watch-time, CTR from TikTok / Reels / Shorts back into `ralphy iterate` — feeds the next render decision automatically.",
      },
      {
        title: "Auto-publish (scheduled)",
        status: "planned",
        copy: "Scheduled posting via TikTok / Reels / Shorts APIs. Metrics flow back into the project log; the loop closes itself.",
      },
      {
        title: "A/B in-flight",
        status: "planned",
        copy: "Two hooks per batch, performance-weighted, winning variants automatically promoted to a template for future runs.",
      },
      {
        title: "Cost guardrails + auto-fallback",
        status: "planned",
        copy: "Per-project budget cap; when threshold trips, the agent auto-fallbacks to a cheaper model + reports before continuing the batch.",
      },
    ],
  },
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
