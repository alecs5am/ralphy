import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { getObjectRow, resolveObjectPath } from "./internal-objects.js";

/**
 * Owned accounts and their upload queue (#600). An owned account is a
 * `social_accounts` row the owner signs into (connection `browser` or
 * `device`); its handle is the `external_id`. An upload is one video queued
 * for one account, approved by the owner, run by `ralphy upload run`, and
 * completed with the post URL. Metrics and follower counts are append-only
 * snapshots.
 */

export const OWNED_PLATFORMS = ["instagram", "tiktok", "youtube", "x"] as const;
export type OwnedPlatform = (typeof OWNED_PLATFORMS)[number];
export type AccountPurpose = "main" | "test";
export type AccountConnection = "postiz" | "browser" | "device" | "none";
export type SessionState = "unknown" | "ok" | "needs_login" | "checkpoint" | "restricted";
export type UploadState = "queued" | "uploading" | "unknown" | "needs_user" | "published" | "failed" | "cancelled";

export type OwnedAccountDto = {
  id: string;
  workspaceId: string;
  platform: string;
  handle: string;
  displayName: string | null;
  niche: string | null;
  purpose: AccountPurpose;
  connection: AccountConnection;
  sessionState: SessionState;
  sessionCheckedAt: number | null;
  paused: boolean;
  /** Platform user id the browser session was signed in as (Instagram `ds_user_id`). */
  platformUserId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type OwnedAccountSummaryDto = OwnedAccountDto & {
  uploads: number;
  published: number;
  pending: number;
  needsUser: number;
  lastPublishedAt: number | null;
  bestViews: number | null;
  medianViews: number | null;
  followers: number | null;
  followersAsOf: number | null;
};

export type UploadDto = {
  id: string;
  workspaceId: string;
  accountId: string;
  platform: string;
  handle: string;
  niche: string | null;
  mediaObjectId: string;
  coverObjectId: string | null;
  caption: string;
  options: Record<string, unknown>;
  unitRevisionId: string | null;
  artifactRevisionId: string | null;
  state: UploadState;
  approvedAt: number | null;
  notBefore: number | null;
  attempts: number;
  failureStage: string | null;
  error: string | null;
  postUrl: string | null;
  postExternalId: string | null;
  publishedAt: number | null;
  evidenceObjectId: string | null;
  createdAt: number;
  updatedAt: number;
  metrics: UploadMetricsDto | null;
};

export type UploadMetricsDto = {
  asOf: number;
  source: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

type AccountRow = {
  id: string;
  workspace_id: string;
  platform: string;
  external_id: string;
  display_name: string | null;
  niche: string | null;
  purpose: AccountPurpose;
  connection: AccountConnection;
  session_state: SessionState;
  session_checked_at: number | null;
  paused: number;
  platform_user_id: string | null;
  created_at: number;
  updated_at: number;
};

const ACCOUNT_COLUMNS = `a.id, a.workspace_id, a.platform, a.external_id, a.display_name, a.niche,
  a.purpose, a.connection, a.session_state, a.session_checked_at, a.paused, a.platform_user_id,
  a.created_at, a.updated_at`;

const toAccount = (row: AccountRow): OwnedAccountDto => ({
  id: row.id,
  workspaceId: row.workspace_id,
  platform: row.platform,
  handle: row.external_id,
  displayName: row.display_name,
  niche: row.niche,
  purpose: row.purpose,
  connection: row.connection,
  sessionState: row.session_state,
  sessionCheckedAt: row.session_checked_at,
  paused: row.paused === 1,
  platformUserId: row.platform_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** `@Psy.Daily` → `psy.daily`. Handles are case-insensitive on every supported platform. */
export function normalizeHandle(handle: string): string {
  const value = handle.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._-]{1,64}$/.test(value)) throw new Error(`Invalid account handle: ${handle}`);
  return value;
}

export function isOwnedPlatform(value: string): value is OwnedPlatform {
  return (OWNED_PLATFORMS as readonly string[]).includes(value);
}

export function addOwnedAccount(input: {
  workspaceId: string;
  platform: OwnedPlatform;
  handle: string;
  displayName?: string | null;
  niche?: string | null;
  purpose?: AccountPurpose;
  connection?: AccountConnection;
}): { account: OwnedAccountDto; created: boolean } {
  const handle = normalizeHandle(input.handle);
  return withImmediateTransaction((db) => {
    const now = Date.now();
    const existing = db
      .query<{ id: string }, [string, string, string]>(
        "SELECT id FROM social_accounts WHERE workspace_id = ? AND platform = ? AND external_id = ?",
      )
      .get(input.workspaceId, input.platform, handle);
    if (existing) {
      db.prepare(
        `UPDATE social_accounts
         SET display_name = COALESCE(?, display_name), username = ?, niche = COALESCE(?, niche),
             purpose = COALESCE(?, purpose), connection = COALESCE(?, connection),
             row_version = row_version + 1, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.displayName ?? null, handle, input.niche ?? null, input.purpose ?? null,
        input.connection ?? null, now, existing.id,
      );
      return { account: getAccountById(db, existing.id), created: false };
    }
    const id = newDomainId("acct");
    db.prepare(
      `INSERT INTO social_accounts
       (id, workspace_id, platform, external_id, display_name, username, niche, purpose,
        connection, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, input.workspaceId, input.platform, handle, input.displayName ?? null, handle,
      input.niche ?? null, input.purpose ?? "main", input.connection ?? "browser", now, now,
    );
    return { account: getAccountById(db, id), created: true };
  });
}

function getAccountById(db: Database, id: string): OwnedAccountDto {
  const row = db
    .query<AccountRow, [string]>(`SELECT ${ACCOUNT_COLUMNS} FROM social_accounts a WHERE a.id = ?`)
    .get(id);
  if (!row) throw new Error(`Account not found: ${id}`);
  return toAccount(row);
}

/**
 * Resolve an account reference: an `acct_…` id, or a handle (`@psy.daily` /
 * `psy.daily`) within the Workspace. A handle on several platforms needs
 * `platform`.
 */
export function resolveOwnedAccount(input: { workspaceId?: string; ref: string; platform?: string }): OwnedAccountDto {
  const db = openDomainDb();
  if (input.ref.startsWith("acct_")) {
    const account = getAccountById(db, input.ref);
    if (input.workspaceId && account.workspaceId !== input.workspaceId) throw new Error(`Account not found: ${input.ref}`);
    return account;
  }
  const handle = normalizeHandle(input.ref);
  const where = ["a.external_id = ?"];
  const values: string[] = [handle];
  if (input.workspaceId) { where.push("a.workspace_id = ?"); values.push(input.workspaceId); }
  if (input.platform) { where.push("a.platform = ?"); values.push(input.platform); }
  const rows = db
    .query<AccountRow, string[]>(`SELECT ${ACCOUNT_COLUMNS} FROM social_accounts a WHERE ${where.join(" AND ")}`)
    .all(...values);
  if (rows.length === 0) throw new Error(`Account not found: @${handle}`);
  if (rows.length > 1) {
    throw new Error(`@${handle} exists on ${rows.map((row) => row.platform).join(", ")}; pass --platform`);
  }
  return toAccount(rows[0]!);
}

/** Accounts with upload and audience aggregates. `workspaceId` omitted = the whole data root (the panel). */
export function listOwnedAccounts(input: {
  workspaceId?: string;
  platform?: string;
  niche?: string;
  sessionState?: SessionState;
  purpose?: AccountPurpose;
  includePostiz?: boolean;
} = {}): OwnedAccountSummaryDto[] {
  const db = openDomainDb();
  const where: string[] = [];
  const values: string[] = [];
  if (!input.includePostiz) where.push("a.connection <> 'postiz'");
  if (input.workspaceId) { where.push("a.workspace_id = ?"); values.push(input.workspaceId); }
  if (input.platform) { where.push("a.platform = ?"); values.push(input.platform); }
  if (input.niche) { where.push("a.niche = ?"); values.push(input.niche); }
  if (input.sessionState) { where.push("a.session_state = ?"); values.push(input.sessionState); }
  if (input.purpose) { where.push("a.purpose = ?"); values.push(input.purpose); }
  const rows = db
    .query<AccountRow & {
      uploads: number; published: number; pending: number; needs_user: number;
      last_published_at: number | null; followers: number | null; followers_as_of: number | null;
    }, string[]>(
      `SELECT ${ACCOUNT_COLUMNS},
         COUNT(u.id) AS uploads,
         COALESCE(SUM(u.state = 'published'), 0) AS published,
         COALESCE(SUM(u.state IN ('queued', 'uploading')), 0) AS pending,
         COALESCE(SUM(u.state IN ('needs_user', 'unknown')), 0) AS needs_user,
         MAX(u.published_at) AS last_published_at,
         (SELECT s.followers FROM account_snapshots s WHERE s.social_account_id = a.id ORDER BY s.as_of DESC LIMIT 1) AS followers,
         (SELECT s.as_of FROM account_snapshots s WHERE s.social_account_id = a.id ORDER BY s.as_of DESC LIMIT 1) AS followers_as_of
       FROM social_accounts a
       LEFT JOIN uploads u ON u.social_account_id = a.id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       GROUP BY a.id
       ORDER BY a.niche IS NULL, a.niche, a.platform, a.external_id`,
    )
    .all(...values);
  const views = latestViewsByAccount(db, rows.map((row) => row.id));
  return rows.map((row) => {
    const list = views.get(row.id) ?? [];
    return {
      ...toAccount(row),
      uploads: row.uploads,
      published: row.published,
      pending: row.pending,
      needsUser: row.needs_user,
      lastPublishedAt: row.last_published_at,
      bestViews: list.length ? Math.max(...list) : null,
      medianViews: median(list),
      followers: row.followers,
      followersAsOf: row.followers_as_of,
    };
  });
}

function latestViewsByAccount(db: Database, accountIds: string[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (accountIds.length === 0) return out;
  for (let i = 0; i < accountIds.length; i += 400) {
    const chunk = accountIds.slice(i, i + 400);
    const rows = db
      .query<{ account_id: string; views: number }, string[]>(
        `SELECT u.social_account_id AS account_id, m.views
         FROM uploads u
         JOIN upload_metric_snapshots m ON m.upload_id = u.id
         WHERE u.social_account_id IN (${chunk.map(() => "?").join(",")})
           AND m.views IS NOT NULL
           AND m.as_of = (SELECT MAX(x.as_of) FROM upload_metric_snapshots x WHERE x.upload_id = u.id)`,
      )
      .all(...chunk);
    for (const row of rows) {
      const list = out.get(row.account_id) ?? [];
      list.push(row.views);
      out.set(row.account_id, list);
    }
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Fail closed on permission errors or PID reuse; only a proven dead owner is reclaimed. */
function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

function assertProfileIdle(db: Database, accountId: string): void {
  const lease = db.query<{ owner_pid: number }, [string]>("SELECT owner_pid FROM account_browser_leases WHERE social_account_id = ?").get(accountId);
  if (lease && processAlive(lease.owner_pid)) throw new Error(`The browser profile for ${accountId} is already open; close that window first`);
}

/** Serializes login, check, open, sync and upload across processes for one profile. */
export function acquireAccountBrowserLease(accountId: string): () => void {
  const token = randomUUID();
  const db = openDomainDb();
  withImmediateTransaction((db) => {
    assertProfileIdle(db, accountId);
    db.prepare("DELETE FROM account_browser_leases WHERE social_account_id = ?").run(accountId);
    db.prepare("INSERT INTO account_browser_leases VALUES (?, ?, ?)").run(accountId, process.pid, token);
  });
  return () => { db.prepare("DELETE FROM account_browser_leases WHERE social_account_id = ? AND token = ?").run(accountId, token); };
}

function assertWorkerStopped(db: Database, id: string): void {
  const row = db.query<{ claim_owner_pid: number | null; social_account_id: string }, [string]>("SELECT claim_owner_pid, social_account_id FROM uploads WHERE id = ?").get(id)!;
  assertProfileIdle(db, row.social_account_id);
  if (row.claim_owner_pid && processAlive(row.claim_owner_pid)) throw new Error(`Upload ${id} still has an active worker; stop it before reconciliation`);
}

/**
 * Record an observed session state. `platformUserId` binds the account to the
 * platform user it was signed in as; once bound, a different user id is
 * refused, so a profile signed into the wrong account never posts.
 */
export function setAccountSession(
  accountId: string,
  state: SessionState,
  options: { platformUserId?: string | null; at?: number } = {},
): OwnedAccountDto {
  return withImmediateTransaction((db) => {
    const at = options.at ?? Date.now();
    const current = getAccountById(db, accountId);
    const userId = options.platformUserId ?? null;
    if (userId && current.platformUserId && current.platformUserId !== userId) {
      throw new Error(
        `@${current.handle} is bound to platform user ${current.platformUserId}, but the profile is signed in as ${userId}`,
      );
    }
    db.prepare(
      `UPDATE social_accounts SET session_state = ?, session_checked_at = ?,
         platform_user_id = COALESCE(platform_user_id, ?),
         row_version = row_version + 1, updated_at = ? WHERE id = ?`,
    ).run(state, at, userId, at, accountId);
    return getAccountById(db, accountId);
  });
}

export function setAccountPaused(accountId: string, paused: boolean): OwnedAccountDto {
  return withImmediateTransaction((db) => {
    db.prepare(
      "UPDATE social_accounts SET paused = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?",
    ).run(paused ? 1 : 0, Date.now(), accountId);
    return getAccountById(db, accountId);
  });
}

export function appendAccountSnapshot(input: {
  accountId: string;
  source: string;
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  raw?: unknown;
  asOf?: number;
}): void {
  const now = Date.now();
  openDomainDb()
    .prepare(
      `INSERT OR IGNORE INTO account_snapshots
       (social_account_id, as_of, source, followers, following, posts, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.accountId, input.asOf ?? now, input.source, input.followers ?? null,
      input.following ?? null, input.posts ?? null,
      input.raw === undefined ? null : JSON.stringify(input.raw), now,
    );
}

// ─── uploads ────────────────────────────────────────────────────────────────

type UploadRow = {
  id: string;
  workspace_id: string;
  social_account_id: string;
  platform: string;
  external_id: string;
  niche: string | null;
  media_object_id: string;
  cover_object_id: string | null;
  caption: string;
  options_json: string;
  unit_revision_id: string | null;
  artifact_revision_id: string | null;
  state: UploadState;
  approved_at: number | null;
  not_before: number | null;
  attempts: number;
  failure_stage: string | null;
  error: string | null;
  post_url: string | null;
  post_external_id: string | null;
  published_at: number | null;
  evidence_object_id: string | null;
  created_at: number;
  updated_at: number;
  m_as_of: number | null;
  m_source: string | null;
  m_views: number | null;
  m_likes: number | null;
  m_comments: number | null;
  m_shares: number | null;
  m_saves: number | null;
};

const UPLOAD_SELECT = `SELECT u.id, u.workspace_id, u.social_account_id, a.platform, a.external_id, a.niche,
    u.media_object_id, u.cover_object_id, u.caption, u.options_json, u.unit_revision_id,
    u.artifact_revision_id, u.state, u.approved_at, u.not_before, u.attempts, u.failure_stage,
    u.error, u.post_url, u.post_external_id, u.published_at, u.evidence_object_id,
    u.created_at, u.updated_at,
    m.as_of AS m_as_of, m.source AS m_source, m.views AS m_views, m.likes AS m_likes,
    m.comments AS m_comments, m.shares AS m_shares, m.saves AS m_saves
  FROM uploads u
  JOIN social_accounts a ON a.id = u.social_account_id
  LEFT JOIN upload_metric_snapshots m ON m.upload_id = u.id
    AND m.as_of = (SELECT MAX(x.as_of) FROM upload_metric_snapshots x WHERE x.upload_id = u.id)`;

const toUpload = (row: UploadRow): UploadDto => ({
  id: row.id,
  workspaceId: row.workspace_id,
  accountId: row.social_account_id,
  platform: row.platform,
  handle: row.external_id,
  niche: row.niche,
  mediaObjectId: row.media_object_id,
  coverObjectId: row.cover_object_id,
  caption: row.caption,
  options: JSON.parse(row.options_json) as Record<string, unknown>,
  unitRevisionId: row.unit_revision_id,
  artifactRevisionId: row.artifact_revision_id,
  state: row.state,
  approvedAt: row.approved_at,
  notBefore: row.not_before,
  attempts: row.attempts,
  failureStage: row.failure_stage,
  error: row.error,
  postUrl: row.post_url,
  postExternalId: row.post_external_id,
  publishedAt: row.published_at,
  evidenceObjectId: row.evidence_object_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  metrics: row.m_as_of == null ? null : {
    asOf: row.m_as_of,
    source: row.m_source!,
    views: row.m_views,
    likes: row.m_likes,
    comments: row.m_comments,
    shares: row.m_shares,
    saves: row.m_saves,
  },
});

function getUploadIn(db: Database, id: string): UploadDto {
  const row = db.query<UploadRow, [string]>(`${UPLOAD_SELECT} WHERE u.id = ?`).get(id);
  if (!row) throw new Error(`Upload not found: ${id}`);
  return toUpload(row);
}

export function getUpload(id: string, workspaceId?: string): UploadDto {
  const upload = getUploadIn(openDomainDb(), id);
  if (workspaceId && upload.workspaceId !== workspaceId) throw new Error(`Upload not found: ${id}`);
  return upload;
}

export function enqueueUpload(input: {
  workspaceId: string;
  accountId: string;
  mediaObjectId: string;
  caption?: string;
  options?: Record<string, unknown>;
  unitRevisionId?: string | null;
  artifactRevisionId?: string | null;
  approve?: boolean;
  notBefore?: number | null;
}): UploadDto {
  return withImmediateTransaction((db) => {
    const now = Date.now();
    const id = newDomainId("upl");
    db.prepare(
      `INSERT INTO uploads
       (id, workspace_id, social_account_id, media_object_id, caption, options_json,
        unit_revision_id, artifact_revision_id, state, approved_at, not_before, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
    ).run(
      id, input.workspaceId, input.accountId, input.mediaObjectId, input.caption ?? "",
      JSON.stringify(input.options ?? {}), input.unitRevisionId ?? null,
      input.artifactRevisionId ?? null, input.approve ? now : null, input.notBefore ?? null, now, now,
    );
    return getUploadIn(db, id);
  });
}

export function listUploads(input: {
  workspaceId?: string;
  accountId?: string;
  states?: UploadState[];
  niche?: string;
  limit?: number | null;
} = {}): UploadDto[] {
  const where: string[] = [];
  const values: (string | number)[] = [];
  if (input.workspaceId) { where.push("u.workspace_id = ?"); values.push(input.workspaceId); }
  if (input.accountId) { where.push("u.social_account_id = ?"); values.push(input.accountId); }
  if (input.niche) { where.push("a.niche = ?"); values.push(input.niche); }
  if (input.states?.length) {
    where.push(`u.state IN (${input.states.map(() => "?").join(",")})`);
    values.push(...input.states);
  }
  values.push(input.limit === null ? -1 : Math.max(1, Math.min(input.limit ?? 200, 1000)));
  return openDomainDb()
    .query<UploadRow, (string | number)[]>(
      `${UPLOAD_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY COALESCE(u.published_at, u.updated_at) DESC LIMIT ?`,
    )
    .all(...values)
    .map(toUpload);
}

function transition(
  id: string,
  from: UploadState[],
  apply: (db: Database, now: number) => void,
): UploadDto {
  return withImmediateTransaction((db) => {
    const current = getUploadIn(db, id);
    if (!from.includes(current.state)) {
      throw new Error(`Upload ${id} is ${current.state}; expected ${from.join(" or ")}`);
    }
    apply(db, Date.now());
    return getUploadIn(db, id);
  });
}

/** Record the owner's go for queued uploads. Returns the uploads that were approved. */
export function approveUploads(ids: string[]): UploadDto[] {
  return ids.map((id) =>
    transition(id, ["queued", "needs_user", "failed"], (db, now) => {
      db.prepare(
        `UPDATE uploads SET approved_at = COALESCE(approved_at, ?),
           row_version = row_version + 1, updated_at = ? WHERE id = ?`,
      ).run(now, now, id);
    }),
  );
}

export function cancelUpload(id: string): UploadDto {
  return transition(id, ["queued", "needs_user", "failed", "unknown"], (db, now) => {
    assertWorkerStopped(db, id);
    db.prepare(
      "UPDATE uploads SET state = 'cancelled', row_version = row_version + 1, updated_at = ? WHERE id = ?",
    ).run(now, id);
  });
}

/**
 * Put a failed or handed-off upload back in the queue, keeping its approval.
 * An `unknown` upload may already be live; it is requeued only with `force`,
 * after the account's profile was checked for the post.
 */
export function retryUpload(id: string, options: { force?: boolean } = {}): UploadDto {
  const from: UploadState[] = options.force ? ["needs_user", "failed", "uploading", "unknown"] : ["needs_user", "failed"];
  return transition(id, from, (db, now) => {
    assertWorkerStopped(db, id);
    db.prepare(
      `UPDATE uploads SET state = 'queued', failure_stage = NULL, error = NULL,
         row_version = row_version + 1, updated_at = ? WHERE id = ?`,
    ).run(now, id);
  });
}

/**
 * Claim the next runnable upload: approved, due, queued, on an unpaused
 * account whose session is not known to be signed out. Oldest first.
 */
export function claimNextUpload(input: { workspaceId?: string; id?: string; now?: number } = {}): UploadDto | null {
  return withImmediateTransaction((db) => {
    const now = input.now ?? Date.now();
    const where = [
      "u.state = 'queued'",
      "u.approved_at IS NOT NULL",
      "NOT EXISTS (SELECT 1 FROM uploads busy WHERE busy.social_account_id = u.social_account_id AND busy.state IN ('uploading', 'unknown'))",
      "(u.not_before IS NULL OR u.not_before <= ?)",
      "a.paused = 0",
      "a.session_state NOT IN ('needs_login', 'checkpoint', 'restricted')",
    ];
    const values: (string | number)[] = [now];
    if (input.workspaceId) { where.push("u.workspace_id = ?"); values.push(input.workspaceId); }
    if (input.id) { where.push("u.id = ?"); values.push(input.id); }
    const row = db
      .query<{ id: string }, (string | number)[]>(
        `SELECT u.id FROM uploads u JOIN social_accounts a ON a.id = u.social_account_id
         WHERE ${where.join(" AND ")} ORDER BY u.created_at LIMIT 1`,
      )
      .get(...values);
    if (!row) return null;
    db.prepare(
      `UPDATE uploads SET state = 'uploading', attempts = attempts + 1, claim_owner_pid = ?,
         row_version = row_version + 1, updated_at = ? WHERE id = ?`,
    ).run(process.pid, now, row.id);
    return getUploadIn(db, row.id);
  });
}

export type UploadOutcome =
  | { state: "published"; postUrl: string; postExternalId?: string | null; evidenceObjectId?: string | null }
  | { state: "needs_user" | "failed" | "unknown"; stage: string; error: string; evidenceObjectId?: string | null };

/**
 * Mark the irreversible step: called right before the final publish click.
 * From here a crash or timeout leaves the upload `unknown`, never `queued`.
 */
export function markUploadSubmitted(id: string): UploadDto {
  return transition(id, ["uploading"], (db, now) => {
    db.prepare(
      "UPDATE uploads SET state = 'unknown', row_version = row_version + 1, updated_at = ? WHERE id = ?",
    ).run(now, id);
  });
}

export function finishUpload(id: string, outcome: UploadOutcome): UploadDto {
  return transition(id, ["uploading", "unknown"], (db, now) => {
    if (getUploadIn(db, id).state === "unknown" && outcome.state !== "unknown" && outcome.state !== "published") {
      throw new Error("A submitted upload must remain unknown until reconciled");
    }
    writeOutcome(db, id, outcome, now);
  });
}

/** The owner or an agent finished the post by hand in the account's browser. */
export function completeUploadManually(id: string, postUrl: string): UploadDto {
  return transition(id, ["queued", "uploading", "unknown", "needs_user", "failed"], (db, now) => {
    assertWorkerStopped(db, id);
    const account = getAccountById(db, getUploadIn(db, id).accountId);
    const url = new URL(postUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Post URL must be https without credentials");
    const host = url.hostname.replace(/^www\./, "");
    let postExternalId: string | undefined;
    if (account.platform === "instagram" && host === "instagram.com") postExternalId = url.pathname.match(/^\/(?:reel|p)\/([A-Za-z0-9_-]+)\/?$/)?.[1];
    if (account.platform === "tiktok" && host === "tiktok.com") {
      const match = url.pathname.match(/^\/@([^/]+)\/video\/(\d+)\/?$/);
      if (match?.[1]?.toLowerCase() === account.handle.toLowerCase()) postExternalId = match[2];
    }
    if (account.platform === "youtube") {
      if (host === "youtu.be") postExternalId = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1];
      if (host === "youtube.com") postExternalId = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)\/?$/)?.[1] || (url.pathname === "/watch" ? url.searchParams.get("v") || undefined : undefined);
    }
    if (account.platform === "x" && ["x.com", "twitter.com"].includes(host)) {
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
      if (match?.[1]?.toLowerCase() === account.handle.toLowerCase()) postExternalId = match[2];
    }
    if (!postExternalId) throw new Error(`URL does not identify a post for this ${account.platform} account`);
    writeOutcome(db, id, { state: "published", postUrl, postExternalId }, now);
  });
}

function writeOutcome(db: Database, id: string, outcome: UploadOutcome, now: number): void {
  db.prepare("UPDATE uploads SET claim_owner_pid = NULL WHERE id = ?").run(id);
  if (outcome.state === "published") {
    if (!/^https:\/\/\S+$/.test(outcome.postUrl)) throw new Error(`Post URL must be https: ${outcome.postUrl}`);
    db.prepare(
      `UPDATE uploads SET state = 'published', post_url = ?, post_external_id = ?, published_at = ?,
         evidence_object_id = COALESCE(?, evidence_object_id), failure_stage = NULL, error = NULL,
         row_version = row_version + 1, updated_at = ? WHERE id = ?`,
    ).run(outcome.postUrl, outcome.postExternalId ?? null, now, outcome.evidenceObjectId ?? null, now, id);
    return;
  }
  db.prepare(
    `UPDATE uploads SET state = ?, failure_stage = ?, error = ?,
       evidence_object_id = COALESCE(?, evidence_object_id),
       row_version = row_version + 1, updated_at = ? WHERE id = ?`,
  ).run(outcome.state, outcome.stage, outcome.error.slice(0, 2000), outcome.evidenceObjectId ?? null, now, id);
}

/** Retain every attempt's diagnostics, including HTML when a screenshot fails. */
export function recordUploadEvidence(uploadId: string, objectId: string, kind: "html" | "screenshot"): void {
  withImmediateTransaction((db) => {
    const upload = getUploadIn(db, uploadId);
    const object = getObjectRow(db, objectId);
    if (!object || object.workspaceId !== upload.workspaceId) throw new Error("Evidence must belong to the upload Workspace");
    db.prepare("INSERT OR IGNORE INTO upload_evidence VALUES (?, ?, ?, ?)").run(uploadId, objectId, kind, Date.now());
  });
}

export function appendUploadMetrics(input: {
  uploadId: string;
  source: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  raw?: unknown;
  asOf?: number;
}): void {
  const now = Date.now();
  openDomainDb()
    .prepare(
      `INSERT OR IGNORE INTO upload_metric_snapshots
       (upload_id, as_of, source, views, likes, comments, shares, saves, raw_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.uploadId, input.asOf ?? now, input.source, input.views ?? null, input.likes ?? null,
      input.comments ?? null, input.shares ?? null, input.saves ?? null,
      input.raw === undefined ? null : JSON.stringify(input.raw), now,
    );
}

/** Local path of an object an upload references (its video, cover or evidence). */
export function uploadObjectPath(objectId: string): string {
  const row = getObjectRow(openDomainDb(), objectId);
  if (!row) throw new Error(`Object not found: ${objectId}`);
  return resolveObjectPath(row);
}
