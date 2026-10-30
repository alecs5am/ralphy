import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SERIES_OPTIONS,
  VISUAL_FORMATS,
  detectChannelSeries,
  formatStats,
  isVisualFormat,
  parseLabelWorksheet,
  parseSeriesMarkers,
  seriesFreshness,
  seriesLift,
  seriesStem,
  weakMarkerContext,
  weakMarkerKey,
  type SeriesVideo,
} from "../../cli/lib/trends/series.js";
import { digestTopSeries, postedAtFromMeta, type SeriesItem } from "../../cli/lib/trends/series-report.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 30, 12);

const kinds = (text: string) => parseSeriesMarkers(text).map((marker) => `${marker.kind}:${marker.n}${marker.of === null ? "" : `/${marker.of}`}`);
/** With weak markers, suffixed `~`. */
const weakKinds = (text: string) => parseSeriesMarkers(text, { weak: true }).map((marker) => `${marker.kind}:${marker.n}${marker.of === null ? "" : `/${marker.of}`}${marker.weak ? "~" : ""}`);

describe("series markers (English)", () => {
  test("part, episode, day, week, chapter, series, #N, and N/M markers", () => {
    expect(kinds("Things people with ADHD do despite knowing better. Part 65 #adhd")).toEqual(["part:65"]);
    expect(kinds("HOW TO USE A TREADMILL PT 1")).toEqual(["part:1"]);
    expect(kinds("Apple Watch Apps PT #3 #AppleWatch")).toEqual(["part:3"]);
    expect(kinds("Building a startup pt. 3")).toEqual(["part:3"]);
    expect(kinds("EPISODE 4 - I'm a Narcissist")).toEqual(["episode:4"]);
    expect(kinds("PK Bola EP 5: Flexi Cap")).toEqual(["episode:5"]);
    expect(kinds("Daily quotes (day 006)")).toEqual(["day:6"]);
    expect(kinds("100 Day Body Transformation: Day 9 of 100")).toEqual(["day:9/100"]);
    expect(kinds("Rolling into Week 2 of our program")).toEqual(["week:2"]);
    expect(kinds("Lesson 4: compound interest")).toEqual(["chapter:4"]);
    expect(kinds("Kettlebell Workout Series 1/30 - Full Body")).toEqual(["series:1/30"]);
    expect(kinds("Grief Coping Skills #3 - Art Expression #grief")).toEqual(["number:3"]);
    expect(kinds("Calisthenics Level Up #1")).toEqual(["number:1"]);
    expect(kinds("7/65 Planet Fitness Workouts")).toEqual(["fraction:7/65"]);
  });

  test("real parts stay markers (#593 counter-examples)", () => {
    expect(kinds("Part 1/3")).toEqual(["part:1/3"]);
    expect(kinds("Upper body pt 2")).toEqual(["part:2"]);
    expect(kinds("Day 12 of 30")).toEqual(["day:12/30"]);
    expect(kinds("Crisis Files Ep. 4 | Dot-Com Bubble")).toEqual(["episode:4"]);
    expect(kinds("Episode 3")).toEqual(["episode:3"]);
    expect(kinds("Narcissist - what they say Vs what they mean (Part 2)")).toEqual(["part:2"]);
    expect(kinds("14/15 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e")).toEqual(["fraction:14/15"]);
  });

  test("ranks are never markers (#593)", () => {
    expect(kinds("The #1 Skill School Never Taught You")).toEqual([]);
    expect(kinds("Claude Cowork: The #1 Thing To Know")).toEqual([]);
    expect(kinds("Always my #1 supporter")).toEqual([]);
    expect(kinds("Netflix’s #1 series Reality Check")).toEqual([]);
    expect(kinds("4 Layers of SEO, Rank # 1")).toEqual([]);
    expect(kinds("Pakistan Ranks #1 in Solar Power Generation!")).toEqual([]);
    expect(weakKinds("The #1 Skill School Never Taught You")).toEqual([]);
  });

  test("ratings, stats, dates, a rank-shaped #N, and a bare 'series N' are weak (#593)", () => {
    for (const text of ["10/10 Habits That Build an Unshakeable Mind", "How to be a 10/10 Founder", "9/10 people don’t know this", "The Long Coat Trick (Tip 5/100)", "Crypto Market Update 10/28", "#1 Mistake Parents Make", "Habits For Good Mental Health #10 Daily Routines", "Apple Watch Series 11 VS Apple Watch SE 3 battery test"]) {
      expect(kinds(text)).toEqual([]);
      expect(parseSeriesMarkers(text, { weak: true }).map((marker) => marker.weak)).toEqual([true]);
    }
    expect(weakKinds("10/10 Habits That Build an Unshakeable Mind")).toEqual(["fraction:10/10~"]);
    expect(weakKinds("Crypto Market Update 10/28")).toEqual(["fraction:10/28~"]);
    // A zero-padded total is a date (Dec 26 to Jan 5).
    expect(weakKinds("12/26–1/05 Details in description")).toEqual(["fraction:12/26~", "fraction:1/5~"]);
    // Month/day/year never matches; the first strong marker stays strong next to a weak one.
    expect(weakKinds("Report 10/28/2026 and 10/28/26")).toEqual([]);
    expect(weakKinds("Step #1 & #2 In Stopping Rumination")).toEqual(["number:1", "number:2~"]);
    expect(weakMarkerKey({ kind: "fraction", of: 15 })).toBe("fraction/15");
    expect(weakMarkerKey({ kind: "number", of: null })).toBe("number");
  });

  test("hashtags with digits, 24/7, years, and plain numbers are not markers", () => {
    expect(kinds("Upload video soon #mercedes #g580 #4x4")).toEqual([]);
    expect(kinds("#batterylife #galaxywatch8 #applewatchseries10battery")).toEqual([]);
    expect(kinds("This AI tool runs my business 24/7")).toEqual([]);
    expect(kinds("Happy Father's Day 2025 #2024")).toEqual([]);
    expect(kinds("Stop stressing about step 100. One day at a time.")).toEqual([]);
    expect(kinds("Departure 2 and the apartment")).toEqual([]);
    expect(kinds(null as unknown as string)).toEqual([]);
  });
});

