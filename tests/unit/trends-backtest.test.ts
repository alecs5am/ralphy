// #578 point-in-time backtest harness: look-ahead guards, frozen dataset
// version, purged time split, bootstrap / adoption rule, and end-to-end runs
// on the seeded synthetic corpus with planted effects.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertFrozenCopy } from "../../cli/lib/store/trend-backtest-source.js";
import { DAY_MS, HOUR_MS } from "../../cli/lib/trends/math.js";
import { indexCorpus, LookAheadError, type PointInTimeView } from "../../cli/lib/trends/backtest/accessor.js";
import { datasetVersion, retimeBackfill, type BacktestCorpus } from "../../cli/lib/trends/backtest/corpus.js";
import { generateSyntheticCorpus } from "../../cli/lib/trends/backtest/synthetic.js";
import { makeSplit, sideOf } from "../../cli/lib/trends/backtest/split.js";
import { adoptionRule, bootstrapLift, spearman, topK } from "../../cli/lib/trends/backtest/stats.js";
import { dataAvailability, formatReport, runBacktest } from "../../cli/lib/trends/backtest/harness.js";
import { buildOutcomeOracle } from "../../cli/lib/trends/backtest/outcomes.js";
import type { EarlyScorer } from "../../cli/lib/trends/backtest/scorers.js";
import { runEarlyBreakout, type TaskContext } from "../../cli/lib/trends/backtest/tasks.js";

const T0 = Date.UTC(2026, 8, 1);

function tinyCorpus(): BacktestCorpus {
  return {
    creators: [
      { id: "c1", platform: "tiktok", niche: "n", group: "main" },
      { id: "bad", platform: "tiktok", niche: "n", group: "anomaly" },
    ],
    videos: [
      { id: "v1", creatorId: "c1", platform: "tiktok", postedAt: T0, discoveredAt: T0 + HOUR_MS, durationMs: 20_000, labels: { format: { label: "pov", availableAt: T0 + 10 * HOUR_MS } }, hashtags: ["a"], soundKey: null },
      { id: "v2", creatorId: "c1", platform: "tiktok", postedAt: T0 + 5 * DAY_MS, discoveredAt: T0 + 5 * DAY_MS + HOUR_MS, durationMs: 20_000, labels: {}, hashtags: [], soundKey: null },
      { id: "x1", creatorId: "bad", platform: "tiktok", postedAt: T0, discoveredAt: T0 + HOUR_MS, durationMs: 20_000, labels: {}, hashtags: [], soundKey: null },
    ],
    snapshots: [
      { videoId: "v1", asOf: T0 + 2 * HOUR_MS, ageHours: 2, checkpoint: "h0-6", source: "s", views: 100, likes: null, comments: null, shares: null, saves: null, precision: "exact" },
      { videoId: "v1", asOf: T0 + 30 * HOUR_MS, ageHours: 30, checkpoint: "d1-2", source: "s", views: 1_000, likes: null, comments: null, shares: null, saves: null, precision: "exact" },
      { videoId: "v1", asOf: T0 + 30 * DAY_MS, ageHours: 720, checkpoint: "d28", source: "s", views: 50_000, likes: null, comments: null, shares: null, saves: null, precision: "exact" },
      { videoId: "v2", asOf: T0 + 5 * DAY_MS + 3 * HOUR_MS, ageHours: 3, checkpoint: "h0-6", source: "s", views: 10, likes: null, comments: null, shares: null, saves: null, precision: "exact" },
    ],
    creatorSnapshots: [
      { creatorId: "c1", asOf: T0 + DAY_MS, followers: 1_000 },
      { creatorId: "c1", asOf: T0 + 20 * DAY_MS, followers: 5_000 },
    ],
    provenance: { source: "test", transforms: "" },
  };
}

