// SQLite-backed jobs API, used by the ralphy daemon + queue commands.
//
// Concurrency model:
// - Single writer (the daemon) + many readers (queue commands) is safe with
//   SQLite WAL mode, which we enable on open.
// - A job is "claimed" via UPDATE…WHERE status='pending' AND id=? — this is
//   atomic and lets multiple worker slots inside one daemon race-pick safely.
//
// We avoid an ORM. The schema is tiny and the queries are obvious.

import path from "node:path";
import fs from "node:fs";
import { Database } from "bun:sqlite";
import { ralphDir } from "../paths.js";
import { appendActivity } from "../store/activity.js";
import {
  closeDomainDb,
  domainDbPath,
  openDomainDb,
  withImmediateTransaction,
} from "../store/db.js";
import type {
  JobRow,
  JobLogRow,
  JobArtifactRow,
  JobInsertInput,
  JobStatus,
  JobKind,
} from "./types.js";

export function dbPath(): string {
  return domainDbPath();
}

export function jobLogsDir(): string {
  return path.join(ralphDir(), "job-logs");
}

/**
 * Close the cached connection (if any). Used by tests to reset state
 * between cases when the workspace root is rebound. No-op in production.
 */
export function closeDb(): void {
  closeDomainDb();
}

export function openDb(): Database {
  fs.mkdirSync(jobLogsDir(), { recursive: true });
  return openDomainDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// Inserts / queries
// ─────────────────────────────────────────────────────────────────────────────

export function insertJob(input: JobInsertInput): number {
  const db = openDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO jobs (run_id, kind, status, command, depends_on, priority, created_at, tag, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    input.run_id ?? null,
    input.kind,
    "pending",
    JSON.stringify(input.command),
    JSON.stringify(input.depends_on ?? []),
    input.priority ?? 0,
    now,
    input.tag ?? null,
    input.project_id ?? null,
  );
  return Number(result.lastInsertRowid);
}

export function insertJobsAtomic(inputs: JobInsertInput[]): number[] {
  const db = openDb();
  const ids: number[] = [];
  const stmt = db.prepare(`
    INSERT INTO jobs (run_id, kind, status, command, depends_on, priority, created_at, tag, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  const txn = db.transaction((items: JobInsertInput[]) => {
    for (const i of items) {
      const r = stmt.run(
        i.run_id ?? null,
        i.kind,
        "pending",
        JSON.stringify(i.command),
        JSON.stringify(i.depends_on ?? []),
        i.priority ?? 0,
        now,
        i.tag ?? null,
        i.project_id ?? null,
      );
      ids.push(Number(r.lastInsertRowid));
    }
  });
  txn(inputs);
  return ids;
}

function rowToJob(r: any): JobRow {
  return {
    id: r.id,
    run_id: r.run_id ?? null,
    kind: r.kind,
    status: r.status,
    command: JSON.parse(r.command),
    depends_on: JSON.parse(r.depends_on ?? "[]"),
    priority: r.priority,
    created_at: r.created_at,
    started_at: r.started_at,
    ended_at: r.ended_at,
    exit_code: r.exit_code,
    error_message: r.error_message,
    retry_count: r.retry_count,
    log_path: r.log_path,
    tag: r.tag,
    project_id: r.project_id,
  };
}

export function getJob(id: number): JobRow | null {
  const db = openDb();
  const r = db.query("SELECT * FROM jobs WHERE id = ?").get(id) as any;
  return r ? rowToJob(r) : null;
}

export function listJobs(filter: {
  status?: JobStatus | JobStatus[];
  tag?: string;
  projectId?: string;
  limit?: number;
} = {}): JobRow[] {
  const db = openDb();
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) {
    const arr = Array.isArray(filter.status) ? filter.status : [filter.status];
    where.push(`status IN (${arr.map(() => "?").join(",")})`);
    params.push(...arr);
  }
  if (filter.tag) {
    where.push("tag = ?");
    params.push(filter.tag);
  }
  if (filter.projectId) {
    where.push("project_id = ?");
    params.push(filter.projectId);
  }
  const sql =
    `SELECT * FROM jobs ${where.length ? "WHERE " + where.join(" AND ") : ""} ` +
    `ORDER BY priority DESC, id ASC ${filter.limit ? `LIMIT ${filter.limit}` : ""}`;
  const rows = db.query(sql).all(...params) as any[];
  return rows.map(rowToJob);
}

/**
 * Atomic claim: mark a single pending job as running and return its row.
 * Returns null if no eligible job is available. Eligibility:
 * - status = 'pending'
 * - all jobs in depends_on have status = 'completed'
 * - no dep is failed/cancelled (those would mark this job 'blocked' first)
 */
export function claimNextPending(kinds?: JobKind[]): JobRow | null {
  const db = openDb();
  // Materialize candidates first, then check deps in JS (cheaper than recursive
  // SQL for our tiny scale). When `kinds` is given (#428 endpoint-aware
  // scheduling), the claim is restricted to those kinds — the per-kind atomic
  // UPDATE…WHERE status='pending' is unchanged, so the claim stays race-safe.
  const kindFilter =
    kinds && kinds.length > 0 ? ` AND kind IN (${kinds.map(() => "?").join(",")})` : "";
  const candidates = db
    .query(
      `SELECT * FROM jobs WHERE status = 'pending'${kindFilter} ORDER BY priority DESC, id ASC`,
    )
    .all(...(kinds && kinds.length > 0 ? kinds : [])) as any[];
  for (const r of candidates) {
    const deps: number[] = JSON.parse(r.depends_on ?? "[]");
    if (deps.length === 0) {
      if (markRunning(r.id)) return rowToJob({ ...r, status: "running", started_at: Date.now() });
      continue;
    }
    const depRows = db
      .query(
        `SELECT id, status FROM jobs WHERE id IN (${deps.map(() => "?").join(",")})`
      )
      .all(...deps) as Array<{ id: number; status: JobStatus }>;
    const failed = depRows.find((d) => d.status === "failed" || d.status === "cancelled");
    if (failed) {
      // Cascade-block.
      db.prepare("UPDATE jobs SET status = 'blocked', error_message = ? WHERE id = ?")
        .run(`Dependency ${failed.id} ${failed.status}`, r.id);
      continue;
    }
    const allDone =
      depRows.length === deps.length &&
      depRows.every((d) => d.status === "completed");
    if (!allDone) continue;
    if (markRunning(r.id)) return rowToJob({ ...r, status: "running", started_at: Date.now() });
  }
  return null;
}

function markRunning(id: number): boolean {
  const db = openDb();
  const now = Date.now();
  const logPath = path.join(jobLogsDir(), `${id}.log`);
  // Race-safe claim: only flip if still pending.
  const r = db
    .prepare(
      "UPDATE jobs SET status='running', started_at=?, log_path=? WHERE id=? AND status='pending'"
    )
    .run(now, logPath, id);
  return (r.changes ?? 0) > 0;
}

export function finalizeJob(
  id: number,
  status: "completed" | "failed" | "cancelled" | "blocked",
  opts: { exitCode?: number | null; errorMessage?: string | null } = {},
): void {
  openDb();
  withImmediateTransaction((db) => {
    const job = db
      .query<{ status: JobStatus; runId: string | null }, [number]>(
        "SELECT status, run_id AS runId FROM jobs WHERE id = ?",
      )
      .get(id);
    if (!job) return;
    const endedAt = Date.now();
    let effectiveStatus = status;
    if (job.status === "running") {
      const result = db
        .prepare(
          "UPDATE jobs SET status=?, ended_at=?, exit_code=?, error_message=? WHERE id=? AND status='running'",
        )
        .run(
          status,
          endedAt,
          opts.exitCode ?? null,
          opts.errorMessage ?? null,
          id,
        );
      if (!result.changes) return;
    } else if (job.status === "cancelled" && job.runId) {
      effectiveStatus = "cancelled";
      const active = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM run_attempts WHERE run_id = ? AND state = 'running' LIMIT 1",
        )
        .get(job.runId);
      if (!active) return;
      db.prepare(
        `UPDATE jobs SET exit_code = COALESCE(exit_code, ?),
         error_message = COALESCE(error_message, ?) WHERE id = ? AND status = 'cancelled'`,
      ).run(opts.exitCode ?? null, opts.errorMessage ?? null, id);
    } else {
      return;
    }
    if (job.runId) {
      finishLinkedExecution(
        db,
        job.runId,
        effectiveStatus,
        opts.errorMessage ?? null,
        endedAt,
      );
    }
  });
}

export function cancelJob(id: number): boolean {
  openDb();
  return withImmediateTransaction((db) => {
    const before = db
      .query<{ status: JobStatus; runId: string | null }, [number]>(
        "SELECT status, run_id AS runId FROM jobs WHERE id = ?",
      )
      .get(id);
    const endedAt = Date.now();
    const result = db
      .prepare(
        "UPDATE jobs SET status='cancelled', ended_at=? WHERE id=? AND status IN ('pending','running','blocked')",
      )
      .run(endedAt, id);
    if (!result.changes) return false;
    if (
      before?.runId &&
      (before.status === "pending" || before.status === "blocked")
    ) {
      cancelUnstartedRun(db, before.runId, endedAt);
    }
    return true;
  });
}

export function retryJob(id: number): boolean {
  const db = openDb();
  const r = db
    .prepare(
      "UPDATE jobs SET status='pending', started_at=NULL, ended_at=NULL, exit_code=NULL, error_message=NULL, retry_count=retry_count+1 WHERE id=? AND status IN ('failed','cancelled','blocked')",
    )
    .run(id);
  return (r.changes ?? 0) > 0;
}

/**
 * Bulk cancel jobs matched by tag and/or state. At least one of `tag` /
 * `state` must be set — we refuse to mass-cancel without a filter to make
 * accidental "cancel everything" wipes harder.
 *
 * Append-only invariant: this flips status to 'cancelled' on rows whose
 * status is currently in {pending, running, blocked}. Rows are NOT deleted.
 * Terminal rows (completed / failed / already cancelled) are skipped — pass
 * them explicitly via --state if you want to no-op-match them.
 *
 * Returns the list of affected job ids (in id order) plus the count of
 * matched-but-not-eligible rows so callers can report "matched N, cancelled M".
 */
export function cancelJobsByFilter(filter: {
  tag?: string;
  state?: JobStatus | JobStatus[];
}): { cancelled: number[]; matchedButTerminal: number } {
  if (!filter.tag && !filter.state) {
    throw new Error(
      "cancelJobsByFilter requires at least one of `tag` or `state` — refusing to mass-cancel without a filter",
    );
  }
  const db = openDb();
  const where: string[] = [];
  const params: any[] = [];
  if (filter.tag) {
    where.push("tag = ?");
    params.push(filter.tag);
  }
  if (filter.state) {
    const arr = Array.isArray(filter.state) ? filter.state : [filter.state];
    where.push(`status IN (${arr.map(() => "?").join(",")})`);
    params.push(...arr);
  }
  const matches = db
    .query(`SELECT id, status, run_id FROM jobs WHERE ${where.join(" AND ")} ORDER BY id ASC`)
    .all(...params) as Array<{ id: number; status: JobStatus; run_id: string | null }>;
  const CANCELLABLE = new Set<JobStatus>(["pending", "running", "blocked"]);
  const cancelled: number[] = [];
  let matchedButTerminal = 0;
  const stmt = db.prepare(
    "UPDATE jobs SET status='cancelled', ended_at=? WHERE id=? AND status IN ('pending','running','blocked')",
  );
  const txn = db.transaction(() => {
    for (const m of matches) {
      if (!CANCELLABLE.has(m.status)) {
        matchedButTerminal++;
        continue;
      }
      const endedAt = Date.now();
      const r = stmt.run(endedAt, m.id);
      if ((r.changes ?? 0) > 0) {
        cancelled.push(m.id);
        if (
          m.run_id &&
          (m.status === "pending" || m.status === "blocked")
        ) {
          cancelUnstartedRun(db, m.run_id, endedAt);
        }
      }
    }
  });
  txn.immediate();
  return { cancelled, matchedButTerminal };
}

/**
 * Bulk retry jobs matched by tag and/or state. Same filter discipline as
 * cancelJobsByFilter — at least one filter required. Only rows in
 * {failed, cancelled, blocked} are retried; others are reported as
 * matchedButNotRetryable.
 *
 * Append-only: increments retry_count and resets started_at/ended_at/
 * exit_code/error_message back to null without touching the prior log
 * entries (those live in job_logs and stay forever).
 */
export function retryJobsByFilter(filter: {
  tag?: string;
  state?: JobStatus | JobStatus[];
}): { retried: number[]; matchedButNotRetryable: number } {
  if (!filter.tag && !filter.state) {
    throw new Error(
      "retryJobsByFilter requires at least one of `tag` or `state` — refusing to mass-retry without a filter",
    );
  }
  const db = openDb();
  const where: string[] = [];
  const params: any[] = [];
  if (filter.tag) {
    where.push("tag = ?");
    params.push(filter.tag);
  }
  if (filter.state) {
    const arr = Array.isArray(filter.state) ? filter.state : [filter.state];
    where.push(`status IN (${arr.map(() => "?").join(",")})`);
    params.push(...arr);
  }
  const matches = db
    .query(`SELECT id, status FROM jobs WHERE ${where.join(" AND ")} ORDER BY id ASC`)
    .all(...params) as Array<{ id: number; status: JobStatus }>;
  const RETRYABLE = new Set<JobStatus>(["failed", "cancelled", "blocked"]);
  const retried: number[] = [];
  let matchedButNotRetryable = 0;
  const stmt = db.prepare(
    "UPDATE jobs SET status='pending', started_at=NULL, ended_at=NULL, exit_code=NULL, error_message=NULL, retry_count=retry_count+1 WHERE id=? AND status IN ('failed','cancelled','blocked')",
  );
  const txn = db.transaction(() => {
    for (const m of matches) {
      if (!RETRYABLE.has(m.status)) {
        matchedButNotRetryable++;
        continue;
      }
      const r = stmt.run(m.id);
      if ((r.changes ?? 0) > 0) retried.push(m.id);
    }
  });
  txn();
  return { retried, matchedButNotRetryable };
}

export function appendLog(
  jobId: number,
  stream: "stdout" | "stderr" | "system",
  line: string,
): void {
  const db = openDb();
  db.prepare("INSERT INTO job_logs (job_id, ts, stream, line) VALUES (?, ?, ?, ?)").run(
    jobId,
    Date.now(),
    stream,
    line,
  );
}

export function tailLogs(
  jobId: number,
  sinceId: number = 0,
  limit: number = 1000,
): JobLogRow[] {
  const db = openDb();
  return db
    .query(
      "SELECT * FROM job_logs WHERE job_id = ? AND id > ? ORDER BY id ASC LIMIT ?",
    )
    .all(jobId, sinceId, limit) as JobLogRow[];
}

export function recordArtifact(
  jobId: number,
  kind: string,
  artifactPath: string,
  bytes: number | null = null,
  sha256: string | null = null,
): void {
  const db = openDb();
  db.prepare(
    "INSERT INTO job_artifacts (job_id, kind, path, bytes, sha256) VALUES (?, ?, ?, ?, ?)",
  ).run(jobId, kind, artifactPath, bytes, sha256);
}

export function listArtifacts(jobId: number): JobArtifactRow[] {
  const db = openDb();
  return db
    .query(
      "SELECT id, job_id, kind, path, bytes, sha256 FROM job_artifacts WHERE job_id = ? ORDER BY id ASC",
    )
    .all(jobId) as JobArtifactRow[];
}

export function countByStatus(): Record<JobStatus, number> {
  const db = openDb();
  const rows = db
    .query("SELECT status, COUNT(*) as n FROM jobs GROUP BY status")
    .all() as Array<{ status: JobStatus; n: number }>;
  const out: Record<JobStatus, number> = {
    pending: 0,
    blocked: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Distinct kinds among currently-pending jobs. Used by the worker (#428) to
 *  ask the scheduler only about kinds that have work waiting. */
export function pendingKinds(): JobKind[] {
  const db = openDb();
  const rows = db
    .query("SELECT DISTINCT kind FROM jobs WHERE status = 'pending'")
    .all() as Array<{ kind: JobKind }>;
  return rows.map((r) => r.kind);
}

/** Live count of running jobs grouped by kind. Behaviorally redundant with the
 *  worker's in-memory slots map, but exposed for tests + introspection. */
export function runningCountByKind(): Partial<Record<JobKind, number>> {
  const db = openDb();
  const rows = db
    .query("SELECT kind, COUNT(*) as n FROM jobs WHERE status = 'running' GROUP BY kind")
    .all() as Array<{ kind: JobKind; n: number }>;
  const out: Partial<Record<JobKind, number>> = {};
  for (const r of rows) out[r.kind] = r.n;
  return out;
}

export function countRunning(): number {
  const db = openDb();
  const r = db.query("SELECT COUNT(*) as n FROM jobs WHERE status = 'running'").get() as { n: number };
  return r?.n ?? 0;
}

function cancelUnstartedRun(
  db: Database,
  runId: string,
  endedAt: number,
): void {
  const run = db
    .query<
      { workspaceId: string | null; projectId: string | null },
      [string]
    >(
      "SELECT workspace_id AS workspaceId, project_id AS projectId FROM runs WHERE id = ? AND state = 'pending' AND started_at IS NULL",
    )
    .get(runId);
  if (!run) return;
  const result = db
    .prepare(
      "UPDATE runs SET state = 'cancelled', ended_at = ?, error = NULL WHERE id = ? AND state = 'pending' AND started_at IS NULL",
    )
    .run(endedAt, runId);
  if (!result.changes) return;
  appendActivity(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    entityType: "run",
    entityId: runId,
    action: "run.finished",
    payload: { state: "cancelled" },
    createdAt: endedAt,
  });
}

function finishLinkedExecution(
  db: Database,
  runId: string,
  jobStatus: "completed" | "failed" | "cancelled" | "blocked",
  error: string | null,
  endedAt: number,
): void {
  const state =
    jobStatus === "completed"
      ? "succeeded"
      : jobStatus === "cancelled"
        ? "cancelled"
        : "failed";
  const run = db
    .query<
      { workspaceId: string | null; projectId: string | null; state: string },
      [string]
    >(
      "SELECT workspace_id AS workspaceId, project_id AS projectId, state FROM runs WHERE id = ?",
    )
    .get(runId);
  if (!run) return;
  const attempt = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM run_attempts WHERE run_id = ? AND state = 'running' ORDER BY attempt_no DESC LIMIT 1",
    )
    .get(runId);
  if (attempt) {
    const attemptResult = db
      .prepare(
        "UPDATE run_attempts SET state = ?, error = ?, ended_at = ? WHERE id = ? AND state = 'running'",
      )
      .run(state, error, endedAt, attempt.id);
    if (attemptResult.changes) {
      appendActivity(db, {
        workspaceId: run.workspaceId,
        projectId: run.projectId,
        entityType: "run_attempt",
        entityId: attempt.id,
        action: "run.attempt_finished",
        payload: { runId, state },
        createdAt: endedAt,
      });
    }
  }
  const runResult = db
    .prepare(
      "UPDATE runs SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state IN ('pending', 'running')",
    )
    .run(state, endedAt, error, runId);
  if (!runResult.changes) return;
  appendActivity(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    entityType: "run",
    entityId: runId,
    action: "run.finished",
    payload: { state },
    createdAt: endedAt,
  });
}
