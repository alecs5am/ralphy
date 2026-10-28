import { describe, expect, test } from "bun:test";
import {
  DEFAULT_NEGATIVE_RULES,
  compilationName,
  defaultNicheSeedFile,
  duplicateCaptionShares,
  engagementAnomalies,
  expansionHashtags,
  gateCreator,
  negativeEligibility,
  parseNicheSeedFile,
  prioritizeByQuota,
  quotaBandFor,
  quotaStatus,
  rankCopyability,
  selectNegativeGroup,
  slugifyNiche,
  snowballDecision,
  type CopyCandidate,
  type GateOptions,
  type PerformanceVideo,
} from "../../cli/lib/trends/niche.js";
import {
  calibrateLabelThresholds,
  labelWithThresholds,
  parseLabelPercentiles,
  quantile,
} from "../../cli/lib/trends/thresholds.js";
import { applyLabelThresholds } from "../../cli/lib/trends/ingest.js";
import type { VideoScore } from "../../cli/lib/trends/score.js";
import {
  bioMetadata,
  captionKey,
  extractMentions,
  guessLanguage,
  matchTerms,
  scrubBio,
  tiktokHandleFromYoutube,
  tiktokHandlesFromText,
} from "../../cli/lib/trends/text.js";
import { parseProfileRehydration } from "../../cli/lib/trends/sources/tiktok.js";

const DAY = 86_400_000;

const SEEDS = {
  topic: "Psychology",
  languages: ["en"],
  lexicon: { en: { core: ["psycholog*", "anxiety", "mental health", "narcissis*"], support: ["brain", "habits"], negative: ["gameplay"] } },
  subNiches: [
    { slug: "Anxiety", label: "Anxiety", terms: ["anxiety", "panic attack*"] },
    { slug: "dark-psychology", label: "Dark psychology", terms: ["narcissis*", "manipulat*"] },
  ],
  seeds: [
    { platform: "youtube", kind: "keyword", value: "psychology facts" },
    { platform: "youtube", kind: "hashtag", value: "#psychology" },
    { platform: "tiktok", kind: "creator", value: "@somecreator" },
  ],
  settings: { targetCreators: 200, labelPercentiles: { breakout: 0.99, outlier: 0.96, strong: 0.9 } },
};

describe("seeds file", () => {
  test("validates, slugs, and normalizes seeds and sub-niches", () => {
    const file = parseNicheSeedFile(SEEDS);
    expect(file.slug).toBe("psychology");
    expect(file.taxonomy.subNiches.map((sub) => sub.slug)).toEqual(["anxiety", "dark-psychology"]);
    expect(file.seeds[1]).toMatchObject({ platform: "youtube", kind: "hashtag", value: "psychology" });
    expect(file.settings.targetCreators).toBe(200);
    expect(file.settings.labelPercentiles).toEqual({ breakout: 0.99, outlier: 0.96, strong: 0.9 });
  });

  test("rejects missing lexicons, unknown kinds, and languages outside the niche", () => {
    expect(() => parseNicheSeedFile({ ...SEEDS, lexicon: {} })).toThrow(/no entry for language en/);
    expect(() => parseNicheSeedFile({ ...SEEDS, seeds: [{ platform: "youtube", kind: "playlist", value: "x" }] })).toThrow(/kind must be one of/);
    expect(() => parseNicheSeedFile({ ...SEEDS, seeds: [{ platform: "youtube", kind: "keyword", value: "x", language: "de" }] })).toThrow(/not one of the niche languages/);
    expect(() => parseNicheSeedFile({ ...SEEDS, subNiches: [{ slug: "general", terms: ["x"] }] })).toThrow(/reserved/);
  });

  test("the topic fallback is deterministic", () => {
    const a = defaultNicheSeedFile("Personal Finance", ["en"], ["tiktok", "youtube"]);
    const b = defaultNicheSeedFile("Personal Finance", ["en"], ["tiktok", "youtube"]);
    expect(a).toEqual(b);
    expect(a.slug).toBe("personal-finance");
    expect(a.seeds.map((seed) => `${seed.kind}:${seed.value}`)).toEqual([
      "keyword:personal finance", "keyword:personal finance shorts", "keyword:personal finance tips", "keyword:personal finance facts", "hashtag:personalfinance",
    ]);
    expect(a.taxonomy.lexicon.en!.core).toEqual(["personal finance", "personalfinance"]);
    expect(slugifyNiche("AI tools / tech tips")).toBe("ai-tools-tech-tips");
  });
});

