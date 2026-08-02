// Daemon worker loop and one-job executor.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { startRunAttempt } from "../store/runs.js";
import {
  appendLog,
  claimNextPending,
  finalizeJob,
  getJob,
  jobLogsDir,
  openDb,
  pendingKinds,
} from "./db.js";
import { burstCapHint } from "./error-hints.js";
import { dispatchableKinds, type ScheduleConfig } from "./schedule.js";
import { checkQueuedJobSpend } from "./spend-gate.js";
import type { JobKind, JobRow } from "./types.js";

const POLL_INTERVAL_MS = 1000;

type SpendGate = (
  job: JobRow,
) => Promise<{ allowed: boolean; reason: string | null }>;

type Execution = {
  job: JobRow;
  child: ChildProcess | null;
  fileStream: fs.WriteStream | null;
  startedAt: number | null;
  signaled: boolean;
  cancelRequested: boolean;
  done: boolean;
  completion: Promise<void>;
  complete: () => void;
  cancellation: Promise<void>;
  cancel: () => void;
  lastStderr: string;
};

export type JobExecutor = {
  execute(job: JobRow): Promise<void>;
  reapCancelled(): void;
  stop(): void;
  activeCount(): number;
  runningByKind(): Partial<Record<JobKind, number>>;
  lastDispatchByKind(): Partial<Record<JobKind, number>>;
};

