// Stage-1 planner: turns a user niche query into 15-25 diverse search
// subqueries that, when fan-out searched, cover the breadth of the niche.
//
// One LLM call. JSON output. Hard caps applied on parse — the orchestrator
// never trusts a runaway plan.

import { callLLM } from "../providers/llm.js";

export type PlanInput = {
  query: string;
  /** Optional brief / extra context appended to the system prompt. */
  context?: string;
  /** Hard upper bound on subqueries returned. */
  maxSubqueries?: number;
  /** OpenRouter model id. */
  model?: string;
  projectId?: string;
};

export type ResearchPlan = {
  query: string;
  intent: string;
  audience_jtbd: string;
  platforms: string[];
  subqueries: PlannedQuery[];
};

export type PlannedQuery = {
  query: string;
  category:
    | "discovery"
    | "platform-scan"
    | "format-patterns"
    | "why-viral"
    | "top-creators"
    | "tactics"
    | "audience-pain"
    | "competitor"
    | "data-trends";
  rationale: string;
};

const SYSTEM_PROMPT = `You are the planner for a deep-research pipeline focused on viral content analysis.

The user gives you a topic / niche / brief. Your job is to emit a JSON plan that, when each subquery is run through a keyless web search engine and the top 5-10 results are fetched and summarized, will collectively cover:

1. WHAT viral formats currently work in this niche (concrete examples, top creators, recurring hooks, runtime ranges).
2. WHY they go viral (psychology, distribution algorithms, audience JTBD).
3. WHICH platforms matter most for this niche (TikTok / YouTube Shorts / Instagram Reels / longform YouTube / X / Reddit) and how they differ.
4. HOW the user should act — concrete playbook items, hook templates, format choices, content cadence.
5. WHAT competitors / reference creators are doing and how they're growing.

Output STRICT JSON matching this TypeScript type. No prose, no markdown, no commentary.

type ResearchPlan = {
  query: string;             // echo the user input verbatim
  intent: string;            // one sentence: what the user really wants from this research
  audience_jtbd: string;     // one sentence: who the end-content is for and what job they hire it to do
  platforms: string[];       // ordered list of platforms most relevant for this niche
  subqueries: Array<{
    query: string;           // a single web-search-ready string in English
    category: "discovery" | "platform-scan" | "format-patterns" | "why-viral" | "top-creators" | "tactics" | "audience-pain" | "competitor" | "data-trends";
    rationale: string;       // 1 sentence: what hole in coverage this query plugs
  }>;
}

Rules for subqueries:
- Output AT LEAST 18 and AT MOST 25 subqueries.
- Cover every category at least once. Aim for 2-4 per category.
- Each query must be specific. Bad: "viral videos". Good: "viral 30-second TikTok hooks for learning English in 2025".
- Mix entity-specific queries ("Linguamarina YouTube format analysis") with pattern-level queries ("comprehensible input TikTok format breakdown").
- Include at least 2 platform-scoped queries per major platform you listed.
- Always include at least 1 query that surfaces academic / journalist coverage ("psychology of language learning content virality").
- All queries in English (even if the user asked in another language). Translate concepts if needed.
- Do not include any URL. Search engines, not direct fetches.
`;

function tryParse(raw: string): ResearchPlan | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as ResearchPlan;
  } catch {
    return null;
  }
}

export async function planResearch(input: PlanInput): Promise<ResearchPlan> {
  const maxSubqueries = input.maxSubqueries ?? 25;
  const model = input.model ?? "anthropic/claude-sonnet-4.6";

  const userParts = [
    `Niche / topic / brief:`,
    input.query.trim(),
  ];
  if (input.context && input.context.trim()) {
    userParts.push("", "Additional context:", input.context.trim());
  }

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userParts.join("\n") },
    ],
    model,
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 4096,
    projectId: input.projectId,
    endpoint: "research/planner",
  });

  const parsed = tryParse(text);
  if (!parsed || !Array.isArray(parsed.subqueries)) {
    throw new Error(
      `planner: model did not return valid JSON plan (first 300 chars): ${text.slice(0, 300)}`,
    );
  }

  return {
    query: parsed.query ?? input.query,
    intent: parsed.intent ?? "",
    audience_jtbd: parsed.audience_jtbd ?? "",
    platforms: Array.isArray(parsed.platforms) ? parsed.platforms : [],
    subqueries: parsed.subqueries
      .filter(
        (s) =>
          s && typeof s.query === "string" && typeof s.category === "string",
      )
      .slice(0, maxSubqueries),
  };
}
