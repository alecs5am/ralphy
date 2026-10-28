// Deep-vision pass — full-mp4 evaluation against project-specific context.
//
// Where the standard per-scene vision (`./vision.ts`) sends ONE keyframe per
// scene to gemini-2.5-flash with a generic UGC-issues prompt, this pass
// sends the WHOLE mp4 to google/gemini-3.1-pro-preview with the project's
// style-sheet, brief, and any reference notes loaded in-context. Output is
// rich style-conformance findings tied to specific rules from the style
// sheet — not generic UGC defaults.
//
// Triggered when --style-sheet or --brief is passed to `ralphy eval video`.
// The cost is real (gemini-3.1-pro-preview on 30-50 MB mp4) — but per the
// user directive, this is the "validator should give hard base, not generic
// answers" path. Budget is intentional.

import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { callLLM, type LLMContent } from "../providers/llm.js";
import { transcodeEvalProxy } from "../ffmpeg-recipes.js";
import { evalProxyCacheDir } from "../paths.js";
import { probeVideo } from "./probe.js";
import type { Finding, Severity } from "./types.js";

/**
 * Which prompt the deep-vision pass runs (#411):
 *   • `native-video` — general temporal-continuity / audio-picture / pacing /
 *     caption-sync / format-fit critique. NO style sheet required.
 *   • `deep-style`   — the harsher style-conformance critique, scored against a
 *     loaded STYLE_LOCK / style-sheet / brief / reference benchmark.
 * Both emit the SAME output schema (so the #409 repair loop reads `what_to_redo`
 * the same way regardless of which prompt ran).
 */
export type DeepVisionMode = "native-video" | "deep-style";

export type DeepVisionContext = {
  /** Which prompt to run. Default `deep-style` (the historical behavior) when a
   *  style sheet / brief is present; the orchestrator passes `native-video` for
   *  the no-style full-mp4 gate. */
  mode?: DeepVisionMode;
  /** Path to style-sheet.md (creator stylesheet output from scrape-profile).
   *  When set, the model evaluates the rendered video against every rule in
   *  the "What this creator NEVER does" + "Vibe & visual register" sections. */
  styleSheetPath?: string | null;
  /** Path to BRIEF.md or similar — the user's stated intent for THIS render. */
  briefPath?: string | null;
  /** Optional list of reference video URLs the creator's catalog used. The
   *  model is told to compare the rendered output to these as the target
   *  visual benchmark. */
  referenceUrls?: string[];
  /** Project id, for logging the model call against the right cost ledger. */
  projectId?: string | null;
  /** Override model. Default google/gemini-3.1-pro-preview (native video). */
  model?: string;
  /** Raw mp4 byte budget for the in-band upload. A larger video is uploaded as
   *  a smaller proxy (see `prepareVideoForUpload`). Default
   *  `DEEP_VISION_MAX_MP4_BYTES`, derived from the provider's 20,000,000-byte
   *  request limit after base64 inflation (#583). */
  maxMp4Bytes?: number;
};

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

// ─── In-band upload size budget (#583) ───────────────────────────────────────
//
// The video travels inside the JSON request body as a base64 data URL, and the
// provider behind OpenRouter (Google AI Studio) rejects bodies over 20,000,000
// bytes with HTTP 413 ("Request body exceeds the provider maximum size: 32829560
// bytes exceeds the 20000000 byte limit" for a 24.6 MB render). Base64 turns 3
// raw bytes into 4, so the raw budget is about three quarters of the body limit
// minus the prompt text. The old 40 MB raw cap let 20-40 MB renders through to
// a guaranteed 413; three of the 29 stored full-video runs died that way.

/** The provider's request-body limit, in bytes. */
export const DEEP_VISION_MAX_REQUEST_BYTES = 20_000_000;
/** Body bytes reserved for everything but the video: system prompt, style sheet
 *  (up to 24k chars), brief, references, JSON framing. Generous on purpose. */
export const DEEP_VISION_REQUEST_RESERVE_BYTES = 512 * 1024;
/** Longest `data:<mime>;base64,` prefix this module writes. */
const DATA_URL_PREFIX_BYTES = 64;

