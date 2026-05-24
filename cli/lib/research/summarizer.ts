// Per-source summarizer. Cheap model. Compresses each fetched page from up
// to 250 KB of raw text down to ~300 tokens of structured signal the
// synthesis step can consume cheaply.

import { callLLM } from "../providers/llm.js";

export type SourceSummary = {
  url: string;
  title: string;
  summary: string;
  key_claims: string[];
  format_patterns: string[];
  why_resonates: string;
  source_quality: "primary" | "secondary" | "marketing" | "low";
  freshness: "fresh" | "evergreen" | "stale" | "unknown";
};

export type SummarizeInput = {
  url: string;
  rawText: string;
  /** User's niche / topic to bias summaries toward signal we care about. */
  niche: string;
  model?: string;
  projectId?: string;
  maxInputChars?: number;
};

const SYSTEM = `You compress a single fetched web page into a structured signal block for a deep-research synthesis step.

The user's niche / research topic will be supplied. Bias your extraction toward signal relevant to viral content analysis for that niche: format patterns, hooks, runtime ranges, platforms, creator names, hard data, audience JTBD, and psychology of why content resonates.

Output STRICT JSON only. No prose. No markdown fences.

type SourceSummary = {
  url: string;
  title: string;
  summary: string;            // 2-4 sentences, max ~120 words
  key_claims: string[];       // 3-8 concrete claims the page makes about the niche. Each <=25 words.
  format_patterns: string[];  // viral / repeatable format patterns mentioned (e.g. "30-sec POV hook with on-screen translation"). Empty array if none.
  why_resonates: string;      // 1-2 sentences. Why this content or pattern works psychologically / algorithmically. Empty string if N/A.
  source_quality: "primary" | "secondary" | "marketing" | "low";  // primary = creator/platform/academic; secondary = journalism/blog analysis; marketing = SEO/ad-driven; low = thin/spam.
  freshness: "fresh" | "evergreen" | "stale" | "unknown";         // fresh = clearly 2024-2026 dated; evergreen = timeless; stale = pre-2022 only; unknown = no signal.
}

If the page is empty, blocked, error-page, or has no signal for the niche — still return valid JSON with source_quality="low", empty arrays, summary="No usable content".
`;

export async function summarizeSource(
  input: SummarizeInput,
): Promise<SourceSummary> {
  const maxInputChars = input.maxInputChars ?? 24_000;
  const trimmed = input.rawText.slice(0, maxInputChars);
  const model = input.model ?? "google/gemini-2.5-flash";

  const user = [
    `Niche: ${input.niche}`,
    `URL: ${input.url}`,
    `--- BEGIN PAGE TEXT (truncated to ${maxInputChars} chars) ---`,
    trimmed,
    `--- END PAGE TEXT ---`,
  ].join("\n");

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    model,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 1024,
    projectId: input.projectId,
    endpoint: "research/summarize",
  });

  return parseOrFallback(text, input.url);
}

function parseOrFallback(raw: string, url: string): SourceSummary {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Partial<SourceSummary>;
    return {
      url: obj.url ?? url,
      title: typeof obj.title === "string" ? obj.title : "",
      summary: typeof obj.summary === "string" ? obj.summary : "",
      key_claims: Array.isArray(obj.key_claims) ? obj.key_claims.filter((c) => typeof c === "string") : [],
      format_patterns: Array.isArray(obj.format_patterns)
        ? obj.format_patterns.filter((c) => typeof c === "string")
        : [],
      why_resonates: typeof obj.why_resonates === "string" ? obj.why_resonates : "",
      source_quality: ["primary", "secondary", "marketing", "low"].includes(obj.source_quality as string)
        ? (obj.source_quality as SourceSummary["source_quality"])
        : "low",
      freshness: ["fresh", "evergreen", "stale", "unknown"].includes(obj.freshness as string)
        ? (obj.freshness as SourceSummary["freshness"])
        : "unknown",
    };
  } catch {
    return {
      url,
      title: "",
      summary: "No usable content (summarizer parse error)",
      key_claims: [],
      format_patterns: [],
      why_resonates: "",
      source_quality: "low",
      freshness: "unknown",
    };
  }
}
