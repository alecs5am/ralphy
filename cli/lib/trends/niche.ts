// On-demand niche onboarding (#576) — pure decision logic, no I/O.
//
// `ralphy trends niche init "<topic>"` turns a topic into a first-class open
// niche: seeds (agent-authored file by default, one optional callLLM() call,
// or a deterministic topic fallback), snowballed creator discovery on free
// sources, a relevance gate on each creator's last 30 videos, size-band
// quotas, a negative control group, and anomaly flags. The rules below are
// the testable core; `niche-onboard.ts` runs them against the store and the
// sources, `niche-report.ts` reads the result.
//
// Dataset contract: docs/research/trend-dataset-spec.md.

import { isTrendPlatform, median, type SizeBand, type TrendPlatform } from "./math.js";
import { captionKey, creatorLanguage, guessLanguage, matchTerms, normalizeText, type LanguageGuess } from "./text.js";
import { isLabelPercentiles, type LabelPercentiles } from "./thresholds.js";

// ─── Seeds, taxonomy, settings ──────────────────────────────────────────────

export const NICHE_SEED_KINDS = ["keyword", "hashtag", "sound", "creator", "explore-category"] as const;
export type NicheSeedKind = (typeof NICHE_SEED_KINDS)[number];

export interface NicheSeed {
  platform: TrendPlatform;
  kind: NicheSeedKind;
  value: string;
  language: string | null;
  subNiche: string | null;
}

export interface SubNicheDef {
  slug: string;
  label: string;
  /** Lexicon terms (keywords, hashtag forms; `stem*` = prefix match). */
  terms: string[];
}

export interface NicheLexicon {
  /** One match makes a video on-topic. */
  core: string[];
  /** Half weight each: two matches make a video on-topic. */
  support: string[];
  /** A match with fewer than two core hits makes a video off-topic. */
  negative: string[];
  /**
   * Terms that, in a bio or name, state the creator works in the topic
   * (professions, the topic itself). Optional: without them a profile
   * anchors only with two distinct core terms.
   */
  profile?: string[];
}

export interface NicheTaxonomy {
  subNiches: SubNicheDef[];
  /** Lexicon per language code (en, ru, ...). */
  lexicon: Record<string, NicheLexicon>;
}

export interface NicheSettings {
  /** Relevant creators wanted per language. */
  targetCreators: number;
  relevanceThreshold: number;
  /** A bio or name that states the topic keeps a creator from this on-topic share (0 = off). */
  profileRelevanceFloor: number;
  gateSample: number;
  minGateSample: number;
  noiseFloorViews: number;
  negativeShare: number;
  /** Kept creators per language in the analysis set (stratified by quota band); the rest are `out-of-sample`. */
  sampleCap: number;
  maxRounds: number;
  timeBudgetMinutes: number;
  labelPercentiles?: LabelPercentiles;
}

export const DEFAULT_NICHE_SETTINGS: Readonly<NicheSettings> = {
  targetCreators: 300,
  relevanceThreshold: 0.6,
  profileRelevanceFloor: 0.4,
  gateSample: 30,
  minGateSample: 8,
  noiseFloorViews: 50_000,
  negativeShare: 0.175,
  sampleCap: 400,
  maxRounds: 4,
  timeBudgetMinutes: 45,
};

export interface NicheSeedFile {
  topic: string;
  slug: string;
  parentNiche: string | null;
  languages: string[];
  platforms: TrendPlatform[];
  taxonomy: NicheTaxonomy;
  seeds: NicheSeed[];
  settings: Partial<NicheSettings>;
}

export function slugifyNiche(topic: string): string {
  const slug = topic
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "niche";
}

const LANGUAGE = /^[a-z]{2}$/;

function stringList(value: unknown, field: string, max = 400): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error(`${field} must contain only strings`);
    const trimmed = item.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  if (out.length > max) throw new Error(`${field} has more than ${max} entries`);
  return out;
}

