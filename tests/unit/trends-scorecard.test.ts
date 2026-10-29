import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAX_AGE_DAYS,
  YOUTUBE_NEWEST_PER_CHANNEL,
  applyCollectionCutoff,
  clampWindowDays,
  freshnessOf,
  listingLimitFor,
  windowExclusion,
} from "../../cli/lib/trends/freshness.js";
import { buildScorecard, byVerdict, evidenceQuality, percentileRank, renderScorecardTable, verdictCounts, SCORECARD_RULES, type ScorecardInput } from "../../cli/lib/trends/scorecard.js";
import { DAY_MS } from "../../cli/lib/trends/math.js";

const NOW = Date.UTC(2026, 9, 30, 12);

describe("freshness window (#590)", () => {
  test("hot <= 30 d, fresh <= 90 d, stale older, unknown undated", () => {
    expect(DEFAULT_MAX_AGE_DAYS).toBe(90);
    expect(freshnessOf(NOW - 30 * DAY_MS, NOW)).toBe("hot");
    expect(freshnessOf(NOW - 31 * DAY_MS, NOW)).toBe("fresh");
    expect(freshnessOf(NOW - 90 * DAY_MS, NOW)).toBe("fresh");
    expect(freshnessOf(NOW - 91 * DAY_MS, NOW)).toBe("stale");
    expect(freshnessOf(null, NOW)).toBe("unknown");
    expect(freshnessOf(NOW - 20 * DAY_MS, NOW, 14)).toBe("stale");
  });

  test("the collection cutoff drops dated old videos and keeps undated ones for the freshness-unknown flag", () => {
    const videos = [{ postedAt: NOW - DAY_MS }, { postedAt: NOW - 120 * DAY_MS }, { postedAt: null }, { postedAt: Date.UTC(2023, 11, 1) }];
    const cut = applyCollectionCutoff(videos, { now: NOW, maxAgeDays: 90 });
    expect(cut).toMatchObject({ skippedOld: 2, undated: 1 });
    expect(cut.kept).toEqual([{ postedAt: NOW - DAY_MS }, { postedAt: null }]);
  });

  test("YouTube lists only its newest entries; analysis windows never pass the freshness window", () => {
    expect(listingLimitFor("youtube", 60)).toBe(YOUTUBE_NEWEST_PER_CHANNEL);
    expect(listingLimitFor("youtube", 12)).toBe(12);
    expect(listingLimitFor("tiktok", 60)).toBe(60);
    expect(clampWindowDays(365)).toEqual({ days: 90, clamped: true });
    expect(clampWindowDays(30)).toEqual({ days: 30, clamped: false });
    expect(windowExclusion([NOW - DAY_MS, NOW - 100 * DAY_MS, null, null], (value) => value, NOW)).toEqual({ maxAgeDays: 90, inWindow: 1, olderThanWindow: 1, undated: 2 });
  });
});

const base = (overrides: Partial<ScorecardInput> = {}): ScorecardInput => ({
  now: NOW,
  postedAt: NOW - 12 * DAY_MS,
  views: 400_000,
  viewsPrecision: "exact",
  multiplier: 8,
  multiplierPercentile: 0.97,
  baselineN: 24,
  thin: false,
  provisional: false,
  followers: 40_000,
  sizeBand: "micro",
  sponsored: false,
  visualFormat: { format: "text-over-action", confidence: 0.8 },
  captionLabel: "listicle",
  visualFormatCreators: 2,
  creatorRepeatHits: 0,
  series: null,
  transfer: null,
  noiseFloorViews: 50_000,
  ...overrides,
});

