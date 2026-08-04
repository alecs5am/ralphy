// fal.ai connector — sanctioned third-party video engine (issue #402).
//
// Implements the `RalphyConnector` contract (cli/lib/providers/types.ts). One
// `FAL_KEY` unlocks two omni / reference-to-video models that do NOT exist on
// OpenRouter:
//   - bytedance/seedance-2.0/reference-to-video — accepts a real-human-face
//     reference VIDEO (`video_urls`) with no privacy block, plus image refs
//     (`image_urls`, the @Image1 convention). $0.3034/s 720p, ×0.6 with video
//     inputs (= $0.1814/s), $0.682/s 1080p.
//   - fal-ai/kling-video/o3/pro/reference-to-video (Kling O3 omni) — `elements`
//     (@Element1) + `image_urls` (@Image1), NO video input, 3-15s, 16:9/9:16/1:1.
//     $0.112/s audio-off, $0.14/s audio-on.
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `FAL_KEY` OR HIT `fal.run` /
// `fal.ai` HOSTS (AGENTS.md invariant #1, amended for #402). The agents-md
// invariants test allowlists exactly this file; every other source file is
// still forbidden. Reaching for raw curl against fal elsewhere is a defect.
//
// Flow: upload any local refs to the fal CDN → submit to the queue
// (https://queue.fal.run/<endpoint>) → poll the status URL → fetch the response
// URL → download the mp4 to the caller's Run-owned temporary path. The command
// layer promotes those bytes into an immutable Object and Artifact revision and
// records provider cost on the Run Attempt.

import path from "node:path";
import fs from "node:fs/promises";
import {
  providerOutputPath,
  providerHttpError,
  logFailure,
  requireProviderKey,
  retryTransient,
  TerminalProviderError,
  TransientPayloadError,
} from "./shared.js";
import {
  probeRefVideo,
  planRefVideos,
  materializeRefVideo,
} from "./ref-video.js";
import type {
  RalphyConnector,
  GenerateVideoInput,
  GenerateResult,
} from "./types.js";
import {
  credentialConfigured,
  credentialValue,
  FAL_CREDENTIAL,
} from "./credentials.js";

const ID = "fal";
const LABEL = "fal.ai";
const ENV_VAR = "FAL_KEY";
const SIGNUP_URL = "https://fal.ai/dashboard/keys";

// Queue REST base — submit POSTs here, the response carries status_url +
// response_url for the rest of the lifecycle (verified against fal queue docs
// 2026-06-12). Auth header is `Authorization: Key <FAL_KEY>` across all fal hosts.
const QUEUE_BASE = "https://queue.fal.run";
// CDN upload (initiate → PUT → file_url), per the #402 spec.
const STORAGE_INITIATE_URL = "https://rest.alpha.fal.ai/storage/upload/initiate";

function requireKey(): void {
  requireProviderKey({ providerId: ID, envVar: ENV_VAR, label: LABEL, signupUrl: SIGNUP_URL });
}

function authHeader(): { Authorization: string } {
  return { Authorization: `Key ${credentialValue(ID)!}` };
}

// ─── model catalog (fal-local; these models are NOT in the OR catalog) ───────

type FalVideoModel = {
  /** Canonical fal endpoint id (also the model id passed on --model). */
  endpoint: string;
  /** Which reference modalities this endpoint accepts. */
  acceptsVideoRefs: boolean;
  acceptsImageRefs: boolean;
  acceptsElements: boolean;
  /** Upstream `generate_audio` default — ralphy overrides seedance to false. */
  upstreamGenerateAudioDefault: boolean;
  supportedDurations: number[];
  supportedAspectRatios: string[];
  supportedResolutions: string[];
};

export const FAL_VIDEO_MODELS: Record<string, FalVideoModel> = {
  "bytedance/seedance-2.0/reference-to-video": {
    endpoint: "bytedance/seedance-2.0/reference-to-video",
    acceptsVideoRefs: true,
    acceptsImageRefs: true,
    acceptsElements: false,
    upstreamGenerateAudioDefault: true,
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedAspectRatios: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    supportedResolutions: ["480p", "720p", "1080p"],
  },
  "fal-ai/kling-video/o3/pro/reference-to-video": {
    endpoint: "fal-ai/kling-video/o3/pro/reference-to-video",
    acceptsVideoRefs: false,
    acceptsImageRefs: true,
    acceptsElements: true,
    upstreamGenerateAudioDefault: false,
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedResolutions: ["720p", "1080p"],
  },
};