function lexiconOf(value: unknown, field: string): NicheLexicon {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object with core / support / negative term lists`);
  const record = value as Record<string, unknown>;
  const lexicon: NicheLexicon = {
    core: stringList(record.core, `${field}.core`),
    support: stringList(record.support, `${field}.support`),
    negative: stringList(record.negative, `${field}.negative`),
  };
  if (record.profile !== undefined) lexicon.profile = stringList(record.profile, `${field}.profile`);
  if (lexicon.core.length === 0) throw new Error(`${field}.core needs at least one term`);
  return lexicon;
}

/**
 * Validate a seeds file (agent-authored JSON). Shape:
 * { topic, slug?, parentNiche?, languages: ["en"], platforms?: ["tiktok","youtube"],
 *   lexicon: { en: { core: [], support: [], negative: [] } },
 *   subNiches: [{ slug, label, terms: [] }],
 *   seeds: [{ platform, kind, value, language?, subNiche? }], settings? }
 */
export function parseNicheSeedFile(raw: unknown, fallback: { topic?: string; languages?: string[]; platforms?: TrendPlatform[] } = {}): NicheSeedFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("seeds file must be a JSON object");
  const record = raw as Record<string, unknown>;
  const topic = typeof record.topic === "string" && record.topic.trim() ? record.topic.trim() : fallback.topic?.trim() ?? "";
  if (!topic) throw new Error("seeds file needs a topic");
  const languages = record.languages === undefined ? fallback.languages ?? ["en"] : stringList(record.languages, "languages").map((lang) => lang.toLowerCase());
  if (languages.length === 0 || languages.some((lang) => !LANGUAGE.test(lang))) throw new Error("languages must be ISO 639-1 codes such as en or ru");
  const platforms = (record.platforms === undefined ? fallback.platforms ?? ["tiktok", "youtube"] : stringList(record.platforms, "platforms")) as string[];
  if (platforms.some((platform) => !isTrendPlatform(platform))) throw new Error("platforms must be tiktok, youtube, or instagram");
  const lexiconRaw = record.lexicon;
  if (!lexiconRaw || typeof lexiconRaw !== "object" || Array.isArray(lexiconRaw)) throw new Error("lexicon must map each language to { core, support, negative }");
  const lexicon: Record<string, NicheLexicon> = {};
  for (const lang of languages) {
    const entry = (lexiconRaw as Record<string, unknown>)[lang];
    if (entry === undefined) throw new Error(`lexicon has no entry for language ${lang}`);
    lexicon[lang] = lexiconOf(entry, `lexicon.${lang}`);
  }
  const subNiches: SubNicheDef[] = [];
  if (record.subNiches !== undefined) {
    if (!Array.isArray(record.subNiches)) throw new Error("subNiches must be an array");
    for (const [index, entry] of (record.subNiches as unknown[]).entries()) {
      if (!entry || typeof entry !== "object") throw new Error(`subNiches[${index}] must be an object`);
      const item = entry as Record<string, unknown>;
      const slug = typeof item.slug === "string" ? slugifyNiche(item.slug) : "";
      if (!slug || slug === "general") throw new Error(`subNiches[${index}].slug is missing or reserved`);
      if (subNiches.some((existing) => existing.slug === slug)) throw new Error(`duplicate sub-niche ${slug}`);
      const terms = stringList(item.terms, `subNiches[${index}].terms`);
      if (terms.length === 0) throw new Error(`subNiches[${index}].terms needs at least one term`);
      subNiches.push({ slug, label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : slug, terms });
    }
  }
  const seeds: NicheSeed[] = [];
  if (!Array.isArray(record.seeds) || record.seeds.length === 0) throw new Error("seeds must be a non-empty array");
  for (const [index, entry] of (record.seeds as unknown[]).entries()) {
    if (!entry || typeof entry !== "object") throw new Error(`seeds[${index}] must be an object`);
    const item = entry as Record<string, unknown>;
    if (!isTrendPlatform(item.platform)) throw new Error(`seeds[${index}].platform must be tiktok, youtube, or instagram`);
    if (typeof item.kind !== "string" || !(NICHE_SEED_KINDS as readonly string[]).includes(item.kind)) {
      throw new Error(`seeds[${index}].kind must be one of ${NICHE_SEED_KINDS.join(", ")}`);
    }
    const value = typeof item.value === "string" ? item.value.trim().replace(item.kind === "hashtag" ? /^#/ : /^$/, "") : "";
    if (!value || value.length > 512) throw new Error(`seeds[${index}].value is missing or too long`);
    const language = typeof item.language === "string" ? item.language.toLowerCase() : null;
    if (language !== null && !languages.includes(language)) throw new Error(`seeds[${index}].language ${language} is not one of the niche languages`);
    const subNiche = typeof item.subNiche === "string" ? slugifyNiche(item.subNiche) : null;
    seeds.push({ platform: item.platform, kind: item.kind as NicheSeedKind, value, language, subNiche });
  }
  const settings: Partial<NicheSettings> = {};
  if (record.settings && typeof record.settings === "object") {
    const given = record.settings as Record<string, unknown>;
    for (const key of ["targetCreators", "gateSample", "minGateSample", "noiseFloorViews", "maxRounds", "timeBudgetMinutes", "sampleCap"] as const) {
      if (given[key] !== undefined) {
        const number = Number(given[key]);
        if (!Number.isFinite(number) || number <= 0) throw new Error(`settings.${key} must be a positive number`);
        settings[key] = number;
      }
    }
    for (const key of ["relevanceThreshold", "negativeShare", "profileRelevanceFloor"] as const) {
      if (given[key] !== undefined) {
        const number = Number(given[key]);
        if (!Number.isFinite(number) || number <= 0 || number >= 1) throw new Error(`settings.${key} must be between 0 and 1`);
        settings[key] = number;
      }
    }
    if (given.labelPercentiles !== undefined) {
      if (!isLabelPercentiles(given.labelPercentiles)) throw new Error("settings.labelPercentiles must be { breakout, outlier, strong } in (0, 1), descending");
      settings.labelPercentiles = given.labelPercentiles;
    }
  }
  return {
    topic,
    slug: typeof record.slug === "string" && record.slug.trim() ? slugifyNiche(record.slug) : slugifyNiche(topic),
    parentNiche: typeof record.parentNiche === "string" ? record.parentNiche : null,
    languages,
    platforms: platforms as TrendPlatform[],
    taxonomy: { subNiches, lexicon },
    seeds,
    settings,
  };
}

/**
 * Deterministic fallback when neither a seeds file nor `--llm-seeds` is
 * given: the topic as keyword and hashtag seeds and as the only core term.
 * It finds creators, but the gate is only as good as this one-term lexicon,
 * so the command warns and recommends an agent-authored seeds file.
 */
export function defaultNicheSeedFile(topic: string, languages: string[], platforms: TrendPlatform[]): NicheSeedFile {
  const phrase = normalizeText(topic).replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/\s+/g, " ").trim();
  const tag = phrase.replace(/[\s-]+/g, "");
  const seeds: NicheSeed[] = [];
  if (platforms.includes("youtube")) {
    for (const query of [phrase, `${phrase} shorts`, `${phrase} tips`, `${phrase} facts`]) seeds.push({ platform: "youtube", kind: "keyword", value: query, language: null, subNiche: null });
    if (tag) seeds.push({ platform: "youtube", kind: "hashtag", value: tag, language: null, subNiche: null });
  }
  const lexicon: Record<string, NicheLexicon> = {};
  for (const lang of languages) lexicon[lang] = { core: [phrase, ...(tag !== phrase ? [tag] : [])], support: [], negative: [] };
  return { topic, slug: slugifyNiche(topic), parentNiche: null, languages, platforms, taxonomy: { subNiches: [], lexicon }, seeds, settings: {} };
}

/** One callLLM() call proposes the seeds file (behind `--llm-seeds`). */
export function llmSeedPrompt(topic: string, languages: string[], platforms: TrendPlatform[]): { system: string; user: string } {
  return {
    system: [
      "You plan creator discovery for a short-form video niche. Reply with JSON only, matching:",
      '{"subNiches":[{"slug":"kebab-case","label":"...","terms":["..."]}],',
      ' "lexicon":{"<lang>":{"core":["terms that alone make a video on-topic"],"support":["weaker terms"],"negative":["terms that mark an off-topic video"]}},',
      ' "seeds":[{"platform":"youtube|tiktok","kind":"keyword|hashtag|creator","value":"...","language":"<lang>","subNiche":"<slug>"}]}',
      "Write each language's terms and seeds in that language. Use 6-10 sub-niches, 30-80 core terms per language including hashtag spellings without spaces,",
      "20-40 YouTube keyword queries and 10-20 hashtags per language. Add creator seeds only for creators you are confident exist (YouTube @handle or TikTok handle).",
    ].join("\n"),
    user: JSON.stringify({ topic, languages, platforms }),
  };
}

export function parseLlmSeeds(text: string, fallback: { topic: string; languages: string[]; platforms: TrendPlatform[] }): NicheSeedFile {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text) as Record<string, unknown>;
  return parseNicheSeedFile({ ...parsed, topic: fallback.topic, languages: fallback.languages, platforms: fallback.platforms }, fallback);
}

export function nicheSettings(given: Partial<NicheSettings> | undefined): NicheSettings {
  return { ...DEFAULT_NICHE_SETTINGS, ...(given ?? {}) };
}

// ─── Relevance gate ─────────────────────────────────────────────────────────

export interface GateVideo {
  text: string;
  hashtags: string[];
}

export interface GateOptions {
  languages: string[];
  lexicon: Record<string, NicheLexicon>;
  subNiches: SubNicheDef[];
  threshold: number;
  /**
   * Profile-anchored keep: when the bio or name matches a core term, a share
   * at or above this floor keeps the creator (reason `on-topic-profile`).
   * Titles of therapists and coaches are often evocative ("Fawning", "Let
   * them go") and carry no lexicon term; the bio says what the channel is.
   */
  profileFloor?: number;
  /** Videos judged (newest first). */
  sample: number;
  /** Fewer captioned videos than this leaves the creator undetermined. */
  minSample: number;
}

export type GateStatus = "kept" | "dropped" | "undetermined";

export interface GateResult {
  status: GateStatus;
  reason: string;
  relevance: number | null;
  sampled: number;
  textual: number;
  onTopic: number;
  language: LanguageGuess | null;
  subNiche: string | null;
  subNicheConfidence: number | null;
  /** Most frequent matched terms (evidence for a reviewer). */
  matchedTerms: string[];
  /** Core terms matched in the bio / name. */
  profileTerms: string[];
}

export function mergedLexicon(lexicon: Record<string, NicheLexicon>, languages: readonly string[]): NicheLexicon {
  const pick = (key: keyof NicheLexicon) => [...new Set(languages.flatMap((lang) => lexicon[lang]?.[key] ?? []))];
  const profile = pick("profile");
  return { core: pick("core"), support: pick("support"), negative: pick("negative"), ...(profile.length > 0 ? { profile } : {}) };
}

/** Profile terms that anchor the topic: any `profile` term, else two distinct core terms. */
export function profileAnchors(profileText: string | null | undefined, lexicon: NicheLexicon): string[] {
  if (!profileText) return [];
  if (lexicon.profile && lexicon.profile.length > 0) return matchTerms(profileText, lexicon.profile);
  const core = matchTerms(profileText, lexicon.core);
  return core.length >= 2 ? core : [];
}

const hasLetters = (text: string) => ((text.match(/\p{L}/gu) ?? []).length >= 3);

export function videoText(video: GateVideo): string {
  return [video.text, ...video.hashtags.map((tag) => `#${tag}`)].join(" ");
}

