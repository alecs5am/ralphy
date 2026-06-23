// Provisional content-mode profile Zod schema (#454).
//
// When the open-world compiler (`compileMode`, cli/lib/content-modes.ts) returns
// status `unknown` — a brief for a content category Ralphy has no registered mode
// for — the agent does NOT route a generic prompt and does NOT refuse. It drafts a
// PROVISIONAL MODE: a structured, best-effort starting profile for the unfamiliar
// ask (inferred audience, closest media format, the assumptions it is making, the
// refs it needs, the risks, a suggested model stack, the quality gates it will hold
// to, and a STRICTER checkpoint cadence). The agent then researches the niche, asks
// only high-leverage questions, fills the profile, and runs with extra approvals.
//
// A provisional mode IS allowed to produce content — it is NOT allowed to pretend it
// has the same support level as a tested, registered mode (the issue's load-bearing
// rule). The `supportLevel` field is permanently `"provisional"` to encode that.
//
// `buildProvisionalMode()` is a PURE, deterministic skeleton builder: no LLM, no
// network. It seeds the profile from the brief + the `compileMode` classification
// (closest format, weak-match alternatives as "could map to") so the agent has a
// scaffold to fill rather than a blank page. The schema's sane `.default()`s mean a
// partial / best-effort profile still parses.
//
// Schema style mirrors cli/lib/schemas/workflow.ts + workspace-evaluators.ts: a Zod
// object with inline-doc comments, exported z.infer types, sane defaults, and a
// `parseProvisionalMode()`. English-only-on-disk.

import { z } from "zod";
import {
  MEDIA_FORMATS,
  type ModeCompilation,
  compileMode,
} from "../content-modes.js";

// ─── Field schemas ───────────────────────────────────────────────────────────

/** Research depth before paid generation — same vocab as the #412 mode registry. */
export const ProvisionalResearchDepthSchema = z.enum(["none", "quick", "deep"]);

/** Closest media container (superset of the template format taxonomy; adds audio/unknown). */
export const ProvisionalFormatSchema = z.enum(MEDIA_FORMATS);

/**
 * A checkpoint the agent MUST stop at for user approval. A provisional mode runs
 * STRICTER than a registered mode (#454 acceptance #5): at minimum it stops AFTER
 * the profile is drafted and BEFORE any paid generation, and it never silently runs
 * a large batch.
 */
export const ProvisionalCheckpointSchema = z.object({
  /** Stable checkpoint id (e.g. "profile-approval", "pre-paid-gen"). */
  id: z.string(),
  /** What the agent presents and waits on at this gate. */
  description: z.string(),
  /** True when the agent MUST halt here (no auto-advance) — provisional defaults to true. */
  blocking: z.boolean().default(true),
});
export type ProvisionalCheckpoint = z.infer<typeof ProvisionalCheckpointSchema>;

/** A suggested model for one role in the provisional stack (advisory — verify MODELS.md). */
export const SuggestedModelSchema = z.object({
  /** The pipeline role this model fills (image | video | voiceover | music | text). */
  role: z.string(),
  /** The proposed model id (best-effort; the agent confirms against MODELS.md). */
  model: z.string(),
  /** Why this pick — one line. */
  rationale: z.string().default(""),
});
export type SuggestedModel = z.infer<typeof SuggestedModelSchema>;

// ─── The provisional-mode profile ────────────────────────────────────────────

