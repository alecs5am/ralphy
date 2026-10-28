import { describe, expect, test } from "bun:test";
import { DAY_MS, HOUR_MS, MATURITY_PRIORS, cohortKey } from "../../cli/lib/trends/math.js";
import { cohortStats, creatorBaselineRows, engagementQuality, scoreCreator, type ScoreCreator, type ScoreVideo } from "../../cli/lib/trends/score.js";

const NOW = 1_800_000_000_000;
const KEY = cohortKey({ platform: "tiktok", niche: "ai-tools", formatKey: "tiktok-video", lengthBand: "16-30s", sizeBand: "micro" });

function video(index: number, views: number, options: Partial<ScoreVideo> & { ageDays?: number } = {}): ScoreVideo {
  const ageDays = options.ageDays ?? 40 - index;
  const postedAt = NOW - ageDays * DAY_MS;
  return {
    id: `tvideo_${index}`,
    key: String(7_000 + index),
    platform: "tiktok",
    formatKey: "tiktok-video",
    postedAt,
    inListing: true,
    cohortKey: KEY,
    latest: { asOf: NOW, values: { views, likes: Math.round(views / 20), comments: Math.round(views / 400), shares: Math.round(views / 300), saves: Math.round(views / 250) } },
    snapshots: [{ asOf: NOW, ageHours: ageDays * 24, values: { views }, source: "ytdlp-tiktok-user" }],
    ...options,
  };
}

function creator(videos: ScoreVideo[], listed = true): ScoreCreator {
  return { creatorId: "tcreator_1", platform: "tiktok", listed, followerSnapshots: [], videos };
}

/** 30 steady mature videos around 1,000 views, then one breakout. */
function steadyCreator(breakoutViews: number, breakoutAgeDays = 9): ScoreCreator {
  const videos = Array.from({ length: 30 }, (_, index) => video(index, 900 + (index % 5) * 50, { ageDays: 60 - index }));
  videos.push(video(99, breakoutViews, { ageDays: breakoutAgeDays }));
  return creator(videos);
}

const options = { now: NOW };

