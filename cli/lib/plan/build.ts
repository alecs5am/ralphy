// Production-plan builder — the testable core of `ralphy project plan` (#407).
//
// `buildProductionPlan()` turns a chat brief into a schema-valid ProductionPlan
// WITHOUT shelling out: the deterministic half (content-mode, format/template
// match, model stack → cost estimate) runs in-process, and the LLM-enrichment
// half is INJECTED via `opts.enrich` so a test can stub it (no live network, no
// `mock.module` on a shared lib — per #072). In production the verb wires
// `opts.enrich` to a `callLLM()` jsonMode pass that logs a generations.jsonl
// row (projectId + endpoint), and `opts.candidates` to the two-tier template
// catalog (workspace + public library).
//
// Split:
//   • DETERMINISTIC (here, no LLM): classifyContentMode(brief),
//     suggestTemplates(brief, candidates) for the format/template match, and
//     deriveModelStack()/estimateCost() from the catalog.
//   • LLM ENRICHMENT (injected): audience-language, register, scene-count +
//     duration reasoning, first checkpoint, vibe — validated against
//     LlmEnrichmentSchema before merge.
//
// The verb owns the I/O (writing PRODUCTION_PLAN.md + production-plan.json,
// auto-versioning). This module is pure data → data.

import {
  classifyContentMode,
  getContentMode,
  type ContentModeEntry,
} from "../content-modes.js";
import { suggestTemplates, type Candidate, type SuggestResult } from "../templater/suggest.js";
import { estimateVideoCostUsd } from "../or-catalog.js";
import {
  LlmEnrichmentSchema,
  ProductionPlanSchema,
  type LlmEnrichment,
  type PlanModel,
  type ProductionPlan,
} from "../schemas/production-plan.js";
import type { TemplateFormat } from "../schemas/template.js";

// ─── Default model stack + price table ───────────────────────────────────────
//
// Image prices are hand-maintained to mirror MODELS.md prose (no catalog
// per-image figure exists). Video prices come from the catalog
// (`estimateVideoCostUsd`). VO / music / sfx are flat ballparks.

/** Per-image USD ballpark by model id (mirrors MODELS.md image-model table). */
const IMAGE_PRICE_USD: Record<string, number> = {
  "google/gemini-3-pro-image-preview": 0.15,
  "openai/gpt-5.4-image-2": 0.2,
  "openai/gpt-5-image-mini": 0.08,
  "google/gemini-2.5-flash-image": 0.02,
};

const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image-preview";
const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
/** Flat ElevenLabs ballparks — one VO pass / one music bed / one sfx hit. */
const VOICEOVER_COST_USD = 0.05;
const MUSIC_COST_USD = 0.1;

function imagePrice(model: string): number {
  return IMAGE_PRICE_USD[model] ?? 0.15;
}

// ─── Format / aspect / craft-overlay helpers ─────────────────────────────────

/** Niche craft-overlay skills keyed by content mode (AGENTS.md routing table). */
const CRAFT_OVERLAY_BY_MODE: Partial<Record<string, string[]>> = {
  "ugc-review": ["ugc-ad"],
  "unboxing-ugc": ["ugc-unboxing"],
  "social-carousel": ["carousel"],
  "ad-creative-pack": ["fb-creatives"],
  "hero-banner": ["poster"],
  "podcast-video": ["audio-explainer"],
};

/** Default aspect ratio for a format — videos/carousels are 9:16, banners wide. */
function defaultAspectForFormat(format: TemplateFormat): string {
  if (format === "fb-creative") return "1:1";
  if (format === "poster") return "4:5";
  return "9:16";
}

/** Resolve the media format for the plan: the matched template's format wins,
 *  else the content-mode's primary format, else a video fallback. */
function resolveFormat(
  modeEntry: ContentModeEntry | undefined,
  matchedFormat: TemplateFormat | undefined,
): TemplateFormat {
  if (matchedFormat) return matchedFormat;
  if (modeEntry) return modeEntry.templateLookup.primaryFormat;
  return "video";
}

// ─── Model-stack derivation + cost estimate ──────────────────────────────────

/**
 * Derive the model stack from the resolved format + scene count. Image/poster/
 * carousel formats need only an image model (+ LLM); video formats add a video
 * model, VO, and music. Pure — no catalog network call (catalog price tables
 * are in-process).
 */
