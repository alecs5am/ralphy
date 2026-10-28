import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { createDocument, reviseDocument } from "./documents.js";
import { TREND_TAXONOMY_VERSION, LLM_MIN_CONFIDENCE } from "./trends.js";
import { truncateCodePoints, type TrendPlatform } from "../trends/math.js";
import type { NicheSettings, NicheTaxonomy } from "../trends/niche.js";
import { isLabelPercentiles, type LabelPercentiles } from "../trends/thresholds.js";

/**
 * Open niches and their creator memberships (#576). Every function takes an
 * explicit Workspace or niche id. A niche row holds the taxonomy (sub-niches
 * and relevance lexicon) and settings; a member row holds the relevance-gate
 * verdict and the main / negative / anomaly group, re-evaluated on each
 * `trends niche init`.
 */

export type NicheSeedSource = "file" | "llm" | "topic";

export type NicheDto = {
  id: string;
  workspaceId: string;
  slug: string;
  topic: string;
  languages: string[];
  platforms: TrendPlatform[];
  parentNiche: string | null;
  taxonomy: NicheTaxonomy;
  settings: NicheSettings;
  seedSource: NicheSeedSource;
  lastRunId: string | null;
  createdAt: number;
  updatedAt: number;
};

type NicheDbRecord = {
  id: string;
  workspace_id: string;
  slug: string;
  topic: string;
  languages_json: string;
  platforms_json: string;
  parent_niche: string | null;
  taxonomy_json: string;
  settings_json: string;
  seed_source: NicheSeedSource;
  last_run_id: string | null;
  created_at: number;
  updated_at: number;
};