describe("text matching and language", () => {
  test("terms match on word boundaries, prefixes with *, and hashtag spellings", () => {
    expect(matchTerms("Why narcissists never apologize", ["narcissis*"])).toEqual(["narcissis*"]);
    expect(matchTerms("#mentalhealth tips", ["mental health"])).toEqual(["mental health"]);
    expect(matchTerms("anxiety", ["anx"])).toEqual([]);
    expect(matchTerms("brainstorm session", ["brain"])).toEqual([]);
  });

  test("language guess separates English, Cyrillic, and other Latin-script text", () => {
    expect(guessLanguage("Why you feel anxious when nobody texts you back")).toBe("en");
    expect(guessLanguage("\u041f\u043e\u0447\u0435\u043c\u0443 \u0432\u044b \u0447\u0443\u0432\u0441\u0442\u0432\u0443\u0435\u0442\u0435 \u0442\u0440\u0435\u0432\u043e\u0433\u0443 \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c")).toBe("ru");
    expect(guessLanguage("Por que voce sente ansiedade quando para de trabalhar e pensa demais")).toBe("other");
    expect(guessLanguage("#fyp #viral")).toBeNull();
  });

  test("bios are scrubbed of emails, phone numbers, and links; handles are extracted", () => {
    const bio = "Therapist. Contact: hello@example.com or +1 (555) 123-4567. TikTok: @calm.mind https://www.tiktok.com/@other_acct?lang=en youtube.com/@MainChannel";
    const scrubbed = scrubBio(bio)!;
    expect(scrubbed).not.toMatch(/example\.com|555|https?:/);
    expect(scrubbed).toContain("[email]");
    expect(tiktokHandlesFromText(bio).sort()).toEqual(["calm.mind", "other_acct"]);
    const meta = bioMetadata(bio, "test")!;
    expect(meta.youtubeHandles).toEqual(["@MainChannel"]);
    expect(extractMentions("stitch with @dr.calm and email me at a@b.co")).toEqual(["dr.calm"]);
    expect(tiktokHandleFromYoutube("@Psych2go")).toBe("psych2go");
    expect(tiktokHandleFromYoutube("@has space")).toBeNull();
    expect(captionKey("POV: you finally set boundaries #therapy @someone")).toBe("povyoufinallysetboundaries");
  });

  test("profile rehydration parses secUid, counts, and private / missing accounts", () => {
    const page = (status: number, user: Record<string, unknown> = {}) => JSON.stringify({
      __DEFAULT_SCOPE__: {
        "webapp.app-context": { region: "KR" },
        "webapp.user-detail": { statusCode: status, userInfo: { user, stats: { followerCount: 1200, videoCount: 40, heartCount: 9000 } } },
      },
    });
    const ok = parseProfileRehydration(page(0, { secUid: "MS4wLjABAAAAexample", uniqueId: "calm.mind", nickname: "Calm", signature: "LCSW", region: "US" }));
    expect(ok.outcome.kind).toBe("ok");
    expect(ok.profile).toMatchObject({ secUid: "MS4wLjABAAAAexample", uniqueId: "calm.mind", followers: 1200, videoCount: 40, hearts: 9000, region: "US" });
    expect(parseProfileRehydration(page(10222)).outcome).toMatchObject({ kind: "failed", detail: "This account is private" });
    expect(parseProfileRehydration(page(10221)).outcome.kind).toBe("failed");
  });
});

