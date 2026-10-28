import type { Database } from "bun:sqlite";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import {
  DAY_MS,
  HOUR_MS,
  PROVISIONAL_AGE_HOURS,
  TREND_METRICS,
  checkpointFor,
  cohortKey,
  formatKeyFor,
  lengthBandFor,
  sizeBandFor,
  truncateCodePoints,
  type TrendMetric,
  type TrendPlatform,
} from "../trends/math.js";
import type { ScoreCreator, ScoreSnapshot, ScoreVideo, VideoScore } from "../trends/score.js";

/**
 * Trend corpus store (#556). Every function takes an explicit Workspace id:
 * the corpus lives in one Workspace and consumers pass `--workspace`.
 *
 * Write rules: creators and videos upsert on their platform identity, so a
 * re-run is idempotent; metric snapshots insert with INSERT OR IGNORE on the
 * checkpoint key (first sample in a bucket wins) while the denormalized
 * `latest_*` columns always move forward; labels are append-only per
 * taxonomy version and method. The two baseline tables are caches.
 */

export const TREND_TAXONOMY_VERSION = 1;
export const TREND_TEXT_MAX = 2_000;
export const LISTING_FAILURES_BEFORE_EXCLUDE = 3;

const DATA_URL_PREFIX = /data:(?=(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[^,\s]*)?,)/gi;

/** Code-point truncation plus a defused `data:` URL prefix (the store verifier rejects data URLs). */
export function cleanTrendText(value: string | null | undefined, max = TREND_TEXT_MAX): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\u0000/g, "").trim();
  if (!trimmed) return null;
  return truncateCodePoints(trimmed, max).replace(DATA_URL_PREFIX, "data :");
}

// ─── Watchlists ─────────────────────────────────────────────────────────────

export type WatchlistKind = "hashtag" | "keyword" | "sound" | "explore-category" | "creator" | "related";