/** True iff `model` is a model this connector serves. */
export function isFalVideoModel(model: string | undefined): boolean {
  return Boolean(model && model in FAL_VIDEO_MODELS);
}

// ─── cost computation (#402 pricing) ─────────────────────────────────────────

/**
 * Per-second USD cost for a fal video gen, given resolution / audio / whether
 * video reference inputs are present. Pure + exported so the unit test can
 * assert each pricing branch without a network call.
 *
 * - seedance r2v: $0.3034/s @720p, ×0.6 when video inputs present (=$0.1814/s),
 *   $0.682/s @1080p. The ×0.6 discount applies to the 720p rate; the 1080p rate
 *   is flat. (480p bills at the 720p rate — fal does not publish a cheaper 480p
 *   tier for this endpoint.)
 * - kling o3: $0.112/s audio-off, $0.14/s audio-on (resolution-independent).
 */
export function falVideoPricePerSec(opts: {
  model: string;
  resolution: string;
  generateAudio: boolean;
  hasVideoRefs: boolean;
}): number {
  if (opts.model === "bytedance/seedance-2.0/reference-to-video") {
    if (opts.resolution === "1080p") return 0.682;
    // 720p (and 480p) base rate; video inputs apply a ~×0.6 discount. fal
    // publishes the discounted rate as $0.1814/s (not the bare 0.3034×0.6
    // = 0.18204) — use the published figure verbatim.
    return opts.hasVideoRefs ? 0.1814 : 0.3034;
  }
  if (opts.model === "fal-ai/kling-video/o3/pro/reference-to-video") {
    return opts.generateAudio ? 0.14 : 0.112;
  }
  // Unknown fal model — conservative fallback so the cost row is never 0.
  return 0.14;
}

// ─── CDN upload (initiate → PUT → file_url) ──────────────────────────────────

function mimeForExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  switch (e) {
    case "mp4": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    default: return "application/octet-stream";
  }
}

/**
 * Upload one local file to the fal CDN and return its public `file_url`.
 * Two-step REST flow (#402 spec): POST /storage/upload/initiate with the
 * content-type → receive `{ upload_url, file_url }` → PUT the bytes to
 * `upload_url` → the file is now reachable at `file_url`.
 *
 * http/https refs are passed through verbatim (already a URL); only local paths
 * are uploaded.
 */
export async function uploadLocalRef(filePath: string): Promise<string> {
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  const contentType = mimeForExt(ext);

  const initResp = await fetch(STORAGE_INITIATE_URL, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      content_type: contentType,
      file_name: path.basename(filePath),
    }),
  });
  if (!initResp.ok) {
    const text = await initResp.text().catch(() => "");
    const message = `fal storage initiate ${initResp.status}: ${text.slice(0, 300)}`;
    throw providerHttpError(message, initResp.status);
  }
  const init = (await initResp.json()) as { upload_url?: string; file_url?: string };
  if (!init.upload_url || !init.file_url) {
    throw new TransientPayloadError(
      `fal storage initiate returned no upload_url/file_url. Raw: ${JSON.stringify(init).slice(0, 300)}`,
    );
  }

  const putResp = await fetch(init.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buf,
  });
  if (!putResp.ok) {
    const text = await putResp.text().catch(() => "");
    const message = `fal storage PUT ${putResp.status}: ${text.slice(0, 300)}`;
    throw providerHttpError(message, putResp.status);
  }
  return init.file_url;
}

// ─── video (queue submit → poll → result → download) ─────────────────────────

type FalSubmit = {
  request_id?: string;
  response_url?: string;
  status_url?: string;
  cancel_url?: string;
};

