// `ralphy daemon <start|stop|status>` — manages the local job worker.
//
// The daemon is a detached child process forked by `ralphy daemon start`.
// It owns the SQLite jobs.db, polls for pending work, and runs up to
// `--concurrency N` jobs in parallel. `ralphy queue` commands talk to the
// same DB and can autostart the daemon if it's not running.

import { Command } from "commander";
import {
  startDaemon,
  stopDaemon,
  daemonStatus,
} from "../lib/jobs/daemon.js";
import { out, err } from "../lib/output.js";
import { countByStatus } from "../lib/jobs/db.js";

export function daemonCmd() {
  const cmd = new Command("daemon").description(
    "Manage the local job worker (background process that executes queued ralphy jobs)",
  );

  cmd
    .command("start")
    .description("Start the daemon as a detached background process")
    .option(
      "--concurrency <n>",
      "Max parallel jobs (default 4 — bumps OR submission rate)",
      (v) => parseInt(v, 10),
    )
    .option("--ralphy-bin <path>", "Override ralphy binary path (default: $RALPHY_BIN or in-tree)")
    .action((opts) => {
      try {
        const r = startDaemon({
          concurrency: opts.concurrency,
          ralphyBin: opts.ralphyBin,
        });
        out({ daemon: "started", pid: r.pid, pidFile: r.pidFile, logFile: r.logFile });
      } catch (e) {
        err((e as Error).message);
      }
    });

  cmd
    .command("stop")
    .description("Send SIGTERM to the daemon and wait up to 7s for graceful exit")
    .action(() => {
      const r = stopDaemon();
      if (!r.stopped) {
        out({ daemon: "not-running" });
        return;
      }
      out({ daemon: "stopped", pid: r.pid });
    });

  cmd
    .command("status")
    .description("Report whether the daemon is running and how many jobs are in each state. Exits 2 if pending jobs exist but no worker is running.")
    .action(() => {
      const s = daemonStatus();
      // Reading counts also opens the DB — safe even when daemon is down.
      const counts = countByStatus();
      // Idle-with-pending detection (issue #027): if jobs are waiting and
      // nothing is running (either daemon is down OR daemon is up but no
      // worker slot is active), agents would otherwise silently wait forever.
      const idle = counts.pending > 0 && counts.running === 0;
      const warning = idle
        ? `daemon idle while ${counts.pending} job${counts.pending === 1 ? "" : "s"} pending — try \`ralphy daemon start\`${counts.failed > 0 ? " or `ralphy queue retry --state failed`" : ""}`
        : null;
      out({
        running: s.running,
        pid: s.pid,
        pidFile: s.pidFile,
        logFile: s.logFile,
        jobs: counts,
        idle,
        warning,
      });
      if (warning) {
        // Loud stderr so scripts piping JSON still see the alarm.
        process.stderr.write(`⚠️  ${warning}\n`);
        process.exitCode = 2;
      }
    });

  return cmd;
}
