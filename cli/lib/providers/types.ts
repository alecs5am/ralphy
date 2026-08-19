// Provider connector contract — shared types, no runtime.
//
// This is the interface a provider file (openrouter.ts, elevenlabs.ts, or a
// future third-party connector) implements. The registry collects connectors;
// the CLI resolves one per call. Keeping the contract type-only here avoids
// import cycles between the registry and the provider implementations.
//
// First slice of notes/ideas/005 (pluggable provider spec).

// ─── Capability matrix axis ──────────────────────────────────────────────────

/** The generation-verb axis of the provider matrix. */
export type Capability =
  | "text"
  | "image"
  | "video"
  | "voice"
  | "music"
  | "sfx"
  | "lipsync"
  | "transcribe";

// ─── Shared media types ──────────────────────────────────────────────────────

/**
 * Canonical 9:16 size hints. Kept as a literal union for documentation, but
 * the actual `size` field accepts any "WxH" string — image endpoints snap to
 * the model's natural grid regardless of what we send (#051).
 */
export type Size9x16 = "1080x1920" | "720x1280" | "540x960";
/** The size string actually accepted by `generateImage` — "WxH" or a canonical alias. */
export type ImageSize = Size9x16 | (string & {});

export type GenerateResult = {
  /** Remote URL returned by the provider, if any (may expire). */
  url?: string;
  /** Path under <project>/artifacts/... where we saved the file. */
  localPath: string;
  /** Best-effort estimate; pulled from `MODELS.md` ratios when provider doesn't return it. */
  costUsd: number;
  /** End-to-end latency for the call. */
  latencyMs: number;
  /** Model id actually used (provider may resolve aliases). */
  model: string;
};

export type CommonInput = {
  /** Existing project artifact destination. Exactly one scope is required. */
  projectId?: string;
  /** Workspace shared-asset destination. Exactly one scope is required. */
  workspaceId?: string;
  /** Slot id (e.g. `scene-01-bg-image`) — used in log notes + filenames. */
  slot: string;
  /** Free-form note for `generations.jsonl`. */
  note?: string;
  /**
   * If true, overwrite an existing slot file in place (legacy behavior, data-destructive).
   * Default false → auto-archive the existing file to `<slot>.v{N}.<ext>` before writing the new
   * version. Closes AGENTS.md invariant #13 enforcement: 10/10 postmortems hit silent overwrite.
   */
  overwrite?: boolean;
  signal?: AbortSignal;
  /**
   * Bypass the transient-error retry loop (#005). Default false → connector
   * wraps the network call with `retryTransient()` (2 retries, 1s/4s/16s
   * backoff). Set true from the `--no-retry` CLI flag, primarily for tests
   * and debugging where you want the first response no matter what.
   */
  noRetry?: boolean;
};

export type GenerateImageInput = CommonInput & {
  /** Model id, e.g. `google/gemini-3-pro-image-preview` (default, nano-banana-pro) or `openai/gpt-5.4-image-2` for premium typography on labels. */
  model?: string;
  prompt: string;
  /** Optional multi-ref URLs. Both gemini-3-pro-image-preview and gpt-5.4-image-2 accept image inputs; gemini is materially stronger at multi-ref character consistency. */
  refs?: string[];
  size?: ImageSize;
  /** Negative prompt where supported. */
  negativePrompt?: string;
};

export type GenerateVideoInput = CommonInput & {
  /** Model id, e.g. `kwaivgi/kling-v3.0-pro` (default), `google/veo-3.1`, `bytedance/seedance-2.0`. */
  model?: string;
  /** First-frame anchor — URL, local path, or data: URI. Alias for firstFrame. Kept for back-compat. */
  image?: string;
  /** First-frame anchor (URL / local path / data: URI). */
  firstFrame?: string;
  /** Last-frame anchor (URL / local path / data: URI). Some models only support first_frame — see catalog. */
  lastFrame?: string;
  /**
   * Reference images for multimodal reference-to-video (OpenRouter `input_references`).
   * Unlike frame anchors these guide subject / identity / style without pinning an exact
   * frame. Order maps to `Image 1` / `@Image1`, `Image 2`, … in the prompt (the seedance
   * @-reference convention). Honored by `bytedance/seedance-2.0` (≤9 images); models
   * without reference-to-video support reject the field round-trip at OR.
   */
  refs?: string[];
  /**
   * Reference VIDEOS for video-anchored reference-to-video (fal seedance r2v
   * `video_urls`). Order maps to `Video 1` / `@Video1`, … in the prompt (the
   * seedance @-reference convention). Honored ONLY by the fal connector's
   * `bytedance/seedance-2.0/reference-to-video` (≤3 files, combined 2-15s,
   * ≤50MB, each 640x640..834x1112 — over-resolution sources auto-downscaled
   * into `artifacts/refs/`, #402). Models without video-ref support reject it.
   */
  refVideos?: string[];
  prompt: string;
  durationSec: number;
  /** Enable model-native audio (Veo 3.x only). Default false. */
  generateAudio?: boolean;
  /** Aspect ratio. Default "9:16" (TikTok). Per-model `supported_aspect_ratios` may be narrower — see `ralphy models show`. */
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";
  /** Resolution. Default "720p". Per-model `supported_resolutions` may be narrower — see `ralphy models show`. */
  resolution?: "480p" | "720p" | "1080p" | "4K";
  /** Polling cadence in ms. Default 15000. Total budget = pollIntervalMs * pollMaxAttempts. */
  pollIntervalMs?: number;
  /** Max polling attempts. Default 80 (≈20 min at 15s cadence). */
  pollMaxAttempts?: number;
};

