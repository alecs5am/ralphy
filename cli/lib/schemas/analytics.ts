// Analytics snapshot Zod schema (#507) — the metrics feedback loop's storage
// shape. Snapshots live at `<project>/units/<slug>/analytics.jsonl`, one JSON
// line per fetch, APPEND-ONLY (invariant #14): `ralphy analytics pull` and the
// `analytics-pull` node executor only ever append a new timestamped line —
// prior snapshots are never rewritten, so the file is the unit's full
// performance history and deltas between snapshots are first-class facts.
//
// A SEPARATE schema file (not an extension of unit.ts): analytics.jsonl is a
// sibling store keyed by the unit's publish provenance (`UnitPublishRecord`'s
// target + postId are the join key), not a `unit.json` field — keeping it out
// of the manifest keeps unit.json compact and the append path a one-line
// `fs.appendFile`, never a manifest rewrite.
//
// Metric fields are deliberately tolerant (`.passthrough()` + all-optional):
// each platform exposes a different subset (YouTube Data API v3 gives
// views/likes/comments with an API key; retention curves need the OAuth
// Analytics API — a named follow-up in the youtube-analytics connector;
// Postiz's per-post analytics vary by provider), and a snapshot must never be
// dropped because a source grew an extra field.

import { z } from "zod";

/** Where a snapshot's numbers came from. */
export const ANALYTICS_SOURCES = ["youtube-analytics", "postiz"] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

/**
 * One point of an audience-retention curve. Shape is API-tolerant: the OAuth
 * YouTube Analytics API reports elapsed-video-time ratios + watch ratios;
 * other sources may use different keys, which passthrough preserves.
 */
export const RetentionPointSchema = z
  .object({
    /** Position in the video, 0-100 (percent of duration). */
    pct: z.number().optional(),
    /** Fraction of viewers still watching at that position. */
    watchRatio: z.number().optional(),
  })
  .passthrough();

export type RetentionPoint = z.infer<typeof RetentionPointSchema>;

/** The per-fetch metric set. Every field optional — sources differ. */
export const AnalyticsMetricsSchema = z
  .object({
    views: z.number().optional(),
    likes: z.number().optional(),
    shares: z.number().optional(),
    comments: z.number().optional(),
    /** Click-through rate, 0-1 (or the platform's native unit — tolerant). */
    ctr: z.number().optional(),
    retentionCurve: z.array(RetentionPointSchema).optional(),
    avgViewDurationSec: z.number().optional(),
  })
  .passthrough();

export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;

/** One appended line of `<unit>/analytics.jsonl`. */
export const AnalyticsSnapshotSchema = z.object({
  /** ISO timestamp of the FETCH (not the platform's reporting date). */
  at: z.string(),
  /** Target platform the metrics belong to ("youtube" | "tiktok" | ...). */
  target: z.string(),
  /** The publish record's postId — the join key into unit.json `publish[]`. */
  postId: z.string(),
  source: z.enum(ANALYTICS_SOURCES),
  metrics: AnalyticsMetricsSchema,
  /** Free-form fetch context (e.g. "youtube stats via API key; no retention"). */
  note: z.string().optional(),
});

export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;