describe("relevance gate", () => {
  const options: GateOptions = {
    languages: ["en"],
    lexicon: parseNicheSeedFile(SEEDS).taxonomy.lexicon,
    subNiches: parseNicheSeedFile(SEEDS).taxonomy.subNiches,
    threshold: 0.6,
    sample: 30,
    minSample: 8,
  };
  const videos = (onTopic: number, total: number, onText = "How anxiety shows up in your body", offText = "My weekend trip to the mountains with friends") =>
    Array.from({ length: total }, (_, index) => ({ text: index < onTopic ? onText : offText, hashtags: [] }));

  test("keeps a creator at exactly 60% of the last 30 videos and drops one just below", () => {
    expect(gateCreator({ videos: videos(18, 30) }, options)).toMatchObject({ status: "kept", relevance: 0.6, onTopic: 18, sampled: 30 });
    expect(gateCreator({ videos: videos(17, 30) }, options)).toMatchObject({ status: "dropped", reason: "off-topic", relevance: 0.567 });
  });

  test("a bio that states the topic keeps a creator from the profile floor; without it the 60% rule holds", () => {
    const anchored = { ...options, profileFloor: 0.4 };
    // Without `profile` terms in the lexicon, two distinct core terms anchor a bio.
    expect(gateCreator({ videos: videos(13, 30), profileText: "Psychology of anxiety, every day" }, anchored)).toMatchObject({ status: "kept", reason: "on-topic-profile", relevance: 0.433, profileTerms: ["psycholog*", "anxiety"] });
    expect(gateCreator({ videos: videos(13, 30), profileText: "Psychology for everyday life" }, anchored)).toMatchObject({ status: "dropped", reason: "off-topic" });
    expect(gateCreator({ videos: videos(11, 30), profileText: "Psychology of anxiety, every day" }, anchored).status).toBe("dropped");
    expect(gateCreator({ videos: videos(13, 30), profileText: "Psychology of anxiety, every day" }, options).status).toBe("dropped");
    // With `profile` terms, one profession term is enough.
    const withProfile = { ...anchored, lexicon: { en: { ...options.lexicon.en!, profile: ["therapist*", "lmft"] } } };
    expect(gateCreator({ videos: videos(13, 30), profileText: "Licensed therapist (LMFT)" }, withProfile)).toMatchObject({ status: "kept", profileTerms: ["therapist*", "lmft"] });
    expect(gateCreator({ videos: videos(13, 30), profileText: "Psychology of anxiety, every day" }, withProfile).status).toBe("dropped");
  });

  test("only the newest 30 videos are judged", () => {
    const list = [...videos(18, 30), ...Array.from({ length: 30 }, () => ({ text: "My weekend trip to the mountains with friends", hashtags: [] }))];
    expect(gateCreator({ videos: list }, options)).toMatchObject({ status: "kept", sampled: 30 });
  });

  test("support terms need two matches; negative terms veto weak matches", () => {
    expect(gateCreator({ videos: videos(30, 30, "Brain habits that change your life") }, options).status).toBe("kept");
    expect(gateCreator({ videos: videos(30, 30, "Brain games are fun to play") }, options).status).toBe("dropped");
    expect(gateCreator({ videos: videos(30, 30, "Psychology gameplay walkthrough part 3") }, options).status).toBe("dropped");
  });

  test("a creator in another language is dropped; too few captions stays undetermined", () => {
    const russian = Array.from({ length: 20 }, () => ({ text: "\u041f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0438\u044f \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0439 \u0438 \u0442\u0440\u0435\u0432\u043e\u0433\u0430 \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c", hashtags: [] }));
    expect(gateCreator({ videos: russian }, options)).toMatchObject({ status: "dropped", reason: "language-ru" });
    expect(gateCreator({ videos: videos(5, 5) }, options)).toMatchObject({ status: "undetermined", reason: "too-few-captions" });
    expect(gateCreator({ videos: [] }, options)).toMatchObject({ status: "undetermined", reason: "no-videos" });
  });

  test("a clear bio language wins over translated titles when asked (YouTube)", () => {
    const bio = "\u041a\u043b\u0438\u043d\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433, \u0437\u0430\u043f\u0438\u0441\u044c \u043d\u0430 \u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0430\u0446\u0438\u044e";
    expect(gateCreator({ videos: videos(20, 20), profileText: bio, preferProfileLanguage: true }, options)).toMatchObject({ status: "dropped", reason: "language-ru" });
    expect(gateCreator({ videos: videos(20, 20), profileText: bio }, options)).toMatchObject({ status: "kept", language: "en" });
    expect(gateCreator({ videos: videos(20, 20), profileText: "Licensed therapist helping you with anxiety", preferProfileLanguage: true }, options)).toMatchObject({ status: "kept", language: "en" });
  });

  test("the sub-niche is the one most on-topic videos match", () => {
    const list = [
      ...videos(12, 12, "Signs of a narcissist at work"),
      ...videos(8, 8, "Anxiety at night explained"),
    ];
    expect(gateCreator({ videos: list }, options)).toMatchObject({ status: "kept", subNiche: "dark-psychology", subNicheConfidence: 0.6 });
    expect(gateCreator({ videos: videos(20, 20, "Mental health check in") }, options).subNiche).toBe("general");
  });
});