export function deriveModelStack(
  format: TemplateFormat,
  sceneCount: number,
  durationSec: number,
): PlanModel[] {
  const stack: PlanModel[] = [];
  const isVideo = format === "video" || format === "motion-design";

  stack.push({
    role: "image",
    model: DEFAULT_IMAGE_MODEL,
    unitCostUsd: imagePrice(DEFAULT_IMAGE_MODEL),
    note: "scene anchors / hero stills (multi-ref default)",
  });

  if (isVideo) {
    stack.push({
      role: "video",
      model: DEFAULT_VIDEO_MODEL,
      unitCostUsd: estimateVideoCostUsd(DEFAULT_VIDEO_MODEL, 1),
      note: "image-to-video clips, per-second price",
    });
    stack.push({
      role: "voiceover",
      model: "elevenlabs-tts",
      unitCostUsd: VOICEOVER_COST_USD,
      note: "per-VO pass (Kling --audio for EN; ElevenLabs otherwise)",
    });
    stack.push({
      role: "music",
      model: "elevenlabs-music",
      unitCostUsd: MUSIC_COST_USD,
      note: "one instrumental bed, post-mixed in the editor stage",
    });
  }

  return stack;
}

/**
 * Estimate cost range + wall-clock from the stack + scene count. Low end = one
 * pass per slot; high end = ~1.6× to budget for re-rolls (AGENTS.md append-only
 * auto-version reality). Wall-clock is a coarse per-slot ballpark.
 */
export function estimateCost(
  stack: PlanModel[],
  format: TemplateFormat,
  sceneCount: number,
  durationSec: number,
): { costLowUsd: number; costHighUsd: number; wallClockMin: number; basis: string } {
  const isVideo = format === "video" || format === "motion-design";
  let low = 0;
  const parts: string[] = [];

  for (const m of stack) {
    if (m.role === "image") {
      // One anchor per scene (or one hero still for an image deliverable).
      const n = Math.max(1, sceneCount);
      low += m.unitCostUsd * n;
      parts.push(`${n}× image @ $${m.unitCostUsd.toFixed(2)}`);
    } else if (m.role === "video") {
      // Per-second price × total duration (split across scenes downstream).
      const secs = durationSec > 0 ? durationSec : sceneCount * 5;
      low += m.unitCostUsd * secs;
      parts.push(`${secs}s video @ $${m.unitCostUsd.toFixed(3)}/s`);
    } else if (m.role === "voiceover") {
      const n = Math.max(1, sceneCount);
      low += m.unitCostUsd * n;
      parts.push(`${n}× VO @ $${m.unitCostUsd.toFixed(2)}`);
    } else if (m.role === "music") {
      low += m.unitCostUsd;
      parts.push(`1× music @ $${m.unitCostUsd.toFixed(2)}`);
    }
  }

  const high = Number((low * 1.6).toFixed(2));
  // Wall-clock: ~0.5 min/image + ~1.5 min/video-scene + 2 min for VO/music/render.
  const wallClock = isVideo
    ? Math.max(8, Math.round(sceneCount * 2 + 4))
    : Math.max(2, Math.round(Math.max(1, sceneCount) * 0.75 + 1));

  return {
    costLowUsd: Number(low.toFixed(2)),
    costHighUsd: high,
    wallClockMin: wallClock,
    basis: parts.join(" + ") + "; high = low × 1.6 (re-roll budget)",
  };
}

// ─── The builder ──────────────────────────────────────────────────────────────

export interface BuildPlanInput {
  projectId: string;
  brief: string;
  /** Aspect override (else derived from the resolved format). */
  aspect?: string;
  /** Platform override (else the content-mode default / tiktok). */
  platform?: string;
}

export interface BuildPlanOptions {
  /**
   * The two-tier template catalog (workspace + public library) to rank against.
   * Defaults to `[]` (freeform) so the builder stays pure for tests; the verb
   * passes the real catalog.
   */
  candidates?: Candidate[];
  /**
   * LLM enrichment fn. Receives the brief + the deterministic context and
   * returns the enrichment JSON (validated against LlmEnrichmentSchema). When
   * omitted (`--no-llm` / tests / offline), the builder falls back to
   * deterministic heuristics and marks `register`/`vibe` empty.
   */
  enrich?: (ctx: EnrichmentContext) => Promise<unknown>;
  /** Max template suggest results to consider. Default 3. */
  suggestLimit?: number;
  /**
   * Forwarded to `suggestTemplates`. DEFAULTS TO `true` (keyword-only) so the
   * format/template match stays deterministic during planning — the plan's one
   * LLM call is the enrichment pass, not a second suggest rerank. Set `false`
   * to opt the multilingual/paraphrase suggest rerank back in.
   */
  disableLlmSuggest?: boolean;
  /** Injectable suggest LLM fn (only used when `disableLlmSuggest` is false). */
  suggestLlmFn?: (prompt: string) => Promise<string>;
}

