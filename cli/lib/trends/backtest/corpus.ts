// Backtest corpus (#578) — the in-memory shape the point-in-time harness
// replays. Pure: the store loader (`cli/lib/store/trend-backtest-source.ts`)
// and the synthetic generator (`synthetic.ts`) both produce this shape.
//
// Deliberately absent: every derived "latest" column of `trend_videos`
// (latest_*, outlier_*, momentum) and the creator's latest follower count and
// size band. Those are computed from the newest data and would leak the
// future into a replay. Methods see metrics only through dated snapshots.

import { createHash } from "node:crypto";
import { DAY_MS, HOUR_MS, type TrendPlatform } from "../math.js";

export type LabelAxis = "format" | "hook" | "sound" | "hashtag";

export interface BtVideo {
  id: string;
  creatorId: string;
  platform: TrendPlatform;
  postedAt: number | null;
  /** First time the corpus saw the video; the video is invisible before it. */
  discoveredAt: number;
  durationMs: number | null;
  /** Content labels (caption / title derived). `availableAt` gates them like a snapshot. */
  labels: Partial<Record<"format" | "hook", { label: string; availableAt: number }>>;
  hashtags: string[];
  soundKey: string | null;
}

export interface BtSnapshot {
  videoId: string;
  asOf: number;
  /** Age at snapshot in hours; null when the post time is unknown. */
  ageHours: number | null;
  checkpoint: string;
  source: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  precision: "exact" | "rounded";
}

export interface BtCreator {
  id: string;
  platform: TrendPlatform;
  /** Creator-level niche (taxonomic, treated as static). */
  niche: string | null;
  /** Quality-filter group from niche onboarding; `anomaly` creators are excluded. */
  group: "main" | "negative" | "anomaly" | null;
}

export interface BtCreatorSnapshot {
  creatorId: string;
  asOf: number;
  followers: number | null;
}

export interface BacktestCorpus {
  creators: BtCreator[];
  videos: BtVideo[];
  snapshots: BtSnapshot[];
  creatorSnapshots: BtCreatorSnapshot[];
  /** Free-form provenance (db path, workspace, transforms applied). */
  provenance: Record<string, string | number | boolean | null>;
}

// ─── Frozen dataset version ────────────────────────────────────────────────

export interface DatasetVersion {
  /** `tbd1-<16 hex>`: sha256 over the canonical snapshot set + the static video fields methods read. */
  id: string;
  videos: number;
  creators: number;
  snapshots: number;
  creatorSnapshots: number;
  firstSnapshotAt: number | null;
  lastSnapshotAt: number | null;
  transforms: string[];
}

const num = (value: number | null | undefined): string => (value === null || value === undefined ? "-" : String(value));

/**
 * Hash of the frozen snapshot set. Order-independent (rows are sorted by
 * their natural keys first), so the same data loaded twice gets the same id
 * and any added, removed, or changed snapshot changes it.
 */
export function datasetVersion(corpus: BacktestCorpus): DatasetVersion {
  const hash = createHash("sha256");
  const snapshots = [...corpus.snapshots].sort((a, b) =>
    a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : a.asOf - b.asOf || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0)
  );
  hash.update("snapshots\n");
  for (const s of snapshots) {
    hash.update(`${s.videoId}|${s.asOf}|${s.source}|${s.checkpoint}|${num(s.ageHours)}|${num(s.views)}|${num(s.likes)}|${num(s.comments)}|${num(s.shares)}|${num(s.saves)}|${s.precision}\n`);
  }
  hash.update("creator-snapshots\n");
  for (const s of [...corpus.creatorSnapshots].sort((a, b) => (a.creatorId < b.creatorId ? -1 : a.creatorId > b.creatorId ? 1 : a.asOf - b.asOf))) {
    hash.update(`${s.creatorId}|${s.asOf}|${num(s.followers)}\n`);
  }
  hash.update("videos\n");
  for (const v of [...corpus.videos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    hash.update(`${v.id}|${v.creatorId}|${num(v.postedAt)}|${v.discoveredAt}|${v.labels.format?.label ?? "-"}|${v.labels.hook?.label ?? "-"}|${v.soundKey ?? "-"}|${v.hashtags.join(",")}\n`);
  }
  hash.update("creators\n");
  for (const c of [...corpus.creators].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    hash.update(`${c.id}|${c.platform}|${c.niche ?? "-"}|${c.group ?? "-"}\n`);
  }
  let first: number | null = null;
  let last: number | null = null;
  for (const s of corpus.snapshots) {
    if (first === null || s.asOf < first) first = s.asOf;
    if (last === null || s.asOf > last) last = s.asOf;
  }
  const transforms = typeof corpus.provenance.transforms === "string" && corpus.provenance.transforms
    ? String(corpus.provenance.transforms).split(",")
    : [];
  return {
    id: `tbd1-${hash.digest("hex").slice(0, 16)}`,
    videos: corpus.videos.length,
    creators: corpus.creators.length,
    snapshots: corpus.snapshots.length,
    creatorSnapshots: corpus.creatorSnapshots.length,
    firstSnapshotAt: first,
    lastSnapshotAt: last,
    transforms,
  };
}