describe("series markers (Russian, escaped)", () => {
  const PART = "\u0427\u0430\u0441\u0442\u044c"; // "part", capitalized
  test("part with and without a space, with #, abbreviations, episode and day words", () => {
    expect(kinds(`\u041f\u0440\u0438\u044e\u0442\u0438\u043b\u0438 \u043a\u043e\u0442\u0430. ${PART} 1#\u0445\u043e\u0447\u0443\u0432\u0442\u043e\u043f`)).toEqual(["part:1"]);
    expect(kinds(`${PART}2 ${PART.toUpperCase()} 3`)).toEqual(["part:2", "part:3"]);
    expect(kinds("\u0447\u0430\u0441\u0442\u044c#2 \u0441\u043f\u043e\u0441\u043e\u0431#3")).toEqual(["part:2"]); // "#3" glued to a word is not a number marker
    expect(kinds("\u0447. 4")).toEqual(["part:4"]);
    expect(kinds("\u0441\u0435\u0440\u0438\u044f 3")).toEqual(["episode:3"]);
    expect(kinds("\u0432\u044b\u043f\u0443\u0441\u043a 12")).toEqual(["episode:12"]);
    expect(kinds("\u0434\u0435\u043d\u044c 5 \u0438\u0437 30")).toEqual(["day:5/30"]);
    // "5/15" has a date shape (May 15): weak until the channel has its other parts (see grouping).
    expect(kinds("5/15 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e")).toEqual([]);
    expect(weakKinds("5/15 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e")).toEqual(["fraction:5/15~"]);
  });

  test("a word that only contains a marker word is not a marker", () => {
    expect(kinds("\u0441\u0447\u0430\u0441\u0442\u044c\u04355")).toEqual([]);
  });
});

