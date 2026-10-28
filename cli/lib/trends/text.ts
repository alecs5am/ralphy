// Text helpers for niche onboarding (#576) — pure, no I/O.
//
// Bios and captions are public, but bios often carry emails and phone
// numbers. Only a scrubbed, truncated bio is stored (emails, phone numbers,
// and full URLs removed; a profile link keeps only its platform handle), plus
// the handles it mentions. Matching is Unicode-aware so the same code serves
// English and Russian lexicons; a lexicon term ending in `*` matches as a
// prefix (inflected languages).

import { truncateCodePoints } from "./math.js";

export const BIO_MAX = 300;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

const TIKTOK_LINK = /tiktok\.com\/@([A-Za-z0-9._]{2,24})/gi;
const TIKTOK_LABEL = /\b(?:tiktok|tik tok|tt)\s*[:\-–]?\s*@([A-Za-z0-9._]{2,24})/gi;
const YOUTUBE_LINK = /youtube\.com\/@([\p{L}\p{N}._-]{3,30})/giu;
const MENTION = /(^|[^\p{L}\p{N}_.@/])@([A-Za-z0-9._]{2,24})/gu;

const cleanHandle = (value: string) => value.replace(/\.+$/, "").toLowerCase();

export function tiktokHandlesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const match of text.matchAll(TIKTOK_LINK)) out.add(cleanHandle(match[1]!));
  for (const match of text.matchAll(TIKTOK_LABEL)) out.add(cleanHandle(match[1]!));
  return [...out].filter((handle) => handle.length >= 2);
}

export function youtubeHandlesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const match of text.matchAll(YOUTUBE_LINK)) out.add(`@${match[1]!.replace(/\.+$/, "")}`);
  return [...out];
}

/** `@handle` mentions (stitch / duet credits, collaborators, "main account"). */
export function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const withoutEmails = text.replace(EMAIL, " ");
  const out = new Set<string>();
  for (const match of withoutEmails.matchAll(MENTION)) {
    const handle = cleanHandle(match[2]!);
    if (handle.length >= 2 && !/^\d+$/.test(handle)) out.add(handle);
  }
  return [...out];
}

/** Bio with emails, phone numbers, and URLs removed (profile links reduced to their handle), truncated. */
export function scrubBio(text: string | null | undefined, max = BIO_MAX): string | null {
  if (!text) return null;
  const replaced = text
    .replace(/https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\S*/gi, "tiktok @$1")
    .replace(/https?:\/\/(?:www\.)?youtube\.com\/@([\p{L}\p{N}._-]+)\S*/giu, "youtube @$1")
    .replace(EMAIL, "[email]")
    .replace(URL, "[link]")
    .replace(PHONE, "[phone]")
    .replace(/\s+/g, " ")
    .trim();
  return replaced ? truncateCodePoints(replaced, max) : null;
}

/** Creator metadata patch from a bio: scrubbed text plus the handles it names. */
export function bioMetadata(bio: string | null | undefined, source: string): Record<string, unknown> | null {
  if (!bio || !bio.trim()) return null;
  return {
    bio: scrubBio(bio),
    bioSource: source,
    tiktokHandles: tiktokHandlesFromText(bio),
    youtubeHandles: youtubeHandlesFromText(bio),
    mentions: extractMentions(bio),
  };
}

/** A YouTube @handle as a TikTok handle guess (TikTok allows [a-z0-9._], 2-24). */
export function tiktokHandleFromYoutube(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const bare = handle.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{2,24}$/.test(bare) ? bare : null;
}

// ─── Matching ───────────────────────────────────────────────────────────────

