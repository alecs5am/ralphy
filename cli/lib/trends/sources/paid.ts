// Paid trend sources through the registered Apify connector (#556).
//
// DEFAULT OFF. A paid call runs only when the caller passes `--paid` AND a
// per-actor daily cap (`--apify-daily-cap-usd`). Spend is the Run Attempt
// `cost_usd` on trend runs; before each call the remaining daily budget is
// checked, the request is shrunk to fit, and Apify's own run caps
// (`maxItems`, `maxTotalChargeUsd`) are set to the same numbers.
//
// Prices are Apify Starter (Bronze) tier per-result prices read from the
// public actor metadata on 2026-10-28 (docs/research/trend-corpus.md, Method
// matrix). They are pre-flight estimates; the recorded cost is the run's
// reported usage when Apify returns it.

import { hashtagsFromText, num, str } from "./ytdlp.js";
import { truncateCodePoints } from "../math.js";
import { parseApifyTiktokItem } from "./tiktok.js";
import type { SourceCreator, SourceVideo } from "./types.js";

export const PAID_ACTORS = {
  "apify-tiktok": { actorId: "clockworks/tiktok-scraper", usdPerResult: 0.003, usdPerRun: 0 },
  "apify-instagram": { actorId: "apify/instagram-reel-scraper", usdPerResult: 0.0023, usdPerRun: 0.001 },
} as const;
export type PaidSource = keyof typeof PAID_ACTORS;

export function isPaidSource(value: string): value is PaidSource {
  return Object.hasOwn(PAID_ACTORS, value);
}

export interface PaidBudget {
  /** Hard cap per actor per UTC day, USD. */
  dailyCapUsd: number;
  /** Already spent today on this actor, USD. */
  spentTodayUsd: number;
}

/** How many results fit the remaining budget (0 = refuse). */
export function affordableResults(source: PaidSource, requested: number, budget: PaidBudget): { results: number; maxChargeUsd: number } {
  const actor = PAID_ACTORS[source];
  const remaining = Math.max(0, budget.dailyCapUsd - budget.spentTodayUsd - actor.usdPerRun);
  const results = Math.max(0, Math.min(Math.floor(requested), Math.floor(remaining / actor.usdPerResult)));
  return { results, maxChargeUsd: Math.round(Math.max(0, budget.dailyCapUsd - budget.spentTodayUsd) * 10_000) / 10_000 };
}

export function estimatedCostUsd(source: PaidSource, results: number): number {
  const actor = PAID_ACTORS[source];
  return Math.round((results * actor.usdPerResult + actor.usdPerRun) * 10_000) / 10_000;
}

/** Actor input for TikTok keyword / hashtag seeds. */
export function tiktokSeedInput(seeds: { hashtags: string[]; keywords: string[] }, resultsPerPage: number): Record<string, unknown> {
  return {
    ...(seeds.hashtags.length > 0 ? { hashtags: seeds.hashtags.map((tag) => tag.replace(/^#/, "")) } : {}),
    ...(seeds.keywords.length > 0 ? { searchQueries: seeds.keywords } : {}),
    resultsPerPage: Math.max(1, Math.floor(resultsPerPage)),
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  };
}

export function parseApifyTiktokItems(items: readonly unknown[]): Array<{ creator: SourceCreator; video: SourceVideo }> {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const parsed = parseApifyTiktokItem(item as Record<string, unknown>);
    return parsed ? [parsed] : [];
  });
}

/** Actor input for Instagram reels by profile (backfill) or by reel URL (checkpoints). */
export function instagramReelInput(input: { usernames?: string[]; reelUrls?: string[]; resultsLimit: number }): Record<string, unknown> {
  return {
    ...(input.usernames && input.usernames.length > 0 ? { username: input.usernames.map((name) => name.replace(/^@/, "")) } : {}),
    ...(input.reelUrls && input.reelUrls.length > 0 ? { directUrls: input.reelUrls } : {}),
    resultsLimit: Math.max(1, Math.floor(input.resultsLimit)),
  };
}

/** Parse one `apify/instagram-reel-scraper` dataset item. */
export function parseInstagramReelItem(item: Record<string, unknown>): { creator: SourceCreator; video: SourceVideo } | null {
  const shortCode = str(item.shortCode);
  const ownerId = str(item.ownerId) ?? str(item.ownerUsername);
  if (!shortCode || !ownerId) return null;
  const caption = str(item.caption);
  const timestamp = str(item.timestamp);
  const posted = timestamp ? Date.parse(timestamp) : Number.NaN;
  const music = (item.musicInfo ?? {}) as Record<string, unknown>;
  const duration = num(item.videoDuration);
  const tags = Array.isArray(item.hashtags) ? (item.hashtags as unknown[]).filter((tag): tag is string => typeof tag === "string") : [];
  return {
    creator: {
      platform: "instagram",
      platformCreatorId: ownerId,
      handle: str(item.ownerUsername),
      displayName: str(item.ownerFullName),
      followers: null,
      videoCount: null,
      totalLikes: null,
      region: null,
    },
    video: {
      platform: "instagram",
      platformVideoId: shortCode,
      creatorPlatformId: ownerId,
      url: str(item.url) ?? `https://www.instagram.com/reel/${shortCode}/`,
      postedAt: Number.isFinite(posted) ? posted : null,
      durationMs: duration === null ? null : Math.round(duration * 1000),
      width: num(item.dimensionsWidth),
      height: num(item.dimensionsHeight),
      title: caption ? truncateCodePoints(caption, 200) : null,
      description: caption,
      hashtags: [...new Set([...tags.map((tag) => tag.toLowerCase()), ...hashtagsFromText(caption)])],
      soundId: str(music.audio_id),
      soundTitle: str(music.song_name),
      soundOriginal: typeof music.uses_original_audio === "boolean" ? music.uses_original_audio : null,
      language: null,
      region: null,
      isAd: typeof item.isSponsored === "boolean" ? item.isSponsored : null,
      aigcLabel: null,
      metrics: {
        // Reels "plays" is the public view count; videoViewCount is the legacy field.
        views: num(item.videoPlayCount) ?? num(item.videoViewCount),
        likes: num(item.likesCount),
        comments: num(item.commentsCount),
        shares: null,
        saves: null,
      },
      viewsPrecision: "exact",
    },
  };
}

export function parseInstagramReelItems(items: readonly unknown[]): Array<{ creator: SourceCreator; video: SourceVideo }> {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const parsed = parseInstagramReelItem(item as Record<string, unknown>);
    return parsed ? [parsed] : [];
  });
}
