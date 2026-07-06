// Per-(model, capability, provider) parameter-coverage matrix (#497).
//
// The same model exposes different capability surfaces per provider:
// OpenRouter covers roughly 40% of seedance-2.0's parameter surface, fal.ai
// ~100% (multi-ref @Image/@Video roles, last-frame, extension, audio). This
// module turns that knowledge — previously agent memory + MODELS.md prose —
// into typed, inspectable data the CLI can warn on and the farm node-graph
// validation (#498) can gate on.
//
// ─── Source of truth: HAND-CURATED (decision D-02, docs/architecture/
// farm-node-graph.md). Same convention as MODEL_CONSTRAINTS (#445,
// cli/lib/models/constraints.ts): MODELS.md prose is the human source of
// truth, this table is its machine mirror, and there is intentionally NO
// auto-sync — the OR catalog carries no param-level semantics, and fal model
// schemas describe shape, not behavior (e.g. `generate_audio` exists but
// seedance speech is unvalidated). When a provider surface changes, update
// MODELS.md AND this table in the same change; fal model schemas + `ralphy
// models list` are the reference material for the manual refresh. The
// `source: "derived"` value is reserved for a future automated seeding pass
// that may ADD rows but never overwrite a hand-curated one.
//
// Param names are the connector-input field names (GenerateVideoInput /
// GenerateImageInput / ... in types.ts), NOT the CLI flag spellings — the
// flag→param mapping lives at the call site in cli/commands/generate.ts.
//
// Semantics: `supportedParams` is the declared coverage; a param absent from
// it is outside coverage. `unsupportedParams` lists the NOTABLE gaps (params
// another provider covers for the same model family) so the warning can name
// the alternative. An unknown (model, cap, provider) triple has NO entry —
// and no entry means no warning (unknown ≠ unsupported).

import type { Capability } from "./types.js";

export type CoverageSource = "hand-curated" | "derived";

export interface CoverageEntry {
  /** Connector id (`--provider` value): openrouter | fal | elevenlabs | ... */
  provider: string;
  /** Model id as passed on `--model` for THIS provider. */
  model: string;
  capability: Capability;
  /**
   * Model family grouping cross-provider entries for the same underlying
   * model (e.g. OR `bytedance/seedance-2.0` and fal
   * `bytedance/seedance-2.0/reference-to-video` are both "seedance-2.0"),
   * so a coverage gap can point at the provider that fills it.
   */
  family: string;
  /** Connector-input params this (model, provider) pair actually honors. */
  supportedParams: string[];
  /** Notable params this pair does NOT honor (silently dropped or 400). */
  unsupportedParams: string[];
  source: CoverageSource;
  /** One-line provenance / caveat note (MODELS.md is the long form). */
  notes?: string;
}

