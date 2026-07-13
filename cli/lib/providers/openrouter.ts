// OpenRouter connector — the default text / image / video engine.
//
// Implements the `RalphyConnector` contract (cli/lib/providers/types.ts). One
// OpenRouter key unlocks chat-completions (LLM + vision), image generation
// (gemini-3-pro-image-preview, gpt-5.4-image-2, …), and async video generation
// (kling, veo, seedance, …). The connector gates on its OWN env var — no
// hardcoded capability id — so the call path doesn't know or care that this is
// the "default" provider.
//
// **No FAL_KEY, no direct openai.com, no Vercel.** See AGENTS.md invariant #1.

import path from "node:path";
import fs from "node:fs/promises";
import { logGeneration } from "../gen-log.js";
import { generationDestination } from "../generation-destination.js";
import {
  assetPath,
  protectExistingAsset,
  writeImageFromUrlOrDataUri,
  resolveImageRef,
  resolveImageRefForVideo,
  logFailure,
  rewriteUpstreamError,
  requireProviderKey,
  retryTransient,
  TerminalProviderError,
  TransientPayloadError,
} from "./shared.js";
import { withConcurrency } from "./concurrency.js";
import type {
  RalphyConnector,
  CallLLMOptions,
  CallLLMResult,
  GenerateImageInput,
  GenerateVideoInput,
  GenerateResult,
} from "./types.js";

const ID = "openrouter";
const LABEL = "OpenRouter";
const ENV_VAR = "OPENROUTER_API_KEY";
const SIGNUP_URL = "https://openrouter.ai/keys";
const BASE_URL = "https://openrouter.ai/api/v1";

// OpenRouter image models accept a structured `image_config.aspect_ratio`
// (chat-completions image modality). Passing it is the only reliable way to get
// non-square output — the in-prompt size hint alone is ignored by gpt-image,
// which always falls back to 1024². Map a "WxH" size string to the nearest
// allowed ratio. Allowed set per OR docs (2026-05): 1:1 2:3 3:2 3:4 4:3 4:5 5:4
// 9:16 16:9 21:9.
const OR_ASPECT_RATIOS: Array<[string, number]> = [
  ["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3],
  ["4:5", 4 / 5], ["5:4", 5 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9],
];
function sizeToAspectRatio(size: string): string | undefined {
  const m = size.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) return undefined;
  const ratio = Number(m[1]) / Number(m[2]);
  if (!isFinite(ratio) || ratio <= 0) return undefined;
  return OR_ASPECT_RATIOS.reduce((best, c) =>
    Math.abs(c[1] - ratio) < Math.abs(best[1] - ratio) ? c : best
  )[0];
}

// Natural output resolution per model + aspect ratio. The hosted image
// endpoints snap user-supplied --size to these regardless of what the prompt /
// flag says — passing 1290x2796 on gpt-5.4-image-2 produces a 1024² image and
// the user gets surprised. #051: warn-on-mismatch at submit time so the
// surprise is visible, and expose a `naturalSizeFor()` helper the CLI can use
// to resolve a friendly `--aspect <9:16>` request to the right pixel grid.
type AspectKey = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";
type NaturalSizeTable = Partial<Record<AspectKey, string>>;
const NATURAL_SIZE_BY_MODEL: Record<string, NaturalSizeTable> = {
  // gpt-5.4-image-2: hard-snaps to a fixed pixel grid per aspect. Numbers from
  // OpenAI's gpt-image-1 docs (which gpt-5.4 inherits).
  "openai/gpt-5.4-image-2": {
    "1:1": "1024x1024",
    "9:16": "1024x1536",
    "16:9": "1536x1024",
    "2:3": "1024x1536",
    "3:2": "1536x1024",
    "3:4": "1024x1536",
    "4:3": "1536x1024",
  },
  // gemini-3-pro-image-preview: nano-banana-pro lineage. 768x1376 portrait,
  // 1376x768 landscape, 1024² square. Other ratios round to the nearest.
  "google/gemini-3-pro-image-preview": {
    "1:1": "1024x1024",
    "9:16": "768x1376",
    "16:9": "1376x768",
    "3:4": "768x1024",
    "4:3": "1024x768",
  },
  "google/gemini-3.1-flash-image-preview": {
    "1:1": "1024x1024",
    "9:16": "768x1376",
    "16:9": "1376x768",
  },
  "google/gemini-2.5-flash-image": {
    "1:1": "1024x1024",
    "9:16": "768x1376",
    "16:9": "1376x768",
  },
};

