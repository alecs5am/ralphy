// YouTube analytics connector (#507) — the `analytics-pull` backend for
// youtube-target publish records: per-video statistics for the performance
// feedback loop (docs/architecture/farm-node-graph.md, phase 3).
//
// THIS IS THE ONLY SOURCE FILE PERMITTED TO READ `YOUTUBE_API_KEY` OR HIT
// `googleapis.com` HOSTS (AGENTS.md invariant #1, extended for #507 the same
// way firecrawl.ts was for #500). The agents-md invariants test allowlists
// exactly this file; a YOUTUBE_API_KEY read or googleapis.com host anywhere
// else is a defect.
//
// SCOPE — API key vs OAuth (the two YouTube API tiers):
//   • Implemented here: YouTube Data API v3 `videos.list?part=statistics` —
//     views / likes / comments per video, plain API key auth (YOUTUBE_API_KEY,
//     from console.cloud.google.com → "YouTube Data API v3" → credentials).
//   • NAMED FOLLOW-UP (not built): the YouTube Analytics API
//     (youtubeanalytics.googleapis.com — retention curves, avgViewDuration,
//     impressions CTR) requires a per-channel OAuth2 flow; an API key cannot
//     reach it. When that lands, `retentionCurve` / `avgViewDurationSec` /
//     `ctr` on the snapshot schema (cli/lib/schemas/analytics.ts) get
//     populated — the fields exist and stay empty until then.
//
// Deliberately NOT registered in the provider registry (registry.ts BUNDLED):
// analytics is not a generation Capability. This module follows the
// firecrawl.ts connector shape (own env var, narrow tolerant types, throws —
// never process.exit()s) so the command / executor surface structured errors.
//
// HTTP is injectable (`fetchImpl`) so tests run with zero network.

import { TerminalProviderError } from "./shared.js";

const LABEL = "YouTube";
const ENV_VAR = "YOUTUBE_API_KEY";
const SIGNUP_URL = "https://console.cloud.google.com";
const API_BASE = "https://www.googleapis.com/youtube/v3";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** True iff the connector's key is present. */
export function youtubeAnalyticsAvailable(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

function requireKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new TerminalProviderError(
      `${LABEL}: ${ENV_VAR} is not set. Create an API key at ${SIGNUP_URL} (enable "YouTube Data API v3") and export it.`,
    );
  }
  return key;
}

/** What the API-key tier can report. Retention/CTR need OAuth (see header). */
export type YouTubeVideoStatistics = {
  views?: number;
  likes?: number;
  comments?: number;
};

/** Tolerant `videos.list` response shape (statistics values are strings). */
type VideosListResponse = {
  items?: Array<{
    id?: string;
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
      [k: string]: unknown;
    };
  }>;
};

function toCount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `GET /videos?part=statistics&id=<videoId>` → views / likes / comments, or
 * `null` when the API returns no item for the id (deleted / private video, or
 * a postId that is not a YouTube video id — e.g. a Postiz-internal post id;
 * the pull layer falls back to the Postiz passthrough on null).
 */
export async function youtubeVideoStatistics(
  videoId: string,
  fetchImpl: FetchLike = fetch,
): Promise<YouTubeVideoStatistics | null> {
  const key = requireKey();
  const url = `${API_BASE}/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
  const resp = await fetchImpl(url, { method: "GET" });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const message = `youtube GET videos?part=statistics ${resp.status}: ${text.slice(0, 300)}`;
    if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
    throw new Error(message);
  }
  const body = (await resp.json()) as VideosListResponse;
  const stats = body.items?.[0]?.statistics;
  if (!stats) return null;
  const out: YouTubeVideoStatistics = {};
  const views = toCount(stats.viewCount);
  const likes = toCount(stats.likeCount);
  const comments = toCount(stats.commentCount);
  if (views !== undefined) out.views = views;
  if (likes !== undefined) out.likes = likes;
  if (comments !== undefined) out.comments = comments;
  return out;
}