export const ProvisionalModeSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.string().default("1.0"),
  /**
   * Support level. PERMANENTLY `"provisional"` — the encoding of the #454 rule
   * that a provisional mode may produce content but must NOT pretend it has the
   * same support level as a tested, registered mode. Literal so it can never be
   * upgraded in-place; promotion goes through the separate promotion proposal.
   */
  supportLevel: z.literal("provisional").default("provisional"),
  /** A working slug the agent coins for this unfamiliar ask (kebab-case, descriptive). */
  slug: z.string(),
  /** The verbatim (or lightly-cleaned) brief that triggered the provisional path. */
  brief: z.string(),
  /** The agent's one-line read of what the user is trying to produce. */
  intent: z.string().default(""),
  /** Inferred target audience (who this is for) — a guess the agent confirms. */
  inferredAudience: z.string().default(""),
  /** Closest media format to discover into (NOT a content-mode claim, #454 #2). */
  format: ProvisionalFormatSchema,
  /**
   * Known modes the compiler weakly matched — candidates this provisional mode
   * COULD map to after research (feeds the promotion path's "map-to-existing").
   * Empty when nothing scored at all.
   */
  couldMapTo: z.array(z.string()).default([]),
  /** Assumptions the agent is making in the absence of detail — each must be confirmable. */
  assumptions: z.array(z.string()).default([]),
  /** Refs the agent needs before generation (real-entity anchors, style refs, source media). */
  requiredRefs: z.array(z.string()).default([]),
  /** Risks specific to running an unfamiliar mode (drift, hallucination, no benchmark). */
  risks: z.array(z.string()).default([]),
  /** Suggested model stack per role — advisory, verified against MODELS.md before use. */
  suggestedModelStack: z.array(SuggestedModelSchema).default([]),
  /** Quality gates the provisional run will hold to (a subset of scoreScenario|scoreImage|scoreVideo). */
  qualityGates: z.array(z.string()).default([]),
  /** Research depth to run before drafting prompts. */
  researchDepth: ProvisionalResearchDepthSchema.default("quick"),
  /** The stricter checkpoint cadence (≥ the profile-approval + pre-paid-gen gates). */
  checkpointCadence: z.array(ProvisionalCheckpointSchema).default([]),
});
export type ProvisionalMode = z.infer<typeof ProvisionalModeSchema>;

/** Parse + validate an unknown value into a ProvisionalMode (throws ZodError when malformed). */
export function parseProvisionalMode(raw: unknown): ProvisionalMode {
  return ProvisionalModeSchema.parse(raw);
}

// ─── Deterministic skeleton builder ──────────────────────────────────────────

/** Coin a kebab-case working slug from the brief (first few content words). */
function slugFromBrief(brief: string): string {
  const words = brief
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);
  const base = words.join("-") || "novel-ask";
  return `provisional-${base}`;
}

/**
 * The mandatory stricter checkpoints (#454 acceptance #5). EVERY provisional run
 * stops here: after the profile is drafted (so the user vets the assumptions) and
 * before any paid generation (so an unfamiliar mode never silently spends).
 */
function defaultCheckpoints(): ProvisionalCheckpoint[] {
  return [
    {
      id: "profile-approval",
      description:
        "Present this provisional profile (inferred audience, format, assumptions, refs, risks, model stack) and wait for the user to confirm or correct it.",
      blocking: true,
    },
    {
      id: "pre-paid-gen",
      description:
        "After research + refs are in and the plan is set, STOP for explicit approval before the first paid generation. Never auto-run a batch on an unfamiliar mode.",
      blocking: true,
    },
    {
      id: "first-output-review",
      description:
        "Generate ONE sample (a single image / a single clip), present it, and wait before fanning out — there is no benchmark to gate against yet.",
      blocking: true,
    },
  ];
}

/** Map a media format to the default quality gate(s) it should hold to. */
function gatesForFormat(format: ProvisionalMode["format"]): string[] {
  switch (format) {
    case "video":
    case "motion-design":
      return ["scoreScenario", "scoreVideo"];
    case "image":
    case "carousel":
    case "poster":
      return ["scoreImage"];
    case "audio":
      // No audio-specific score gate exists; the human review checkpoints carry it.
      return [];
    default:
      // unknown container — hold the broadest still gate as a floor; the agent
      // refines once the format is pinned.
      return ["scoreImage"];
  }
}