export type WatchlistDto = {
  id: string;
  workspaceId: string;
  platform: TrendPlatform;
  kind: WatchlistKind;
  value: string;
  source: string;
  niche: string | null;
  cadenceHours: number;
  active: boolean;
  lastRunId: string | null;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type WatchlistDbRecord = {
  id: string;
  workspace_id: string;
  platform: TrendPlatform;
  kind: WatchlistKind;
  value: string;
  source: string;
  niche: string | null;
  cadence_hours: number;
  active: number;
  last_run_id: string | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
};

const toWatchlist = (row: WatchlistDbRecord): WatchlistDto => ({
  id: row.id,
  workspaceId: row.workspace_id,
  platform: row.platform,
  kind: row.kind,
  value: row.value,
  source: row.source,
  niche: row.niche,
  cadenceHours: row.cadence_hours,
  active: row.active === 1,
  lastRunId: row.last_run_id,
  lastRunAt: row.last_run_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function assertWorkspace(db: Database, workspaceId: string): void {
  const found = db.query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?").get(workspaceId);
  if (!found) throw new Error(`Workspace not found: ${workspaceId}`);
}

export function upsertWatchlist(input: {
  workspaceId: string;
  platform: TrendPlatform;
  kind: WatchlistKind;
  value: string;
  source: string;
  niche?: string | null;
  cadenceHours?: number;
  now?: number;
}): WatchlistDto {
  const now = input.now ?? Date.now();
  const value = input.value.trim();
  if (!value) throw new Error("Watchlist value must not be empty");
  return withImmediateTransaction((db) => {
    assertWorkspace(db, input.workspaceId);
    const existing = db
      .query<WatchlistDbRecord, [string, string, string, string]>(
        "SELECT * FROM trend_watchlists WHERE workspace_id = ? AND platform = ? AND kind = ? AND value = ?",
      )
      .get(input.workspaceId, input.platform, input.kind, value);
    if (existing) {
      db.prepare(
        `UPDATE trend_watchlists SET active = 1, source = ?, niche = COALESCE(?, niche),
           cadence_hours = COALESCE(?, cadence_hours), row_version = row_version + 1, updated_at = ?
         WHERE id = ?`,
      ).run(input.source, input.niche ?? null, input.cadenceHours ?? null, now, existing.id);
      return toWatchlist(db.query<WatchlistDbRecord, [string]>("SELECT * FROM trend_watchlists WHERE id = ?").get(existing.id)!);
    }
    const id = newDomainId("twatch");
    db.prepare(
      `INSERT INTO trend_watchlists
         (id, workspace_id, platform, kind, value, source, niche, cadence_hours, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, input.workspaceId, input.platform, input.kind, value, input.source, input.niche ?? null, input.cadenceHours ?? 24, now, now);
    return toWatchlist(db.query<WatchlistDbRecord, [string]>("SELECT * FROM trend_watchlists WHERE id = ?").get(id)!);
  });
}

export function listWatchlists(input: { workspaceId: string; includeInactive?: boolean }): WatchlistDto[] {
  const db = openDomainDb();
  return db
    .query<WatchlistDbRecord, [string]>(
      `SELECT * FROM trend_watchlists WHERE workspace_id = ?${input.includeInactive ? "" : " AND active = 1"}
       ORDER BY platform, kind, value`,
    )
    .all(input.workspaceId)
    .map(toWatchlist);
}

/** `watch remove` deactivates (history and provenance stay). */
export function setWatchlistActive(input: { workspaceId: string; ref: string; active: boolean; now?: number }): WatchlistDto {
  return withImmediateTransaction((db) => {
    const row = db
      .query<WatchlistDbRecord, [string, string, string]>(
        "SELECT * FROM trend_watchlists WHERE workspace_id = ? AND (id = ? OR value = ?) ORDER BY created_at LIMIT 1",
      )
      .get(input.workspaceId, input.ref, input.ref);
    if (!row) throw new Error(`Watchlist not found: ${input.ref}`);
    db.prepare("UPDATE trend_watchlists SET active = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?")
      .run(input.active ? 1 : 0, input.now ?? Date.now(), row.id);
    return toWatchlist(db.query<WatchlistDbRecord, [string]>("SELECT * FROM trend_watchlists WHERE id = ?").get(row.id)!);
  });
}

export function markWatchlistRun(input: { watchlistId: string; runId: string; at: number }): void {
  withImmediateTransaction((db) => {
    db.prepare("UPDATE trend_watchlists SET last_run_id = ?, last_run_at = ?, updated_at = ? WHERE id = ?")
      .run(input.runId, input.at, input.at, input.watchlistId);
  });
}

export function dueWatchlists(input: { workspaceId: string; now: number }): WatchlistDto[] {
  return openDomainDb()
    .query<WatchlistDbRecord, [string, number]>(
      `SELECT * FROM trend_watchlists
       WHERE workspace_id = ? AND active = 1
         AND (last_run_at IS NULL OR last_run_at + cadence_hours * 3600000 <= ?)
       ORDER BY COALESCE(last_run_at, 0), id`,
    )
    .all(input.workspaceId, input.now)
    .map(toWatchlist);
}

// ─── Ingest batch ───────────────────────────────────────────────────────────

export type TrendCreatorInput = {
  platform: TrendPlatform;
  platformCreatorId: string;
  handle?: string | null;
  displayName?: string | null;
  followerCount?: number | null;
  niche?: string | null;
  nicheMethod?: "seed" | "llm" | "manual" | "hashtag" | null;
  region?: string | null;
  discoveredVia: string;
  watchlistId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  snapshot?: { asOf: number; source: string; followerCount?: number | null; videoCount?: number | null; totalLikes?: number | null } | null;
};

export type TrendVideoInput = {
  creatorPlatformId: string;
  platform: TrendPlatform;
  platformVideoId: string;
  url: string;
  formatKey?: string;
  postedAt?: number | null;
  postedAtSource?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  title?: string | null;
  description?: string | null;
  hashtags?: string[] | null;
  soundId?: string | null;
  soundTitle?: string | null;
  soundOriginal?: boolean | null;
  language?: string | null;
  region?: string | null;
  isAd?: boolean | null;
  aigcLabel?: boolean | null;
  discoveredVia: string;
  inListing: boolean;
  snapshot?: TrendSnapshotInput | null;
};

export type TrendSnapshotInput = {
  asOf: number;
  source: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  viewsPrecision?: "exact" | "rounded";
};

export type ListingOutcomeInput = {
  platform: TrendPlatform;
  platformCreatorId: string;
  at: number;
  ok: boolean;
  error?: string | null;
};

export type IngestBatchResult = {
  creatorsCreated: number;
  creatorsUpdated: number;
  videosCreated: number;
  videosUpdated: number;
  snapshotsInserted: number;
  snapshotsSkipped: number;
  creatorSnapshotsInserted: number;
  creatorIds: string[];
  createdVideoIds: string[];
};

type CreatorIdentityRecord = { id: string; follower_count: number | null; niche: string | null; niche_method: string | null; watchlist_id: string | null };

type VideoIdentityRecord = { id: string; posted_at: number | null; latest_as_of: number | null };

const intOrNull = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

const boolInt = (value: boolean | null | undefined): number | null =>
  value === true ? 1 : value === false ? 0 : null;

function normalizeLanguage(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return /^[a-z]{2}$/.test(primary) && primary !== "un" ? primary : null;
}

function normalizeRegion(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Next snapshot boundary for a dated video (informational scheduling hint). */
export function nextSnapshotAt(postedAt: number | null, now: number): number | null {
  if (postedAt === null) return null;
  const boundariesHours = [6, 24, 48, 72, 168, 336, 672, 1344];
  const age = (now - postedAt) / HOUR_MS;
  for (const boundary of boundariesHours) if (age < boundary) return postedAt + boundary * HOUR_MS;
  const months = Math.floor((age / 24 - 56) / 30) + 1;
  return postedAt + (56 + months * 30) * DAY_MS;
}

/**
 * Write one ingest batch in a single transaction: creators (+ follower
 * snapshots), videos (+ metric snapshots), and listing outcomes. Idempotent:
 * a repeat with the same data inside the same checkpoint buckets inserts no
 * snapshot rows and creates no entities.
 */
export function writeIngestBatch(input: {
  workspaceId: string;
  runId: string | null;
  now: number;
  creators: TrendCreatorInput[];
  videos: TrendVideoInput[];
  listings?: ListingOutcomeInput[];
}): IngestBatchResult {
  return withImmediateTransaction((db) => {
    assertWorkspace(db, input.workspaceId);
    const result: IngestBatchResult = {
      creatorsCreated: 0,
      creatorsUpdated: 0,
      videosCreated: 0,
      videosUpdated: 0,
      snapshotsInserted: 0,
      snapshotsSkipped: 0,
      creatorSnapshotsInserted: 0,
      creatorIds: [],
      createdVideoIds: [],
    };
    const creatorIds = new Map<string, string>();
    const findCreator = db.query<CreatorIdentityRecord, [string, string, string]>(
      `SELECT id, follower_count, niche, niche_method, watchlist_id FROM trend_creators
       WHERE workspace_id = ? AND platform = ? AND platform_creator_id = ?`,
    );
    const insertCreator = db.prepare(
      `INSERT INTO trend_creators
         (id, workspace_id, platform, platform_creator_id, handle, display_name, follower_count, size_band,
          niche, niche_method, region, tier, discovered_via, watchlist_id, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    );
    const updateCreator = db.prepare(
      `UPDATE trend_creators SET
         handle = COALESCE(?, handle), display_name = COALESCE(?, display_name),
         follower_count = COALESCE(?, follower_count), size_band = COALESCE(?, size_band),
         niche = CASE WHEN niche IS NULL THEN ? ELSE niche END,
         niche_method = CASE WHEN niche IS NULL THEN ? ELSE niche_method END,
         region = COALESCE(region, ?), watchlist_id = COALESCE(watchlist_id, ?),
         row_version = row_version + 1, updated_at = ?
       WHERE id = ?`,
    );
    const insertCreatorSnapshot = db.prepare(
      `INSERT OR IGNORE INTO trend_creator_snapshots
         (creator_id, as_of, source, follower_count, video_count, total_likes, run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const creator of input.creators) {
      const key = `${creator.platform}:${creator.platformCreatorId}`;
      const followers = intOrNull(creator.followerCount ?? creator.snapshot?.followerCount ?? null);
      const existing = findCreator.get(input.workspaceId, creator.platform, creator.platformCreatorId);
      const niche = creator.niche ?? null;
      const nicheMethod = niche ? creator.nicheMethod ?? "seed" : null;
      let id: string;
      if (existing) {
        id = existing.id;
        updateCreator.run(
          cleanTrendText(creator.handle, 256),
          cleanTrendText(creator.displayName, 256),
          followers,
          sizeBandFor(followers),
          niche,
          nicheMethod,
          normalizeRegion(creator.region),
          creator.watchlistId ?? null,
          input.now,
          id,
        );
        result.creatorsUpdated += 1;
      } else {
        id = newDomainId("tcreator");
        insertCreator.run(
          id,
          input.workspaceId,
          creator.platform,
          creator.platformCreatorId,
          cleanTrendText(creator.handle, 256),
          cleanTrendText(creator.displayName, 256),
          followers,
          sizeBandFor(followers),
          niche,
          nicheMethod,
          normalizeRegion(creator.region),
          truncateCodePoints(creator.discoveredVia, 600),
          creator.watchlistId ?? null,
          creator.metadata ? JSON.stringify(creator.metadata) : null,
          input.now,
          input.now,
        );
        result.creatorsCreated += 1;
      }
      creatorIds.set(key, id);
      if (creator.snapshot) {
        const changes = insertCreatorSnapshot.run(
          id,
          creator.snapshot.asOf,
          creator.snapshot.source,
          intOrNull(creator.snapshot.followerCount ?? followers),
          intOrNull(creator.snapshot.videoCount),
          intOrNull(creator.snapshot.totalLikes),
          input.runId,
        ).changes;
        result.creatorSnapshotsInserted += changes;
      }
    }

    const resolveCreator = (platform: TrendPlatform, platformCreatorId: string): string | null => {
      const key = `${platform}:${platformCreatorId}`;
      const cached = creatorIds.get(key);
      if (cached) return cached;
      const found = findCreator.get(input.workspaceId, platform, platformCreatorId);
      if (found) creatorIds.set(key, found.id);
      return found?.id ?? null;
    };

    const findVideo = db.query<VideoIdentityRecord, [string, string, string]>(
      `SELECT id, posted_at, latest_as_of FROM trend_videos
       WHERE workspace_id = ? AND platform = ? AND platform_video_id = ?`,
    );
    const insertVideo = db.prepare(
      `INSERT INTO trend_videos
         (id, workspace_id, platform, platform_video_id, creator_id, format_key, url, posted_at, posted_at_source,
          duration_ms, width, height, title, description, hashtags_json, sound_id, sound_title, sound_original,
          language, region, is_ad, aigc_label, discovered_via, discovered_at, in_listing, next_snapshot_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateVideo = db.prepare(
      `UPDATE trend_videos SET
         posted_at = COALESCE(posted_at, ?), posted_at_source = CASE WHEN posted_at IS NULL THEN ? ELSE posted_at_source END,
         duration_ms = COALESCE(?, duration_ms), width = COALESCE(?, width), height = COALESCE(?, height),
         title = COALESCE(?, title), description = COALESCE(?, description),
         hashtags_json = COALESCE(?, hashtags_json), sound_id = COALESCE(?, sound_id),
         sound_title = COALESCE(?, sound_title), sound_original = COALESCE(?, sound_original),
         language = COALESCE(language, ?), region = COALESCE(region, ?), is_ad = COALESCE(?, is_ad),
         aigc_label = COALESCE(?, aigc_label), in_listing = MAX(in_listing, ?),
         row_version = row_version + 1, updated_at = ?
       WHERE id = ?`,
    );
    const insertSnapshot = db.prepare(
      `INSERT OR IGNORE INTO trend_metric_snapshots
         (video_id, checkpoint, bucket_seq, source, as_of, age_ms, views, likes, comments, shares, saves,
          views_precision, run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateLatest = db.prepare(
      `UPDATE trend_videos SET latest_as_of = ?, latest_views = ?, latest_likes = ?, latest_comments = ?,
         latest_shares = ?, latest_saves = ?, latest_views_precision = ?, latest_source = ?, next_snapshot_at = ?
       WHERE id = ? AND (latest_as_of IS NULL OR latest_as_of <= ?)`,
    );

    for (const video of input.videos) {
      const creatorId = resolveCreator(video.platform, video.creatorPlatformId);
      if (!creatorId) throw new Error(`Trend video ${video.platformVideoId} has no creator ${video.creatorPlatformId}`);
      const existing = findVideo.get(input.workspaceId, video.platform, video.platformVideoId);
      const postedAt = intOrNull(video.postedAt ?? null);
      const hashtags = video.hashtags && video.hashtags.length > 0
        ? JSON.stringify([...new Set(video.hashtags.map((tag) => cleanTrendText(tag, 128)).filter((tag): tag is string => !!tag))].slice(0, 60))
        : null;
      let id: string;
      if (existing) {
        id = existing.id;
        updateVideo.run(
          postedAt,
          postedAt === null ? null : video.postedAtSource ?? "platform",
          intOrNull(video.durationMs),
          intOrNull(video.width),
          intOrNull(video.height),
          cleanTrendText(video.title),
          cleanTrendText(video.description),
          hashtags,
          cleanTrendText(video.soundId, 128),
          cleanTrendText(video.soundTitle, 300),
          boolInt(video.soundOriginal),
          normalizeLanguage(video.language),
          normalizeRegion(video.region),
          boolInt(video.isAd),
          boolInt(video.aigcLabel),
          video.inListing ? 1 : 0,
          input.now,
          id,
        );
        result.videosUpdated += 1;
      } else {
        id = newDomainId("tvideo");
        insertVideo.run(
          id,
          input.workspaceId,
          video.platform,
          video.platformVideoId,
          creatorId,
          video.formatKey ?? formatKeyFor(video.platform),
          truncateCodePoints(video.url, 1_000),
          postedAt,
          postedAt === null ? null : video.postedAtSource ?? "platform",
          intOrNull(video.durationMs),
          intOrNull(video.width),
          intOrNull(video.height),
          cleanTrendText(video.title),
          cleanTrendText(video.description),
          hashtags,
          cleanTrendText(video.soundId, 128),
          cleanTrendText(video.soundTitle, 300),
          boolInt(video.soundOriginal),
          normalizeLanguage(video.language),
          normalizeRegion(video.region),
          boolInt(video.isAd),
          boolInt(video.aigcLabel),
          truncateCodePoints(video.discoveredVia, 600),
          input.now,
          video.inListing ? 1 : 0,
          nextSnapshotAt(postedAt, input.now),
          input.now,
          input.now,
        );
        result.videosCreated += 1;
        result.createdVideoIds.push(id);
      }
      const snapshot = video.snapshot;
      if (!snapshot) continue;
      const effectivePostedAt = existing?.posted_at ?? postedAt;
      const ageMs = effectivePostedAt === null ? null : Math.max(0, snapshot.asOf - effectivePostedAt);
      const bucket = checkpointFor(ageMs, snapshot.asOf);
      const changes = insertSnapshot.run(
        id,
        bucket.checkpoint,
        bucket.bucketSeq,
        snapshot.source,
        snapshot.asOf,
        ageMs,
        intOrNull(snapshot.views),
        intOrNull(snapshot.likes),
        intOrNull(snapshot.comments),
        intOrNull(snapshot.shares),
        intOrNull(snapshot.saves),
        snapshot.viewsPrecision ?? "exact",
        input.runId,
      ).changes;
      if (changes > 0) result.snapshotsInserted += 1;
      else result.snapshotsSkipped += 1;
      updateLatest.run(
        snapshot.asOf,
        intOrNull(snapshot.views),
        intOrNull(snapshot.likes),
        intOrNull(snapshot.comments),
        intOrNull(snapshot.shares),
        intOrNull(snapshot.saves),
        snapshot.viewsPrecision ?? "exact",
        snapshot.source,
        nextSnapshotAt(effectivePostedAt, snapshot.asOf),
        id,
        snapshot.asOf,
      );
    }

    for (const listing of input.listings ?? []) {
      const creatorId = resolveCreator(listing.platform, listing.platformCreatorId);
      if (!creatorId) continue;
      if (listing.ok) markListed(db, creatorId, listing.at);
      else markListFailed(db, creatorId, listing.at, listing.error ?? "listing failed");
    }
    result.creatorIds = [...new Set(creatorIds.values())];
    return result;
  });
}

/** Refresh cadence per tier; `hot` = explicitly watched creator with a post younger than 72 h. */
export const REFRESH_CADENCE_HOURS = { hot: 6, active: 24, inactive: 24 * 7, dormant: 24 * 30 } as const;

export function tierFor(lastPostedAt: number | null, now: number): "active" | "inactive" | "dormant" {
  if (lastPostedAt === null) return "active";
  const days = (now - lastPostedAt) / DAY_MS;
  if (days <= 14) return "active";
  if (days <= 60) return "inactive";
  return "dormant";
}

function markListed(db: Database, creatorId: string, at: number): void {
  const facts = db
    .query<{ lastPosted: number | null; watchKind: string | null; tier: string }, [string, string]>(
      `SELECT (SELECT MAX(posted_at) FROM trend_videos WHERE creator_id = ? AND in_listing = 1) AS lastPosted,
              (SELECT kind FROM trend_watchlists w WHERE w.id = c.watchlist_id) AS watchKind, c.tier AS tier
       FROM trend_creators c WHERE c.id = ?`,
    )
    .get(creatorId, creatorId);
  if (!facts) return;
  const tier = facts.tier === "excluded" ? "excluded" : tierFor(facts.lastPosted, at);
  const hot = facts.watchKind === "creator" && facts.lastPosted !== null && at - facts.lastPosted < PROVISIONAL_AGE_HOURS * HOUR_MS;
  const cadence = hot ? REFRESH_CADENCE_HOURS.hot : tier === "excluded" ? REFRESH_CADENCE_HOURS.dormant : REFRESH_CADENCE_HOURS[tier];
  db.prepare(
    `UPDATE trend_creators SET last_listed_at = ?, next_list_at = ?, last_posted_at = ?, tier = ?,
       listing_failures = 0, last_list_error = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(at, at + cadence * HOUR_MS, facts.lastPosted, tier, at, creatorId);
}

/** Listing failures that will not change on retry (the creator has nothing to list). */
const PERMANENT_LISTING_FAILURE = /does not have a shorts tab|account is (either )?private|This account is private/i;

function markListFailed(db: Database, creatorId: string, at: number, error: string): void {
  const row = db.query<{ failures: number }, [string]>("SELECT listing_failures AS failures FROM trend_creators WHERE id = ?").get(creatorId);
  const failures = PERMANENT_LISTING_FAILURE.test(error)
    ? Math.max(LISTING_FAILURES_BEFORE_EXCLUDE, (row?.failures ?? 0) + 1)
    : (row?.failures ?? 0) + 1;
  const backoffHours = Math.min(24 * failures, 24 * 7);
  db.prepare(
    `UPDATE trend_creators SET listing_failures = ?, last_list_error = ?, next_list_at = ?,
       tier = CASE WHEN ? >= ? THEN 'excluded' ELSE tier END, updated_at = ?
     WHERE id = ?`,
  ).run(failures, truncateCodePoints(error, 300), at + backoffHours * HOUR_MS, failures, LISTING_FAILURES_BEFORE_EXCLUDE, at, creatorId);
}

// ─── Refresh selection ──────────────────────────────────────────────────────

export type DueCreatorDto = {
  id: string;
  platform: TrendPlatform;
  platformCreatorId: string;
  handle: string | null;
  tier: string;
  lastListedAt: number | null;
  nextListAt: number | null;
  niche: string | null;
  watchlistId: string | null;
};

export function dueCreators(input: {
  workspaceId: string;
  now: number;
  platform?: TrendPlatform;
  dueOnly: boolean;
  unlistedOnly?: boolean;
  limit: number;
}): DueCreatorDto[] {
  const filters = ["workspace_id = ?", "tier <> 'excluded'"];
  const values: Array<string | number> = [input.workspaceId];
  if (input.platform) {
    filters.push("platform = ?");
    values.push(input.platform);
  }
  if (input.unlistedOnly) filters.push("last_listed_at IS NULL");
  if (input.dueOnly) {
    filters.push("(next_list_at IS NULL OR next_list_at <= ?)");
    values.push(input.now);
  }
  values.push(Math.max(1, Math.floor(input.limit)));
  return openDomainDb()
    .query<DueCreatorDto, Array<string | number>>(
      `SELECT id, platform, platform_creator_id AS platformCreatorId, handle, tier,
              last_listed_at AS lastListedAt, next_list_at AS nextListAt, niche, watchlist_id AS watchlistId
       FROM trend_creators WHERE ${filters.join(" AND ")}
       ORDER BY COALESCE(next_list_at, 0), created_at, id LIMIT ?`,
    )
    .all(...values);
}

/** YouTube videos the Data API should date or re-check (30-day rule for stored API statistics). */
export function youtubeApiCandidates(input: { workspaceId: string; now: number; limit: number }): { undated: string[]; stale: string[] } {
  const db = openDomainDb();
  const undated = db
    .query<{ id: string }, [string, number]>(
      `SELECT platform_video_id AS id FROM trend_videos
       WHERE workspace_id = ? AND platform = 'youtube' AND posted_at IS NULL
       ORDER BY discovered_at DESC LIMIT ?`,
    )
    .all(input.workspaceId, input.limit)
    .map((row) => row.id);
  const stale = db
    .query<{ id: string }, [string, number, number]>(
      `SELECT v.platform_video_id AS id FROM trend_videos v
       WHERE v.workspace_id = ? AND v.platform = 'youtube'
         AND EXISTS (SELECT 1 FROM trend_metric_snapshots s WHERE s.video_id = v.id AND s.source = 'youtube-data-api')
         AND NOT EXISTS (SELECT 1 FROM trend_metric_snapshots s WHERE s.video_id = v.id
                         AND s.source = 'youtube-data-api' AND s.as_of > ?)
       LIMIT ?`,
    )
    .all(input.workspaceId, input.now - 30 * DAY_MS, input.limit)
    .map((row) => row.id);
  return { undated, stale };
}

/**
 * Instagram reels due for a checkpoint refresh by URL at ages 1, 3, 7, and 14
 * days (the paid path refreshes reels at age checkpoints instead of daily).
 */
export function instagramCheckpointDue(input: { workspaceId: string; now: number; limit: number }): Array<{ url: string; platformVideoId: string; creatorPlatformId: string }> {
  const windows: Array<[number, number, string]> = [
    [1, 3, "d1-2"],
    [3, 7, "d3-7"],
    [7, 14, "d7-14"],
    [14, 28, "d14-28"],
  ];
  const db = openDomainDb();
  const out: Array<{ url: string; platformVideoId: string; creatorPlatformId: string }> = [];
  for (const [fromDays, toDays, checkpoint] of windows) {
    if (out.length >= input.limit) break;
    out.push(...db
      .query<{ url: string; platformVideoId: string; creatorPlatformId: string }, [string, number, number, string, number]>(
        `SELECT v.url, v.platform_video_id AS platformVideoId, c.platform_creator_id AS creatorPlatformId
         FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
         WHERE v.workspace_id = ? AND v.platform = 'instagram' AND v.posted_at IS NOT NULL
           AND v.posted_at <= ? AND v.posted_at > ?
           AND NOT EXISTS (SELECT 1 FROM trend_metric_snapshots s WHERE s.video_id = v.id AND s.checkpoint = ?)
         ORDER BY v.posted_at DESC LIMIT ?`,
      )
      .all(input.workspaceId, input.now - fromDays * DAY_MS, input.now - toDays * DAY_MS, checkpoint, input.limit - out.length));
  }
  return out;
}

// ─── Scoring input / output ─────────────────────────────────────────────────

type ScoreVideoDbRecord = {
  id: string;
  platform_video_id: string;
  platform: TrendPlatform;
  creator_id: string;
  format_key: string;
  posted_at: number | null;
  in_listing: number;
  duration_ms: number | null;
  latest_as_of: number | null;
  latest_views: number | null;
  latest_likes: number | null;
  latest_comments: number | null;
  latest_shares: number | null;
  latest_saves: number | null;
};

type ScoreSnapshotDbRecord = {
  video_id: string;
  as_of: number;
  age_ms: number | null;
  source: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

const metricValues = (row: { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }) => ({
  views: row.views,
  likes: row.likes,
  comments: row.comments,
  shares: row.shares,
  saves: row.saves,
});

/** Everything the pure scorer needs for one Workspace (or a subset of creators). */
export function loadScoringInput(input: { workspaceId: string; creatorIds?: string[] }): ScoreCreator[] {
  const db = openDomainDb();
  const onlyCreators = input.creatorIds ? new Set(input.creatorIds) : null;
  return db.transaction(() => {
    const creators = db
      .query<{ id: string; platform: TrendPlatform; last_listed_at: number | null; niche: string | null; size_band: string | null }, [string]>(
        "SELECT id, platform, last_listed_at, niche, size_band FROM trend_creators WHERE workspace_id = ?",
      )
      .all(input.workspaceId)
      .filter((row) => !onlyCreators || onlyCreators.has(row.id));
    const wanted = new Set(creators.map((row) => row.id));
    const videos = db
      .query<ScoreVideoDbRecord, [string]>(
        `SELECT id, platform_video_id, platform, creator_id, format_key, posted_at, in_listing, duration_ms,
                latest_as_of, latest_views, latest_likes, latest_comments, latest_shares, latest_saves
         FROM trend_videos WHERE workspace_id = ?`,
      )
      .all(input.workspaceId)
      .filter((row) => wanted.has(row.creator_id));
    const snapshots = new Map<string, ScoreSnapshot[]>();
    for (const row of db
      .query<ScoreSnapshotDbRecord, [string]>(
        `SELECT s.video_id, s.as_of, s.age_ms, s.source, s.views, s.likes, s.comments, s.shares, s.saves
         FROM trend_metric_snapshots s JOIN trend_videos v ON v.id = s.video_id
         WHERE v.workspace_id = ?`,
      )
      .all(input.workspaceId)) {
      const list = snapshots.get(row.video_id) ?? [];
      list.push({ asOf: row.as_of, ageHours: row.age_ms === null ? null : row.age_ms / HOUR_MS, values: metricValues(row), source: row.source });
      snapshots.set(row.video_id, list);
    }
    const followers = new Map<string, Array<{ asOf: number; followers: number }>>();
    for (const row of db
      .query<{ creator_id: string; as_of: number; follower_count: number }, [string]>(
        `SELECT s.creator_id, s.as_of, s.follower_count FROM trend_creator_snapshots s
         JOIN trend_creators c ON c.id = s.creator_id
         WHERE c.workspace_id = ? AND s.follower_count IS NOT NULL`,
      )
      .all(input.workspaceId)) {
      const list = followers.get(row.creator_id) ?? [];
      list.push({ asOf: row.as_of, followers: row.follower_count });
      followers.set(row.creator_id, list);
    }
    const byCreator = new Map<string, ScoreVideo[]>();
    const creatorById = new Map(creators.map((row) => [row.id, row]));
    for (const row of videos) {
      const creator = creatorById.get(row.creator_id)!;
      const list = byCreator.get(row.creator_id) ?? [];
      list.push({
        id: row.id,
        key: row.platform_video_id,
        platform: row.platform,
        formatKey: row.format_key,
        postedAt: row.posted_at,
        inListing: row.in_listing === 1,
        cohortKey: cohortKey({
          platform: row.platform,
          niche: creator.niche,
          formatKey: row.format_key,
          lengthBand: lengthBandFor(row.duration_ms),
          sizeBand: creator.size_band,
        }),
        latest: row.latest_as_of === null
          ? null
          : {
              asOf: row.latest_as_of,
              values: {
                views: row.latest_views,
                likes: row.latest_likes,
                comments: row.latest_comments,
                shares: row.latest_shares,
                saves: row.latest_saves,
              },
            },
        snapshots: snapshots.get(row.id) ?? [],
      });
      byCreator.set(row.creator_id, list);
    }
    return creators.map((creator) => ({
      creatorId: creator.id,
      platform: creator.platform,
      listed: creator.last_listed_at !== null,
      followerSnapshots: followers.get(creator.id) ?? [],
      videos: byCreator.get(creator.id) ?? [],
    }));
  })();
}

export function writeTrendScores(input: {
  workspaceId: string;
  computedAt: number;
  scores: Array<VideoScore & { cohortKey: string }>;
  creatorBaselines?: Array<{ creatorId: string; formatKey: string; metric: TrendMetric; medianLog: number; madLog: number; n: number; windowK: number }>;
  cohortBaselines?: Array<{ cohortKey: string; metric: TrendMetric; medianLog: number; madLog: number; n: number; windowDays: number }>;
}): { updated: number } {
  return withImmediateTransaction((db) => {
    const update = db.prepare(
      `UPDATE trend_videos SET cohort_key = ?, outlier_multiplier = ?, outlier_z = ?, outlier_score = ?,
         outlier_label = ?, outlier_mode = ?, outlier_flags_json = ?, outlier_detail_json = ?,
         outlier_computed_at = ?, momentum = ?
       WHERE id = ? AND workspace_id = ?`,
    );
    let updated = 0;
    for (const score of input.scores) {
      updated += update.run(
        score.cohortKey,
        score.multiplier,
        score.z,
        score.composite,
        score.label,
        score.mode,
        JSON.stringify(score.flags),
        score.detail ? JSON.stringify(score.detail) : null,
        input.computedAt,
        score.momentum,
        score.videoId,
        input.workspaceId,
      ).changes;
    }
    if (input.creatorBaselines) {
      const creatorIds = [...new Set(input.creatorBaselines.map((row) => row.creatorId))];
      const remove = db.prepare("DELETE FROM trend_baselines WHERE creator_id = ?");
      for (const id of creatorIds) remove.run(id);
      const insert = db.prepare(
        `INSERT OR REPLACE INTO trend_baselines (creator_id, format_key, metric, window_k, median_log, mad_log, n, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of input.creatorBaselines) {
        insert.run(row.creatorId, row.formatKey, row.metric, row.windowK, row.medianLog, row.madLog, row.n, input.computedAt);
      }
    }
    if (input.cohortBaselines) {
      db.prepare("DELETE FROM trend_cohort_baselines WHERE workspace_id = ?").run(input.workspaceId);
      const insert = db.prepare(
        `INSERT OR REPLACE INTO trend_cohort_baselines (workspace_id, cohort_key, metric, window_days, median_log, mad_log, n, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of input.cohortBaselines) {
        insert.run(input.workspaceId, row.cohortKey, row.metric, row.windowDays, row.medianLog, row.madLog, row.n, input.computedAt);
      }
    }
    return { updated };
  });
}

/** Same-source pairs (age a, value at a / value in the d28 bucket) for a maturity refit. */
export function loadMaturityPairs(input: { workspaceId: string; platform: TrendPlatform }): Array<{ ageHours: number; ratio: number }> {
  const rows = openDomainDb()
    .query<{ age_ms: number; views: number; mature: number }, [string, string]>(
      `SELECT early.age_ms AS age_ms, early.views AS views, late.views AS mature
       FROM trend_metric_snapshots early
       JOIN trend_metric_snapshots late
         ON late.video_id = early.video_id AND late.source = early.source AND late.checkpoint = 'd28'
       JOIN trend_videos v ON v.id = early.video_id
       WHERE v.workspace_id = ? AND v.platform = ? AND early.checkpoint NOT IN ('d28', 'monthly', 'undated')
         AND early.age_ms IS NOT NULL AND early.views IS NOT NULL AND late.views > 0`,
    )
    .all(input.workspaceId, input.platform);
  return rows.map((row) => ({ ageHours: row.age_ms / HOUR_MS, ratio: row.views / row.mature }));
}

// ─── Cohort labels ──────────────────────────────────────────────────────────

export type TrendLabelAxis = "niche" | "sub_niche" | "format" | "hook" | "length_band" | "size_band" | "language" | "region" | "audio";
export type TrendLabelMethod = "rule" | "llm" | "seed" | "manual";

export type TrendLabelInput = {
  videoId: string;
  axis: TrendLabelAxis;
  label: string;
  method: TrendLabelMethod;
  model?: string | null;
  confidence?: number | null;
};

export function insertTrendLabels(input: { runId: string | null; now: number; labels: TrendLabelInput[] }): { inserted: number; skipped: number } {
  return withImmediateTransaction((db) => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO trend_cohort_labels
         (video_id, axis, taxonomy_version, method, label, model, confidence, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let inserted = 0;
    for (const label of input.labels) {
      inserted += insert.run(
        label.videoId,
        label.axis,
        TREND_TAXONOMY_VERSION,
        label.method,
        truncateCodePoints(label.label, 64),
        label.model ?? null,
        label.confidence ?? null,
        input.runId,
        input.now,
      ).changes;
    }
    return { inserted, skipped: input.labels.length - inserted };
  });
}

export type LabelCandidateDto = {
  videoId: string;
  platform: TrendPlatform;
  title: string | null;
  description: string | null;
  hashtags: string[];
  durationMs: number | null;
  soundId: string | null;
  soundOriginal: boolean | null;
  language: string | null;
  region: string | null;
  creatorRegion: string | null;
  creatorNiche: string | null;
  creatorNicheMethod: string | null;
  sizeBand: string | null;
  existingAxes: string[];
};

/** Videos missing at least one deterministic or rule axis at the current taxonomy version. */
export function loadLabelCandidates(input: { workspaceId: string; videoIds?: string[]; limit?: number; llmAxis?: TrendLabelAxis }): LabelCandidateDto[] {
  const db = openDomainDb();
  const llmFilter = input.llmAxis
    ? ` AND NOT EXISTS (SELECT 1 FROM trend_cohort_labels l WHERE l.video_id = v.id AND l.axis = '${input.llmAxis}'
         AND l.method = 'llm' AND l.taxonomy_version = ${TREND_TAXONOMY_VERSION})`
    : "";
  const rows = db
    .query<{
      id: string; platform: TrendPlatform; title: string | null; description: string | null; hashtags_json: string | null;
      duration_ms: number | null; sound_id: string | null; sound_original: number | null; language: string | null;
      region: string | null; creator_region: string | null; niche: string | null; niche_method: string | null; size_band: string | null; axes: string | null;
    }, [string, number]>(
      `SELECT v.id, v.platform, v.title, v.description, v.hashtags_json, v.duration_ms, v.sound_id, v.sound_original,
              v.language, v.region, c.region AS creator_region, c.niche, c.niche_method, c.size_band,
              (SELECT group_concat(axis || ':' || method) FROM trend_cohort_labels l
                WHERE l.video_id = v.id AND l.taxonomy_version = ${TREND_TAXONOMY_VERSION}) AS axes
       FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
       WHERE v.workspace_id = ?${llmFilter}
       ORDER BY COALESCE(v.outlier_score, -1e9) DESC, v.posted_at DESC
       LIMIT ?`,
    )
    .all(input.workspaceId, input.limit ?? 1_000_000);
  const wanted = input.videoIds ? new Set(input.videoIds) : null;
  return rows
    .filter((row) => !wanted || wanted.has(row.id))
    .map((row) => ({
      videoId: row.id,
      platform: row.platform,
      title: row.title,
      description: row.description,
      hashtags: parseStringArray(row.hashtags_json),
      durationMs: row.duration_ms,
      soundId: row.sound_id,
      soundOriginal: row.sound_original === null ? null : row.sound_original === 1,
      language: row.language,
      region: row.region,
      creatorRegion: row.creator_region,
      creatorNiche: row.niche,
      creatorNicheMethod: row.niche_method,
      sizeBand: row.size_band,
      existingAxes: row.axes ? row.axes.split(",") : [],
    }));
}

export type EffectiveLabel = { label: string; method: TrendLabelMethod; confidence: number | null };

const METHOD_RANK: Record<TrendLabelMethod, number> = { manual: 4, llm: 3, rule: 2, seed: 1 };
export const LLM_MIN_CONFIDENCE = 0.6;

/** Effective label per axis: manual > llm (confidence >= 0.6, not unknown) > rule > seed. */
export function effectiveTrendLabels(videoIds: readonly string[]): Map<string, Record<string, EffectiveLabel>> {
  const out = new Map<string, Record<string, EffectiveLabel>>();
  if (videoIds.length === 0) return out;
  const db = openDomainDb();
  for (let index = 0; index < videoIds.length; index += 500) {
    const group = videoIds.slice(index, index + 500);
    const rows = db
      .query<{ video_id: string; axis: string; method: TrendLabelMethod; label: string; confidence: number | null }, string[]>(
        `SELECT video_id, axis, method, label, confidence FROM trend_cohort_labels
         WHERE taxonomy_version = ${TREND_TAXONOMY_VERSION} AND video_id IN (${group.map(() => "?").join(",")})`,
      )
      .all(...group);
    for (const row of rows) {
      if (row.method === "llm" && (row.label === "unknown" || (row.confidence ?? 0) < LLM_MIN_CONFIDENCE)) continue;
      const labels = out.get(row.video_id) ?? {};
      const prior = labels[row.axis];
      if (!prior || METHOD_RANK[row.method] > METHOD_RANK[prior.method]) {
        labels[row.axis] = { label: row.label, method: row.method, confidence: row.confidence };
      }
      out.set(row.video_id, labels);
    }
  }
  return out;
}

export function setCreatorNiche(input: { creatorId: string; niche: string; subNiche?: string | null; method: "llm" | "manual" | "hashtag"; now: number }): void {
  withImmediateTransaction((db) => {
    db.prepare(
      `UPDATE trend_creators SET niche = ?, sub_niche = COALESCE(?, sub_niche), niche_method = ?, row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND (niche IS NULL OR niche_method <> 'manual')`,
    ).run(input.niche, input.subNiche ?? null, input.method, input.now, input.creatorId);
  });
}

// ─── Queries ────────────────────────────────────────────────────────────────

export type TrendVideoDto = {
  id: string;
  platform: TrendPlatform;
  platformVideoId: string;
  url: string;
  formatKey: string;
  creator: { id: string; handle: string | null; displayName: string | null; followers: number | null; sizeBand: string | null; niche: string | null };
  postedAt: number | null;
  durationMs: number | null;
  title: string | null;
  hashtags: string[];
  sound: { id: string | null; title: string | null; original: boolean | null };
  language: string | null;
  isAd: boolean | null;
  discoveredVia: string;
  inListing: boolean;
  latest: {
    asOf: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    viewsPrecision: string | null;
    source: string | null;
  };
  score: {
    multiplier: number | null;
    z: number | null;
    composite: number | null;
    label: string | null;
    mode: string | null;
    flags: string[];
    momentum: number | null;
    computedAt: number | null;
    cohortKey: string | null;
    detail: unknown;
  };
};

type TrendVideoDbRecord = {
  id: string; platform: TrendPlatform; platform_video_id: string; url: string; format_key: string;
  creator_id: string; handle: string | null; display_name: string | null; follower_count: number | null; size_band: string | null; niche: string | null;
  posted_at: number | null; duration_ms: number | null; title: string | null; hashtags_json: string | null;
  sound_id: string | null; sound_title: string | null; sound_original: number | null; language: string | null; is_ad: number | null;
  discovered_via: string; in_listing: number;
  latest_as_of: number | null; latest_views: number | null; latest_likes: number | null; latest_comments: number | null;
  latest_shares: number | null; latest_saves: number | null; latest_views_precision: string | null; latest_source: string | null;
  outlier_multiplier: number | null; outlier_z: number | null; outlier_score: number | null; outlier_label: string | null;
  outlier_mode: string | null; outlier_flags_json: string | null; outlier_detail_json: string | null;
  outlier_computed_at: number | null; momentum: number | null; cohort_key: string | null;
};

const VIDEO_COLUMNS = `v.id, v.platform, v.platform_video_id, v.url, v.format_key, v.creator_id, c.handle, c.display_name,
  c.follower_count, c.size_band, c.niche, v.posted_at, v.duration_ms, v.title, v.hashtags_json, v.sound_id, v.sound_title,
  v.sound_original, v.language, v.is_ad, v.discovered_via, v.in_listing, v.latest_as_of, v.latest_views, v.latest_likes,
  v.latest_comments, v.latest_shares, v.latest_saves, v.latest_views_precision, v.latest_source, v.outlier_multiplier,
  v.outlier_z, v.outlier_score, v.outlier_label, v.outlier_mode, v.outlier_flags_json, v.outlier_detail_json,
  v.outlier_computed_at, v.momentum, v.cohort_key`;

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonValue(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const toVideo = (row: TrendVideoDbRecord): TrendVideoDto => ({
  id: row.id,
  platform: row.platform,
  platformVideoId: row.platform_video_id,
  url: row.url,
  formatKey: row.format_key,
  creator: { id: row.creator_id, handle: row.handle, displayName: row.display_name, followers: row.follower_count, sizeBand: row.size_band, niche: row.niche },
  postedAt: row.posted_at,
  durationMs: row.duration_ms,
  title: row.title,
  hashtags: parseStringArray(row.hashtags_json),
  sound: { id: row.sound_id, title: row.sound_title, original: row.sound_original === null ? null : row.sound_original === 1 },
  language: row.language,
  isAd: row.is_ad === null ? null : row.is_ad === 1,
  discoveredVia: row.discovered_via,
  inListing: row.in_listing === 1,
  latest: {
    asOf: row.latest_as_of,
    views: row.latest_views,
    likes: row.latest_likes,
    comments: row.latest_comments,
    shares: row.latest_shares,
    saves: row.latest_saves,
    viewsPrecision: row.latest_views_precision,
    source: row.latest_source,
  },
  score: {
    multiplier: row.outlier_multiplier,
    z: row.outlier_z,
    composite: row.outlier_score,
    label: row.outlier_label,
    mode: row.outlier_mode,
    flags: parseStringArray(row.outlier_flags_json),
    momentum: row.momentum,
    computedAt: row.outlier_computed_at,
    cohortKey: row.cohort_key,
    detail: parseJsonValue(row.outlier_detail_json),
  },
});

export type TopQuery = {
  workspaceId: string;
  niches?: string[];
  since: number;
  by: "outlier" | "views" | "momentum";
  platform?: TrendPlatform;
  formatKey?: string;
  contentFormat?: string;
  sizeBand?: string;
  /** Keep videos whose creator baseline is thin (fewer than 8 window members). */
  includeThin?: boolean;
  limit: number;
};

export function queryTrendTop(input: TopQuery): TrendVideoDto[] {
  const filters = ["v.workspace_id = ?", "v.posted_at IS NOT NULL", "v.posted_at >= ?"];
  const values: Array<string | number> = [input.workspaceId, input.since];
  if (input.niches && input.niches.length > 0) {
    filters.push(`c.niche IN (${input.niches.map(() => "?").join(",")})`);
    values.push(...input.niches);
  }
  if (input.platform) {
    filters.push("v.platform = ?");
    values.push(input.platform);
  }
  if (input.formatKey) {
    filters.push("v.format_key = ?");
    values.push(input.formatKey);
  }
  if (input.sizeBand) {
    filters.push("c.size_band = ?");
    values.push(input.sizeBand);
  }
  if (input.contentFormat) {
    filters.push(`EXISTS (SELECT 1 FROM trend_cohort_labels l WHERE l.video_id = v.id AND l.axis = 'format'
      AND l.taxonomy_version = ${TREND_TAXONOMY_VERSION} AND l.label = ?
      AND (l.method <> 'llm' OR COALESCE(l.confidence, 0) >= ${LLM_MIN_CONFIDENCE}))`);
    values.push(input.contentFormat);
  }
  const order = input.by === "views"
    ? "v.latest_views IS NULL, v.latest_views DESC"
    : input.by === "momentum"
      ? "v.momentum IS NULL, v.momentum DESC"
      : "v.outlier_score IS NULL, v.outlier_score DESC, v.outlier_multiplier DESC";
  if (input.by === "outlier") filters.push("v.outlier_score IS NOT NULL");
  if (input.by === "outlier" && !input.includeThin) filters.push(`COALESCE(v.outlier_flags_json, '[]') NOT LIKE '%"thin"%'`);
  if (input.by === "momentum") filters.push("v.momentum IS NOT NULL");
  values.push(Math.max(1, Math.min(500, Math.floor(input.limit))));
  return openDomainDb()
    .query<TrendVideoDbRecord, Array<string | number>>(
      `SELECT ${VIDEO_COLUMNS} FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
       WHERE ${filters.join(" AND ")} ORDER BY ${order}, v.id LIMIT ?`,
    )
    .all(...values)
    .map(toVideo);
}

/** Sounds used by at least `minVideos` corpus videos posted in the window. */
/** Videos in scope that cannot be ranked by age window because no post time is known. */
export function countUndatedVideos(input: { workspaceId: string; niches?: string[]; platform?: TrendPlatform }): number {
  const values: string[] = [input.workspaceId];
  let filters = "";
  if (input.niches && input.niches.length > 0) {
    filters += ` AND c.niche IN (${input.niches.map(() => "?").join(",")})`;
    values.push(...input.niches);
  }
  if (input.platform) {
    filters += " AND v.platform = ?";
    values.push(input.platform);
  }
  return openDomainDb()
    .query<{ n: number }, string[]>(
      `SELECT COUNT(*) AS n FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
       WHERE v.workspace_id = ? AND v.posted_at IS NULL${filters}`,
    )
    .get(...values)?.n ?? 0;
}

/** Key a sound by its platform id, else by its title (listings expose only the track title). */
export function soundKey(sound: { id: string | null; title: string | null }): string | null {
  return sound.id ? `id:${sound.id}` : sound.title ? `title:${sound.title}` : null;
}

/** Sounds used by at least `minVideos` corpus videos posted in the window (keys from `soundKey`). */
export function trendingSoundKeys(input: { workspaceId: string; since: number; minVideos: number }): Set<string> {
  return new Set(
    openDomainDb()
      .query<{ sound_key: string }, [string, number, number]>(
        `SELECT CASE WHEN sound_id IS NOT NULL THEN 'id:' || sound_id ELSE 'title:' || sound_title END AS sound_key
         FROM trend_videos WHERE workspace_id = ? AND (sound_id IS NOT NULL OR sound_title IS NOT NULL) AND posted_at >= ?
           AND COALESCE(sound_original, 0) = 0
         GROUP BY sound_key HAVING COUNT(*) >= ?`,
      )
      .all(input.workspaceId, input.since, input.minVideos)
      .map((row) => row.sound_key),
  );
}

export type TrendDigestLinkDto = { videoId: string; digestVersion: number; refKind: string; digestRef: string; createdAt: number };

export function latestDigestLinks(videoIds: readonly string[]): Map<string, TrendDigestLinkDto> {
  const out = new Map<string, TrendDigestLinkDto>();
  if (videoIds.length === 0) return out;
  const db = openDomainDb();
  for (let index = 0; index < videoIds.length; index += 500) {
    const group = videoIds.slice(index, index + 500);
    for (const row of db
      .query<{ video_id: string; digest_version: number; ref_kind: string; digest_ref: string; created_at: number }, string[]>(
        `SELECT video_id, digest_version, ref_kind, digest_ref, created_at FROM trend_video_digests d
         WHERE video_id IN (${group.map(() => "?").join(",")})
           AND digest_version = (SELECT MAX(digest_version) FROM trend_video_digests x WHERE x.video_id = d.video_id)`,
      )
      .all(...group)) {
      out.set(row.video_id, { videoId: row.video_id, digestVersion: row.digest_version, refKind: row.ref_kind, digestRef: row.digest_ref, createdAt: row.created_at });
    }
  }
  return out;
}

/** Resolve a video by trend id, platform id, or URL inside the Workspace. */
export function findTrendVideo(input: { workspaceId: string; ref: string }): TrendVideoDto | null {
  const ref = input.ref.trim();
  const row = openDomainDb()
    .query<TrendVideoDbRecord, [string, string, string, string]>(
      `SELECT ${VIDEO_COLUMNS} FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
       WHERE v.workspace_id = ? AND (v.id = ? OR v.platform_video_id = ? OR v.url = ?) LIMIT 1`,
    )
    .get(input.workspaceId, ref, ref, ref);
  return row ? toVideo(row) : null;
}

export function linkTrendDigest(input: {
  workspaceId: string;
  videoId: string;
  refKind: "bundle" | "document";
  digestRef: string;
  params?: Record<string, string | number | boolean | null> | null;
  now?: number;
}): TrendDigestLinkDto {
  const now = input.now ?? Date.now();
  return withImmediateTransaction((db) => {
    const video = db.query<{ id: string }, [string, string]>("SELECT id FROM trend_videos WHERE id = ? AND workspace_id = ?").get(input.videoId, input.workspaceId);
    if (!video) throw new Error(`Trend video not found: ${input.videoId}`);
    const version = (db.query<{ v: number | null }, [string]>("SELECT MAX(digest_version) AS v FROM trend_video_digests WHERE video_id = ?").get(input.videoId)?.v ?? 0) + 1;
    db.prepare(
      "INSERT INTO trend_video_digests (video_id, digest_version, ref_kind, digest_ref, params_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(input.videoId, version, input.refKind, input.digestRef, input.params ? JSON.stringify(input.params) : null, now);
    return { videoId: input.videoId, digestVersion: version, refKind: input.refKind, digestRef: input.digestRef, createdAt: now };
  });
}

export type TrendCreatorDto = {
  id: string;
  platform: TrendPlatform;
  platformCreatorId: string;
  handle: string | null;
  displayName: string | null;
  followers: number | null;
  sizeBand: string | null;
  niche: string | null;
  subNiche: string | null;
  nicheMethod: string | null;
  region: string | null;
  tier: string;
  discoveredVia: string;
  lastListedAt: number | null;
  nextListAt: number | null;
  lastPostedAt: number | null;
  listingFailures: number;
  lastListError: string | null;
};

type TrendCreatorDbRecord = {
  id: string; platform: TrendPlatform; platform_creator_id: string; handle: string | null; display_name: string | null;
  follower_count: number | null; size_band: string | null; niche: string | null; sub_niche: string | null; niche_method: string | null;
  region: string | null; tier: string; discovered_via: string; last_listed_at: number | null; next_list_at: number | null;
  last_posted_at: number | null; listing_failures: number; last_list_error: string | null;
};

const toCreator = (row: TrendCreatorDbRecord): TrendCreatorDto => ({
  id: row.id,
  platform: row.platform,
  platformCreatorId: row.platform_creator_id,
  handle: row.handle,
  displayName: row.display_name,
  followers: row.follower_count,
  sizeBand: row.size_band,
  niche: row.niche,
  subNiche: row.sub_niche,
  nicheMethod: row.niche_method,
  region: row.region,
  tier: row.tier,
  discoveredVia: row.discovered_via,
  lastListedAt: row.last_listed_at,
  nextListAt: row.next_list_at,
  lastPostedAt: row.last_posted_at,
  listingFailures: row.listing_failures,
  lastListError: row.last_list_error,
});

export function findTrendCreators(input: { workspaceId: string; ref: string }): TrendCreatorDto[] {
  const ref = input.ref.trim();
  const handle = ref.replace(/^@/, "");
  return openDomainDb()
    .query<TrendCreatorDbRecord, [string, string, string, string, string]>(
      `SELECT id, platform, platform_creator_id, handle, display_name, follower_count, size_band, niche, sub_niche,
              niche_method, region, tier, discovered_via, last_listed_at, next_list_at, last_posted_at,
              listing_failures, last_list_error
       FROM trend_creators
       WHERE workspace_id = ? AND (id = ? OR platform_creator_id = ? OR handle = ? OR handle = ?)
       ORDER BY platform, id LIMIT 20`,
    )
    .all(input.workspaceId, ref, ref, handle, `@${handle}`)
    .map(toCreator);
}

export function creatorDetail(input: { workspaceId: string; creatorId: string; limit: number }) {
  const db = openDomainDb();
  return db.transaction(() => {
    const followerHistory = db
      .query<{ asOf: number; source: string; followers: number | null; videoCount: number | null }, [string]>(
        `SELECT as_of AS asOf, source, follower_count AS followers, video_count AS videoCount
         FROM trend_creator_snapshots WHERE creator_id = ? ORDER BY as_of DESC LIMIT 30`,
      )
      .all(input.creatorId);
    const baselines = db
      .query<{ formatKey: string; metric: string; medianLog: number; madLog: number; n: number; computedAt: number }, [string]>(
        `SELECT format_key AS formatKey, metric, median_log AS medianLog, mad_log AS madLog, n, computed_at AS computedAt
         FROM trend_baselines WHERE creator_id = ? ORDER BY format_key, metric`,
      )
      .all(input.creatorId);
    const counts = db
      .query<{ videos: number; listed: number; scored: number; snapshots: number }, [string, string]>(
        `SELECT COUNT(*) AS videos, SUM(in_listing) AS listed, SUM(outlier_score IS NOT NULL) AS scored,
                (SELECT COUNT(*) FROM trend_metric_snapshots s JOIN trend_videos x ON x.id = s.video_id WHERE x.creator_id = ?) AS snapshots
         FROM trend_videos WHERE creator_id = ?`,
      )
      .get(input.creatorId, input.creatorId)!;
    const videos = db
      .query<TrendVideoDbRecord, [string, string, number]>(
        `SELECT ${VIDEO_COLUMNS} FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
         WHERE v.workspace_id = ? AND v.creator_id = ? ORDER BY v.posted_at IS NULL, v.posted_at DESC, v.id LIMIT ?`,
      )
      .all(input.workspaceId, input.creatorId, input.limit)
      .map(toVideo);
    return { followerHistory, baselines, counts: { videos: counts.videos, listed: counts.listed ?? 0, scored: counts.scored ?? 0, snapshots: counts.snapshots }, videos };
  })();
}

// ─── Status ─────────────────────────────────────────────────────────────────

export type TrendRunSummaryDto = {
  runId: string;
  kind: string;
  state: string;
  source: string | null;
  createdAt: number;
  endedAt: number | null;
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  response: unknown;
};

export function recentTrendRuns(input: { workspaceId: string; limit: number }): TrendRunSummaryDto[] {
  return openDomainDb()
    .query<{ id: string; kind: string; state: string; metadata_json: string | null; created_at: number; ended_at: number | null; provider: string | null; model: string | null; cost_usd: number | null; response_json: string | null }, [string, number]>(
      `SELECT r.id, r.kind, r.state, r.metadata_json, r.created_at, r.ended_at,
              a.provider, a.model, a.cost_usd, a.response_json
       FROM runs r LEFT JOIN run_attempts a ON a.run_id = r.id
       WHERE r.workspace_id = ? AND r.kind GLOB 'trend.*'
       ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
    )
    .all(input.workspaceId, input.limit)
    .map((row) => {
      const metadata = parseJsonValue(row.metadata_json) as { source?: unknown } | null;
      return {
        runId: row.id,
        kind: row.kind,
        state: row.state,
        source: typeof metadata?.source === "string" ? metadata.source : null,
        createdAt: row.created_at,
        endedAt: row.ended_at,
        provider: row.provider,
        model: row.model,
        costUsd: row.cost_usd,
        response: parseJsonValue(row.response_json),
      };
    });
}

/** Apify spend recorded on trend runs for one actor since `since` (cost lives on Run Attempts). */
export function trendApifySpend(input: { workspaceId: string; actorId?: string; since: number }): Array<{ actorId: string; usd: number; runs: number }> {
  const values: Array<string | number> = [input.workspaceId, input.since];
  const actorFilter = input.actorId ? " AND a.model = ?" : "";
  if (input.actorId) values.push(input.actorId);
  return openDomainDb()
    .query<{ actorId: string; usd: number; runs: number }, Array<string | number>>(
      `SELECT a.model AS actorId, COALESCE(SUM(a.cost_usd), 0) AS usd, SUM(a.cost_usd IS NOT NULL) AS runs
       FROM run_attempts a JOIN runs r ON r.id = a.run_id
       WHERE r.workspace_id = ? AND r.kind GLOB 'trend.*' AND a.provider = 'apify' AND a.started_at >= ?${actorFilter}
       GROUP BY a.model ORDER BY a.model`,
    )
    .all(...values);
}

export function trendCounts(input: { workspaceId: string; now: number }) {
  const db = openDomainDb();
  return db.transaction(() => {
    const creators = db
      .query<{ platform: string; tier: string; n: number; listed: number }, [string]>(
        `SELECT platform, tier, COUNT(*) AS n, SUM(last_listed_at IS NOT NULL) AS listed FROM trend_creators
         WHERE workspace_id = ? GROUP BY platform, tier ORDER BY platform, tier`,
      )
      .all(input.workspaceId);
    const videos = db
      .query<{ platform: string; n: number; listed: number; dated: number; scored: number; young: number }, [number, string]>(
        `SELECT platform, COUNT(*) AS n, SUM(in_listing) AS listed, SUM(posted_at IS NOT NULL) AS dated,
                SUM(outlier_score IS NOT NULL) AS scored, COALESCE(SUM(posted_at >= ?), 0) AS young
         FROM trend_videos WHERE workspace_id = ? GROUP BY platform ORDER BY platform`,
      )
      .all(input.now - 14 * DAY_MS, input.workspaceId);
    const labels = db
      .query<{ label: string | null; n: number }, [string]>(
        `SELECT outlier_label AS label, COUNT(*) AS n FROM trend_videos WHERE workspace_id = ? AND outlier_score IS NOT NULL
         GROUP BY outlier_label ORDER BY n DESC`,
      )
      .all(input.workspaceId);
    const snapshots = db
      .query<{ n: number }, [string]>(
        `SELECT COUNT(*) AS n FROM trend_metric_snapshots s JOIN trend_videos v ON v.id = s.video_id WHERE v.workspace_id = ?`,
      )
      .get(input.workspaceId)?.n ?? 0;
    const cohortLabels = db
      .query<{ axis: string; method: string; n: number }, [string]>(
        `SELECT l.axis, l.method, COUNT(*) AS n FROM trend_cohort_labels l JOIN trend_videos v ON v.id = l.video_id
         WHERE v.workspace_id = ? GROUP BY l.axis, l.method ORDER BY l.axis, l.method`,
      )
      .all(input.workspaceId);
    const due = db
      .query<{ n: number }, [string, number]>(
        `SELECT COUNT(*) AS n FROM trend_creators WHERE workspace_id = ? AND tier <> 'excluded'
         AND (next_list_at IS NULL OR next_list_at <= ?)`,
      )
      .get(input.workspaceId, input.now)?.n ?? 0;
    const niches = db
      .query<{ niche: string | null; creators: number; videos: number }, [string]>(
        `SELECT c.niche AS niche, COUNT(DISTINCT c.id) AS creators, COUNT(v.id) AS videos
         FROM trend_creators c LEFT JOIN trend_videos v ON v.creator_id = c.id
         WHERE c.workspace_id = ? GROUP BY c.niche ORDER BY videos DESC`,
      )
      .all(input.workspaceId);
    return { creators, videos, labels, snapshots, cohortLabels, dueCreators: due, niches };
  })();
}

// ─── Cohort baselines for consumers (#558 seam) ─────────────────────────────

export type CohortSampleDto = {
  platform: TrendPlatform;
  postedAt: number;
  durationMs: number | null;
  niche: string | null;
  sizeBand: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  asOf: number;
};

/** Listing members in a window, for cohort medians computed by the caller. */
export function cohortSample(input: { workspaceId: string; platform: TrendPlatform; niches?: string[]; since: number; until: number; limit?: number }): CohortSampleDto[] {
  const values: Array<string | number> = [input.workspaceId, input.platform, input.since, input.until];
  let nicheFilter = "";
  if (input.niches && input.niches.length > 0) {
    nicheFilter = ` AND c.niche IN (${input.niches.map(() => "?").join(",")})`;
    values.push(...input.niches);
  }
  values.push(input.limit ?? 200_000);
  return openDomainDb()
    .query<CohortSampleDto, Array<string | number>>(
      `SELECT v.platform, v.posted_at AS postedAt, v.duration_ms AS durationMs, c.niche, c.size_band AS sizeBand,
              v.latest_views AS views, v.latest_likes AS likes, v.latest_comments AS comments,
              v.latest_shares AS shares, v.latest_saves AS saves, v.latest_as_of AS asOf
       FROM trend_videos v JOIN trend_creators c ON c.id = v.creator_id
       WHERE v.workspace_id = ? AND v.platform = ? AND v.in_listing = 1 AND v.posted_at IS NOT NULL
         AND v.posted_at >= ? AND v.posted_at <= ? AND v.latest_as_of IS NOT NULL${nicheFilter}
       LIMIT ?`,
    )
    .all(...values);
}

export const TREND_METRIC_NAMES: readonly TrendMetric[] = TREND_METRICS;
