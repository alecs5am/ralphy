import { openDomainDb } from "./db.js";
import { createDocument, reviseDocument } from "./documents.js";
import type { TrendPlatform } from "../trends/math.js";

/**
 * Store reads and the prediction-ledger Document for the trend signal engine
 * (#577). No new tables: snapshots and videos come from the #556 corpus
 * tables, and the ledger is one JSON Document per niche scope (kind
 * `custom`, append-only revisions, like the #558 decision ledger).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Dated view snapshots per video (age in hours), oldest first. */
export function loadViewSnapshots(input: { videoIds: readonly string[] }): Map<string, Array<{ ageHours: number; views: number }>> {
  const db = openDomainDb();
  const out = new Map<string, Array<{ ageHours: number; views: number }>>();
  for (let index = 0; index < input.videoIds.length; index += 400) {
    const group = input.videoIds.slice(index, index + 400);
    const rows = db
      .query<{ video_id: string; age_ms: number; views: number }, string[]>(
        `SELECT video_id, age_ms, views FROM trend_metric_snapshots
         WHERE video_id IN (${group.map(() => "?").join(",")}) AND age_ms IS NOT NULL AND views IS NOT NULL
         ORDER BY video_id, age_ms`,
      )
      .all(...group);
    for (const row of rows) (out.get(row.video_id) ?? out.set(row.video_id, []).get(row.video_id)!).push({ ageHours: row.age_ms / HOUR_MS, views: row.views });
  }
  return out;
}

export type CreatorAttentionFactsDto = {
  creatorId: string;
  platform: TrendPlatform;
  handle: string | null;
  storedTier: string;
  lastPostedAt: number | null;
  posts30: number | null;
  signals30: number;
  hotVideo: boolean;
  excluded: boolean;
};

/**
 * Per-creator facts for attention tiers: last post, posts in 30 days, videos
 * at or above the near-miss floor in 30 days (non-thin), and whether a video
 * younger than `hotMaxAgeHours` carries the `rising` momentum flag.
 */
export function creatorAttentionFacts(input: {
  workspaceId: string;
  now: number;
  signalFloor: number;
  hotMaxAgeHours: number;
  creatorIds?: readonly string[];
  /** Post-time sources that date single candidates only (not the listing), so they say nothing about cadence. */
  ignoreDateSources?: readonly string[];
}): CreatorAttentionFactsDto[] {
  const db = openDomainDb();
  const since30 = input.now - 30 * DAY_MS;
  const hotSince = input.now - input.hotMaxAgeHours * HOUR_MS;
  const ignored = [...(input.ignoreDateSources ?? [])];
  const listingDated = `(v.posted_at IS NOT NULL${ignored.length > 0 ? ` AND COALESCE(v.posted_at_source, '') NOT IN (${ignored.map(() => "?").join(",")})` : ""})`;
  const sql = `SELECT c.id AS creatorId, c.platform AS platform, c.handle AS handle, c.tier AS storedTier,
            MAX(CASE WHEN ${listingDated} THEN v.posted_at END) AS lastPostedAt,
            SUM(${listingDated}) AS dated,
            SUM(${listingDated} AND v.posted_at >= ?) AS posts30,
            SUM(${listingDated} AND v.posted_at >= ? AND v.outlier_multiplier >= ? AND COALESCE(v.outlier_flags_json, '[]') NOT LIKE '%"thin"%') AS signals30,
            MAX(v.posted_at >= ? AND COALESCE(v.outlier_flags_json, '[]') LIKE '%"rising"%') AS hot
     FROM trend_creators c LEFT JOIN trend_videos v ON v.creator_id = c.id AND v.in_listing = 1
     WHERE c.workspace_id = ?`;
  type Raw = { creatorId: string; platform: TrendPlatform; handle: string | null; storedTier: string; lastPostedAt: number | null; dated: number | null; posts30: number | null; signals30: number | null; hot: number | null };
  const params = [...ignored, ...ignored, ...ignored, since30, ...ignored, since30, input.signalFloor, hotSince, input.workspaceId];
  let rows: Raw[];
  if (input.creatorIds) {
    rows = [];
    for (let index = 0; index < input.creatorIds.length; index += 400) {
      const group = input.creatorIds.slice(index, index + 400);
      if (group.length === 0) continue;
      rows.push(...db.query<Raw, Array<string | number>>(`${sql} AND c.id IN (${group.map(() => "?").join(",")}) GROUP BY c.id`).all(...params, ...group));
    }
  } else {
    rows = db.query<Raw, Array<string | number>>(`${sql} GROUP BY c.id`).all(...params);
  }
  return rows.map((row) => ({
    creatorId: row.creatorId,
    platform: row.platform,
    handle: row.handle,
    storedTier: row.storedTier,
    lastPostedAt: (row.dated ?? 0) > 0 ? row.lastPostedAt : null,
    posts30: (row.dated ?? 0) > 0 ? row.posts30 ?? 0 : null,
    signals30: row.signals30 ?? 0,
    hotVideo: (row.hot ?? 0) > 0,
    excluded: row.storedTier === "excluded",
  }));
}

