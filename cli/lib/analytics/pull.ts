// Analytics pull (#507) — shared by the `ralphy analytics pull` verb and the
// `analytics-pull` node executor. For each unit publish record with a postId,
// fetch per-post metrics through a registered connector and APPEND a
// timestamped snapshot line to `<unit>/analytics.jsonl` (invariant #14: the
// file only ever grows — every invocation appends a new snapshot; deltas
// between snapshots are the point, so "idempotent" here means append-a-new-
// timestamped-line, never rewrite).
//
// ROUTING per publish record (the issue's contract):
//   • target "youtube" → the youtube-analytics connector (Data API v3
//     statistics via YOUTUBE_API_KEY). A Postiz-backed youtube record carries
//     a POSTIZ post id, not necessarily a YouTube video id — when the video
//     lookup returns no item, the pull FALLS BACK to the Postiz passthrough.
//   • every other target → the Postiz per-post analytics passthrough
//     (`postizMetrics`, degrades gracefully — see providers/postiz.ts #507).
//   A record no connector can serve becomes a `skipped` row with a note,
//   never an abort: partial coverage beats a dead batch.
//
// DUE-OFFSET semantics (the executor's schedule param, e.g. ["+1d", "+7d"]):
// a record is DUE for offset o when `now >= publishedAt + o` AND the last
// snapshot for that (target, postId) predates `publishedAt + o` — i.e. each
// offset wants exactly one snapshot at-or-after its due time. `publishedAt`
// is the publish record's `at`. The runner fires the node on its cron; this
// module decides which records that tick actually pulls.

import fs from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  AnalyticsSnapshotSchema,
  type AnalyticsMetrics,
  type AnalyticsSnapshot,
} from "../schemas/analytics.js";
import type { UnitPublishRecord } from "../schemas/unit.js";
import { projectDir } from "../paths.js";
import { readUnitManifest, unitDirFor } from "../publish/publish.js";
import {
  youtubeAnalyticsAvailable,
  youtubeVideoStatistics,
  type FetchLike,
} from "../providers/youtube-analytics.js";
import { postizAvailable, postizMetrics } from "../providers/postiz.js";

// ─── snapshot store (append-only JSONL) ──────────────────────────────────────

export function analyticsPath(unitDir: string): string {
  return path.join(unitDir, "analytics.jsonl");
}

/** Read a unit's snapshots. Tolerant: malformed lines are skipped, not fatal. */
export function readSnapshots(unitDir: string): AnalyticsSnapshot[] {
  const fp = analyticsPath(unitDir);
  if (!existsSync(fp)) return [];
  const out: AnalyticsSnapshot[] = [];
  for (const line of readFileSync(fp, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(AnalyticsSnapshotSchema.parse(JSON.parse(line)));
    } catch {
      /* tolerate a foreign/malformed line */
    }
  }
  return out;
}

/** APPEND snapshots (validated). Never rewrites — one new line per snapshot. */
export async function appendSnapshots(
  unitDir: string,
  snapshots: AnalyticsSnapshot[],
): Promise<string> {
  const fp = analyticsPath(unitDir);
  const lines = snapshots.map((s) => JSON.stringify(AnalyticsSnapshotSchema.parse(s)) + "\n");
  if (lines.length > 0) await fs.appendFile(fp, lines.join(""), "utf8");
  return fp;
}

// ─── due-offset logic ────────────────────────────────────────────────────────

export const DEFAULT_PULL_OFFSETS = ["+1d", "+7d"] as const;

const OFFSET_RE = /^\+?(\d+)([mhdw])$/;
const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** `"+1d"` / `"12h"` / `"+30m"` / `"+2w"` → milliseconds. Throws on nonsense. */
export function parseOffset(offset: string): number {
  const m = OFFSET_RE.exec(offset.trim());
  if (!m) throw new Error(`invalid analytics offset '${offset}' (expected e.g. "+1d", "+12h", "+30m")`);
  return Number(m[1]) * UNIT_MS[m[2]!]!;
}

/** Newest snapshot time (ms) for a (target, postId) pair, or null. */
export function lastSnapshotMs(
  snapshots: AnalyticsSnapshot[],
  target: string,
  postId: string,
): number | null {
  let last: number | null = null;
  for (const s of snapshots) {
    if (s.target !== target || s.postId !== postId) continue;
    const t = Date.parse(s.at);
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  }
  return last;
}

/**
 * The offsets a publish record is currently due for: elapsed AND not yet
 * served by a snapshot at-or-after their due time. Empty array = nothing due.
 */
export function dueOffsets(
  record: Pick<UnitPublishRecord, "at" | "target" | "postId">,
  offsets: readonly string[],
  snapshots: AnalyticsSnapshot[],
  now: number = Date.now(),
): string[] {
  if (!record.postId) return [];
  const publishedAt = Date.parse(record.at);
  if (!Number.isFinite(publishedAt)) return [];
  const served = lastSnapshotMs(snapshots, record.target, record.postId);
  return offsets.filter((o) => {
    const dueAt = publishedAt + parseOffset(o);
    return now >= dueAt && (served === null || served < dueAt);
  });
}

// ─── the pull run ────────────────────────────────────────────────────────────

export interface PullRecordResult {
  target: string;
  postId: string;
  status: "fetched" | "skipped";
  source?: "youtube-analytics" | "postiz";
  metrics?: AnalyticsMetrics;
  note?: string;
}

export interface UnitPullResult {
  slug: string;
  records: PullRecordResult[];
  /** Snapshots appended this invocation (== the fetched records). */
  appended: number;
  analyticsPath: string | null;
}

