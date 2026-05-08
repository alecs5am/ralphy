// Shared types for the local-job system.
//
// A "job" is a single CLI invocation that the ralphy daemon will execute
// asynchronously: a video gen, an image gen, a render, an ffmpeg recipe, a
// custom shell command. State + logs persist in workspace/.ralph/jobs.db.

export type JobStatus =
  | "pending"      // awaiting dispatch (deps may still be unmet)
  | "blocked"      // a dependency failed/cancelled — this job will never run
  | "running"      // worker has spawned the child process
  | "completed"    // child exited 0
  | "failed"       // child exited non-zero or threw
  | "cancelled";   // user invoked cancel

export type JobKind =
  | "generate.image"
  | "generate.video"
  | "generate.voiceover"
  | "generate.music"
  | "generate.captions"
  | "render"
  | "shell";       // raw shell — argv + env

/**
 * Command spec for the worker. `argv` is the exact arg list to run with
 * the ralphy binary (or `bun run ralphy --` in dev). For `kind: "shell"`,
 * argv is `[program, ...args]` and bypasses ralphy.
 */
export type JobCommand = {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type JobRow = {
  id: number;
  kind: JobKind;
  status: JobStatus;
  command: JobCommand;
  /** JSON array of job ids this job waits on. Empty = no deps. */
  depends_on: number[];
  /** Higher = picked sooner among same-priority pending jobs. Default 0. */
  priority: number;
  /** ms since epoch */
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  exit_code: number | null;
  error_message: string | null;
  retry_count: number;
  /** Per-job stdout+stderr file path (workspace/.ralph/job-logs/<id>.log). */
  log_path: string | null;
  /** User tag for filtering in `queue list`. Default null. */
  tag: string | null;
  /** Optional project association for cost rollups. */
  project_id: string | null;
};

export type JobLogRow = {
  id: number;
  job_id: number;
  ts: number;
  stream: "stdout" | "stderr" | "system";
  line: string;
};

export type JobArtifactRow = {
  id: number;
  job_id: number;
  kind: string;
  path: string;
  bytes: number | null;
  sha256: string | null;
};

export type JobInsertInput = {
  kind: JobKind;
  command: JobCommand;
  depends_on?: number[];
  priority?: number;
  tag?: string;
  project_id?: string;
};
