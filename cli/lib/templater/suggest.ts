// `ralphy template suggest` — keyword scorer + LLM-classify fallback.
//
// The keyword scorer is the original substring-against-tags+description algorithm
// from `cli/commands/template.ts`. It's fast and free but fails on Russian /
// paraphrase / concept-level / typo queries (5 of 10 postmortems would have
// surfaced a wrong template through it).
//
// `suggestTemplates()` orchestrates: try keyword first; if the top-1 score
// clears the threshold (default 0.7), return it. Otherwise, fall through to
// an LLM-rerank pass that gets the compressed catalog + utterance and returns
// a multilingual / semantic-aware ranking.
//
// The LLM pass is injectable via `opts.llmFn` so tests can mock it. In
// production it routes through `cli/lib/providers/llm.ts → callLLM()` per
// AGENTS invariant #1 (no raw OR / OpenAI calls).

import { callLLM } from "../providers/llm.js";

export type Candidate = {
  slug: string;
  /** Human-readable name from template.json `name` field. */
  name: string;
  /** Description from template.json. */
  description: string;
  /** Tags from template.json — drive 2× weight in keyword scorer. */
  tags: string[];
  /** First ~500 chars of TEMPLATE.md (preview only). */
  doc: string;
  /** Optional pass-through metadata (kind, source, etc) preserved into results. */
  meta?: Record<string, unknown>;
};

export type ScoredResult = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  score: number;
  tier: "strong" | "weak" | "below-threshold";
  /** Present only when the LLM pass fires — the model's reasoning per pick. */
  reasoning?: string;
  /** Pass-through metadata copied from the input Candidate.meta. */
  meta?: Record<string, unknown>;
};

export type SuggestSource = "keyword" | "llm" | "keyword-fallback";

export type SuggestResult = {
  utterance: string;
  source: SuggestSource;
  /** If the LLM fired, this is the reasoning the model returned for the top pick. */
  llmNote?: string;
  results: ScoredResult[];
};

export type SuggestOptions = {
  /** Min keyword score for the keyword path to be authoritative. Default 0.7. */
  threshold?: number;
  /** Max results returned. Default 3. */
  limit?: number;
  /** If true, never fire the LLM (CI / offline mode). */
  disableLlm?: boolean;
  /** Injectable LLM caller. Defaults to a wrapper around `callLLM()`. Tests pass a stub. */
  llmFn?: (prompt: string) => Promise<string>;
  /** Model id for the LLM pass. Default `google/gemini-2.5-flash` (cheap + multilingual). */
  llmModel?: string;
};

// ─── Keyword scorer ──────────────────────────────────────────────────────────

const TOKEN_SPLIT = /[\s,.;:!?]+/;

function tokenize(utterance: string): string[] {
  return utterance
    .split(TOKEN_SPLIT)
    .map((t) => t.replace(/[^a-z0-9\-Ѐ-ӿ]/gi, "").toLowerCase())
    .filter((t) => t.length >= 2);
}

function tierFor(score: number): ScoredResult["tier"] {
  if (score >= 0.7) return "strong";
  if (score >= 0.5) return "weak";
  return "below-threshold";
}

/**
 * Pure substring scorer. For each token in the utterance, check if it's a
 * substring of any tag (2× weight) or anywhere in name + description + first
 * 500 chars of the doc (1× weight). Returns a list sorted by score desc.
 */
