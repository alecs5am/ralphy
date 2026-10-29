// Freshness window for trend references (#590).
//
// Owner rule: a reference must be posted within the last 90 days; older hits
// come from a different algorithm era. The window applies twice:
//
//   1. Collection: ingest, niche init backfill, and refresh skip listed
//      videos posted before the window (TikTok listings carry a post time).
//      YouTube channel Shorts tabs are flat and undated, so a channel lists
//      only its newest entries (`YOUTUBE_NEWEST_PER_CHANNEL`); those are dated
//      later through the existing paths (YouTube Data API when configured,
//      the small watch-page budget for Tier-1 candidates otherwise). An
//      undated video is stored with `posted_at_source = 'freshness-unknown'`
//      and never enters references, signals, or series references.
//   2. Analysis: existing rows older than the window stay stored
//      (append-only corpus) but analysis queries and reports leave them out
//      and say how many they left out.
//
// Pure: no store access.

import { DAY_MS, type TrendPlatform } from "./math.js";

export const DEFAULT_MAX_AGE_DAYS = 90;
/** Posted this recently: `hot`. */
export const HOT_AGE_DAYS = 30;
/** Newest flat entries listed per YouTube channel (the tab is newest first). */
export const YOUTUBE_NEWEST_PER_CHANNEL = 30;
/** `posted_at_source` of a stored video that carries no post time. */
export const FRESHNESS_UNKNOWN = "freshness-unknown";

export type Freshness = "hot" | "fresh" | "stale" | "unknown";

export const isFreshness = (value: Freshness): value is "hot" | "fresh" => value === "hot" || value === "fresh";

export function ageDaysOf(postedAt: number | null, now: number): number | null {
  if (postedAt === null || !Number.isFinite(postedAt)) return null;
  return Math.round(((now - postedAt) / DAY_MS) * 10) / 10;
}

/** hot (<= 30 d), fresh (<= max age), stale (older), unknown (no post time). */
export function freshnessOf(postedAt: number | null, now: number, maxAgeDays = DEFAULT_MAX_AGE_DAYS, hotDays = HOT_AGE_DAYS): Freshness {
  if (postedAt === null || !Number.isFinite(postedAt)) return "unknown";
  const age = now - postedAt;
  if (age <= Math.min(hotDays, maxAgeDays) * DAY_MS) return "hot";
  if (age <= maxAgeDays * DAY_MS) return "fresh";
  return "stale";
}

/** Dated and inside the window. */
export const inFreshWindow = (postedAt: number | null, now: number, maxAgeDays = DEFAULT_MAX_AGE_DAYS) =>
  postedAt !== null && Number.isFinite(postedAt) && now - postedAt <= maxAgeDays * DAY_MS;

export function cutoffOf(now: number, maxAgeDays = DEFAULT_MAX_AGE_DAYS): number {
  return now - maxAgeDays * DAY_MS;
}

/** A `--max-age-days` value: a positive whole number of days. */
export function validMaxAgeDays(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Entries a creator listing asks for: YouTube lists only its newest entries. */
export function listingLimitFor(platform: TrendPlatform, perCreator: number): number {
  return platform === "youtube" ? Math.max(1, Math.min(perCreator, YOUTUBE_NEWEST_PER_CHANNEL)) : perCreator;
}

/**
 * Collection cutoff: drop dated videos posted before the window, keep undated
 * ones (they are stored freshness-unknown). Pinned old videos at the top of a
 * TikTok listing are dropped too, so the filter runs after parsing instead of
 * stopping the listing at the first old entry.
 */
export function applyCollectionCutoff<T extends { postedAt: number | null }>(videos: readonly T[], input: { now: number; maxAgeDays: number }): { kept: T[]; skippedOld: number; undated: number } {
  const cutoff = cutoffOf(input.now, input.maxAgeDays);
  const kept: T[] = [];
  let skippedOld = 0;
  let undated = 0;
  for (const video of videos) {
    if (video.postedAt === null || !Number.isFinite(video.postedAt)) {
      undated += 1;
      kept.push(video);
    } else if (video.postedAt < cutoff) skippedOld += 1;
    else kept.push(video);
  }
  return { kept, skippedOld, undated };
}

export interface WindowExclusion {
  maxAgeDays: number;
  /** Dated and inside the window: the analysis set. */
  inWindow: number;
  /** Dated before the window: stored, left out of the analysis. */
  olderThanWindow: number;
  /** No post time (freshness-unknown): stored, never a reference. */
  undated: number;
}

/** How many stored videos the window keeps and leaves out (nothing is deleted). */
export function windowExclusion<T>(videos: readonly T[], postedAtOf: (video: T) => number | null, now: number, maxAgeDays = DEFAULT_MAX_AGE_DAYS): WindowExclusion {
  const cutoff = cutoffOf(now, maxAgeDays);
  const out: WindowExclusion = { maxAgeDays, inWindow: 0, olderThanWindow: 0, undated: 0 };
  for (const video of videos) {
    const postedAt = postedAtOf(video);
    if (postedAt === null || !Number.isFinite(postedAt)) out.undated += 1;
    else if (postedAt < cutoff) out.olderThanWindow += 1;
    else out.inWindow += 1;
  }
  return out;
}

/** An analysis window never reaches past the freshness window. */
export function clampWindowDays(days: number, maxAgeDays = DEFAULT_MAX_AGE_DAYS): { days: number; clamped: boolean } {
  return days > maxAgeDays ? { days: maxAgeDays, clamped: true } : { days, clamped: false };
}
