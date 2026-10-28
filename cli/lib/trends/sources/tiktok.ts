// TikTok sources for the trend corpus (#556).
//
//   listing   yt-dlp `tiktokuser:<secUid>` flat listing, logged out (primary)
//   explore   logged-out Explore category feed, XHR capture via Playwright
//   sound     logged-out sound page `/music/<slug>-<id>`, XHR capture
//   apify     keyword / hashtag seeds through `clockworks/tiktok-scraper`
//             (paid, default off, see paid.ts)
//
// Hashtag pages and keyword search are closed logged out (empty body and a
// CAPTCHA, measured in #555), so they are not implemented as free sources.

import { classifyProbe, type ProbeOutcome } from "../breaker.js";
import { truncateCodePoints } from "../math.js";
import { flatListingArgs, hashtagsFromText, num, parseJsonLines, str, type YtdlpRunner } from "./ytdlp.js";
import type { DiscoveryResult, ListingResult, SourceCreator, SourceVideo } from "./types.js";

export const TIKTOK_LISTING_SOURCE = "ytdlp-tiktok-user";
export const TIKTOK_EXPLORE_SOURCE = "tiktok-explore";
export const TIKTOK_SOUND_SOURCE = "tiktok-sound";
export const TIKTOK_APIFY_SOURCE = "apify-tiktok";

const LISTING_FIELDS = [
  "id", "uploader", "uploader_id", "channel", "channel_id", "timestamp", "duration", "view_count", "like_count",
  "comment_count", "repost_count", "save_count", "track", "artists", "description", "width", "height",
] as const;

/** secUid values start with "MS4wLj" (base64 of the TikTok user-id envelope). */
export const isSecUid = (value: string): boolean => /^MS4wLj[A-Za-z0-9_-]{20,}$/.test(value);

export function tiktokListingUrl(platformCreatorId: string, handle?: string | null): string {
  if (isSecUid(platformCreatorId)) return `tiktokuser:${platformCreatorId}`;
  const name = (handle ?? platformCreatorId).replace(/^@/, "");
  return `https://www.tiktok.com/@${name}`;
}

export function tiktokVideoUrl(handle: string | null, id: string, fallbackCreator: string): string {
  return `https://www.tiktok.com/@${handle ?? fallbackCreator}/video/${id}`;
}

function originalFromTrack(track: string | null): boolean | null {
  if (!track) return null;
  return /^original sound\b/i.test(track) ? true : null;
}

/** One yt-dlp TikTok listing entry → normalized video. */
export function parseTiktokListingEntry(entry: Record<string, unknown>, creatorPlatformId: string): SourceVideo | null {
  const id = str(entry.id);
  if (!id || !/^\d{6,25}$/.test(id)) return null;
  const handle = str(entry.uploader);
  const timestamp = num(entry.timestamp);
  const description = str(entry.description);
  const track = str(entry.track);
  return {
    platform: "tiktok",
    platformVideoId: id,
    creatorPlatformId,
    url: tiktokVideoUrl(handle, id, creatorPlatformId),
    postedAt: timestamp === null ? null : timestamp * 1000,
    durationMs: num(entry.duration) === null ? null : num(entry.duration)! * 1000,
    width: num(entry.width),
    height: num(entry.height),
    title: description ? truncateCodePoints(description, 200) : null,
    description,
    hashtags: hashtagsFromText(description),
    soundId: null,
    soundTitle: track,
    soundOriginal: originalFromTrack(track),
    language: null,
    region: null,
    isAd: null,
    aigcLabel: null,
    metrics: {
      views: num(entry.view_count),
      likes: num(entry.like_count),
      comments: num(entry.comment_count),
      // yt-dlp maps TikTok shareCount to repost_count.
      shares: num(entry.repost_count),
      saves: num(entry.save_count),
    },
    viewsPrecision: "exact",
  };
}

