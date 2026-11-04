import { describe, expect, test } from "bun:test";
import { formatRows, pickVideos, readableReasons, risingSignals, thumbnailFor, topVideos } from "../../cli/lib/panel/trends.js";

describe("thumbnailFor", () => {
  test("derives a YouTube thumbnail from shorts, watch and youtu.be urls", () => {
    const expected = "https://i.ytimg.com/vi/abc123XYZ_-/hqdefault.jpg";
    expect(thumbnailFor("https://www.youtube.com/shorts/abc123XYZ_-")).toBe(expected);
    expect(thumbnailFor("https://www.youtube.com/watch?v=abc123XYZ_-")).toBe(expected);
    expect(thumbnailFor("https://youtu.be/abc123XYZ_-")).toBe(expected);
  });

  test("returns null for TikTok, Instagram and unrelated urls", () => {
    expect(thumbnailFor("https://www.tiktok.com/@someone/video/7811111111111111111")).toBeNull();
    expect(thumbnailFor("https://www.instagram.com/reel/Cabc123/")).toBeNull();
    expect(thumbnailFor("https://example.com/shorts/abc123XYZ")).toBeNull();
  });
});

describe("readableReasons", () => {
  const reasons = ["A1 strong lift: 12x creator median", "A2 evidence: ok", "note: x", "B10 third reason", "C3 fourth reason"];

  test("drops rule-code prefixes and note: lines", () => {
    expect(readableReasons(reasons)).toEqual(["strong lift: 12x creator median", "evidence: ok", "third reason"]);
  });

  test("respects the limit and defaults to three", () => {
    expect(readableReasons(reasons, 1)).toEqual(["strong lift: 12x creator median"]);
    expect(readableReasons(reasons)).toHaveLength(3);
  });

  test("tolerates non-arrays and non-string entries", () => {
    expect(readableReasons(undefined)).toEqual([]);
    expect(readableReasons("A1 x")).toEqual([]);
    expect(readableReasons([1, null, "A1 ok"])).toEqual(["ok"]);
  });
});

describe("topVideos", () => {
  test("normalizes rows of `trends top`", () => {
    const [youtube, tiktok] = topVideos({
      videos: [
        { id: "tvideo_1", url: "https://www.youtube.com/shorts/abc123XYZ", title: "Why anxiety spikes", creator: "@psychA", followers: 4000, platform: "youtube", views: 900000, multiplier: 12.5, label: "breakout", ageDays: 3, postedAt: "2026-10-01T00:00:00.000Z", cohort: { language: "en", format: "talking-head" } },
        { url: "https://www.tiktok.com/@x/video/1", views: "many", cohort: {} },
      ],
    });
    expect(youtube).toMatchObject({
      id: "tvideo_1", title: "Why anxiety spikes", creator: "@psychA", followers: 4000, platform: "youtube", views: 900000,
      multiplier: 12.5, label: "breakout", ageDays: 3, lang: "en", format: "talking-head",
      thumb: "https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg", reasons: [], signal: null,
    });
    expect(tiktok).toMatchObject({ id: null, title: null, thumb: null, views: null, lang: null, format: null });
  });

  test("returns an empty list when the report has no videos array", () => {
    expect(topVideos({})).toEqual([]);
    expect(topVideos({ videos: "nope" })).toEqual([]);
  });
});

describe("pickVideos", () => {
  test("reads whatToCopy items with readable reasons", () => {
    const [pick] = pickVideos({
      whatToCopy: {
        items: [{
          url: "https://youtu.be/abc123XYZ", creator: "@a", followers: 10, platform: "youtube", views: 100, multiplier: 12, label: "outlier",
          verdict: "copy", ageDays: 2, postedAt: "2026-10-02T00:00:00.000Z", format: "pov", subNiche: "anxiety",
          scorecard: { reasons: ["A1 strong lift: 12x creator median", "A2 evidence: ok", "note: x"] },
        }],
      },
    });
    expect(pick).toMatchObject({ verdict: "copy", format: "pov", subNiche: "anxiety", thumb: "https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg" });
    expect(pick!.reasons).toEqual(["strong lift: 12x creator median", "evidence: ok"]);
  });

  test("returns [] without a whatToCopy list", () => {
    expect(pickVideos({})).toEqual([]);
    expect(pickVideos({ whatToCopy: {} })).toEqual([]);
  });
});

