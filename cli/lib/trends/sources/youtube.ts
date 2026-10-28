// YouTube Shorts sources for the trend corpus (#556), all logged out via
// yt-dlp flat browse (the per-video watch page bot-walls after ~229 calls and
// is reserved for #557 digests):
//
//   listing          channel Shorts tab, newest first: id, title, rounded
//                    views, channel follower count; no post date, no likes
//   hashtag-shorts   `/hashtag/<t>/shorts`: ids + rounded views only (no
//                    channel) — a discovery sample, stored only once the
//                    Data API resolves its channel
//   hashtag-channels `/hashtag/<t>`: channel ids (creator seeds)
//   search-channels  `ytsearchN:<query>`: channel ids (creator seeds)
//   data-api         exact stats + publish time through the registered
//                    YouTube connector (`YOUTUBE_API_KEY`), when configured

import { classifyProbe, type ProbeOutcome } from "../breaker.js";
import { flatListingArgs, hashtagsFromText, num, parseJsonLines, str, type YtdlpRunner } from "./ytdlp.js";
import type { DiscoveryResult, ListingResult, SourceCreator, SourceVideo } from "./types.js";

export const YOUTUBE_LISTING_SOURCE = "ytdlp-yt-channel";
export const YOUTUBE_HASHTAG_SOURCE = "youtube-hashtag";
export const YOUTUBE_SEARCH_SOURCE = "youtube-search";
export const YOUTUBE_API_SOURCE = "youtube-data-api";

export function youtubeShortsTabUrl(channelRef: string): string {
  if (/^UC[\w-]{20,}$/.test(channelRef)) return `https://www.youtube.com/channel/${channelRef}/shorts`;
  const handle = channelRef.startsWith("@") ? channelRef : `@${channelRef}`;
  return `https://www.youtube.com/${handle}/shorts`;
}

export const youtubeShortUrl = (id: string) => `https://www.youtube.com/shorts/${id}`;

/** One flat Shorts-tab entry → normalized (undated, rounded-views) video. */
export function parseYoutubeShortsEntry(entry: Record<string, unknown>, channelId: string): SourceVideo | null {
  const id = str(entry.id);
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const title = str(entry.title);
  const duration = num(entry.duration);
  return {
    platform: "youtube",
    platformVideoId: id,
    creatorPlatformId: channelId,
    url: youtubeShortUrl(id),
    postedAt: null,
    durationMs: duration === null ? null : duration * 1000,
    width: null,
    height: null,
    title,
    description: null,
    hashtags: hashtagsFromText(title),
    soundId: null,
    soundTitle: null,
    soundOriginal: null,
    language: null,
    region: null,
    isAd: null,
    aigcLabel: null,
    metrics: { views: num(entry.view_count), likes: null, comments: null, shares: null, saves: null },
    viewsPrecision: "rounded",
  };
}

export async function listYoutubeChannelShorts(input: {
  channelRef: string;
  limit: number;
  run: YtdlpRunner;
  timeoutMs?: number;
}): Promise<ListingResult> {
  const args = flatListingArgs(youtubeShortsTabUrl(input.channelRef), {
    limit: input.limit,
    entryFields: ["id", "title", "view_count", "duration"],
    playlistFields: ["id", "channel", "channel_id", "uploader_id", "channel_follower_count", "title"],
  });
  const result = await input.run(args, { timeoutMs: input.timeoutMs ?? 120_000 });
  const { entries, playlist } = parseJsonLines(result.stdout);
  const channelId = str(playlist?.channel_id) ?? (/^UC/.test(input.channelRef) ? input.channelRef : null) ?? input.channelRef;
  const videos = entries
    .map((entry) => parseYoutubeShortsEntry(entry, channelId))
    .filter((video): video is SourceVideo => video !== null);
  return {
    outcome: classifyProbe({ code: result.code, stderr: result.stderr, entries: videos.length, timedOut: result.timedOut }),
    creator: playlist
      ? {
          platformCreatorId: channelId,
          handle: str(playlist.uploader_id),
          displayName: str(playlist.channel),
          followers: num(playlist.channel_follower_count),
        }
      : null,
    videos,
    ms: result.ms,
  };
}

