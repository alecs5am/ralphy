import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { CircuitBreaker, EMPTY_STREAK_TO_TRIP, classifyProbe, openTrip } from "../../cli/lib/trends/breaker.js";
import { deterministicLabels, nicheFromHashtags, parseLlmLabels, ruleFormat, ruleHook, llmLabelPrompt } from "../../cli/lib/trends/cohorts.js";
import {
  discoveryFromCapture,
  isSecUid,
  listTiktokCreator,
  parseItemListBody,
  tiktokListingUrl,
} from "../../cli/lib/trends/sources/tiktok.js";
import { discoverYoutubeHashtag, listYoutubeChannelShorts, youtubeShortsTabUrl } from "../../cli/lib/trends/sources/youtube.js";
import {
  PAID_ACTORS,
  affordableResults,
  instagramReelInput,
  parseApifyTiktokItems,
  parseInstagramReelItems,
  tiktokSeedInput,
} from "../../cli/lib/trends/sources/paid.js";
import { assertLoggedOutArgs, flatListingArgs, hashtagsFromText, type YtdlpRunner } from "../../cli/lib/trends/sources/ytdlp.js";
import { isoDurationSeconds, youtubeVideoDetails } from "../../cli/lib/providers/youtube-analytics.js";
import { setCredentialTestSource } from "../../cli/lib/providers/credentials.js";
import type { LabelCandidateDto } from "../../cli/lib/store/trends.js";

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "trends");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const SEC = "MS4wLjABAAAAfixtureCreatorAlphaSecUid0123456789abcdefghij";

const runner = (stdout: string, stderr = "", code = 0): { run: YtdlpRunner; calls: string[][] } => {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push(args);
      return { code, stdout, stderr, ms: 5, timedOut: false };
    },
  };
};

// Restore the preloaded default (tests/helpers/credential-test-source.ts): read the env var.
afterEach(() => setCredentialTestSource((_providerId, environmentVariable) =>
  environmentVariable ? process.env[environmentVariable] ?? null : null
));

describe("yt-dlp arguments", () => {
  test("corpus listings never carry cookies or credentials", () => {
    const args = flatListingArgs("tiktokuser:abc", { limit: 60, entryFields: ["id"] });
    expect(args.join(" ")).not.toMatch(/cookies|password|username|proxy/);
    expect(args).toContain("--flat-playlist");
    expect(() => assertLoggedOutArgs(["--cookies-from-browser", "chrome"])).toThrow(/logged out/);
    expect(() => assertLoggedOutArgs(["--cookies=jar.txt"])).toThrow(/logged out/);
    expect(() => assertLoggedOutArgs(args)).not.toThrow();
  });

  test("hashtags are pulled from captions", () => {
    expect(hashtagsFromText("Try this #AITools and #tech_tips!")).toEqual(["aitools", "tech_tips"]);
  });
});

