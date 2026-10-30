// Local cache of OpenRouter's video-model catalog.
//
// Source of truth: `GET https://openrouter.ai/api/v1/videos/models`. Each
// entry exposes `supported_durations`, `supported_resolutions`,
// `supported_aspect_ratios`, `supported_frame_images` — the per-model
// constraints we have to honor or OR rejects the submit.
//
// Cached at `.ralphy/or-catalog.json` for `TTL_MS`. On a stale
// cache we refetch; on a network failure we fall back to the stale copy
// rather than block the user.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { ralphDir } from "./paths.js";

export type VideoModel = {
  id: string;
  name?: string;
  description?: string;
  pricing?: Record<string, unknown>;
  supported_durations?: number[];
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
  supported_frame_images?: string[];
  supported_input_references?: string[];
};

export type Catalog = {
  fetchedAt: string;
  videoModels: VideoModel[];
};

const TTL_MS = 24 * 60 * 60 * 1000;

function catalogPath(): string {
  return path.join(ralphDir(), "or-catalog.json");
}

export async function getOrCatalog(
  opts: { force?: boolean } = {}
): Promise<Catalog> {
  const cachePath = catalogPath();
  if (!opts.force && existsSync(cachePath)) {
    try {
      const raw = await fs.readFile(cachePath, "utf8");
      const j = JSON.parse(raw) as Catalog;
      const age = Date.now() - new Date(j.fetchedAt).getTime();
      if (age < TTL_MS) return j;
    } catch {
      /* fall through to refetch */
    }
  }
  return refetchAndCache();
}

async function refetchAndCache(): Promise<Catalog> {
  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/videos/models");
  } catch (err) {
    return staleFallback(`fetch error: ${(err as Error).message}`);
  }
  if (!resp.ok) {
    return staleFallback(`HTTP ${resp.status}`);
  }
  const j = (await resp.json()) as { data?: VideoModel[] };
  const catalog: Catalog = {
    fetchedAt: new Date().toISOString(),
    videoModels: j.data ?? [],
  };
  await fs.mkdir(path.dirname(catalogPath()), { recursive: true });
  await fs.writeFile(catalogPath(), JSON.stringify(catalog, null, 2));
  return catalog;
}

async function staleFallback(reason: string): Promise<Catalog> {
  if (existsSync(catalogPath())) {
    try {
      const raw = await fs.readFile(catalogPath(), "utf8");
      return JSON.parse(raw) as Catalog;
    } catch {
      /* fall through */
    }
  }
  throw new Error(`OR catalog unavailable (${reason}) and no cached copy`);
}

export async function findVideoModel(
  id: string
): Promise<VideoModel | undefined> {
  const c = await getOrCatalog();
  return c.videoModels.find((m) => m.id === id);
}

/**
 * Read the cached catalog synchronously from disk (no network, no async).
 * Returns null if the cache file is missing or unparseable. Used by
 * commander's `addHelpText("after", ...)` callback (which is sync) so
 * `ralphy generate video --help` can include the per-model whitelist
 * without a refresh round-trip (01.03.03).
 */
export function getOrCatalogSync(): Catalog | null {
  const p = catalogPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Catalog;
  } catch {
    return null;
  }
}

export type ValidationFinding = {
  level: "error" | "warn";
  field: "duration" | "aspect_ratio" | "resolution" | "frame_images";
  reason: string;
  suggestion?: string;
};