describe("series stems", () => {
  test("drop markers, hashtags, punctuation, and digits; keep the first words", () => {
    expect(seriesStem("Things people with ADHD do despite knowing better. Part 65 #adhd")).toBe("things people with");
    expect(seriesStem("EPISODE 4 - I’m a Narcissist - How I treat my wife")).toBe("i m a");
    // A bare "Series 11" is weak: kept in the stem unless the channel context promotes it.
    expect(seriesStem("Apple Watch Series 11 VS Apple Watch SE 3 battery test")).toBe("apple watch series");
    expect(seriesStem("Apple Watch Series 11 VS Apple Watch SE 3 battery test", parseSeriesMarkers("Apple Watch Series 11 VS Apple Watch SE 3 battery test", { weak: true }))).toBe("apple watch vs");
    expect(seriesStem("100 Day Body Transformation: Day 9")).toBe("day body transformation");
    expect(seriesStem("Harry Potter economics (part 2)")).toBe("harry potter economics");
    expect(seriesStem("Bluey Economics (part 1)")).toBe("bluey economics");
    expect(seriesStem("Part 3")).toBe("");
    expect(seriesStem("MHAW2026 Ermias's story part 2", undefined, 2)).toBe("mhaw ermias");
    expect(seriesStem("\u041f\u0440\u0438\u044e\u0442\u0438\u043b\u0438 \u043a\u043e\u0442\u0430. \u0427\u0430\u0441\u0442\u044c 5#\u043a\u043e\u0442")).toBe("\u043f\u0440\u0438\u044e\u0442\u0438\u043b\u0438 \u043a\u043e\u0442\u0430");
  });
});

let seq = 0;
const video = (text: string | null, views: number | null, over: Partial<SeriesVideo> = {}): SeriesVideo => ({ id: `v${++seq}`, text, views, multiplier: null, postedAt: null, ...over });
const others = (count: number, views = 1_000, over: Partial<SeriesVideo> = {}) => Array.from({ length: count }, (_, index) => video(`Unrelated video number ${index}`, views, over));

