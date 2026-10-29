// #578 point-in-time backtest harness: runs every task on a frozen corpus,
// records the dataset version with every result, and reports the data that
// exists versus the minimum history each method needs. Maintainer tool:
// `bun run scripts/trend-backtest.ts`. Nothing in the default trend engine
// (#556 / #576 / #577) imports this module or the methods it runs.

import { DAY_MS, HOUR_MS, MATURITY_PRIORS, maturity } from "../math.js";
import { followConversion } from "../methods/follow-conversion.js";
import { fitHawkesCheckpoints } from "../methods/hawkes.js";
import { indexCorpus, type CorpusIndex } from "./accessor.js";
import { quantileOf } from "./stats.js";
import { datasetVersion, type BacktestCorpus, type DatasetVersion, type LabelAxis } from "./corpus.js";
import { buildOutcomeOracle, OUTCOME_MIN_AGE_HOURS } from "./outcomes.js";
import { METHOD_FACTORIES } from "./scorers.js";
import { makeSplit, type TimeSplit } from "./split.js";
import { DEFAULT_ADOPTION_MARGIN } from "./stats.js";
import {
  runBaselineAccuracy,
  runBanditReplay,
  runCopyabilityCheck,
  runEarlyBreakout,
  runFormatSpread,
  runNearMissRepair,
  runSmallAccountTransfer,
  runThresholdCalibration,
  type TaskContext,
  type TaskResult,
} from "./tasks.js";

export const TASK_IDS = ["early-breakout", "format-spread", "small-account-transfer", "copyability", "near-miss-repair", "threshold-calibration", "baseline-accuracy", "bandit-replay"] as const;
export type TaskId = (typeof TASK_IDS)[number];

export const METHOD_IDS = ["niche-index", "cusum", "hawkes", "sir", "gpd", "kalman", "lead-lag", "kl-novelty", "ic", "halo", "follow-conversion", "bandit"] as const;
export type MethodId = (typeof METHOD_IDS)[number];

/**
 * Days of prospective refresh for a strict early-breakout judgment: 2 weeks of
 * tuning decisions + the 28-day purge + 2 weeks of held-out decisions + their
 * 28-day outcomes. Without the purge it is 56 days.
 */
export const EARLY_BREAKOUT_MIN_DAYS = 84;

/** Minimum history per method (pre-registered with the code; see docs/research/trend-methods-verdicts.md). */
export interface MinimumHistory {
  method: MethodId | "baselines" | "copyability";
  task: TaskId;
  /** Days of prospective refresh (daily snapshots) needed before a held-out judgment. */
  minDays: number;
  /** Count requirement, in the task's unit. */
  minCount: string;
  why: string;
}