export function validateVideoParams(
  m: VideoModel,
  args: {
    duration: number;
    aspectRatio: string;
    resolution: string;
    hasLastFrame: boolean;
    hasFirstFrame: boolean;
  }
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (m.supported_durations && m.supported_durations.length > 0) {
    if (!m.supported_durations.includes(Math.round(args.duration))) {
      findings.push({
        level: "error",
        field: "duration",
        reason: `${m.id} does not accept duration=${args.duration}s`,
        suggestion: `supported: ${m.supported_durations.join(", ")}s`,
      });
    }
  }

  if (m.supported_aspect_ratios && m.supported_aspect_ratios.length > 0) {
    if (!m.supported_aspect_ratios.includes(args.aspectRatio)) {
      findings.push({
        level: "error",
        field: "aspect_ratio",
        reason: `${m.id} does not accept aspect_ratio=${args.aspectRatio}`,
        suggestion: `supported: ${m.supported_aspect_ratios.join(", ")}`,
      });
    }
  }

  if (m.supported_resolutions && m.supported_resolutions.length > 0) {
    if (!m.supported_resolutions.includes(args.resolution)) {
      findings.push({
        level: "error",
        field: "resolution",
        reason: `${m.id} does not accept resolution=${args.resolution}`,
        suggestion: `supported: ${m.supported_resolutions.join(", ")}`,
      });
    }
  }

  if (args.hasLastFrame) {
    const supports = m.supported_frame_images?.includes("last_frame");
    if (!supports) {
      findings.push({
        level: "error",
        field: "frame_images",
        reason: `${m.id} does not support last_frame anchor`,
        suggestion: m.supported_frame_images?.length
          ? `supported anchors: ${m.supported_frame_images.join(", ")}`
          : "no frame anchors supported on this model",
      });
    }
  }
  if (args.hasFirstFrame) {
    const supports = m.supported_frame_images?.includes("first_frame");
    if (!supports) {
      findings.push({
        level: "error",
        field: "frame_images",
        reason: `${m.id} does not support first_frame anchor`,
        suggestion: m.supported_frame_images?.length
          ? `supported anchors: ${m.supported_frame_images.join(", ")}`
          : "no frame anchors supported on this model",
      });
    }
  }

  return findings;
}

// Per-second cost ballpark: the single table behind dry-run estimates, plan
// and storyboard costs, and the OpenRouter video billing fallback. OR's
// catalog does not expose a clean per-second figure for video models, so it
// is hand-maintained; rechecked against the live catalog and our billing on
// 2026-10-30 (#568). `audio` is the rate when native audio is generated.
export const VIDEO_PRICE_PER_SEC: Record<string, { silent: number; audio?: number }> = {
  "kwaivgi/kling-v3.0-pro": { silent: 0.112, audio: 0.168 },
  "kwaivgi/kling-v3.0-std": { silent: 0.084, audio: 0.126 },
  "kwaivgi/kling-video-o1": { silent: 0.112 },
  "google/veo-3.1": { silent: 0.2, audio: 0.4 },
  "google/veo-3.1-fast": { silent: 0.1, audio: 0.12 },
  "google/veo-3.1-lite": { silent: 0.05, audio: 0.08 },
  "minimax/hailuo-2.3": { silent: 0.0817 },
  "alibaba/wan-2.7": { silent: 0.1 },
  "alibaba/wan-2.6": { silent: 0.1 },
  // Seedance bills per video token; 0.14/s matched our billing on 2026-05-11.
  "bytedance/seedance-2.0": { silent: 0.14 },
  "bytedance/seedance-2.0-fast": { silent: 0.14 },
  "bytedance/seedance-1-5-pro": { silent: 0.1 },
  // #592 (catalog 2026-10-30 + observed billing). Seedance 2.5 bills video
  // tokens ($0.0000107 each, audio included): 720p ≈ $0.23/s (logged
  // $1.17 per 5 s at 4:3), 480p ≈ $0.10/s. The 720p rate is the estimate.
  "bytedance/seedance-2.5": { silent: 0.23, audio: 0.23 },
  // Wan 3.0: $0.05 / $0.10 / $0.20 per s at 480p / 720p / 1080p, audio included.
  "alibaba/wan-3.0": { silent: 0.1, audio: 0.1 },
  // MiniMax H3 Max: $0.08/s at 768p, $0.05/s at 480p; no native audio.
  "minimax/hailuo-3-max": { silent: 0.08 },
  // MiniMax H3: $0.13/s (2K only, audio included) + $0.04 per reference image.
  "minimax/hailuo-3": { silent: 0.13, audio: 0.13 },
  // HeyGen Avatar IV: $0.05/s; the clip length follows the speech, not --duration.
  "heygen/avatar-iv": { silent: 0.05 },
};

const DEFAULT_VIDEO_PRICE_PER_SEC = 0.14;

export function videoPricePerSec(modelId: string, withAudio = false): number {
  const row = VIDEO_PRICE_PER_SEC[modelId];
  if (!row) return DEFAULT_VIDEO_PRICE_PER_SEC;
  return withAudio ? row.audio ?? row.silent : row.silent;
}

export function estimateVideoCostUsd(modelId: string, durationSec: number, withAudio = false): number {
  return Number((videoPricePerSec(modelId, withAudio) * durationSec).toFixed(4));
}