/** Bytes of the base64 encoding of `rawBytes` bytes (padded). */
export function base64EncodedBytes(rawBytes: number): number {
  return 4 * Math.ceil(Math.max(0, rawBytes) / 3);
}

/** Request-body bytes the video alone contributes (data-URL prefix + base64). */
export function videoRequestBytes(rawBytes: number): number {
  return DATA_URL_PREFIX_BYTES + base64EncodedBytes(rawBytes);
}

/** The largest raw video that keeps the request under `limit` with `reserve` left for the prompt. */
export function maxRawBytesForRequest(
  limit: number = DEEP_VISION_MAX_REQUEST_BYTES,
  reserve: number = DEEP_VISION_REQUEST_RESERVE_BYTES,
): number {
  const budget = Math.max(0, limit - reserve - DATA_URL_PREFIX_BYTES);
  return Math.floor(budget / 4) * 3;
}

/** Default raw mp4 budget for the in-band upload: about 13.9 MiB. Above it a
 *  proxy is uploaded instead (`prepareVideoForUpload`). */
export const DEEP_VISION_MAX_MP4_BYTES = maxRawBytesForRequest();

/** Encode settings for one eval upload proxy. */
export interface EvalProxyPlan {
  /** Output width in px (even, never above the source width). */
  width: number;
  videoKbps: number;
  /** 0 when the source has no audio stream. */
  audioKbps: number;
}

/** Short-side ladder for the proxy, highest first. The model samples frames at
 *  low resolution, so 720 px on the short side loses nothing it reads. */
const PROXY_SHORT_SIDES = [720, 540, 360] as const;
/** Below this video bitrate the proxy is unwatchable; trim the video instead. */
const MIN_PROXY_VIDEO_KBPS = 120;

/**
 * Plan the proxy encode that fits `maxBytes` (#583). Pure. The bitrate targets
 * 85% of the budget (minus 15% more per retry `attempt`) to absorb container
 * overhead and encoder overshoot; the short side steps down the ladder as the
 * bitrate drops and on each retry. Throws when even the smallest rung cannot
 * fit (a very long video): trim it or evaluate a shorter cut.
 */
export function planEvalProxy(input: {
  durationSec: number;
  width: number;
  height: number;
  maxBytes: number;
  hasAudio: boolean;
  attempt?: number;
}): EvalProxyPlan {
  const attempt = Math.max(0, input.attempt ?? 0);
  const duration = Math.max(0.1, input.durationSec);
  const target = input.maxBytes * 0.85 ** (attempt + 1);
  const totalKbps = Math.floor((target * 8) / duration / 1000);
  const audioKbps = input.hasAudio ? (totalKbps >= 800 ? 96 : 64) : 0;
  const videoKbps = totalKbps - audioKbps;
  if (videoKbps < MIN_PROXY_VIDEO_KBPS) {
    throw new Error(
      `video too long for an in-band eval upload: ${duration.toFixed(1)}s needs at least ${MIN_PROXY_VIDEO_KBPS + audioKbps} kbit/s, but ${(input.maxBytes / 1e6).toFixed(1)} MB allows ${totalKbps}. Evaluate a shorter cut.`,
    );
  }
  const rung = videoKbps >= 1200 ? 0 : videoKbps >= 500 ? 1 : 2;
  const shortSide = PROXY_SHORT_SIDES[Math.min(PROXY_SHORT_SIDES.length - 1, rung + attempt)]!;
  const srcShort = Math.max(1, Math.min(input.width, input.height));
  const factor = Math.min(1, shortSide / srcShort);
  const width = Math.max(2, Math.min(input.width - (input.width % 2), 2 * Math.round((input.width * factor) / 2)));
  return { width, videoKbps, audioKbps };
}

/** What `prepareVideoForUpload` decided. */
export interface PreparedVideo {
  /** The file to upload: the source, or a proxy under the eval-proxy cache. */
  path: string;
  proxied: boolean;
  originalBytes: number;
  uploadBytes: number;
}

