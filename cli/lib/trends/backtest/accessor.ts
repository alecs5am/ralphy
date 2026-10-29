// Point-in-time data accessor (#578). The only way a method reads the corpus.
//
// A view at time `t` exposes exactly what the corpus knew strictly before `t`:
// videos discovered before `t`, snapshots with `asOf < t`, follower snapshots
// with `asOf < t`, and content labels whose `availableAt < t`. The view holds
// no reference to the corpus object, every returned row is frozen, and any
// call that names an instant after `t` throws `LookAheadError`. Methods
// receive only a view; the outcome oracle that builds targets lives in
// `outcomes.ts` and is never handed to a method.

import { DAY_MS } from "../math.js";
import type { BacktestCorpus, BtCreator, BtCreatorSnapshot, BtSnapshot, BtVideo, LabelAxis } from "./corpus.js";

export class LookAheadError extends Error {
  constructor(readonly viewTime: number, readonly requested: number, what: string) {
    super(`look-ahead: ${what} at ${new Date(requested).toISOString()} from a view at ${new Date(viewTime).toISOString()}`);
    this.name = "LookAheadError";
  }
}

/** Static, time-independent video metadata (no metrics, no labels). */
export interface VisibleVideo {
  readonly id: string;
  readonly creatorId: string;
  readonly platform: BtVideo["platform"];
  readonly postedAt: number | null;
  readonly discoveredAt: number;
  readonly durationMs: number | null;
  readonly hashtags: readonly string[];
  readonly soundKey: string | null;
}

export interface PointInTimeView {
  readonly t: number;
  video(id: string): VisibleVideo | null;
  /** Videos discovered before `t`, in discovery order. */
  videos(): VisibleVideo[];
  /** A creator's visible videos ordered by post time (undated last). */
  creatorVideos(creatorId: string): VisibleVideo[];
  /** Snapshots with `asOf < t`, oldest first. */
  snapshots(videoId: string): readonly BtSnapshot[];
  latest(videoId: string): BtSnapshot | null;
  creator(id: string): BtCreator | null;
  creators(): readonly BtCreator[];
  creatorSnapshots(creatorId: string): readonly BtCreatorSnapshot[];
  /** Followers nearest `at` (default `t`) within 14 days, from snapshots before `t`. */
  followersAt(creatorId: string, at?: number): number | null;
  /** Content units of one axis available before `t` (a label, the sound key, or every hashtag). */
  units(videoId: string, axis: LabelAxis): string[];
  /** A narrower view at `earlier <= t`. */
  at(earlier: number): PointInTimeView;
}

export interface CorpusIndex {
  readonly start: number | null;
  readonly end: number | null;
  view(t: number): PointInTimeView;
}

function lowerBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid]! < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

interface VideoEntry {
  visible: VisibleVideo;
  labels: BtVideo["labels"];
  snapshots: readonly BtSnapshot[];
  snapshotTimes: number[];
}