describe("point-in-time accessor", () => {
  test("a view sees only snapshots taken before t", () => {
    const index = indexCorpus(tinyCorpus());
    const view = index.view(T0 + 30 * HOUR_MS);
    expect(view.snapshots("v1").map((s) => s.views)).toEqual([100]);
    expect(view.latest("v1")!.views).toBe(100);
    expect(index.view(T0 + 30 * HOUR_MS + 1).latest("v1")!.views).toBe(1_000);
    expect(view.video("v2")).toBeNull();
    expect(view.videos().map((v) => v.id)).toEqual(["v1"]);
    expect(index.view(T0).video("v1")).toBeNull();
  });

  test("a method cannot read a future snapshot, label, or follower count", () => {
    const index = indexCorpus(tinyCorpus());
    const t = T0 + 3 * HOUR_MS;
    const view = index.view(t);
    // A cheating scorer tries every route to the 28-day value.
    const cheater: EarlyScorer = {
      id: "cheater",
      kind: "method",
      description: "tries to read the future",
      score: ({ view: v, video }) => Math.max(...v.snapshots(video.id).map((s) => s.views ?? 0), v.latest(video.id)?.views ?? 0, ...v.at(v.t).snapshots(video.id).map((s) => s.views ?? 0)),
    };
    const seen = cheater.score({ view, video: view.video("v1")!, niches: new Map(), memo: {}, weight: 1 });
    expect(seen).toBe(100);
    expect(view.snapshots("v1").every((s) => s.asOf < t)).toBe(true);
    expect(() => view.at(t + 1)).toThrow(LookAheadError);
    expect(() => view.followersAt("c1", t + DAY_MS)).toThrow(LookAheadError);
    expect(view.followersAt("c1")).toBeNull();
    expect(index.view(T0 + 2 * DAY_MS).followersAt("c1")).toBe(1_000);
    expect(view.units("v1", "format")).toEqual([]);
    expect(index.view(T0 + 11 * HOUR_MS).units("v1", "format")).toEqual(["pov"]);
    // Rows are frozen and the view carries no corpus reference.
    expect(Object.isFrozen(view.snapshots("v1")[0])).toBe(true);
    expect(Object.keys(view).sort()).toEqual(["at", "creator", "creatorSnapshots", "creatorVideos", "creators", "followersAt", "latest", "snapshots", "t", "units", "video", "videos"]);
    expect(() => (view as unknown as { t: number }).t = t + DAY_MS).toThrow();
  });

  test("anomaly creators are excluded", () => {
    const view = indexCorpus(tinyCorpus()).view(T0 + 100 * DAY_MS);
    expect(view.creator("bad")).toBeNull();
    expect(view.video("x1")).toBeNull();
  });

  test("synthetic views never expose a snapshot at or after t", () => {
    const { corpus } = generateSyntheticCorpus({ seed: "pit", creators: 20, days: 40 });
    const index = indexCorpus(corpus);
    for (const t of [T0 + 5 * DAY_MS, T0 + 17.3 * DAY_MS, T0 + 39 * DAY_MS]) {
      const view: PointInTimeView = index.view(t);
      for (const video of view.videos()) {
        expect(video.discoveredAt).toBeLessThan(t);
        for (const snapshot of view.snapshots(video.id)) expect(snapshot.asOf).toBeLessThan(t);
      }
    }
  });
});

