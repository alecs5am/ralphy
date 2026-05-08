// Daemon worker loop.
//
// `ralphy daemon start` spawns this file as a detached child via Bun.spawn.
// The loop:
//   1. Polls the SQLite store for pending jobs whose deps are met.
//   2. Up to `concurrency` slots can run at once. When a slot is free, claim
//      the next eligible job and spawn its child process.
//   3. Stream child stdout+stderr both to workspace/.ralph/job-logs/<id>.log
//      (file) and to job_logs (table) so `queue watch` can tail via SQL.
//   4. On child exit, finalize the row.
//   5. On SIGTERM (from `ralphy daemon stop`), stop accepting new work,
//      send SIGTERM to running children, wait, exit.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  openDb,
  claimNextPending,
  finalizeJob,
  appendLog,
  jobLogsDir,
  getJob,
} from "./db.js";
import type { JobRow } from "./types.js";

type Slot = {
  jobId: number;
  pid: number;
  child: ReturnType<typeof spawn>;
  startedAt: number;
  signaled: boolean;
};

const POLL_INTERVAL_MS = 1000;

export function runWorkerLoop(opts: {
  concurrency: number;
  ralphyBin: string;
  cwd: string;
  pidFile: string;
}): void {
  // Touch the DB and pid file early so smoke tests can see we started.
  openDb();
  fs.writeFileSync(opts.pidFile, String(process.pid));

  const slots: Map<number, Slot> = new Map();
  let stopping = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const log = (line: string) => {
    const ts = new Date().toISOString();
    process.stderr.write(`[daemon ${ts}] ${line}\n`);
  };

  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`received ${signal}, stopping (${slots.size} active)`);
    for (const slot of slots.values()) {
      try {
        slot.child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    if (pollTimer) clearTimeout(pollTimer);
    // Give children a grace window, then exit.
    setTimeout(() => {
      log(`exit (slots=${slots.size})`);
      try {
        fs.unlinkSync(opts.pidFile);
      } catch {
        /* missing */
      }
      process.exit(0);
    }, 5_000).unref();
  };

  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  log(`up; concurrency=${opts.concurrency} pid=${process.pid}`);

  const runJob = (job: JobRow) => {
    const argv = job.command.argv;
    if (!argv || argv.length === 0) {
      finalizeJob(job.id, "failed", { errorMessage: "empty argv" });
      log(`job ${job.id} failed: empty argv`);
      return;
    }

    // For ralphy.* kinds we run via the ralphy binary; for "shell" we exec
    // the argv as-is (caller supplies the program in argv[0]).
    let program: string;
    let args: string[];
    if (job.kind === "shell") {
      program = argv[0];
      args = argv.slice(1);
    } else if (
      opts.ralphyBin.endsWith("cli/index.ts") ||
      opts.ralphyBin.endsWith("cli\\index.ts")
    ) {
      // In-tree dev mode: spawn via `bun run <ts-entry> -- ...args`.
      program = "bun";
      args = ["run", opts.ralphyBin, ...argv];
    } else {
      program = opts.ralphyBin;
      args = argv;
    }

    const logPath = path.join(jobLogsDir(), `${job.id}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const fileStream = fs.createWriteStream(logPath, { flags: "a" });

    const env = { ...process.env, ...(job.command.env ?? {}) };
    const cwd = job.command.cwd ?? opts.cwd;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(program, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      finalizeJob(job.id, "failed", { errorMessage: (err as Error).message });
      log(`job ${job.id} spawn failed: ${(err as Error).message}`);
      fileStream.end();
      return;
    }

    appendLog(job.id, "system", `[spawn] ${program} ${args.join(" ")}`);
    fileStream.write(`[spawn] ${program} ${args.join(" ")}\n`);

    const slot: Slot = {
      jobId: job.id,
      pid: child.pid ?? -1,
      child,
      startedAt: Date.now(),
      signaled: false,
    };
    slots.set(job.id, slot);
    log(`job ${job.id} started pid=${child.pid}`);

    const pump = (stream: NodeJS.ReadableStream, kind: "stdout" | "stderr") => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        buf += chunk;
        let idx = buf.indexOf("\n");
        while (idx !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          fileStream.write(`${line}\n`);
          appendLog(job.id, kind, line);
          idx = buf.indexOf("\n");
        }
      });
      stream.on("end", () => {
        if (buf.length > 0) {
          fileStream.write(`${buf}\n`);
          appendLog(job.id, kind, buf);
          buf = "";
        }
      });
    };
    if (child.stdout) pump(child.stdout, "stdout");
    if (child.stderr) pump(child.stderr, "stderr");

    child.on("close", (code, signal) => {
      slots.delete(job.id);
      fileStream.end();
      const exitCode = code ?? null;
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        finalizeJob(job.id, "cancelled", {
          exitCode,
          errorMessage: `killed by ${signal}`,
        });
        appendLog(job.id, "system", `[cancelled] ${signal}`);
        log(`job ${job.id} cancelled (${signal})`);
      } else if (exitCode === 0) {
        finalizeJob(job.id, "completed", { exitCode });
        appendLog(job.id, "system", "[completed] exit 0");
        log(`job ${job.id} completed`);
      } else {
        finalizeJob(job.id, "failed", { exitCode });
        appendLog(job.id, "system", `[failed] exit ${exitCode}`);
        log(`job ${job.id} failed exit=${exitCode}`);
      }
    });
  };

  const reapCancelled = () => {
    // External cancel: a `queue cancel <id>` flips the DB row to 'cancelled'
    // but does not signal our child. Each tick, check active slots for that
    // condition and SIGTERM the child once.
    for (const [jobId, slot] of slots) {
      if (slot.signaled) continue;
      const fresh = getJob(jobId);
      if (fresh && fresh.status === "cancelled") {
        try {
          slot.child.kill("SIGTERM");
          slot.signaled = true;
          appendLog(jobId, "system", "[external-cancel] SIGTERM");
          log(`job ${jobId} external-cancel → SIGTERM`);
        } catch {
          /* already gone — finalize handler will notice */
        }
      }
    }
  };

  const tick = () => {
    if (stopping) return;
    reapCancelled();
    while (slots.size < opts.concurrency) {
      const job = claimNextPending();
      if (!job) break;
      runJob(job);
    }
    pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };
  tick();
}
