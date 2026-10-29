// Facts for the #590 adapt scorecard, gathered once per niche and shared by
// `trends signals`, `trends series`, and the niche report: visual format
// labels (#588) and which fresh series carry them, the series each video
// belongs to, within-creator contrast classes from the prediction ledgers
// (#577), and the niche's multiplier population for the percentile.
//
// Read-only. The scorecard itself is the pure `scorecard.ts`.

import { listPredictionLedgerDocuments } from "../store/trend-signals.js";
import { DEFAULT_MAX_AGE_DAYS, inFreshWindow } from "./freshness.js";
import { buildScorecard, percentileRank, type Scorecard } from "./scorecard.js";
import { isSponsored, parsePredictionLedger } from "./signals.js";
import type { SeriesItem } from "./series-report.js";
import type { VisualFormatLabel } from "./series.js";

export interface ReferenceIndex {
  now: number;
  maxAgeDays: number;
  noiseFloorViews: number | null;
  labelByVideo: ReadonlyMap<string, VisualFormatLabel>;
  seriesByVideo: ReadonlyMap<string, SeriesItem>;
  /** Visual format -> creators with a fresh labeled series of that format. */
  freshFormatCreators: ReadonlyMap<string, ReadonlySet<string>>;
  transferByVideo: ReadonlyMap<string, "transferable" | "creator-bound">;
  /** Sorted multipliers of judgeable in-window videos, per platform. */
  multipliers: ReadonlyMap<string, readonly number[]>;
  /** Judgeable in-window videos at >= 3x, per creator (A3 repeat hits). */
  hitsByCreator: ReadonlyMap<string, ReadonlySet<string>>;
}

export const REPEAT_HIT_MULTIPLIER = 3;

/** Within-creator contrast classes recorded on any prediction ledger of the niche. */
export function contrastClassByVideo(input: { workspaceId: string; niche: string }): Map<string, "transferable" | "creator-bound"> {
  const out = new Map<string, "transferable" | "creator-bound">();
  let documents: ReturnType<typeof listPredictionLedgerDocuments> = [];
  try {
    documents = listPredictionLedgerDocuments({ workspaceId: input.workspaceId });
  } catch {
    documents = [];
  }
  for (const document of documents) {
    const body = parsePredictionLedger(document.body);
    if (!body || body.niche !== input.niche) continue;
    for (const pick of body.picks) {
      if (!pick.videoId || pick.classification === "unclassified") continue;
      out.set(pick.videoId, pick.classification);
    }
  }
  return out;
}