describe("frozen dataset version", () => {
  test("the loader refuses a live database with a WAL sidecar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backtest-578-"));
    try {
      const db = path.join(dir, "ralphy.db");
      fs.writeFileSync(db, "");
      expect(() => assertFrozenCopy(db)).not.toThrow();
      fs.writeFileSync(`${db}-wal`, "x");
      expect(() => assertFrozenCopy(db)).toThrow(/live database/);
      expect(() => assertFrozenCopy(path.join(dir, "missing.db"))).toThrow(/not found/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("is order-independent and changes with any snapshot", () => {
    const corpus = tinyCorpus();
    const a = datasetVersion(corpus);
    const b = datasetVersion({ ...corpus, snapshots: [...corpus.snapshots].reverse(), videos: [...corpus.videos].reverse() });
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^tbd1-[0-9a-f]{16}$/);
    const changed = datasetVersion({ ...corpus, snapshots: corpus.snapshots.map((s, i) => (i === 0 ? { ...s, views: 101 } : s)) });
    expect(changed.id).not.toBe(a.id);
    expect(datasetVersion(retimeBackfill(corpus)).transforms).toEqual(["retime-backfill"]);
  });

  test("backfill re-timing moves mature snapshots to post + 28 d", () => {
    const retimed = retimeBackfill(tinyCorpus(), { backdateFollowers: true });
    const mature = retimed.snapshots.find((s) => s.views === 50_000)!;
    expect(mature.asOf).toBe(T0 + 28 * DAY_MS);
    expect(retimed.videos.find((v) => v.id === "v1")!.discoveredAt).toBe(T0);
    expect(retimed.creatorSnapshots.some((s) => s.asOf === T0 - DAY_MS && s.followers === 1_000)).toBe(true);
  });
});

describe("split, statistics, rule", () => {
  test("purged split drops training decisions whose outcome lands in the held-out period", () => {
    const split = makeSplit(T0, T0 + 90 * DAY_MS);
    // Decision span = 90 - 28 (outcome horizon) days; two thirds tune.
    expect((split.testStart - T0) / DAY_MS).toBeCloseTo(62 * (4 / 6), 3);
    expect(sideOf(split, T0 + DAY_MS, T0 + 29 * DAY_MS)).toBe("train");
    expect(sideOf(split, T0 + 20 * DAY_MS, T0 + 48 * DAY_MS)).toBe("purged");
    expect(sideOf(split, T0 + 50 * DAY_MS, T0 + 78 * DAY_MS)).toBe("test");
    expect(sideOf(split, T0 + 70 * DAY_MS, T0 + 98 * DAY_MS)).toBe("outside");
    expect(sideOf(makeSplit(T0, T0 + 90 * DAY_MS, { purge: false }), T0 + 20 * DAY_MS, T0 + 48 * DAY_MS)).toBe("train");
  });

  test("rank and top-k helpers", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
    const result = topK([
      { score: 3, positive: true, group: "a" }, { score: 2, positive: false, group: "a" }, { score: 1, positive: true, group: "a" },
      { score: 5, positive: false, group: "b" }, { score: 4, positive: true, group: "b" },
    ], 1);
    expect(result).toEqual({ precision: 0.5, recall: 1 / 3, picks: 2, hits: 1, positives: 3 });
  });

  test("bootstrap interval covers a planted lift and the rule needs margin plus an interval above zero", () => {
    // 200 clusters; method hit rate 0.6, baseline 0.4 -> planted lift 0.5.
    const method = Array.from({ length: 200 }, (_, i) => (i % 5 < 3 ? 1 : 0));
    const baseline = Array.from({ length: 200 }, (_, i) => (i % 5 < 2 ? 1 : 0));
    const interval = bootstrapLift({
      clusters: 200,
      replicates: 400,
      stat: (sample) => ({ method: sample.reduce((s, i) => s + method[i]!, 0) / sample.length, baseline: sample.reduce((s, i) => s + baseline[i]!, 0) / sample.length }),
    });
    expect(interval.lift).toBeCloseTo(0.5, 10);
    expect(interval.low!).toBeLessThan(0.5);
    expect(interval.high!).toBeGreaterThan(0.5);
    expect(interval.low!).toBeGreaterThan(0);
    expect(adoptionRule(interval)).toBe("passes");
    expect(adoptionRule(interval, { preliminary: true })).toBe("insufficient-data");
    expect(adoptionRule({ ...interval, lift: 0.08 })).toBe("fails");
    expect(adoptionRule({ ...interval, low: -0.01 })).toBe("fails");
  });
});