export const MINIMUM_HISTORY: readonly MinimumHistory[] = [
  { method: "baselines", task: "early-breakout", minDays: EARLY_BREAKOUT_MIN_DAYS, minCount: ">= 10 breakouts with 28-day outcomes on each split side; ~300 per niche for format-level conclusions", why: "2 weeks of tuning decisions + 28-day purge + 2 weeks held out + 28-day outcomes (56 days without the purge)" },
  { method: "hawkes", task: "early-breakout", minDays: EARLY_BREAKOUT_MIN_DAYS, minCount: "prospective videos with >= 2 snapshots inside the first 48 h", why: "needs the h0-6 / h6-24 / d1-2 checkpoints and their 28-day outcomes" },
  { method: "niche-index", task: "early-breakout", minDays: EARLY_BREAKOUT_MIN_DAYS + 14, minCount: ">= 30 creators per niche posting weekly", why: "beta needs weeks of daily niche index movement before the first tuning decision" },
  { method: "cusum", task: "early-breakout", minDays: EARLY_BREAKOUT_MIN_DAYS, minCount: "creators with >= 12 visible videos (backfill counts)", why: "a regime needs a run of videos on each side of the change" },
  { method: "kalman", task: "baseline-accuracy", minDays: 42, minCount: ">= 10 creators with >= 5 videos aged 72 h+ to fit (q, r); >= 30 held-out 28-day outcomes", why: "held-out videos need their 28-day value; backfill provides the fit" },
  { method: "halo", task: "baseline-accuracy", minDays: 56, minCount: ">= 20 post-hit (delta, excess) pairs", why: "hits are rare (2-3%); pairs accrue slowly" },
  { method: "kl-novelty", task: "early-breakout", minDays: EARLY_BREAKOUT_MIN_DAYS, minCount: "hashtag / sound / label tokens on prospective videos", why: "judged on the early-breakout task; background is the trailing 30 days" },
  { method: "follow-conversion", task: "early-breakout", minDays: EARLY_BREAKOUT_MIN_DAYS, minCount: "creators with >= 2 follower snapshots >= 6 h apart and covered video snapshots", why: "daily follower snapshots over the decision window" },
  { method: "sir", task: "format-spread", minDays: 70, minCount: ">= 4 weekly decision times; units with >= 3 adopters in 28 days", why: "28-day lookback + weekly decisions on both sides + 14-day horizon (purged)" },
  { method: "lead-lag", task: "format-spread", minDays: 70, minCount: "creators adopting >= 3 units with >= 5 adopters each", why: "first-use order needs several spreading units" },
  { method: "gpd", task: "threshold-calibration", minDays: 56, minCount: ">= 200 training + 50 held-out mature videos per niche", why: "tail fit needs >= 20 exceedances over the 90th percentile" },
  { method: "ic", task: "early-breakout", minDays: 120, minCount: ">= 3 calendar months with >= 30 decisions each", why: "monthly decay needs three monthly IC points after the outcome horizon" },
  { method: "bandit", task: "bandit-replay", minDays: 84, minCount: ">= 100 train and >= 100 held-out events with outcomes", why: "28-day delayed feedback; the replay matches only ~1 / arms of events" },
  { method: "baselines", task: "small-account-transfer", minDays: 170, minCount: ">= 3 breakout and 3 control units with larger-creator follow-ups held out", why: "14-day lookback + 28-day follow-up window + the follow-ups' 28-day outcomes (56 days), purged (114 days without the purge)" },
  { method: "copyability", task: "copyability", minDays: 170, minCount: ">= 10 mature references with >= 2 later same-unit videos by other creators per side", why: "30-day lookback + 28-day follow-up window + 28-day outcomes, purged (114 days without the purge)" },
];

export interface DataAvailability {
  datasetVersion: DatasetVersion;
  videos: number;
  datedVideos: number;
  videosWithOneSnapshot: number;
  videosWithTwoPlusSnapshots: number;
  datedWithOneSnapshot: number;
  datedWithTwoPlusSnapshots: number;
  /** Dated videos first seen within 48 h of posting (the prospective cohort). */
  prospectiveVideos: number;
  prospectiveWithTwoEarlySnapshots: number;
  /** Prospective videos that already have a 28-56 day snapshot. */
  prospectiveWithOutcome: number;
  videosWithOutcome: number;
  daysOfHistory: number;
  distinctSnapshotDays: number;
  creators: number;
  creatorsWithTwoPlusFollowerSnapshots: number;
  labeled: Record<"format" | "hook" | "sound" | "hashtag", number>;
  byNiche: Array<{ niche: string; creators: number; datedVideos: number }>;
}