/** Look up the natural output size a model produces for a given aspect ratio. Returns undefined when unknown. */
export function naturalSizeFor(model: string, aspect: string): string | undefined {
  const tbl = NATURAL_SIZE_BY_MODEL[model];
  if (!tbl) return undefined;
  return tbl[aspect as AspectKey];
}

/**
 * Compare the user-supplied `--size W×H` against the model's natural grid for
 * the resolved aspect. Returns a single-line warning when they disagree, or
 * undefined when they match / the model isn't in the table. #051.
 */
export function sizeMismatchWarning(
  model: string,
  size: string,
  aspect: string | undefined,
): string | undefined {
  if (!aspect) return undefined;
  const natural = naturalSizeFor(model, aspect);
  if (!natural) return undefined;
  if (size.trim().toLowerCase() === natural.toLowerCase()) return undefined;
  return `--size ${size} ignored by ${model}; natural output for aspect ${aspect} is ${natural}.`;
}

function requireKey(): void {
  requireProviderKey({ envVar: ENV_VAR, label: LABEL, signupUrl: SIGNUP_URL });
}

// ─── text (chat-completions) ─────────────────────────────────────────────────

const DEFAULT_LLM_MODEL = "google/gemini-2.5-flash";

export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  requireKey();
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const model = opts.model ?? DEFAULT_LLM_MODEL;
  const endpoint = opts.endpoint ?? "openrouter/chat-completions";

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  // #005: wrap the chat-completions POST in a transient-error retry loop.
  // Skeleton-null / MALFORMED_FUNCTION_CALL go through TransientPayloadError;
  // 4xx semantic errors stay TerminalProviderError so the user sees the real
  // refusal without burning retries.
  return retryTransient(
    async (attempt) => {
      const t0 = Date.now();
      // #007: hold a concurrency slot only for the network round-trip. The
      // retry backoff sleep runs OUTSIDE the semaphore so a stuck call doesn't
      // starve other callers — retry re-acquires a fresh slot on each attempt.
      const resp = await withConcurrency(ID, model, "text", () =>
        fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );

      const latencyMs = Date.now() - t0;

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        const message = `${ID} ${resp.status}: ${errText.slice(0, 500)}`;
        if (resp.status >= 400 && resp.status < 500) {
          throw new TerminalProviderError(message);
        }
        // 5xx → plain Error so classifier sees the status + body and decides.
        throw new Error(message);
      }

      const json = (await resp.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string | null;
        }>;
      };
      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? "";
      const finish = choice?.finish_reason ?? null;

      // Gemini skeleton-null: 200-OK with `finish_reason: null` and empty
      // content. kbo-broadcast-001 hit this 4× before the 5th attempt
      // succeeded. Treat as transient.
      if ((finish === null || finish === undefined) && text.length === 0) {
        throw new TransientPayloadError(
          `${ID} chat-completions returned skeleton-null (finish_reason=${finish}, content="") on ${model}. Raw: ${JSON.stringify(json).slice(0, 500)}`,
        );
      }
      // MALFORMED_FUNCTION_CALL: OR returns this finish_reason when a tool-use
      // turn glitches — retry usually clears it.
      if (finish === "MALFORMED_FUNCTION_CALL") {
        throw new TransientPayloadError(
          `${ID} chat-completions finish_reason=MALFORMED_FUNCTION_CALL on ${model}. Raw: ${JSON.stringify(json).slice(0, 500)}`,
        );
      }

      if (opts.projectId) {
        await logGeneration(opts.projectId, {
          provider: ID,
          model,
          endpoint,
          kind: "text",
          input: { model, messages: opts.messages.length, slot: opts.slot, project: opts.projectId },
          output: { bytes: text.length },
          status: "ok",
          latency_ms: latencyMs,
          attempt,
        });
      }

      return { text, raw: json, provider: ID, model, latencyMs };
    },
    {
      noRetry: opts.noRetry,
      onTransientFailure: opts.projectId
        ? async (err, attempt) => {
            await logGeneration(opts.projectId!, {
              provider: ID,
              model,
              endpoint,
              kind: "text",
              input: { model, messages: opts.messages.length, slot: opts.slot, project: opts.projectId },
              status: "error",
              error: err instanceof Error ? err.message : String(err),
              attempt,
              note: `transient retry ${attempt}`,
            });
          }
        : undefined,
    },
  );
}

