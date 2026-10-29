// Outcome oracle (#578): builds TARGETS from the full corpus. It may read
// the future (that is what an outcome is) and is therefore never passed to a
// method; methods only get a `PointInTimeView`. Each outcome carries the
// instant it became known (`knownAt`), which the purged split uses.

import { DAY_MS, HOUR_MS, WINDOW_K, logValue, median, shrink } from "../math.js";
import type { BacktestCorpus, BtSnapshot, BtVideo } from "./corpus.js";

export const OUTCOME_MIN_AGE_HOURS = 28 * 24;
export const OUTCOME_MAX_AGE_HOURS = 56 * 24;

export interface VideoOutcome {
  videoId: string;
  creatorId: string;
  postedAt: number;
  /** ln(1 + views) at the first snapshot aged 28-56 days. */
  logViews: number;
  /** Creator-relative: logViews minus the creator's prior mature median (shrunk to the niche). */
  logMultiplier: number;
  baselineN: number;
  knownAt: number;
}

export interface OutcomeOracle {
  outcome(videoId: string): VideoOutcome | null;
  all(): VideoOutcome[];
  /** Followers nearest `at` from any snapshot (oracle side only). */
  followersNear(creatorId: string, at: number): number | null;
  videos(): readonly BtVideo[];
  video(id: string): BtVideo | null;
  niche(creatorId: string): string | null;
  /** Units of a video on an axis, from full metadata (no availability gate). */
  units(videoId: string, axis: "format" | "hook" | "sound" | "hashtag"): string[];
  /** Every snapshot of a video, oldest first (oracle side: lead-time measurement). */
  snapshots(videoId: string): readonly BtSnapshot[];
}

export function buildOutcomeOracle(corpus: BacktestCorpus): OutcomeOracle {
  const excluded = new Set(corpus.creators.filter((creator) => creator.group === "anomaly").map((creator) => creator.id));
  const niche = new Map(corpus.creators.map((creator) => [creator.id, creator.niche]));
  const platformOf = new Map(corpus.creators.map((creator) => [creator.id, creator.platform]));
  const videos = corpus.videos.filter((video) => !excluded.has(video.creatorId));
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const mature = new Map<string, BtSnapshot>();
  const allSnapshots = new Map<string, BtSnapshot[]>();
  for (const snapshot of corpus.snapshots) {
    (allSnapshots.get(snapshot.videoId) ?? allSnapshots.set(snapshot.videoId, []).get(snapshot.videoId)!).push(snapshot);
  }
  for (const list of allSnapshots.values()) list.sort((a, b) => a.asOf - b.asOf);
  for (const snapshot of corpus.snapshots) {
    if (snapshot.ageHours === null || snapshot.views === null) continue;
    if (snapshot.ageHours < OUTCOME_MIN_AGE_HOURS || snapshot.ageHours >= OUTCOME_MAX_AGE_HOURS) continue;
    const current = mature.get(snapshot.videoId);
    if (!current || snapshot.asOf < current.asOf) mature.set(snapshot.videoId, snapshot);
  }
  // Raw mature logs first, then creator-relative multipliers against prior mature videos.
  const raw = new Map<string, { video: BtVideo; logViews: number; knownAt: number }>();
  for (const video of videos) {
    const snapshot = mature.get(video.id);
    if (!snapshot || video.postedAt === null) continue;
    raw.set(video.id, { video, logViews: logValue(snapshot.views!), knownAt: snapshot.asOf });
  }
  const nicheValues = new Map<string, number[]>();
  for (const entry of raw.values()) {
    const key = `${platformOf.get(entry.video.creatorId)}|${niche.get(entry.video.creatorId) ?? "unknown"}`;
    (nicheValues.get(key) ?? nicheValues.set(key, []).get(key)!).push(entry.logViews);
  }
  const nicheMedian = new Map([...nicheValues].map(([key, values]) => [key, median(values)!]));
  const byCreator = new Map<string, Array<{ video: BtVideo; logViews: number; knownAt: number }>>();
  for (const entry of raw.values()) (byCreator.get(entry.video.creatorId) ?? byCreator.set(entry.video.creatorId, []).get(entry.video.creatorId)!).push(entry);
  const outcomes = new Map<string, VideoOutcome>();
  for (const list of byCreator.values()) {
    list.sort((a, b) => a.video.postedAt! - b.video.postedAt! || (a.video.id < b.video.id ? -1 : 1));
    list.forEach((entry, index) => {
      const prior = list.slice(Math.max(0, index - WINDOW_K), index).map((other) => other.logViews);
      const key = `${platformOf.get(entry.video.creatorId)}|${niche.get(entry.video.creatorId) ?? "unknown"}`;
      const baseline = shrink(median(prior), prior.length, nicheMedian.get(key) ?? null);
      if (baseline === null) return;
      outcomes.set(entry.video.id, {
        videoId: entry.video.id,
        creatorId: entry.video.creatorId,
        postedAt: entry.video.postedAt!,
        logViews: entry.logViews,
        logMultiplier: entry.logViews - baseline,
        baselineN: prior.length,
        knownAt: entry.knownAt,
      });
    });
  }
  const followers = new Map<string, Array<{ asOf: number; followers: number }>>();
  for (const snapshot of corpus.creatorSnapshots) {
    if (snapshot.followers === null) continue;
    (followers.get(snapshot.creatorId) ?? followers.set(snapshot.creatorId, []).get(snapshot.creatorId)!).push({ asOf: snapshot.asOf, followers: snapshot.followers });
  }
  return {
    outcome: (videoId) => outcomes.get(videoId) ?? null,
    all: () => [...outcomes.values()],
    followersNear: (creatorId, at) => {
      let best: { distance: number; followers: number } | null = null;
      for (const snapshot of followers.get(creatorId) ?? []) {
        const distance = Math.abs(snapshot.asOf - at);
        if (!best || distance < best.distance) best = { distance, followers: snapshot.followers };
      }
      return best?.followers ?? null;
    },
    videos: () => videos,
    video: (id) => videoById.get(id) ?? null,
    niche: (creatorId) => niche.get(creatorId) ?? null,
    units: (videoId, axis) => {
      const video = videoById.get(videoId);
      if (!video) return [];
      if (axis === "sound") return video.soundKey ? [video.soundKey] : [];
      if (axis === "hashtag") return [...new Set(video.hashtags)];
      const label = video.labels[axis]?.label;
      return label && label !== "unknown" ? [label] : [];
    },
    snapshots: (videoId) => allSnapshots.get(videoId) ?? [],
  };
}

export const OUTCOME_HORIZON_MS = OUTCOME_MIN_AGE_HOURS * HOUR_MS;
export const OUTCOME_HORIZON_DAYS = OUTCOME_HORIZON_MS / DAY_MS;