export function dataAvailability(corpus: BacktestCorpus): DataAvailability {
  const version = datasetVersion(corpus);
  const snapshotsByVideo = new Map<string, number[]>();
  for (const snapshot of corpus.snapshots) (snapshotsByVideo.get(snapshot.videoId) ?? snapshotsByVideo.set(snapshot.videoId, []).get(snapshot.videoId)!).push(snapshot.ageHours ?? -1);
  const dated = corpus.videos.filter((video) => video.postedAt !== null);
  const count = (list: typeof corpus.videos, predicate: (ages: number[]) => boolean) => list.filter((video) => predicate(snapshotsByVideo.get(video.id) ?? [])).length;
  const prospective = dated.filter((video) => {
    const ages = (snapshotsByVideo.get(video.id) ?? []).filter((age) => age >= 0);
    return ages.length > 0 && Math.min(...ages) <= 48;
  });
  const hasOutcome = (ages: number[]) => ages.some((age) => age >= OUTCOME_MIN_AGE_HOURS && age < 2 * OUTCOME_MIN_AGE_HOURS);
  const followerCounts = new Map<string, number>();
  for (const snapshot of corpus.creatorSnapshots) if (snapshot.followers !== null) followerCounts.set(snapshot.creatorId, (followerCounts.get(snapshot.creatorId) ?? 0) + 1);
  const nicheOf = new Map(corpus.creators.map((creator) => [creator.id, creator.niche ?? "unknown"]));
  const byNiche = new Map<string, { creators: Set<string>; datedVideos: number }>();
  for (const creator of corpus.creators) {
    const entry = byNiche.get(creator.niche ?? "unknown") ?? byNiche.set(creator.niche ?? "unknown", { creators: new Set(), datedVideos: 0 }).get(creator.niche ?? "unknown")!;
    entry.creators.add(creator.id);
  }
  for (const video of dated) byNiche.get(nicheOf.get(video.creatorId) ?? "unknown")!.datedVideos += 1;
  return {
    datasetVersion: version,
    videos: corpus.videos.length,
    datedVideos: dated.length,
    videosWithOneSnapshot: count(corpus.videos, (ages) => ages.length === 1),
    videosWithTwoPlusSnapshots: count(corpus.videos, (ages) => ages.length >= 2),
    datedWithOneSnapshot: count(dated, (ages) => ages.length === 1),
    datedWithTwoPlusSnapshots: count(dated, (ages) => ages.length >= 2),
    prospectiveVideos: prospective.length,
    prospectiveWithTwoEarlySnapshots: count(prospective, (ages) => ages.filter((age) => age >= 0 && age <= 48).length >= 2),
    prospectiveWithOutcome: count(prospective, hasOutcome),
    videosWithOutcome: count(dated, hasOutcome),
    daysOfHistory: realHistoryDays(corpus, version),
    distinctSnapshotDays: typeof corpus.provenance.realSnapshotDays === "number"
      ? corpus.provenance.realSnapshotDays
      : new Set(corpus.snapshots.map((snapshot) => Math.floor(snapshot.asOf / DAY_MS))).size,
    creators: corpus.creators.length,
    creatorsWithTwoPlusFollowerSnapshots: [...followerCounts.values()].filter((n) => n >= 2).length,
    labeled: {
      format: corpus.videos.filter((video) => video.labels.format && video.labels.format.label !== "unknown").length,
      hook: corpus.videos.filter((video) => video.labels.hook && video.labels.hook.label !== "unknown").length,
      sound: corpus.videos.filter((video) => video.soundKey !== null).length,
      hashtag: corpus.videos.filter((video) => video.hashtags.length > 0).length,
    },
    byNiche: [...byNiche].map(([niche, entry]) => ({ niche, creators: entry.creators.size, datedVideos: entry.datedVideos })).sort((a, b) => b.datedVideos - a.datedVideos),
  };
}

/** Real observation span in days (a re-timed corpus reports its pre-transform span). */
function realHistoryDays(corpus: BacktestCorpus, version: DatasetVersion): number {
  const first = typeof corpus.provenance.realFirstSnapshotAt === "number" ? corpus.provenance.realFirstSnapshotAt : version.firstSnapshotAt;
  const last = typeof corpus.provenance.realLastSnapshotAt === "number" ? corpus.provenance.realLastSnapshotAt : version.lastSnapshotAt;
  return first === null || last === null ? 0 : Math.round(((last - first) / DAY_MS) * 100) / 100;
}

export interface Descriptive {
  /** Followers gained per 1k views gained, per creator, from follower snapshot deltas (no outcome needed). */
  followConversion: { creators: number; p25: number | null; median: number | null; p75: number | null };
  /** Hawkes branching ratio fit to the visible first-48-hour checkpoints (no outcome needed). */
  hawkesEarly: { videos: number; p25: number | null; median: number | null; p75: number | null };
}

/** Outcome-free descriptive statistics from everything observed so far (PRELIMINARY by nature). */
export function describeCorpus(index: CorpusIndex): Descriptive {
  const view = index.view((index.end ?? 0) + 1);
  const shape = (ageHours: number) => maturity(ageHours, MATURITY_PRIORS.tiktok);
  const conversions: number[] = [];
  const branching: number[] = [];
  for (const creator of view.creators()) {
    const followerSnapshots = view.creatorSnapshots(creator.id);
    const videos = view.creatorVideos(creator.id);
    if (followerSnapshots.length >= 2) {
      const result = followConversion({
        followerSnapshots,
        videos: videos.map((video) => ({ postedAt: video.postedAt, snapshots: view.snapshots(video.id).filter((s) => s.views !== null).map((s) => ({ asOf: s.asOf, views: s.views! })) })),
        shape,
      });
      if (result.per1k !== null && result.deltaViews >= 10_000) conversions.push(result.per1k);
    }
    for (const video of videos) {
      const early = view.snapshots(video.id).filter((s) => s.ageHours !== null && s.ageHours <= 48 && s.views !== null).map((s) => ({ ageHours: s.ageHours!, views: s.views! }));
      if (early.length < 2) continue;
      const fit = fitHawkesCheckpoints(early);
      if (fit) branching.push(fit.n);
    }
  }
  const summary = (values: number[]) => ({ p25: quantileOf(values, 0.25), median: quantileOf(values, 0.5), p75: quantileOf(values, 0.75) });
  return { followConversion: { creators: conversions.length, ...summary(conversions) }, hawkesEarly: { videos: branching.length, ...summary(branching) } };
}

