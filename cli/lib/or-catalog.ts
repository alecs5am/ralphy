// Local cache of OpenRouter's video-model catalog.
//
// Source of truth: `GET https://openrouter.ai/api/v1/videos/models`. Each
// entry exposes `supported_durations`, `supported_resolutions`,
// `supported_aspect_ratios`, `supported_frame_images` — the per-model
// constraints we have to honor or OR rejects the submit.
//
// Cached at `workspace/.ralph/or-catalog.json` for `TTL_MS`. On a stale
// cache we refetch; on a network failure we fall back to the stale copy
// rather than block the user.

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { root } from "./paths.js";

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
  return path.join(root(), "workspace", ".ralph", "or-catalog.json");
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

// Per-second cost ballpark (mirrors VIDEO_PRICE_PER_SEC in media.ts).
// OR's catalog does not expose a clean per-second figure for video models,
// so this is a hand-maintained table kept in sync with MODELS.md.
export const VIDEO_PRICE_PER_SEC: Record<string, number> = {
  "kwaivgi/kling-v3.0-pro": 0.14,
  "kwaivgi/kling-v3.0-std": 0.07,
  "kwaivgi/kling-video-o1": 0.14,
  "google/veo-3.1": 0.5,
  "google/veo-3.1-fast": 0.25,
  "google/veo-3.1-lite": 0.15,
  "openai/sora-2-pro": 0.5,
  "minimax/hailuo-2.3": 0.1,
  "alibaba/wan-2.7": 0.1,
  "alibaba/wan-2.6": 0.1,
  "bytedance/seedance-2.0": 0.1,
  "bytedance/seedance-2.0-fast": 0.05,
  "bytedance/seedance-1-5-pro": 0.1,
};

export function estimateVideoCostUsd(modelId: string, durationSec: number): number {
  const perSec = VIDEO_PRICE_PER_SEC[modelId] ?? 0.14;
  return Number((perSec * durationSec).toFixed(4));
}
