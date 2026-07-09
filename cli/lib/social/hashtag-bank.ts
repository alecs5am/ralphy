// Per-niche trending-hashtag bank (#403).
//
// A maintained map of niche/format → a curated, deduped, ordered tag set. The
// `ralphy unit caption` verb merges these tags into the platform-shaped copy
// the LLM drafts (the LLM supplies the on-voice description; this bank supplies
// the reach-driving tag spine). The `social-copy` skill is the agent-facing
// craft layer that reasons about which niche applies.
//
// ─── STALENESS — read before trusting this list ──────────────────────────────
//
// Trend hashtags ROT. A tag that drives reach this quarter is dead the next.
// This file is a *curated baseline*, NOT a live trend feed and NOT permanent:
//
//   • BROAD_REACH tags (#fyp, #viral, …) are the most stable — they almost never
//     go stale, so they anchor every set.
//   • FORMAT + NICHE tags drift on a ~monthly cadence as a niche's vocabulary
//     shifts. Treat anything in those buckets as "best known as of LAST_REVIEWED".
//   • The `LAST_REVIEWED` constant below stamps the last manual refresh. When it
//     is > ~60 days old, REFRESH before shipping copy for a hot niche:
//       1. light path — run the `researcher` skill / a trend scrape on the niche
//          + platform, read the current top tags, and update the bucket here.
//       2. manual path — open the niche's top-performing recent posts and copy
//          the tags they actually rank under.
//     Then bump `LAST_REVIEWED` and (optionally) add a one-line note to the niche
//     entry. Never hardcode a frozen list as if it were permanent.
//
// English-only-on-disk (developing-ralphy.md): every tag here is ASCII. The
// caption COPY may be authored in the target-audience language at runtime, but
// the on-disk tag tables stay English.

/** ISO date of the last manual review of the niche/format tag buckets. */
export const LAST_REVIEWED = "2026-06-14";

/** Days after which the trend buckets should be refreshed before shipping. */
export const STALE_AFTER_DAYS = 60;

/**
 * Broad-reach tags appended to (almost) every set. The most stable bucket —
 * platform-discovery tags that rarely rot. Kept short so they don't crowd out
 * the niche-specific spine.
 */
export const BROAD_REACH_TAGS = [
  "#fyp",
  "#foryou",
  "#foryoupage",
  "#viral",
  "#trending",
] as const;

/**
 * Format tags keyed by the media format / shape of the deliverable. These ride
 * along with whatever niche the content is in (a horror reel is still a #reel).
 * Format keys mirror common platform vocabulary, not the internal UNIT_FORMATS.
 */
export const FORMAT_TAGS: Record<string, string[]> = {
  reel: ["#reels", "#reelsinstagram", "#instareels"],
  short: ["#shorts", "#youtubeshorts", "#shortvideo"],
  tiktok: ["#tiktok", "#tiktokviral"],
  video: ["#video", "#contentcreator"],
  carousel: ["#carousel", "#swipe", "#carrousel"],
  poster: ["#poster", "#keyart", "#design"],
  image: ["#art", "#aiart"],
  article: ["#blog", "#seo", "#longform"],
};

/**
 * Niche tag banks. Each niche maps to its curated spine: the niche's own
 * vocabulary first (most intentional / specific), broad-niche-adjacent tags
 * after. The `unit caption` merge adds FORMAT_TAGS + BROAD_REACH_TAGS on top
 * and dedupes, so do NOT repeat #fyp etc. here.
 *
 * Niche keys are kebab-case and are matched against the #412 content-mode and
 * the unit's tags/provenance by `resolveNicheKey()`.
 */
export const NICHE_TAGS: Record<string, string[]> = {
  // The "aura moment" / brainrot meme register (the originating use case, #403).
  aura: [
    "#auramoment",
    "#aura",
    "#aurapoints",
    "#ps1core",
    "#brainrot",
    "#meme",
    "#sigma",
    "#edit",
  ],
  // Analog-horror / PSA / liminal-creepy shorts.
  "analog-horror": [
    "#analoghorror",
    "#horror",
    "#horrortok",
    "#creepy",
    "#liminalspace",
    "#backrooms",
    "#scary",
    "#unsettling",
  ],
  // PS1/PS2 retro-3D horror, choose-your-path branching shorts.
  "ps1-horror": [
    "#ps1horror",
    "#ps1core",
    "#retrohorror",
    "#horrorgaming",
    "#chooseyourpath",
    "#survivalhorror",
    "#horrortok",
  ],
  // Faceless dev / tech essays + explainers.
  "tech-explainer": [
    "#tech",
    "#coding",
    "#programming",
    "#developer",
    "#softwareengineer",
    "#techtok",
    "#ai",
    "#buildinpublic",
  ],
  // UGC product reviews / DTC ad creators.
  "ugc-ad": [
    "#ugc",
    "#ugccreator",
    "#tiktokmademebuyit",
    "#productreview",
    "#smallbusiness",
    "#founditonamazon",
  ],
  // Unboxing / haul / first-impressions.
  unboxing: [
    "#unboxing",
    "#asmrunboxing",
    "#haul",
    "#firstimpressions",
    "#tiktokmademebuyit",
    "#newdrop",
  ],
  // Beauty / skincare DTC.
  beauty: [
    "#skincare",
    "#beauty",
    "#skincareroutine",
    "#beautytok",
    "#glowup",
    "#makeup",
  ],
  // Fitness / wellness.
  fitness: [
    "#fitness",
    "#gym",
    "#workout",
    "#fittok",
    "#gymtok",
    "#fitnessmotivation",
  ],
  // Food / recipe / cooking.
  food: [
    "#food",
    "#foodtok",
    "#recipe",
    "#cooking",
    "#easyrecipe",
    "#foodie",
  ],
  // B2B SaaS / startup / professional brand register.
  saas: [
    "#saas",
    "#startup",
    "#b2b",
    "#productivity",
    "#tech",
    "#founder",
  ],
  // Generic fallback when no niche resolves — keep it minimal + broad.
  general: [
    "#contentcreator",
    "#creator",
    "#explore",
  ],
};