export function keywordScore(utterance: string, candidates: Candidate[]): ScoredResult[] {
  const tokens = tokenize(utterance);
  const denom = Math.max(1, tokens.length);

  const scored = candidates.map<ScoredResult>((c) => {
    const haystack = [c.slug, c.name, c.description, c.tags.join(" "), c.doc.slice(0, 500)]
      .join(" ")
      .toLowerCase();
    let hits = 0;
    let tagHits = 0;
    for (const token of tokens) {
      if (c.tags.some((tag) => tag.toLowerCase().includes(token))) {
        tagHits += 1;
        hits += 1;
      } else if (haystack.includes(token)) {
        hits += 1;
      }
    }
    // Tag matches are weighted 2× — they're the most intentional signal.
    const score = Math.min(1, (hits + tagHits) / (denom * 2));
    return {
      slug: c.slug,
      name: c.name,
      description: c.description,
      tags: c.tags,
      score: Number(score.toFixed(3)),
      tier: tierFor(score),
      meta: c.meta,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ─── LLM rerank ──────────────────────────────────────────────────────────────

const LLM_PROMPT_TEMPLATE = `You are picking the best UGC video templates from a fixed catalog for a user utterance.

The user's utterance may be in any language (English, Russian, Japanese, Korean — match by meaning, not literal keywords). Paraphrases, synonyms, and concept-level fits count. Typos should still match the intended template.

Catalog (slug → "name" — description + tags):
{{CATALOG}}

User utterance: "{{UTTERANCE}}"

Return ONLY this JSON object (no preamble, no markdown fences, no commentary):
{
  "results": [
    {
      "slug": "<one of the slugs above>",
      "score": <number 0.0-1.0>,
      "reasoning": "<one short sentence in the user's language>"
    },
    ...
  ]
}

Rank by relevance, top {{LIMIT}} entries. Scoring:
- 0.9-1.0: clear match (template was made for exactly this kind of brief)
- 0.7-0.9: good fit (template covers the dominant aesthetic / format)
- 0.5-0.7: partial (overlaps on one axis but misses on another)
- below 0.5: stretch (only loosely related)

Only return slugs that appear in the catalog above. Never invent slugs.`;

function buildCatalogString(candidates: Candidate[]): string {
  return candidates
    .map((c) => {
      const tagsStr = c.tags.length > 0 ? ` [tags: ${c.tags.join(", ")}]` : "";
      return `- ${c.slug} → "${c.name}" — ${c.description}${tagsStr}`;
    })
    .join("\n");
}

function buildPrompt(utterance: string, candidates: Candidate[], limit: number): string {
  return LLM_PROMPT_TEMPLATE
    .replace("{{CATALOG}}", buildCatalogString(candidates))
    .replace("{{UTTERANCE}}", utterance.replace(/"/g, '\\"'))
    .replace("{{LIMIT}}", String(limit));
}

type LLMResponse = {
  results?: Array<{ slug?: string; score?: number; reasoning?: string }>;
};

/**
 * Default LLM caller used in production. Routes through `callLLM()` so every
 * call lands in `generations.jsonl` with provenance (AGENTS invariant #1).
 */
async function defaultLlmFn(prompt: string, model: string): Promise<string> {
  const result = await callLLM({
    messages: [{ role: "user", content: prompt }],
    model,
    temperature: 0.1, // Low — we want deterministic ranking, not creative
    jsonMode: true,
    endpoint: "template-suggest",
  });
  return result.text;
}

/**
 * Parses the LLM response, validates slugs against the input catalog, and
 * returns a ScoredResult[] sorted by LLM-assigned score. Throws on malformed
 * input or all-unknown slugs (caller falls back to keyword results).
 */
function parseLlmResponse(
  responseText: string,
  candidates: Candidate[],
  limit: number,
): ScoredResult[] {
  // Strip code fences if the model added them despite instructions.
  const cleaned = responseText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as LLMResponse;
  if (!parsed.results || !Array.isArray(parsed.results)) {
    throw new Error("LLM response missing `results` array");
  }
  const byslug = new Map(candidates.map((c) => [c.slug, c]));
  const out: ScoredResult[] = [];
  for (const r of parsed.results) {
    if (!r.slug || typeof r.score !== "number") continue;
    const candidate = byslug.get(r.slug);
    if (!candidate) continue; // unknown slug — drop
    const clampedScore = Math.max(0, Math.min(1, r.score));
    out.push({
      slug: candidate.slug,
      name: candidate.name,
      description: candidate.description,
      tags: candidate.tags,
      score: Number(clampedScore.toFixed(3)),
      tier: tierFor(clampedScore),
      reasoning: typeof r.reasoning === "string" ? r.reasoning : undefined,
      meta: candidate.meta,
    });
  }
  if (out.length === 0) {
    throw new Error("LLM returned no valid slugs from the catalog");
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Pick the top-N templates for an utterance. Hybrid strategy:
 *
 *   1. Run keyword scorer. If top-1 score >= threshold (default 0.7), return
 *      it — substring matched something specific enough to trust.
 *   2. Otherwise, hand to the LLM with a compressed catalog + utterance. The
 *      LLM does multilingual / paraphrase / concept-level reranking and
 *      returns a fresh ranking with reasoning.
 *   3. If the LLM throws (network out) or returns malformed JSON / unknown
 *      slugs, fall back to the keyword results so the user always gets *something*.
 *   4. `disableLlm: true` forces keyword-only (CI / offline).
 *
 * Cost: keyword path is $0; LLM path is ~$0.001 (gemini-2.5-flash, ~5KB prompt
 * + JSON out). Fires at most once per `ralphy template suggest` invocation.
 */
export async function suggestTemplates(
  utterance: string,
  candidates: Candidate[],
  opts: SuggestOptions = {},
): Promise<SuggestResult> {
  const threshold = opts.threshold ?? 0.7;
  const limit = opts.limit ?? 3;
  const model = opts.llmModel ?? "google/gemini-2.5-flash";

  const keywordResults = keywordScore(utterance, candidates);
  const topKeyword = keywordResults[0];

  // Path 1: keyword scorer found a strong match.
  if (topKeyword && topKeyword.score >= threshold) {
    return {
      utterance,
      source: "keyword",
      results: keywordResults.slice(0, limit),
    };
  }

  // Path 2: opted out of LLM via flag (CI / offline).
  if (opts.disableLlm) {
    return {
      utterance,
      source: "keyword",
      results: keywordResults.slice(0, limit),
    };
  }

  // Path 3: LLM rerank.
  const llmFn = opts.llmFn ?? ((p: string) => defaultLlmFn(p, model));
  const prompt = buildPrompt(utterance, candidates, limit);
  try {
    const responseText = await llmFn(prompt);
    const ranked = parseLlmResponse(responseText, candidates, limit);
    return {
      utterance,
      source: "llm",
      llmNote: ranked[0]?.reasoning,
      results: ranked,
    };
  } catch {
    // Network error, malformed JSON, all-unknown slugs — fall back to keyword.
    return {
      utterance,
      source: "keyword-fallback",
      results: keywordResults.slice(0, limit),
    };
  }
}