export function createJobExecutor(
  opts: {
    ralphyBin: string;
    cwd: string;
    log?: (line: string) => void;
  },
  dependencies: { spendGate?: SpendGate } = {},
): JobExecutor {
  const executions = new Map<number, Execution>();
  const dispatchedAt: Partial<Record<JobKind, number>> = {};
  const spendGate = dependencies.spendGate ?? checkQueuedJobSpend;
  const log = opts.log ?? (() => {});
  let stopping = false;

  const complete = (
    execution: Execution,
    status: "completed" | "failed" | "cancelled" | "blocked",
    result: { exitCode?: number | null; errorMessage?: string | null } = {},
  ): void => {
    if (execution.done) return;
    execution.done = true;
    executions.delete(execution.job.id);
    finalizeJob(execution.job.id, status, result);
    execution.fileStream?.end();
    execution.cancel();
    execution.complete();
  };

  const requestCancellation = (
    execution: Execution,
    source: "external" | "stop",
  ): void => {
    if (execution.done || execution.cancelRequested) return;
    execution.cancelRequested = true;
    execution.cancel();
    if (!execution.child) {
      complete(execution, "cancelled", {
        errorMessage:
          source === "stop" ? "daemon stopped before spawn" : "cancelled before spawn",
      });
      return;
    }
    try {
      execution.child.kill("SIGTERM");
      execution.signaled = true;
      appendLog(
        execution.job.id,
        "system",
        source === "stop" ? "[daemon-stop] SIGTERM" : "[external-cancel] SIGTERM",
      );
      log(
        `job ${execution.job.id} ${source === "stop" ? "daemon-stop" : "external-cancel"} -> SIGTERM`,
      );
    } catch {
      complete(execution, "cancelled", { errorMessage: "cancelled" });
    }
  };

  const spawnJob = (execution: Execution, argv: string[]): void => {
    const job = execution.job;
    const { program, args } = commandFor(job, argv, opts.ralphyBin);
    const logPath = path.join(jobLogsDir(), `${job.id}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    execution.fileStream = fs.createWriteStream(logPath, { flags: "a" });

    let child: ChildProcess;
    try {
      child = spawn(program, args, {
        cwd: job.command.cwd ?? opts.cwd,
        env: { ...process.env, ...(job.command.env ?? {}) },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = (error as Error).message;
      appendLog(job.id, "system", `[failed] ${message}`);
      log(`job ${job.id} spawn failed: ${message}`);
      complete(execution, "failed", { errorMessage: message });
      return;
    }

    execution.child = child;
    execution.startedAt = Date.now();
    dispatchedAt[job.kind] = execution.startedAt;
    appendLog(job.id, "system", `[spawn] ${program} ${args.join(" ")}`);
    execution.fileStream.write(`[spawn] ${program} ${args.join(" ")}\n`);
    log(`job ${job.id} started pid=${child.pid}`);

    if (child.stdout) pump(execution, child.stdout, "stdout");
    if (child.stderr) pump(execution, child.stderr, "stderr");

    child.once("error", (error) => {
      const message = error.message;
      appendLog(job.id, "system", `[failed] ${message}`);
      log(`job ${job.id} spawn failed: ${message}`);
      complete(execution, "failed", { errorMessage: message });
    });
    child.once("close", (code, signal) => {
      if (execution.done) return;
      const exitCode = code ?? null;
      const fresh = getJob(job.id);
      if (
        execution.cancelRequested ||
        stopping ||
        fresh?.status === "cancelled" ||
        signal === "SIGTERM" ||
        signal === "SIGKILL"
      ) {
        const reason = signal ? `killed by ${signal}` : "cancelled";
        appendLog(job.id, "system", `[cancelled] ${signal ?? "requested"}`);
        log(`job ${job.id} cancelled (${signal ?? "requested"})`);
        complete(execution, "cancelled", {
          exitCode,
          errorMessage: reason,
        });
        return;
      }
      if (exitCode === 0) {
        appendLog(job.id, "system", "[completed] exit 0");
        log(`job ${job.id} completed`);
        complete(execution, "completed", { exitCode });
        return;
      }
      const hint = burstCapHint(execution.lastStderr);
      const errorMessage = execution.lastStderr
        ? hint
          ? `${execution.lastStderr} — ${hint}`
          : execution.lastStderr
        : null;
      appendLog(job.id, "system", `[failed] exit ${exitCode}`);
      if (hint) appendLog(job.id, "system", `[hint] ${hint}`);
      log(`job ${job.id} failed exit=${exitCode}`);
      complete(execution, "failed", { exitCode, errorMessage });
    });
  };

  const dispatch = async (execution: Execution): Promise<void> => {
    const argv = execution.job.command.argv;
    if (!argv || argv.length === 0) {
      complete(execution, "failed", { errorMessage: "empty argv" });
      log(`job ${execution.job.id} failed: empty argv`);
      return;
    }

    const gate = Promise.resolve()
      .then(() => spendGate(execution.job))
      .then(
        (value) => ({ type: "gate" as const, value }),
        (error: unknown) => ({ type: "error" as const, error }),
      );
    const outcome = await Promise.race([
      gate,
      execution.cancellation.then(() => ({ type: "cancel" as const })),
    ]);
    if (execution.done || outcome.type === "cancel") return;
    if (outcome.type === "error") {
      const message = `spend gate errored: ${(outcome.error as Error).message}`;
      appendLog(execution.job.id, "system", `[failed] ${message}`);
      log(`job ${execution.job.id} ${message}`);
      complete(execution, "failed", { errorMessage: message });
      return;
    }
    if (stopping || getJob(execution.job.id)?.status === "cancelled") {
      requestCancellation(execution, stopping ? "stop" : "external");
      return;
    }
    if (!outcome.value.allowed) {
      const message = `budget gate blocked dispatch: ${outcome.value.reason ?? "budget breach"}`;
      appendLog(execution.job.id, "system", `[blocked] ${message}`);
      log(
        `job ${execution.job.id} blocked by spend gate: ${outcome.value.reason ?? "budget breach"}`,
      );
      complete(execution, "blocked", { errorMessage: message });
      return;
    }
    spawnJob(execution, argv);
  };

  return {
    execute(job) {
      const active = executions.get(job.id);
      if (active) return active.completion;

      if (job.run_id) {
        try {
          startRunAttempt({
            runId: job.run_id,
            provider: "local",
            model: job.kind,
          });
        } catch (error) {
          const message = `Run attempt failed to start: ${(error as Error).message}`;
          finalizeJob(job.id, "failed", { errorMessage: message });
          return Promise.resolve();
        }
      }

      let completeExecution!: () => void;
      let cancelExecution!: () => void;
      const execution: Execution = {
        job,
        child: null,
        fileStream: null,
        startedAt: null,
        signaled: false,
        cancelRequested: false,
        done: false,
        completion: new Promise<void>((resolve) => {
          completeExecution = resolve;
        }),
        complete: () => completeExecution(),
        cancellation: new Promise<void>((resolve) => {
          cancelExecution = resolve;
        }),
        cancel: () => cancelExecution(),
        lastStderr: "",
      };
      executions.set(job.id, execution);
      if (stopping) {
        requestCancellation(execution, "stop");
      } else {
        void dispatch(execution);
      }
      return execution.completion;
    },
    reapCancelled() {
      for (const execution of executions.values()) {
        if (getJob(execution.job.id)?.status === "cancelled") {
          requestCancellation(execution, "external");
        }
      }
    },
    stop() {
      if (stopping) return;
      stopping = true;
      for (const execution of [...executions.values()]) {
        requestCancellation(execution, "stop");
      }
    },
    activeCount() {
      return executions.size;
    },
    runningByKind() {
      const result: Partial<Record<JobKind, number>> = {};
      for (const execution of executions.values()) {
        if (execution.child) {
          const kind = execution.job.kind;
          result[kind] = (result[kind] ?? 0) + 1;
        }
      }
      return result;
    },
    lastDispatchByKind() {
      return { ...dispatchedAt };
    },
  };
}

export function runWorkerLoop(opts: {
  concurrency: number;
  ralphyBin: string;
  cwd: string;
  pidFile: string;
  schedule?: ScheduleConfig["perKind"];
}): void {
  openDb();
  fs.writeFileSync(opts.pidFile, String(process.pid));
  let stopping = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const log = (line: string) => {
    const timestamp = new Date().toISOString();
    process.stderr.write(`[daemon ${timestamp}] ${line}\n`);
  };
  const executor = createJobExecutor({
    ralphyBin: opts.ralphyBin,
    cwd: opts.cwd,
    log,
  });
  const scheduleConfig: ScheduleConfig = {
    globalConcurrency: opts.concurrency,
    perKind: opts.schedule,
  };

  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`received ${signal}, stopping (${executor.activeCount()} active)`);
    executor.stop();
    if (pollTimer) clearTimeout(pollTimer);
    setTimeout(() => {
      log(`exit (active=${executor.activeCount()})`);
      try {
        fs.unlinkSync(opts.pidFile);
      } catch {
        // Missing pid file is already stopped.
      }
      process.exit(0);
    }, 5_000).unref();
  };

  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  log(`up; concurrency=${opts.concurrency} pid=${process.pid}`);

  const tick = () => {
    if (stopping) return;
    executor.reapCancelled();
    while (executor.activeCount() < opts.concurrency) {
      const candidates = pendingKinds();
      if (candidates.length === 0) break;
      const eligible = dispatchableKinds(
        candidates,
        executor.runningByKind(),
        executor.lastDispatchByKind(),
        Date.now(),
        scheduleConfig,
      );
      if (eligible.length === 0) break;
      const job = claimNextPending(eligible);
      if (!job) break;
      void executor.execute(job).catch((error) => {
        log(`job ${job.id} executor failed: ${(error as Error).message}`);
      });
    }
    pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };
  tick();
}

function commandFor(
  job: JobRow,
  argv: string[],
  ralphyBin: string,
): { program: string; args: string[] } {
  if (job.kind === "shell") {
    return { program: argv[0]!, args: argv.slice(1) };
  }
  if (
    ralphyBin.endsWith("cli/index.ts") ||
    ralphyBin.endsWith("cli\\index.ts")
  ) {
    return { program: "bun", args: ["run", ralphyBin, ...argv] };
  }
  return { program: ralphyBin, args: argv };
}

function pump(
  execution: Execution,
  stream: NodeJS.ReadableStream,
  kind: "stdout" | "stderr",
): void {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      recordLine(execution, kind, line);
      newline = buffer.indexOf("\n");
    }
  });
  stream.on("end", () => {
    if (buffer) recordLine(execution, kind, buffer);
    buffer = "";
  });
}

function recordLine(
  execution: Execution,
  kind: "stdout" | "stderr",
  line: string,
): void {
  if (execution.done) return;
  execution.fileStream?.write(`${line}\n`);
  appendLog(execution.job.id, kind, line);
  if (kind === "stderr" && line.trim()) execution.lastStderr = line;
}