const toNiche = (row: NicheDbRecord): NicheDto => ({
  id: row.id,
  workspaceId: row.workspace_id,
  slug: row.slug,
  topic: row.topic,
  languages: JSON.parse(row.languages_json) as string[],
  platforms: JSON.parse(row.platforms_json) as TrendPlatform[],
  parentNiche: row.parent_niche,
  taxonomy: JSON.parse(row.taxonomy_json) as NicheTaxonomy,
  settings: JSON.parse(row.settings_json) as NicheSettings,
  seedSource: row.seed_source,
  lastRunId: row.last_run_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function upsertNiche(input: {
  workspaceId: string;
  slug: string;
  topic: string;
  languages: string[];
  platforms: TrendPlatform[];
  parentNiche: string | null;
  taxonomy: NicheTaxonomy;
  settings: NicheSettings;
  seedSource: NicheSeedSource;
  now?: number;
}): NicheDto {
  const now = input.now ?? Date.now();
  return withImmediateTransaction((db) => {
    const workspace = db.query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?").get(input.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${input.workspaceId}`);
    const existing = db.query<{ id: string }, [string, string]>("SELECT id FROM trend_niches WHERE workspace_id = ? AND slug = ?").get(input.workspaceId, input.slug);
    const values = [
      truncateCodePoints(input.topic, 200),
      JSON.stringify(input.languages),
      JSON.stringify(input.platforms),
      input.parentNiche,
      JSON.stringify(input.taxonomy),
      JSON.stringify(input.settings),
      input.seedSource,
    ] as const;
    if (existing) {
      db.prepare(
        `UPDATE trend_niches SET topic = ?, languages_json = ?, platforms_json = ?, parent_niche = ?, taxonomy_json = ?,
           settings_json = ?, seed_source = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?`,
      ).run(...values, now, existing.id);
      return toNiche(db.query<NicheDbRecord, [string]>("SELECT * FROM trend_niches WHERE id = ?").get(existing.id)!);
    }
    const id = newDomainId("tniche");
    db.prepare(
      `INSERT INTO trend_niches (id, workspace_id, slug, topic, languages_json, platforms_json, parent_niche, taxonomy_json,
         settings_json, seed_source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.workspaceId, input.slug, ...values, now, now);
    return toNiche(db.query<NicheDbRecord, [string]>("SELECT * FROM trend_niches WHERE id = ?").get(id)!);
  });
}

export function getNiche(input: { workspaceId: string; ref: string }): NicheDto | null {
  const row = openDomainDb()
    .query<NicheDbRecord, [string, string, string]>("SELECT * FROM trend_niches WHERE workspace_id = ? AND (id = ? OR slug = ?) LIMIT 1")
    .get(input.workspaceId, input.ref, input.ref);
  return row ? toNiche(row) : null;
}

export function listNiches(input: { workspaceId: string }): NicheDto[] {
  return openDomainDb().query<NicheDbRecord, [string]>("SELECT * FROM trend_niches WHERE workspace_id = ? ORDER BY slug").all(input.workspaceId).map(toNiche);
}

/** Slugs of the Workspace's open niches (empty when the table has no rows). */
export function openNicheSlugs(workspaceId: string): Set<string> {
  return new Set(
    openDomainDb().query<{ slug: string }, [string]>("SELECT slug FROM trend_niches WHERE workspace_id = ?").all(workspaceId).map((row) => row.slug),
  );
}

/** Per-niche label percentile overrides from niche settings. */
export function nicheLabelOverrides(workspaceId: string): Record<string, LabelPercentiles> {
  const out: Record<string, LabelPercentiles> = {};
  for (const row of openDomainDb().query<{ slug: string; settings_json: string }, [string]>("SELECT slug, settings_json FROM trend_niches WHERE workspace_id = ?").all(workspaceId)) {
    const settings = JSON.parse(row.settings_json) as { labelPercentiles?: unknown };
    if (isLabelPercentiles(settings.labelPercentiles)) out[row.slug] = settings.labelPercentiles;
  }
  return out;
}

export function markNicheRun(input: { nicheId: string; runId: string; now: number }): void {
  withImmediateTransaction((db) => {
    db.prepare("UPDATE trend_niches SET last_run_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?").run(input.runId, input.now, input.nicheId);
  });
}

// ─── Members ────────────────────────────────────────────────────────────────

export type NicheMemberStatus = "candidate" | "kept" | "dropped" | "undetermined";
export type NicheCohortGroup = "main" | "negative" | "anomaly";

export type NicheMemberDto = {
  creatorId: string;
  platform: TrendPlatform;
  platformCreatorId: string;
  handle: string | null;
  displayName: string | null;
  followers: number | null;
  sizeBand: string | null;
  tier: string;
  lastListedAt: number | null;
  lastPostedAt: number | null;
  listingFailures: number;
  lastListError: string | null;
  creatorNiche: string | null;
  metadata: Record<string, unknown> | null;
  status: NicheMemberStatus;
  cohortGroup: NicheCohortGroup | null;
  language: string | null;
  relevance: number | null;
  sampled: number | null;
  onTopic: number | null;
  subNiche: string | null;
  subNicheConfidence: number | null;
  gateMethod: string | null;
  gateReason: string | null;
  flags: string[];
  evidence: Record<string, unknown> | null;
  round: number;
  discoveredVia: string;
  evaluatedAt: number | null;
};

type MemberDbRecord = {
  creator_id: string; platform: TrendPlatform; platform_creator_id: string; handle: string | null; display_name: string | null;
  follower_count: number | null; size_band: string | null; tier: string; last_listed_at: number | null; last_posted_at: number | null;
  listing_failures: number; last_list_error: string | null; creator_niche: string | null; metadata_json: string | null;
  status: NicheMemberStatus; cohort_group: NicheCohortGroup | null; language: string | null; relevance: number | null;
  sampled: number | null; on_topic: number | null; sub_niche: string | null; sub_niche_confidence: number | null;
  gate_method: string | null; gate_reason: string | null; flags_json: string; evidence_json: string | null; round: number;
  discovered_via: string; evaluated_at: number | null;
};

const parseObject = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const toMember = (row: MemberDbRecord): NicheMemberDto => ({
  creatorId: row.creator_id,
  platform: row.platform,
  platformCreatorId: row.platform_creator_id,
  handle: row.handle,
  displayName: row.display_name,
  followers: row.follower_count,
  sizeBand: row.size_band,
  tier: row.tier,
  lastListedAt: row.last_listed_at,
  lastPostedAt: row.last_posted_at,
  listingFailures: row.listing_failures,
  lastListError: row.last_list_error,
  creatorNiche: row.creator_niche,
  metadata: parseObject(row.metadata_json),
  status: row.status,
  cohortGroup: row.cohort_group,
  language: row.language,
  relevance: row.relevance,
  sampled: row.sampled,
  onTopic: row.on_topic,
  subNiche: row.sub_niche,
  subNicheConfidence: row.sub_niche_confidence,
  gateMethod: row.gate_method,
  gateReason: row.gate_reason,
  flags: (JSON.parse(row.flags_json) as unknown[]).filter((flag): flag is string => typeof flag === "string"),
  evidence: parseObject(row.evidence_json),
  round: row.round,
  discoveredVia: row.discovered_via,
  evaluatedAt: row.evaluated_at,
});

/** Register discovered creators as candidates (existing members keep their state). */
export function addNicheCandidates(input: { nicheId: string; runId: string | null; now: number; entries: Array<{ creatorId: string; via: string; round: number }> }): { added: number } {
  return withImmediateTransaction((db) => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO trend_niche_members (niche_id, creator_id, status, round, discovered_via, run_id, created_at, updated_at)
       VALUES (?, ?, 'candidate', ?, ?, ?, ?, ?)`,
    );
    let added = 0;
    for (const entry of input.entries) {
      added += insert.run(input.nicheId, entry.creatorId, entry.round, truncateCodePoints(entry.via || "seed", 600), input.runId, input.now, input.now).changes;
    }
    return { added };
  });
}

export type GateWrite = {
  creatorId: string;
  status: "kept" | "dropped" | "undetermined";
  reason: string;
  method: "rule" | "llm" | "manual";
  language: string | null;
  relevance: number | null;
  sampled: number;
  onTopic: number;
  subNiche: string | null;
  subNicheConfidence: number | null;
  evidence: Record<string, unknown>;
};

/**
 * Write relevance-gate verdicts. A kept creator without a niche takes this
 * niche (and its sub-niche) as its creator-level niche, so cohort keys and
 * percentile thresholds run per open niche; a creator already carrying
 * another niche keeps it.
 */
export function writeGateResults(input: { nicheId: string; nicheSlug: string; runId: string | null; now: number; results: GateWrite[] }): { kept: number; dropped: number; undetermined: number } {
  return withImmediateTransaction((db) => {
    const update = db.prepare(
      `UPDATE trend_niche_members SET status = ?, gate_reason = ?, gate_method = ?, language = ?, relevance = ?, sampled = ?, on_topic = ?,
         sub_niche = ?, sub_niche_confidence = ?, evidence_json = ?, evaluated_at = ?, run_id = COALESCE(?, run_id),
         cohort_group = CASE WHEN ? = 'kept' THEN COALESCE(cohort_group, 'main') ELSE NULL END,
         row_version = row_version + 1, updated_at = ?
       WHERE niche_id = ? AND creator_id = ? AND (gate_method IS NULL OR gate_method <> 'manual')`,
    );
    const assign = db.prepare(
      `UPDATE trend_creators SET niche = ?, sub_niche = ?, niche_method = 'seed', row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND (niche IS NULL OR niche = ?)`,
    );
    const counts = { kept: 0, dropped: 0, undetermined: 0 };
    for (const result of input.results) {
      update.run(
        result.status,
        truncateCodePoints(result.reason, 120),
        result.method,
        result.language,
        result.relevance,
        result.sampled,
        result.onTopic,
        result.subNiche,
        result.subNicheConfidence,
        JSON.stringify(result.evidence),
        input.now,
        input.runId,
        result.status,
        input.now,
        input.nicheId,
        result.creatorId,
      );
      if (result.status === "kept") assign.run(input.nicheSlug, result.subNiche, input.now, result.creatorId, input.nicheSlug);
      counts[result.status] += 1;
    }
    return counts;
  });
}

/** Group (main / negative / anomaly) and flags for kept members. */
export function writeMemberGroups(input: { nicheId: string; now: number; groups: Array<{ creatorId: string; group: NicheCohortGroup; flags: string[] }> }): void {
  withImmediateTransaction((db) => {
    const update = db.prepare(
      `UPDATE trend_niche_members SET cohort_group = ?, flags_json = ?, row_version = row_version + 1, updated_at = ?
       WHERE niche_id = ? AND creator_id = ? AND status = 'kept'`,
    );
    for (const entry of input.groups) update.run(entry.group, JSON.stringify([...new Set(entry.flags)].sort()), input.now, input.nicheId, entry.creatorId);
  });
}

export function loadNicheMembers(input: { nicheId: string; statuses?: NicheMemberStatus[] }): NicheMemberDto[] {
  const filter = input.statuses && input.statuses.length > 0 ? ` AND m.status IN (${input.statuses.map(() => "?").join(",")})` : "";
  return openDomainDb()
    .query<MemberDbRecord, string[]>(
      `SELECT m.creator_id, c.platform, c.platform_creator_id, c.handle, c.display_name, c.follower_count, c.size_band, c.tier,
              c.last_listed_at, c.last_posted_at, c.listing_failures, c.last_list_error, c.niche AS creator_niche, c.metadata_json,
              m.status, m.cohort_group, m.language, m.relevance, m.sampled, m.on_topic, m.sub_niche, m.sub_niche_confidence,
              m.gate_method, m.gate_reason, m.flags_json, m.evidence_json, m.round, m.discovered_via, m.evaluated_at
       FROM trend_niche_members m JOIN trend_creators c ON c.id = m.creator_id
       WHERE m.niche_id = ?${filter}
       ORDER BY m.round, m.created_at, m.creator_id`,
    )
    .all(input.nicheId, ...(input.statuses ?? []))
    .map(toMember);
}

export type GateVideoDto = { title: string | null; description: string | null; hashtags: string[]; postedAt: number | null };

/** Newest videos per creator seen in its own listing (post time desc; undated rows in listing order). */
export function loadGateVideos(input: { creatorIds: readonly string[]; sample: number }): Map<string, GateVideoDto[]> {
  const out = new Map<string, GateVideoDto[]>();
  const db = openDomainDb();
  const query = db.query<{ title: string | null; description: string | null; hashtags_json: string | null; posted_at: number | null }, [string, number]>(
    `SELECT title, description, hashtags_json, posted_at FROM trend_videos
     WHERE creator_id = ? AND in_listing = 1
     ORDER BY posted_at IS NULL, posted_at DESC, rowid ASC LIMIT ?`,
  );
  for (const creatorId of input.creatorIds) {
    out.set(creatorId, query.all(creatorId, input.sample).map((row) => ({
      title: row.title,
      description: row.description,
      hashtags: parseStrings(row.hashtags_json),
      postedAt: row.posted_at,
    })));
  }
  return out;
}

function parseStrings(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Creator by handle on a platform (case-insensitive, with or without @). */
export function findCreatorIdByHandle(input: { workspaceId: string; platform: TrendPlatform; handle: string }): string | null {
  const bare = input.handle.replace(/^@/, "").toLowerCase();
  return openDomainDb()
    .query<{ id: string }, [string, string, string, string]>(
      `SELECT id FROM trend_creators WHERE workspace_id = ? AND platform = ? AND (lower(handle) = ? OR lower(handle) = ?)
       ORDER BY last_listed_at IS NULL, created_at LIMIT 1`,
    )
    .get(input.workspaceId, input.platform, bare, `@${bare}`)?.id ?? null;
}

/** Lowercased handles already known on a platform (to skip re-resolving them). */
export function knownHandles(input: { workspaceId: string; platform: TrendPlatform }): Set<string> {
  return new Set(
    openDomainDb()
      .query<{ handle: string }, [string, string]>("SELECT handle FROM trend_creators WHERE workspace_id = ? AND platform = ? AND handle IS NOT NULL")
      .all(input.workspaceId, input.platform)
      .map((row) => row.handle.replace(/^@/, "").toLowerCase()),
  );
}

/**
 * Off-topic creators found only through this niche's seeds leave the refresh
 * rotation (tier `excluded` with a gate reason); a later keep restores them.
 */
export function setGateExclusion(input: { creatorIds: readonly string[]; exclude: boolean; now: number }): number {
  return withImmediateTransaction((db) => {
    let changed = 0;
    if (input.exclude) {
      const update = db.prepare(
        `UPDATE trend_creators SET tier = 'excluded', last_list_error = 'relevance gate: off-topic for every niche', updated_at = ?
         WHERE id = ? AND niche IS NULL AND tier <> 'excluded'
           AND NOT EXISTS (SELECT 1 FROM trend_niche_members m WHERE m.creator_id = trend_creators.id AND m.status IN ('kept', 'candidate', 'undetermined'))`,
      );
      for (const id of input.creatorIds) changed += update.run(input.now, id).changes;
    } else {
      const update = db.prepare(
        `UPDATE trend_creators SET tier = 'active', last_list_error = NULL, updated_at = ?
         WHERE id = ? AND tier = 'excluded' AND last_list_error LIKE 'relevance gate:%'`,
      );
      for (const id of input.creatorIds) changed += update.run(input.now, id).changes;
    }
    return changed;
  });
}

// ─── Analysis inputs ────────────────────────────────────────────────────────

export type NicheVideoDto = {
  id: string;
  creatorId: string;
  platform: TrendPlatform;
  platformVideoId: string;
  url: string;
  postedAt: number | null;
  postedAtSource: string | null;
  durationMs: number | null;
  title: string | null;
  description: string | null;
  hashtags: string[];
  inListing: boolean;
  latestAsOf: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  viewsPrecision: string | null;
  latestSource: string | null;
  multiplier: number | null;
  z: number | null;
  composite: number | null;
  label: string | null;
  flags: string[];
  cohortKey: string | null;
  detail: Record<string, unknown> | null;
  format: string | null;
  hook: string | null;
};

/** Listing videos of the given creators with scores and effective format / hook labels. */
export function loadNicheVideos(input: { creatorIds: readonly string[] }): NicheVideoDto[] {
  const db = openDomainDb();
  const out: NicheVideoDto[] = [];
  const labelMethodRank = "CASE l.method WHEN 'manual' THEN 4 WHEN 'llm' THEN 3 WHEN 'rule' THEN 2 ELSE 1 END";
  const labelFor = (axis: string) => `(SELECT l.label FROM trend_cohort_labels l WHERE l.video_id = v.id AND l.axis = '${axis}'
      AND l.taxonomy_version = ${TREND_TAXONOMY_VERSION}
      AND (l.method <> 'llm' OR (l.label <> 'unknown' AND COALESCE(l.confidence, 0) >= ${LLM_MIN_CONFIDENCE}))
      ORDER BY ${labelMethodRank} DESC LIMIT 1)`;
  for (let index = 0; index < input.creatorIds.length; index += 400) {
    const group = input.creatorIds.slice(index, index + 400);
    const rows = db
      .query<{
        id: string; creator_id: string; platform: TrendPlatform; platform_video_id: string; url: string; posted_at: number | null;
        posted_at_source: string | null; duration_ms: number | null; title: string | null; description: string | null; hashtags_json: string | null;
        in_listing: number; latest_as_of: number | null; latest_views: number | null; latest_likes: number | null; latest_comments: number | null;
        latest_shares: number | null; latest_saves: number | null; latest_views_precision: string | null; latest_source: string | null;
        outlier_multiplier: number | null; outlier_z: number | null; outlier_score: number | null; outlier_label: string | null;
        outlier_flags_json: string | null; cohort_key: string | null; outlier_detail_json: string | null; format: string | null; hook: string | null;
      }, string[]>(
        `SELECT v.id, v.creator_id, v.platform, v.platform_video_id, v.url, v.posted_at, v.posted_at_source, v.duration_ms, v.title,
                v.description, v.hashtags_json, v.in_listing, v.latest_as_of, v.latest_views, v.latest_likes, v.latest_comments,
                v.latest_shares, v.latest_saves, v.latest_views_precision, v.latest_source, v.outlier_multiplier, v.outlier_z,
                v.outlier_score, v.outlier_label, v.outlier_flags_json, v.cohort_key, v.outlier_detail_json,
                ${labelFor("format")} AS format, ${labelFor("hook")} AS hook
         FROM trend_videos v WHERE v.creator_id IN (${group.map(() => "?").join(",")}) AND v.in_listing = 1`,
      )
      .all(...group);
    for (const row of rows) {
      out.push({
        id: row.id,
        creatorId: row.creator_id,
        platform: row.platform,
        platformVideoId: row.platform_video_id,
        url: row.url,
        postedAt: row.posted_at,
        postedAtSource: row.posted_at_source,
        durationMs: row.duration_ms,
        title: row.title,
        description: row.description,
        hashtags: parseStrings(row.hashtags_json),
        inListing: row.in_listing === 1,
        latestAsOf: row.latest_as_of,
        views: row.latest_views,
        likes: row.latest_likes,
        comments: row.latest_comments,
        shares: row.latest_shares,
        saves: row.latest_saves,
        viewsPrecision: row.latest_views_precision,
        latestSource: row.latest_source,
        multiplier: row.outlier_multiplier,
        z: row.outlier_z,
        composite: row.outlier_score,
        label: row.outlier_label,
        flags: parseStrings(row.outlier_flags_json),
        cohortKey: row.cohort_key,
        detail: parseObject(row.outlier_detail_json),
        format: row.format,
        hook: row.hook,
      });
    }
  }
  return out;
}

/** Follower snapshots per creator, oldest first. */
export function followerSeries(input: { creatorIds: readonly string[] }): Map<string, Array<{ asOf: number; followers: number }>> {
  const out = new Map<string, Array<{ asOf: number; followers: number }>>();
  const query = openDomainDb().query<{ as_of: number; follower_count: number }, [string]>(
    "SELECT as_of, follower_count FROM trend_creator_snapshots WHERE creator_id = ? AND follower_count IS NOT NULL ORDER BY as_of",
  );
  for (const creatorId of input.creatorIds) out.set(creatorId, query.all(creatorId).map((row) => ({ asOf: row.as_of, followers: row.follower_count })));
  return out;
}

/** Cohort medians (log projected value) from the recomputable cache, keyed `cohortKey#metric`. */
export function cohortMedians(input: { workspaceId: string }): Map<string, { median: number; n: number }> {
  return new Map(
    openDomainDb()
      .query<{ cohort_key: string; metric: string; median_log: number; n: number }, [string]>(
        "SELECT cohort_key, metric, median_log, n FROM trend_cohort_baselines WHERE workspace_id = ?",
      )
      .all(input.workspaceId)
      .map((row) => [`${row.cohort_key}#${row.metric}`, { median: row.median_log, n: row.n }]),
  );
}

// ─── Report document ────────────────────────────────────────────────────────

/** Save the niche report as a markdown research Document (append-only revisions). */
export function saveNicheReportDocument(input: { workspaceId: string; slug: string; title: string; markdown: string }): { documentId: string; revisionId: string } {
  const db = openDomainDb();
  const docSlug = `niche-report-${input.slug}`;
  const existing = db
    .query<{ id: string; current_revision_id: string | null }, [string, string]>(
      "SELECT id, current_revision_id FROM documents WHERE workspace_id = ? AND project_id IS NULL AND kind = 'research' AND slug = ?",
    )
    .get(input.workspaceId, docSlug);
  const documentId = existing?.id ?? createDocument({ workspaceId: input.workspaceId, kind: "research", slug: docSlug, title: input.title }).id;
  const revision = reviseDocument({ documentId, expectedHeadId: existing?.current_revision_id ?? null, format: "markdown", title: input.title, body: input.markdown });
  return { documentId, revisionId: revision.id };
}

/** Every `trends niche init` run of one niche, oldest first, with its summary response. */
export function nicheRuns(input: { workspaceId: string; slug: string }): Array<{ runId: string; createdAt: number; endedAt: number | null; state: string; response: Record<string, unknown> | null; request: Record<string, unknown> | null }> {
  return openDomainDb()
    .query<{ id: string; created_at: number; ended_at: number | null; state: string; metadata_json: string | null; response_json: string | null; request_json: string | null }, [string]>(
      `SELECT r.id, r.created_at, r.ended_at, r.state, r.metadata_json, a.response_json, a.request_json
       FROM runs r LEFT JOIN run_attempts a ON a.run_id = r.id
       WHERE r.workspace_id = ? AND r.kind = 'trend.niche' ORDER BY r.created_at`,
    )
    .all(input.workspaceId)
    .filter((row) => parseObject(row.metadata_json)?.niche === input.slug)
    .map((row) => ({ runId: row.id, createdAt: row.created_at, endedAt: row.ended_at, state: row.state, response: parseObject(row.response_json), request: parseObject(row.request_json) }));
}

/** Videos seen in each creator's own listing. */
export function listedVideoCounts(input: { creatorIds: readonly string[] }): Map<string, number> {
  const query = openDomainDb().query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM trend_videos WHERE creator_id = ? AND in_listing = 1");
  return new Map(input.creatorIds.map((id) => [id, query.get(id)?.n ?? 0]));
}
