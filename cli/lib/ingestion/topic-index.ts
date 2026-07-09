// Long-horizon topic dedup (#541) — a SIBLING of the #500 short-window seen
// store (cli/lib/ingestion/store.ts). Where the seen store stops re-ingesting
// the SAME ITEM (url/content hash) within a tick's window, this stops the farm
// covering the SAME TOPIC twice across WEEKS from two DIFFERENT source items:
// a story that resurfaces, a follow-up, one launch reported by three outlets.
//
// v1 is STRONG LEXICAL similarity — deterministic, zero-cost, fully testable.
// There is no embedding provider in the codebase today (see the embedding seam
// below); when one lands it plugs in behind `TopicComparator` without touching
// the store shape or the consult callers. The issue explicitly permits "strong
// lexical" and requires a lexical fallback when embeddings are unavailable —
// lexical-primary + embedding-seam satisfies both.
//
// Append-only contract: `topic-index.jsonl` is only ever appended to (one line
// per PRODUCED/PUBLISHED unit). Loading builds the in-memory candidate list;
// torn final lines are tolerated (same read pattern as store.ts / ledger.ts).
// The index is written ONLY on publish/produce success — a #542 stale-DROP must
// NOT record a covered topic (the story was never covered → it stays OPEN).

import path from "node:path";
import fs from "node:fs";
import { parseWindow } from "./store.js";

/** Re-export the #500 window grammar (`<n><s|m|h|d|w>`) — single-sourced. */
export const parseWindowMs = parseWindow;

// ─── topic signature (pure) ────────────────────────────────────────────────

/**
 * A normalized lexical fingerprint of a topic. `tokens` is the deduped word
 * set (for entity/keyword overlap); `shingles` is the set of adjacent word
 * bigrams (for phrase-level Jaccard — catches "OpenAI launched X" across
 * outlets that reorder the surrounding sentence). `embedding` is the seam for a
 * future vector; absent in v1.
 */
export interface TopicSignature {
  tokens: string[];
  shingles: string[];
  // embedding seam: a future embedding provider fills this with the topic
  // vector (via callLLM / a dedicated embeddings connector, routed through the
  // connector discipline — never an ad-hoc call). `compareTopics` will prefer
  // cosine over these when both sides carry one, and fall back to the lexical
  // Jaccard below when either is absent. Nothing else in the record changes.
  embedding?: number[];
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at",
  "by", "from", "is", "are", "was", "were", "be", "as", "it", "its", "this",
  "that", "these", "those", "has", "have", "had", "will", "new", "now",
]);