/** Context handed to the enrichment fn so the LLM reasons over the resolved deterministic state. */
export interface EnrichmentContext {
  projectId: string;
  brief: string;
  format: TemplateFormat;
  contentMode: string | null;
  templateSlug: string | null;
}

/** Deterministic fallback when no LLM enrichment runs. */
function heuristicEnrichment(format: TemplateFormat): LlmEnrichment {
  const isVideo = format === "video" || format === "motion-design";
  const isStill = format === "image" || format === "poster" || format === "fb-creative";
  return LlmEnrichmentSchema.parse({
    targetAudienceLanguage: "English",
    register: "",
    sceneCount: isVideo ? 5 : 1,
    durationSec: isVideo ? 25 : 0,
    firstCheckpoint: isStill
      ? "first still → wait for go before the rest"
      : "scene-01 anchor → wait for go before batching the rest",
    vibe: "",
  });
}

/**
 * Build a validated ProductionPlan from a brief. Deterministic parts run
 * in-process; the LLM enrichment is injected (and validated). The returned
 * object passes `ProductionPlanSchema.parse`.
 */
export async function buildProductionPlan(
  input: BuildPlanInput,
  opts: BuildPlanOptions = {},
): Promise<{ plan: ProductionPlan; suggest: SuggestResult }> {
  const brief = input.brief ?? "";
  const candidates = opts.candidates ?? [];

  // ── Deterministic: content-mode (#412) ──
  const modeClass = classifyContentMode(brief);
  const modeEntry = modeClass.mode ? getContentMode(modeClass.mode) : undefined;

  // ── Deterministic: format / template match (suggest) ──
  // Keyword-only by default — the plan's single LLM call is the enrichment
  // pass below, not a second suggest rerank. Opt the rerank in via
  // `disableLlmSuggest: false`.
  const suggest = await suggestTemplates(brief, candidates, {
    limit: opts.suggestLimit ?? 3,
    disableLlm: opts.disableLlmSuggest ?? true,
    llmFn: opts.suggestLlmFn,
  });
  const top = suggest.results[0];
  const matchedFormat =
    (top?.meta?.format as TemplateFormat | undefined) ?? undefined;
  const format = resolveFormat(modeEntry, matchedFormat);

  // A match counts when the top result has a non-zero score — the keyword
  // scorer returns 0 only when NO brief token substring-matches any tag / name
  // / description, which is the freeform case. A natural-language brief
  // ("an unboxing video for my product") dilutes the score with filler tokens
  // but still lands a real, non-zero match; the plan records its confidence /
  // tier so the agent can judge how strong it is.
  const hasMatch = !!top && top.score > 0 && candidates.length > 0;

  // ── LLM enrichment (injected) ──
  let enrichment: LlmEnrichment;
  if (opts.enrich) {
    try {
      const raw = await opts.enrich({
        projectId: input.projectId,
        brief,
        format,
        contentMode: modeClass.mode,
        templateSlug: hasMatch ? top!.slug : null,
      });
      enrichment = LlmEnrichmentSchema.parse(raw);
    } catch {
      // Malformed / network failure → deterministic fallback, never crash.
      enrichment = heuristicEnrichment(format);
    }
  } else {
    enrichment = heuristicEnrichment(format);
  }

  // ── Stack + estimate (deterministic) ──
  const modelStack = deriveModelStack(format, enrichment.sceneCount, enrichment.durationSec);
  const estimate = estimateCost(modelStack, format, enrichment.sceneCount, enrichment.durationSec);

  // ── Craft overlay + required refs from the mode ──
  const craftOverlay = (modeClass.mode && CRAFT_OVERLAY_BY_MODE[modeClass.mode]) ?? [];
  const requiredRefs = modeEntry ? [...modeEntry.requiredInputs] : [];

  const plan = ProductionPlanSchema.parse({
    version: 1,
    projectId: input.projectId,
    brief,
    generatedAt: new Date().toISOString(),

    targetAudienceLanguage: enrichment.targetAudienceLanguage,
    register: enrichment.register,
    vibe: enrichment.vibe,
    sceneCount: enrichment.sceneCount,
    durationSec: enrichment.durationSec,
    firstCheckpoint: enrichment.firstCheckpoint,

    aspect: input.aspect ?? defaultAspectForFormat(format),
    platform: input.platform ?? "tiktok",

    contentMode: {
      mode: modeClass.mode,
      confidence: modeClass.confidence,
      ambiguous: modeClass.ambiguous,
      alternatives: modeClass.alternatives,
    },
    formatTemplate: {
      format,
      templateSlug: hasMatch ? top!.slug : null,
      templateName: hasMatch ? top!.name : undefined,
      confidence: hasMatch ? top!.score : 0,
      source: hasMatch ? suggest.source : "freeform",
      reasoning: hasMatch ? top!.reasoning : undefined,
    },
    craftOverlay,

    requiredRefs,
    benchmarkSource: null,
    audioPath: null,

    modelStack,
    estimate,

    bypasses: [],
  });

  return { plan, suggest };
}