describe("adapt scorecard rules", () => {
  test("adapt when every adapt rule holds; reasons list the passing rules and the unchecked contrast", () => {
    const card = buildScorecard(base());
    expect(card).toMatchObject({
      verdict: "adapt",
      posted: { ageDays: 12, freshness: "hot" },
      multiplier: 8,
      nichePercentile: 0.97,
      viewsPerFollower: 10,
      creator: { followers: 40_000, sizeBand: "micro" },
      replication: { visualFormatCreators: 2, creatorRepeatHits: 0, seriesLift: null },
      evidence: { quality: "strong", baselineN: 24, dated: true, views: "exact" },
      transfer: "not-checked",
      sponsored: false,
    });
    expect(card.reasons.map((reason) => reason.split(":")[0])).toEqual(["A1 strong lift", "A2 evidence", "A3 replication", "A4 noise floor", "A5 reach beyond audience", "note"]);
    expect(card.checks).toHaveLength(10);
  });

  test("each skip rule fires on its own fact", () => {
    expect(buildScorecard(base({ postedAt: null })).reasons[0]).toMatch(/^K1 dated: freshness unknown/);
    const stale = buildScorecard(base({ postedAt: Date.UTC(2024, 4, 14, 12) }));
    expect(stale).toMatchObject({ verdict: "skip", posted: { freshness: "stale" } });
    expect(stale.reasons).toEqual([expect.stringMatching(/^K2 fresh: posted 2024-05-14, \d+ d > 90 d$/)]);
    expect(buildScorecard(base({ sponsored: true })).reasons).toEqual([expect.stringMatching(/^K3 not sponsored/)]);
    expect(buildScorecard(base({ transfer: "creator-bound" })).reasons).toEqual([expect.stringMatching(/^K4 not creator-bound/)]);
    expect(buildScorecard(base({ multiplier: 1.6 })).reasons).toEqual([expect.stringMatching(/^K5 lift: multiplier 1.6x/)]);
    for (const overrides of [{ postedAt: null }, { sponsored: true }, { transfer: "creator-bound" as const }, { multiplier: 1.2 }]) {
      expect(buildScorecard(base(overrides)).verdict).toBe("skip");
    }
  });

  test("test names each failing adapt rule", () => {
    const unlabeled = buildScorecard(base({ visualFormat: null, visualFormatCreators: null }));
    expect(unlabeled.verdict).toBe("test");
    expect(unlabeled.reasons[0]).toMatch(/^A3 replication: visual format not labeled; not part of a series; 0 other 3x\+ hit\(s\) by the same creator in the window \(needs 2\)$/);
    // Repeat hits on the same channel replicate the hit without a visual label.
    expect(buildScorecard(base({ visualFormat: null, visualFormatCreators: null, creatorRepeatHits: 3 })).verdict).toBe("adapt");
    // A thin-baseline multiplier is shown but decides nothing: alone it is no lift (skip); with a series lift it is weak evidence (test).
    const thin = buildScorecard(base({ thin: true, baselineN: 5 }));
    expect(thin).toMatchObject({ verdict: "skip", multiplier: 8, evidence: { quality: "weak" } });
    expect(thin.reasons[0]).toMatch(/^K5 lift: multiplier 8x \(thin baseline, not used\)/);
    const thinSeries = buildScorecard(base({ thin: true, baselineN: 5, series: { lift: 1.8, parts: 3, other: 2, partsInWindow: 1 } }));
    expect(thinSeries).toMatchObject({ verdict: "test", evidence: { quality: "weak" } });
    const lowPct = buildScorecard(base({ multiplier: 3.5, multiplierPercentile: 0.7 }));
    expect(lowPct.reasons[0]).toMatch(/^A1 strong lift: needs >= 3x at niche >= p90 \(has 3.5x, p70\)/);
    const floor = buildScorecard(base({ views: 20_000, followers: 4_000, sizeBand: "nano" }));
    expect(floor.reasons).toEqual([expect.stringMatching(/^A4 noise floor: 20000 views vs floor 50000/), expect.stringMatching(/^note/)]);
    const mega = buildScorecard(base({ followers: 2_000_000, sizeBand: "mega", views: 400_000 }));
    expect(mega.reasons[0]).toMatch(/^A5 reach beyond audience: mega account, 0.2 views per follower/);
    const nearMiss = buildScorecard(base({ multiplier: 2.5, multiplierPercentile: 0.8 }));
    expect(nearMiss.verdict).toBe("test");
  });

  test("a series row needs its own series lift even when the reference part broke out", () => {
    const card = buildScorecard(base({ kind: "series", multiplier: 13.6, multiplierPercentile: 0.92, series: { lift: 0.65, parts: 26, other: 34, partsInWindow: 26 } }));
    expect(card.verdict).toBe("skip");
    expect(card.reasons).toEqual([expect.stringMatching(/^K5 lift: series lift 0.65x over the channel's other videos/)]);
  });

  test("a series row adapts on its own lift without a creator multiplier (rounded YouTube views)", () => {
    const card = buildScorecard(base({ multiplier: null, multiplierPercentile: null, baselineN: null, viewsPrecision: "rounded", visualFormat: null, visualFormatCreators: null, series: { lift: 4.6, parts: 22, other: 40, partsInWindow: 9 }, followers: 60_000, views: 88_000 }));
    expect(card).toMatchObject({ verdict: "adapt", evidence: { quality: "ok", views: "rounded" }, replication: { seriesLift: 4.6, seriesParts: 22, seriesPartsInWindow: 9 } });
    const weakSeries = buildScorecard(base({ multiplier: null, multiplierPercentile: null, baselineN: null, viewsPrecision: "rounded", visualFormat: null, visualFormatCreators: null, series: { lift: 1.6, parts: 3, other: 6, partsInWindow: 1 } }));
    expect(weakSeries.verdict).toBe("test");
    expect(weakSeries.reasons[0]).toMatch(/^A1 strong lift/);
  });

  test("the verdict is reproducible from the row: same facts, same card", () => {
    const input = base({ multiplier: 4.2, multiplierPercentile: 0.93, visualFormatCreators: 0 });
    expect(buildScorecard(input)).toEqual(buildScorecard({ ...input }));
    expect(evidenceQuality({ postedAt: NOW, viewsPrecision: "exact", baselineN: 9, thin: false, provisional: false, multiplier: 3, series: null })).toBe("ok");
    expect(evidenceQuality({ postedAt: NOW, viewsPrecision: "exact", baselineN: 30, thin: false, provisional: true, multiplier: 3, series: null })).toBe("weak");
    expect(SCORECARD_RULES.length).toBeGreaterThanOrEqual(5);
  });

  test("percentile, ordering, counts, and the markdown table", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(0.75);
    expect(percentileRank([1, 2, 3, 4], 10)).toBe(1);
    expect(percentileRank([], 3)).toBeNull();
    expect(percentileRank([1, 2], null)).toBeNull();
    const cards = [buildScorecard(base({ sponsored: true })), buildScorecard(base({ visualFormat: null, visualFormatCreators: null })), buildScorecard(base())];
    expect(byVerdict(cards, (card) => card).map((card) => card.verdict)).toEqual(["adapt", "test", "skip"]);
    expect(verdictCounts([...cards, null])).toEqual({ adapt: 1, test: 1, skip: 1 });
    const markdown = renderScorecardTable(cards.map((card, index) => ({ label: `tiktok:@creator${index}`, url: `https://www.tiktok.com/@c/video/${index}`, card })));
    expect(markdown).toContain("| Posted (age d) |");
    expect(markdown).toContain("2026-10-18 (12)");
    expect(markdown).toContain("**adapt**");
    expect(markdown).not.toContain("undefined");
  });
});