/** Injectable steps for `prepareVideoForUpload` (tests run without ffmpeg). */
export interface PrepareVideoDeps {
  probe?: (file: string) => { durationSec: number; resolution: { w: number; h: number }; codec: { audio: string } };
  transcode?: (input: { src: string; dst: string; width: number; videoKbps: number; audioKbps: number; projectId?: string }) => Promise<string>;
  /** Where proxies are written. Default `.ralphy/cache/eval-proxy/`. */
  cacheDir?: string;
}

const PROXY_ATTEMPTS = 3;

/**
 * Return a file that fits the in-band upload budget (#583). A video at or under
 * `maxBytes` is used as-is. A larger one is transcoded to a smaller proxy with
 * local ffmpeg (scaled down, bitrate-capped) and the proxy is uploaded instead
 * of failing with HTTP 413. Proxies are cached by source path, size, mtime and
 * budget, and the encode retries smaller up to three times if it overshoots.
 */
export async function prepareVideoForUpload(
  videoPath: string,
  opts: { maxBytes?: number; projectId?: string | null; deps?: PrepareVideoDeps } = {},
): Promise<PreparedVideo> {
  const maxBytes = opts.maxBytes ?? DEEP_VISION_MAX_MP4_BYTES;
  const stats = await stat(videoPath);
  if (stats.size <= maxBytes) {
    return { path: videoPath, proxied: false, originalBytes: stats.size, uploadBytes: stats.size };
  }
  const deps = opts.deps ?? {};
  const probe = deps.probe ?? probeVideo;
  const transcode =
    deps.transcode ??
    ((i: { src: string; dst: string; width: number; videoKbps: number; audioKbps: number; projectId?: string }) =>
      transcodeEvalProxy(i));
  const meta = probe(videoPath);
  const dir = deps.cacheDir ?? evalProxyCacheDir();
  await mkdir(dir, { recursive: true });
  const key = createHash("sha256")
    .update(`${path.resolve(videoPath)}:${stats.size}:${stats.mtimeMs}:${maxBytes}`)
    .digest("hex")
    .slice(0, 16);
  let lastBytes = 0;
  for (let attempt = 0; attempt < PROXY_ATTEMPTS; attempt++) {
    const plan = planEvalProxy({
      durationSec: meta.durationSec,
      width: meta.resolution.w,
      height: meta.resolution.h,
      maxBytes,
      hasAudio: meta.codec.audio !== "?" && meta.codec.audio !== "",
      attempt,
    });
    const dst = path.join(dir, `${key}-a${attempt}.mp4`);
    const cached = await stat(dst).catch(() => null);
    if (!cached || cached.size === 0 || cached.size > maxBytes) {
      await transcode({ src: videoPath, dst, ...plan, ...(opts.projectId ? { projectId: opts.projectId } : {}) });
    }
    lastBytes = (await stat(dst)).size;
    if (lastBytes > 0 && lastBytes <= maxBytes) {
      return { path: dst, proxied: true, originalBytes: stats.size, uploadBytes: lastBytes };
    }
  }
  throw new Error(
    `mp4 is ${(stats.size / 1e6).toFixed(1)} MB, above the ${(maxBytes / 1e6).toFixed(1)} MB in-band budget, and the eval proxy still came out at ${(lastBytes / 1e6).toFixed(1)} MB after ${PROXY_ATTEMPTS} attempts. Evaluate a shorter cut.`,
  );
}

/**
 * Build the `file` LLMContent block for a video, applying the SAME size budget +
 * MIME resolution + base64 data-URL packing `deepVisionEvaluate` uses. Exported
 * so other eval passes (e.g. the per-workspace custom evaluators, #469) reuse the
 * one video-send mechanism instead of re-deriving the budget / MIME / encoding.
 * A video above `maxBytes` is uploaded as a smaller proxy (#583).
 */
export async function buildVideoContentBlock(
  videoPath: string,
  maxBytes: number = DEEP_VISION_MAX_MP4_BYTES,
  opts: { projectId?: string | null; deps?: PrepareVideoDeps } = {},
): Promise<LLMContent> {
  return (await buildVideoUpload(videoPath, maxBytes, opts)).block;
}