describe("size-band quotas", () => {
  test("bands follow the dataset spec and quotas split the target evenly", () => {
    expect([999, 9_999, 10_000, 99_999, 100_000, 999_999, 1_000_000].map(quotaBandFor)).toEqual(["lt10k", "lt10k", "10k-100k", "10k-100k", "100k-1m", "100k-1m", "1m-plus"]);
    const status = quotaStatus([500, 2_000, 50_000, 2_000_000, 3_000_000, 4_000_000, null], 20);
    expect(status).toEqual([
      { band: "lt10k", quota: 5, kept: 2, deficit: 3 },
      { band: "10k-100k", quota: 5, kept: 1, deficit: 4 },
      { band: "100k-1m", quota: 5, kept: 0, deficit: 5 },
      { band: "1m-plus", quota: 5, kept: 3, deficit: 2 },
    ]);
  });

  test("candidates in the most under-filled bands are listed first; filled bands last", () => {
    const status = quotaStatus([...Array(5).fill(5_000_000), 500], 20);
    const ordered = prioritizeByQuota([
      { id: "mega", followers: 9_000_000 },
      { id: "unknown", followers: null },
      { id: "mid", followers: 200_000 },
      { id: "nano", followers: 3_000 },
    ], status);
    expect(ordered.map((item) => item.id)).toEqual(["mid", "nano", "unknown", "mega"]);
  });
});

describe("snowball stop rule", () => {
  const base = { round: 1, maxRounds: 4, keptBefore: 100, keptAfter: 104, target: 300, elapsedMs: 60_000, budgetMs: 45 * 60_000, nextSeeds: 10 };
  test("stops when a round adds under 5% new relevant creators", () => {
    expect(snowballDecision(base)).toEqual({ stop: true, reason: "growth-below-5pct" });
    expect(snowballDecision({ ...base, keptAfter: 105 })).toEqual({ stop: false, reason: "continue" });
  });
  test("the seed round never stops on growth; target, budget, rounds, and seeds stop it", () => {
    expect(snowballDecision({ ...base, round: 0, keptBefore: 0, keptAfter: 0 })).toEqual({ stop: false, reason: "continue" });
    expect(snowballDecision({ ...base, keptAfter: 300 })).toEqual({ stop: true, reason: "target-reached" });
    expect(snowballDecision({ ...base, keptAfter: 200, elapsedMs: 46 * 60_000 })).toEqual({ stop: true, reason: "time-budget" });
    expect(snowballDecision({ ...base, keptAfter: 200, round: 4 })).toEqual({ stop: true, reason: "max-rounds" });
    expect(snowballDecision({ ...base, keptAfter: 200, nextSeeds: 0 })).toEqual({ stop: true, reason: "no-expansion-seeds" });
  });

  test("co-hashtag expansion keeps on-topic tags used by two or more kept creators", () => {
    const tags = expansionHashtags(
      [["anxietyrelief", "fyp", "psychology"], ["anxietyrelief", "travel"], ["travel", "fyp"], ["narcissisticabuse", "anxietyrelief"]],
      new Set(["psychology"]),
      ["anxiety", "narcissis*"],
      { limit: 5 },
    );
    expect(tags).toEqual(["anxietyrelief"]);
  });
});

