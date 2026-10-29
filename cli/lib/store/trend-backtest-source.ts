// #578 backtest source: loads a FROZEN copy of the trend corpus into the
// in-memory `BacktestCorpus` shape. Opens the file read-only and never
// applies migrations, so it works on a `sqlite3 <db> ".backup <copy>"`
// snapshot while the live corpus keeps ingesting (opened immutable). Only dated snapshot rows
// and static metadata are read; the derived latest_* / outlier_* columns
// and the creator's latest follower count are deliberately not loaded (they
// would leak the future into a point-in-time replay).

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { BacktestCorpus, BtCreator, BtCreatorSnapshot, BtSnapshot, BtVideo } from "../trends/backtest/corpus.js";
import { HOUR_MS, isTrendPlatform } from "../trends/math.js";

const METHOD_RANK: Record<string, number> = { manual: 4, llm: 3, rule: 2, seed: 1 };
/** Same floor as the store's effective labels. */
const LLM_MIN_CONFIDENCE = 0.6;

/** Refuse a live database (a WAL sidecar means another process may be writing). */
export function assertFrozenCopy(dbPath: string): void {
  const resolved = path.resolve(dbPath);
  if (!fs.existsSync(resolved)) throw new Error(`backtest database not found: ${resolved}`);
  if (fs.existsSync(`${resolved}-wal`) && fs.statSync(`${resolved}-wal`).size > 0) {
    throw new Error(`refusing a live database with a WAL file (${resolved}-wal); copy it first: sqlite3 '${resolved}' ".backup <dest>"`);
  }
}

