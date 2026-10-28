// Analytics import payload (#558) — the structured numbers an agent reads off a
// platform analytics screenshot (TikTok Studio, Instagram Insights, YouTube
// Studio) and hands to `ralphy analytics import`. The agent's own vision is
// the default extractor; `--extract` can pre-fill the same shape through
// callLLM(). Either way the payload is validated HERE before anything is
// written, and every human-format number ("12.3K", "45%", "0:12") is
// normalized by `cli/lib/analytics/metric-parse.ts`.
//
// Storage mapping (no schema migration — #556 owns domain-store migration 11):
//   metric_snapshots columns  ← views, likes, comments, shares, avgWatchTimeSec
//                               (avg_view_duration_sec), totalWatchTimeSec
//                               (watch_time_ms), retention (retention_curve_json,
//                               when every point is 0-100), capturedAt (as_of)
//   metric_snapshots.raw_json ← the versioned ANALYTICS_IMPORT_KIND envelope
//                               carrying everything else (saves, follows, reach,
//                               avg watch %, completion %, post date, video
//                               length, screenshot Object IDs, approximations).

import { z } from "zod";
import {
  MetricParseError,
  parseCountDetailed,
  parseInstant,
  parsePercentDetailed,
  parseSeconds,
} from "../analytics/metric-parse.js";

export const ANALYTICS_IMPORT_PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type AnalyticsImportPlatform = (typeof ANALYTICS_IMPORT_PLATFORMS)[number];

/** `kind` of the raw envelope stored with each imported snapshot. */
export const ANALYTICS_IMPORT_KIND = "ralphy.analytics-import";
export const ANALYTICS_IMPORT_VERSION = 1;

/** Count fields (whole numbers; "12.3K" accepted and flagged approximate). */
export const IMPORT_COUNT_FIELDS = [
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "follows",
] as const;
export type ImportCountField = (typeof IMPORT_COUNT_FIELDS)[number];

/**
 * Accepted spellings → canonical key. Agents copy labels from the screen, so
 * the common snake_case / screen-label variants are folded before validation.
 * Unknown keys are still rejected (a typo must not silently drop a number).
 */
const KEY_ALIASES: Record<string, string> = {
  plays: "views",
  video_views: "views",
  accounts_reached: "reach",
  comment_count: "comments",
  saved: "saves",
  favorites: "saves",
  favourites: "saves",
  new_followers: "follows",
  followers_gained: "follows",
  subscribers: "follows",
  subscribers_gained: "follows",
  avg_watch_time_s: "avgWatchTimeSec",
  avg_watch_time_sec: "avgWatchTimeSec",
  avg_watch_time: "avgWatchTimeSec",
  average_watch_time: "avgWatchTimeSec",
  avgWatchTimeS: "avgWatchTimeSec",
  avgWatchTime: "avgWatchTimeSec",
  average_view_duration: "avgWatchTimeSec",
  total_watch_time: "totalWatchTimeSec",
  total_play_time: "totalWatchTimeSec",
  total_watch_time_s: "totalWatchTimeSec",
  totalPlayTime: "totalWatchTimeSec",
  watch_time: "totalWatchTimeSec",
  avg_watch_pct: "avgWatchPct",
  avg_watch_percent: "avgWatchPct",
  average_percentage_viewed: "avgWatchPct",
  avgPercentViewed: "avgWatchPct",
  completion_pct: "completionPct",
  completion_rate: "completionPct",
  watched_full_video: "completionPct",
  watchedFullVideo: "completionPct",
  retention_points: "retention",
  retentionPoints: "retention",
  retention_curve: "retention",
  retentionCurve: "retention",
  captured_at: "capturedAt",
  post_date: "postedAt",
  postDate: "postedAt",
  posted_at: "postedAt",
  published_at: "postedAt",
  publishedAt: "postedAt",
  video_duration_s: "videoDurationSec",
  video_duration: "videoDurationSec",
  videoDuration: "videoDurationSec",
  duration_s: "videoDurationSec",
  durationSec: "videoDurationSec",
  post_id: "postId",
};

type Approximation = { field: string; reading: string };

function countField() {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      return parseCountDetailed(value).value;
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issueMessage(error) });
      return z.NEVER;
    }
  });
}

function percentField(max: number) {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      return parsePercentDetailed(value, max).value;
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issueMessage(error) });
      return z.NEVER;
    }
  });
}

function secondsField() {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      return parseSeconds(value);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issueMessage(error) });
      return z.NEVER;
    }
  });
}

function instantField() {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      return parseInstant(value);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issueMessage(error) });
      return z.NEVER;
    }
  });
}

/** Zod already reports the field path; the message carries the reading problem. */
function issueMessage(error: unknown): string {
  return error instanceof MetricParseError || error instanceof Error ? error.message : String(error);
}

/**
 * One retention reading: `t` seconds into the video, `pct` of viewers still
 * watching. YouTube Shorts can report above 100% (rewatches), so points are
 * accepted up to 1000%; only an all-0-100 curve is stored in the column.
 */
export const RetentionPointSchema = z
  .object({
    t: secondsField(),
    pct: percentField(1000),
  })
  .strict();