/** Index a corpus once; views are O(1) to create and O(log n) to query. */
export function indexCorpus(corpus: BacktestCorpus): CorpusIndex {
  const excluded = new Set(corpus.creators.filter((creator) => creator.group === "anomaly").map((creator) => creator.id));
  const creators = new Map<string, BtCreator>();
  for (const creator of corpus.creators) if (!excluded.has(creator.id)) creators.set(creator.id, Object.freeze({ ...creator }));
  const creatorList = Object.freeze([...creators.values()]);

  const snapshotsByVideo = new Map<string, BtSnapshot[]>();
  let start: number | null = null;
  let end: number | null = null;
  for (const snapshot of corpus.snapshots) {
    const list = snapshotsByVideo.get(snapshot.videoId) ?? [];
    list.push(Object.freeze({ ...snapshot }));
    snapshotsByVideo.set(snapshot.videoId, list);
    if (start === null || snapshot.asOf < start) start = snapshot.asOf;
    if (end === null || snapshot.asOf > end) end = snapshot.asOf;
  }

  const entries = new Map<string, VideoEntry>();
  for (const video of corpus.videos) {
    if (excluded.has(video.creatorId) || !creators.has(video.creatorId)) continue;
    const snapshots = (snapshotsByVideo.get(video.id) ?? []).sort((a, b) => a.asOf - b.asOf);
    entries.set(video.id, {
      visible: Object.freeze({
        id: video.id,
        creatorId: video.creatorId,
        platform: video.platform,
        postedAt: video.postedAt,
        discoveredAt: video.discoveredAt,
        durationMs: video.durationMs,
        hashtags: Object.freeze([...video.hashtags]),
        soundKey: video.soundKey,
      }),
      labels: video.labels,
      snapshots: Object.freeze(snapshots),
      snapshotTimes: snapshots.map((snapshot) => snapshot.asOf),
    });
  }
  const byDiscovery = [...entries.values()].sort((a, b) => a.visible.discoveredAt - b.visible.discoveredAt || (a.visible.id < b.visible.id ? -1 : 1));
  const discoveryTimes = byDiscovery.map((entry) => entry.visible.discoveredAt);
  const byCreator = new Map<string, VideoEntry[]>();
  for (const entry of entries.values()) {
    const list = byCreator.get(entry.visible.creatorId) ?? [];
    list.push(entry);
    byCreator.set(entry.visible.creatorId, list);
  }
  for (const list of byCreator.values()) {
    list.sort((a, b) => (a.visible.postedAt ?? Infinity) - (b.visible.postedAt ?? Infinity) || (a.visible.id < b.visible.id ? -1 : 1));
  }
  const creatorSnapshots = new Map<string, BtCreatorSnapshot[]>();
  for (const snapshot of corpus.creatorSnapshots) {
    if (!creators.has(snapshot.creatorId)) continue;
    const list = creatorSnapshots.get(snapshot.creatorId) ?? [];
    list.push(Object.freeze({ ...snapshot }));
    creatorSnapshots.set(snapshot.creatorId, list);
  }
  const creatorSnapshotTimes = new Map<string, number[]>();
  for (const [creatorId, list] of creatorSnapshots) {
    list.sort((a, b) => a.asOf - b.asOf);
    creatorSnapshotTimes.set(creatorId, list.map((snapshot) => snapshot.asOf));
  }

  const makeView = (t: number): PointInTimeView => {
    if (!Number.isFinite(t)) throw new Error("view time must be finite");
    const guard = (instant: number, what: string) => {
      if (instant > t) throw new LookAheadError(t, instant, what);
    };
    const entryFor = (id: string): VideoEntry | null => {
      const entry = entries.get(id);
      return entry && entry.visible.discoveredAt < t ? entry : null;
    };
    const visibleSnapshots = (entry: VideoEntry): readonly BtSnapshot[] => entry.snapshots.slice(0, lowerBound(entry.snapshotTimes, t));
    const visibleCreatorSnapshots = (creatorId: string): readonly BtCreatorSnapshot[] => {
      const list = creatorSnapshots.get(creatorId);
      if (!list) return [];
      return list.slice(0, lowerBound(creatorSnapshotTimes.get(creatorId)!, t));
    };
    const view: PointInTimeView = {
      t,
      video: (id) => entryFor(id)?.visible ?? null,
      videos: () => byDiscovery.slice(0, lowerBound(discoveryTimes, t)).map((entry) => entry.visible),
      creatorVideos: (creatorId) => (byCreator.get(creatorId) ?? []).filter((entry) => entry.visible.discoveredAt < t).map((entry) => entry.visible),
      snapshots: (videoId) => {
        const entry = entryFor(videoId);
        return entry ? visibleSnapshots(entry) : [];
      },
      latest: (videoId) => {
        const entry = entryFor(videoId);
        if (!entry) return null;
        const index = lowerBound(entry.snapshotTimes, t) - 1;
        return index >= 0 ? entry.snapshots[index]! : null;
      },
      creator: (id) => creators.get(id) ?? null,
      creators: () => creatorList,
      creatorSnapshots: visibleCreatorSnapshots,
      followersAt: (creatorId, at = t) => {
        guard(at, `followers of ${creatorId}`);
        let best: { distance: number; followers: number } | null = null;
        for (const snapshot of visibleCreatorSnapshots(creatorId)) {
          if (snapshot.followers === null || snapshot.followers < 0) continue;
          const distance = Math.abs(snapshot.asOf - at);
          if (distance > 14 * DAY_MS) continue;
          if (!best || distance < best.distance) best = { distance, followers: snapshot.followers };
        }
        return best?.followers ?? null;
      },
      units: (videoId, axis) => {
        const entry = entryFor(videoId);
        if (!entry) return [];
        if (axis === "sound") return entry.visible.soundKey ? [entry.visible.soundKey] : [];
        if (axis === "hashtag") return [...new Set(entry.visible.hashtags)];
        const label = entry.labels[axis];
        return label && label.availableAt < t && label.label !== "unknown" ? [label.label] : [];
      },
      at: (earlier) => {
        guard(earlier, "a narrower view");
        return makeView(earlier);
      },
    };
    return Object.freeze(view);
  };
  return Object.freeze({ start, end, view: makeView });
}