/** Suggest a starting model stack per the closest media format (advisory; verify MODELS.md). */
function suggestedStackForFormat(format: ProvisionalMode["format"]): SuggestedModel[] {
  // Best-effort skeleton ONLY — the agent reconfirms every id against MODELS.md
  // before any call (training memory is stale). Intentionally minimal.
  switch (format) {
    case "video":
    case "motion-design":
      return [
        { role: "image", model: "google/gemini-3-pro-image-preview", rationale: "default image anchor model; confirm in MODELS.md." },
        { role: "video", model: "kwaivgi/kling-v3.0-pro", rationale: "default i2v; swap per the art-director playbook for non-default motion." },
      ];
    case "image":
    case "carousel":
    case "poster":
      return [
        { role: "image", model: "google/gemini-3-pro-image-preview", rationale: "default image model; gpt-5.4-image-2 for crisp typography." },
      ];
    case "audio":
      return [
        { role: "voiceover", model: "elevenlabs", rationale: "default VO provider; confirm voice + geo-block fallback." },
      ];
    default:
      return [];
  }
}

export interface BuildProvisionalModeOptions {
  /** Override the auto-coined slug. */
  slug?: string;
  /** Explicit research depth (else `quick` — an unfamiliar ask defaults to grounding). */
  researchDepth?: ProvisionalMode["researchDepth"];
}

/**
 * Build a deterministic PROVISIONAL-MODE skeleton from a brief + its open-world
 * classification (#454 acceptance #4). PURE — no LLM, no network. Seeds every field
 * with a best-effort starting value the agent then fills:
 *   - `format` ← the compiler's closest media format,
 *   - `couldMapTo` ← the weakly-matched known modes (promotion-path candidates),
 *   - `assumptions` / `risks` ← the generic unfamiliar-mode warnings,
 *   - `qualityGates` / `suggestedModelStack` ← format-derived defaults,
 *   - `checkpointCadence` ← the mandatory stricter gates.
 *
 * The returned object is schema-valid (parse it with `parseProvisionalMode`).
 *
 * @param utterance The user's brief.
 * @param classification Optional precomputed `compileMode()` result (else recomputed).
 */
export function buildProvisionalMode(
  utterance: string,
  classification?: ModeCompilation,
  options: BuildProvisionalModeOptions = {},
): ProvisionalMode {
  const brief = (utterance ?? "").trim();
  const compiled = classification ?? compileMode(brief);
  const format = compiled.closestFormat;

  // Weakly-matched known modes become promotion-path "could map to" candidates.
  const couldMapTo = [
    ...(compiled.mode ? [compiled.mode] : []),
    ...compiled.alternatives,
  ].slice(0, 3);

  const assumptions = [
    `Closest media format is "${format}" (inferred from the brief, not a confirmed content mode).`,
    "No registered content mode covers this ask, so there is no tested route or benchmark to lean on.",
    couldMapTo.length > 0
      ? `It may map to an existing mode after research (candidates: ${couldMapTo.join(", ")}).`
      : "Nothing in the known taxonomy matched — treat as a genuinely novel category until research says otherwise.",
  ];

  const risks = [
    "Style / identity drift across outputs (no locked benchmark for an unfamiliar mode).",
    "Model hallucination on an under-specified novel format.",
    "Cost overrun if a batch runs before a single sample is validated.",
    "Mis-routing: the closest format may still be the wrong container — confirm with the user.",
  ];

  const profile: ProvisionalMode = {
    version: "1.0",
    supportLevel: "provisional",
    slug: options.slug ?? slugFromBrief(brief),
    brief,
    intent: "",
    inferredAudience: "",
    format,
    couldMapTo,
    assumptions,
    requiredRefs: [],
    risks,
    suggestedModelStack: suggestedStackForFormat(format),
    qualityGates: gatesForFormat(format),
    researchDepth: options.researchDepth ?? "quick",
    checkpointCadence: defaultCheckpoints(),
  };

  // Round-trip through the schema so callers always get a validated object.
  return parseProvisionalMode(profile);
}