describe("series grouping", () => {
  test("a stem group with the minimum parts is a series; the baseline is the unmarked videos only", () => {
    const result = detectChannelSeries([
      video("Money myths part 1", 10_000),
      video("Money myths part 2", 30_000),
      video("Money myths part 3", 20_000),
      video("Tax tips #1", 500_000),
      ...others(6, 1_000),
    ]);
    expect(result.reason).toBe("ok");
    expect(result.marked).toBe(4);
    expect(result.other).toBe(6);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]).toMatchObject({ stem: "money myths", grouping: "stem", parts: 3, partNumbers: [1, 2, 3], markerKinds: ["part"], seriesMedianViews: 20_000, otherMedianViews: 1_000, lift: 20, primary: true });
  });

  test("below the minimum parts no series; a thin baseline is reported", () => {
    expect(detectChannelSeries([video("Myths part 1", 1), video("Myths part 2", 1), ...others(10)]).reason).toBe("no-series");
    expect(detectChannelSeries([video("Myths part 1", 1), video("Myths part 2", 1), video("Myths part 3", 1), ...others(4)]).reason).toBe("thin-baseline");
    expect(detectChannelSeries([video("Myths part 1", 1), video("Myths part 2", 1), video("Myths part 3", 1), ...others(2)], { minOther: 2 }).series).toHaveLength(1);
    expect(detectChannelSeries([video("Myths part 1", 1), video("Myths part 2", 1), ...others(10)], { minParts: 2 }).series).toHaveLength(1);
  });

  test("marked videos with no repeating stem form one numbered set", () => {
    const result = detectChannelSeries([video("How to use a squat rack Pt 1", 144_000), video("Beginner's guide | treadmill PT 2", 304_000), video("No gym needed Pt 3", 3_900), ...others(8, 7_400)]);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]).toMatchObject({ key: "#numbered", grouping: "numbered-set", parts: 3, partNumbers: [1, 2, 3], stem: "no gym needed", lift: 144_000 / 7_400 });
  });

  test("a numbered set is one marker kind with minParts distinct part numbers (#593)", () => {
    // Three "Pt 1" videos, and parts 1, 2, 2 of three topics: too few part numbers.
    expect(detectChannelSeries([video("How to use a squat rack Pt 1", 1), video("Treadmill PT 1", 1), video("No gym needed Pt 1", 1), ...others(8)]).reason).toBe("no-series");
    expect(detectChannelSeries([video("this gym is playground themed - part 2", 529_226), video("What's the best way to learn an exercise? (part 1)", 40_000), video("Which Wild Pullup Bar is Best?  Part 2", 490_000), ...others(8)]).series).toEqual([]);
    // Three kinds (episode, number, day) are not one set.
    expect(detectChannelSeries([video("How to Plan Your Calisthenics Workout | EP. 2", 1), video("What Is Calisthenics? | Calisthenics Level Up #1", 1), video("Day 1 vs Day 94 of Bulking", 1), ...others(8)]).series).toEqual([]);
    // The largest qualifying kind wins; the stray other-kind part is neither in the set nor in the baseline.
    const mixed = detectChannelSeries([video("Day 3 home workout", 10), video("Day 4 fat loss", 10), video("Day 5 belly burn", 10), video("Q&A part 2", 999), ...others(6, 1)]);
    expect(mixed.series[0]).toMatchObject({ grouping: "numbered-set", parts: 3, partNumbers: [3, 4, 5], markerKinds: ["day"], other: 6 });
  });

  test("the 2026-10-30 fake series are gone: a rating, a rank, and one real part (#593)", () => {
    const abhasa = detectChannelSeries([video("10/10 Habits That Build an Unshakeable Mind", 109_983), video("The #1 Skill School Never Taught You", 120_000), video("Narcissist - what they say Vs what they mean (Part 2)", 33_000), ...others(57, 65_000)]);
    expect(abhasa).toMatchObject({ marked: 1, other: 59, reason: "no-series", series: [] });
    const jayhoovy = detectChannelSeries([video("How to be a 10/10 Founder", 7_087), video("Day in the life filming a TV show for Founders (Day 1 of 14)", 2_800), video("Everything I Learned At Goldman Sachs | Lesson 6", 15_000), ...others(57, 3_600)]);
    expect(jayhoovy).toMatchObject({ marked: 2, reason: "no-series", series: [] });
    const ranks = detectChannelSeries([video("The #1 Skill for Combining Claude Code + Codex", 11_357), video("The #1 Claude skill for design just got upgraded", 16_000), video("The #1 Trending Github Repo", 30_000), ...others(8)]);
    expect(ranks).toMatchObject({ marked: 0, reason: "no-series" });
  });

  test("weak markers count with channel context: an episode list, one total, several 'series N' (#593)", () => {
    const habits = detectChannelSeries([video("Habits For Good Mental Health #10 Daily Routines", 50), video("Habits For Good Mental Health #2 Good Sleep", 50), video("Habits For Good Mental Health #3 Healthy Eating", 50), ...others(5, 10)]);
    expect(habits.series[0]).toMatchObject({ stem: "habits for good", grouping: "stem", partNumbers: [2, 3, 10], markerKinds: ["number"], lift: 5 });
    const TIP = "\u0421\u043e\u0432\u0435\u0442 \u0434\u043d\u044f"; // "tip of the day"
    expect(detectChannelSeries([video(`#1 ${TIP}: a`, 1), video(`#2 ${TIP}: b`, 1), video(`#3 ${TIP}: c`, 1), ...others(5)]).series[0]).toMatchObject({ parts: 3, partNumbers: [1, 2, 3] });
    // 1/15 and 5/15 have a date shape; the channel's other parts over 15 make them parts.
    const QUALITY = "\u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e"; // "quality"
    expect(detectChannelSeries([video(`1/15 ${QUALITY}`, 1), video(`5/15 ${QUALITY}`, 1), video(`14/15 ${QUALITY}`, 1), ...others(5)]).series[0]).toMatchObject({ parts: 3, partNumbers: [1, 5, 14], markerKinds: ["fraction"] });
    expect(detectChannelSeries([video("Get Glass Skin (Tip 1/100)", 1), video("Hair Look Better! (Tip 2/100)", 1), video("The Long Coat Trick (Tip 5/100)", 1), ...others(5)]).series[0]).toMatchObject({ partNumbers: [1, 2, 5] });
    // Dates over different totals stay unmarked and join the baseline.
    expect(detectChannelSeries([video("Crypto Market Update 10/28", 1), video("Bitcoin Analysis 10/17", 1), video("Market Update 8/19", 1), ...others(5)])).toMatchObject({ marked: 0, other: 8, reason: "no-series" });
    // Apple Watch generations 10 and 11 are two numbers: not markers, so those videos are the baseline.
    const watch = detectChannelSeries([video("Apple Watch Series 11 VS Apple Watch SE 3", 27_000), video("Series 11 46mm vs 42mm", 51_000), video("Apple Watch Ultra 2 vs series 10", 193_000), video("Apple Watch Apps PT #3", 9_000), ...others(5)]);
    expect(watch).toMatchObject({ marked: 1, other: 8, reason: "no-series" });
    expect(detectChannelSeries([video("Kettle bells Series 1", 1), video("Kettle bells Series 2", 1), video("Kettle bells Series 3", 1), ...others(5)]).series[0]).toMatchObject({ stem: "kettle bells", markerKinds: ["series"] });
    expect([...weakMarkerContext(parseSeriesMarkers("#1 x; #2 y; #3 z; 10/10", { weak: true }), 3)]).toEqual(["number"]);
  });

  test("several stem series; the largest is primary, the first seen wins a tie", () => {
    const result = detectChannelSeries([
      video("Bluey economics (part 1)", 5), video("Harry Potter economics (part 1)", 10), video("Bluey economics (part 2)", 5), video("Harry Potter economics (part 2)", 10),
      video("Bluey economics (part 3)", 5), video("Harry Potter economics (part 3)", 10), video("Marvel economics (part 1)", 99), ...others(5, 1),
    ]);
    expect(result.series.map((series) => [series.stem, series.parts, series.primary])).toEqual([["bluey economics", 3, true], ["harry potter economics", 3, false]]);
    const bigger = detectChannelSeries([video("A b c part 1", 1), video("X y z part 1", 1), video("X y z part 2", 1), video("X y z part 3", 1), video("A b c part 2", 1), video("A b c part 3", 1), video("X y z part 4", 1), ...others(5)]);
    expect(bigger.series.find((series) => series.primary)?.stem).toBe("x y z");
  });

  test("the newest part is the highest part number; dated parts win a tie", () => {
    const result = detectChannelSeries([video("Myths part 2", 1, { id: "p2" }), video("Myths part 3", 1, { id: "p3a" }), video("Myths part 3", 1, { id: "p3b", postedAt: NOW - DAY }), video("Myths part 1", 1, { id: "p1", postedAt: NOW - 400 * DAY }), ...others(5)]);
    expect(result.series[0]).toMatchObject({ newestPartId: "p3b", newestPartNumber: 3, newestPartPostedAt: NOW - DAY, latestPostedAt: NOW - DAY, datedPartsAny: 2 });
  });
});