// ─── image ───────────────────────────────────────────────────────────────────

// Default flipped back to google/gemini-3-pro-image-preview ("nano banana pro") on 2026-05-20 —
// multi-ref consistency + cheaper per-image + ≥4 concurrent. Pass --model openai/gpt-5.4-image-2
// when typography on labels / small detail accuracy matters more than ref consistency.
const DEFAULT_IMAGE_MODEL = "google/gemini-3-pro-image-preview";

// Per-image cost lookup. OR bills per generation (one image per call); these are
// ballparks from MODELS.md until OR returns billed cost in the response payload.
// Add a row when a new model is used in production.
const IMAGE_PRICE_PER_GEN: Record<string, number> = {
  "openai/gpt-5.4-image-2": 0.20,             // premium tier
  "openai/gpt-5-image": 0.25,                 // most expensive OpenAI tier
  "openai/gpt-5-image-mini": 0.08,            // budget OpenAI
  "google/gemini-3-pro-image-preview": 0.15,  // nano-banana lineage, multi-ref champ
  "google/gemini-3.1-flash-image-preview": 0.04,
  "google/gemini-2.5-flash-image": 0.02,      // cheapest
  "recraft/recraft-v4.1-pro": 0.25,           // raster ~2K; image-only modality; max 1 ref
  "recraft/recraft-v4.1-pro-vector": 0.30,    // SVG vector output; image-only modality; max 1 ref
};
const IMAGE_PRICE_FALLBACK = 0.15;

