// Model constraint preflight (#445).
//
// A shared, agent-facing layer that validates a PLANNED generation call
// against known per-model / per-provider limits BEFORE submit, so the agent
// avoids the cheap-but-slow provider-400 round-trip (~$0.70 + 2-3 min each).
//
// ─── MODELS.md is the human source of truth; this table is the machine mirror.
// MODELS.md (read before any model call) documents these limits in prose for
// the agent; the table below encodes the SAME facts as data the CLI can gate
// on. When a constraint changes (a new prompt cap, a fixed broken combo, a new
// concurrency number), update BOTH:
//   1. MODELS.md — the per-model "Discovered model breakage" / limits rows.
//   2. This table — the matching MODEL_CONSTRAINTS entry, citing the done-issue.
// There is intentionally NO auto-sync tool (it would be a lie the moment the
// prose and the data drift in opposite directions); the convention is the
// contract. Catalog-backed limits (durations / resolutions / aspect ratios /
// frame anchors) are NOT mirrored here — they live in the OpenRouter catalog
// and are read live via or-catalog.ts. This table is ONLY for what the catalog
// does NOT carry.
//
// Cross-references:
//   • or-catalog.ts → validateVideoParams() — catalog-backed video limits.
//   • cli/lib/providers/openrouter.ts → MAX_PROMPT_CHARS / kling multiframe
//     preflight — the connector-side hard refusals this layer mirrors so the
//     agent gets the same answer without a network call.
//   • telemetry.ts → MODELS_MD_DEFAULTS — reused for the recommended fallback.

import type { VideoModel } from "../or-catalog.js";
import { validateVideoParams } from "../or-catalog.js";
import { MODELS_MD_DEFAULTS } from "./telemetry.js";

export type GenerateKind =
  | "image"
  | "video"
  | "voiceover"
  | "music"
  | "sfx"
  | "eval";

/** What a model accepts as input besides text. */
export type SupportedInput = "text" | "refs" | "audio" | "frames";

/** How a model handles `--audio`. */
export type AudioSupport = "renders-speech" | "ambient-only" | "none";

/** A known-bad parameter combination that returns a guaranteed 400 / garbage. */
export interface BrokenCombo {
  /** Short id used in messages, e.g. "kling-multiframe-base64". */
  id: string;
  /** One-line description of the broken combination. */
  describe: string;
  /** done-issue citation. */
  issue: string;
  /** What to do instead. */
  hint: string;
}

/** Per-model metadata the OpenRouter catalog does NOT carry. */
export interface ModelConstraint {
  /** Hard prompt-character cap (provider 400 above it). */
  maxPromptChars?: number;
  /** Non-text inputs the model accepts. */
  supportedInputs?: SupportedInput[];
  /** Max reference images accepted (input_references / multi-ref). */
  maxRefs?: number;
  /** Free-text note on how the model treats --size / --aspect. */
  aspectSizeBehavior?: string;
  /** How --audio behaves; gate non-text languages at the agent layer. */
  audioSupport?: AudioSupport;
  /** Known-broken parameter combinations (guaranteed fail). */
  knownBrokenCombos?: BrokenCombo[];
  /** Safe in-flight concurrency before the provider 429s. */
  concurrencyHint?: number;
  /** Free-text note shown when a duration is out of range. */
  durationLimits?: string;
  /** Inclusive [min, max] duration in seconds; out-of-range is a `fail`. */
  durationRangeSec?: [number, number];
}