describe("lift math", () => {
  test("median ratio; null on a missing or zero baseline", () => {
    expect(seriesLift([10, 20, 30], [1, 2, 3])).toEqual({ series: 20, other: 2, lift: 10 });
    expect(seriesLift([10, 20], [1, 2, 3, 4])).toEqual({ series: 15, other: 2.5, lift: 6 });
    expect(seriesLift([10, null], [null])).toEqual({ series: 10, other: null, lift: null });
    expect(seriesLift([10], [0, 0, 0]).lift).toBeNull();
  });

  test("multiplier lift only where both sides are dated and scored", () => {
    const dated = detectChannelSeries([
      video("Myths part 1", 9_000, { multiplier: 4 }), video("Myths part 2", 9_000, { multiplier: 6 }), video("Myths part 3", 9_000),
      ...others(3, 1_000, { multiplier: 1 }), ...others(3, 1_000),
    ]);
    expect(dated.series[0]).toMatchObject({ datedParts: 2, datedOther: 3, seriesMedianMultiplier: 5, otherMedianMultiplier: 1, multiplierLift: 5, lift: 9 });
    const undated = detectChannelSeries([video("Myths part 1", 9_000, { multiplier: 4 }), video("Myths part 2", 9_000), video("Myths part 3", 9_000), ...others(6, 1_000, { multiplier: 1 })]);
    expect(undated.series[0]!.multiplierLift).toBeNull();
  });
});