describe("negative control group", () => {
  const now = Date.UTC(2026, 9, 28);
  const series = (fromDays: number, growth: number) => [{ asOf: now - fromDays * DAY, followers: 10_000 }, { asOf: now, followers: Math.round(10_000 * (1 + growth)) }];
  const posts = (count: number, below: boolean, multiplier = 0.6): PerformanceVideo[] =>
    Array.from({ length: count }, (_, index) => ({ postedAt: now - (index + 1) * 2 * DAY, multiplier, label: "normal", belowCohort: below }));

  test("frequent, persistently below, no near-miss, flat growth is eligible (provisional without 60 days of history)", () => {
    const verdict = negativeEligibility({ creatorId: "a", quotaBand: "10k-100k", videos: posts(20, true), followerSeries: series(1, 0) }, now);
    expect(verdict).toMatchObject({ eligible: true, provisional: true, belowShare: 1, posts30d: 15 });
    expect(negativeEligibility({ creatorId: "a", quotaBand: "10k-100k", videos: posts(25, true), followerSeries: series(60, 0.01) }, now)).toMatchObject({ eligible: true, provisional: false });
  });

  test("rare posters, near-misses, above-cohort creators, and growing creators are not eligible", () => {
    const sparse = posts(3, true);
    expect(negativeEligibility({ creatorId: "a", quotaBand: "lt10k", videos: sparse, followerSeries: [] }, now).reasons).toContain("posts-30d-3");
    const nearMiss = [...posts(20, true), { postedAt: now - 5 * DAY, multiplier: 3.2, label: "strong", belowCohort: true }];
    expect(negativeEligibility({ creatorId: "a", quotaBand: "lt10k", videos: nearMiss, followerSeries: [] }, now).reasons).toContain("has-breakout-or-near-miss");
    const mixed = [...posts(10, true), ...posts(10, false)];
    expect(negativeEligibility({ creatorId: "a", quotaBand: "lt10k", videos: mixed, followerSeries: [] }, now).reasons).toContain("not-persistently-below");
    expect(negativeEligibility({ creatorId: "a", quotaBand: "lt10k", videos: posts(20, true), followerSeries: series(30, 0.2) }, now).reasons).toContain("follower-growth");
    expect(DEFAULT_NEGATIVE_RULES.persistentShare).toBe(0.75);
  });

  test("selection is size-matched to the kept distribution and takes the most persistently below first", () => {
    const kept = new Map([["lt10k", 40], ["10k-100k", 40], ["100k-1m", 20]] as const);
    const eligible = [
      ...Array.from({ length: 10 }, (_, i) => ({ creatorId: `s${i}`, quotaBand: "lt10k" as const, belowShare: 0.8 + i / 100 })),
      ...Array.from({ length: 2 }, (_, i) => ({ creatorId: `m${i}`, quotaBand: "10k-100k" as const, belowShare: 0.9 })),
      ...Array.from({ length: 10 }, (_, i) => ({ creatorId: `l${i}`, quotaBand: "100k-1m" as const, belowShare: 0.85 })),
    ];
    const result = selectNegativeGroup(eligible, kept, 0.2);
    expect(result.target).toBe(20);
    expect(result.byBand).toMatchObject({ lt10k: { target: 8, selected: 8 }, "10k-100k": { target: 8, selected: 2 }, "100k-1m": { target: 4, selected: 4 } });
    expect(result.selected.slice(0, 2)).toEqual(["s9", "s8"]);
  });
});