describe("TikTok parsers", () => {
  test("creator listing lines become exact-precision videos with shares from repost_count", async () => {
    const { run, calls } = runner(fixture("tiktok-listing.jsonl"));
    const listing = await listTiktokCreator({ platformCreatorId: SEC, limit: 60, run });
    expect(calls[0]!.at(-1)).toBe(`tiktokuser:${SEC}`);
    expect(listing.outcome.kind).toBe("ok");
    expect(listing.videos).toHaveLength(5);
    const first = listing.videos[0]!;
    expect(first).toMatchObject({
      platform: "tiktok",
      creatorPlatformId: SEC,
      url: "https://www.tiktok.com/@fixture_alpha/video/7700000000000000100",
      durationMs: 20_000,
      soundOriginal: true,
      viewsPrecision: "exact",
      metrics: { views: 1000, likes: 50, comments: 3, shares: 2, saves: 4 },
      hashtags: ["aitools", "productivity"],
    });
    expect(first.postedAt).toBe(1792000000 * 1000);
    expect(listing.videos[1]!.soundOriginal).toBeNull();
    expect(listing.creator).toEqual({ handle: "fixture_alpha", displayName: "Fixture Alpha" });
  });

  test("secUid vs handle listing URLs", () => {
    expect(isSecUid(SEC)).toBe(true);
    expect(tiktokListingUrl(SEC)).toBe(`tiktokuser:${SEC}`);
    expect(tiktokListingUrl("7100", "@someone")).toBe("https://www.tiktok.com/@someone");
  });

  test("Explore XHR bodies yield creators with follower counts and full stats", () => {
    const parsed = parseItemListBody(fixture("tiktok-explore-item-list.json"));
    expect(parsed.statusCode).toBe(0);
    expect(parsed.items).toHaveLength(3);
    const [alpha, bravo, ad] = parsed.items;
    expect(alpha!.creator).toMatchObject({ platformCreatorId: SEC, handle: "fixture_alpha", followers: 45000, videoCount: 120 });
    expect(alpha!.video).toMatchObject({ language: "en", soundOriginal: true, isAd: false, metrics: { views: 820000, shares: 2733, saves: 4100 } });
    expect(alpha!.video.hashtags).toEqual(expect.arrayContaining(["techtips", "aitools"]));
    expect(bravo!.video.soundOriginal).toBe(false);
    expect(ad!.video).toMatchObject({ isAd: true, aigcLabel: true, language: "un" });
  });

  test("a captured session dedupes items, and an empty-body streak trips the source", () => {
    const body = fixture("tiktok-explore-item-list.json");
    const ok = discoveryFromCapture({ bodies: [body, body], pageBlock: null, region: "KR", ms: 10 });
    expect(ok.outcome.kind).toBe("ok");
    expect(ok.creators).toHaveLength(2);
    expect(ok.videos).toHaveLength(3);
    expect(ok.region).toBe("KR");
    const blocked = discoveryFromCapture({ bodies: [body, "", "", ""], pageBlock: null, region: null, ms: 10 });
    expect(blocked.outcome).toMatchObject({ kind: "blocked", reason: "empty-body" });
    const captcha = discoveryFromCapture({ bodies: [], pageBlock: { kind: "blocked", reason: "captcha" }, region: null, ms: 1 });
    expect(captcha.outcome.reason).toBe("captcha");
  });

  test("Apify TikTok seed items (paid) parse with authorMeta fans", () => {
    const [item] = parseApifyTiktokItems(JSON.parse(fixture("apify-tiktok.json")));
    expect(item!.creator).toMatchObject({ handle: "fixture_charlie", followers: 250000 });
    expect(item!.video).toMatchObject({ soundOriginal: false, metrics: { views: 120000, saves: 900 }, durationMs: 15_000 });
  });
});

describe("YouTube parsers", () => {
  test("channel Shorts tab: undated, rounded views, channel followers from the playlist line", async () => {
    const { run, calls } = runner(fixture("youtube-channel-shorts.jsonl"));
    const listing = await listYoutubeChannelShorts({ channelRef: "UCfixtureChannelAlpha0001", limit: 60, run });
    expect(calls[0]!.at(-1)).toBe("https://www.youtube.com/channel/UCfixtureChannelAlpha0001/shorts");
    expect(listing.videos.map((video) => video.platformVideoId)).toEqual(["fixtureAAA1", "fixtureAAA2"]);
    expect(listing.videos[0]).toMatchObject({ postedAt: null, viewsPrecision: "rounded", url: "https://www.youtube.com/shorts/fixtureAAA1", metrics: { views: 125000, likes: null } });
    expect(listing.creator).toMatchObject({ platformCreatorId: "UCfixtureChannelAlpha0001", handle: "@fixturechannel", followers: 19200 });
    expect(youtubeShortsTabUrl("someone")).toBe("https://www.youtube.com/@someone/shorts");
  });

  test("hashtag discovery: channel seeds from the hashtag page, Shorts ids stay unresolved", async () => {
    const outputs = [fixture("youtube-hashtag-page.jsonl"), fixture("youtube-hashtag-shorts.jsonl")];
    const run: YtdlpRunner = async () => ({ code: 0, stdout: outputs.shift() ?? "", stderr: "", ms: 1, timedOut: false });
    const discovery = await discoverYoutubeHashtag({ tag: "#AITools", limit: 50, run });
    expect(discovery.outcome.kind).toBe("ok");
    expect(discovery.creators.map((creator) => creator.platformCreatorId)).toEqual(["UCfixtureChannelAlpha0001", "UCfixtureChannelBravo0002"]);
    expect(discovery.videos).toEqual([]);
    expect(discovery.unresolvedVideoIds).toEqual(["fixtureSHT1", "fixtureSHT2"]);
  });

  test("Data API videos.list (registered connector) gives exact stats and publish times", async () => {
    setCredentialTestSource((providerId) => (providerId === "youtube" ? "fixture-key" : null));
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return new Response(fixture("youtube-videos-list.json"), { status: 200 });
    };
    const details = await youtubeVideoDetails(["fixtureSHT1", "fixtureSHT2"], fetchImpl);
    expect(urls[0]).toContain("part=snippet,contentDetails,statistics");
    expect(details[0]).toMatchObject({ channelId: "UCfixtureChannelAlpha0001", durationSec: 45, views: 241234, likes: 1500, language: "en-US", publishedAt: Date.parse("2026-10-20T12:00:00Z") });
    expect(details[1]).toMatchObject({ durationSec: 65, likes: null, comments: null });
    expect(isoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationSeconds("bogus")).toBeNull();
    await expect(youtubeVideoDetails(Array.from({ length: 51 }, (_, index) => `id${index}`), fetchImpl)).rejects.toThrow(/at most 50/);
  });
});

