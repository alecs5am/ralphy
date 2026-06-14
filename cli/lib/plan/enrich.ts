// LLM-enrichment pass for the production-plan builder (#407).
//
// The single `callLLM()` jsonMode call that infers the brief-derived reasoning
// the deterministic half can't: target-audience language, register, scene
// count + duration, the first checkpoint, and the one-line vibe. Routed through
// `callLLM()` (AGENTS.md invariant #1 — no raw provider calls) with `projectId`
// + `endpoint` so it logs a `generations.jsonl` row.
//
// The builder takes an injectable `enrich` fn; this module is the production
// wiring of it. Tests pass their own stub (no live network) instead.

import { callLLM } from "../providers/llm.js";
import type { EnrichmentContext } from "./build.js";

/** Default model for the enrichment pass — cheap, multilingual, JSON-reliable. */
const DEFAULT_ENRICH_MODEL = "google/gemini-2.5-flash";

const ENRICH_PROMPT = `You are a UGC video/image production planner. Given a creative brief and the deterministic context already resolved (media format, content mode, matched template), infer the planning fields a producer needs BEFORE any generation.

Brief: "{{BRIEF}}"
Resolved media format: {{FORMAT}}
Content mode: {{MODE}}
Matched template: {{TEMPLATE}}

Return ONLY this JSON object (no preamble, no markdown fences):
{
  "targetAudienceLanguage": "<the language the deliverable's copy / VO should be in, full English name e.g. 'English', 'Russian', 'Spanish'. Infer from the brief; default 'English' when unstated>",
  "register": "<short style/register label, e.g. 'photoreal UGC selfie', 'PS1 horror', 'clean DTC studio'>",
  "sceneCount": <integer number of scenes for a video, or 1 for a single still / image deliverable>,
  "durationSec": <total seconds for a video, or 0 for a still / image deliverable>,
  "firstCheckpoint": "<the first thing to show the user before bulk generation, e.g. 'scene-01 anchor -> wait for go'>",
  "vibe": "<one short sentence capturing the creative vibe>"
}

Rules:
- For image / poster / fb-creative / carousel formats, sceneCount is the number of stills (1 unless the brief asks for several) and durationSec is 0.
- For video / motion-design formats, pick a sensible scene count (typically 4-10 for a short) and total duration (typically 15-60s for a short).
- Keep targetAudienceLanguage as a full English language NAME, never a code.`;

/**
 * Production enrichment fn. Builds the prompt from the resolved context, calls
 * the LLM in jsonMode (logging a generations.jsonl row via projectId +
 * endpoint), and returns the parsed JSON. The builder validates the result
 * against `LlmEnrichmentSchema` and falls back to heuristics on any failure, so
 * this fn may throw freely.
 */
export async function llmEnrich(
  ctx: EnrichmentContext,
  opts: { model?: string } = {},
): Promise<unknown> {
  const prompt = ENRICH_PROMPT.replace("{{BRIEF}}", ctx.brief.replace(/"/g, '\\"'))
    .replace("{{FORMAT}}", ctx.format)
    .replace("{{MODE}}", ctx.contentMode ?? "(unclassified)")
    .replace("{{TEMPLATE}}", ctx.templateSlug ?? "(freeform — none)");

  const { text } = await callLLM({
    messages: [{ role: "user", content: prompt }],
    model: opts.model ?? DEFAULT_ENRICH_MODEL,
    temperature: 0.2,
    jsonMode: true,
    projectId: ctx.projectId,
    endpoint: "production-plan-enrich",
  });

  // Strip code fences if the model added them despite instructions.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return JSON.parse(cleaned);
}