describe("anomaly flags", () => {
  test("engagement-ratio outliers and impossible ratios are flagged", () => {
    const creators = Array.from({ length: 30 }, (_, i) => ({ creatorId: `c${i}`, medianRate: 0.05 + (i % 5) * 0.002, impossibleShare: 0 }));
    creators.push({ creatorId: "bought", medianRate: 0.0004, impossibleShare: 0 });
    creators.push({ creatorId: "weird", medianRate: 0.05, impossibleShare: 0.4 });
    expect([...engagementAnomalies(creators)].sort()).toEqual(["bought", "weird"]);
  });

  test("duplicate captions across creators and compilation names mark repost pages", () => {
    const shares = duplicateCaptionShares(new Map([
      ["repost", ["Why narcissists always come back after silence", "Signs your nervous system is stuck in survival", "A completely original caption about boundaries here"]],
      ["origin", ["Why narcissists always come back after silence", "Signs your nervous system is stuck in survival"]],
      ["other", ["Something else entirely that nobody copied today"]],
    ]));
    expect(shares.get("repost")).toEqual({ share: 0.667, considered: 3 });
    expect(shares.get("other")).toEqual({ share: 0, considered: 1 });
    expect(compilationName("drk_clips", null)).toBe(true);
    expect(compilationName("calm.mind", "Calm Mind Therapy")).toBe(false);
  });
});

describe("copyability ranking", () => {
  const video = (overrides: Partial<CopyCandidate>): CopyCandidate => ({
    videoId: "v", creatorId: "c", multiplier: 2, views: 100_000, followers: 50_000, sizeBand: "micro", format: null, hook: null, ...overrides,
  });

  test("a micro creator's 20x breakout at 500k outranks a mega creator's 1.5x at 5M; a 3x jump below the noise floor is excluded", () => {
    const { ranked, excluded } = rankCopyability([
      video({ videoId: "mega", creatorId: "m", multiplier: 1.5, views: 5_000_000, followers: 3_000_000, sizeBand: "mega" }),
      video({ videoId: "micro", creatorId: "u", multiplier: 20, views: 500_000, followers: 40_000, sizeBand: "micro" }),
      video({ videoId: "tiny", creatorId: "t", multiplier: 3, views: 900, followers: 300, sizeBand: "seed" }),
    ]);
    expect(ranked.map((entry) => entry.candidate.videoId)).toEqual(["micro", "mega"]);
    expect(excluded).toEqual([{ videoId: "tiny", reason: "noise-floor" }]);
    const micro = ranked[0]!.components;
    expect(micro).toMatchObject({ multiplier: 20, views: 500_000, followers: 40_000, viewsPerFollower: 12.5, sizeBand: "micro", sizeWeight: 0.85, replicationFactor: 1, noiseFloorViews: 50_000 });
    expect(micro.lnMultiplier).toBeCloseTo(Math.log(20), 3);
    expect(micro.reachTerm).toBeCloseTo(0.5 * Math.log1p(12.5), 3);
    expect(ranked[0]!.score).toBeCloseTo(0.85 * (Math.log(20) + 0.5 * Math.log1p(12.5)), 3);
    expect(ranked[1]!.components.sizeWeight).toBe(0.3);
  });

  test("a format replicated by two unrelated small creators ranks above a single outlier", () => {
    const { ranked } = rankCopyability([
      video({ videoId: "single", creatorId: "a", multiplier: 6, views: 200_000, followers: 20_000, sizeBand: "micro", format: "skit" }),
      video({ videoId: "rep1", creatorId: "b", multiplier: 5, views: 200_000, followers: 20_000, sizeBand: "micro", format: "listicle" }),
      video({ videoId: "rep2", creatorId: "c", multiplier: 4, views: 150_000, followers: 8_000, sizeBand: "nano", format: "listicle" }),
    ]);
    expect(ranked.map((entry) => entry.candidate.videoId)).toEqual(["rep2", "rep1", "single"]);
    const rep1 = ranked.find((entry) => entry.candidate.videoId === "rep1")!;
    expect(rep1.components.replication.format).toEqual({ label: "listicle", smallCreators: 2 });
    expect(rep1.components.replicationFactor).toBe(1.2);
    expect(ranked.find((entry) => entry.candidate.videoId === "single")!.components.replicationFactor).toBe(1);
  });

  test("thin baselines, provisional ages, and videos at or below baseline are excluded with a reason", () => {
    const { excluded } = rankCopyability([
      video({ videoId: "thin", thin: true }),
      video({ videoId: "young", provisional: true }),
      video({ videoId: "flat", multiplier: 0.9 }),
      video({ videoId: "none", multiplier: null }),
    ]);
    expect(excluded.map((entry) => entry.reason)).toEqual(["thin-baseline", "provisional", "not-above-baseline", "unscored"]);
  });
});