export type GenerateVoiceoverInput = CommonInput & {
  text: string;
  voiceId: string;
  /** Default eleven_multilingual_v2 (RU). */
  modelId?: string;
  /**
   * Language hint where the provider accepts one (HeyGen /v3/voices/speech
   * auto-detects when omitted). ElevenLabs infers it from the model id.
   */
  language?: string;
  /** Default tuned for deadpan young Russian — see MODELS.md. */
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    /**
     * Playback speed multiplier — 0..2, where 1.0 is natural. Below ~0.7 the
     * voice gets sludgy; above ~1.3 it gets chipmunky. Forwarded to the
     * ElevenLabs `voice_settings.speed` field (#030).
     */
    speed?: number;
  };
};

export type GenerateLipsyncInput = CommonInput & {
  /** Route/model id where the provider exposes more than one avatar route. */
  model?: string;
  /**
   * Still portrait / talking-photo anchor (URL, local path, or data: URI) —
   * the stateless mode. Mutually exclusive with `avatarId` and `video`;
   * exactly one of the three is required.
   */
  image?: string;
  /**
   * A trained, persistent avatar look id — the stateful mode (#555). Reaches
   * engines a stateless still cannot (HeyGen Avatar V) and keeps the performer
   * identical across shots.
   */
  avatarId?: string;
  /** Provider avatar family of `avatarId` (digital_twin | photo | prompt) — prices the route. */
  avatarType?: string;
  /** Engine for the persistent mode (HeyGen: avatar_v | avatar_iv | avatar_iii). */
  engine?: "avatar_v" | "avatar_iv" | "avatar_iii";
  /**
   * A FINISHED video to re-dub: the provider replaces its audio and re-animates
   * the speaker's lips. Requires `audio`. Mutually exclusive with `image` /
   * `avatarId`.
   */
  video?: string;
  /** Quality/latency trade-off on the re-dub route: speed (default) | precision. */
  mode?: "speed" | "precision";
  /**
   * Driving audio track (URL or local path). Mutually exclusive with `script`;
   * exactly one of the two is required.
   */
  audio?: string;
  /**
   * Text for the provider's own voice to read, instead of a finished audio
   * track. Requires `voiceId`. Mutually exclusive with `audio`.
   */
  script?: string;
  /** Provider-side voice id (e.g. a HeyGen voice clone). Used with `script`. */
  voiceId?: string;
  /** Optional style / motion prompt where the route supports it. */
  prompt?: string;
  /** Aspect ratio. Default "9:16" (TikTok). */
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5" | "5:4" | "auto";
  /** Resolution. Default "1080p". */
  resolution?: "720p" | "1080p" | "4k";
  /** Polling cadence in ms. Default 10000. Total budget = pollIntervalMs * pollMaxAttempts. */
  pollIntervalMs?: number;
  /** Max polling attempts. Default 60 (≈10 min at 10s cadence). */
  pollMaxAttempts?: number;
};

export type GenerateMusicInput = CommonInput & {
  prompt: string;
  durationSec: number;
  /** Default true — instrumental beds for UGC. */
  forceInstrumental?: boolean;
};

export type GenerateSfxInput = CommonInput & {
  prompt: string;
  /** Length in seconds. ElevenLabs accepts 0.5–22s. Default 4. */
  durationSec?: number;
  /** Higher = stricter to prompt, lower = more creative variation. 0–1. */
  promptInfluence?: number;
};

// ─── Shared LLM types ────────────────────────────────────────────────────────

export type LLMContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string | LLMContent[];
};

export type CallLLMOptions = {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Project ID for log line. Skipped if undefined. */
  projectId?: string;
  /** Endpoint label for the log line. */
  endpoint?: string;
  /** Slot id for the log line (mirrored into `input.slot`). #032 */
  slot?: string;
  /** Explicit provider connector id (e.g. "openrouter"). Default: first available text provider. */
  provider?: string;
  /**
   * Bypass the transient-error retry loop (#005). Default false → wraps the
   * chat-completions POST with `retryTransient()` (2 retries, 1s/4s/16s
   * backoff). Mirror of the field on `CommonInput`.
   */
  noRetry?: boolean;
};

export type CallLLMResult = {
  text: string;
  raw: unknown;
  provider: string;
  model: string;
  latencyMs: number;
};

// ─── The connector contract ──────────────────────────────────────────────────

export interface RalphyConnector {
  /** Stable id, kebab-case. Used as the `--provider` value and the `<id>:` model prefix. */
  readonly id: string;
  /** Human label for `ralphy provider list`. */
  readonly label: string;
  /** Primary env var gating availability. */
  readonly envVar: string;
  /** Where to obtain the key. */
  readonly signupUrl: string;
  /** Which cells of the capability matrix this connector fills. */
  readonly capabilities: Capability[];
  /** True iff the connector's key is present in the environment. */
  available(): boolean;

  // Capability methods — present iff advertised in `capabilities`.
  callLLM?(opts: CallLLMOptions): Promise<CallLLMResult>;
  generateImage?(input: GenerateImageInput): Promise<GenerateResult>;
  generateVideo?(input: GenerateVideoInput): Promise<GenerateResult>;
  /**
   * Talking-head lipsync (still / trained avatar / finished cut + speech →
   * video). Filled by the HeyGen connector (`heygen.ts`, #512 stateless image
   * route, #555 persistent-avatar and re-dub routes). `ralphy generate lipsync`
   * resolves the `lipsync` capability, so a second connector (fal avatar
   * routes) drops in without touching the executor.
   */
  generateLipsync?(input: GenerateLipsyncInput): Promise<GenerateResult>;
  generateVoiceover?(input: GenerateVoiceoverInput): Promise<GenerateResult>;
  generateMusic?(input: GenerateMusicInput): Promise<GenerateResult>;
  generateSfx?(input: GenerateSfxInput): Promise<GenerateResult>;
}