export async function listTiktokCreator(input: {
  platformCreatorId: string;
  handle?: string | null;
  limit: number;
  run: YtdlpRunner;
  timeoutMs?: number;
}): Promise<ListingResult> {
  const args = flatListingArgs(tiktokListingUrl(input.platformCreatorId, input.handle), {
    limit: input.limit,
    entryFields: LISTING_FIELDS,
  });
  const result = await input.run(args, { timeoutMs: input.timeoutMs ?? 120_000 });
  const { entries } = parseJsonLines(result.stdout);
  const videos = entries
    .map((entry) => parseTiktokListingEntry(entry, input.platformCreatorId))
    .filter((video): video is SourceVideo => video !== null);
  const first = entries[0];
  return {
    outcome: classifyProbe({ code: result.code, stderr: result.stderr, entries: videos.length, timedOut: result.timedOut }),
    creator: first
      ? { handle: str(first.uploader), displayName: str(first.channel) }
      : null,
    videos,
    ms: result.ms,
  };
}

// ─── Explore / sound XHR (item_list) ────────────────────────────────────────

type Counts = Record<string, unknown> | undefined;

const count = (stats: Counts, statsV2: Counts, key: string): number | null =>
  num(statsV2?.[key]) ?? num(stats?.[key]);

/** Parse one `api/explore/item_list` or `api/music/item_list` body. */
export function parseItemListBody(body: string): { statusCode: number | null; items: Array<{ creator: SourceCreator; video: SourceVideo }>; empty: boolean } {
  if (!body.trim()) return { statusCode: null, items: [], empty: true };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { statusCode: null, items: [], empty: true };
  }
  const statusCode = num(parsed.statusCode ?? parsed.status_code);
  const list = Array.isArray(parsed.itemList) ? (parsed.itemList as Array<Record<string, unknown>>) : [];
  const items: Array<{ creator: SourceCreator; video: SourceVideo }> = [];
  for (const item of list) {
    const author = (item.author ?? {}) as Record<string, unknown>;
    const secUid = str(author.secUid);
    const id = str(item.id);
    if (!secUid || !id) continue;
    const authorStats = (item.authorStatsV2 ?? item.authorStats ?? {}) as Record<string, unknown>;
    const stats = item.stats as Counts;
    const statsV2 = item.statsV2 as Counts;
    const video = (item.video ?? {}) as Record<string, unknown>;
    const music = (item.music ?? {}) as Record<string, unknown>;
    const handle = str(author.uniqueId);
    const description = str(item.desc);
    const challengeTags = Array.isArray(item.challenges)
      ? (item.challenges as Array<Record<string, unknown>>).map((challenge) => str(challenge.title)).filter((tag): tag is string => !!tag)
      : [];
    const location = str(item.locationCreated);
    const aigcType = num(item.aigcLabelType);
    const aigcText = str(item.AIGCDescription);
    const createTime = num(item.createTime);
    const duration = num(video.duration);
    items.push({
      creator: {
        platform: "tiktok",
        platformCreatorId: secUid,
        handle,
        displayName: str(author.nickname),
        followers: num(authorStats.followerCount),
        videoCount: num(authorStats.videoCount),
        totalLikes: num(authorStats.heartCount ?? authorStats.heart),
        region: location,
      },
      video: {
        platform: "tiktok",
        platformVideoId: id,
        creatorPlatformId: secUid,
        url: tiktokVideoUrl(handle, id, secUid),
        postedAt: createTime === null ? null : createTime * 1000,
        durationMs: duration === null ? null : duration * 1000,
        width: num(video.width),
        height: num(video.height),
        title: description ? truncateCodePoints(description, 200) : null,
        description,
        hashtags: [...new Set([...challengeTags.map((tag) => tag.toLowerCase()), ...hashtagsFromText(description)])],
        soundId: str(music.id),
        soundTitle: str(music.title),
        soundOriginal: typeof music.original === "boolean" ? music.original : null,
        language: str(item.textLanguage),
        region: location,
        isAd: typeof item.isAd === "boolean" ? item.isAd : null,
        aigcLabel: aigcType !== null || aigcText !== null ? (aigcType ?? 0) > 0 || aigcText !== null : null,
        metrics: {
          views: count(stats, statsV2, "playCount"),
          likes: count(stats, statsV2, "diggCount"),
          comments: count(stats, statsV2, "commentCount"),
          shares: count(stats, statsV2, "shareCount"),
          saves: count(stats, statsV2, "collectCount"),
        },
        viewsPrecision: "exact",
      },
    });
  }
  return { statusCode, items, empty: list.length === 0 };
}