/** `buildVideoContentBlock` plus what was uploaded (source or proxy, sizes). */
export async function buildVideoUpload(
  videoPath: string,
  maxBytes: number = DEEP_VISION_MAX_MP4_BYTES,
  opts: { projectId?: string | null; deps?: PrepareVideoDeps } = {},
): Promise<{ block: LLMContent; prepared: PreparedVideo }> {
  const prepared = await prepareVideoForUpload(videoPath, { maxBytes, ...opts });
  const buf = await readFile(prepared.path);
  const ext = path.extname(prepared.path).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "video/mp4";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  return {
    block: { type: "file", file: { filename: path.basename(videoPath), file_data: dataUrl } },
    prepared,
  };
}

const STYLE_SYSTEM = `You are a senior creative director running a hard-base quality gate on a rendered short-form vertical video. You will be given:

1. The full rendered mp4 (native video input — you see every frame at native temporal resolution, not sampled keyframes).
2. The project's STYLE SHEET — the formal rules the render is supposed to honor. This is the source of truth.
3. The project's BRIEF — the user's specific intent for THIS render.
4. Optional reference video URLs the creator's catalog used as the target benchmark.

Your job: produce HARD, SPECIFIC, ACTIONABLE findings. Generic UGC platitudes ("hook could be stronger") are forbidden. Every finding must (a) cite a specific rule from the style sheet OR a specific brief intent, (b) cite a specific timestamp / window in the rendered video where the violation occurs, (c) explain WHY the render misses the rule in concrete terms, (d) give a concrete fix that names the slot / scene / parameter that needs to change.

CRITICAL: You are encouraged to be harsh. The user explicitly asked for a hard base of specific critique, not generic answers. If the render is mediocre, say so. If a rule is half-honored, mark it warn. If the register is wrong, mark it fail. Do not soften your assessment to be polite.

Output STRICT JSON only. No prose around the JSON, no markdown fences. Schema:

type DeepFindings = {
  overall_verdict: "pass" | "warn" | "fail";        // Holistic call across all dimensions.
  register_match: {
    declared: string;                                // What register the style sheet declared (e.g. "photoreal-handheld")
    observed: string;                                // What you actually saw in the rendered video
    match: "tight" | "loose" | "miss";               // tight = on-style; loose = drifts but readable; miss = wrong register.
    note: string;                                    // 1-2 sentences explaining the call with frame references.
  };
  rule_conformance: Array<{
    rule_id: string;                                 // Short slug for the rule (e.g. "zero-cuts", "bystander-indifference", "diegetic-only-audio")
    rule_text: string;                               // Verbatim quote from the style sheet describing the rule
    status: "pass" | "warn" | "fail";
    evidence: string;                                // What you saw in the video at specific timestamps (e.g. "at 3.5s the dog's head is half-formed but the dad's gaze flicks to the dog — bystander indifference broken")
    fix: string;                                     // Concrete next step (e.g. "regen end-frame v8 with dad's eyes locked on grill — currently he glances at second 4")
  }>;
  brief_conformance: Array<{
    brief_clause: string;                            // Quoted phrase from BRIEF.md the render is judged against
    status: "pass" | "warn" | "fail";
    evidence: string;
    fix: string;
  }>;
  uncanny_mechanism_check: {
    described_in_style_sheet: string;                // The style sheet's "uncanny mechanism" paragraph distilled to one line.
    present_in_render: "tight" | "loose" | "miss";
    evidence: string;                                // 2-3 sentences with timestamps. Does the rendered video DELIVER the mechanism, or just mimic the surface?
    fix: string;
  };
  pacing_and_timing: {
    hook_first_3s: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
    body_arc: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
    closer: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
  };
  ai_artifacts: Array<{
    timestamp_sec: number;
    description: string;                             // E.g. "at 4.2s the dog's right paw clips through the grass"
    severity: "info" | "warn" | "fail";
    fix: string;
  }>;
  what_works: string[];                              // Be honest — list 2-5 things the render genuinely got right.
  what_to_redo: Array<{                              // Prioritized list of fixes ranked by impact.
    priority: 1 | 2 | 3;                             // 1 = critical
    target: "start-frame" | "end-frame" | "i2v" | "audio" | "scene-prompt" | "model-swap" | "regen-entire";
    action: string;
    rationale: string;
  }>;
}

Rules of engagement:
- Use specific timestamps in seconds (e.g. "at 2.3s", "between 5.0 and 6.5s"). Vague "near the end" is forbidden.
- Quote style sheet rules and brief clauses VERBATIM. Don't paraphrase — copy exact phrasing.
- "what_to_redo" must be a ranked list. Priority 1 = the single thing that would most improve the render. Maximum 6 items.
- If the rendered video is a meaningful improvement over what most AI-generated UGC achieves, say so in what_works — but do not pad. Empty arrays are fine.
- Length: terse and dense. No filler.
`;

