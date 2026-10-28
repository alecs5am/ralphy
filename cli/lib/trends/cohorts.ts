// Cohort labels for the trend corpus (#556), docs/research/trend-corpus.md
// "Cohort taxonomy". Deterministic axes (length band, size band, language,
// region, audio) and the seed niche are written by rules; content format and
// hook type get a rule pre-label from the title, and an optional batched
// `callLLM()` pass (behind `--llm`, default off) whose labels below 0.6
// confidence stay `unknown`.

import { lengthBandFor } from "./math.js";
import type { LabelCandidateDto, TrendLabelInput } from "../store/trends.js";

export const NICHES = [
  "ai-tools", "tech-tips", "coding", "productivity", "personal-finance", "investing", "business", "marketing",
  "fitness", "food", "beauty", "fashion", "gaming", "education", "real-estate", "travel", "family", "comedy",
  "self-improvement", "health", "pets", "diy-home", "auto", "sports", "music", "news-commentary", "other",
] as const;
export type Niche = (typeof NICHES)[number];

export const AI_TOOLS_SUB_NICHES = ["ai-video", "ai-image", "chatbots", "ai-coding", "automation", "ai-money", "ai-news"] as const;

export const CONTENT_FORMATS = [
  "talking-head", "voiceover-broll", "screen-recording", "text-on-screen", "green-screen", "skit", "listicle",
  "product-demo", "pov", "before-after", "podcast-clip", "animation", "ai-visuals", "meme-edit", "review-unboxing",
] as const;

export const HOOK_TYPES = [
  "when-trigger", "pov", "nobody-tells-you", "wish-known-earlier", "everyone-thinks-but", "shock-number",
  "here-is-why", "question", "numbered-list", "bold-claim", "visual-demo-first", "story-open", "challenge",
] as const;

export function isNiche(value: unknown): value is Niche {
  return typeof value === "string" && (NICHES as readonly string[]).includes(value);
}

/** Hashtag → niche map, a deterministic fallback when no seed niche exists. */
const HASHTAG_NICHES: Record<string, Niche> = {
  ai: "ai-tools", aitools: "ai-tools", aitool: "ai-tools", chatgpt: "ai-tools", artificialintelligence: "ai-tools",
  aitips: "ai-tools", claudecode: "ai-tools", openai: "ai-tools", midjourney: "ai-tools", aivideo: "ai-tools",
  techtips: "tech-tips", tech: "tech-tips", techhacks: "tech-tips", iphone: "tech-tips", android: "tech-tips", gadgets: "tech-tips",
  coding: "coding", programming: "coding", developer: "coding", python: "coding", javascript: "coding",
  productivity: "productivity", productivityhacks: "productivity", notion: "productivity",
  personalfinance: "personal-finance", money: "personal-finance", investing: "investing", stocks: "investing",
  fitness: "fitness", gym: "fitness", food: "food", recipe: "food", beauty: "beauty", makeup: "beauty",
  fashion: "fashion", gaming: "gaming", education: "education", travel: "travel", comedy: "comedy",
};

export function nicheFromHashtags(hashtags: readonly string[]): Niche | null {
  const votes = new Map<Niche, number>();
  for (const tag of hashtags) {
    const niche = HASHTAG_NICHES[tag.toLowerCase()];
    if (niche) votes.set(niche, (votes.get(niche) ?? 0) + 1);
  }
  let best: Niche | null = null;
  let bestVotes = 0;
  for (const [niche, count] of votes) {
    if (count > bestVotes) {
      best = niche;
      bestVotes = count;
    }
  }
  return best;
}

const lead = (text: string) => text.trim().replace(/^[^\p{L}\p{N}$]+/u, "");