/** Raw XHR bodies captured from one page session. */
export interface XhrCapture {
  bodies: string[];
  /** A block observed on the page itself (CAPTCHA overlay, login wall). */
  pageBlock: ProbeOutcome | null;
  region: string | null;
  ms: number;
}

export type XhrCapturer = (input: {
  url: string;
  match: RegExp;
  chip?: string;
  scrolls: number;
  timeoutMs: number;
}) => Promise<XhrCapture>;

/** Turn captured bodies into a discovery result; an empty streak or a page block trips the source. */
export function discoveryFromCapture(capture: XhrCapture): DiscoveryResult {
  const creators = new Map<string, SourceCreator>();
  const videos = new Map<string, SourceVideo>();
  let emptyStreak = 0;
  let outcome: ProbeOutcome = capture.pageBlock ?? { kind: "ok" };
  for (const body of capture.bodies) {
    const parsed = parseItemListBody(body);
    if (parsed.empty) {
      emptyStreak += 1;
      if (emptyStreak >= 3 && outcome.kind !== "blocked") outcome = { kind: "blocked", reason: "empty-body", detail: `${emptyStreak} empty item_list responses in a row` };
      continue;
    }
    emptyStreak = 0;
    for (const { creator, video } of parsed.items) {
      creators.set(creator.platformCreatorId, creator);
      videos.set(video.platformVideoId, video);
    }
  }
  if (outcome.kind === "ok" && videos.size === 0) {
    outcome = capture.bodies.length === 0
      ? { kind: "empty", reason: "no-xhr", detail: "no item_list responses captured" }
      : { kind: "empty", reason: "empty-body" };
  }
  return {
    outcome,
    creators: [...creators.values()],
    videos: [...videos.values()],
    unresolvedVideoIds: [],
    requests: capture.bodies.length,
    ms: capture.ms,
    region: capture.region,
  };
}

const PAGE_BLOCK_SELECTORS = ["#captcha-verify-container", "[class*='captcha_verify']", "#tiktok-verify-ele", "[class*='captcha-verify']"];

/**
 * Playwright XHR capture, logged out, one headless page per call. Stops on a
 * CAPTCHA overlay or an empty-body streak; never solves or dismisses a check.
 */
export const capturePageXhr: XhrCapturer = async (input) => {
  const started = Date.now();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const bodies: string[] = [];
  let pageBlock: ProbeOutcome | null = null;
  let region: string | null = null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1800 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    let armed = !input.chip;
    const pending: Array<Promise<void>> = [];
    page.on("response", (response) => {
      if (!armed || !input.match.test(response.url()) || /\/prefetch\//.test(response.url())) return;
      pending.push(response.text().then((text) => { bodies.push(text); }, () => { bodies.push(""); }));
    });
    const checkBlock = async (): Promise<boolean> => {
      for (const selector of PAGE_BLOCK_SELECTORS) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          pageBlock = { kind: "blocked", reason: "captcha", detail: `page shows ${selector}` };
          return true;
        }
      }
      return false;
    };
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await page.waitForTimeout(3_000);
    region = await page
      .evaluate(() => {
        const node = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
        if (!node?.textContent) return null;
        try {
          const data = JSON.parse(node.textContent) as { __DEFAULT_SCOPE__?: Record<string, { region?: string }> };
          return data.__DEFAULT_SCOPE__?.["webapp.app-context"]?.region ?? null;
        } catch {
          return null;
        }
      })
      .catch(() => null);
    if (!(await checkBlock())) {
      if (input.chip) {
        const chip = page.getByText(input.chip, { exact: true }).first();
        if ((await chip.count()) === 0) {
          pageBlock = { kind: "failed", reason: "chip-missing", detail: `Explore chip not found: ${input.chip}` };
        } else {
          armed = true;
          // Chips sit in a horizontally scrolled bar; fall back to a DOM click.
          await chip.click({ force: true, timeout: 10_000 }).catch(() =>
            chip.evaluate((element) => {
              const target = (element.closest("[data-testid='tux-web-interaction-container']") ?? element) as HTMLElement;
              target.click();
            }),
          );
          await page.waitForTimeout(2_500);
        }
      }
      await page.mouse.move(640, 900);
      for (let index = 0; index < input.scrolls && pageBlock === null; index += 1) {
        // Scroll both the wheel target and the document end: the feed loads the
        // next page when its last card enters the viewport.
        await page.mouse.wheel(0, 2_400);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => undefined);
        await page.waitForTimeout(1_500);
        if (await checkBlock()) break;
        if (Date.now() - started > input.timeoutMs) break;
        const tail = bodies.slice(-3);
        if (tail.length === 3 && tail.every((body) => parseItemListBody(body).empty)) break;
      }
    }
    await Promise.allSettled(pending);
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { bodies, pageBlock, region, ms: Date.now() - started };
};