export function normalizeText(text: string | null | undefined): string {
  return (text ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const termCache = new Map<string, RegExp>();

/** Word-bounded (Unicode) term regex; `stem*` matches as a prefix. */
export function termRegex(term: string): RegExp {
  const cached = termCache.get(term);
  if (cached) return cached;
  const normalized = normalizeText(term);
  const prefix = normalized.endsWith("*");
  const body = escapeRegex(prefix ? normalized.slice(0, -1) : normalized).replace(/\s+/g, "[\\s_-]*");
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])${body}${prefix ? "" : "(?![\\p{L}\\p{N}])"}`, "u");
  termCache.set(term, regex);
  return regex;
}

/** Terms from `terms` found in `text` (normalized); hashtags count as text. */
export function matchTerms(text: string, terms: readonly string[]): string[] {
  const normalized = normalizeText(text).replace(/#/g, " ");
  if (!normalized) return [];
  return terms.filter((term) => termRegex(term).test(normalized));
}

// ─── Language ───────────────────────────────────────────────────────────────

const EN_STOPWORDS = new Set([
  "the", "and", "you", "your", "to", "is", "this", "that", "how", "why", "what", "of", "in", "it", "for", "are", "with",
  "my", "me", "when", "if", "do", "not", "can", "be", "on", "they", "we", "about", "who", "have", "from", "will", "just",
  "people", "never", "always", "signs", "things", "should", "dont", "don't", "it's", "i'm", "here", "most",
]);
const OTHER_LATIN_STOPWORDS = new Set([
  "que", "los", "las", "una", "por", "para", "con", "como", "pero", "mais", "você", "voce", "não", "nao", "est", "les",
  "des", "une", "pour", "dans", "avec", "und", "der", "die", "das", "nicht", "ist", "ein", "eine", "het", "een", "dat",
  "của", "và", "không", "là", "những", "yang", "dan", "ini", "itu", "tidak", "ng", "sa", "mga", "ang", "bir", "ve", "bu",
]);

export type LanguageGuess = "en" | "ru" | "other";

/**
 * Rough script + stopword language guess. Hashtags, mentions, and URLs are
 * ignored; fewer than 8 letters returns null. Cyrillic majority reads `ru`
 * (Ukrainian and other Cyrillic languages are not separated); Latin text
 * reads `en` only with English function words and more English than other
 * Latin-language function words.
 */
export function guessLanguage(text: string | null | undefined): LanguageGuess | null {
  const stripped = (text ?? "").replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/@[\w.]+/g, " ").replace(URL, " ");
  const letters = stripped.match(/\p{L}/gu) ?? [];
  if (letters.length < 8) return null;
  let latin = 0;
  let cyrillic = 0;
  for (const letter of letters) {
    if (/\p{Script=Latin}/u.test(letter)) latin += 1;
    else if (/\p{Script=Cyrillic}/u.test(letter)) cyrillic += 1;
  }
  if (cyrillic / letters.length >= 0.5) return "ru";
  if (latin / letters.length < 0.7) return "other";
  const words = normalizeText(stripped).split(/[^\p{L}'’]+/u).filter(Boolean);
  let english = 0;
  let otherLatin = 0;
  for (const word of words) {
    const bare = word.replace(/[’]/g, "'");
    if (EN_STOPWORDS.has(bare)) english += 1;
    if (OTHER_LATIN_STOPWORDS.has(bare)) otherLatin += 1;
  }
  if (english === 0 && otherLatin === 0) return words.length <= 6 ? null : "other";
  return english > otherLatin ? "en" : "other";
}

/** Majority language over the guesses that decided (needs at least `minVotes`). */
export function creatorLanguage(guesses: ReadonlyArray<LanguageGuess | null>, minVotes = 5): LanguageGuess | null {
  const votes = new Map<LanguageGuess, number>();
  for (const guess of guesses) if (guess) votes.set(guess, (votes.get(guess) ?? 0) + 1);
  const total = [...votes.values()].reduce((sum, value) => sum + value, 0);
  if (total < minVotes) return null;
  const [best, count] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return count / total >= 0.5 ? best : null;
}

/** Caption key for duplicate detection: lowercase letters and digits only, no tags, mentions, or URLs. */
export function captionKey(text: string | null | undefined, minLength = 25): string | null {
  const key = normalizeText(text)
    .replace(URL, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/@[\w.]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return key.length >= minLength ? key : null;
}