export function loadBacktestCorpus(input: { dbPath: string; workspaceId: string }): BacktestCorpus {
  assertFrozenCopy(input.dbPath);
  // `immutable=1`: the copy is frozen by contract, and a `.backup` of a WAL
  // database keeps the WAL header, which a plain read-only open cannot serve
  // without creating a -shm file next to it.
  const uriPath = path.resolve(input.dbPath).replaceAll("%", "%25").replaceAll("?", "%3f").replaceAll("#", "%23");
  const db = new Database(`file:${uriPath}?immutable=1`, { readonly: true });
  try {
    const memberships = new Map<string, { niche: string | null; group: BtCreator["group"] }>();
    for (const row of db
      .query<{ creator_id: string; slug: string; cohort_group: string | null }, [string]>(
        `SELECT m.creator_id, n.slug, m.cohort_group FROM trend_niche_members m JOIN trend_niches n ON n.id = m.niche_id
         WHERE n.workspace_id = ? AND m.status = 'kept' ORDER BY n.slug`,
      )
      .all(input.workspaceId)) {
      const current = memberships.get(row.creator_id);
      const group = row.cohort_group === "anomaly" || current?.group === "anomaly" ? "anomaly" : ((row.cohort_group as BtCreator["group"]) ?? current?.group ?? null);
      memberships.set(row.creator_id, { niche: current?.niche ?? row.slug, group });
    }
    const creators: BtCreator[] = db
      .query<{ id: string; platform: string; niche: string | null }, [string]>("SELECT id, platform, niche FROM trend_creators WHERE workspace_id = ?")
      .all(input.workspaceId)
      .filter((row) => isTrendPlatform(row.platform))
      .map((row) => ({
        id: row.id,
        platform: row.platform as BtCreator["platform"],
        niche: row.niche ?? memberships.get(row.id)?.niche ?? null,
        group: memberships.get(row.id)?.group ?? null,
      }));

    const labels = new Map<string, Partial<Record<"format" | "hook", { label: string; rank: number; version: number; createdAt: number; method: string }>>>();
    for (const row of db
      .query<{ video_id: string; axis: "format" | "hook"; label: string; method: string; confidence: number | null; taxonomy_version: number; created_at: number }, [string]>(
        `SELECT l.video_id, l.axis, l.label, l.method, l.confidence, l.taxonomy_version, l.created_at
         FROM trend_cohort_labels l JOIN trend_videos v ON v.id = l.video_id
         WHERE v.workspace_id = ? AND l.axis IN ('format', 'hook')`,
      )
      .all(input.workspaceId)) {
      if (row.method === "llm" && (row.confidence ?? 0) < LLM_MIN_CONFIDENCE) continue;
      const rank = METHOD_RANK[row.method] ?? 0;
      const entry = labels.get(row.video_id) ?? {};
      const current = entry[row.axis];
      if (!current || rank > current.rank || (rank === current.rank && row.taxonomy_version > current.version)) {
        entry[row.axis] = { label: row.label, rank, version: row.taxonomy_version, createdAt: row.created_at, method: row.method };
      }
      labels.set(row.video_id, entry);
    }

    const videos: BtVideo[] = db
      .query<{ id: string; creator_id: string; platform: string; posted_at: number | null; discovered_at: number; duration_ms: number | null; hashtags_json: string | null; sound_id: string | null; sound_original: number | null }, [string]>(
        `SELECT id, creator_id, platform, posted_at, discovered_at, duration_ms, hashtags_json, sound_id, sound_original
         FROM trend_videos WHERE workspace_id = ?`,
      )
      .all(input.workspaceId)
      .filter((row) => isTrendPlatform(row.platform))
      .map((row) => {
        let hashtags: string[] = [];
        try {
          const parsed: unknown = row.hashtags_json ? JSON.parse(row.hashtags_json) : [];
          if (Array.isArray(parsed)) hashtags = parsed.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.toLowerCase());
        } catch {
          hashtags = [];
        }
        const entry = labels.get(row.id) ?? {};
        // Caption / title rules and seed labels are derivable at discovery; model and manual labels exist from their write time.
        const availableAt = (label: { method: string; createdAt: number }) => (label.method === "rule" || label.method === "seed" ? row.discovered_at : label.createdAt);
        // Platform sound ids only: title-only keys are mostly the generic per-language "original sound" string.
        const soundKey = row.sound_original === 1 || !row.sound_id ? null : `id:${row.sound_id}`;
        return {
          id: row.id,
          creatorId: row.creator_id,
          platform: row.platform as BtVideo["platform"],
          postedAt: row.posted_at,
          discoveredAt: row.discovered_at,
          durationMs: row.duration_ms,
          labels: Object.fromEntries((["format", "hook"] as const).flatMap((axis) => {
            const label = entry[axis];
            return label ? [[axis, { label: label.label, availableAt: availableAt(label) }]] : [];
          })),
          hashtags,
          soundKey,
        };
      });

    const snapshots: BtSnapshot[] = db
      .query<{ video_id: string; checkpoint: string; source: string; as_of: number; age_ms: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; views_precision: string }, [string]>(
        `SELECT s.video_id, s.checkpoint, s.source, s.as_of, s.age_ms, s.views, s.likes, s.comments, s.shares, s.saves, s.views_precision
         FROM trend_metric_snapshots s JOIN trend_videos v ON v.id = s.video_id WHERE v.workspace_id = ?`,
      )
      .all(input.workspaceId)
      .map((row) => ({
        videoId: row.video_id,
        asOf: row.as_of,
        ageHours: row.age_ms === null ? null : row.age_ms / HOUR_MS,
        checkpoint: row.checkpoint,
        source: row.source,
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        saves: row.saves,
        precision: row.views_precision === "rounded" ? "rounded" : "exact",
      }));

    const creatorSnapshots: BtCreatorSnapshot[] = db
      .query<{ creator_id: string; as_of: number; follower_count: number | null }, [string]>(
        `SELECT s.creator_id, s.as_of, s.follower_count FROM trend_creator_snapshots s JOIN trend_creators c ON c.id = s.creator_id WHERE c.workspace_id = ?`,
      )
      .all(input.workspaceId)
      .map((row) => ({ creatorId: row.creator_id, asOf: row.as_of, followers: row.follower_count }));

    return {
      creators,
      videos,
      snapshots,
      creatorSnapshots,
      provenance: { source: "sqlite", db: path.resolve(input.dbPath), workspace: input.workspaceId, transforms: "" },
    };
  } finally {
    db.close();
  }
}
