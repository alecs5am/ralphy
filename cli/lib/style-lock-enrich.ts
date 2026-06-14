// LLM-enrichment pass for the STYLE_LOCK.md scaffold (#408).
//
// The single `callLLM()` jsonMode call that derives the register / pacing /
// do-not-do prose the deterministic scaffold can't infer from the plan alone.
// Routed through `callLLM()` (AGENTS.md invariant #1 — no raw provider calls)
// with `projectId` + `endpoint` so it logs a `generations.jsonl` row.
//
// The verb injects this fn and falls back to `deterministicStyleLock()` on any
// failure (malformed JSON / network / `--no-llm`), so this module may throw
// freely. Tests pass their own stub (no live network) instead of `mock.module`.

import { callLLM } from "./providers/llm.js";
import {
  STYLE_LOCK_FIELDS,
  type StyleLockContent,
  type StyleLockContext,
} from "./style-lock.js";

/** Default model for the enrichment pass — cheap, multilingual, JSON-reliable. */
const DEFAULT_STYLE_LOCK_MODEL = "google/gemini-2.5-flash";

const FIELD_LIST = STYLE_LOCK_FIELDS.map((f) => `  "${f.key}": "<${f.prompt}>"`).join(",\n");

const STYLE_LOCK_PROMPT = `You are a UGC art director freezing the STYLE LOCK for a content project BEFORE any image/video is generated. The style lock is the register downstream prompts AND the post-render quality gate both score against, so it must be concrete and opinionated, never generic.

Brief: "{{BRIEF}}"
Content mode: {{MODE}}
Matched template: {{TEMPLATE}}
Applicable guideline slugs: {{GUIDELINES}}
Register the plan already inferred: {{REGISTER}}
Vibe: {{VIBE}}
Aspect / platform: {{ASPECT}} / {{PLATFORM}}
Benchmark source recorded in the plan: {{BENCHMARK}}

Return ONLY this JSON object (no preamble, no markdown fences). Each value is concrete, English prose — name palettes, lens/camera language, second-per-shot cadences, specific anti-patterns. Avoid platitudes ("make it engaging"). If you genuinely cannot determine a field, leave a short "TODO: <what to decide>" instead of inventing detail.
{
${FIELD_LIST}
}

Rules:
- visualRegister: name the palette, lighting, lens/camera, grain/texture, and the realism axis (photoreal ↔ stylized).
- pacing: for video give seconds-per-shot + whether static holds are allowed; for stills give per-frame information density.
- doNotDo: this is the load-bearing field — list the explicit anti-patterns and register breakers, not generic advice.
- benchmarkRefs: cite the matched template, the guideline slugs, and any reference URL/handle (if a URL is present, note it must be crawled via researcher / site-grounding, not invented).
- modelImplications: note which model classes hit this look and any provider filter to route around. Do not assert a specific model id is "best" — defer to MODELS.md.
- Keep every value under ~6 sentences.`;

/**
 * Production enrichment fn for the style lock. Builds the prompt from the
 * resolved context, calls the LLM in jsonMode (logging a generations.jsonl row
 * via projectId + endpoint), and returns the parsed partial content. The verb
 * merges this over the deterministic scaffold and validates per-field, so this
 * may return a partial object or throw.
 */
export async function llmEnrichStyleLock(
  ctx: StyleLockContext,
  opts: { model?: string } = {},
): Promise<Partial<StyleLockContent>> {
  const prompt = STYLE_LOCK_PROMPT.replace("{{BRIEF}}", (ctx.brief ?? "").replace(/"/g, '\\"'))
    .replace("{{MODE}}", ctx.contentMode ?? "(unclassified)")
    .replace("{{TEMPLATE}}", ctx.templateSlug ?? "(freeform — none)")
    .replace("{{GUIDELINES}}", (ctx.guidelineSlugs ?? []).join(", ") || "(none mapped)")
    .replace("{{REGISTER}}", ctx.register ?? "(not inferred)")
    .replace("{{VIBE}}", ctx.vibe ?? "(not inferred)")
    .replace("{{ASPECT}}", ctx.aspect ?? "9:16")
    .replace("{{PLATFORM}}", ctx.platform ?? "tiktok")
    .replace("{{BENCHMARK}}", ctx.benchmarkSource ?? "(none)");

  const { text } = await callLLM({
    messages: [{ role: "user", content: prompt }],
    model: opts.model ?? DEFAULT_STYLE_LOCK_MODEL,
    temperature: 0.3,
    jsonMode: true,
    projectId: ctx.projectId,
    endpoint: "style-lock-enrich",
  });

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  // Keep only the known string fields — drop anything the model hallucinated.
  const result: Partial<StyleLockContent> = {};
  for (const f of STYLE_LOCK_FIELDS) {
    const v = parsed[f.key];
    if (typeof v === "string" && v.trim().length > 0) result[f.key] = v.trim();
  }
  return result;
}
