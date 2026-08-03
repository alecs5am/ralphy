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
import {
  createCredentialResolver,
  safeChildEnvironment,
  STATIC_CREDENTIAL_DESCRIPTORS,
  type CredentialDescriptor,
} from "../providers/credentials.js";
import { listConnectors } from "../providers/registry.js";
import { openDomainDb } from "../store/db.js";
import { ralphDir } from "../paths.js";

const POLL_INTERVAL_MS = 1000;
const TERMINATION_GRACE_MS = 5_000;

type SpendGate = (
  job: JobRow,
) => Promise<{ allowed: boolean; reason: string | null }>;

type Execution = {
  job: JobRow;
  child: ChildProcess | null;
  processGroupId: number | null;
  childClosed: boolean;
  closeCode: number | null;
  closeSignal: NodeJS.Signals | null;
  fileStream: fs.WriteStream | null;
  startedAt: number | null;
  cancelRequested: boolean;
  done: boolean;
  killTimer: ReturnType<typeof setTimeout> | null;
  completion: Promise<void>;
  complete: () => void;
  fail: (error: unknown) => void;
  cancellation: Promise<void>;
  cancel: () => void;
  lastStderr: string;
};

export type JobExecutor = {
  execute(job: JobRow): Promise<void>;
  reapCancelled(): void;
  stop(): Promise<void>;
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
  dependencies: {
    spendGate?: SpendGate;
    terminationGraceMs?: number;
    capturedCredentials?: ReadonlyMap<string, string>;
  } = {},
): JobExecutor {
  const executions = new Map<number, Execution>();
  const dispatchedAt: Partial<Record<JobKind, number>> = {};
  const spendGate = dependencies.spendGate ?? checkQueuedJobSpend;
  const terminationGraceMs =
    dependencies.terminationGraceMs ?? TERMINATION_GRACE_MS;
  const capturedCredentials =
    dependencies.capturedCredentials ?? new Map<string, string>();
  const log = opts.log ?? (() => {});
  let stopping = false;
  let stopPromise: Promise<void> | null = null;

  const complete = (
    execution: Execution,
    status: "completed" | "failed" | "cancelled" | "blocked",
    result: { exitCode?: number | null; errorMessage?: string | null } = {},
  ): void => {
    if (execution.done) return;
    let finalized = false;
    let finalizationError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        finalizeJob(execution.job.id, status, result);
        finalized = true;
        break;
      } catch (error) {
        finalizationError = error;
      }
    }
    execution.done = true;
    if (execution.killTimer) clearTimeout(execution.killTimer);
    executions.delete(execution.job.id);
    execution.fileStream?.end();
    execution.cancel();
    if (finalized) execution.complete();
    else execution.fail(finalizationError);
  };

  const completeCancellationIfExited = (execution: Execution): void => {
    if (
      execution.done ||
      !execution.cancelRequested ||
      !execution.childClosed ||
      executionTreeExists(execution)
    ) {
      return;
    }
    const signal = execution.closeSignal;
    appendLog(
      execution.job.id,
      "system",
      `[cancelled] ${signal ?? "requested"}`,
    );
    log(
      `job ${execution.job.id} cancelled (${signal ?? "requested"})`,
    );
    complete(execution, "cancelled", {
      exitCode: execution.closeCode,
      errorMessage: signal ? `killed by ${signal}` : "cancelled",
    });
  };

  const waitForProcessTreeExit = async (execution: Execution): Promise<void> => {
    while (!execution.done && executionTreeExists(execution)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    completeCancellationIfExited(execution);
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
      signalExecutionTree(execution, "SIGTERM");
      appendLog(
        execution.job.id,
        "system",
        source === "stop" ? "[daemon-stop] SIGTERM" : "[external-cancel] SIGTERM",
      );
      log(
        `job ${execution.job.id} ${source === "stop" ? "daemon-stop" : "external-cancel"} -> SIGTERM`,
      );
    } catch {
      // The close/error event remains the exactly-once terminalization point.
    }
    execution.killTimer = setTimeout(() => {
      if (execution.done || !execution.child) return;
      try {
        signalExecutionTree(execution, "SIGKILL");
        appendLog(execution.job.id, "system", "[cancel] SIGKILL");
        log(`job ${execution.job.id} cancellation grace expired -> SIGKILL`);
      } catch {
        // The close/error event will settle an already-exited child.
      }
      void waitForProcessTreeExit(execution);
    }, terminationGraceMs);
  };

  const spawnJob = async (execution: Execution, argv: string[]): Promise<void> => {
    const job = execution.job;
    const { program, args } = commandFor(job, argv, opts.ralphyBin);
    const logPath = path.join(jobLogsDir(), `${job.id}.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    execution.fileStream = fs.createWriteStream(logPath, { flags: "a" });

    let credential:
      | { descriptor: CredentialDescriptor; value: string }
      | undefined;
    try {
      credential = await resolveJobCredential(job, capturedCredentials);
    } catch (error) {
      const message = (error as Error).message;
      appendLog(job.id, "system", `[failed] ${message}`);
      log(`job ${job.id} credential resolution failed: ${message}`);
      complete(execution, "failed", { errorMessage: message });
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn(program, args, {
        cwd: job.command.cwd ?? opts.cwd,
        env: jobChildEnvironment({
          inherited: process.env,
          commandEnvironment: job.command.env,
          credential,
        }),
        detached: process.platform !== "win32",
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
    execution.processGroupId =
      process.platform === "win32" ? null : (child.pid ?? null);
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
      execution.childClosed = true;
      execution.closeCode = code ?? null;
      execution.closeSignal = signal;
      const fresh = getJob(job.id);
      if (
        execution.cancelRequested ||
        stopping ||
        fresh?.status === "cancelled" ||
        signal === "SIGTERM" ||
        signal === "SIGKILL"
      ) {
        if (!execution.cancelRequested) {
          requestCancellation(execution, stopping ? "stop" : "external");
        }
        completeCancellationIfExited(execution);
        return;
      }
      if (execution.closeCode === 0) {
        appendLog(job.id, "system", "[completed] exit 0");
        log(`job ${job.id} completed`);
        complete(execution, "completed", { exitCode: execution.closeCode });
        return;
      }
      const hint = burstCapHint(execution.lastStderr);
      const errorMessage = execution.lastStderr
        ? hint
          ? `${execution.lastStderr} — ${hint}`
          : execution.lastStderr
        : null;
      appendLog(job.id, "system", `[failed] exit ${execution.closeCode}`);
      if (hint) appendLog(job.id, "system", `[hint] ${hint}`);
      log(`job ${job.id} failed exit=${execution.closeCode}`);
      complete(execution, "failed", {
        exitCode: execution.closeCode,
        errorMessage,
      });
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
    await spawnJob(execution, argv);
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
      let failExecution!: (error: unknown) => void;
      let cancelExecution!: () => void;
      const execution: Execution = {
        job,
        child: null,
        processGroupId: null,
        childClosed: false,
        closeCode: null,
        closeSignal: null,
        fileStream: null,
        startedAt: null,
        cancelRequested: false,
        done: false,
        killTimer: null,
        completion: new Promise<void>((resolve, reject) => {
          completeExecution = resolve;
          failExecution = reject;
        }),
        complete: () => completeExecution(),
        fail: (error) => failExecution(error),
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
      if (stopPromise) return stopPromise;
      stopping = true;
      const active = [...executions.values()];
      for (const execution of active) {
        requestCancellation(execution, "stop");
      }
      stopPromise = Promise.allSettled(
        active.map((execution) => execution.completion),
      ).then(() => undefined);
      return stopPromise;
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

export function jobChildEnvironment(input: {
  inherited?: NodeJS.ProcessEnv;
  commandEnvironment?: Record<string, string>;
  credential?: { descriptor: CredentialDescriptor; value: string };
}): NodeJS.ProcessEnv {
  const inherited = input.inherited ?? process.env;
  // Legacy arbitrary job env is intentionally not forwarded: it is persisted
  // command data and therefore cannot be a credential transport.
  void input.commandEnvironment;
  return safeChildEnvironment({ inherited, credential: input.credential });
}

async function resolveJobCredential(
  job: JobRow,
  capturedCredentials: ReadonlyMap<string, string>,
): Promise<{ descriptor: CredentialDescriptor; value: string } | undefined> {
  const request = job.command.credential;
  if (!request) return undefined;
  const explicitProvider = requestedProvider(job.command.argv);
  if (explicitProvider !== undefined && explicitProvider !== request.providerId) {
    throw new Error("Job credential request does not match its command");
  }
  assertCredentialScope(job, request.workspaceId, request.projectId);
  const connectors = listConnectors();
  const capability = credentialCapability(job.kind);
  const connector = connectors.find((entry) => entry.id === request.providerId);
  if (!capability || !connector?.capabilities.includes(capability)) {
    throw new Error("Job credential provider does not match its job kind");
  }
  const descriptors = [
    ...STATIC_CREDENTIAL_DESCRIPTORS,
    ...connectors.map((entry) => entry.credential),
  ].filter(
    (descriptor, index, all) =>
      all.findIndex((entry) => entry.providerId === descriptor.providerId) ===
      index,
  );
  const descriptor = descriptors.find(
    (entry) => entry.providerId === request.providerId,
  );
  if (!descriptor) throw new Error("Job credential provider is unknown");
  const resolver = createCredentialResolver({
    dataRoot: ralphDir(),
    context: {
      kind: "scope",
      workspaceId: request.workspaceId,
      ...(request.projectId ? { projectId: request.projectId } : {}),
    },
    descriptors,
    capturedEnvironment: capturedCredentials,
  });
  const resolved = await resolver.resolve(request.providerId);
  if (descriptor.kind !== "api-key" || !descriptor.environmentVariable) {
    return undefined;
  }
  return resolved.value === null
    ? undefined
    : { descriptor, value: resolved.value };
}

function assertCredentialScope(
  job: JobRow,
  workspaceId: string,
  projectId?: string,
): void {
  const db = openDomainDb();
  if (job.run_id) {
    const run = db
      .query<
        { workspaceId: string; projectId: string | null },
        [string]
      >(
        "SELECT workspace_id AS workspaceId, project_id AS projectId FROM runs WHERE id = ?",
      )
      .get(job.run_id);
    if (
      !run ||
      run.workspaceId !== workspaceId ||
      (run.projectId ?? undefined) !== projectId
    ) {
      throw new Error("Job credential scope does not match its Run");
    }
    return;
  }
  const workspace = db
    .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
    .get(workspaceId);
  if (!workspace) throw new Error("Job credential Workspace does not exist");
  if (projectId) {
    const project = db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM projects WHERE id = ? AND workspace_id = ?",
      )
      .get(projectId, workspaceId);
    if (!project) throw new Error("Job credential Project does not match its Workspace");
  }
}

function requestedProvider(argv: string[]): string | null | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--provider") return argv[index + 1] ?? null;
    if (argv[index]?.startsWith("--provider=")) {
      return argv[index]!.slice("--provider=".length);
    }
  }
  return undefined;
}

function credentialCapability(jobKind: JobKind) {
  if (jobKind === "generate.image") return "image" as const;
  if (jobKind === "generate.video") return "video" as const;
  if (jobKind === "generate.voiceover") return "voice" as const;
  if (jobKind === "generate.music") return "music" as const;
  if (jobKind === "generate.sfx") return "sfx" as const;
  return null;
}

export function runWorkerLoop(opts: {
  concurrency: number;
  ralphyBin: string;
  cwd: string;
  pidFile: string;
  schedule?: ScheduleConfig["perKind"];
  capturedCredentials?: ReadonlyMap<string, string>;
}): void {
  openDb();
  fs.writeFileSync(opts.pidFile, String(process.pid));
  let stopping = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const log = (line: string) => {
    const timestamp = new Date().toISOString();
    process.stderr.write(`[daemon ${timestamp}] ${line}\n`);
  };
  const executor = createJobExecutor(
    {
      ralphyBin: opts.ralphyBin,
      cwd: opts.cwd,
      log,
    },
    { capturedCredentials: opts.capturedCredentials },
  );
  const scheduleConfig: ScheduleConfig = {
    globalConcurrency: opts.concurrency,
    perKind: opts.schedule,
  };

  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`received ${signal}, stopping (${executor.activeCount()} active)`);
    if (pollTimer) clearTimeout(pollTimer);
    void executor.stop().then(() => {
      log(`exit (active=${executor.activeCount()})`);
      try {
        fs.unlinkSync(opts.pidFile);
      } catch {
        // Missing pid file is already stopped.
      }
      process.exit(0);
    });
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

function signalExecutionTree(
  execution: Execution,
  signal: NodeJS.Signals,
): void {
  if (execution.processGroupId !== null) {
    process.kill(-execution.processGroupId, signal);
    return;
  }
  execution.child?.kill(signal);
}

function executionTreeExists(execution: Execution): boolean {
  if (execution.processGroupId === null) {
    return Boolean(
      execution.child &&
        execution.child.exitCode === null &&
        execution.child.signalCode === null,
    );
  }
  try {
    process.kill(-execution.processGroupId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
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
    return { program: "bun", args: ["run", "--no-env-file", ralphyBin, ...argv] };
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