/** A niche key the bank knows about. */
export type NicheKey = keyof typeof NICHE_TAGS;

/** A format key the bank knows about. */
export type FormatKey = keyof typeof FORMAT_TAGS;

/**
 * Map a free-text niche / content-mode / tag hint onto a known niche key.
 * Deterministic + substring-based — the agent (via the social-copy skill) is
 * the smart layer; this is the floor. Returns "general" when nothing matches.
 */
export function resolveNicheKey(hint: string | undefined | null): NicheKey {
  const h = (hint ?? "").toLowerCase();
  if (!h) return "general";
  // Direct key hit first.
  if (h in NICHE_TAGS) return h as NicheKey;
  // Substring / synonym routing (most specific first).
  const routes: Array<[RegExp, NicheKey]> = [
    [/aura|brainrot|sigma|meme/, "aura"],
    [/analog[\s-]?horror|psa|liminal|backrooms?/, "analog-horror"],
    [/ps1|ps2|retro[\s-]?horror|choose[\s-]?your|survival[\s-]?horror/, "ps1-horror"],
    [/tech|dev|coding|programming|software|explainer|podcast/, "tech-explainer"],
    [/unbox|haul|first[\s-]?impression/, "unboxing"],
    [/ugc|review|testimonial|dtc/, "ugc-ad"],
    [/beauty|skincare|makeup|cosmet/, "beauty"],
    [/fitness|gym|workout|wellness/, "fitness"],
    [/food|recipe|cook|kitchen/, "food"],
    [/saas|b2b|startup|founder|enterprise/, "saas"],
  ];
  for (const [re, key] of routes) {
    if (re.test(h)) return key;
  }
  return "general";
}

/**
 * Map a platform / media-format hint onto a known format-tag key. Returns null
 * when nothing matches (the merge then skips format tags rather than guessing).
 */
export function resolveFormatKey(hint: string | undefined | null): FormatKey | null {
  const h = (hint ?? "").toLowerCase();
  if (!h) return null;
  if (h in FORMAT_TAGS) return h as FormatKey;
  if (/reel/.test(h)) return "reel";
  if (/short/.test(h)) return "short";
  if (/tiktok|tt/.test(h)) return "tiktok";
  if (/carousel|swipe|deck/.test(h)) return "carousel";
  if (/poster|flyer|key.?art/.test(h)) return "poster";
  if (/article|blog|post/.test(h)) return "article";
  if (/image|still|photo|art/.test(h)) return "image";
  if (/video/.test(h)) return "video";
  return null;
}

export interface BankTagsOptions {
  /** Niche / content-mode / register hint (routed via resolveNicheKey). */
  niche?: string;
  /** Platform / format hint (routed via resolveFormatKey). May be a platform name. */
  format?: string;
  /** Whether to append the broad-reach tags. Default true. */
  broadReach?: boolean;
  /** Cap on the returned tag count (after dedupe). Default 18. */
  limit?: number;
}

/**
 * Build the merged, deduped, ordered tag set for a niche + format. Order is
 * intentional: niche spine first (most specific / on-topic), then format tags,
 * then broad-reach. Dedupe is case-insensitive; the first occurrence wins.
 */
export function bankTags(opts: BankTagsOptions = {}): string[] {
  const niche = resolveNicheKey(opts.niche);
  const fmtKey = resolveFormatKey(opts.format);
  const broad = opts.broadReach !== false;
  const limit = opts.limit ?? 18;

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (tag: string) => {
    const norm = tag.toLowerCase();
    if (seen.has(norm)) return;
    seen.add(norm);
    ordered.push(tag);
  };

  for (const t of NICHE_TAGS[niche] ?? []) push(t);
  if (fmtKey) for (const t of FORMAT_TAGS[fmtKey] ?? []) push(t);
  if (broad) for (const t of BROAD_REACH_TAGS) push(t);

  return ordered.slice(0, limit);
}

/** True when the bank's trend buckets are older than the staleness window. */
export function isBankStale(now: Date = new Date()): boolean {
  const reviewed = new Date(LAST_REVIEWED).getTime();
  if (!Number.isFinite(reviewed)) return true;
  const ageDays = (now.getTime() - reviewed) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_AFTER_DAYS;
}