/** Topic weight of one video: core terms 1 each, support 0.5 each; negative terms veto weak matches. */
export function videoTopicScore(video: GateVideo, lexicon: NicheLexicon): { weight: number; matched: string[]; onTopic: boolean } {
  const text = videoText(video);
  const core = matchTerms(text, lexicon.core);
  const support = matchTerms(text, lexicon.support);
  const negative = matchTerms(text, lexicon.negative);
  const weight = core.length + 0.5 * support.length;
  const onTopic = weight >= 1 && !(negative.length > 0 && core.length < 2);
  return { weight, matched: [...core, ...support], onTopic };
}

/**
 * Keep a creator when at least `threshold` of the captioned videos among the
 * newest `sample` are on-topic. A creator whose language is known and not a
 * niche language is dropped; one with too few captioned videos stays
 * undetermined (not kept, not dropped).
 */
export function gateCreator(input: { videos: GateVideo[]; profileText?: string | null; preferProfileLanguage?: boolean }, options: GateOptions): GateResult {
  const videos = input.videos.slice(0, options.sample);
  const guesses = videos.map((video) => guessLanguage(video.text));
  // Captions first; a bio in a clear language decides when captions cannot,
  // and wins outright when `preferProfileLanguage` is set (YouTube: yt-dlp
  // asks for English, so creator-provided title translations read as English).
  const captionLanguage = creatorLanguage(guesses);
  const profileLanguage = videos.length > 0 ? guessLanguage(input.profileText) : null;
  const language = input.preferProfileLanguage && profileLanguage && profileLanguage !== "other" ? profileLanguage : captionLanguage ?? profileLanguage;
  const textual = videos.filter((video) => hasLetters(videoText(video)));
  const profileLexicon = mergedLexicon(options.lexicon, options.languages);
  const profileTerms = profileAnchors(input.profileText, profileLexicon);
  const base = { sampled: videos.length, textual: textual.length, language, profileTerms };
  if (videos.length === 0) {
    return { ...base, status: "undetermined", reason: "no-videos", relevance: null, onTopic: 0, subNiche: null, subNicheConfidence: null, matchedTerms: [] };
  }
  if (language && !options.languages.includes(language)) {
    return { ...base, status: "dropped", reason: `language-${language}`, relevance: null, onTopic: 0, subNiche: null, subNicheConfidence: null, matchedTerms: [] };
  }
  const lexicon = language ? mergedLexicon(options.lexicon, [language]) : profileLexicon;
  const termCounts = new Map<string, number>();
  const subVotes = new Map<string, number>();
  let onTopic = 0;
  for (const video of textual) {
    const score = videoTopicScore(video, lexicon);
    if (!score.onTopic) continue;
    onTopic += 1;
    for (const term of score.matched) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
    const text = videoText(video);
    for (const sub of options.subNiches) if (matchTerms(text, sub.terms).length > 0) subVotes.set(sub.slug, (subVotes.get(sub.slug) ?? 0) + 1);
  }
  const matchedTerms = [...termCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([term]) => term);
  const sub = assignSubNiche(subVotes, onTopic);
  if (textual.length < options.minSample) {
    return { ...base, status: "undetermined", reason: "too-few-captions", relevance: textual.length > 0 ? round(onTopic / textual.length) : null, onTopic, ...sub, matchedTerms };
  }
  const relevance = round(onTopic / textual.length);
  if (relevance >= options.threshold) return { ...base, status: "kept", reason: "on-topic", relevance, onTopic, ...sub, matchedTerms };
  const floor = options.profileFloor ?? 0;
  if (floor > 0 && profileTerms.length > 0 && relevance >= floor) {
    return { ...base, status: "kept", reason: "on-topic-profile", relevance, onTopic, ...sub, matchedTerms };
  }
  return { ...base, status: "dropped", reason: "off-topic", relevance, onTopic, ...sub, matchedTerms };
}