// Ground truth: MODELS.md (snapshot 2026-07-06) + what the connectors
// actually send — openrouter.ts (image: prompt/refs/size/negativePrompt;
// video: prompt/duration/aspect/resolution/first+last frame/input_references/
// generate_audio), fal.ts FAL_VIDEO_MODELS (video_urls/image_urls/start+end
// image/generate_audio), elevenlabs.ts (voice_settings sliders, music/sfx
// bodies).
export const PROVIDER_COVERAGE: CoverageEntry[] = [
  // ── seedance-2.0 — the motivating case: OR ~40% vs fal ~100% ─────────────
  {
    provider: "openrouter",
    model: "bytedance/seedance-2.0",
    capability: "video",
    family: "seedance-2.0",
    supportedParams: [
      "prompt",
      "durationSec",
      "aspectRatio",
      "resolution",
      "firstFrame",
      "lastFrame",
      "refs",
      "generateAudio",
    ],
    unsupportedParams: ["refVideos"],
    source: "hand-curated",
    notes:
      "~40% of the native seedance surface: image input_references only (<=9, MODELS.md 6b) — no @Video roles, no extension, --audio unvalidated for speech (ambient/SFX only).",
  },
  {
    provider: "fal",
    model: "bytedance/seedance-2.0/reference-to-video",
    capability: "video",
    family: "seedance-2.0",
    supportedParams: [
      "prompt",
      "durationSec",
      "aspectRatio",
      "resolution",
      "firstFrame",
      "lastFrame",
      "refs",
      "refVideos",
      "generateAudio",
    ],
    unsupportedParams: [],
    source: "hand-curated",
    notes:
      "~100% of the seedance surface (#402): multi-ref @Image/@Video roles, last-frame, extension via video refs (<=3, 2-15s combined), native audio (ralphy defaults it off — post-mix discipline).",
  },

  // ── kling ─────────────────────────────────────────────────────────────────
  {
    provider: "openrouter",
    model: "kwaivgi/kling-v3.0-pro",
    capability: "video",
    family: "kling-v3.0",
    supportedParams: [
      "prompt",
      "durationSec",
      "aspectRatio",
      "resolution",
      "firstFrame",
      "lastFrame",
      "generateAudio",
    ],
    unsupportedParams: ["refs", "refVideos"],
    source: "hand-curated",
    notes:
      "No input_references on OR kling (omnimodal tier is native/fal only, MODELS.md 6b); first+last TOGETHER is preflight-rejected (#008); --audio renders speech EN only; 2500-char prompt cap.",
  },
  {
    provider: "fal",
    model: "fal-ai/kling-video/o3/pro/reference-to-video",
    capability: "video",
    family: "kling-o3",
    supportedParams: [
      "prompt",
      "durationSec",
      "aspectRatio",
      "resolution",
      "firstFrame",
      "lastFrame",
      "refs",
      "generateAudio",
    ],
    unsupportedParams: ["refVideos"],
    source: "hand-curated",
    notes:
      "Kling O3 omni (#402): image refs (@Image1) + upstream `elements` (@Element1, no CLI flag yet); NO video input — use fal seedance r2v for video-anchored restyles.",
  },

  // ── veo ───────────────────────────────────────────────────────────────────
  {
    provider: "openrouter",
    model: "google/veo-3.1",
    capability: "video",
    family: "veo-3.1",
    supportedParams: [
      "prompt",
      "durationSec",
      "aspectRatio",
      "resolution",
      "firstFrame",
      "lastFrame",
      "generateAudio",
    ],
    unsupportedParams: ["refs", "refVideos"],
    source: "hand-curated",
    notes:
      "No reference-to-video on OR veo; --audio renders speech (EN clean, off for RU/UA); 8s clip cap; content filter scans anchor frames independently of the prompt.",
  },

  // ── image models ──────────────────────────────────────────────────────────
  {
    provider: "openrouter",
    model: "google/gemini-3-pro-image-preview",
    capability: "image",
    family: "gemini-3-pro-image",
    supportedParams: ["prompt", "refs", "size", "negativePrompt"],
    unsupportedParams: [],
    source: "hand-curated",
    notes:
      "Multi-ref consistency default; --size maps to image_config.aspect_ratio and snaps to the natural grid (#051) — prefer --aspect.",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-5.4-image-2",
    capability: "image",
    family: "gpt-5.4-image",
    supportedParams: ["prompt", "refs", "size", "negativePrompt"],
    unsupportedParams: [],
    source: "hand-curated",
    notes:
      "Premium typography pick; ignores arbitrary --size (1024^2 default) unless image_config.aspect_ratio is sent — prefer --aspect (#051).",
  },

  // ── ElevenLabs voice / music / sfx ────────────────────────────────────────
  // Keyed by the same canonical ids the generate path already uses for
  // preflight (cli/lib/models/constraints.ts): the TTS --model value for
  // voice, elevenlabs-music / elevenlabs-sfx for the flagless verbs.
  {
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    capability: "voice",
    family: "elevenlabs-tts",
    supportedParams: [
      "text",
      "voiceId",
      "stability",
      "similarityBoost",
      "style",
      "speed",
      "speakerBoost",
    ],
    unsupportedParams: [],
    source: "hand-curated",
    notes: "Default TTS (RU-safe); voice_settings sliders all forwarded (#030).",
  },
  {
    provider: "elevenlabs",
    model: "eleven_v3",
    capability: "voice",
    family: "elevenlabs-tts",
    supportedParams: [
      "text",
      "voiceId",
      "stability",
      "similarityBoost",
      "style",
      "speed",
      "speakerBoost",
    ],
    unsupportedParams: [],
    source: "hand-curated",
    notes: "English premium TTS; unstable on Russian — not for RU production (MODELS.md).",
  },
  {
    provider: "elevenlabs",
    model: "elevenlabs-music",
    capability: "music",
    family: "elevenlabs-music",
    supportedParams: ["prompt", "durationSec", "forceInstrumental"],
    unsupportedParams: [],
    source: "hand-curated",
    notes:
      "Upstream model_id music_v1; 3-600s; ToS rejects artist/track names (400 bad_prompt + prompt_suggestion, #006).",
  },
  {
    provider: "elevenlabs",
    model: "elevenlabs-sfx",
    capability: "sfx",
    family: "elevenlabs-sfx",
    supportedParams: ["prompt", "durationSec", "promptInfluence"],
    unsupportedParams: [],
    source: "hand-curated",
    notes: "ElevenLabs Sound Generation; 0.5-22s hard cap.",
  },
];