describe("formatRows", () => {
  const report = {
    entryFormats: {
      rows: [
        { axis: "format", label: "pov", n: 10, creators: 6, hitRate: 0.6, lift: 2.7, verdict: "over" },
        { axis: "hook", label: "question", n: 5, creators: 3, hitRate: 0.1, lift: -0.1, verdict: "in line" },
        { axis: "format", label: "x", n: 2, creators: 1, hitRate: null, lift: null, verdict: "insufficient data" },
        { axis: "format", label: "list", n: 8, creators: 4, hitRate: 0.3, lift: 0.5, verdict: "in line" },
        { axis: "hook", label: "stat", n: 7, creators: 4, hitRate: 0.4, lift: 1.2, verdict: "over" },
      ],
    },
    niche: { subNiches: ["a", "b"] },
  };

  test("splits by axis and sorts by lift descending with nulls last", () => {
    const { formats, hooks, subNiches } = formatRows(report);
    expect(formats.map((row) => row.label)).toEqual(["pov", "list", "x"]);
    expect(hooks.map((row) => row.label)).toEqual(["stat", "question"]);
    expect(formats.at(-1)).toMatchObject({ lift: null, hitRate: null, verdict: "insufficient data" });
    expect(subNiches).toEqual(["a", "b"]);
  });

  test("handles a report without rows", () => {
    expect(formatRows({})).toEqual({ formats: [], hooks: [], subNiches: [] });
  });
});

describe("risingSignals", () => {
  const report = {
    signals: [
      {
        type: "breakout", url: "https://www.youtube.com/shorts/abc123XYZ", videoId: "tvideo_9", creator: "@a", platform: "youtube", ageDays: 2, verdict: "copy",
        evidence: { multiplier: 14, views: 500000, followers: 3000, scoreLabel: "breakout" },
        scorecard: { reasons: ["A1 strong lift: 14x", "A2 evidence: ok", "A3 third", "note: n"] },
        improvement: null,
      },
      {
        type: "small-account-breakout", url: "https://www.tiktok.com/@s/video/2", creator: "@s", platform: "tiktok",
        evidence: { multiplier: 8 }, scorecard: { views: 1234, creator: { followers: 90 }, visualFormat: "screen-recording" }, improvement: "shorten the hook",
      },
      {
        type: "emerging-format", label: "emerging format: pov",
        evidence: { value: "pov", unrelatedCreators: 4, hitsInWindow: 9, windowDays: 14, labelHitRate: 0.3, nicheHitRate: 0.2 },
        urls: ["u1", "u2", "u3", "u4"],
      },
      { type: "near-miss", url: "x" },
    ],
  };

  test("groups video signals by type and normalizes evidence", () => {
    const { groups } = risingSignals(report);
    expect(groups.map((group) => [group.type, group.items.length])).toEqual([["breakout", 1], ["small-account-breakout", 1]]);
    const breakout = groups[0]!.items[0]!;
    expect(breakout).toMatchObject({ id: "tvideo_9", multiplier: 14, views: 500000, followers: 3000, label: "breakout", signal: "breakout", note: null });
    expect(breakout.reasons).toEqual(["strong lift: 14x", "evidence: ok"]);
    expect(groups[1]!.items[0]).toMatchObject({ views: 1234, followers: 90, multiplier: 8, format: "screen-recording", note: "shorten the hook", thumb: null });
  });

  test("does not show near-miss signals anywhere", () => {
    const rising = risingSignals(report);
    expect(rising.groups.flatMap((group) => group.items).some((item) => item.url === "x")).toBe(false);
    expect(rising.formats).toHaveLength(1);
  });

  test("caps emerging format examples at 3", () => {
    const [format] = risingSignals(report).formats;
    expect(format).toEqual({ label: "pov", creators: 4, hits: 9, windowDays: 14, hitRate: 0.3, nicheHitRate: 0.2, examples: ["u1", "u2", "u3"] });
  });

  test("tolerates an empty report", () => {
    expect(risingSignals({}).formats).toEqual([]);
    expect(risingSignals({}).groups.every((group) => group.items.length === 0)).toBe(true);
  });
});