/** Sub-niche with the most on-topic video votes (at least 2 and 25% of on-topic videos), else `general`. */
export function assignSubNiche(votes: ReadonlyMap<string, number>, onTopic: number): { subNiche: string | null; subNicheConfidence: number | null } {
  if (onTopic === 0) return { subNiche: null, subNicheConfidence: null };
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  if (!top || top[1] < 2 || top[1] / onTopic < 0.25) return { subNiche: "general", subNicheConfidence: null };
  return { subNiche: top[0], subNicheConfidence: round(top[1] / onTopic) };
}

const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

// ─── Size-band quotas ───────────────────────────────────────────────────────

/** The dataset spec's four quota bands: <10k, 10k-100k, 100k-1M, 1M+. */
export const QUOTA_BANDS = ["lt10k", "10k-100k", "100k-1m", "1m-plus"] as const;
export type QuotaBand = (typeof QUOTA_BANDS)[number];

export function quotaBandFor(followers: number | null | undefined): QuotaBand | null {
  if (followers === null || followers === undefined || !Number.isFinite(followers) || followers < 0) return null;
  if (followers < 10_000) return "lt10k";
  if (followers < 100_000) return "10k-100k";
  if (followers < 1_000_000) return "100k-1m";
  return "1m-plus";
}

export function quotaBandOfSize(sizeBand: string | null | undefined): QuotaBand | null {
  switch (sizeBand) {
    case "seed":
    case "nano":
      return "lt10k";
    case "micro":
      return "10k-100k";
    case "mid":
    case "macro":
      return "100k-1m";
    case "mega":
      return "1m-plus";
    default:
      return null;
  }
}