// Native-video gate (#411): the default final pass when NO style sheet/brief is
// in play. Same output schema as STYLE_SYSTEM (so the #409 repair loop reads
// `what_to_redo` identically), but the critique is GENERAL short-form quality —
// temporal continuity, audio-picture alignment, pacing, caption sync, format fit
// — rather than conformance to a creator's specific style rules. This is what
// keyframe slicing cannot see: a still never reveals a continuity jump, an
// out-of-sync caption, or a draggy hold.
const NATIVE_SYSTEM = `You are a senior short-form video editor running the FINAL quality gate on a rendered vertical (9:16) UGC video before it ships. You are given the full rendered mp4 as native video input — you see EVERY frame at native temporal resolution, not sampled keyframes. This is exactly the temporal information a keyframe pass cannot give you, so spend it: judge motion, continuity, and timing, not just isolated stills.

Your job: produce HARD, SPECIFIC, ACTIONABLE findings on the video AS A MOVING, SOUNDED ARTIFACT. Generic platitudes ("hook could be stronger", "nice pacing") are forbidden. Every finding must cite a specific timestamp / window where the problem occurs, explain WHY it hurts the video in concrete terms, and give a concrete fix naming the scene / slot / parameter to change.

Evaluate these dimensions (NO creator style sheet is provided — judge against general best-in-class short-form craft, not a specific creator's rules):

1. TEMPORAL CONTINUITY — does the subject/identity/lighting/wardrobe stay consistent across cuts? Flag morphs, identity drift between scenes, jarring jump cuts, mismatched motion direction, flicker.
2. AUDIO-PICTURE ALIGNMENT — does the VO/SFX/music land on the right picture? Flag VO that describes something not on screen, lip-sync drift, a music hit on the wrong frame, dead air over a held visual, two VO lines overlapping.
3. PACING & EDIT RHYTHM — are shots held too long (draggy) or cut too fast to read? Flag static holds with no motion, a hook that doesn't earn the first 3s, a saggy middle, a closer that fizzles.
4. CAPTION SYNC & READABILITY — do captions appear in time with the words, stay on screen long enough to read, sit in the safe zone, and not collide with each other or the subject? Flag captions that lag/lead the VO, flash too fast, or run off-frame.
5. FORMAT FIT — is it truly 9:16, framed for vertical, with the subject in the safe zone? Flag letterboxing, mis-crops, important content outside Y 210-1480 / X 60-960 of 1080x1920.
6. AI ARTIFACTS IN MOTION — warped hands/faces, clipping geometry, texture-crawl, flicker — but only the ones a MOVING frame reveals (a still-only artifact is the keyframe pass's job; here flag motion artifacts).

CRITICAL: be harsh. If the render is mediocre, say so. A keyframe pass would have passed this video on its stills alone — your job is to catch what only the full timeline shows. Do not soften to be polite.

Output STRICT JSON only. No prose around the JSON, no markdown fences. Use the SAME schema as the style gate:

type DeepFindings = {
  overall_verdict: "pass" | "warn" | "fail";        // Holistic ship/block call across all dimensions.
  register_match: {
    declared: string;                                // "(none — no style sheet; general short-form craft)"
    observed: string;                                // The register you actually saw (e.g. "photoreal handheld UGC", "PS1-horror screen-capture")
    match: "tight" | "loose" | "miss";               // tight = coherent & intentional; loose = drifts but readable; miss = incoherent register across the cut.
    note: string;                                    // 1-2 sentences with frame references.
  };
  rule_conformance: Array<{                           // Use this for TEMPORAL CONTINUITY + FORMAT FIT findings.
    rule_id: string;                                 // e.g. "continuity-identity", "continuity-lighting", "format-9x16", "no-flicker"
    rule_text: string;                               // The general craft rule (e.g. "subject identity must stay consistent across cuts")
    status: "pass" | "warn" | "fail";
    evidence: string;                                // What you saw at specific timestamps.
    fix: string;                                     // Concrete next step naming the scene / slot.
  }>;
  brief_conformance: Array<{                          // Leave EMPTY ([]) — no brief is scored in native-video mode.
    brief_clause: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    fix: string;
  }>;
  uncanny_mechanism_check: {                           // Repurposed for AUDIO-PICTURE ALIGNMENT.
    described_in_style_sheet: string;                // "audio-picture alignment"
    present_in_render: "tight" | "loose" | "miss";   // tight = audio lands on the right picture throughout; miss = VO/music repeatedly off.
    evidence: string;                                 // 2-3 sentences with timestamps.
    fix: string;
  };
  pacing_and_timing: {
    hook_first_3s: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
    body_arc: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
    closer: { status: "pass" | "warn" | "fail"; evidence: string; fix: string };
  };
  ai_artifacts: Array<{                               // Motion artifacts only — what a moving frame reveals.
    timestamp_sec: number;
    description: string;
    severity: "info" | "warn" | "fail";
    fix: string;
  }>;
  what_works: string[];                               // Honest — 2-5 things the render got right. Empty is fine.
  what_to_redo: Array<{                               // Prioritized fix list. Priority 1 = highest impact. Max 6.
    priority: 1 | 2 | 3;
    target: "start-frame" | "end-frame" | "i2v" | "audio" | "scene-prompt" | "model-swap" | "regen-entire";
    action: string;
    rationale: string;
  }>;
}

Rules of engagement:
- Use specific timestamps in seconds (e.g. "at 2.3s", "between 5.0 and 6.5s"). Vague "near the end" is forbidden.
- "what_to_redo" must be a ranked list. Priority 1 = the single thing that would most improve the render. Maximum 6 items.
- Caption-sync findings: use the "audio" target in what_to_redo (the editor owns caption timing) or "scene-prompt" if the caption text itself is wrong.
- Be honest in what_works. Empty arrays are fine. No filler.
`;