describe("freshness (a reference needs a part posted within 90 days)", () => {
  const base = { parts: 3, datedPartsAny: 1, newestPartPostedAt: null as number | null, latestPostedAt: null as number | null };
  test("fresh, stale, unknown", () => {
    expect(seriesFreshness({ ...base, latestPostedAt: NOW - 10 * DAY }, NOW)).toEqual({ freshness: "fresh", postedAt: NOW - 10 * DAY, ageDays: 10 });
    expect(seriesFreshness({ ...base, latestPostedAt: NOW - 106 * DAY, newestPartPostedAt: NOW - 106 * DAY }, NOW).freshness).toBe("stale");
    expect(seriesFreshness({ ...base, datedPartsAny: 3, latestPostedAt: NOW - 200 * DAY }, NOW).freshness).toBe("stale");
    // An old dated part but an undated newest part: the newest could be fresh.
    expect(seriesFreshness({ ...base, latestPostedAt: NOW - 200 * DAY }, NOW).freshness).toBe("unknown");
    expect(seriesFreshness({ ...base, datedPartsAny: 0 }, NOW)).toEqual({ freshness: "unknown", postedAt: null, ageDays: null });
    expect(seriesFreshness({ ...base, latestPostedAt: NOW - 100 * DAY, newestPartPostedAt: NOW - 100 * DAY }, NOW, 120).freshness).toBe("fresh");
  });
});

describe("visual format taxonomy and label import", () => {
  test("fixed taxonomy", () => {
    expect(VISUAL_FORMATS).toHaveLength(11);
    expect(VISUAL_FORMATS.at(-1)).toBe("other");
    for (const format of ["text-over-action", "structured-talking-head", "podcast-clip", "split-screen-reaction", "illustrated-explainer", "product-test-template", "ui-motion-graphics", "on-location-try-it", "in-character-monologue", "multi-character-skit"]) {
      expect(isVisualFormat(format)).toBe(true);
    }
    expect(isVisualFormat("talking-head")).toBe(false);
    expect(isVisualFormat(null)).toBe(false);
  });

  test("worksheet items become vision-agent labels; unlabeled items are skipped", () => {
    const parsed = parseLabelWorksheet({
      kind: "trend-format-worksheet",
      items: [
        { videoId: "tvideo_1", niche: "fitness", seriesKey: "c:how to use", url: "https://www.youtube.com/shorts/x", format: "text-over-action", confidence: 0.8, notes: " Big title over a full-body shot ", sheets: ["/a/sheet-01.jpg"] },
        { videoId: "tvideo_2", format: null, confidence: null },
      ],
    }, NOW);
    expect(parsed.errors).toEqual([]);
    expect(parsed.skipped).toBe(1);
    expect(parsed.labels).toEqual([{ videoId: "tvideo_1", format: "text-over-action", confidence: 0.8, method: "vision-agent", taxonomyVersion: 1, niche: "fitness", seriesKey: "c:how to use", url: "https://www.youtube.com/shorts/x", sheets: ["/a/sheet-01.jpg"], notes: "Big title over a full-body shot", labeledAt: new Date(NOW).toISOString() }]);
    expect(parseLabelWorksheet([{ videoId: "v", format: "podcast-clip", confidence: 1 }], NOW).labels).toHaveLength(1);
  });

  test("unknown formats, bad confidence, and missing ids are errors", () => {
    const parsed = parseLabelWorksheet({ items: [{ videoId: "a", format: "vlog", confidence: 0.5 }, { videoId: "b", format: "other", confidence: 1.5 }, { videoId: "c", format: "other" }, { format: "other", confidence: 0.5 }, "x"] }, NOW);
    expect(parsed.labels).toEqual([]);
    expect(parsed.errors).toHaveLength(5);
    expect(parsed.errors[0]).toContain("not in the taxonomy");
    expect(parseLabelWorksheet({ nope: true }, NOW).errors[0]).toContain("expected a worksheet");
  });
});