export interface PullUnitOptions {
  projectId: string;
  slug: string;
  /** Restrict to one target platform. */
  target?: string;
  /** Postiz analytics lookback window (days). */
  days?: number;
  /**
   * When set, only records DUE per these offsets are pulled (the executor's
   * schedule param); others become `skipped` rows with a "not due" note.
   * Unset (the CLI verb) = pull every publishable record now.
   */
  offsets?: readonly string[];
  /** Injectable clock for the due decision (tests). */
  now?: number;
  /** Injectable fetch (zero-network tests) — shared by both connectors. */
  fetchImpl?: FetchLike;
}

/** Fetch metrics for ONE publish record, following the routing contract. */
async function fetchRecordMetrics(
  record: UnitPublishRecord & { postId: string },
  days: number,
  fetchImpl: FetchLike,
): Promise<PullRecordResult> {
  const base = { target: record.target, postId: record.postId };

  const viaPostiz = async (prefixNote?: string): Promise<PullRecordResult> => {
    if (!postizAvailable()) {
      return {
        ...base,
        status: "skipped",
        note: `${prefixNote ? `${prefixNote}; ` : ""}postiz not configured (POSTIZ_API_KEY + POSTIZ_BASE_URL)`,
      };
    }
    const r = await postizMetrics(record.postId, days, fetchImpl);
    if (!r.ok) return { ...base, status: "skipped", note: prefixNote ? `${prefixNote}; ${r.note}` : r.note };
    return {
      ...base,
      status: "fetched",
      source: "postiz",
      metrics: r.metrics,
      ...(prefixNote && { note: prefixNote }),
    };
  };

  if (record.target === "youtube" && youtubeAnalyticsAvailable()) {
    try {
      const stats = await youtubeVideoStatistics(record.postId, fetchImpl);
      if (stats) {
        return {
          ...base,
          status: "fetched",
          source: "youtube-analytics",
          metrics: stats,
          note: "youtube data-api statistics (retention/ctr need the OAuth Analytics API — named follow-up)",
        };
      }
      // postId is not a resolvable YouTube video id (Postiz-internal id) —
      // fall back to the passthrough that DOES understand it.
      return viaPostiz(`youtube video ${record.postId} not found via data api`);
    } catch (e) {
      return viaPostiz(`youtube data api failed: ${(e as Error).message}`);
    }
  }
  if (record.target === "youtube") {
    return viaPostiz("YOUTUBE_API_KEY not set");
  }
  return viaPostiz();
}

/**
 * Pull metrics for one unit's publish records and append the snapshots.
 * Records without a postId or with status "failed" never pull; a connector
 * miss is a `skipped` row, not an error. Returns per-record detail.
 */
export async function pullUnitAnalytics(opts: PullUnitOptions): Promise<UnitPullResult> {
  const fetchImpl = opts.fetchImpl ?? (fetch as FetchLike);
  const days = opts.days ?? 7;
  const unitDir = unitDirFor(opts.projectId, opts.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) throw new Error(`unit '${opts.slug}' not found in project '${opts.projectId}'`);

  const snapshots = readSnapshots(unitDir);
  const records: PullRecordResult[] = [];
  const toAppend: AnalyticsSnapshot[] = [];
  const seen = new Set<string>();
  const at = new Date(opts.now ?? Date.now()).toISOString();

  for (const record of manifest.publish ?? []) {
    if (!record.postId || record.status === "failed") continue;
    if (opts.target && record.target !== opts.target) continue;
    const key = `${record.target} ${record.postId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (opts.offsets) {
      const due = dueOffsets(record, opts.offsets, snapshots, opts.now ?? Date.now());
      if (due.length === 0) {
        records.push({
          target: record.target,
          postId: record.postId,
          status: "skipped",
          note: `not due (offsets ${opts.offsets.join(", ")} all served or not yet elapsed)`,
        });
        continue;
      }
    }

    const result = await fetchRecordMetrics(record as UnitPublishRecord & { postId: string }, days, fetchImpl);
    records.push(result);
    if (result.status === "fetched" && result.source && result.metrics) {
      toAppend.push({
        at,
        target: result.target,
        postId: result.postId,
        source: result.source,
        metrics: result.metrics,
        ...(result.note && { note: result.note }),
      });
    }
  }

  const fp = toAppend.length > 0 ? await appendSnapshots(unitDir, toAppend) : null;
  return { slug: opts.slug, records, appended: toAppend.length, analyticsPath: fp };
}

/** The project's unit slugs (dirs under `<project>/units/` with a unit.json). */
export function listUnitSlugs(projectId: string): string[] {
  const unitsDir = path.join(projectDir(projectId), "units");
  if (!existsSync(unitsDir)) return [];
  return readdirSync(unitsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(unitsDir, e.name, "unit.json")))
    .map((e) => e.name)
    .sort();
}

export interface ProjectPullResult {
  project: string;
  units: UnitPullResult[];
  fetched: number;
  skipped: number;
}

/** Pull across a whole project (or one unit when `slug` is given). */
export async function pullProjectAnalytics(
  opts: Omit<PullUnitOptions, "slug"> & { slug?: string },
): Promise<ProjectPullResult> {
  const slugs = opts.slug ? [opts.slug] : listUnitSlugs(opts.projectId);
  const units: UnitPullResult[] = [];
  for (const slug of slugs) {
    units.push(await pullUnitAnalytics({ ...opts, slug }));
  }
  const all = units.flatMap((u) => u.records);
  return {
    project: opts.projectId,
    units,
    fetched: all.filter((r) => r.status === "fetched").length,
    skipped: all.filter((r) => r.status === "skipped").length,
  };
}
