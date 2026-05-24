// Final synthesis: turns the corpus of per-source summaries into a long-form
// markdown report with inline citations. The citation verifier runs after
// this step against the source registry; fabricated URLs get flagged.

import { callLLM } from "../providers/llm.js";
import type { SourceSummary } from "./summarizer.js";

export type SynthInput = {
  query: string;
  plan: {
    intent: string;
    audience_jtbd: string;
    platforms: string[];
  };
  summaries: SourceSummary[];
  model?: string;
  projectId?: string;
  /** Strict mode: model is forbidden from citing URLs not in the summaries list. */
  citationsAllowList?: string[];
};

const SYSTEM = `You are the senior analyst writing a deep-research report on viral content for a specific niche.

You will be given:
- The user's niche / brief.
- The intent + audience JTBD inferred by the planner.
- A list of source summaries, each with a URL, title, key claims, format patterns observed, and a why-it-resonates note.

Write a report in the following STRICT structure:

# {Niche} — Deep Research Report

## Executive summary
3-5 punchy bullet points. Each bullet must be concrete, novel, and cited inline with a URL in parentheses.

## What's working right now
A taxonomy of 4-8 distinct viral formats currently working in this niche. For each format:
### Format name (e.g. "30-sec immersive POV with on-screen translation")
- **Where it lives:** which platform(s), runtime range, posting cadence.
- **Hook structure:** the first 1-3 seconds, the pattern interrupt.
- **Body structure:** what happens 3-15s, what holds attention.
- **Closer:** how it ends — loop, hard cut, CTA, cliffhanger.
- **Reference creators / examples:** name 2-4 with URLs.
- **Why it works:** psychology + algorithmic distribution + audience JTBD. 2-3 sentences.

## Why these formats resonate
A cross-format synthesis. What psychological / algorithmic mechanisms recur across the formats you broke down. Cite specific sources.

## Audience & JTBD
Who the end-viewer is, what job they hire this content to do, what tone / register they expect, what makes them save and share.

## Competitive landscape
Top 5-10 creators / accounts dominating this niche right now. For each: handle, platform, signature format, what they do better than others, growth signal if mentioned. Cite the source that surfaced them.

## Playbook for the user
Action items the user can ship this week. For each:
- **Move:** what to do.
- **Why it works for this niche:** tie it back to a format or mechanism above.
- **First 24h test:** a concrete experiment with a measurable success criterion.

## Risks, anti-patterns, and what to avoid
What kills reach in this niche. Be specific.

## Open questions for follow-up
3-6 questions the corpus did not resolve.

## Sources
A numbered list of every URL cited in the report. Use the exact URLs from the source summaries — do not invent, rephrase, or rewrite URLs.

CITATION RULES (hard):
- EVERY non-obvious claim must be cited inline with a parenthetical URL like (https://example.com/x).
- The URL in every citation must match an entry in the supplied source summaries verbatim. Do not invent URLs. Do not fix typos. Do not append /amp or /mobile.
- Do not cite the same URL more than 4 times across the report — vary your sources.
- Aim for at least one citation per paragraph in body sections.

LENGTH: 1800-3500 words. Be specific and dense; no filler. No emojis. English only.
`;

export async function synthesizeReport(input: SynthInput): Promise<string> {
  const model = input.model ?? "anthropic/claude-sonnet-4.6";

  const corpus = input.summaries
    .map((s, i) => {
      return [
        `### Source ${i + 1}`,
        `URL: ${s.url}`,
        `Title: ${s.title}`,
        `Quality: ${s.source_quality} | Freshness: ${s.freshness}`,
        `Summary: ${s.summary}`,
        s.key_claims.length
          ? `Key claims:\n- ${s.key_claims.join("\n- ")}`
          : "",
        s.format_patterns.length
          ? `Format patterns:\n- ${s.format_patterns.join("\n- ")}`
          : "",
        s.why_resonates ? `Why resonates: ${s.why_resonates}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const user = [
    `Niche / brief: ${input.query}`,
    `Inferred intent: ${input.plan.intent}`,
    `Audience JTBD: ${input.plan.audience_jtbd}`,
    `Platforms ordered by relevance: ${input.plan.platforms.join(", ")}`,
    ``,
    `## Source corpus (${input.summaries.length} sources)`,
    ``,
    corpus,
  ].join("\n");

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    model,
    temperature: 0.35,
    maxTokens: 8192,
    projectId: input.projectId,
    endpoint: "research/synthesize",
  });

  return text.trim();
}