describe("format-level stats", () => {
  test("per niche and format: series, channels, median lift, best example", () => {
    const row = (niche: string, creatorId: string, lift: number, format: "text-over-action" | "podcast-clip") => ({ niche, channel: `@${creatorId}`, creatorId, lift, parts: 3, url: `https://x/${creatorId}/${lift}`, format, confidence: 0.8, postedAt: "2026-10-20T00:00:00.000Z", ageDays: 10 });
    const stats = formatStats([row("fitness", "a", 2, "text-over-action"), row("fitness", "a", 6, "text-over-action"), row("fitness", "b", 4, "text-over-action"), row("fitness", "c", 3, "podcast-clip"), row("psychology", "d", 5, "podcast-clip")]);
    expect(stats.map((stat) => [stat.niche, stat.format, stat.series, stat.channels, stat.medianLift, stat.bestExample?.channel, stat.bestExample?.lift])).toEqual([
      ["fitness", "text-over-action", 3, 2, 4, "@a", 6],
      ["fitness", "podcast-clip", 1, 1, 3, "@c", 3],
      ["psychology", "podcast-clip", 1, 1, 5, "@d", 5],
    ]);
    expect(stats[0]!.bestExample).toMatchObject({ postedAt: "2026-10-20T00:00:00.000Z", ageDays: 10 });
  });
});

// ─── Acceptance: the 8 series of docs/research/series-formats-2026-10-30.md ──

type FixtureChannel = { niche: string; channel: string; platform: string; videos: SeriesVideo[] };
const FIXTURE = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "..", "fixtures", "trends-series-research.json"), "utf8")) as FixtureChannel[];

/** Research doc rows: parts, median views (series vs other), lift as printed, and the post date of the digested part (owner correction). */
const RESEARCH: Record<string, { parts: number; series: number; other: number; lift: number; digits: number; posted: string; fresh: boolean }> = {
  "@MarketPowerYT": { parts: 4, series: 1_550_000, other: 25_000, lift: 62, digits: 0, posted: "2025-05-18", fresh: false },
  // #593: "What is the #1 rule in the stock market?" is a rank, so it joins the baseline (1,850 -> 1,800; the lift still prints 9x).
  "@StrategicWealthDesigners": { parts: 3, series: 17_000, other: 1_800, lift: 9, digits: 0, posted: "2022-11-16", fresh: false },
  "@lifeactuator": { parts: 22, series: 88_000, other: 19_000, lift: 4.6, digits: 1, posted: "2026-10-23", fresh: true },
  "@brandonclearminds": { parts: 4, series: 13_500, other: 3_300, lift: 4.1, digits: 1, posted: "2026-07-16", fresh: false },
};

/** Manual-pass rows that #593 retires: the caption reason they are not a numbered series. */
const RETIRED: Record<string, string> = {
  "@naomikong": "three 'Pt 1' videos: one part number",
  "@HybridCalisthenics": "parts 1, 2, 2 of three topics: two part numbers",
  "@HotshotTek": "'Series 11' / 'series 10' are Apple Watch generations (two numbers), leaving one 'PT #3'",
  "@JeffSu": "two of the four are ranks ('The #1 Thing To Know'), leaving Part 1 and Part 2",
};

describe("acceptance: the research doc's 8 series (4 detected with the same lift, 4 retired by #593)", () => {
  test("fixture holds all 8 channels", () => {
    expect(FIXTURE.map((channel) => channel.channel).sort()).toEqual([...Object.keys(RESEARCH), ...Object.keys(RETIRED)].sort());
  });

  for (const channel of FIXTURE.filter((entry) => RETIRED[entry.channel])) {
    test(`${channel.channel}: no series (${RETIRED[channel.channel]})`, () => {
      expect(detectChannelSeries(channel.videos, DEFAULT_SERIES_OPTIONS).series).toEqual([]);
    });
  }

  for (const channel of FIXTURE.filter((entry) => RESEARCH[entry.channel])) {
    const expected = RESEARCH[channel.channel]!;
    test(`${channel.channel}: ${expected.parts} parts at ${expected.lift}x`, () => {
      const result = detectChannelSeries(channel.videos, DEFAULT_SERIES_OPTIONS);
      const primary = result.series.find((series) => series.primary)!;
      expect(primary).toBeDefined();
      expect(primary.parts).toBe(expected.parts);
      expect(primary.seriesMedianViews).toBe(expected.series);
      expect(primary.otherMedianViews).toBe(expected.other);
      const factor = 10 ** expected.digits;
      expect(Math.round(primary.lift! * factor) / factor).toBe(expected.lift);

      // Freshness: date the newest part as the owner correction dated the digested part.
      const posted = Date.parse(`${expected.posted}T12:00:00Z`);
      const dated = channel.videos.map((entry) => (entry.id === primary.newestPartId && entry.postedAt === null ? { ...entry, postedAt: posted } : entry));
      const again = detectChannelSeries(dated).series.find((series) => series.primary)!;
      const fresh = seriesFreshness(again, NOW);
      expect(fresh.freshness).toBe(expected.fresh ? "fresh" : "stale");
      // Same lift after dating: dates never change the view comparison.
      expect(again.lift).toBe(primary.lift);
    });
  }
});