type FalStatus = {
  status?: string; // IN_QUEUE | IN_PROGRESS | COMPLETED
  response_url?: string;
  error?: string | { message?: string };
};

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateResult> {
  requireKey();
  const t0 = Date.now();
  const model = input.model ?? "bytedance/seedance-2.0/reference-to-video";
  const spec = FAL_VIDEO_MODELS[model];
  if (!spec) {
    throw new TerminalProviderError(
      `fal connector cannot serve model '${model}'. Known: ${Object.keys(FAL_VIDEO_MODELS).join(", ")}.`,
    );
  }
  const aspectRatio = input.aspectRatio ?? "9:16";
  const resolution = input.resolution ?? "720p";
  const durationSec = Math.round(input.durationSec);
  // generate_audio: seedance defaults TRUE upstream, but ralphy default is
  // FALSE (post-mix discipline — music/VO is a separate pass; AGENTS memory
  // feedback_kling_no_music_eleven_music_postmix). Only honor an explicit opt-in.
  const generateAudio = input.generateAudio ?? false;
  const pollIntervalMs = input.pollIntervalMs ?? 15_000;
  const pollMaxAttempts = input.pollMaxAttempts ?? 80;

  // ── Reference plumbing. Image refs upload to the CDN; video refs go through
  // the constraint planner (#402) which downscales over-resolution sources into
  // artifacts/refs/ before upload. Video refs are only valid on seedance r2v.
  const refVideoPaths = input.refVideos ?? [];
  if (refVideoPaths.length > 0 && !spec.acceptsVideoRefs) {
    throw new TerminalProviderError(
      `model '${model}' does not accept reference videos (--ref-video). Use ` +
        `bytedance/seedance-2.0/reference-to-video for video-anchored r2v.`,
    );
  }

  const videoUrls: string[] = [];
  const preprocess: Record<string, unknown> = {};
  if (refVideoPaths.length > 0) {
    // Remote refs (http/https) pass through verbatim — we can't probe / downscale
    // a URL cheaply, and the caller already chose a hosted asset. Only LOCAL
    // paths run through the constraint planner (probe → downscale into
    // artifacts/refs/ → upload).
    const remoteRefs = refVideoPaths.filter((p) => /^https?:\/\//.test(p));
    const localRefs = refVideoPaths.filter((p) => !/^https?:\/\//.test(p));
    for (const r of remoteRefs) videoUrls.push(r);

    if (localRefs.length > 0) {
      if (!input.projectId) {
        throw new TerminalProviderError(
          "local reference-video preprocessing requires a project destination; use hosted reference URLs for workspace generation",
        );
      }
      const probes = await Promise.all(localRefs.map((p) => probeRefVideo(p)));
      let plan;
      try {
        plan = planRefVideos(probes);
      } catch (err) {
        // Constraint violation that can't be auto-fixed — terminal.
        throw new TerminalProviderError(`reference-video constraint: ${(err as Error).message}`);
      }
      const materializedPaths: string[] = [];
      for (const item of plan.items) {
        const local = await materializeRefVideo(input.projectId, item);
        materializedPaths.push(local);
        videoUrls.push(await uploadLocalRef(local));
      }
      preprocess.video_refs = plan.items.map((it, i) => ({
        src_dimensions: { width: it.probe.width, height: it.probe.height },
        downscaled: it.needsDownscale,
        out_dimensions: it.target,
        materialized: materializedPaths[i],
      }));
    }
  }

  const imageUrls: string[] = [];
  if (input.refs && input.refs.length > 0) {
    for (const ref of input.refs) {
      imageUrls.push(await uploadLocalRef(ref));
    }
  }
  // First-frame anchor (when supplied) maps to seedance/kling start_image_url.
  const firstFrameRef = input.firstFrame ?? input.image;
  let startImageUrl: string | undefined;
  if (firstFrameRef) startImageUrl = await uploadLocalRef(firstFrameRef);
  let endImageUrl: string | undefined;
  if (input.lastFrame) endImageUrl = await uploadLocalRef(input.lastFrame);

  // ── Build the per-model request body. seedance: video_urls + image_urls;
  // kling o3: image_urls + elements (we map refs → image_urls; elements stay
  // unset until a dedicated --element flag lands).
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: String(durationSec),
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
  };
  if (spec.supportedResolutions.includes(resolution)) body.resolution = resolution;
  if (videoUrls.length > 0) body.video_urls = videoUrls;
  if (imageUrls.length > 0) body.image_urls = imageUrls;
  if (startImageUrl) body.start_image_url = startImageUrl;
  if (endImageUrl) body.end_image_url = endImageUrl;

  const submitUrl = `${QUEUE_BASE}/${spec.endpoint}`;

  // ── Submit (retry transient) ──────────────────────────────────────────────
  const submitResult = await retryTransient<{ submit: FalSubmit; attempt: number }>(
    async (attempt) => {
      const resp = await fetch(submitUrl, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: input.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const message = `fal queue submit ${resp.status}: ${text.slice(0, 400)}`;
        throw providerHttpError(message, resp.status);
      }
      const submitted = (await resp.json()) as FalSubmit;
      if (!submitted.request_id) {
        throw new TransientPayloadError(
          `fal queue submit returned no request_id (model=${model}). Raw: ${JSON.stringify(submitted).slice(0, 400)}`,
        );
      }
      return { submit: submitted, attempt };
    },
    {
      noRetry: input.noRetry,
      onTransientFailure: async (err, attempt) => {
        await logFailure(input, ID, model, "video", body, err, t0, attempt);
      },
    },
  );
  const submit = submitResult.submit;

  const statusUrl =
    submit.status_url ?? `${QUEUE_BASE}/${spec.endpoint}/requests/${submit.request_id}/status`;
  const fallbackResponseUrl =
    submit.response_url ?? `${QUEUE_BASE}/${spec.endpoint}/requests/${submit.request_id}`;

  // ── Poll the status URL until COMPLETED / terminal / budget exhausted ──────
  const terminalErr = new Set(["FAILED", "CANCELLED", "ERROR", "EXPIRED"]);
  let status: FalStatus = { status: submit.request_id ? "IN_QUEUE" : undefined };
  let responseUrl = fallbackResponseUrl;
  for (let attempt = 1; attempt <= pollMaxAttempts; attempt += 1) {
    if ((status.status ?? "").toUpperCase() === "COMPLETED") break;
    if (terminalErr.has((status.status ?? "").toUpperCase())) {
      const detail =
        typeof status.error === "string"
          ? status.error
          : status.error?.message ?? `fal job ${status.status}`;
      const err = new Error(`fal video ${status.status}: ${detail}`);
      await logFailure(input, ID, model, "video", body, err, t0);
      throw err;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollResp = await fetch(statusUrl, { headers: authHeader(), signal: input.signal });
    if (!pollResp.ok) {
      const text = await pollResp.text().catch(() => "");
      const err = providerHttpError(
        `fal video poll ${pollResp.status}: ${text.slice(0, 300)}`,
        pollResp.status,
      );
      await logFailure(input, ID, model, "video", body, err, t0);
      throw err;
    }
    status = (await pollResp.json()) as FalStatus;
    if (status.response_url) responseUrl = status.response_url;
  }

  if ((status.status ?? "").toUpperCase() !== "COMPLETED") {
    const err = new Error(
      `fal video did not complete after ${pollMaxAttempts} polls (${pollIntervalMs}ms each); last status: ${status.status}`,
    );
    await logFailure(input, ID, model, "video", body, err, t0);
    throw err;
  }

  // ── Fetch the response payload → resolve the mp4 URL ───────────────────────
  const resultResp = await fetch(responseUrl, { headers: authHeader(), signal: input.signal });
  if (!resultResp.ok) {
    const text = await resultResp.text().catch(() => "");
    const err = providerHttpError(
      `fal video result ${resultResp.status}: ${text.slice(0, 300)}`,
      resultResp.status,
    );
    await logFailure(input, ID, model, "video", body, err, t0);
    throw err;
  }
  const resultJson = (await resultResp.json()) as {
    video?: { url?: string } | string;
    error?: string | { message?: string };
  };
  const videoUrl =
    typeof resultJson.video === "string" ? resultJson.video : resultJson.video?.url;
  if (!videoUrl) {
    const err = new Error(
      `fal video result had no video URL. Raw: ${JSON.stringify(resultJson).slice(0, 400)}`,
    );
    await logFailure(input, ID, model, "video", body, err, t0);
    throw err;
  }

  // ── Download the mp4 to the slot path (auto-versioned) ─────────────────────
  const dest = providerOutputPath(input);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const dl = await fetch(videoUrl, { signal: input.signal });
  if (!dl.ok) {
    const text = await dl.text().catch(() => "");
    const err = providerHttpError(
      `fal video download ${dl.status}: ${text.slice(0, 200)}`,
      dl.status,
    );
    await logFailure(input, ID, model, "video", body, err, t0);
    throw err;
  }
  const out = Buffer.from(await dl.arrayBuffer());
  await fs.writeFile(dest, out);

  const pricePerSec = falVideoPricePerSec({
    model,
    resolution,
    generateAudio,
    hasVideoRefs: videoUrls.length > 0,
  });
  const result: GenerateResult = {
    url: videoUrl,
    localPath: dest,
    costUsd: Number((pricePerSec * durationSec).toFixed(4)),
    latencyMs: Date.now() - t0,
    model,
  };
  return result;
}

// ─── connector object ────────────────────────────────────────────────────────

export const falConnector: RalphyConnector = {
  id: ID,
  label: LABEL,
  envVar: ENV_VAR,
  credential: FAL_CREDENTIAL,
  signupUrl: SIGNUP_URL,
  capabilities: ["video"],
  available: () => credentialConfigured(ID),
  generateVideo,
};
