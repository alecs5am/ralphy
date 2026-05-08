// SQLite-backed jobs store, used by the ralphy daemon + queue commands.
//
// Bun ships `bun:sqlite` natively — no native deps. The DB file lives at
// workspace/.ralph/jobs.db and is created lazily on first open.
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
import { root } from "../paths.js";
import type {
  JobRow,
  JobLogRow,
  JobArtifactRow,
  JobInsertInput,
  JobStatus,
} from "./types.js";

const SCHEMA_VERSION = 1;

let _db: Database | null = null;

export function dbPath(): string {
  return path.join(root(), "workspace", ".ralph", "jobs.db");
}

export function jobLogsDir(): string {
  return path.join(root(), "workspace", ".ralph", "job-logs");
}

/**
 * Close the cached connection (if any). Used by tests to reset state
 * between cases when the workspace root is rebound. No-op in production.
 */
export function closeDb(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      /* already closed */
    }
    _db = null;
  }
}

export function openDb(): Database {
  if (_db) return _db;
  const p = dbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.mkdirSync(jobLogsDir(), { recursive: true });
  const db = new Database(p, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  _db = db;
  return db;
}

function migrate(db: Database): void {
  const row = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get();
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      kind          TEXT NOT NULL,
      status        TEXT NOT NULL CHECK (status IN
                      ('pending','blocked','running','completed','failed','cancelled')),
      command       TEXT NOT NULL,
      depends_on    TEXT NOT NULL DEFAULT '[]',
      priority      INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      started_at    INTEGER,
      ended_at      INTEGER,
      exit_code     INTEGER,
      error_message TEXT,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      log_path      TEXT,
      tag           TEXT,
      project_id    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_tag      ON jobs(tag);
    CREATE INDEX IF NOT EXISTS idx_jobs_project  ON jobs(project_id);

    CREATE TABLE IF NOT EXISTS job_logs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id  INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      ts      INTEGER NOT NULL,
      stream  TEXT NOT NULL CHECK (stream IN ('stdout','stderr','system')),
      line    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_logs_ts     ON job_logs(ts);

    CREATE TABLE IF NOT EXISTS job_artifacts (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id  INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind    TEXT NOT NULL,
      path    TEXT NOT NULL,
      bytes   INTEGER,
      sha256  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_artifacts_job_id ON job_artifacts(job_id);
  `);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Inserts / queries
// ─────────────────────────────────────────────────────────────────────────────

export function insertJob(input: JobInsertInput): number {
  const db = openDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO jobs (kind, status, command, depends_on, priority, created_at, tag, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
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
    INSERT INTO jobs (kind, status, command, depends_on, priority, created_at, tag, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  const txn = db.transaction((items: JobInsertInput[]) => {
    for (const i of items) {
      const r = stmt.run(
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
export function claimNextPending(): JobRow | null {
  const db = openDb();
  // Materialize candidates first, then check deps in JS (cheaper than recursive
  // SQL for our tiny scale).
  const candidates = db
    .query("SELECT * FROM jobs WHERE status = 'pending' ORDER BY priority DESC, id ASC")
    .all() as any[];
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
  status: "completed" | "failed" | "cancelled",
  opts: { exitCode?: number | null; errorMessage?: string | null } = {},
): void {
  const db = openDb();
  db.prepare(
    "UPDATE jobs SET status=?, ended_at=?, exit_code=?, error_message=? WHERE id=?",
  ).run(
    status,
    Date.now(),
    opts.exitCode ?? null,
    opts.errorMessage ?? null,
    id,
  );
}

export function cancelJob(id: number): boolean {
  const db = openDb();
  // Only cancel if not yet completed/failed.
  const r = db
    .prepare(
      "UPDATE jobs SET status='cancelled', ended_at=? WHERE id=? AND status IN ('pending','running','blocked')",
    )
    .run(Date.now(), id);
  return (r.changes ?? 0) > 0;
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
    .query("SELECT * FROM job_artifacts WHERE job_id = ? ORDER BY id ASC")
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

export function countRunning(): number {
  const db = openDb();
  const r = db.query("SELECT COUNT(*) as n FROM jobs WHERE status = 'running'").get() as { n: number };
  return r?.n ?? 0;
}