export interface QuotaRow {
  band: QuotaBand;
  quota: number;
  kept: number;
  deficit: number;
}

/** Roughly equal quotas per band; small bands may exceed theirs (over-sampling is wanted). */
export function quotaStatus(followers: ReadonlyArray<number | null>, target: number): QuotaRow[] {
  const quota = Math.ceil(Math.max(0, target) / QUOTA_BANDS.length);
  const counts = new Map<QuotaBand, number>();
  for (const value of followers) {
    const band = quotaBandFor(value);
    if (band) counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return QUOTA_BANDS.map((band) => {
    const kept = counts.get(band) ?? 0;
    return { band, quota, kept, deficit: Math.max(0, quota - kept) };
  });
}

/** Candidates in under-filled bands first (largest deficit first), unknown size next, filled bands last; stable. */
export function prioritizeByQuota<T extends { followers: number | null }>(items: readonly T[], status: readonly QuotaRow[]): T[] {
  const deficit = new Map(status.map((row) => [row.band, row.deficit]));
  const rank = (item: T): number => {
    const band = quotaBandFor(item.followers);
    if (!band) return 0.5;
    const gap = deficit.get(band) ?? 0;
    return gap > 0 ? 1 + gap : 0;
  };
  return items.map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Analysis set of at most `cap` creators, stratified by quota band: up to
 * cap / 4 per band first, then the remaining slots round-robin over the bands
 * (small bands first) from what is left. Within a band, TikTok creators come
 * first (their videos are dated and scorable), then higher relevance. The
 * rest stay stored and are marked out-of-sample, never deleted.
 */
export function selectAnalysisSample<T extends { creatorId: string; followers: number | null; platform: string; relevance: number | null }>(members: readonly T[], cap: number): Set<string> {
  const order = (a: T, b: T) =>
    Number(b.platform === "tiktok") - Number(a.platform === "tiktok") || (b.relevance ?? 0) - (a.relevance ?? 0) || a.creatorId.localeCompare(b.creatorId);
  const pools = new Map<string, T[]>([...QUOTA_BANDS, "unknown"].map((band) => [band, [] as T[]]));
  for (const member of members) pools.get(quotaBandFor(member.followers) ?? "unknown")!.push(member);
  for (const pool of pools.values()) pool.sort(order);
  const selected = new Set<string>();
  const perBand = Math.floor(cap / QUOTA_BANDS.length);
  for (const band of QUOTA_BANDS) for (const member of pools.get(band)!.splice(0, perBand)) selected.add(member.creatorId);
  const rest = [...QUOTA_BANDS, "unknown"];
  while (selected.size < cap && rest.some((band) => pools.get(band)!.length > 0)) {
    for (const band of rest) {
      if (selected.size >= cap) break;
      const next = pools.get(band)!.shift();
      if (next) selected.add(next.creatorId);
    }
  }
  return selected;
}

// ─── Snowball stop rule ─────────────────────────────────────────────────────

export const SNOWBALL_MIN_GROWTH = 0.05;

export interface SnowballState {
  /** Rounds completed (0 = only the seed round ran). */
  round: number;
  maxRounds: number;
  keptBefore: number;
  keptAfter: number;
  target: number;
  elapsedMs: number;
  budgetMs: number;
  /** Expansion seeds available for the next round. */
  nextSeeds: number;
  minGrowth?: number;
}

/**
 * Stop at the target, when a round adds under 5% new relevant creators, when
 * nothing is left to expand, at the round cap, or at the wall-time budget.
 * The seed round (round 0) never stops on the growth rule.
 */
export function snowballDecision(state: SnowballState): { stop: boolean; reason: string } {
  if (state.keptAfter >= state.target) return { stop: true, reason: "target-reached" };
  if (state.elapsedMs >= state.budgetMs) return { stop: true, reason: "time-budget" };
  if (state.round >= state.maxRounds) return { stop: true, reason: "max-rounds" };
  const growth = (state.keptAfter - state.keptBefore) / Math.max(1, state.keptBefore);
  if (state.round > 0 && growth < (state.minGrowth ?? SNOWBALL_MIN_GROWTH)) return { stop: true, reason: "growth-below-5pct" };
  if (state.nextSeeds === 0) return { stop: true, reason: "no-expansion-seeds" };
  return { stop: false, reason: "continue" };
}

// ─── Expansion seeds ────────────────────────────────────────────────────────

export const GENERIC_HASHTAGS = new Set([
  "fyp", "fy", "foryou", "foryoupage", "fypage", "viral", "viralvideo", "trending", "trend", "shorts", "short", "youtubeshorts",
  "ytshorts", "shortsvideo", "shortvideo", "shortsfeed", "tiktok", "reels", "reel", "explore", "explorepage", "capcut", "duet",
  "stitch", "greenscreen", "xyzbca", "parati", "viralshorts", "subscribe", "like", "comment", "share", "follow", "love", "life",
  "funny", "motivation", "inspiration", "facts", "fact", "video", "new", "today", "learn", "learnontiktok", "edutok", "education",
  "podcast", "podcastclips", "clips", "story", "storytime", "pov", "relatable", "fypシ", "foryourpage", "recommendations",
]);

/**
 * Co-hashtags of kept creators as the next round's hashtag seeds: used by at
 * least `minCreators` distinct kept creators, not generic, not used yet, and
 * containing a lexicon term (so the snowball stays on topic).
 */
export function expansionHashtags(
  tagsByCreator: ReadonlyArray<readonly string[]>,
  used: ReadonlySet<string>,
  terms: readonly string[],
  options: { limit: number; minCreators?: number },
): string[] {
  const stems = terms.map((term) => normalizeText(term).replace(/\*$/, "").replace(/[\s_-]+/g, "")).filter((stem) => stem.length >= 3);
  const counts = new Map<string, number>();
  for (const tags of tagsByCreator) {
    for (const tag of new Set(tags.map((value) => normalizeText(value).replace(/^#/, "")))) {
      if (!tag || tag.length < 3 || tag.length > 60 || GENERIC_HASHTAGS.has(tag) || used.has(tag)) continue;
      if (!stems.some((stem) => tag.includes(stem))) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= (options.minCreators ?? 2))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, options.limit)
    .map(([tag]) => tag);
}

// ─── Negative control group ─────────────────────────────────────────────────

export interface PerformanceVideo {
  postedAt: number;
  multiplier: number | null;
  label: string | null;
  /** Projected views below the cohort median (platform x niche x size), null when unknown. */
  belowCohort: boolean | null;
}

export interface CreatorPerformance {
  creatorId: string;
  quotaBand: QuotaBand | null;
  videos: PerformanceVideo[];
  followerSeries: Array<{ asOf: number; followers: number }>;
}

export interface NegativeRules {
  windowDays: number;
  minPosts30d: number;
  minScored: number;
  persistentShare: number;
  nearMissMultiplier: number;
  /** Follower growth per 30 days at or below this reads as flat. */
  flatGrowth: number;
}

export const DEFAULT_NEGATIVE_RULES: Readonly<NegativeRules> = {
  windowDays: 60,
  minPosts30d: 6,
  minScored: 6,
  persistentShare: 0.75,
  nearMissMultiplier: 3,
  flatGrowth: 0.05,
};

export interface NegativeEligibility {
  eligible: boolean;
  /** Fewer than `windowDays` of follower snapshots: selected from backfill, re-check later. */
  provisional: boolean;
  reasons: string[];
  belowShare: number | null;
  posts30d: number;
  followerGrowth30d: number | null;
}

const DAY = 86_400_000;

/**
 * Metrics-only rule (dataset spec): active, frequent (6+ posts in 30 days),
 * persistently below the cohort median (75%+ of the 60-day window), no
 * breakout or near-miss (multiplier >= 3 or a strong-or-better label), flat
 * follower growth. Without 60 days of follower history the growth check is
 * deferred and the selection is `provisional`.
 */
export function negativeEligibility(perf: CreatorPerformance, now: number, rules: NegativeRules = DEFAULT_NEGATIVE_RULES): NegativeEligibility {
  const reasons: string[] = [];
  const posts30d = perf.videos.filter((video) => now - video.postedAt <= 30 * DAY).length;
  const window = perf.videos.filter((video) => now - video.postedAt <= rules.windowDays * DAY);
  const judged = window.filter((video) => video.belowCohort !== null);
  const belowShare = judged.length > 0 ? judged.filter((video) => video.belowCohort).length / judged.length : null;
  if (posts30d < rules.minPosts30d) reasons.push(`posts-30d-${posts30d}`);
  if (judged.length < rules.minScored) reasons.push(`judged-${judged.length}`);
  if (belowShare === null || belowShare < rules.persistentShare) reasons.push("not-persistently-below");
  if (window.some((video) => (video.multiplier ?? 0) >= rules.nearMissMultiplier || video.label === "breakout" || video.label === "outlier" || video.label === "strong")) {
    reasons.push("has-breakout-or-near-miss");
  }
  const series = [...perf.followerSeries].sort((a, b) => a.asOf - b.asOf);
  const spanDays = series.length >= 2 ? (series.at(-1)!.asOf - series[0]!.asOf) / DAY : 0;
  let followerGrowth30d: number | null = null;
  if (spanDays >= 7 && series[0]!.followers > 0) {
    followerGrowth30d = ((series.at(-1)!.followers - series[0]!.followers) / series[0]!.followers) * (30 / spanDays);
    if (followerGrowth30d > rules.flatGrowth) reasons.push("follower-growth");
  }
  return {
    eligible: reasons.length === 0,
    provisional: spanDays < rules.windowDays,
    reasons,
    belowShare: belowShare === null ? null : round(belowShare),
    posts30d,
    followerGrowth30d: followerGrowth30d === null ? null : round(followerGrowth30d),
  };
}

/**
 * Size-matched selection: `share` of the kept creators, split across quota
 * bands in proportion to the kept distribution, most persistently below
 * first. A band without enough eligible creators stays short (no refill from
 * other bands, which would break the size match).
 */
export function selectNegativeGroup(
  eligible: ReadonlyArray<{ creatorId: string; quotaBand: QuotaBand | null; belowShare: number }>,
  keptBands: ReadonlyMap<QuotaBand, number>,
  share: number,
): { selected: string[]; target: number; byBand: Record<string, { target: number; selected: number }> } {
  const keptTotal = [...keptBands.values()].reduce((sum, value) => sum + value, 0);
  const target = Math.round(keptTotal * share);
  const selected: string[] = [];
  const byBand: Record<string, { target: number; selected: number }> = {};
  for (const band of QUOTA_BANDS) {
    const bandTarget = keptTotal === 0 ? 0 : Math.round((target * (keptBands.get(band) ?? 0)) / keptTotal);
    const pool = eligible.filter((entry) => entry.quotaBand === band).sort((a, b) => b.belowShare - a.belowShare || a.creatorId.localeCompare(b.creatorId));
    const picks = pool.slice(0, bandTarget);
    selected.push(...picks.map((entry) => entry.creatorId));
    byBand[band] = { target: bandTarget, selected: picks.length };
  }
  return { selected, target, byBand };
}

// ─── Anomaly flags ──────────────────────────────────────────────────────────

const COMPILATION_NAME = /\b(clips?|compilations?|reposts?|reupload(?:s|ed)?|best of|highlights?|fan ?page|archive|daily dose|podcast clips)\b/i;

export function compilationName(handle: string | null, displayName: string | null): boolean {
  const text = `${handle ?? ""} ${displayName ?? ""}`.replace(/[._]+/g, " ");
  return COMPILATION_NAME.test(text);
}

/** Share of each creator's captions that another creator also posted (normalized caption keys). */
export function duplicateCaptionShares(captionsByCreator: ReadonlyMap<string, readonly string[]>): Map<string, { share: number; considered: number }> {
  const owners = new Map<string, Set<string>>();
  const keysByCreator = new Map<string, string[]>();
  for (const [creatorId, captions] of captionsByCreator) {
    const keys = [...new Set(captions.map((caption) => captionKey(caption)).filter((key): key is string => key !== null))];
    keysByCreator.set(creatorId, keys);
    for (const key of keys) (owners.get(key) ?? owners.set(key, new Set()).get(key)!).add(creatorId);
  }
  const out = new Map<string, { share: number; considered: number }>();
  for (const [creatorId, keys] of keysByCreator) {
    const duplicated = keys.filter((key) => (owners.get(key)?.size ?? 0) >= 2).length;
    out.set(creatorId, { share: keys.length > 0 ? round(duplicated / keys.length) : 0, considered: keys.length });
  }
  return out;
}

/**
 * Engagement-ratio anomaly (possible bought views): the creator's median
 * interactions per view is a robust outlier among the niche's creators
 * (|z| >= 3.5 on the log scale, 20+ creators), or interactions exceed views
 * on 20%+ of its videos.
 */
export function engagementAnomalies(
  creators: ReadonlyArray<{ creatorId: string; medianRate: number | null; impossibleShare: number }>,
): Set<string> {
  const flagged = new Set<string>();
  const logs = creators.filter((entry) => entry.medianRate !== null && entry.medianRate > 0).map((entry) => ({ id: entry.creatorId, value: Math.log(entry.medianRate!) }));
  if (logs.length >= 20) {
    const center = median(logs.map((entry) => entry.value))!;
    const spread = median(logs.map((entry) => Math.abs(entry.value - center)))! * 1.4826;
    if (spread > 0) for (const entry of logs) if (Math.abs(entry.value - center) / spread >= 3.5) flagged.add(entry.id);
  }
  for (const entry of creators) if (entry.impossibleShare >= 0.2) flagged.add(entry.creatorId);
  return flagged;
}

// ─── Copyability ranking ────────────────────────────────────────────────────

/** Weight falls as the size band rises: a large account's views are partly audience-driven. */
export const COPYABILITY_SIZE_WEIGHTS: Readonly<Record<SizeBand | "unknown", number>> = {
  seed: 1,
  nano: 1,
  micro: 0.85,
  mid: 0.6,
  macro: 0.45,
  mega: 0.3,
  unknown: 0.5,
};

export const SMALL_SIZE_BANDS: ReadonlySet<string> = new Set(["seed", "nano", "micro"]);

export interface CopyabilityOptions {
  /** Minimum absolute views (default 50k, tunable per niche). */
  noiseFloorViews: number;
  /** Only videos above the creator's own baseline rank (X > 1). */
  minMultiplier: number;
  /** Views per follower is capped here before the log. */
  reachCap: number;
  /** A video counts toward replication at this multiplier and the noise floor. */
  replicationMinMultiplier: number;
}

export const DEFAULT_COPYABILITY: Readonly<CopyabilityOptions> = {
  noiseFloorViews: 50_000,
  minMultiplier: 1,
  reachCap: 100,
  replicationMinMultiplier: 3,
};

export interface CopyCandidate {
  videoId: string;
  creatorId: string;
  multiplier: number | null;
  views: number | null;
  followers: number | null;
  sizeBand: string | null;
  format: string | null;
  hook: string | null;
  /** Thin baseline or provisional age: excluded. */
  thin?: boolean;
  provisional?: boolean;
}

export interface CopyComponents {
  multiplier: number;
  lnMultiplier: number;
  views: number;
  followers: number | null;
  viewsPerFollower: number | null;
  reachTerm: number;
  sizeBand: string;
  sizeWeight: number;
  replication: {
    format: { label: string | null; smallCreators: number };
    hook: { label: string | null; smallCreators: number };
    sameCreatorRepeats: number;
  };
  replicationFactor: number;
  noiseFloorViews: number;
}

export interface CopyRanked<T extends CopyCandidate = CopyCandidate> {
  candidate: T;
  score: number;
  components: CopyComponents;
}

/**
 * Copyability = sizeWeight x (ln X + 0.5 ln(1 + min(views/followers, cap)))
 *               x (replicationFactor + sameCreatorRepeatBonus)
 *
 * replicationFactor = 1 + 0.2 x min(n - 1, 5) when the format or hook type
 * broke out (X >= 3 above the noise floor) for n >= 2 distinct small
 * creators (seed / nano / micro), else 1; each other qualifying video of the
 * same creator with the same format or hook adds 0.1 (up to 0.3). Videos
 * below the noise floor, at or below the creator's baseline, thin, or
 * provisional are excluded with a reason.
 */
export function rankCopyability<T extends CopyCandidate>(candidates: readonly T[], options: Partial<CopyabilityOptions> = {}): { ranked: Array<CopyRanked<T>>; excluded: Array<{ videoId: string; reason: string }> } {
  const settings = { ...DEFAULT_COPYABILITY, ...options };
  const qualifies = (candidate: CopyCandidate) =>
    !candidate.thin && !candidate.provisional && candidate.multiplier !== null && candidate.multiplier >= settings.replicationMinMultiplier &&
    (candidate.views ?? 0) >= settings.noiseFloorViews;
  const smallCreatorsBy = (axis: "format" | "hook") => {
    const map = new Map<string, Set<string>>();
    for (const candidate of candidates) {
      const label = candidate[axis];
      if (!label || label === "unknown" || !qualifies(candidate) || !SMALL_SIZE_BANDS.has(candidate.sizeBand ?? "")) continue;
      (map.get(label) ?? map.set(label, new Set()).get(label)!).add(candidate.creatorId);
    }
    return map;
  };
  const formatCreators = smallCreatorsBy("format");
  const hookCreators = smallCreatorsBy("hook");
  const ranked: Array<CopyRanked<T>> = [];
  const excluded: Array<{ videoId: string; reason: string }> = [];
  for (const candidate of candidates) {
    if (candidate.thin) { excluded.push({ videoId: candidate.videoId, reason: "thin-baseline" }); continue; }
    if (candidate.provisional) { excluded.push({ videoId: candidate.videoId, reason: "provisional" }); continue; }
    if (candidate.multiplier === null || candidate.views === null) { excluded.push({ videoId: candidate.videoId, reason: "unscored" }); continue; }
    if (candidate.views < settings.noiseFloorViews) { excluded.push({ videoId: candidate.videoId, reason: "noise-floor" }); continue; }
    if (candidate.multiplier <= settings.minMultiplier) { excluded.push({ videoId: candidate.videoId, reason: "not-above-baseline" }); continue; }
    const sizeBand = candidate.sizeBand && candidate.sizeBand in COPYABILITY_SIZE_WEIGHTS ? candidate.sizeBand : "unknown";
    const sizeWeight = COPYABILITY_SIZE_WEIGHTS[sizeBand as SizeBand | "unknown"];
    const viewsPerFollower = candidate.followers && candidate.followers > 0 ? candidate.views / candidate.followers : null;
    const reachTerm = viewsPerFollower === null ? 0 : 0.5 * Math.log1p(Math.min(viewsPerFollower, settings.reachCap));
    const formatN = candidate.format && candidate.format !== "unknown" ? formatCreators.get(candidate.format)?.size ?? 0 : 0;
    const hookN = candidate.hook && candidate.hook !== "unknown" ? hookCreators.get(candidate.hook)?.size ?? 0 : 0;
    const replicated = Math.max(formatN, hookN);
    const replicationFactor = replicated >= 2 ? 1 + 0.2 * Math.min(replicated - 1, 5) : 1;
    const sameCreatorRepeats = qualifies(candidate)
      ? candidates.filter((other) => other.videoId !== candidate.videoId && other.creatorId === candidate.creatorId && qualifies(other) &&
          ((candidate.format && candidate.format !== "unknown" && other.format === candidate.format) || (candidate.hook && candidate.hook !== "unknown" && other.hook === candidate.hook))).length
      : 0;
    const repeatBonus = Math.min(0.3, 0.1 * sameCreatorRepeats);
    const lnMultiplier = Math.log(candidate.multiplier);
    const score = sizeWeight * (lnMultiplier + reachTerm) * (replicationFactor + repeatBonus);
    ranked.push({
      candidate,
      score: round(score),
      components: {
        multiplier: round(candidate.multiplier, 2),
        lnMultiplier: round(lnMultiplier),
        views: candidate.views,
        followers: candidate.followers,
        viewsPerFollower: viewsPerFollower === null ? null : round(viewsPerFollower, 2),
        reachTerm: round(reachTerm),
        sizeBand,
        sizeWeight,
        replication: {
          format: { label: candidate.format && candidate.format !== "unknown" ? candidate.format : null, smallCreators: formatN },
          hook: { label: candidate.hook && candidate.hook !== "unknown" ? candidate.hook : null, smallCreators: hookN },
          sameCreatorRepeats,
        },
        replicationFactor: round(replicationFactor + repeatBonus),
        noiseFloorViews: settings.noiseFloorViews,
      },
    });
  }
  ranked.sort((a, b) => b.score - a.score || (b.components.multiplier - a.components.multiplier) || a.candidate.videoId.localeCompare(b.candidate.videoId));
  return { ranked, excluded };
}