describe("percentile label thresholds", () => {
  test("quantiles interpolate; percentiles parse in descending order only", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(parseLabelPercentiles("0.98,0.95,0.85")).toEqual({ breakout: 0.98, outlier: 0.95, strong: 0.85 });
    expect(parseLabelPercentiles("0.85,0.95,0.98")).toBeNull();
  });

  // 1,000 multipliers: 1.0 .. 100.9 in 0.1 steps (heavy enough for percentile cuts above the floors).
  const heavy = Array.from({ length: 1_000 }, (_, i) => 1 + i / 10);

  test("per platform x niche cuts with the fixed multipliers as floors, platform fallback, then fixed", () => {
    const samples = [
      ...heavy.map((multiplier) => ({ platform: "tiktok", niche: "psychology", multiplier })),
      ...Array.from({ length: 50 }, () => ({ platform: "tiktok", niche: "food", multiplier: 1 })),
      ...Array.from({ length: 300 }, () => ({ platform: "youtube", niche: "finance", multiplier: 1.2 })),
    ];
    const lookup = calibrateLabelThresholds(samples, { mode: "percentile", percentiles: { breakout: 0.98, outlier: 0.95, strong: 0.85 }, minSample: 200 });
    const psych = lookup("tiktok", "psychology");
    expect(psych).toMatchObject({ basis: "percentile", n: 1_000 });
    expect(psych.breakout).toBeCloseTo(quantile(heavy, 0.98), 1);
    expect(psych.outlier).toBeCloseTo(quantile(heavy, 0.95), 1);
    expect(psych.strong).toBeCloseTo(quantile(heavy, 0.85), 1);
    expect(lookup("tiktok", "food")).toMatchObject({ basis: "platform-percentile", group: "tiktok|*" });
    // A flat distribution never labels ordinary videos: the floors hold.
    expect(lookup("youtube", "finance")).toMatchObject({ basis: "percentile", breakout: 10, outlier: 5, strong: 3 });
    expect(lookup("instagram", "x")).toMatchObject({ basis: "fixed", breakout: 10, outlier: 5, strong: 3 });
    const fixed = calibrateLabelThresholds(samples, { mode: "fixed", percentiles: { breakout: 0.98, outlier: 0.95, strong: 0.85 }, minSample: 200 });
    expect(fixed("tiktok", "psychology").basis).toBe("fixed");
    const override = calibrateLabelThresholds(samples, { mode: "percentile", percentiles: { breakout: 0.98, outlier: 0.95, strong: 0.85 }, minSample: 200, overrides: { psychology: { breakout: 0.995, outlier: 0.99, strong: 0.9 } } });
    expect(override("tiktok", "psychology").breakout).toBeGreaterThan(psych.breakout);
  });

  test("labels follow the calibrated cuts; outlier still needs z >= 2", () => {
    const thresholds = { group: "g", basis: "percentile" as const, n: 1_000, breakout: 40, outlier: 20, strong: 6, outlierMinZ: 2, percentiles: null };
    const label = (viewsMultiplier: number, viewsZ = 3) => labelWithThresholds({ viewsMultiplier, viewsZ, thin: false, provisional: false }, thresholds);
    expect([label(50), label(25), label(25, 1), label(12), label(5), label(0.4)]).toEqual(["breakout", "outlier", "strong", "strong", "normal", "under"]);
    expect(labelWithThresholds({ viewsMultiplier: 50, viewsZ: 3, thin: true, provisional: false }, thresholds)).toBeNull();
  });

  test("relabeling a scored corpus puts about 2% at breakout and 5% at outlier or better", () => {
    const scores: Array<VideoScore & { cohortKey: string }> = heavy.map((multiplier, index) => ({
      videoId: `v${index}`, multiplier, z: Math.log(multiplier) / 0.5, composite: null, label: "normal", mode: "projected", flags: [], momentum: null, cohortKey: "tiktok|psychology|tiktok-video|16-30s|micro",
      detail: { ageHours: 400, baselineN: 30, cohortKey: "x", cohortLevel: 0, multipliers: {}, z: {}, engagement: {}, followerMultiplier: null, curve: { tauHours: 54, k: 1.15, basis: "prior" } },
    }));
    applyLabelThresholds(scores, { mode: "percentile", percentiles: { breakout: 0.98, outlier: 0.95, strong: 0.85 }, minSample: 200 });
    const share = (label: string) => scores.filter((score) => score.label === label).length / scores.length;
    expect(share("breakout")).toBeCloseTo(0.02, 2);
    expect(share("breakout") + share("outlier")).toBeCloseTo(0.05, 2);
    expect(share("breakout") + share("outlier") + share("strong")).toBeCloseTo(0.15, 2);
    expect(scores[999]!.detail!.labelThresholds).toMatchObject({ group: "tiktok|psychology", basis: "percentile" });
  });
});