// ─── Prediction ledger Document ─────────────────────────────────────────────

export const PREDICTION_LEDGER_DOCUMENT_KIND = "custom" as const;
export const PREDICTION_LEDGER_SLUG_PREFIX = "trend-prediction-ledger-";

export type PredictionLedgerDocumentDto = { documentId: string; revisionId: string | null; revisions: number; body: unknown };

export function readPredictionLedgerDocument(input: { workspaceId: string; slug: string }): PredictionLedgerDocumentDto | null {
  const row = openDomainDb()
    .query<{ id: string; current_revision_id: string | null; body: string | null; revisions: number }, [string, string, string]>(
      `SELECT d.id, d.current_revision_id, r.body,
              (SELECT COUNT(*) FROM document_revisions x WHERE x.document_id = d.id) AS revisions
       FROM documents d LEFT JOIN document_revisions r ON r.id = d.current_revision_id
       WHERE d.workspace_id = ? AND d.project_id IS NULL AND d.kind = ? AND d.slug = ?`,
    )
    .get(input.workspaceId, PREDICTION_LEDGER_DOCUMENT_KIND, `${PREDICTION_LEDGER_SLUG_PREFIX}${input.slug}`);
  if (!row) return null;
  let body: unknown = null;
  try {
    body = row.body === null ? null : JSON.parse(row.body);
  } catch {
    body = null;
  }
  return { documentId: row.id, revisionId: row.current_revision_id, revisions: row.revisions, body };
}

/** Every prediction-ledger Document of a Workspace (slug without the prefix), oldest first. */
export function listPredictionLedgerDocuments(input: { workspaceId: string }): Array<PredictionLedgerDocumentDto & { slug: string }> {
  const rows = openDomainDb()
    .query<{ id: string; slug: string; current_revision_id: string | null; body: string | null; revisions: number }, [string, string, string, string]>(
      `SELECT d.id, d.slug, d.current_revision_id, r.body,
              (SELECT COUNT(*) FROM document_revisions x WHERE x.document_id = d.id) AS revisions
       FROM documents d LEFT JOIN document_revisions r ON r.id = d.current_revision_id
       WHERE d.workspace_id = ? AND d.project_id IS NULL AND d.kind = ? AND substr(d.slug, 1, length(?)) = ?
       ORDER BY d.created_at, d.id`,
    )
    .all(input.workspaceId, PREDICTION_LEDGER_DOCUMENT_KIND, PREDICTION_LEDGER_SLUG_PREFIX, PREDICTION_LEDGER_SLUG_PREFIX);
  return rows.map((row) => {
    let body: unknown = null;
    try {
      body = row.body === null ? null : JSON.parse(row.body);
    } catch {
      body = null;
    }
    return { documentId: row.id, slug: row.slug.slice(PREDICTION_LEDGER_SLUG_PREFIX.length), revisionId: row.current_revision_id, revisions: row.revisions, body };
  });
}

/** Append one ledger revision (creates the Document on first write). */
export function appendPredictionLedgerRevision(input: { workspaceId: string; slug: string; title: string; body: unknown }): { documentId: string; revisionId: string } {
  const existing = readPredictionLedgerDocument({ workspaceId: input.workspaceId, slug: input.slug });
  const documentId = existing?.documentId ?? createDocument({ workspaceId: input.workspaceId, kind: PREDICTION_LEDGER_DOCUMENT_KIND, slug: `${PREDICTION_LEDGER_SLUG_PREFIX}${input.slug}`, title: input.title }).id;
  const revision = reviseDocument({ documentId, expectedHeadId: existing?.revisionId ?? null, format: "json", title: input.title, body: JSON.stringify(input.body) });
  return { documentId, revisionId: revision.id };
}