/**
 * Coverage entry for an exact (model, capability, provider) triple, or
 * undefined when the triple is unknown. Unknown means "no data", NOT
 * "unsupported" — callers must stay silent on undefined.
 */
export function coverageFor(
  model: string,
  cap: Capability,
  provider: string,
): CoverageEntry | undefined {
  return PROVIDER_COVERAGE.find(
    (e) => e.model === model && e.capability === cap && e.provider === provider,
  );
}

/**
 * All coverage entries for a model id, including its cross-provider family
 * siblings (e.g. `bytedance/seedance-2.0` also returns the fal r2v row).
 */
export function coverageForModel(model: string): CoverageEntry[] {
  const families = new Set(
    PROVIDER_COVERAGE.filter((e) => e.model === model).map((e) => e.family),
  );
  if (families.size === 0) return [];
  return PROVIDER_COVERAGE.filter((e) => families.has(e.family));
}

/**
 * Entries (any provider) that declare `param` supported for a capability,
 * optionally narrowed to a model family. Used to name the provider that DOES
 * cover a param the resolved connector lacks.
 */
export function providersSupporting(
  param: string,
  cap: Capability,
  family?: string,
): CoverageEntry[] {
  return PROVIDER_COVERAGE.filter(
    (e) =>
      e.capability === cap &&
      (!family || e.family === family) &&
      e.supportedParams.includes(param),
  );
}

export interface CoverageWarningInput {
  provider: string;
  model: string;
  capability: Capability;
  /** Connector-input param names the caller actually passed. */
  params: string[];
}

/**
 * Non-fatal coverage check for a planned generate call (#497). Returns one
 * warning line per passed param that is OUTSIDE the resolved (model, cap,
 * provider) entry's declared coverage, naming the provider that supports it
 * when one is known. PURE — no I/O. An unknown triple returns [] (no entry =
 * no warning). Warn-only by contract: #498 owns hard-fail semantics at graph
 * import.
 */
export function coverageWarnings(input: CoverageWarningInput): string[] {
  const entry = coverageFor(input.model, input.capability, input.provider);
  if (!entry) return [];
  const lines: string[] = [];
  for (const param of input.params) {
    if (entry.supportedParams.includes(param)) continue;
    const alternatives = providersSupporting(param, input.capability, entry.family).filter(
      (e) => e.provider !== input.provider,
    );
    const alt = alternatives[0];
    const altHint = alt
      ? ` Supported via --provider ${alt.provider} --model ${alt.model}.`
      : "";
    lines.push(
      `param '${param}' is outside provider '${input.provider}' coverage for ${input.model}.${altHint} Proceeding anyway (see \`ralphy provider matrix --model ${input.model}\`).`,
    );
  }
  return lines;
}

/**
 * Print coverage warnings as `[warn] ...` stderr lines (the generate.ts
 * advisory convention) and return them. Never throws, never blocks.
 */
export function emitCoverageWarnings(input: CoverageWarningInput): string[] {
  const lines = coverageWarnings(input);
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.error(`[warn] ${line}`);
  }
  return lines;
}