/** Channel seeds from flat entries carrying `channel_id` (hashtag page, search). */
export function channelSeedsFromEntries(entries: ReadonlyArray<Record<string, unknown>>): SourceCreator[] {
  const seeds = new Map<string, SourceCreator>();
  for (const entry of entries) {
    const channelId = str(entry.channel_id);
    if (!channelId || !/^UC[\w-]{20,}$/.test(channelId) || seeds.has(channelId)) continue;
    seeds.set(channelId, {
      platform: "youtube",
      platformCreatorId: channelId,
      handle: str(entry.uploader_id),
      displayName: str(entry.channel),
      followers: num(entry.channel_follower_count),
      videoCount: null,
      totalLikes: null,
      region: null,
    });
  }
  return [...seeds.values()];
}

function outcomeFor(result: { code: number; stderr: string; timedOut: boolean }, found: number): ProbeOutcome {
  return classifyProbe({ code: result.code, stderr: result.stderr, entries: found, timedOut: result.timedOut });
}

/**
 * Hashtag discovery: channel seeds from `/hashtag/<t>` plus the Shorts-page
 * ids (unresolved: the flat Shorts page carries no channel).
 */
export async function discoverYoutubeHashtag(input: { tag: string; limit: number; run: YtdlpRunner; timeoutMs?: number }): Promise<DiscoveryResult> {
  const tag = input.tag.replace(/^#/, "").toLowerCase();
  const started = Date.now();
  const channelsResult = await input.run(
    flatListingArgs(`https://www.youtube.com/hashtag/${encodeURIComponent(tag)}`, {
      limit: input.limit,
      entryFields: ["id", "channel_id", "channel", "uploader_id", "duration", "view_count"],
    }),
    { timeoutMs: input.timeoutMs ?? 120_000 },
  );
  const creators = channelSeedsFromEntries(parseJsonLines(channelsResult.stdout).entries);
  const channelsOutcome = outcomeFor(channelsResult, creators.length);
  if (channelsOutcome.kind === "blocked") {
    return { outcome: channelsOutcome, creators, videos: [], unresolvedVideoIds: [], requests: 1, ms: Date.now() - started };
  }
  const shortsResult = await input.run(
    flatListingArgs(`https://www.youtube.com/hashtag/${encodeURIComponent(tag)}/shorts`, {
      limit: input.limit,
      entryFields: ["id", "view_count"],
    }),
    { timeoutMs: input.timeoutMs ?? 120_000 },
  );
  const shortIds = parseJsonLines(shortsResult.stdout).entries
    .map((entry) => str(entry.id))
    .filter((id): id is string => !!id && /^[\w-]{11}$/.test(id));
  const shortsOutcome = outcomeFor(shortsResult, shortIds.length);
  const outcome = shortsOutcome.kind === "blocked" ? shortsOutcome : creators.length > 0 || shortIds.length > 0 ? { kind: "ok" as const } : channelsOutcome;
  return {
    outcome,
    creators,
    videos: [],
    unresolvedVideoIds: [...new Set(shortIds)],
    requests: 2,
    ms: Date.now() - started,
  };
}

export async function discoverYoutubeSearch(input: { query: string; limit: number; run: YtdlpRunner; timeoutMs?: number }): Promise<DiscoveryResult> {
  const started = Date.now();
  const result = await input.run(
    flatListingArgs(`ytsearch${Math.max(1, Math.min(100, input.limit))}:${input.query}`, {
      limit: input.limit,
      entryFields: ["id", "channel_id", "channel", "uploader_id", "duration", "view_count"],
    }),
    { timeoutMs: input.timeoutMs ?? 120_000 },
  );
  const creators = channelSeedsFromEntries(parseJsonLines(result.stdout).entries);
  return { outcome: outcomeFor(result, creators.length), creators, videos: [], unresolvedVideoIds: [], requests: 1, ms: Date.now() - started };
}