export const AnalyticsImportDataSchema = z
  .object({
    platform: z.enum(ANALYTICS_IMPORT_PLATFORMS).optional(),
    views: countField().optional(),
    reach: countField().optional(),
    likes: countField().optional(),
    comments: countField().optional(),
    shares: countField().optional(),
    saves: countField().optional(),
    follows: countField().optional(),
    /** Average watch time per view, seconds. */
    avgWatchTimeSec: secondsField().optional(),
    /** Total watch / play time across all views, seconds. */
    totalWatchTimeSec: secondsField().optional(),
    /** Average percentage viewed (0-1000: looping Shorts exceed 100). */
    avgWatchPct: percentField(1000).optional(),
    /** Share of views that watched to the end, 0-100. */
    completionPct: percentField(100).optional(),
    retention: z.array(RetentionPointSchema).max(200).optional(),
    /** Length of the posted video, seconds (lets avg watch % be derived). */
    videoDurationSec: secondsField().optional(),
    /** When the screenshot was taken (defaults to import time). */
    capturedAt: instantField().optional(),
    /** When the post went live. */
    postedAt: instantField().optional(),
    url: z
      .string()
      .url()
      .max(2048)
      .refine((value) => /^https?:\/\//iu.test(value), "url must be an http(s) link")
      .optional(),
    postId: z.string().min(1).max(256).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasMetric =
      IMPORT_COUNT_FIELDS.some((field) => data[field] !== undefined) ||
      data.avgWatchTimeSec !== undefined ||
      data.totalWatchTimeSec !== undefined ||
      data.avgWatchPct !== undefined ||
      data.completionPct !== undefined ||
      (data.retention?.length ?? 0) > 0;
    if (!hasMetric) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least one metric is required (views, likes, avgWatchTimeSec, completionPct, retention, …)",
      });
    }
    if (data.postedAt !== undefined && data.capturedAt !== undefined && data.postedAt > data.capturedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "postedAt must not be after capturedAt",
        path: ["postedAt"],
      });
    }
  });

export type AnalyticsImportData = z.infer<typeof AnalyticsImportDataSchema>;

export interface ParsedAnalyticsImport {
  data: AnalyticsImportData;
  /** Fields the platform printed abbreviated ("12.3K") — rounded, not exact. */
  approximations: Approximation[];
  /** Plausibility notes for the confirmation step; never block the import. */
  warnings: string[];
}

/** Fold alias keys into canonical keys. A key given twice (alias + canonical) is an error. */
export function normalizeImportKeys(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const canonical = KEY_ALIASES[key] ?? key;
    if (Object.hasOwn(out, canonical)) {
      throw new MetricParseError(`"${key}" duplicates "${canonical}"; pass it once`);
    }
    out[canonical] = value;
  }
  return out;
}

/**
 * Validate + normalize an agent-extracted payload. Throws a ZodError (field
 * paths + messages) or MetricParseError on bad input. Returns the canonical
 * numbers plus approximation and plausibility notes for the confirm step.
 */
export function parseAnalyticsImport(input: unknown): ParsedAnalyticsImport {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new MetricParseError("analytics data must be a JSON object");
  }
  const normalized = normalizeImportKeys(input as Record<string, unknown>);
  const data = AnalyticsImportDataSchema.parse(normalized);
  const approximations: Approximation[] = [];
  for (const field of IMPORT_COUNT_FIELDS) {
    const reading = normalized[field];
    if (typeof reading === "string" && parseCountDetailed(reading).approximate) {
      approximations.push({ field, reading });
    }
  }
  return { data, approximations, warnings: plausibilityWarnings(data, normalized) };
}

function plausibilityWarnings(data: AnalyticsImportData, raw: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const views = data.views;
  for (const field of ["likes", "comments", "shares", "saves", "follows"] as const) {
    const value = data[field];
    if (views !== undefined && value !== undefined && value > views) {
      warnings.push(`${field} (${value}) exceeds views (${views}) — check the fields were not swapped`);
    }
  }
  if (views !== undefined && data.reach !== undefined && data.reach > views) {
    warnings.push(`reach (${data.reach}) exceeds views (${views}) — reach counts accounts, views count plays`);
  }
  for (const field of ["avgWatchPct", "completionPct"] as const) {
    const reading = raw[field];
    if (typeof reading === "number" && reading > 0 && reading <= 1) {
      warnings.push(`${field} ${reading} looks like a ratio; percentages are 0-100 (did you mean ${reading * 100}?)`);
    }
  }
  if (
    data.avgWatchTimeSec !== undefined &&
    data.videoDurationSec !== undefined &&
    data.avgWatchTimeSec > data.videoDurationSec * 3
  ) {
    warnings.push(
      `avgWatchTimeSec (${data.avgWatchTimeSec}s) is over 3x the video length (${data.videoDurationSec}s) — check minutes vs seconds`,
    );
  }
  if (data.retention && data.videoDurationSec !== undefined) {
    const beyond = data.retention.filter((point) => point.t > data.videoDurationSec! + 1);
    if (beyond.length > 0) warnings.push(`${beyond.length} retention point(s) fall after the video length`);
  }
  if (data.capturedAt === undefined) warnings.push("capturedAt not given — the import time is used");
  if (data.postedAt === undefined) warnings.push("postedAt not given — rolling baselines order this post by capture time");
  return warnings;
}

/** The versioned envelope stored in metric_snapshots.raw_json. */
export interface AnalyticsImportEnvelope {
  kind: typeof ANALYTICS_IMPORT_KIND;
  version: typeof ANALYTICS_IMPORT_VERSION;
  platform: AnalyticsImportPlatform;
  capturedAt: number;
  postedAt: number | null;
  reach: number | null;
  saves: number | null;
  follows: number | null;
  avgWatchTimeSec: number | null;
  totalWatchTimeSec: number | null;
  avgWatchPct: number | null;
  completionPct: number | null;
  videoDurationSec: number | null;
  retention: Array<{ t: number; pct: number }> | null;
  approximateFields: string[];
  extractedBy: "agent" | "vision-extract";
  screenshots: Array<{ objectId: string; artifactRevisionId: string; fileName: string; bytes: number }>;
  postId: string | null;
  notes: string | null;
}