export async function generateImage(input: GenerateImageInput): Promise<GenerateResult> {
  requireKey();
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_IMAGE_MODEL;
  const size = input.size ?? "1080x1920";
  const apiKey = process.env.OPENROUTER_API_KEY!;

  // OpenRouter image-generation models (gemini-3-pro-image-preview,
  // gpt-5.4-image-2, …) are exposed via /api/v1/chat/completions with
  // `modalities: ["image", "text"]`. The legacy /api/v1/images/generations
  // path returns 404. Per OR docs the response carries the bytes on
  // `choices[0].message.images[].image_url.url` as a data: URL or http URL.
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
  ];
  if (input.negativePrompt) {
    userContent.push({
      type: "text",
      text: `Negative prompt — avoid: ${input.negativePrompt}`,
    });
  }
  userContent.push({
    type: "text",
    text: `Aspect/size hint: ${size} (vertical 9:16 if size is 1080x1920).`,
  });
  // Recraft constraint: only one input image is supported.
  const isRecraft = model.startsWith("recraft/");
  if (input.refs && input.refs.length > 0) {
    const refs = isRecraft ? input.refs.slice(0, 1) : input.refs;
    for (const ref of refs) {
      const url = await resolveImageRef(ref);
      userContent.push({ type: "image_url", image_url: { url } });
    }
  }

  // Recraft v4.1 vector is image-only — chat-completions rejects ["image","text"]
  // for it with 404 "No endpoints found that support the requested output modalities".
  const modalities = isRecraft ? ["image"] : ["image", "text"];

  const body: Record<string, unknown> = {
    model,
    modalities,
    messages: [{ role: "user", content: userContent }],
  };
  // Structured aspect-ratio control. Recraft (image-only vector) ignores it; for
  // everyone else, map the size hint to OR's `image_config.aspect_ratio` so the
  // model returns non-square output instead of defaulting to 1024².
  const aspectRatio = isRecraft ? undefined : sizeToAspectRatio(size);
  if (aspectRatio) {
    body.image_config = { aspect_ratio: aspectRatio };
  }

  // #051: when --size doesn't match the model's natural grid for the resolved
  // aspect, emit a warning to stderr at submit time. The hosted endpoints
  // silently snap to natural output; users wasted time expecting Apple App
  // Store native 1290x2796 from gpt-5.4-image-2 and getting back 1024².
  const mismatch = aspectRatio ? sizeMismatchWarning(model, size, aspectRatio) : undefined;
  if (mismatch) {
    process.stderr.write(`[warn] ${mismatch}\n`);
  }

  // #005: wrap the POST + payload-parse in `retryTransient`. Only the network
  // call is retried; once we have a `url`, the protect+write block runs once.
  type ImageNetResult = { url: string; rawJson: unknown };
  const net = await retryTransient<ImageNetResult & { _attempt: number }>(
    async (attempt) => {
      const tCall = Date.now();
      let resp: Response;
      try {
        // #007: in-process concurrency self-throttle. Wraps the round-trip
        // only; retry-OUTSIDE-semaphore so backoff sleeps don't pin the slot.
        resp = await withConcurrency(ID, model, "image", () =>
          fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: input.signal,
          }),
        );
      } catch (err) {
        // Network-layer throw (fetch failed, TLS, ECONNRESET). Re-throw as-is —
        // classifier sees `.code` / message and decides transient vs terminal.
        throw err;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const rewritten = rewriteUpstreamError(model, resp.status, text);
        const message = `OpenRouter images ${rewritten}`;
        if (resp.status >= 400 && resp.status < 500) {
          throw new TerminalProviderError(message);
        }
        throw new Error(message);
      }

      const json = (await resp.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            images?: Array<{ image_url?: { url?: string }; url?: string }>;
          };
          finish_reason?: string;
        }>;
      };
      const imgEntry = json.choices?.[0]?.message?.images?.[0];
      const url = imgEntry?.image_url?.url ?? imgEntry?.url;
      if (!url) {
        const finish = json.choices?.[0]?.finish_reason ?? "unknown";
        const text = json.choices?.[0]?.message?.content ?? "";
        const rawDump = JSON.stringify(json).slice(0, 1500);
        // Skeleton / empty `images[]` on 200 — transient (gpt-image + gemini
        // both surface this when the upstream pool blips).
        throw new TransientPayloadError(
          `OpenRouter image response had no images[0] (model=${model}, finish_reason=${finish}). Message text: ${text.slice(0, 600) || "<empty>"}. Raw response: ${rawDump}`,
        );
      }
      void tCall;
      return { url, rawJson: json, _attempt: attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, model, "image", body, err, t0, attempt);
      },
    },
  );

  const imgDest = assetPath(input, "images", `${input.slot}.png`);
  await protectExistingAsset(imgDest, input.overwrite);
  const localPath = await writeImageFromUrlOrDataUri(net.url, imgDest);

  const result: GenerateResult = {
    url: net.url,
    localPath,
    costUsd: IMAGE_PRICE_PER_GEN[model] ?? IMAGE_PRICE_FALLBACK,
    latencyMs: Date.now() - t0,
    model,
  };
  await logGeneration(generationDestination(input), {
    slot: input.slot,
    provider: ID,
    model,
    endpoint: model,
    kind: "image",
    input: { slot: input.slot, project: input.projectId, prompt: input.prompt, size, refs: input.refs ?? [] },
    output: { url: net.url, local: localPath },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    attempt: net._attempt,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─── video (image-to-video / text-to-video, async) ───────────────────────────

const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";
// Per-second cost per-model. Empirically verified against OpenRouter billing on
// 2026-05-11 — see docs/render-test-2026-05-11.md §1.1. OR bills per-clip with
// a flat per-second rate per model; the per-second math here matches observed
// billing across duration parameters. Add a row whenever a new model is used.
const VIDEO_PRICE_PER_SEC: Record<string, number> = {
  // kling family — both pro and std bill at the same per-second rate on OR
  "kwaivgi/kling-v3.0-pro": 0.14,
  "kwaivgi/kling-v3.0-std": 0.14,   // verified 2026-05-11: $0.70 / 5s clip (not "½ of pro" — same rate)
  "kwaivgi/kling-video-o1": 0.14,
  // veo family
  "google/veo-3.1": 0.5,             // full / 4K
  "google/veo-3.1-fast": 0.14,       // verified 2026-05-11: $1.12 / 8s clip
  "google/veo-3.1-lite": 0.0875,     // ballpark from MODELS.md; verify in next test-drive
  // seedance family
  "bytedance/seedance-2.0": 0.14,        // verified 2026-05-11 — match family rate, not earlier $0.10/s
  "bytedance/seedance-2.0-fast": 0.14,   // verified 2026-05-11: $0.56 / 4s clip
  // alibaba wan family — using MODELS.md ballparks, verify on first use
  "alibaba/wan-2.6": 0.10,
  "alibaba/wan-2.7": 0.10,
  // minimax
  "minimax/hailuo-2.3": 0.10,
};

// Per-model prompt-length cap. OR returns 400 after a round-trip when exceeded
// (4× wasted submits in glitter-cream-001 before this preflight landed). Catch
// it client-side as a TerminalProviderError so the retry helper bails immediately
// and the user sees an actionable hint. Add a row whenever a model documents a
// hard prompt cap (seedance / veo / wan caps are not yet measured — add on
// first round-trip 400). Source: notes/issues/008.
const MAX_PROMPT_CHARS: Record<string, number> = {
  "kwaivgi/kling-v3.0-pro": 2500,
  "kwaivgi/kling-v3.0-std": 2500,
  "kwaivgi/kling-video-o1": 2500,
};

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateResult> {
  requireKey();
  const t0 = Date.now();
  const model = input.model ?? DEFAULT_VIDEO_MODEL;
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const aspectRatio = input.aspectRatio ?? "9:16";
  const resolution = input.resolution ?? "720p";
  const pollIntervalMs = input.pollIntervalMs ?? 15_000;
  const pollMaxAttempts = input.pollMaxAttempts ?? 80;

  // ── Preflight: kling-v3.0-pro multi-frame is a known-bad path. Even after
  // the 2026-05-19 C2PA-strip mitigation, both-frame submissions consistently
  // return 400 "File is not in a valid base64 format" across flipper, glitter-
  // cream, playdate, venom. The right answer is seedance-2.0 (honors --last-
  // frame natively for non-photoreal-human anchors). Throw a TerminalProvider-
  // Error so the retry helper bails immediately — no fetch, no cost. Issue #008.
  if (
    model === "kwaivgi/kling-v3.0-pro" &&
    (input.firstFrame ?? input.image) &&
    input.lastFrame
  ) {
    throw new TerminalProviderError(
      "kling-v3.0-pro multi-frame submissions always fail (base64 encoding bug); use bytedance/seedance-2.0 for first+last frame anchoring.",
    );
  }

  // ── Preflight: per-model prompt-length cap. Kling rejects >2500 chars with a
  // round-trip 400 — preflight saves the round-trip and points the user at the
  // load-bearing clauses (voice-tag, no-music ban, on-camera-EN) that should
  // not be cut. Throw as TerminalProviderError so the retry helper doesn't loop.
  const maxChars = MAX_PROMPT_CHARS[model];
  if (maxChars !== undefined && input.prompt.length > maxChars) {
    if (model.startsWith("kwaivgi/kling-")) {
      throw new TerminalProviderError(
        `kling-v3.0-pro prompt cap is ${maxChars} chars; got ${input.prompt.length}. Compress before submit. ` +
          `Trim atmosphere / setting prose first — voice-tag, no-music ban, and on-camera-EN clauses are load-bearing. ` +
          `See MODELS.md "Kling 2500-char prompt cap" for the rationale.`,
      );
    }
    throw new TerminalProviderError(
      `${model} prompt cap is ${maxChars} chars; got ${input.prompt.length}. Compress before submit.`,
    );
  }

  // OpenRouter video generation is async: POST /api/v1/videos returns a job
  // with `id` + `polling_url` + (eventually) `unsigned_urls`. The legacy
  // /api/v1/videos/generations path returns 404. See
  // https://openrouter.ai/docs/cookbook/video-generation/text-to-video
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    duration: Math.round(input.durationSec),
    aspect_ratio: aspectRatio,
    resolution,
    generate_audio: input.generateAudio ?? false,
  };
  const firstFrameRef = input.firstFrame ?? input.image;
  const frameImages: Array<Record<string, unknown>> = [];
  // Pre-processing telemetry per anchor — logged into `input.preprocess` on the
  // generations.jsonl row so postmortems can trace which anchors got C2PA-
  // stripped and/or downscaled to JPG before going on the wire. See #021.
  const preprocess: Record<string, unknown> = {};
  if (firstFrameRef) {
    const { url, info } = await resolveImageRefForVideo(firstFrameRef);
    frameImages.push({
      type: "image_url",
      image_url: { url },
      frame_type: "first_frame",
    });
    preprocess.first_frame = info;
  }
  if (input.lastFrame) {
    const { url, info } = await resolveImageRefForVideo(input.lastFrame);
    frameImages.push({
      type: "image_url",
      image_url: { url },
      frame_type: "last_frame",
    });
    preprocess.last_frame = info;
  }
  if (frameImages.length > 0) body.frame_images = frameImages;
  // Reference-to-video (`input_references`): style / subject / identity guidance
  // without exact-frame pinning. Seedance-2.0 accepts ≤9 image refs; prompt
  // references them as `Image 1`, `Image 2`, … in --ref order. See
  // https://openrouter.ai/docs/cookbook/video-generation/reference-to-video
  if (input.refs && input.refs.length > 0) {
    const inputReferences: Array<Record<string, unknown>> = [];
    const refInfos: unknown[] = [];
    for (const ref of input.refs) {
      const { url, info } = await resolveImageRefForVideo(ref);
      inputReferences.push({ type: "image_url", image_url: { url } });
      refInfos.push(info);
    }
    body.input_references = inputReferences;
    preprocess.input_references = refInfos;
  }

  type VideoJob = {
    id: string;
    status: string;
    polling_url?: string;
    unsigned_urls?: string[];
    error?: string | { message?: string };
  };

  // #005: wrap the initial submit in `retryTransient`. The poll loop below
  // is its own thing and already has a max-attempts budget — keep them
  // separate so a real terminal error during submit doesn't burn polls.
  const submitResult = await retryTransient<{ job: VideoJob & Record<string, unknown>; attempt: number }>(
    async (attempt) => {
      let resp: Response;
      try {
        // #007: hold a concurrency slot for the submit round-trip only. The
        // poll loop below is its own thing and doesn't pin a slot — long-
        // running video jobs would starve everyone otherwise.
        resp = await withConcurrency(ID, model, "video", () =>
          fetch(`${BASE_URL}/videos`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: input.signal,
          }),
        );
      } catch (err) {
        throw err;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const rewritten = rewriteUpstreamError(model, resp.status, text);
        const message = `OpenRouter videos submit ${rewritten}`;
        if (resp.status >= 400 && resp.status < 500) {
          throw new TerminalProviderError(message);
        }
        throw new Error(message);
      }

      const submitted = (await resp.json()) as VideoJob & Record<string, unknown>;
      if (!submitted.id) {
        const jobErr =
          typeof submitted.error === "string"
            ? submitted.error
            : (submitted.error as { message?: string } | undefined)?.message ?? "";
        const rawDump = JSON.stringify(submitted).slice(0, 1500);
        // No job.id on 200 → transient (choose-your-guide hit this via OR 502).
        throw new TransientPayloadError(
          `OpenRouter video submit had no job.id (model=${model}). Error field: ${jobErr || "<empty>"}. Raw response: ${rawDump}`,
        );
      }
      return { job: submitted, attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, model, "video", body, err, t0, attempt);
      },
    },
  );
  let job = submitResult.job;
  const submitAttempt = submitResult.attempt;

  const terminalErr = new Set(["failed", "cancelled", "expired"]);
  for (let attempt = 1; attempt <= pollMaxAttempts; attempt += 1) {
    if (job.status === "completed") break;
    if (terminalErr.has(job.status)) {
      const detail =
        typeof job.error === "string"
          ? job.error
          : job.error?.message ?? `video job ${job.status}`;
      const err = new Error(`OpenRouter video ${job.status}: ${detail}`);
      await logFailure(input, ID, model, "video", body, err, t0);
      throw err;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollUrl = job.polling_url
      ? new URL(job.polling_url, "https://openrouter.ai").toString()
      : `${BASE_URL}/videos/${job.id}`;
    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: input.signal,
    });
    if (!pollResp.ok) {
      const text = await pollResp.text().catch(() => "");
      const err = new Error(`OpenRouter video poll ${pollResp.status}: ${text.slice(0, 500)}`);
      await logFailure(input, ID, model, "video", body, err, t0);
      throw err;
    }
    job = (await pollResp.json()) as VideoJob;
  }

  if (job.status !== "completed") {
    const err = new Error(
      `OpenRouter video did not complete after ${pollMaxAttempts} polls (${pollIntervalMs}ms each); last status: ${job.status}`
    );
    await logFailure(input, ID, model, "video", body, err, t0);
    throw err;
  }

  const dest = assetPath(input, "videos", `${input.slot}.mp4`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const downloadUrl =
    job.unsigned_urls?.[0] ??
    `${BASE_URL}/videos/${job.id}/content?index=0`;
  const dl = await fetch(downloadUrl, {
    headers: downloadUrl.startsWith("https://openrouter.ai/")
      ? { Authorization: `Bearer ${apiKey}` }
      : undefined,
    signal: input.signal,
  });
  if (!dl.ok) {
    const text = await dl.text().catch(() => "");
    const err = new Error(`OpenRouter video download ${dl.status}: ${text.slice(0, 200)}`);
    await logFailure(input, ID, model, "video", body, err, t0);
    throw err;
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  await protectExistingAsset(dest, input.overwrite);
  await fs.writeFile(dest, buf);

  const pricePerSec = VIDEO_PRICE_PER_SEC[model] ?? 0.14;
  const result: GenerateResult = {
    url: downloadUrl,
    localPath: dest,
    costUsd: pricePerSec * input.durationSec,
    latencyMs: Date.now() - t0,
    model,
  };
  await logGeneration(generationDestination(input), {
    slot: input.slot,
    provider: ID,
    model,
    endpoint: model,
    kind: "video",
    input: {
      slot: input.slot,
      project: input.projectId,
      prompt: input.prompt,
      duration_sec: input.durationSec,
      aspect_ratio: aspectRatio,
      resolution,
      image: input.image ? "[ref-supplied]" : undefined,
      refs: input.refs && input.refs.length > 0 ? input.refs : undefined,
      preprocess: Object.keys(preprocess).length > 0 ? preprocess : undefined,
    },
    output: { url: downloadUrl, local: dest, job_id: job.id },
    status: "ok",
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    attempt: submitAttempt,
    note: input.note ?? input.slot,
  });
  return result;
}

// ─── connector object ──────────────────────────────────────────────────────

export const openrouterConnector: RalphyConnector = {
  id: ID,
  label: LABEL,
  envVar: ENV_VAR,
  signupUrl: SIGNUP_URL,
  capabilities: ["text", "image", "video", "transcribe"],
  available: () => Boolean(process.env[ENV_VAR]),
  callLLM,
  generateImage,
  generateVideo,
};
