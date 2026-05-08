// `ralphy queue <add|list|cancel|retry|logs|watch>` — user-facing job control.
//
// Auto-starts the daemon on first call so agents can fire a job without
// having to remember a separate `daemon start` step. The TUI in `watch`
// (no id) renders a live ANSI dashboard refreshed every second.

import { Command } from "commander";
import { out, err, isPretty } from "../lib/output.js";
import {
  insertJob,
  listJobs,
  getJob,
  cancelJob,
  retryJob,
  tailLogs,
  countByStatus,
} from "../lib/jobs/db.js";
import { ensureDaemonRunning, daemonStatus } from "../lib/jobs/daemon.js";
import type { JobStatus, JobLogRow } from "../lib/jobs/types.js";

const TERMINAL_STATES = new Set<JobStatus>([
  "completed",
  "failed",
  "cancelled",
  "blocked",
]);

export function queueCmd() {
  const cmd = new Command("queue").description(
    "Manage the local job queue (add work, watch progress, cancel, retry)",
  );

  // ── add ────────────────────────────────────────────────────────────────
  // Use `--` to separate ralphy options from the wrapped command, so the
  // wrapped command's flags (e.g. `sh -c`) don't collide with our parser.
  // Example:
  //   ralphy queue add --depends-on 1 -- sh -c "echo hi"
  cmd
    .command("add")
    .description(
      "Enqueue a raw shell command as a job. Pass the wrapped command after `--`. For ralphy generate jobs, use `generate ... --queue` instead.",
    )
    .argument(
      "<argv...>",
      "Wrapped command. Use `--` to separate it from queue's own flags so the wrapped flags pass through.",
    )
    .option("--depends-on <ids>", "Comma-separated list of job ids this job waits on")
    .option("--priority <n>", "Higher = picked sooner among same-state pending jobs", (v) => parseInt(v, 10))
    .option("--tag <tag>", "Free-form tag for filtering")
    .option("--project <id>", "Project id for cost rollups")
    .option("--no-autostart", "Don't autostart the daemon if it's not running")
    .action((argv: string[], opts) => {
      if (!argv || argv.length === 0) {
        err("queue add requires a command (e.g. `ralphy queue add -- echo hello`)");
      }
      const deps = parseDeps(opts.dependsOn);
      const id = insertJob({
        kind: "shell",
        command: { argv },
        depends_on: deps,
        priority: opts.priority ?? 0,
        tag: opts.tag,
        project_id: opts.project,
      });
      if (opts.autostart !== false) ensureDaemonRunning();
      out({ id, kind: "shell", argv, depends_on: deps });
    });

  // ── list ───────────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List jobs (default: most recent first, all states)")
    .option("--status <s...>", "Filter by status (pending|running|completed|failed|cancelled|blocked)")
    .option("--tag <tag>", "Filter by tag")
    .option("--project <id>", "Filter by project")
    .option("--limit <n>", "Limit rows", (v) => parseInt(v, 10))
    .action((opts) => {
      const rows = listJobs({
        status: opts.status as JobStatus[] | undefined,
        tag: opts.tag,
        projectId: opts.project,
        limit: opts.limit,
      });
      const slim = rows.map((j) => ({
        id: j.id,
        status: j.status,
        kind: j.kind,
        priority: j.priority,
        deps: j.depends_on.join(",") || "-",
        argv: j.command.argv.slice(0, 3).join(" ") + (j.command.argv.length > 3 ? " …" : ""),
        runtimeMs: j.started_at && j.ended_at ? j.ended_at - j.started_at : null,
        exit: j.exit_code,
        tag: j.tag,
        project: j.project_id,
      }));
      const counts = countByStatus();
      out({ counts, jobs: slim });
    });

  // ── show ───────────────────────────────────────────────────────────────
  cmd
    .command("show <id>")
    .description("Show full details of one job")
    .action((id) => {
      const job = getJob(Number(id));
      if (!job) err(`Job not found: ${id}`);
      out(job);
    });

  // ── cancel ─────────────────────────────────────────────────────────────
  cmd
    .command("cancel <id>")
    .description("Cancel a pending or running job (SIGTERM if running)")
    .action((id) => {
      const ok = cancelJob(Number(id));
      out({ id: Number(id), cancelled: ok });
    });

  // ── retry ──────────────────────────────────────────────────────────────
  cmd
    .command("retry <id>")
    .description("Re-queue a failed/cancelled/blocked job (resets status to pending)")
    .action((id) => {
      const ok = retryJob(Number(id));
      if (ok) ensureDaemonRunning();
      out({ id: Number(id), retried: ok });
    });

  // ── logs ───────────────────────────────────────────────────────────────
  cmd
    .command("logs <id>")
    .description("Print all captured stdout+stderr lines for one job")
    .option("--follow", "Tail new lines as they arrive (Ctrl-C to exit)", false)
    .option("--since <id>", "Only show log rows with id > N", (v) => parseInt(v, 10))
    .action(async (id, opts) => {
      const jobId = Number(id);
      const job = getJob(jobId);
      if (!job) err(`Job not found: ${id}`);

      let cursor = opts.since ?? 0;
      const printBatch = (rows: JobLogRow[]) => {
        for (const r of rows) {
          const tag = r.stream === "stderr" ? "[stderr] " : r.stream === "system" ? "[sys] " : "";
          process.stdout.write(`${tag}${r.line}\n`);
          cursor = r.id;
        }
      };

      // Initial dump.
      printBatch(tailLogs(jobId, 0));

      if (!opts.follow) return;

      // Follow loop: poll DB every 500ms until the job hits a terminal state
      // and there's no new log data.
      while (true) {
        await new Promise((r) => setTimeout(r, 500));
        const newer = tailLogs(jobId, cursor);
        printBatch(newer);
        const fresh = getJob(jobId);
        if (fresh && TERMINAL_STATES.has(fresh.status) && newer.length === 0) break;
      }
      process.stdout.write(`[exit] status=${getJob(jobId)?.status}\n`);
    });

  // ── watch ──────────────────────────────────────────────────────────────
  cmd
    .command("watch [id]")
    .description(
      "Live monitor: with <id>, tails one job's logs in real time; without, renders an ANSI dashboard of all active jobs (Ctrl-C to exit)",
    )
    .option("--interval <ms>", "Refresh cadence", (v) => parseInt(v, 10), 1000)
    .action(async (id, opts) => {
      if (id) {
        // Tail-mode: same as `logs --follow`.
        const jobId = Number(id);
        let cursor = 0;
        while (true) {
          const rows = tailLogs(jobId, cursor);
          for (const r of rows) {
            const tag =
              r.stream === "stderr" ? "[stderr] " : r.stream === "system" ? "[sys] " : "";
            process.stdout.write(`${tag}${r.line}\n`);
            cursor = r.id;
          }
          const job = getJob(jobId);
          if (job && TERMINAL_STATES.has(job.status) && rows.length === 0) {
            process.stdout.write(`[exit] status=${job.status}\n`);
            return;
          }
          await new Promise((r) => setTimeout(r, opts.interval));
        }
      }

      // Dashboard mode.
      let firstFrame = true;
      while (true) {
        const counts = countByStatus();
        const rows = listJobs({ limit: 50 });
        const active = rows.filter(
          (j) => j.status === "running" || j.status === "pending",
        );
        const recent = rows
          .filter((j) => TERMINAL_STATES.has(j.status))
          .slice(0, 8);

        const lines: string[] = [];
        const dStatus = daemonStatus();
        lines.push(
          `ralphy queue · daemon=${dStatus.running ? "up" : "down"}` +
            (dStatus.pid ? ` pid=${dStatus.pid}` : "") +
            ` · pending=${counts.pending} running=${counts.running} done=${counts.completed} failed=${counts.failed} blocked=${counts.blocked}`,
        );
        lines.push("");
        lines.push("ACTIVE");
        if (active.length === 0) {
          lines.push("  (none)");
        } else {
          for (const j of active) {
            const elapsed = j.started_at
              ? `${Math.round((Date.now() - j.started_at) / 1000)}s`
              : "-";
            const argv =
              j.command.argv.slice(0, 4).join(" ") +
              (j.command.argv.length > 4 ? " …" : "");
            lines.push(
              `  #${j.id.toString().padStart(4)}  ${j.status.padEnd(8)}  ${j.kind.padEnd(20)}  ${elapsed.padStart(5)}  ${argv}`,
            );
          }
        }
        lines.push("");
        lines.push("RECENT");
        if (recent.length === 0) {
          lines.push("  (none)");
        } else {
          for (const j of recent) {
            const dt =
              j.started_at && j.ended_at ? `${Math.round((j.ended_at - j.started_at) / 1000)}s` : "-";
            const exit = j.exit_code ?? "-";
            const argv =
              j.command.argv.slice(0, 4).join(" ") +
              (j.command.argv.length > 4 ? " …" : "");
            lines.push(
              `  #${j.id.toString().padStart(4)}  ${j.status.padEnd(8)}  ${j.kind.padEnd(20)}  ${dt.padStart(5)}  exit=${exit}  ${argv}`,
            );
          }
        }
        lines.push("");
        lines.push("(Ctrl-C to exit)");

        if (!firstFrame) {
          // Move cursor up to overwrite previous frame.
          process.stdout.write(`\x1b[${linesPrinted}A\x1b[J`);
        }
        for (const l of lines) process.stdout.write(l + "\n");
        linesPrinted = lines.length;
        firstFrame = false;
        await new Promise((r) => setTimeout(r, opts.interval));
      }
    });

  return cmd;
}

let linesPrinted = 0;

function parseDeps(s: string | undefined): number[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n));
}

void isPretty;
