// Final synthesis: turns the corpus of per-source summaries into a long-form
// markdown report with inline citations. The citation verifier runs after
// this step against the source registry; fabricated URLs get flagged.

import { callLLM } from "../providers/llm.js";
import type { SourceSummary } from "./summarizer.js";
import type { VideoSummary } from "./video-summarizer.js";

export type SynthInput = {
  query: string;
  plan: {
    intent: string;
    audience_jtbd: string;
    platforms: string[];
  };
  summaries: SourceSummary[];
  videoSummaries?: VideoSummary[];
  model?: string;
  projectId?: string;
  /** Strict mode: model is forbidden from citing URLs not in the summaries list. */
  citationsAllowList?: string[];
};

const SYSTEM = `You are the senior analyst writing a deep-research report on viral short-form video for a specific niche.

You will be given TWO corpora:
- TEXT CORPUS: web pages (blogs, journalism, marketing posts) summarized with key claims and format patterns.
- VIDEO CORPUS: actual viral short-form videos that were downloaded, frame-sampled, and analyzed beat-by-beat by a vision model. For each video you get: URL, platform, uploader, view count, runtime, virality score, hook, body, closer, visual style, audio use, editing pace, why-works, and a replicable template.

The video corpus is the SOURCE OF TRUTH for "what actually works." The text corpus is supplementary context for psychology, audience JTBD, and broader trend framing. When the two disagree, defer to the video corpus.

Write a report in the following STRICT structure:

# {Niche} — Deep Research Report

## Executive summary
4-6 punchy bullets, each cited inline with a URL. At least 2 must reference the video corpus directly (cite the video URL).

## What's working right now
A taxonomy of 5-10 distinct viral formats actually observed in the video corpus. CLUSTER videos that share the same hook_pattern + body structure into one format. For each format:
### Format name (concrete, e.g. "Mistake-correction micro-lesson with on-screen quote")
- **Where it lives:** platforms, runtime range, posting cadence inferred from the cluster.
- **Hook structure:** quote a real hook from one of the clustered videos.
- **Body structure:** the beat-by-beat formula shared across the cluster.
- **Closer:** the dominant ending pattern in the cluster.
- **Reference videos (cite verbatim URLs from the video corpus):** list 3-6 video URLs that exemplify this format. For each, include uploader handle and view count if available.
- **Why it works:** psychology + algorithmic distribution + audience JTBD. 2-3 sentences.

## Per-video micro-breakdowns
List the top 12-20 videos from the video corpus (ranked by virality score, highest first). For each:
### {uploader} — {one-line title} ({views} views, {ageDays}d)
- **URL:** {video URL, inline}
- **Hook (0-3s):** exact verbatim hook.
- **Format:** the format-name label from the taxonomy above.
- **Why this one popped:** 1-2 sentences specific to THIS video.
- **Replicable template:** the formula the user can plug their own niche-specific content into.

## Why these formats resonate
A cross-cluster synthesis grounded in both corpora. Cite the text corpus for psychology/algorithm framing and the video corpus for concrete examples.

## Audience & JTBD
Who the end-viewer is, the job they hire this content to do, the tone/register they expect.

## Competitive landscape
Top 8-15 creators / accounts dominating this niche, ranked by video-corpus virality where possible. For each: handle, platform, signature format(s), one cited video URL.

## Playbook for the user
8-12 action items ranked by impact-per-effort. For each:
- **Move:** what to do.
- **Format anchor:** which format from the taxonomy above this maps to.
- **First 24h test:** a concrete experiment with a measurable success criterion.

## Risks, anti-patterns, and what to avoid
What kills reach in this niche. Cite from the video corpus where the failure mode is observable.

## Open questions for follow-up
4-7 specific questions the corpus did not resolve.

## Sources
A numbered list of every URL cited in the report. Use the exact URLs from the supplied corpora — do not invent, rephrase, or rewrite URLs.

CITATION RULES (hard):
- EVERY non-obvious claim must be cited inline with a parenthetical URL like (https://example.com/x).
- The URL in every citation must match an entry in either the text corpus or the video corpus VERBATIM. Do not invent URLs. Do not fix typos. Do not append /amp, /mobile, or /v=… variants.
- Each video in the Per-video micro-breakdowns section MUST cite its video URL inline.
- Do not cite the same URL more than 5 times across the report — vary sources.

LENGTH: 2500-5000 words. Be specific and dense; no filler. No emojis. English only.
`;

export async function synthesizeReport(input: SynthInput): Promise<string> {
  const model = input.model ?? "anthropic/claude-sonnet-4.6";

  const textCorpus = input.summaries
    .map((s, i) => {
      return [
        `### Text source ${i + 1}`,
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

  const videoCorpus = (input.videoSummaries ?? [])
    .slice()
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .map((v, i) => {
      return [
        `### Video ${i + 1} (virality score ${v.viralityScore.toFixed(2)})`,
        `URL: ${v.url}`,
        `Platform: ${v.platform} | Uploader: ${v.uploader}`,
        `Title: ${v.title}`,
        `Runtime: ${v.durationSec}s | Views: ${v.views} | Age: ${v.ageDays}d | Lang: ${v.language}`,
        `Hook (0-3s): ${v.hook_first_3s}`,
        `Hook pattern label: ${v.hook_pattern}`,
        `Body: ${v.body_structure}`,
        `Closer: ${v.closer}`,
        `On-screen text: ${v.on_screen_text_style}`,
        `Visual style: ${v.visual_style}`,
        `Audio: ${v.audio_use}`,
        `Editing pace: ${v.editing_pace}`,
        `Why works: ${v.why_works}`,
        `Replicable template: ${v.replicable_template}`,
        v.hashtags.length ? `Hashtags: ${v.hashtags.join(" ")}` : "",
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
    `## VIDEO CORPUS (${input.videoSummaries?.length ?? 0} videos analyzed beat-by-beat — SOURCE OF TRUTH)`,
    ``,
    videoCorpus || "(no video corpus available — write report from text corpus only and note this in Open Questions)",
    ``,
    `## TEXT CORPUS (${input.summaries.length} sources — context only)`,
    ``,
    textCorpus,
  ].join("\n");

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    model,
    temperature: 0.35,
    maxTokens: 12000,
    projectId: input.projectId,
    endpoint: "research/synthesize",
  });

  return text.trim();
}