export interface BacktestOptions {
  tasks?: readonly TaskId[];
  /** Methods on trial (flags). Baselines always run. */
  methods?: readonly MethodId[];
  /** Explicit period; default: the corpus's snapshot span (or post span for a re-timed corpus). */
  periodStart?: number;
  periodEnd?: number;
  trainFraction?: number;
  /** Purge training decisions whose outcome lands in the held-out period (default true). */
  purge?: boolean;
  replicates?: number;
  seed?: string;
  margin?: number;
  axis?: LabelAxis;
  checkpointHours?: number;
  k?: number;
  breakoutMultiplier?: number;
  /** Force the PRELIMINARY mark (always on for transformed corpora). */
  preliminary?: boolean;
}

export interface BacktestReport {
  datasetVersion: DatasetVersion;
  generatedAt: string;
  preliminary: boolean;
  provenance: BacktestCorpus["provenance"];
  split: TimeSplit;
  availability: DataAvailability;
  minimumHistory: Array<MinimumHistory & { have: number; status: "enough-days" | "not-enough-history" }>;
  results: TaskResult[];
  ic: Array<{ scorer: string; months: Array<{ month: string; ic: number | null; n: number }>; halfLifeMonths: number | null }>;
  descriptive: Descriptive;
}

export function runBacktest(corpus: BacktestCorpus, options: BacktestOptions = {}): BacktestReport {
  const availability = dataAvailability(corpus);
  const version = availability.datasetVersion;
  const transformed = version.transforms.length > 0;
  const index = indexCorpus(corpus);
  const oracle = buildOutcomeOracle(corpus);
  let start = options.periodStart ?? index.start ?? 0;
  let end = options.periodEnd ?? index.end ?? 1;
  if (transformed && options.periodStart === undefined) {
    const posted = corpus.videos.map((video) => video.postedAt).filter((value): value is number => value !== null).sort((a, b) => a - b);
    if (posted.length > 0) start = posted[Math.floor(posted.length * 0.02)]!;
  }
  if (!(end > start)) end = start + HOUR_MS;
  const split = makeSplit(start, end, { trainFraction: options.trainFraction, purge: options.purge });
  const preliminary = options.preliminary ?? (transformed || !split.purge || availability.daysOfHistory < EARLY_BREAKOUT_MIN_DAYS);
  const ctx: TaskContext = {
    index,
    oracle,
    split,
    datasetVersion: version.id,
    preliminary,
    replicates: options.replicates ?? 300,
    seed: options.seed ?? "backtest-578",
    margin: options.margin ?? DEFAULT_ADOPTION_MARGIN,
  };
  const tasks = new Set(options.tasks ?? TASK_IDS);
  const methods = new Set<MethodId>(options.methods ?? METHOD_IDS);
  const results: TaskResult[] = [];
  let ic: BacktestReport["ic"] = [];
  if (tasks.has("early-breakout")) {
    const scorers = [...methods].filter((id) => id in METHOD_FACTORIES).map((id) => METHOD_FACTORIES[id]!());
    const result = runEarlyBreakout(ctx, scorers, { checkpointHours: options.checkpointHours, k: options.k, breakoutMultiplier: options.breakoutMultiplier });
    const { ic: icRows, ...rest } = result;
    results.push(rest);
    if (methods.has("ic")) ic = icRows.map((row) => ({ scorer: row.scorer, months: row.months.map(({ month, ic: value, n }) => ({ month, ic: value, n })), halfLifeMonths: row.decay.halfLifeMonths }));
  }
  const axis = options.axis ?? "format";
  if (tasks.has("format-spread")) results.push(runFormatSpread(ctx, { axis, methods: [...methods].filter((id) => id === "sir" || id === "lead-lag") }));
  if (tasks.has("small-account-transfer")) results.push(runSmallAccountTransfer(ctx, { axis, breakoutMultiplier: options.breakoutMultiplier }));
  if (tasks.has("copyability")) results.push(runCopyabilityCheck(ctx, { axis }));
  if (tasks.has("near-miss-repair")) results.push(runNearMissRepair(ctx));
  if (tasks.has("threshold-calibration") && methods.has("gpd")) results.push(runThresholdCalibration(ctx));
  if (tasks.has("baseline-accuracy")) results.push(runBaselineAccuracy(ctx, { methods: [...methods].filter((id) => id === "kalman" || id === "cusum" || id === "halo") }));
  if (tasks.has("bandit-replay") && methods.has("bandit")) results.push(runBanditReplay(ctx, { axis }));
  return {
    datasetVersion: version,
    generatedAt: new Date().toISOString(),
    preliminary,
    provenance: corpus.provenance,
    split,
    availability,
    minimumHistory: MINIMUM_HISTORY.map((row) => ({ ...row, have: availability.daysOfHistory, status: availability.daysOfHistory >= row.minDays ? "enough-days" : "not-enough-history" })),
    results,
    ic,
    descriptive: describeCorpus(index),
  };
}

