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
  video_discovery_queries: VideoDiscoveryQuery[];
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

export type VideoDiscoveryQuery = {
  query: string;
  platform: "tiktok" | "youtube-shorts" | "youtube" | "instagram-reel" | "x" | "reddit" | "any";
  rationale: string;
};

const SYSTEM_PROMPT = `You are the planner for a deep-research pipeline focused on viral VERTICAL short-form video analysis. The pipeline studies TikTok, Instagram Reels, and YouTube Shorts ONLY. Long-form YouTube (>3 minutes), horizontal landscape video, and traditional desktop-style YouTube content are OUT OF SCOPE.

The user gives you a topic / niche / brief. Your job is to emit a JSON plan that drives TWO parallel research tracks:

TRACK A — Web/text research. Each subquery is run through a keyless web search engine; top 5-10 results are fetched and summarized to cover:
1. WHAT viral formats currently work in this niche (concrete examples, top creators, recurring hooks, runtime ranges).
2. WHY they go viral (psychology, distribution algorithms, audience JTBD).
3. WHICH platforms matter most for this niche AMONG TIKTOK / INSTAGRAM REELS / YOUTUBE SHORTS (the three vertical short-form platforms — never mention long-form YouTube, podcasts, blog posts as a platform).
4. HOW the user should act — concrete playbook items, hook templates, format choices, content cadence.
5. WHAT competitors / reference creators are doing and how they're growing.

TRACK B — Video discovery. Each video_discovery_query is a web search engineered to surface ACTUAL vertical short-form video URLs (YouTube Shorts under /shorts/, TikTok videos, Instagram Reels under /reel/). We then download the video file itself and feed it to a vision model with native video understanding that reads scenes, on-screen text, and audio with millisecond precision. The combined corpus of 100-200 actual viral vertical videos analyzed beat-by-beat is the headline differentiator vs. blog-only deep research.

Output STRICT JSON matching this TypeScript type. No prose, no markdown, no commentary.

type ResearchPlan = {
  query: string;
  intent: string;
  audience_jtbd: string;
  platforms: string[];
  subqueries: Array<{
    query: string;
    category: "discovery" | "platform-scan" | "format-patterns" | "why-viral" | "top-creators" | "tactics" | "audience-pain" | "competitor" | "data-trends";
    rationale: string;
  }>;
  video_discovery_queries: Array<{
    query: string;            // web-search string engineered to return short-form video URLs
    platform: "tiktok" | "youtube-shorts" | "youtube" | "instagram-reel" | "x" | "reddit" | "any";
    rationale: string;        // why this query surfaces the most relevant viral videos for the niche
  }>;
}

Rules for subqueries (Track A):
- Output AT LEAST 16 and AT MOST 22.
- Cover every category at least once. Aim for 2-4 per category.
- Specific over generic ("Linguamarina YouTube format analysis" not "viral videos").
- All queries in English (translate concepts if user asked in another language).
- Do not include URLs.

Rules for video_discovery_queries (Track B):
- Output AT LEAST 16 and AT MOST 24 queries.
- These queries are fed to two backends: (a) yt-dlp's native YouTube search and (b) a generic web search engine. Therefore: NO "site:" or "inurl:" operators (they degrade the yt-dlp path) and NO quoted exact-phrase tokens.
- EVERY query must explicitly mark it as vertical short-form. Append one of: "shorts", "tiktok", "reels", "vertical", "short video". This biases both backends toward sub-180s vertical content and away from long-form podcasts / desktop tutorials.
- Distribution: at least 5 queries scoped to TikTok ("tiktok"), at least 5 scoped to YouTube Shorts ("shorts" or "youtube shorts"), at least 4 scoped to Instagram Reels ("reels" or "instagram reel"), plus 2-4 cross-platform ("vertical viral").
- Include 3-5 creator-name-anchored queries when you can name plausibly-real top short-form creators in the niche (bare name, no '@', followed by "tiktok" or "shorts" or "reels").
- Vary the angle: hook-pattern, format-pattern, trend-cycle, sub-niche, year-anchored.
- Concrete over generic: "english pronunciation mistake tiktok 2026" beats "english tiktok".
- All queries in English. No URLs in the queries themselves.
- "platform": pick the platform the query is engineered for, or "any" if cross-platform. Never "youtube" (long-form) — only "youtube-shorts".
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
    video_discovery_queries: Array.isArray(parsed.video_discovery_queries)
      ? parsed.video_discovery_queries
          .filter(
            (s): s is VideoDiscoveryQuery =>
              !!s && typeof (s as VideoDiscoveryQuery).query === "string",
          )
          .slice(0, 20)
      : [],
  };
}