export type DeepVisionResult = {
  raw: string;
  parsed: DeepFindingsShape | null;
  findings: Finding[];
  modelUsed: string;
  /** What was uploaded (#583): the source or a smaller proxy, with sizes. */
  upload?: { proxied: boolean; originalBytes: number; uploadBytes: number };
  /** Provider-reported cost of the call in USD, when the provider returned it (#583). */
  costUsd?: number;
};

type DeepFindingsShape = {
  overall_verdict?: "pass" | "warn" | "fail";
  register_match?: {
    declared?: string;
    observed?: string;
    match?: "tight" | "loose" | "miss";
    note?: string;
  };
  rule_conformance?: Array<{
    rule_id?: string;
    rule_text?: string;
    status?: "pass" | "warn" | "fail";
    evidence?: string;
    fix?: string;
  }>;
  brief_conformance?: Array<{
    brief_clause?: string;
    status?: "pass" | "warn" | "fail";
    evidence?: string;
    fix?: string;
  }>;
  uncanny_mechanism_check?: {
    described_in_style_sheet?: string;
    present_in_render?: "tight" | "loose" | "miss";
    evidence?: string;
    fix?: string;
  };
  pacing_and_timing?: {
    hook_first_3s?: { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string };
    body_arc?: { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string };
    closer?: { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string };
  };
  ai_artifacts?: Array<{
    timestamp_sec?: number;
    description?: string;
    severity?: "info" | "warn" | "fail";
    fix?: string;
  }>;
  what_works?: string[];
  what_to_redo?: Array<{
    priority?: 1 | 2 | 3;
    target?: string;
    action?: string;
    rationale?: string;
  }>;
};