// ─── The table. Keyed by model id (canonical OpenRouter slug or the
//     ElevenLabs provider-model id used in the gen-log / connectors). Each
//     non-obvious entry cites the done-issue that captured the constraint.
export const MODEL_CONSTRAINTS: Record<string, ModelConstraint> = {
  // Kling: 2500-char prompt cap (#008/#023) + multiframe base64 bug (#008) +
  // --audio renders speech but EN-only (#023). Catalog carries durations /
  // resolutions / aspect / frame anchors — NOT mirrored here.
  "kwaivgi/kling-v3.0-pro": {
    maxPromptChars: 2500, // #008: OR 400 round-trip above 2500; trim atmosphere, keep voice-tag / no-music / on-camera-EN clauses.
    supportedInputs: ["text", "refs", "frames", "audio"],
    audioSupport: "renders-speech", // #023: --audio DOES render speech (EN only — RU/UA slips; gate language at the agent layer).
    knownBrokenCombos: [
      {
        id: "kling-multiframe-base64",
        describe: "first_frame AND last_frame together return 400 'File is not in a valid base64 format'",
        issue: "#008",
        hint: "use bytedance/seedance-2.0 for first+last frame anchoring (honors --last-frame natively for non-photoreal anchors)",
      },
    ],
    concurrencyHint: 2,
  },
  "kwaivgi/kling-v3.0-std": {
    maxPromptChars: 2500, // #008: same lineage cap as kling-v3.0-pro.
    supportedInputs: ["text", "refs", "frames", "audio"],
    audioSupport: "renders-speech", // #023
    concurrencyHint: 2,
  },
  "kwaivgi/kling-video-o1": {
    maxPromptChars: 2500, // #008: same lineage cap.
    supportedInputs: ["text", "refs", "frames", "audio"],
    audioSupport: "renders-speech", // #023
    concurrencyHint: 2,
  },

  // Seedance: multimodal r2v takes <=9 image refs (OR exposes image refs only);
  // --audio not validated for speech (treat as ambient-only).
  "bytedance/seedance-2.0": {
    supportedInputs: ["text", "refs", "frames", "audio"],
    maxRefs: 9, // MODELS.md 6b: native takes <=9 images; OR documents image refs only.
    audioSupport: "ambient-only", // MODELS.md: --audio not validated for SPEECH on seedance; ambient/SFX only.
  },

  // veo: --audio renders speech (EN clean), off for RU/UA.
  "google/veo-3.1": {
    supportedInputs: ["text", "frames", "audio"],
    audioSupport: "renders-speech", // MODELS.md: model-native audio works in EN; off for RU/UA.
  },

  // Image models: gpt / gemini hard-snap to a natural pixel grid and ignore an
  // arbitrary --size (#051). The exact grid lives in or-catalog's NATURAL_SIZE
  // table; this entry is the advisory note + supported-inputs surface.
  "openai/gpt-5.4-image-2": {
    supportedInputs: ["text", "refs"],
    aspectSizeBehavior: "ignores arbitrary --size; snaps to a fixed grid per aspect (use --aspect, not --size)", // #051
  },
  "google/gemini-3-pro-image-preview": {
    supportedInputs: ["text", "refs"],
    aspectSizeBehavior: "ignores arbitrary --size; snaps to a natural grid per aspect (use --aspect, not --size)", // #051
  },

  // ElevenLabs: SFX <=22s, Music 3-600s, concurrency caps from MODELS.md.
  "elevenlabs-sfx": {
    supportedInputs: ["text"],
    durationLimits: "ElevenLabs Sound Generation hard cap is 0.5-22s",
    durationRangeSec: [0.5, 22],
    concurrencyHint: 3,
  },
  "elevenlabs-music": {
    supportedInputs: ["text"],
    durationLimits: "ElevenLabs Music range is 3-600s",
    durationRangeSec: [3, 600],
    concurrencyHint: 2, // MODELS.md: music_v1 concurrency cap = 2 (3+ parallel → 429 concurrent_limit_exceeded).
  },
  "elevenlabs-tts": {
    supportedInputs: ["text"],
    concurrencyHint: 3, // MODELS.md: elevenlabs/tts = 3 concurrent (9 parallel → 6 hard-failed 429).
  },
};

/** One constraint check result. */
export interface Violation {
  /** Which input field tripped the constraint. */
  field: string;
  /** "fail" = guaranteed provider 400 / garbage → blocks. "warn" = advisory. */
  severity: "fail" | "warn";
  /** What's wrong. */
  message: string;
  /** Concrete next action. */
  hint: string;
}

/** Input describing a planned generation call. */
export interface ModelPreflightInput {
  kind: GenerateKind;
  modelId: string;
  promptChars?: number;
  refCount?: number;
  /** True when both a first AND last frame anchor are supplied (i2v). */
  hasFirstFrame?: boolean;
  hasLastFrame?: boolean;
  aspect?: string;
  size?: string;
  audio?: boolean;
  durationSec?: number;
  concurrency?: number;
  /**
   * Optional pre-resolved OR catalog row for video models. When supplied,
   * catalog-backed limits (durations / resolutions / aspect / frame anchors)
   * are checked via validateVideoParams(). Tests inject this directly so the
   * preflight stays network-free.
   */
  videoModel?: VideoModel;
  /** Resolution string for the catalog video check (defaults "720p"). */
  resolution?: string;
}

export interface ModelPreflightResult {
  ok: boolean;
  violations: Violation[];
  hints: string[];
  recommendedFallbacks: string[];
}

/**
 * Validate a planned model call against the constraint table + (when supplied)
 * the OR catalog video limits. PURE — no network, no provider calls. `ok` is
 * false only when at least one `fail`-severity violation is present (a
 * guaranteed provider 400 / garbage). Everything advisory is a `warn`.
 */
