import { countByStatus, listJobs } from "../jobs/db.js";
import { deriveJobArgvFields } from "../jobs/argv-fields.js";
import type { JobRow, JobStatus } from "../jobs/types.js";
import { classifyError } from "../errors/taxonomy.js";
import { projectLabels } from "../store/scopes.js";

/** One queue job as the panel shows it: a readable label first, raw argv second. */
export type PanelJob = {
  id: number;
  status: JobStatus;
  label: string;
  argv: string;
  project: string | null;
  model: string | null;
  prompt: string | null;
  attempts: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  runtimeMs: number | null;
  error: string | null;
  hint: string | null;
};

export type PanelActivity = {
  serverTime: number;
  windowHours: number;
  counts: Record<JobStatus, number>;
  running: PanelJob[];
  failed: PanelJob[];
  pending: { count: number; next: PanelJob[] };
  done: PanelJob[];
  older: PanelJob[];
};

const WINDOW_HOURS = 24;
const RECENT_LIMIT = 25;
const OLDER_LIMIT = 50;
const PENDING_PREVIEW = 5;

/** `generate image --slot hero` → "Generate image · hero"; `render demo` → "Render · demo". */
export function jobLabel(job: Pick<JobRow, "command" | "tag">): string {
  const argv = job.command.argv[0] === "ralphy" ? job.command.argv.slice(1) : job.command.argv;
  const fields = deriveJobArgvFields(argv);
  const words = argv.filter((token) => !token.startsWith("-")).slice(0, 2);
  const verb = words.length ? words.join(" ") : "job";
  const subject = fields.slot ?? (verb.startsWith("render") ? argv[1] : null) ?? job.tag;
  const head = verb.charAt(0).toUpperCase() + verb.slice(1);
  return subject && !verb.includes(subject) ? `${head} · ${subject}` : head;
}

function toPanelJob(job: JobRow, projects: Map<string, string>): PanelJob {
  const argv = job.command.argv[0] === "ralphy" ? job.command.argv.slice(1) : job.command.argv;
  const fields = deriveJobArgvFields(argv);
  const taxon = job.error_message ? classifyError({ message: job.error_message, modelId: fields.model ?? undefined }) : null;
  return {
    id: job.id,
    status: job.status,
    label: jobLabel(job),
    argv: argv.join(" "),
    project: job.project_id ? projects.get(job.project_id) ?? job.project_id : null,
    model: fields.model,
    prompt: fields.promptPreview,
    attempts: job.retry_count + 1,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.ended_at,
    runtimeMs: job.started_at && job.ended_at ? job.ended_at - job.started_at : null,
    error: job.error_message,
    hint: taxon?.nextActions[0] ?? null,
  };
}

/** Group the root-wide job queue into what is running, what failed, what waits and what finished. */
export function activitySnapshot(now = Date.now()): PanelActivity {
  const live = listJobs({ status: ["running", "pending", "blocked"] });
  const finished = listJobs({ status: ["completed", "failed", "cancelled"] })
    .sort((a, b) => (b.ended_at ?? b.created_at) - (a.ended_at ?? a.created_at));
  const since = now - WINDOW_HOURS * 3_600_000;
  const recent = finished.filter((job) => (job.ended_at ?? job.created_at) >= since);
  const older = finished.filter((job) => (job.ended_at ?? job.created_at) < since).slice(0, OLDER_LIMIT);
  const waiting = live.filter((job) => job.status !== "running");
  const shown = [...live, ...recent, ...older];
  const projects = new Map(
    projectLabels(shown.map((job) => job.project_id ?? "")).map((row) => [row.reference, `${row.workspaceSlug}/${row.slug}`]),
  );
  const map = (jobs: JobRow[]) => jobs.map((job) => toPanelJob(job, projects));
  return {
    serverTime: now,
    windowHours: WINDOW_HOURS,
    counts: countByStatus(),
    running: map(live.filter((job) => job.status === "running")),
    failed: map(recent.filter((job) => job.status === "failed").slice(0, RECENT_LIMIT)),
    pending: { count: waiting.length, next: map(waiting.slice(0, PENDING_PREVIEW)) },
    done: map(recent.filter((job) => job.status !== "failed").slice(0, RECENT_LIMIT)),
    older: map(older),
  };
}