export function exploreUrl(): string {
  return "https://www.tiktok.com/explore";
}

export const EXPLORE_XHR = /\/api\/explore\/item_list\//;
export const SOUND_XHR = /\/api\/music\/item_list\//;

export function soundUrl(seed: string): string {
  if (/^https?:\/\//.test(seed)) return seed;
  return /^\d+$/.test(seed) ? `https://www.tiktok.com/music/sound-${seed}` : `https://www.tiktok.com/music/${seed}`;
}

// ─── Apify `clockworks/tiktok-scraper` items (paid seeds) ────────────────────

/** Parse one Apify TikTok scraper dataset item. */
export function parseApifyTiktokItem(item: Record<string, unknown>): { creator: SourceCreator; video: SourceVideo } | null {
  const author = (item.authorMeta ?? {}) as Record<string, unknown>;
  const id = str(item.id);
  const creatorId = str(author.secUid) ?? str(author.id);
  if (!id || !creatorId) return null;
  const handle = str(author.name);
  const videoMeta = (item.videoMeta ?? {}) as Record<string, unknown>;
  const music = (item.musicMeta ?? {}) as Record<string, unknown>;
  const createTime = num(item.createTime);
  const description = str(item.text);
  const tags = Array.isArray(item.hashtags)
    ? (item.hashtags as Array<Record<string, unknown>>).map((tag) => str(tag.name)).filter((tag): tag is string => !!tag)
    : [];
  const duration = num(videoMeta.duration);
  return {
    creator: {
      platform: "tiktok",
      platformCreatorId: creatorId,
      handle,
      displayName: str(author.nickName),
      followers: num(author.fans),
      videoCount: num(author.video),
      totalLikes: num(author.heart),
      region: null,
    },
    video: {
      platform: "tiktok",
      platformVideoId: id,
      creatorPlatformId: creatorId,
      url: str(item.webVideoUrl) ?? tiktokVideoUrl(handle, id, creatorId),
      postedAt: createTime === null ? null : createTime * 1000,
      durationMs: duration === null ? null : duration * 1000,
      width: num(videoMeta.width),
      height: num(videoMeta.height),
      title: description ? truncateCodePoints(description, 200) : null,
      description,
      hashtags: [...new Set([...tags.map((tag) => tag.toLowerCase()), ...hashtagsFromText(description)])],
      soundId: str(music.musicId),
      soundTitle: str(music.musicName),
      soundOriginal: typeof music.musicOriginal === "boolean" ? music.musicOriginal : null,
      language: str(item.textLanguage),
      region: null,
      isAd: typeof item.isAd === "boolean" ? item.isAd : null,
      aigcLabel: null,
      metrics: {
        views: num(item.playCount),
        likes: num(item.diggCount),
        comments: num(item.commentCount),
        shares: num(item.shareCount),
        saves: num(item.collectCount),
      },
      viewsPrecision: "exact",
    },
  };
}

// ─── Profile pages (handle -> secUid, followers, bio), #576 ─────────────────
//
// Cross-platform discovery yields TikTok handles (a YouTube channel's TikTok
// link, a same-name handle, a caption @mention). yt-dlp cannot list a plain
// @handle logged out ("Unable to extract secondary user ID"), so the
// logged-out profile page resolves the handle: its rehydration JSON carries
// the secUid, follower / video / like counts, and the bio. The page's own
// video XHR returns an empty body logged out and is not used; videos still
// come from the yt-dlp `tiktokuser:<secUid>` listing. A CAPTCHA overlay or a
// page that never hydrates (WAF interstitial) is a block: the session stops.

export const TIKTOK_PROFILE_SOURCE = "tiktok-profile";

export interface TiktokProfile {
  secUid: string;
  uniqueId: string;
  nickname: string | null;
  signature: string | null;
  followers: number | null;
  videoCount: number | null;
  hearts: number | null;
  privateAccount: boolean;
  region: string | null;
}

export interface TiktokProfileResult {
  outcome: ProbeOutcome;
  profile: TiktokProfile | null;
  ms: number;
}

export interface TiktokProfileSession {
  resolve(handle: string): Promise<TiktokProfileResult>;
  close(): Promise<void>;
}

export type TiktokProfileOpener = () => Promise<TiktokProfileSession>;

/** Parse the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON of a profile page. */
export function parseProfileRehydration(json: string): { outcome: ProbeOutcome; profile: TiktokProfile | null } {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { outcome: { kind: "failed", reason: "error", detail: "profile rehydration JSON did not parse" }, profile: null };
  }
  const scope = (data.__DEFAULT_SCOPE__ ?? {}) as Record<string, Record<string, unknown>>;
  const detail = scope["webapp.user-detail"];
  const status = num(detail?.statusCode);
  const userInfo = (detail?.userInfo ?? {}) as Record<string, unknown>;
  const user = (userInfo.user ?? {}) as Record<string, unknown>;
  const stats = (userInfo.statsV2 ?? userInfo.stats ?? {}) as Record<string, unknown>;
  const secUid = str(user.secUid);
  const uniqueId = str(user.uniqueId);
  if (status !== 0 || !secUid || !uniqueId) {
    if (status === 10222) return { outcome: { kind: "failed", reason: "creator", detail: "This account is private" }, profile: null };
    return { outcome: { kind: "failed", reason: "creator", detail: `profile not found (statusCode ${status ?? "none"})` }, profile: null };
  }
  const region = str((scope["webapp.app-context"] as Record<string, unknown> | undefined)?.region);
  return {
    outcome: { kind: "ok" },
    profile: {
      secUid,
      uniqueId,
      nickname: str(user.nickname),
      signature: str(user.signature),
      followers: num(stats.followerCount),
      videoCount: num(stats.videoCount),
      hearts: num(stats.heartCount ?? stats.heart),
      privateAccount: user.privateAccount === true,
      region: str(user.region) ?? region,
    },
  };
}