/** Lowercase, strip punctuation, drop stopwords + <3-char noise → token list. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Adjacent-word bigrams over a token list (phrase signal). */
function shingle(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

/**
 * Derive a topic signature from a produced unit's identity fields: title + key
 * claims + entities + a source-fact digest. Pure — same input, same signature.
 * Callers pass whatever they have; empty parts are ignored.
 */
export function topicSignature(parts: {
  title?: string;
  claims?: string[];
  entities?: string[];
  digest?: string;
}): TopicSignature {
  const text = [parts.title, ...(parts.claims ?? []), ...(parts.entities ?? []), parts.digest]
    .filter(Boolean)
    .join(" ");
  const tokens = [...new Set(tokenize(text))];
  return { tokens, shingles: [...new Set(shingle(tokenize(text)))] };
}

// ─── similarity ──────────────────────────────────────────────────────────────

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const x of new Set(a)) if (setB.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Similarity in [0,1] between two topic signatures. Prefers embedding cosine
 * when BOTH carry a vector (the seam); otherwise the lexical fallback = the max
 * of token-Jaccard and shingle-Jaccard (a strong phrase OR entity overlap is
 * enough to call it the same topic). Pure.
 */
export function compareTopics(a: TopicSignature, b: TopicSignature): number {
  if (a.embedding && b.embedding && a.embedding.length === b.embedding.length && a.embedding.length > 0) {
    return cosine(a.embedding, b.embedding);
  }
  return Math.max(jaccard(a.tokens, b.tokens), jaccard(a.shingles, b.shingles));
}

// ─── published-history index (append-only) ─────────────────────────────────

/** One covered-topic record — appended on PUBLISH/PRODUCE success only. */
export interface TopicRecord {
  unitId: string;
  /** ISO timestamp the topic was covered (publish/produce success). */
  ts: string;
  signature: TopicSignature;
  /** Optional human-readable title, for the skip-event message. */
  title?: string;
}

/**
 * Conservative defaults (favor suppression) — overridable per workspace / node.
 * The block threshold is intentionally low: a legitimate cross-source paraphrase
 * ("OpenAI launches GPT-6" vs "OpenAI announces GPT-6 launch") scores ~0.57 on
 * token Jaccard, so 0.5 catches the "same launch, three outlets" case the issue
 * names as the #1 self-embarrassment while distinct topics stay well under.
 */
export const DEFAULT_TOPIC_WINDOW = "45d";
export const DEFAULT_TOPIC_THRESHOLD = 0.5;
/** Below the block threshold but within this band → a near-match (follow-up candidate). */
export const DEFAULT_FOLLOWUP_THRESHOLD = 0.35;

export function topicIndexPath(workspaceDir: string): string {
  return path.join(workspaceDir, "topic-index.jsonl");
}

/**
 * Load covered-topic records within `windowMs` of `now`. Older records no
 * longer block (the topic may be covered again). Tolerant torn-line read.
 */
export function loadTopicIndex(workspaceDir: string, windowMs?: number, now = Date.now()): TopicRecord[] {
  let raw = "";
  try {
    raw = fs.readFileSync(topicIndexPath(workspaceDir), "utf8");
  } catch {
    return [];
  }
  const out: TopicRecord[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as TopicRecord;
      if (windowMs !== undefined && rec.ts && now - Date.parse(rec.ts) > windowMs) continue;
      if (rec.unitId && rec.signature) out.push(rec);
    } catch {
      // torn line — append-only stores tolerate it
    }
  }
  return out;
}

/**
 * Record a covered topic. APPEND-ONLY. Call ONLY on publish/produce success —
 * never on a #542 stale-drop (a dropped unit never covered its topic).
 */
export function recordTopic(workspaceDir: string, rec: TopicRecord): void {
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.appendFileSync(topicIndexPath(workspaceDir), JSON.stringify(rec) + "\n");
}

// ─── consult ───────────────────────────────────────────────────────────────

export type TopicVerdict =
  | { decision: "fresh" }
  | { decision: "duplicate"; prior: TopicRecord; score: number }
  | { decision: "follow-up"; prior: TopicRecord; score: number };

/**
 * Compare a candidate signature against the windowed index. Returns the highest
 * scoring prior and a verdict:
 *   • score >= blockThreshold             → duplicate (suppress, default).
 *   • followUpThreshold <= score < block  → follow-up (a near-match; the caller
 *                                            suppresses by default, routes to a
 *                                            follow-up angle only when opted in).
 *   • else                                → fresh.
 * Pure over the loaded `index`.
 */
export function consultTopic(
  candidate: TopicSignature,
  index: TopicRecord[],
  blockThreshold = DEFAULT_TOPIC_THRESHOLD,
  followUpThreshold = DEFAULT_FOLLOWUP_THRESHOLD,
): TopicVerdict {
  let best: TopicRecord | null = null;
  let bestScore = 0;
  for (const rec of index) {
    const s = compareTopics(candidate, rec.signature);
    if (s > bestScore) {
      bestScore = s;
      best = rec;
    }
  }
  if (best && bestScore >= blockThreshold) return { decision: "duplicate", prior: best, score: bestScore };
  if (best && bestScore >= followUpThreshold) return { decision: "follow-up", prior: best, score: bestScore };
  return { decision: "fresh" };
}