// ─── Human-readable rendering ─────────────────────────────────────────────────

/** Render a ProductionPlan to the human-readable PRODUCTION_PLAN.md body (English-on-disk). */
export function renderPlanMarkdown(plan: ProductionPlan): string {
  const ft = plan.formatTemplate;
  const templateLine = ft.templateSlug
    ? `\`${ft.format}\` / \`${ft.templateSlug}\`${ft.templateName ? ` (${ft.templateName})` : ""} — match ${ft.confidence.toFixed(2)} via ${ft.source}`
    : `\`${ft.format}\` — freeform (no template matched)`;
  const overlay = plan.craftOverlay.length ? plan.craftOverlay.map((s) => `\`/${s}\``).join(", ") : "none";
  const refs = plan.requiredRefs.length ? plan.requiredRefs.map((r) => `- ${r}`).join("\n") : "- (none — generic work, no named entity)";
  const stack = plan.modelStack
    .map((m) => `- **${m.role}:** \`${m.model}\` — $${m.unitCostUsd.toFixed(3)}/unit${m.note ? ` (${m.note})` : ""}`)
    .join("\n");
  const bypasses = plan.bypasses.length ? plan.bypasses.map((b) => `- ${b}`).join("\n") : "- (none)";
  const modeLine = plan.contentMode.mode
    ? `${plan.contentMode.mode} (${plan.contentMode.confidence.toFixed(2)}${plan.contentMode.ambiguous ? ", ambiguous — confirm with user" : ""})`
    : "(unclassified — confirm with user)";

  return `# Production Plan — ${plan.projectId}

> Generated ${plan.generatedAt} from the brief below. This is the contract phase-7 artifact (see \`docs/playbooks/agent-production-contract.md\`). It is created AFTER the format/template match and BEFORE scenario generation. **Wait for the user's "go" before any paid generation.**

## Brief

${plan.brief || "_(no brief text supplied)_"}

## Plan

- **Vibe:** ${plan.vibe || "_(to be confirmed)_"}
- **Target audience language:** ${plan.targetAudienceLanguage}
- **Register:** ${plan.register || "_(brief-driven)_"}
- **Format / template:** ${templateLine}
- **Content mode (#412):** ${modeLine}
- **Craft overlay:** ${overlay}
- **Aspect / platform:** ${plan.aspect} / ${plan.platform}
- **Scene count / duration:** ${plan.sceneCount} scene(s) / ${plan.durationSec}s
- **Audio:** ${plan.audioPath ?? "(decided at the editor stage)"}
- **Benchmark / style source:** ${plan.benchmarkSource ?? "(none)"}

## Required references

${refs}

## Model stack

${stack || "- _(none)_"}

## Estimate

- **Cost:** $${plan.estimate.costLowUsd.toFixed(2)} – $${plan.estimate.costHighUsd.toFixed(2)}
- **Wall-clock:** ~${plan.estimate.wallClockMin} min
- **Basis:** ${plan.estimate.basis ?? "—"}

## First checkpoint

${plan.firstCheckpoint || "scene-01 anchor → wait for go before batching the rest"}

## Bypasses

${bypasses}
`;
}