describe("breaker classification", () => {
  test("age gates and private accounts fail alone instead of tripping the source; bot checks and login walls still block", async () => {
    const { classifyProbe } = await import("../../cli/lib/trends/breaker.js");
    expect(classifyProbe({ code: 1, entries: 0, stderr: "ERROR: [youtube] abc: Sign in to confirm your age. Use --cookies-from-browser or --cookies for the authentication." })).toMatchObject({ kind: "failed", reason: "age-restricted" });
    expect(classifyProbe({ code: 1, entries: 0, stderr: "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser" })).toMatchObject({ kind: "blocked", reason: "bot-check" });
    expect(classifyProbe({ code: 1, entries: 0, stderr: "ERROR: This user's account is likely either private or all of their videos are private. Log into an account that has access. Use --cookies-from-browser or --cookies for the authentication." })).toMatchObject({ kind: "failed", reason: "creator" });
    expect(classifyProbe({ code: 1, entries: 0, stderr: "ERROR: [tiktok:user] Log in to view this page. Use --cookies" })).toMatchObject({ kind: "blocked", reason: "login-wall" });
  });
});

describe("analysis sample cap", () => {
  test("caps per language at the limit, stratified by quota band, TikTok and relevance first", async () => {
    const { selectAnalysisSample } = await import("../../cli/lib/trends/niche.js");
    const members = [
      ...Array.from({ length: 10 }, (_, i) => ({ creatorId: `s${i}`, followers: 5_000, platform: i < 2 ? "tiktok" : "youtube", relevance: 0.6 + i / 100 })),
      ...Array.from({ length: 10 }, (_, i) => ({ creatorId: `m${i}`, followers: 50_000, platform: "youtube", relevance: 0.7 })),
      ...Array.from({ length: 1 }, (_, i) => ({ creatorId: `l${i}`, followers: 500_000, platform: "youtube", relevance: 0.7 })),
    ];
    const sample = selectAnalysisSample(members, 8);
    expect(sample.size).toBe(8);
    expect(sample.has("l0")).toBe(true);
    expect(sample.has("s0") && sample.has("s1")).toBe(true);
    expect([...sample].filter((id) => id.startsWith("s")).length).toBeGreaterThanOrEqual(2);
    expect(selectAnalysisSample(members, 100).size).toBe(21);
  });
});