/** One headless browser for a batch of profile pages; images, media, and fonts are not loaded. */
export const openTiktokProfileSession: TiktokProfileOpener = async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1800 },
    locale: "en-US",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  });
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "image" || type === "media" || type === "font" ? route.abort() : route.continue();
  });
  const page = await context.newPage();
  return {
    async resolve(handle: string): Promise<TiktokProfileResult> {
      const started = Date.now();
      const bare = handle.replace(/^@/, "");
      if (!/^[A-Za-z0-9._]{2,24}$/.test(bare)) return { outcome: { kind: "failed", reason: "creator", detail: "invalid handle" }, profile: null, ms: 0 };
      try {
        await page.goto(`https://www.tiktok.com/@${bare}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      } catch (error) {
        return { outcome: { kind: "failed", reason: "timeout", detail: String((error as Error).message).slice(0, 200) }, profile: null, ms: Date.now() - started };
      }
      let json: string | null = null;
      for (let attempt = 0; attempt < 16 && json === null; attempt += 1) {
        for (const selector of PAGE_BLOCK_SELECTORS) {
          if (await page.locator(selector).first().isVisible().catch(() => false)) {
            return { outcome: { kind: "blocked", reason: "captcha", detail: `page shows ${selector}` }, profile: null, ms: Date.now() - started };
          }
        }
        json = await page.evaluate(() => document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent ?? null).catch(() => null);
        if (json === null) await page.waitForTimeout(500);
      }
      if (json === null) {
        return { outcome: { kind: "blocked", reason: "bot-check", detail: "profile page never hydrated (interstitial)" }, profile: null, ms: Date.now() - started };
      }
      return { ...parseProfileRehydration(json), ms: Date.now() - started };
    },
    async close() {
      await browser.close().catch(() => undefined);
    },
  };
};