describe("Instagram reel actor (paid, default off)", () => {
  test("reel items parse plays as views; invalid items are skipped", () => {
    const parsed = parseInstagramReelItems(JSON.parse(fixture("instagram-reels.json")));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.video).toMatchObject({ platform: "instagram", platformVideoId: "FixtureRe1", durationMs: 28_400, soundOriginal: true, metrics: { views: 210000, likes: 5400, comments: 120, shares: null } });
    expect(parsed[0]!.creator).toMatchObject({ platformCreatorId: "5500000001", handle: "fixture.reels" });
    expect(instagramReelInput({ usernames: ["@fixture.reels"], resultsLimit: 12 })).toEqual({ username: ["fixture.reels"], resultsLimit: 12 });
  });

  test("the daily cap shrinks or refuses a paid request", () => {
    expect(affordableResults("apify-instagram", 12, { dailyCapUsd: 1, spentTodayUsd: 0 }).results).toBe(12);
    expect(affordableResults("apify-tiktok", 1000, { dailyCapUsd: 1, spentTodayUsd: 0.4 }).results).toBe(200);
    expect(affordableResults("apify-tiktok", 1000, { dailyCapUsd: 1, spentTodayUsd: 1 }).results).toBe(0);
    expect(PAID_ACTORS["apify-instagram"].actorId).toBe("apify/instagram-reel-scraper");
    expect(tiktokSeedInput({ hashtags: ["#aitools"], keywords: [] }, 50)).toMatchObject({ hashtags: ["aitools"], resultsPerPage: 50, shouldDownloadVideos: false });
  });
});

describe("block detection and the circuit breaker", () => {
  test.each([
    ["ERROR: [youtube] abc: Sign in to confirm you're not a bot", "bot-check"],
    ["ERROR: Please complete the captcha to continue", "captcha"],
    ["ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests", "rate-limit"],
    ["ERROR: HTTP Error 403: Forbidden", "forbidden"],
    ["ERROR: [instagram] Requested content is not available, login required", "login-wall"],
  ])("%s → blocked (%s)", (stderr, reason) => {
    expect(classifyProbe({ code: 1, stderr, entries: 0 })).toMatchObject({ kind: "blocked", reason });
  });

  test("creator-specific failures and empty bodies are not blocks", () => {
    expect(classifyProbe({ code: 1, stderr: "ERROR: [tiktok:user] x: Unable to extract secondary user ID", entries: 0 })).toMatchObject({ kind: "failed", reason: "creator" });
    expect(classifyProbe({ code: 0, stderr: "", entries: 0 })).toMatchObject({ kind: "empty" });
    expect(classifyProbe({ code: 0, stderr: "", entries: 3 })).toEqual({ kind: "ok" });
    expect(classifyProbe({ code: 1, stderr: "", entries: 0, timedOut: true })).toMatchObject({ reason: "timeout" });
  });

  test("a block trips immediately; empties trip after a streak; the budget stops politely", () => {
    const breaker = new CircuitBreaker("ytdlp-tiktok-user", { budget: 10, clock: () => 42 });
    expect(breaker.acquire()).toBe(true);
    breaker.record({ kind: "blocked", reason: "captcha" });
    expect(breaker.snapshot()).toMatchObject({ state: "tripped", reason: "captcha", trippedAt: 42 });
    expect(breaker.acquire()).toBe(false);

    const empties = new CircuitBreaker("tiktok-explore", { budget: 10 });
    for (let index = 0; index < EMPTY_STREAK_TO_TRIP - 1; index += 1) empties.record({ kind: "empty" });
    empties.record({ kind: "ok" });
    empties.record({ kind: "empty" });
    expect(empties.open).toBe(true);
    for (let index = 0; index < EMPTY_STREAK_TO_TRIP; index += 1) empties.record({ kind: "empty" });
    expect(empties.snapshot()).toMatchObject({ state: "tripped", reason: "empty-body" });

    const budget = new CircuitBreaker("x", { budget: 2 });
    expect([budget.acquire(), budget.acquire(), budget.acquire()]).toEqual([true, true, false]);
    expect(budget.snapshot().state).toBe("budget-exhausted");
  });

  test("a stored trip holds the source closed during the cooldown only", () => {
    const runs = [
      { source: "ytdlp-tiktok-user", response: { breaker: { state: "tripped", reason: "captcha", trippedAt: 1_000 } } },
      { source: "ytdlp-tiktok-user", response: { breaker: { state: "closed" } } },
    ];
    expect(openTrip(runs, "ytdlp-tiktok-user", 2_000, 5_000)).toMatchObject({ reason: "captcha", retryAfter: 6_000 });
    expect(openTrip(runs, "ytdlp-tiktok-user", 7_000, 5_000)).toBeNull();
    expect(openTrip([{ source: "x", response: { breaker: { state: "closed" } } }, ...runs], "x", 2_000, 5_000)).toBeNull();
  });
});