/** High-precision hook pre-labels from title text; null when no rule fires. */
export function ruleHook(title: string | null): string | null {
  if (!title) return null;
  const text = lead(title);
  if (/^pov\b[:\s]/i.test(text)) return "pov";
  if (/\bnobody (tells|talks about|told)\b/i.test(text)) return "nobody-tells-you";
  if (/\b(i wish i (had )?(knew|known)|wish i knew)\b/i.test(text)) return "wish-known-earlier";
  if (/\beveryone (thinks|says|believes)\b.*\bbut\b/i.test(text)) return "everyone-thinks-but";
  if (/^(when|that moment when)\b/i.test(text)) return "when-trigger";
  if (/\b(here'?s why|this is why)\b/i.test(text)) return "here-is-why";
  if (/^\$?\d[\d,.]*\s*(k|m|%|x|\$)\b/i.test(text) || /^(i|we) (made|earned|saved) \$?\d/i.test(text)) return "shock-number";
  if (/^\d{1,2}\s+(\p{L}+\s+){0,3}(ai |free |best |useful )?(tools?|apps?|ways?|tips?|tricks?|hacks?|websites?|things?|reasons?|steps?|prompts?|mistakes?|features?|sites?)\b/iu.test(text)) return "numbered-list";
  if (/\bchallenge\b/i.test(text)) return "challenge";
  if (/\?\s*(#|$)/.test(text) || /^(how|why|what|which|can|do|does|is|are|should|did)\b/i.test(text)) return "question";
  return null;
}

/** High-precision content-format pre-labels from title text and hashtags. */
export function ruleFormat(title: string | null, hashtags: readonly string[]): string | null {
  const text = title ? lead(title) : "";
  const tags = new Set(hashtags.map((tag) => tag.toLowerCase()));
  if (/\b(podcast|episode|ep\.?\s?\d+)\b/i.test(text) || tags.has("podcast") || tags.has("podcastclips")) return "podcast-clip";
  if (/\b(unboxing|unbox)\b/i.test(text) || tags.has("unboxing")) return "review-unboxing";
  if (/\bbefore\s*(and|&|vs\.?|\/)\s*after\b/i.test(text) || tags.has("beforeandafter")) return "before-after";
  if (/^pov\b[:\s]/i.test(text) || tags.has("pov")) return "pov";
  if (tags.has("greenscreen") || /\bgreen ?screen\b/i.test(text)) return "green-screen";
  if (["aiart", "aivideo", "aigenerated", "aianimation", "midjourney", "sora", "veo3", "kling"].some((tag) => tags.has(tag))) return "ai-visuals";
  if (tags.has("skit") || tags.has("comedyskit") || /\bskit\b/i.test(text)) return "skit";
  if (tags.has("meme") || tags.has("memes")) return "meme-edit";
  if (/^\d{1,2}\s+(\p{L}+\s+){0,3}(tools?|apps?|ways?|tips?|tricks?|hacks?|websites?|sites?|things?|prompts?)\b/iu.test(text)) return "listicle";
  return null;
}

/** Deterministic + rule labels for one candidate, skipping axes it already has. */
export function deterministicLabels(candidate: LabelCandidateDto): TrendLabelInput[] {
  const has = new Set(candidate.existingAxes);
  const labels: TrendLabelInput[] = [];
  const add = (axis: TrendLabelInput["axis"], label: string | null, method: TrendLabelInput["method"], confidence: number | null = null) => {
    if (!label || has.has(`${axis}:${method}`)) return;
    labels.push({ videoId: candidate.videoId, axis, label, method, confidence });
  };
  add("length_band", lengthBandFor(candidate.durationMs), "rule", 1);
  add("size_band", candidate.sizeBand, "rule", 1);
  add("language", candidate.language, "rule", 1);
  add("region", candidate.region ?? candidate.creatorRegion, "rule", candidate.region ? 1 : 0.5);
  add("audio", candidate.soundOriginal === true ? "original" : candidate.soundOriginal === false ? "licensed" : null, "rule", 1);
  if (candidate.creatorNiche) {
    add("niche", candidate.creatorNiche, candidate.creatorNicheMethod === "llm" ? "llm" : "seed", candidate.creatorNicheMethod === "llm" ? 0.6 : 1);
  } else {
    add("niche", nicheFromHashtags(candidate.hashtags), "rule", 0.5);
  }
  const text = candidate.title ?? candidate.description;
  add("format", ruleFormat(text, candidate.hashtags), "rule", 0.7);
  add("hook", ruleHook(text), "rule", 0.7);
  return labels;
}

// ─── LLM pass (behind --llm) ────────────────────────────────────────────────

export const LLM_LABEL_MODEL = "google/gemini-2.5-flash";
export const LLM_BATCH_SIZE = 25;
export const LLM_CONFIDENCE_FLOOR = 0.6;

export type LlmCaller = (input: { model: string; system: string; user: string }) => Promise<string>;

export function llmLabelPrompt(batch: readonly LabelCandidateDto[]): { system: string; user: string } {
  const system = [
    "You label short-form videos for a trend corpus. Use only the closed label sets given.",
    `format: ${CONTENT_FORMATS.join(", ")}, unknown`,
    `hook: ${HOOK_TYPES.join(", ")}, unknown`,
    `niche: ${NICHES.join(", ")}`,
    "Judge from the caption text, hashtags, and duration only. When the text does not make a label clear, answer unknown with low confidence.",
    'Reply with JSON only: {"items":[{"i":0,"format":"...","format_confidence":0.0,"hook":"...","hook_confidence":0.0,"niche":"...","niche_confidence":0.0}]}',
  ].join("\n");
  const lines = batch.map((candidate, index) => JSON.stringify({
    i: index,
    platform: candidate.platform,
    text: (candidate.title ?? candidate.description ?? "").slice(0, 300),
    hashtags: candidate.hashtags.slice(0, 12),
    seconds: candidate.durationMs === null ? null : Math.round(candidate.durationMs / 1000),
  }));
  return { system, user: lines.join("\n") };
}

/** Parse the model reply into labels; out-of-set or low-confidence answers become `unknown`. */
export function parseLlmLabels(text: string, batch: readonly LabelCandidateDto[], model: string): TrendLabelInput[] {
  let parsed: { items?: Array<Record<string, unknown>> };
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text) as { items?: Array<Record<string, unknown>> };
  } catch {
    return [];
  }
  const out: TrendLabelInput[] = [];
  for (const item of parsed.items ?? []) {
    const index = typeof item.i === "number" ? item.i : -1;
    const candidate = batch[index];
    if (!candidate) continue;
    const axis = (name: "format" | "hook" | "niche", allowed: readonly string[]) => {
      const raw = typeof item[name] === "string" ? String(item[name]) : "unknown";
      const confidenceRaw = item[`${name}_confidence`];
      const confidence = typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
      const label = allowed.includes(raw) && confidence >= LLM_CONFIDENCE_FLOOR ? raw : "unknown";
      out.push({ videoId: candidate.videoId, axis: name, label, method: "llm", model, confidence });
    };
    axis("format", CONTENT_FORMATS);
    axis("hook", HOOK_TYPES);
    if (!candidate.creatorNiche) axis("niche", NICHES);
  }
  return out;
}