export async function deepVisionEvaluate(
  videoPath: string,
  ctx: DeepVisionContext,
): Promise<DeepVisionResult> {
  const model = ctx.model ?? "google/gemini-3.1-pro-preview";
  const maxBytes = ctx.maxMp4Bytes ?? DEEP_VISION_MAX_MP4_BYTES;
  // Default to deep-style only when a style sheet / brief / reference is
  // actually in play; otherwise the no-style native gate. The orchestrator
  // sets this explicitly per #411, but a direct caller still gets the sensible
  // default.
  const mode: DeepVisionMode =
    ctx.mode ?? (ctx.styleSheetPath || ctx.briefPath || (ctx.referenceUrls ?? []).length > 0 ? "deep-style" : "native-video");

  const { block: videoBlock, prepared } = await buildVideoUpload(videoPath, maxBytes, { projectId: ctx.projectId ?? null });

  const styleSheet = ctx.styleSheetPath ? await readSafe(ctx.styleSheetPath) : "";
  const brief = ctx.briefPath ? await readSafe(ctx.briefPath) : "";
  const refLines = (ctx.referenceUrls ?? []).slice(0, 20).map((u) => `- ${u}`).join("\n");

  const userParts: string[] = [];
  if (mode === "deep-style") {
    if (styleSheet) {
      userParts.push("## STYLE SHEET (source of truth — every rule below must be honored)\n\n" + styleSheet.slice(0, 24_000));
    } else {
      userParts.push("## STYLE SHEET\n(none provided — fall back to generic short-form vertical viral-quality heuristics; flag this absence in `note` of register_match.)");
    }
    if (brief) {
      userParts.push("## BRIEF (user's specific intent for THIS render)\n\n" + brief.slice(0, 4_000));
    }
    if (refLines) {
      userParts.push("## REFERENCE VIDEOS (the creator's target benchmark)\n\n" + refLines);
    }
  }
  userParts.push("## RENDERED VIDEO\n(attached as file content block — evaluate the full mp4 at native temporal resolution)");
  userParts.push("Return the strict JSON findings now. Be harsh and specific.");

  const content: LLMContent[] = [
    videoBlock,
    { type: "text", text: userParts.join("\n\n") },
  ];

  const system = mode === "deep-style" ? STYLE_SYSTEM : NATIVE_SYSTEM;

  // NOTE: jsonMode=false intentional. gemini-3.1-pro-preview with a video
  // file content block + jsonMode returns an empty text body — confirmed
  // bug pattern. Same workaround as cli/lib/research.ts → analyzeVideo:
  // ask for JSON-shaped output in the prompt, parse fenced/raw JSON
  // post-hoc.
  const { text, usage } = await callLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    model,
    jsonMode: false,
    temperature: 0.2,
    maxTokens: 16000,
    projectId: ctx.projectId ?? undefined,
    endpoint: `eval/deep-vision/${mode}`,
  });

  const parsed = safeParseJson(text);
  const findings = parsed ? translateToFindings(parsed) : [];
  return {
    raw: text,
    parsed,
    findings,
    modelUsed: model,
    upload: { proxied: prepared.proxied, originalBytes: prepared.originalBytes, uploadBytes: prepared.uploadBytes },
    ...(typeof usage?.costUsd === "number" ? { costUsd: usage.costUsd } : {}),
  };
}

async function readSafe(p: string): Promise<string> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}

function safeParseJson(text: string): DeepFindingsShape | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as DeepFindingsShape;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as DeepFindingsShape;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function severityFromStatus(s: string | undefined): Severity {
  if (s === "fail") return "fail";
  if (s === "warn") return "warn";
  return "info";
}