describe("cohort labels", () => {
  const candidate = (overrides: Partial<LabelCandidateDto> = {}): LabelCandidateDto => ({
    videoId: "tvideo_1",
    platform: "tiktok",
    title: "5 AI tools that replace your assistant",
    description: null,
    hashtags: ["aitools"],
    durationMs: 24_000,
    soundId: null,
    soundOriginal: true,
    language: "en",
    region: null,
    creatorRegion: "US",
    creatorNiche: "ai-tools",
    creatorNicheMethod: "seed",
    sizeBand: "micro",
    existingAxes: [],
    ...overrides,
  });

  test("deterministic axes, seed niche, and rule pre-labels", () => {
    const labels = deterministicLabels(candidate());
    const byAxis = Object.fromEntries(labels.map((label) => [label.axis, `${label.label}/${label.method}`]));
    expect(byAxis).toEqual({
      length_band: "16-30s/rule",
      size_band: "micro/rule",
      language: "en/rule",
      region: "US/rule",
      audio: "original/rule",
      niche: "ai-tools/seed",
      format: "listicle/rule",
      hook: "numbered-list/rule",
    });
    expect(deterministicLabels(candidate({ existingAxes: labels.map((label) => `${label.axis}:${label.method}`) }))).toEqual([]);
  });

  test("hook and format rules are high precision", () => {
    expect(ruleHook("POV: you found the setting")).toBe("pov");
    expect(ruleHook("Nobody tells you this about ChatGPT")).toBe("nobody-tells-you");
    expect(ruleHook("Why does my phone do this?")).toBe("question");
    expect(ruleHook("I made $4,000 with one prompt")).toBe("shock-number");
    expect(ruleHook("just a vlog")).toBeNull();
    expect(ruleFormat("Unboxing the new phone", [])).toBe("review-unboxing");
    expect(ruleFormat("cat", ["aivideo"])).toBe("ai-visuals");
    expect(ruleFormat("a normal clip", [])).toBeNull();
    expect(nicheFromHashtags(["chatgpt", "aitools", "iphone"])).toBe("ai-tools");
  });

  test("LLM labels below 0.6 confidence or outside the closed set become unknown", () => {
    const batch = [candidate(), candidate({ videoId: "tvideo_2", creatorNiche: null })];
    const prompt = llmLabelPrompt(batch);
    expect(prompt.system).toContain("talking-head");
    expect(prompt.user.split("\n")).toHaveLength(2);
    const reply = JSON.stringify({
      items: [
        { i: 0, format: "screen-recording", format_confidence: 0.82, hook: "numbered-list", hook_confidence: 0.4 },
        { i: 1, format: "made-up-format", format_confidence: 0.9, hook: "pov", hook_confidence: 0.7, niche: "ai-tools", niche_confidence: 0.75 },
      ],
    });
    const labels = parseLlmLabels(`Here you go: ${reply}`, batch, "google/gemini-2.5-flash");
    const summary = labels.map((label) => `${label.videoId}:${label.axis}=${label.label}`);
    expect(summary).toEqual([
      "tvideo_1:format=screen-recording",
      "tvideo_1:hook=unknown",
      "tvideo_2:format=unknown",
      "tvideo_2:hook=pov",
      "tvideo_2:niche=ai-tools",
    ]);
    expect(labels.every((label) => label.method === "llm" && label.model === "google/gemini-2.5-flash")).toBe(true);
    expect(parseLlmLabels("not json", batch, "m")).toEqual([]);
  });
});