// ─── Backfill re-timing (explicit, opt-in assumption) ───────────────────────

export const MATURE_AGE_HOURS = 28 * 24;

/**
 * PRELIMINARY-only transform. A backfill video is first seen already mature,
 * so a strict replay cannot use it before the scrape date. This transform
 * pretends each mature snapshot (age >= 28 d) was taken at exactly
 * `postedAt + 28 d` and that the video was discovered at its post time, so
 * cross-sectional questions (baselines, thresholds, format spread by post
 * date) get a first look before prospective history exists.
 *
 * Known biases, recorded in provenance: the value includes growth after day
 * 28 (long-tail resurfacing inflates old videos), and with
 * `backdateFollowers` the creator's earliest follower count is assumed valid
 * from the creator's first video (later growth leaks into "followers at post").
 * Never use a re-timed corpus for verdicts.
 */
export function retimeBackfill(corpus: BacktestCorpus, options: { backdateFollowers?: boolean } = {}): BacktestCorpus {
  const posted = new Map(corpus.videos.map((video) => [video.id, video.postedAt]));
  const snapshots = corpus.snapshots.map((snapshot) => {
    const postedAt = posted.get(snapshot.videoId);
    if (postedAt === null || postedAt === undefined || snapshot.ageHours === null || snapshot.ageHours < MATURE_AGE_HOURS) return snapshot;
    return { ...snapshot, asOf: postedAt + MATURE_AGE_HOURS * HOUR_MS, ageHours: MATURE_AGE_HOURS, checkpoint: "d28" };
  });
  const videos = corpus.videos.map((video) =>
    video.postedAt === null ? video : {
      ...video,
      discoveredAt: Math.min(video.discoveredAt, video.postedAt),
      labels: Object.fromEntries(Object.entries(video.labels).map(([axis, value]) => [axis, { ...value!, availableAt: Math.min(value!.availableAt, video.postedAt!) }])),
    }
  );
  let creatorSnapshots = corpus.creatorSnapshots;
  if (options.backdateFollowers) {
    const firstPost = new Map<string, number>();
    for (const video of corpus.videos) {
      if (video.postedAt === null) continue;
      const current = firstPost.get(video.creatorId);
      if (current === undefined || video.postedAt < current) firstPost.set(video.creatorId, video.postedAt);
    }
    const earliest = new Map<string, BtCreatorSnapshot>();
    for (const snapshot of corpus.creatorSnapshots) {
      if (snapshot.followers === null) continue;
      const current = earliest.get(snapshot.creatorId);
      if (!current || snapshot.asOf < current.asOf) earliest.set(snapshot.creatorId, snapshot);
    }
    const backdated: BtCreatorSnapshot[] = [];
    for (const [creatorId, snapshot] of earliest) {
      const start = firstPost.get(creatorId);
      if (start !== undefined && start - DAY_MS < snapshot.asOf) backdated.push({ creatorId, asOf: start - DAY_MS, followers: snapshot.followers });
    }
    creatorSnapshots = [...corpus.creatorSnapshots, ...backdated];
  }
  const transforms = [
    ...(typeof corpus.provenance.transforms === "string" && corpus.provenance.transforms ? String(corpus.provenance.transforms).split(",") : []),
    "retime-backfill",
    ...(options.backdateFollowers ? ["backdate-followers"] : []),
  ];
  // The real observation span survives the transform (availability reports it, not the re-timed span).
  const real = realSpan(corpus);
  return {
    ...corpus,
    videos,
    snapshots,
    creatorSnapshots,
    provenance: { ...corpus.provenance, transforms: transforms.join(","), realFirstSnapshotAt: real.first, realLastSnapshotAt: real.last, realSnapshotDays: real.days },
  };
}

function realSpan(corpus: BacktestCorpus): { first: number | null; last: number | null; days: number } {
  if (typeof corpus.provenance.realFirstSnapshotAt === "number" || corpus.provenance.realFirstSnapshotAt === null) {
    return { first: corpus.provenance.realFirstSnapshotAt as number | null, last: corpus.provenance.realLastSnapshotAt as number | null, days: Number(corpus.provenance.realSnapshotDays ?? 0) };
  }
  let first: number | null = null;
  let last: number | null = null;
  const days = new Set<number>();
  for (const snapshot of corpus.snapshots) {
    if (first === null || snapshot.asOf < first) first = snapshot.asOf;
    if (last === null || snapshot.asOf > last) last = snapshot.asOf;
    days.add(Math.floor(snapshot.asOf / DAY_MS));
  }
  return { first, last, days: days.size };
}