// ─── Plain-text table ──────────────────────────────────────────────────────

const fmt = (value: number | null | undefined, digits = 3) => (value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(digits));

export function formatReport(report: BacktestReport): string {
  const lines: string[] = [];
  const mark = report.preliminary ? " [PRELIMINARY]" : "";
  lines.push(`dataset ${report.datasetVersion.id}${mark}  transforms: ${report.datasetVersion.transforms.join(",") || "none"}`);
  const a = report.availability;
  lines.push(`videos ${a.videos} (dated ${a.datedVideos}); snapshots: 1 -> ${a.videosWithOneSnapshot}, 2+ -> ${a.videosWithTwoPlusSnapshots}; history ${a.daysOfHistory} days (${a.distinctSnapshotDays} snapshot days)`);
  lines.push(`prospective ${a.prospectiveVideos} (2+ early snapshots ${a.prospectiveWithTwoEarlySnapshots}, with 28-day outcome ${a.prospectiveWithOutcome}); creators with 2+ follower snapshots ${a.creatorsWithTwoPlusFollowerSnapshots}`);
  lines.push(`split ${new Date(report.split.periodStart).toISOString()} | test from ${new Date(report.split.testStart).toISOString()} | end ${new Date(report.split.periodEnd).toISOString()}`);
  for (const result of report.results) {
    lines.push("");
    lines.push(`## ${result.task}: ${result.status}${result.preliminary && result.status === "computed" ? " [PRELIMINARY]" : ""}`);
    lines.push(`metric: ${result.metric}`);
    if (result.reason) lines.push(`reason: ${result.reason}`);
    if (Object.keys(result.counts).length > 0) lines.push(`counts: ${Object.entries(result.counts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    if (result.rows.length > 0) {
      lines.push(`| scorer | kind | weight | train | test | extra |`);
      for (const row of result.rows) {
        const extra = Object.entries(row.extra).map(([key, value]) => `${key}=${typeof value === "number" ? fmt(value) : value ?? "-"}`).join(" ");
        lines.push(`| ${row.scorer} | ${row.kind} | ${row.weight ?? "-"} | ${fmt(row.train)} | ${fmt(row.test)} | ${extra} |`);
      }
    }
    for (const lift of result.lifts) {
      lines.push(`lift ${lift.method} vs ${lift.versus}: ${fmt(lift.interval.lift)} [${fmt(lift.interval.low)}, ${fmt(lift.interval.high)}] (B=${lift.interval.replicates}) rule=${lift.rule}`);
    }
    for (const note of result.notes) lines.push(`note: ${note}`);
  }
  if (report.ic.length > 0) {
    lines.push("");
    lines.push("## information coefficient by month");
    for (const row of report.ic) lines.push(`${row.scorer}: ${row.months.map((month) => `${month.month}=${fmt(month.ic)}(n=${month.n})`).join(" ")} half-life=${fmt(row.halfLifeMonths, 1)}`);
  }
  const d = report.descriptive;
  lines.push("");
  lines.push("## descriptive (no outcomes; PRELIMINARY)");
  lines.push(`follow conversion per 1k views: creators=${d.followConversion.creators} p25=${fmt(d.followConversion.p25)} median=${fmt(d.followConversion.median)} p75=${fmt(d.followConversion.p75)}`);
  lines.push(`hawkes n from first-48 h checkpoints: videos=${d.hawkesEarly.videos} p25=${fmt(d.hawkesEarly.p25)} median=${fmt(d.hawkesEarly.median)} p75=${fmt(d.hawkesEarly.p75)}`);
  lines.push("");
  lines.push("## minimum history");
  for (const row of report.minimumHistory) lines.push(`${row.method} / ${row.task}: need ${row.minDays} d (have ${fmt(row.have, 1)}) -> ${row.status}; ${row.minCount}`);
  return lines.join("\n");
}