export function preflightModelCall(input: ModelPreflightInput): ModelPreflightResult {
  const violations: Violation[] = [];
  const hints: string[] = [];
  const c = MODEL_CONSTRAINTS[input.modelId];

  // ── Catalog-backed video limits (durations / resolutions / aspect / frames).
  //    Reuse validateVideoParams — don't re-hardcode what the catalog carries.
  if (input.videoModel) {
    const catalogFindings = validateVideoParams(input.videoModel, {
      duration: input.durationSec ?? 0,
      aspectRatio: input.aspect ?? "9:16",
      resolution: input.resolution ?? "720p",
      hasFirstFrame: Boolean(input.hasFirstFrame),
      hasLastFrame: Boolean(input.hasLastFrame),
    });
    for (const f of catalogFindings) {
      violations.push({
        field: f.field,
        severity: f.level === "error" ? "fail" : "warn",
        message: f.reason,
        hint: f.suggestion ?? `see \`ralphy models show ${input.modelId}\``,
      });
    }
  }

  if (c) {
    // ── Prompt-char cap (#008): guaranteed 400 above the cap.
    if (
      c.maxPromptChars !== undefined &&
      input.promptChars !== undefined &&
      input.promptChars > c.maxPromptChars
    ) {
      violations.push({
        field: "prompt",
        severity: "fail",
        message: `${input.modelId} prompt cap is ${c.maxPromptChars} chars; got ${input.promptChars}`,
        hint: "compress the prompt; trim atmosphere / setting prose first (voice-tag, no-music, on-camera-EN clauses are load-bearing) — MODELS.md prompt-cap row",
      });
    }

    // ── Known-broken combos (#008 kling multiframe): guaranteed fail.
    for (const combo of c.knownBrokenCombos ?? []) {
      if (combo.id === "kling-multiframe-base64") {
        if (input.hasFirstFrame && input.hasLastFrame) {
          violations.push({
            field: "frames",
            severity: "fail",
            message: `${input.modelId} ${combo.describe} (${combo.issue})`,
            hint: combo.hint,
          });
        }
      }
    }

    // ── Ref-count cap: guaranteed reject above the cap.
    if (c.maxRefs !== undefined && input.refCount !== undefined && input.refCount > c.maxRefs) {
      violations.push({
        field: "refs",
        severity: "fail",
        message: `${input.modelId} accepts at most ${c.maxRefs} refs; got ${input.refCount}`,
        hint: `drop to ${c.maxRefs} reference(s) or fewer`,
      });
    }

    // ── Audio support: unsupported → guaranteed 400 / silent. Speech-but-
    //    EN-only is advisory (the agent gates language).
    if (input.audio) {
      if (c.audioSupport === "none") {
        violations.push({
          field: "audio",
          severity: "fail",
          message: `${input.modelId} does not support --audio`,
          hint: "drop --audio; post-mix a separate ElevenLabs VO / music pass in the editor stage",
        });
      } else if (c.audioSupport === "ambient-only") {
        violations.push({
          field: "audio",
          severity: "warn",
          message: `${input.modelId} --audio is not validated for SPEECH (ambient / SFX only)`,
          hint: "use --audio for ambient / SFX; post-mix ElevenLabs for any spoken VO",
        });
      } else if (c.audioSupport === "renders-speech") {
        hints.push(
          `${input.modelId} --audio renders speech in EN only — confirm the audience language is English before relying on it (RU/UA slips). MODELS.md \`--audio\` policy.`,
        );
      }
    }

    // ── Aspect / size behavior: advisory when --size is passed without --aspect
    //    to a model that ignores arbitrary sizes (#051).
    if (c.aspectSizeBehavior && input.size && !input.aspect) {
      violations.push({
        field: "size",
        severity: "warn",
        message: `${input.modelId} ${c.aspectSizeBehavior}`,
        hint: "pass --aspect <9:16|16:9|1:1|...> instead of --size for a predictable grid (#051)",
      });
    }

    // ── Concurrency hint: advisory when the planned concurrency exceeds the cap.
    if (
      c.concurrencyHint !== undefined &&
      input.concurrency !== undefined &&
      input.concurrency > c.concurrencyHint
    ) {
      violations.push({
        field: "concurrency",
        severity: "warn",
        message: `${input.modelId} safe concurrency is ${c.concurrencyHint}; planned ${input.concurrency} risks a 429`,
        hint: `stay <=${c.concurrencyHint} in-flight (--concurrency ${c.concurrencyHint})`,
      });
    }

    // ── Duration range (ElevenLabs music / sfx): out-of-range is a guaranteed
    //    provider 400. The catalog path handles discrete video durations.
    if (c.durationRangeSec && input.durationSec !== undefined) {
      const [lo, hi] = c.durationRangeSec;
      if (input.durationSec < lo || input.durationSec > hi) {
        violations.push({
          field: "duration",
          severity: "fail",
          message: `${input.modelId} duration ${input.durationSec}s is out of range; ${c.durationLimits ?? `${lo}-${hi}s`}`,
          hint: `pass a duration in [${lo}, ${hi}] seconds`,
        });
      }
    }
  }

  // ── Recommended fallback model: only when something hard-fails, and only via
  //    the existing MODELS.md default for the kind (reuse, don't reinvent).
  const recommendedFallbacks: string[] = [];
  const hasFail = violations.some((v) => v.severity === "fail");
  if (hasFail) {
    // Map the broken-combo's own hint first (it's the most specific), then the
    // MODELS.md default for the kind as a generic backstop.
    const comboFallback = violations.find((v) => v.field === "frames" && v.severity === "fail");
    if (comboFallback && /seedance/.test(comboFallback.hint)) {
      recommendedFallbacks.push("bytedance/seedance-2.0");
    }
    const def = MODELS_MD_DEFAULTS[input.kind];
    if (def && def !== input.modelId && !recommendedFallbacks.includes(def)) {
      recommendedFallbacks.push(def);
    }
  }

  return { ok: !hasFail, violations, hints, recommendedFallbacks };
}
