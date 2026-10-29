// Script similarity for the originality check (#561). PURE: no I/O.
//
// Compares the spoken / written text of two pieces (VO script, transcript,
// captions, post body) with word 3-gram shingles, the standard near-duplicate
// text measure (Broder 1997). Reported per pair:
//
//   • containment — share of the SUBJECT's shingles found in the other text.
//     "How much of this script already exists there." This is the axis score.
//   • jaccard     — symmetric overlap, for reference.
//   • hook        — word-bigram overlap of the two openings (first sentence,
//     at most 15 words), so a hook rewrite is visible on its own.
//
// Also extracts plain text from the shapes the pipeline writes: SRT / VTT
// captions, word-level caption JSON, scenario JSON (VO fields only, never
// image / video prompts), and plain text or Markdown.

const SHINGLE = 3;
const HOOK_WORDS = 15;

/** Lowercased word tokens (letters and digits; punctuation dropped). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’']/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The set of word k-grams (unigrams when the text is shorter than k). */
export function shingles(tokens: string[], k = SHINGLE): Set<string> {
  const out = new Set<string>();
  if (tokens.length === 0) return out;
  if (tokens.length < k) {
    out.add(tokens.join(" "));
    return out;
  }
  for (let i = 0; i + k <= tokens.length; i++) out.add(tokens.slice(i, i + k).join(" "));
  return out;
}

/** The opening line: first sentence, capped at HOOK_WORDS words. */
export function openingWords(text: string): string[] {
  const first = text.trim().split(/(?<=[.!?])\s+|\n+/u)[0] ?? "";
  return words(first).slice(0, HOOK_WORDS);
}

export interface ScriptSimilarity {
  /** Share of the subject's 3-grams present in the other text (0..1). */
  containment: number;
  /** Symmetric 3-gram Jaccard (0..1). */
  jaccard: number;
  /** Bigram Jaccard of the two openings (0..1). */
  hook: number;
  /** Subject word count. */
  words: number;
}

/** Compare two scripts. Returns null when either side has no words. */
export function compareScripts(subject: string, other: string): ScriptSimilarity | null {
  const a = words(subject);
  const b = words(other);
  if (a.length === 0 || b.length === 0) return null;
  const sa = shingles(a);
  const sb = shingles(b);
  let shared = 0;
  for (const s of sa) if (sb.has(s)) shared += 1;
  const union = sa.size + sb.size - shared;
  const hookA = shingles(openingWords(subject), 2);
  const hookB = shingles(openingWords(other), 2);
  let hookShared = 0;
  for (const s of hookA) if (hookB.has(s)) hookShared += 1;
  const hookUnion = hookA.size + hookB.size - hookShared;
  return {
    containment: round(shared / sa.size),
    jaccard: round(union === 0 ? 0 : shared / union),
    hook: round(hookUnion === 0 ? 0 : hookShared / hookUnion),
    words: a.length,
  };
}

// ─── text extraction ─────────────────────────────────────────────────────────

/** Keys whose string values are spoken or published text (never prompts). */
const TEXT_KEYS = new Set([
  "vo",
  "vo_text",
  "votext",
  "voiceover",
  "voice_over",
  "narration",
  "script",
  "transcript",
  "caption",
  "captions",
  "text",
  "line",
  "lines",
  "dialogue",
  "body",
  "primary",
  "hook",
  "cta",
  "headline",
  "word",
  "words",
]);
const SKIP_KEYS = new Set(["prompt", "prompts", "negative", "negative_prompt", "style", "model", "image_prompt", "video_prompt", "motion"]);

/** Strip SRT / VTT timing lines, cue numbers, and markup; keep the cue text. */
export function textFromSubtitles(raw: string): string {
  return raw
    .replace(/\r/gu, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^WEBVTT/u.test(t) || /^(NOTE|STYLE|REGION)\b/u.test(t)) return false;
      if (/^\d+$/u.test(t)) return false;
      if (/-->/u.test(t)) return false;
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/gu, "").trim())
    .join(" ");
}

/**
 * Collect spoken / published text from a parsed JSON value: word-level caption
 * arrays (`[{ text | word, start, end }]`), scenario VO fields, and nested
 * scene lists. Prompt-like keys are skipped so image prompts never count as
 * script.
 */
export function textFromJson(value: unknown): string {
  const parts: string[] = [];
  const visit = (node: unknown, key: string | null, depth: number) => {
    if (depth > 8 || node === null || node === undefined) return;
    if (typeof node === "string") {
      if (key !== null && TEXT_KEYS.has(normalizeKey(key))) parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key, depth + 1);
      return;
    }
    if (typeof node === "object") {
      for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) {
        if (SKIP_KEYS.has(normalizeKey(childKey))) continue;
        visit(child, childKey, depth + 1);
      }
    }
  };
  visit(value, null, 0);
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

/** Extract script text from file content by its extension. */
export function textFromFileContent(content: string, extension: string): string {
  const ext = extension.toLowerCase();
  if (ext === ".srt" || ext === ".vtt") return textFromSubtitles(content);
  if (ext === ".json") {
    try {
      return textFromJson(JSON.parse(content));
    } catch {
      return "";
    }
  }
  return content.replace(/^#+\s*/gmu, "").replace(/\s+/gu, " ").trim();
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/-/gu, "_");
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