describe("scoreCreator", () => {
  test("a 20x video against a steady creator is a breakout", () => {
    const subject = steadyCreator(20_000);
    const scores = scoreCreator(subject, cohortStats([subject], options), options);
    const breakout = scores.find((score) => score.videoId === "tvideo_99")!;
    expect(breakout.label).toBe("breakout");
    expect(breakout.multiplier!).toBeGreaterThan(10);
    expect(breakout.mode).toBe("projected");
    expect(breakout.flags).not.toContain("thin");
    expect(breakout.detail!.baselineN).toBe(30);
    expect(breakout.composite!).toBeGreaterThan(2);
  });

  test("the scored video never sits in its own window (leave-one-out)", () => {
    const subject = steadyCreator(1_000);
    const own = scoreCreator(subject, cohortStats([subject], options), options).find((score) => score.videoId === "tvideo_99")!;
    expect(own.label).toBe("normal");
    expect(own.multiplier!).toBeGreaterThan(0.8);
    expect(own.multiplier!).toBeLessThan(1.3);
  });

  test("young videos are provisional and carry no label; < 6 h is not projected", () => {
    const subject = steadyCreator(5_000, 1);
    const scores = scoreCreator(subject, cohortStats([subject], options), options);
    const young = scores.find((score) => score.videoId === "tvideo_99")!;
    expect(young.flags).toContain("provisional");
    expect(young.label).toBeNull();
    expect(young.multiplier).not.toBeNull();

    const fresh = steadyCreator(500, 3 / 24);
    const tooYoung = scoreCreator(fresh, cohortStats([fresh], options), options).find((score) => score.videoId === "tvideo_99")!;
    expect(tooYoung.multiplier).toBeNull();
    expect(tooYoung.flags).toEqual(expect.arrayContaining(["provisional", "too-young"]));
  });

  test("a creator with few videos gets a thin baseline and no label", () => {
    const subject = creator([video(1, 1_000, { ageDays: 30 }), video(2, 1_100, { ageDays: 25 }), video(3, 30_000, { ageDays: 20 })]);
    const score = scoreCreator(subject, cohortStats([subject], options), options).find((entry) => entry.videoId === "tvideo_3")!;
    expect(score.flags).toContain("thin");
    expect(score.label).toBeNull();
  });

  test("a discovery-only video whose creator was never listed is not scored", () => {
    const discovered = creator([video(1, 2_000_000, { inListing: false })], false);
    const [score] = scoreCreator(discovered, cohortStats([discovered], options), options);
    expect(score).toMatchObject({ multiplier: null, label: null, flags: ["no-listing"] });
  });

  test("discovery-sample videos never enter a creator's baseline", () => {
    const listed = steadyCreator(1_000);
    // A survivor discovered on Explore (not in a listing) must not lift the baseline.
    listed.videos.push(video(50, 5_000_000, { ageDays: 20, inListing: false }));
    const scores = scoreCreator(listed, cohortStats([listed], options), options);
    expect(scores.find((score) => score.videoId === "tvideo_99")!.label).toBe("normal");
    expect(scores.find((score) => score.videoId === "tvideo_50")!.label).toBe("breakout");
  });

  test("undated videos stay unscored with the undated flag", () => {
    const subject = creator([...steadyCreator(1_000).videos, video(70, 3_000, { postedAt: null })]);
    const score = scoreCreator(subject, cohortStats([subject], options), options).find((entry) => entry.videoId === "tvideo_70")!;
    expect(score.flags).toEqual(["undated"]);
  });

  test("same-age mode replaces the projection once 8 members bracket the age", () => {
    const videos = Array.from({ length: 10 }, (_, index) => {
      const ageDays = 40 - index;
      const postedAt = NOW - ageDays * DAY_MS;
      return {
        ...video(index, 2_000, { ageDays }),
        snapshots: [
          { asOf: postedAt + 12 * HOUR_MS, ageHours: 12, values: { views: 400 }, source: "ytdlp-tiktok-user" },
          { asOf: postedAt + 72 * HOUR_MS, ageHours: 72, values: { views: 1_500 }, source: "ytdlp-tiktok-user" },
          { asOf: NOW, ageHours: ageDays * 24, values: { views: 2_000 }, source: "ytdlp-tiktok-user" },
        ],
      };
    });
    const target = video(20, 4_000, { ageDays: 1 });
    target.snapshots = [{ asOf: NOW, ageHours: 24, values: { views: 4_000 }, source: "ytdlp-tiktok-user" }];
    const subject = creator([...videos, target]);
    const score = scoreCreator(subject, cohortStats([subject], options), options).find((entry) => entry.videoId === "tvideo_20")!;
    expect(score.mode).toBe("same-age");
    // At 24 h the members had ~650 views (log-interpolated); 4,000 is several times that.
    expect(score.multiplier!).toBeGreaterThan(3);
  });

  test("momentum from two dated snapshots flags a rising video", () => {
    const subject = steadyCreator(1_000);
    const hot = video(80, 30_000, { ageDays: 2 });
    hot.snapshots = [
      { asOf: NOW - 24 * HOUR_MS, ageHours: 24, values: { views: 2_000 }, source: "ytdlp-tiktok-user" },
      { asOf: NOW, ageHours: 48, values: { views: 30_000 }, source: "ytdlp-tiktok-user" },
    ];
    subject.videos.push(hot);
    const score = scoreCreator(subject, cohortStats([subject], options), options).find((entry) => entry.videoId === "tvideo_80")!;
    expect(score.momentum!).toBeGreaterThan(0.3);
    expect(score.flags).toContain("rising");
  });

  test("follower-normalized multiplier needs follower snapshots near each post", () => {
    const subject = steadyCreator(20_000);
    subject.followerSnapshots = subject.videos.map((entry) => ({ asOf: entry.postedAt!, followers: 10_000 }));
    const score = scoreCreator(subject, cohortStats([subject], options), options).find((entry) => entry.videoId === "tvideo_99")!;
    expect(score.detail!.followerMultiplier!).toBeGreaterThan(10);
    const bare = steadyCreator(20_000);
    expect(scoreCreator(bare, cohortStats([bare], options), options).find((entry) => entry.videoId === "tvideo_99")!.detail!.followerMultiplier).toBeNull();
  });

  test("engagement quality compares interactions per view with the window", () => {
    const window = Array.from({ length: 5 }, (_, index) => video(index, 1_000));
    const strong = video(9, 1_000);
    strong.latest!.values.saves = 200;
    const quality = engagementQuality(strong, window);
    expect(quality.saves!).toBeGreaterThan(1);
    expect(quality.likes!).toBeCloseTo(0, 6);
  });

  test("cohort stats need 10 members and produce a creator baseline cache", () => {
    const subject = steadyCreator(1_000);
    const stats = cohortStats([subject], options);
    expect(stats.get(`${KEY}#views`)!.n).toBe(31);
    expect(cohortStats([creator([video(1, 10)])], options).size).toBe(0);
    const rows = creatorBaselineRows(subject, options);
    expect(rows.find((row) => row.metric === "views")).toMatchObject({ formatKey: "tiktok-video", n: 30 });
    expect(MATURITY_PRIORS.tiktok.basis).toBe("prior");
  });
});