let _idCounter = 1000;
function nextId(): string {
  _idCounter += 1;
  return `D${_idCounter}`;
}

function translateToFindings(d: DeepFindingsShape): Finding[] {
  const out: Finding[] = [];

  if (d.register_match && d.register_match.match && d.register_match.match !== "tight") {
    const sev: Severity = d.register_match.match === "miss" ? "fail" : "warn";
    out.push({
      id: nextId(),
      category: "style.register-mismatch",
      severity: sev,
      sceneIndex: null,
      timestampSec: null,
      message: `Register: declared "${d.register_match.declared ?? "?"}", observed "${d.register_match.observed ?? "?"}" (${d.register_match.match}). ${d.register_match.note ?? ""}`.trim(),
      fixHint: "Re-anchor the i2v start+end frames in the correct cinematographic register before re-rendering. Mismatched register is the single highest-impact failure mode.",
      fixCommand: null,
    });
  }

  for (const r of d.rule_conformance ?? []) {
    if (!r || r.status === "pass") continue;
    out.push({
      id: nextId(),
      category: "style.rule-violation",
      severity: severityFromStatus(r.status),
      sceneIndex: null,
      timestampSec: null,
      message: `Rule "${r.rule_id ?? "?"}" violated. Style sheet says: "${(r.rule_text ?? "").slice(0, 240)}". Evidence: ${r.evidence ?? "(none)"}`,
      fixHint: r.fix ?? "Re-render with the rule honored.",
      fixCommand: null,
    });
  }

  for (const b of d.brief_conformance ?? []) {
    if (!b || b.status === "pass") continue;
    out.push({
      id: nextId(),
      category: "brief.intent-drift",
      severity: severityFromStatus(b.status),
      sceneIndex: null,
      timestampSec: null,
      message: `Brief clause "${(b.brief_clause ?? "").slice(0, 160)}" not delivered. Evidence: ${b.evidence ?? "(none)"}`,
      fixHint: b.fix ?? "Re-align with the brief.",
      fixCommand: null,
    });
  }

  if (d.uncanny_mechanism_check && d.uncanny_mechanism_check.present_in_render && d.uncanny_mechanism_check.present_in_render !== "tight") {
    const sev: Severity = d.uncanny_mechanism_check.present_in_render === "miss" ? "fail" : "warn";
    out.push({
      id: nextId(),
      category: "style.aesthetic-mechanism-missing",
      severity: sev,
      sceneIndex: null,
      timestampSec: null,
      message: `Aesthetic mechanism (${d.uncanny_mechanism_check.described_in_style_sheet ?? "?"}) is ${d.uncanny_mechanism_check.present_in_render} in the render. Evidence: ${d.uncanny_mechanism_check.evidence ?? "(none)"}`,
      fixHint: d.uncanny_mechanism_check.fix ?? "Surface the aesthetic mechanism more deliberately.",
      fixCommand: null,
    });
  }

  for (const [phase, val] of Object.entries(d.pacing_and_timing ?? {}) as Array<[
    string,
    { status?: "pass" | "warn" | "fail"; evidence?: string; fix?: string },
  ]>) {
    if (!val || val.status === "pass") continue;
    out.push({
      id: nextId(),
      category: `style.timing-${phase.replace(/_/g, "-")}`,
      severity: severityFromStatus(val.status),
      sceneIndex: null,
      timestampSec: null,
      message: `${phase} timing ${val.status}: ${val.evidence ?? "(no evidence given)"}`,
      fixHint: val.fix ?? "Adjust timing.",
      fixCommand: null,
    });
  }

  for (const a of d.ai_artifacts ?? []) {
    if (!a) continue;
    out.push({
      id: nextId(),
      category: "vision.ai-artifacts",
      severity: severityFromStatus(a.severity),
      sceneIndex: null,
      timestampSec: typeof a.timestamp_sec === "number" ? a.timestamp_sec : null,
      message: a.description ?? "(no description)",
      fixHint: a.fix ?? "Re-generate the affected segment.",
      fixCommand: null,
    });
  }

  return out;
}