// ─── Digest worksheet (fake deps) ───────────────────────────────────────────

function item(rank: number, platform: "youtube" | "tiktok"): SeriesItem {
  const id = `tvideo_${rank}`;
  const series = detectChannelSeries([video("Myths part 1", 10), video("Myths part 2", 20), video("Myths part 3", 30, { id }), ...others(5, 5)]).series[0]!;
  const part = { videoId: id, platformVideoId: `p${rank}`, url: `https://example.test/${platform}/${rank}`, views: 30, postedAt: NOW - 3 * DAY, title: "Myths part 3" };
  return { niche: "fitness", creatorId: `c${rank}`, platform, channel: `@c${rank}`, language: "en", followers: null, sizeBand: null, seriesKey: `c${rank}:myths`, series, best: part, newest: part, freshness: "fresh", postedAt: NOW - 3 * DAY, ageDays: 3, label: null };
}

describe("series digest worksheet", () => {
  test("digests the newest part; a block stops that platform only; dates from yt-dlp metadata", async () => {
    const pulls: string[] = [];
    const sheet = await digestTopSeries({
      items: [item(1, "youtube"), item(2, "tiktok"), item(3, "tiktok"), item(4, "youtube")],
      k: 4,
      cacheDir: "/nonexistent/cache",
      everySec: 1,
      tilesPerSheet: 16,
      maxSheets: 2,
      now: NOW,
      deps: {
        allocate: async (base) => base,
        pull: async ({ url }) => {
          pulls.push(url);
          if (url.includes("/tiktok/")) throw new Error("yt-dlp metadata failed: ERROR: HTTP Error 403: Forbidden");
          return { videoPath: "/tmp/source.mp4", meta: { upload_date: "20261025" } };
        },
        digest: async ({ bundleDir }) => ({ bundleDir, sheets: [`${bundleDir}/sheet-01.jpg`] }),
      },
    });
    expect(pulls).toEqual(["https://example.test/youtube/1", "https://example.test/tiktok/2", "https://example.test/youtube/4"]);
    expect(sheet.items.map((entry) => entry.status)).toEqual(["ok", "blocked", "not-run", "ok"]);
    expect(sheet.stopped).toEqual([{ platform: "tiktok", reason: "forbidden", detail: expect.stringContaining("403"), atRank: 2 }]);
    expect(sheet.items[0]).toMatchObject({ videoId: "tvideo_1", partNumber: 3, postedAt: new Date(NOW - 3 * DAY).toISOString(), ageDays: 3, freshness: "fresh", sheets: [expect.stringContaining("sheet-01.jpg")] });
    expect(sheet.taxonomy.map((entry) => entry.format)).toEqual([...VISUAL_FORMATS]);
  });

  test("post time from yt-dlp metadata", () => {
    expect(postedAtFromMeta({ timestamp: 1_792_786_638 })).toBe(1_792_786_638_000);
    expect(postedAtFromMeta({ upload_date: "20261015" })).toBe(Date.UTC(2026, 9, 15, 12));
    expect(postedAtFromMeta({ upload_date: "2026-10-15" })).toBeNull();
    expect(postedAtFromMeta(null)).toBeNull();
  });
});