describe("harness on the synthetic corpus", () => {
  const { corpus } = generateSyntheticCorpus({ seed: "harness", creators: 120, days: 120 });

  test("early breakout: creator-relative baseline beats raw views; every result carries the dataset version", () => {
    const report = runBacktest(corpus, { tasks: ["early-breakout", "near-miss-repair"], methods: ["hawkes"], replicates: 100 });
    const early = report.results.find((result) => result.task === "early-breakout")!;
    expect(early.status).toBe("computed");
    expect(report.preliminary).toBe(false);
    const row = (id: string) => early.rows.find((r) => r.scorer === id)!;
    expect(row("creator-multiplier").test!).toBeGreaterThan(row("raw-views").test! + 0.2);
    expect(row("creator-multiplier").test!).toBeGreaterThan(row("views-per-follower").test!);
    expect(early.bestBaseline).toBe("creator-multiplier");
    expect(early.lifts.map((lift) => lift.method)).toEqual(["hawkes"]);
    expect(early.counts.purged).toBeGreaterThan(0);
    for (const result of report.results) expect(result.datasetVersion).toBe(report.datasetVersion.id);
    expect(report.results.find((result) => result.task === "near-miss-repair")!.status).toBe("needs-natural-experiment-data");
    expect(formatReport(report)).toContain(report.datasetVersion.id);
  });

  test("each decision is scored at post + 48 h through a view; weights are tuned on training decisions", () => {
    const index = indexCorpus(corpus);
    const oracle = buildOutcomeOracle(corpus);
    const ctx: TaskContext = { index, oracle, split: makeSplit(index.start!, index.end!), datasetVersion: "test", preliminary: false, replicates: 50, seed: "s", margin: 0.1 };
    const offsets = new Set<number>();
    let futureSnapshots = 0;
    const spy: EarlyScorer = {
      id: "spy",
      kind: "method",
      description: "records what it can see",
      weights: [0, 1],
      score: ({ view, video, weight }) => {
        offsets.add(view.t - video.postedAt!);
        futureSnapshots += view.snapshots(video.id).filter((s) => s.asOf >= view.t).length;
        return weight * (view.latest(video.id)?.views ?? 0);
      },
    };
    const result = runEarlyBreakout(ctx, [spy]);
    expect(result.status).toBe("computed");
    expect([...offsets]).toEqual([48 * HOUR_MS]);
    expect(futureSnapshots).toBe(0);
    expect(result.rows.find((row) => row.scorer === "spy")!.weight).toBe(1);
  });

  test("other tasks compute on a longer corpus without the purge", () => {
    const long = generateSyntheticCorpus({ seed: "harness-long", creators: 120, days: 200 }).corpus;
    const report = runBacktest(long, { tasks: ["format-spread", "copyability", "threshold-calibration", "baseline-accuracy"], purge: false, replicates: 50 });
    expect(report.preliminary).toBe(true);
    for (const id of ["format-spread", "copyability", "threshold-calibration", "baseline-accuracy"]) {
      const result = report.results.find((r) => r.task === id)!;
      expect(result.status).toBe("computed");
      expect(result.rows.length).toBeGreaterThan(1);
    }
    const spread = report.results.find((r) => r.task === "format-spread")!;
    // Planted SIR adoption: the renewal forecast ranks units by future adopters (IC > 0).
    expect(Number(spread.rows.find((row) => row.scorer === "sir")!.extra.meanIc)).toBeGreaterThan(0.3);
  });

  test("availability counts and minimum-history table", () => {
    const availability = dataAvailability(corpus);
    expect(availability.datedVideos).toBe(corpus.videos.length);
    expect(availability.prospectiveVideos).toBeGreaterThan(availability.prospectiveWithOutcome);
    expect(availability.daysOfHistory).toBeGreaterThan(119);
    const short = runBacktest(generateSyntheticCorpus({ seed: "short", creators: 20, days: 10 }).corpus, { tasks: ["early-breakout"], replicates: 10 });
    expect(short.preliminary).toBe(true);
    expect(short.results[0]!.status).toBe("not-enough-history");
    expect(short.minimumHistory.every((row) => row.status === "not-enough-history")).toBe(true);
  });
});