/** Sorted multipliers per platform: the population behind the niche percentile. */
export function multiplierPopulation(videos: ReadonlyArray<{ platform: string; multiplier: number | null }>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const video of videos) {
    if (video.multiplier === null || !Number.isFinite(video.multiplier)) continue;
    (out.get(video.platform) ?? out.set(video.platform, []).get(video.platform)!).push(video.multiplier);
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

export function buildReferenceIndex(input: {
  now: number;
  maxAgeDays?: number;
  noiseFloorViews: number | null;
  labels: ReadonlyMap<string, VisualFormatLabel>;
  seriesItems: readonly SeriesItem[];
  transferByVideo: ReadonlyMap<string, "transferable" | "creator-bound">;
  /** Judgeable in-window videos of the scope: the percentile population and the repeat hits. */
  population: ReadonlyArray<{ platform: string; multiplier: number | null; creatorId: string; id?: string; videoId?: string }>;
}): ReferenceIndex {
  const hitsByCreator = new Map<string, Set<string>>();
  for (const video of input.population) {
    const id = video.videoId ?? video.id;
    if (!id || video.multiplier === null || video.multiplier < REPEAT_HIT_MULTIPLIER) continue;
    (hitsByCreator.get(video.creatorId) ?? hitsByCreator.set(video.creatorId, new Set()).get(video.creatorId)!).add(id);
  }
  const seriesByVideo = new Map<string, SeriesItem>();
  const freshFormatCreators = new Map<string, Set<string>>();
  for (const item of input.seriesItems) {
    // The primary series of a channel wins a video that two series share.
    for (const id of item.series.partIds) if (!seriesByVideo.has(id) || item.series.primary) seriesByVideo.set(id, item);
    if (item.label && item.freshness === "fresh") (freshFormatCreators.get(item.label.format) ?? freshFormatCreators.set(item.label.format, new Set()).get(item.label.format)!).add(item.creatorId);
  }
  return {
    now: input.now,
    maxAgeDays: input.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
    noiseFloorViews: input.noiseFloorViews,
    labelByVideo: input.labels,
    seriesByVideo,
    freshFormatCreators,
    transferByVideo: input.transferByVideo,
    multipliers: multiplierPopulation(input.population),
    hitsByCreator,
  };
}

export interface CardVideo {
  videoId: string;
  creatorId: string;
  platform: string;
  postedAt: number | null;
  views: number | null;
  viewsPrecision: string | null;
  multiplier: number | null;
  baselineN: number | null;
  flags: readonly string[];
  followers: number | null;
  sizeBand: string | null;
  title: string | null;
  hashtags: readonly string[];
  captionLabel: string | null;
}

const visualOf = (index: ReferenceIndex, videoId: string, series: SeriesItem | null): VisualFormatLabel | null =>
  index.labelByVideo.get(videoId) ?? series?.label ?? null;

/** Other creators (not this one) with a fresh labeled series of the same visual format. */
function otherCreators(index: ReferenceIndex, format: string | null, creatorId: string): number | null {
  if (!format) return null;
  const creators = index.freshFormatCreators.get(format);
  if (!creators) return 0;
  return [...creators].filter((id) => id !== creatorId).length;
}

/** Parts of a series posted inside the window, given the post time of each part. */
export function partsInWindow(item: SeriesItem, postedAtOf: (videoId: string) => number | null, now: number, maxAgeDays: number): number {
  return item.series.partIds.filter((id) => inFreshWindow(postedAtOf(id), now, maxAgeDays)).length;
}

/** Scorecard for one video row (signals, niche report lists). */
export function videoScorecard(index: ReferenceIndex, video: CardVideo, extra: { partsInWindow?: number | null; kind?: "video" | "series"; series?: SeriesItem } = {}): Scorecard {
  const series = extra.series ?? index.seriesByVideo.get(video.videoId) ?? null;
  const visual = visualOf(index, video.videoId, series);
  const population = index.multipliers.get(video.platform) ?? [];
  return buildScorecard({
    kind: extra.kind ?? "video",
    now: index.now,
    maxAgeDays: index.maxAgeDays,
    postedAt: video.postedAt,
    views: video.views,
    viewsPrecision: video.viewsPrecision,
    multiplier: video.multiplier,
    multiplierPercentile: percentileRank(population, video.multiplier),
    baselineN: video.baselineN,
    thin: video.flags.includes("thin"),
    provisional: video.flags.includes("provisional"),
    followers: video.followers,
    sizeBand: video.sizeBand,
    sponsored: video.flags.includes("sponsored") || isSponsored({ title: video.title, hashtags: video.hashtags }),
    visualFormat: visual ? { format: visual.format, confidence: visual.confidence } : null,
    captionLabel: video.captionLabel && video.captionLabel !== "unknown" ? video.captionLabel : null,
    visualFormatCreators: otherCreators(index, visual?.format ?? null, video.creatorId),
    creatorRepeatHits: [...(index.hitsByCreator.get(video.creatorId) ?? [])].filter((id) => id !== video.videoId).length,
    series: series ? { lift: series.series.lift, parts: series.series.parts, other: series.series.other, partsInWindow: extra.partsInWindow ?? null } : null,
    transfer: index.transferByVideo.get(video.videoId) ?? null,
    noiseFloorViews: index.noiseFloorViews,
  });
}
