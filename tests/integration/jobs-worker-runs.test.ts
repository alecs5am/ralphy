import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import * as jobsDb from "../../cli/lib/jobs/db.js";
import {
  cancelJob,
  cancelJobsByFilter,
  claimNextPending,
  closeDb,
  finalizeJob,
  getJob,
  insertJob,
  retryJob,
  retryJobsByFilter,
} from "../../cli/lib/jobs/db.js";
import {
  createJobExecutor,
  type JobExecutor,
} from "../../cli/lib/jobs/worker.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { startRun } from "../../cli/lib/store/runs.js";
import {
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";
import { getRunAggregate as getRun } from "../helpers/run-aggregate.js";

let root: TmpRoot;
let executors: JobExecutor[];

beforeEach(() => {
  root = makeTmpRoot("ralphy-worker-runs");
  closeDb();
  closeDomainDb();
  executors = [];
});

afterEach(() => {
  for (const executor of executors) executor.stop();
  closeDb();
  closeDomainDb();
  root.cleanup();
});

describe("job worker linked Run lifecycle", () => {
  test("maps successful and non-zero shell exits to one attempt and Run", async () => {
    const success = linkedJob(["/bin/sh", "-c", "printf success"]);
    const failure = linkedJob(["/bin/sh", "-c", "printf failure >&2; exit 7"]);
    const executor = makeExecutor();

    await executor.execute(claimSpecific(success.jobId));
    await executor.execute(claimSpecific(failure.jobId));

    expect(getJob(success.jobId)).toMatchObject({
      status: "completed",
      exit_code: 0,
    });
    expect(getRun(success.runId)).toMatchObject({
      state: "succeeded",
      attempts: [
        {
          attemptNo: 1,
          provider: "local",
          model: "shell",
          state: "succeeded",
        },
      ],
    });
    expect(getJob(failure.jobId)).toMatchObject({
      status: "failed",
      exit_code: 7,
      error_message: "failure",
    });
    expect(getRun(failure.runId)).toMatchObject({
      state: "failed",
      error: "failure",
      attempts: [{ attemptNo: 1, state: "failed", error: "failure" }],
    });
  });

  test("retries a rolled-back finalization before releasing execution ownership", async () => {
    const linked = linkedJob(["/bin/sh", "-c", "exit 0"]);
    const db = openDomainDb();
    db.exec(`
      CREATE TRIGGER fail_once_attempt_finish_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'run.attempt_finished'
      BEGIN
        SELECT RAISE(ABORT, 'fixture one-shot activity failure');
      END;
    `);
    const finalize = jobsDb.finalizeJob;
    let finalizationCalls = 0;
    const finalizeSpy = spyOn(jobsDb, "finalizeJob").mockImplementation(
      (id, status, options) => {
        try {
          finalize(id, status, options);
        } finally {
          finalizationCalls += 1;
          if (finalizationCalls === 1) {
            db.exec("DROP TRIGGER fail_once_attempt_finish_activity");
          }
        }
      },
    );
    const executor = makeExecutor();

    try {
      const execution = executor.execute(claimSpecific(linked.jobId));
      expect(await settleWithin(execution)).toEqual({ state: "resolved" });
      expect(finalizationCalls).toBe(2);
      expect(executor.activeCount()).toBe(0);
      expect(getJob(linked.jobId)).toMatchObject({ status: "completed" });
      expect(getRun(linked.runId)).toMatchObject({
        state: "succeeded",
        attempts: [{ state: "succeeded" }],
      });
      expect(
        scopedActivity().filter(
          (event) =>
            event.action === "run.attempt_finished" &&
            event.entityId === getRun(linked.runId).attempts[0]?.id,
        ),
      ).toHaveLength(1);
    } finally {
      finalizeSpy.mockRestore();
    }
  });

  test("rejects persistent finalization failure after stop cleanup", async () => {
    const linked = linkedJob(["/bin/sh", "-c", "sleep 30"]);
    openDomainDb().exec(`
      CREATE TRIGGER reject_attempt_finish_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'run.attempt_finished'
      BEGIN
        SELECT RAISE(ABORT, 'fixture persistent activity failure');
      END;
    `);
    const executor = makeExecutor();
    const execution = executor.execute(claimSpecific(linked.jobId));
    await waitFor(() => executor.activeCount() === 1);
    const stopping = executor.stop();
    const [executionResult, stopResult] = await Promise.all([
      settleWithin(execution),
      settleWithin(stopping),
    ]);

    expect(executionResult.state).toBe("rejected");
    if (executionResult.state === "rejected") {
      expect(String(executionResult.error)).toMatch(
        /fixture persistent activity failure/i,
      );
    }
    expect(stopResult).toEqual({ state: "resolved" });
    expect(executor.activeCount()).toBe(0);
    expect(getJob(linked.jobId)).toMatchObject({ status: "running" });
    expect(getRun(linked.runId)).toMatchObject({
      state: "running",
      attempts: [{ state: "running" }],
    });
  });

  test("starts an attempt before empty argv and fails both records", async () => {
    const linked = linkedJob([]);
    const executor = makeExecutor();

    await executor.execute(claimSpecific(linked.jobId));

    expect(getJob(linked.jobId)).toMatchObject({
      status: "failed",
      error_message: "empty argv",
    });
    expect(getRun(linked.runId)).toMatchObject({
      state: "failed",
      attempts: [
        { attemptNo: 1, state: "failed", error: "empty argv" },
      ],
    });
  });

  test("fails closed for spend-gate blocks and rejections", async () => {
    const blocked = linkedJob(["/bin/sh", "-c", "exit 0"]);
    const blockedExecutor = makeExecutor(async () => ({
      allowed: false,
      reason: "fixture cap",
    }));
    await blockedExecutor.execute(claimSpecific(blocked.jobId));
    expect(getJob(blocked.jobId)).toMatchObject({
      status: "blocked",
      error_message: "budget gate blocked dispatch: fixture cap",
    });
    expect(getRun(blocked.runId)).toMatchObject({
      state: "failed",
      attempts: [{ state: "failed" }],
    });

    const rejected = linkedJob(["/bin/sh", "-c", "exit 0"]);
    const rejectedExecutor = makeExecutor(async () => {
      throw new Error("fixture gate unavailable");
    });
    await rejectedExecutor.execute(claimSpecific(rejected.jobId));
    expect(getJob(rejected.jobId)).toMatchObject({
      status: "failed",
      error_message: "spend gate errored: fixture gate unavailable",
    });
    expect(getRun(rejected.runId)).toMatchObject({
      state: "failed",
      attempts: [{ state: "failed" }],
    });
  });

  test("handles synchronous spawn throws and asynchronous error-close once", async () => {
    const sync = linkedJob(["/bin/sh", "-c", "exit 0"], "\0invalid-cwd");
    const async = linkedJob(["/definitely/missing/ralphy-worker-fixture"]);
    const executor = makeExecutor();

    await executor.execute(claimSpecific(sync.jobId));
    await executor.execute(claimSpecific(async.jobId));

    for (const linked of [sync, async]) {
      const run = getRun(linked.runId);
      expect(getJob(linked.jobId)?.status).toBe("failed");
      expect(run.state).toBe("failed");
      expect(run.attempts).toHaveLength(1);
      expect(run.attempts[0]?.state).toBe("failed");
      expect(
        scopedActivity().filter(
          (event) =>
            event.entityType === "run_attempt" &&
            event.action === "run.attempt_finished" &&
            event.entityId === run.attempts[0]!.id,
        ),
      ).toHaveLength(1);
    }
  });

  test("cancellation during gate reservation prevents spawn and wins completion", async () => {
    let releaseGate!: (value: { allowed: boolean; reason: null }) => void;
    const gate = new Promise<{ allowed: boolean; reason: null }>((resolve) => {
      releaseGate = resolve;
    });
    const marker = path.join(root.dir, "must-not-exist");
    const linked = linkedJob(["/bin/sh", "-c", `touch ${marker}`]);
    const executor = makeExecutor(() => gate);
    const execution = executor.execute(claimSpecific(linked.jobId));
    await waitFor(() => getRun(linked.runId).attempts.length === 1);

    expect(cancelJob(linked.jobId)).toBe(true);
    executor.reapCancelled();
    await execution;
    releaseGate({ allowed: true, reason: null });
    await Bun.sleep(20);

    expect(fs.existsSync(marker)).toBe(false);
    expect(getJob(linked.jobId)?.status).toBe("cancelled");
    expect(getRun(linked.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ state: "cancelled" }],
    });

    let releaseStoppedGate!: (value: {
      allowed: boolean;
      reason: null;
    }) => void;
    const stoppedGate = new Promise<{ allowed: boolean; reason: null }>(
      (resolve) => {
        releaseStoppedGate = resolve;
      },
    );
    const stoppedMarker = path.join(root.dir, "stopped-must-not-exist");
    const stopped = linkedJob([
      "/bin/sh",
      "-c",
      `touch ${stoppedMarker}`,
    ]);
    const stoppedExecutor = makeExecutor(() => stoppedGate);
    const stoppedExecution = stoppedExecutor.execute(
      claimSpecific(stopped.jobId),
    );
    await waitFor(() => getRun(stopped.runId).attempts.length === 1);
    stoppedExecutor.stop();
    await stoppedExecution;
    releaseStoppedGate({ allowed: true, reason: null });
    await Bun.sleep(20);
    expect(fs.existsSync(stoppedMarker)).toBe(false);
    expect(getJob(stopped.jobId)?.status).toBe("cancelled");
    expect(getRun(stopped.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ state: "cancelled" }],
    });
  });

  test("external cancellation and executor stop terminate active children", async () => {
    const external = linkedJob(["/bin/sh", "-c", "sleep 30"]);
    const stopped = linkedJob(["/bin/sh", "-c", "sleep 30"]);
    const executor = makeExecutor();

    const externalExecution = executor.execute(claimSpecific(external.jobId));
    await waitFor(() => executor.activeCount() === 1);
    expect(cancelJob(external.jobId)).toBe(true);
    executor.reapCancelled();
    await externalExecution;
    expect(getRun(external.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ state: "cancelled" }],
    });

    const stoppedExecution = executor.execute(claimSpecific(stopped.jobId));
    await waitFor(() => executor.activeCount() === 1);
    executor.stop();
    await stoppedExecution;
    expect(getJob(stopped.jobId)?.status).toBe("cancelled");
    expect(getRun(stopped.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ state: "cancelled" }],
    });
  });

  test("maps SIGTERM and SIGKILL child exits to cancelled", async () => {
    for (const signal of ["TERM", "KILL"]) {
      const linked = linkedJob([
        "/bin/sh",
        "-c",
        `kill -${signal} $$`,
      ]);
      const executor = makeExecutor();
      await executor.execute(claimSpecific(linked.jobId));
      expect(getJob(linked.jobId)?.status).toBe("cancelled");
      expect(getRun(linked.runId)).toMatchObject({
        state: "cancelled",
        attempts: [{ state: "cancelled" }],
      });
    }
  });

  test("retries one linked Run with monotonic attempts", async () => {
    const linked = linkedJob(["/bin/sh", "-c", "exit 3"]);
    const executor = makeExecutor();

    await executor.execute(claimSpecific(linked.jobId));
    expect(retryJob(linked.jobId)).toBe(true);
    await executor.execute(claimSpecific(linked.jobId));

    expect(getJob(linked.jobId)).toMatchObject({
      status: "failed",
      retry_count: 1,
    });
    expect(getRun(linked.runId)).toMatchObject({
      state: "failed",
      attempts: [
        { attemptNo: 1, state: "failed" },
        { attemptNo: 2, state: "failed" },
      ],
    });
    const logPath = getJob(linked.jobId)?.log_path;
    expect(logPath).toBeString();
    await waitFor(
      () =>
        fs
          .readFileSync(logPath!, "utf8")
          .split("\n")
          .filter((line) => line.startsWith("[spawn] ")).length === 2,
    );
  });

  test("waits for linked and unlinked cancellation to terminalize before retry", async () => {
    let releaseGate!: (value: { allowed: boolean; reason: null }) => void;
    const gate = new Promise<{ allowed: boolean; reason: null }>((resolve) => {
      releaseGate = resolve;
    });
    const linked = linkedJob(["/bin/sh", "-c", "exit 0"]);
    const unlinkedJobId = insertJob({
      kind: "shell",
      command: { argv: ["/bin/sh", "-c", "exit 0"] },
      tag: "unlinked-running-cancel",
    });
    const executor = makeExecutor(() => gate);
    const linkedExecution = executor.execute(claimSpecific(linked.jobId));
    const unlinkedExecution = executor.execute(claimSpecific(unlinkedJobId));
    await waitFor(() => executor.activeCount() === 2);

    expect(cancelJob(linked.jobId)).toBe(true);
    expect(
      cancelJobsByFilter({ tag: "unlinked-running-cancel", state: "running" }),
    ).toEqual({ cancelled: [unlinkedJobId], matchedButTerminal: 0 });
    expect(getJob(linked.jobId)?.ended_at).toBeNull();
    expect(getJob(unlinkedJobId)?.ended_at).toBeNull();
    expect(retryJob(linked.jobId)).toBe(false);
    expect(
      retryJobsByFilter({ state: "cancelled" }),
    ).toEqual({ retried: [], matchedButNotRetryable: 2 });

    executor.reapCancelled();
    await Promise.all([linkedExecution, unlinkedExecution]);
    expect(getJob(linked.jobId)?.ended_at).toBeNumber();
    expect(getJob(unlinkedJobId)?.ended_at).toBeNumber();
    expect(getRun(linked.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ attemptNo: 1, state: "cancelled" }],
    });

    expect(retryJob(linked.jobId)).toBe(true);
    expect(
      retryJobsByFilter({ tag: "unlinked-running-cancel", state: "cancelled" }),
    ).toEqual({ retried: [unlinkedJobId], matchedButNotRetryable: 0 });
    releaseGate({ allowed: true, reason: null });
    await executor.execute(claimSpecific(linked.jobId));
    await executor.execute(claimSpecific(unlinkedJobId));
    expect(getRun(linked.runId)).toMatchObject({
      state: "succeeded",
      attempts: [
        { attemptNo: 1, state: "cancelled" },
        { attemptNo: 2, state: "succeeded" },
      ],
    });
    expect(getRun(linked.runId).attempts.some((attempt) => attempt.state === "running")).toBe(false);
  });

  test("stop escalates to SIGKILL and waits for stubborn child finalization", async () => {
    const pidPath = path.join(root.dir, "stubborn.pid");
    const script = [
      'process.on("SIGTERM", () => {});',
      `require("node:fs").writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
      "setInterval(() => {}, 1_000);",
    ].join("");
    const linked = linkedJob([process.execPath, "-e", script]);
    const executor = createJobExecutor(
      { ralphyBin: "ralphy", cwd: root.dir, log: () => {} },
      {
        spendGate: async () => ({ allowed: true, reason: null }),
        terminationGraceMs: 20,
      },
    );
    executors.push(executor);
    const execution = executor.execute(claimSpecific(linked.jobId));
    await waitFor(() => fs.existsSync(pidPath));
    const pid = Number(fs.readFileSync(pidPath, "utf8"));

    await executor.stop();
    const survived = processExists(pid);
    if (survived) process.kill(pid, "SIGKILL");
    await execution;

    expect(survived).toBe(false);
    expect(executor.activeCount()).toBe(0);
    expect(getJob(linked.jobId)).toMatchObject({ status: "cancelled" });
    expect(getRun(linked.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ state: "cancelled" }],
    });
  });

  test("stop waits until a TERM-ignoring descendant process is gone", async () => {
    if (process.platform === "win32") return;
    const pidPath = path.join(root.dir, "process-tree-pids.json");
    const grandchild = [
      'process.on("SIGTERM", () => {});',
      "setInterval(() => {}, 1_000);",
    ].join("");
    const parent = [
      'const { spawn } = require("node:child_process");',
      'const fs = require("node:fs");',
      `const child = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" });`,
      `fs.writeFileSync(${JSON.stringify(pidPath)}, JSON.stringify([process.pid, child.pid]));`,
      'process.on("SIGTERM", () => process.exit(0));',
      "setInterval(() => {}, 1_000);",
    ].join("");
    const linked = linkedJob([process.execPath, "-e", parent]);
    const executor = createJobExecutor(
      { ralphyBin: "ralphy", cwd: root.dir, log: () => {} },
      {
        spendGate: async () => ({ allowed: true, reason: null }),
        terminationGraceMs: 20,
      },
    );
    executors.push(executor);
    const execution = executor.execute(claimSpecific(linked.jobId));
    await waitFor(() => fs.existsSync(pidPath));
    const pids = JSON.parse(fs.readFileSync(pidPath, "utf8")) as number[];

    await executor.stop();
    const survivors = pids.filter(processExists);
    for (const pid of survivors) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The process exited between the probe and cleanup.
      }
    }
    await execution;

    expect(survivors).toEqual([]);
    expect(getJob(linked.jobId)).toMatchObject({ status: "cancelled" });
    expect(getRun(linked.runId)).toMatchObject({
      state: "cancelled",
      attempts: [{ state: "cancelled" }],
    });
  });

  test("leaves a dependency-blocked Run pending until explicit cancellation", () => {
    const dependency = insertJob({
      kind: "shell",
      command: { argv: ["dependency"] },
    });
    const linked = linkedJob(["/bin/sh", "-c", "exit 0"], undefined, [
      dependency,
    ]);
    claimSpecific(dependency);
    finalizeJob(dependency, "failed", { exitCode: 1 });

    expect(claimNextPending()).toBeNull();
    expect(getJob(linked.jobId)?.status).toBe("blocked");
    expect(getRun(linked.runId)).toMatchObject({
      state: "pending",
      attempts: [],
    });
    expect(cancelJob(linked.jobId)).toBe(true);
    expect(getJob(linked.jobId)?.ended_at).toBeNumber();
    expect(getRun(linked.runId).state).toBe("cancelled");
  });

  test("preserves unlinked worker behavior without Run activity", async () => {
    const jobId = insertJob({
      kind: "shell",
      command: { argv: ["/bin/sh", "-c", "exit 0"] },
    });
    const executor = makeExecutor();

    await executor.execute(claimSpecific(jobId));

    expect(getJob(jobId)?.status).toBe("completed");
    expect(scopedActivity()).toEqual([]);
  });

  test("injects one startup credential only for an authenticated requested job scope", async () => {
    const workspace = createWorkspace({
      slug: `credential-${crypto.randomUUID()}`,
      name: "Credential workspace",
    });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const capturePath = path.join(root.dir, "requested-child.json");
    const script = [
      'const fs = require("node:fs");',
      `fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({`,
      "openrouter: process.env.OPENROUTER_API_KEY ?? null,",
      "elevenlabs: process.env.ELEVENLABS_API_KEY ?? null,",
      "arbitrary: process.env.ARBITRARY_PROJECT_SECRET ?? null,",
      "}));",
    ].join("");
    const request = {
      providerId: "openrouter",
      workspaceId: workspace.id,
    };
    const jobId = insertJob({
      run_id: run.id,
      kind: "generate.image",
      command: {
        argv: ["-e", script],
        credential: request,
      },
    });
    const executor = createJobExecutor(
      { ralphyBin: process.execPath, cwd: root.dir, log: () => {} },
      {
        spendGate: async () => ({ allowed: true, reason: null }),
        capturedCredentials: new Map([
          ["openrouter", "task-2b-worker-startup-secret"],
          ["elevenlabs", "task-2b-worker-other-secret"],
        ]),
      },
    );
    executors.push(executor);

    await executor.execute(claimSpecific(jobId));

    expect(JSON.parse(fs.readFileSync(capturePath, "utf8"))).toEqual({
      openrouter: "task-2b-worker-startup-secret",
      elevenlabs: null,
      arbitrary: null,
    });
    const persisted = openDomainDb()
      .query<{ command: string }, [number]>("SELECT command FROM jobs WHERE id = ?")
      .get(jobId)!.command;
    const logs = openDomainDb()
      .query<{ line: string }, [number]>("SELECT line FROM job_logs WHERE job_id = ?")
      .all(jobId)
      .map((row) => row.line)
      .join("\n");
    expect(persisted).not.toContain("task-2b-worker-startup-secret");
    expect(JSON.stringify(request)).not.toContain("task-2b-worker-startup-secret");
    expect(logs).not.toContain("task-2b-worker-startup-secret");
    expect(getJob(jobId)).toMatchObject({ status: "completed" });
  });

  test("an implicit queued video uses the persisted available Fal provider", async () => {
    const workspace = createWorkspace({
      slug: `fal-credential-${crypto.randomUUID()}`,
      name: "Fal credential workspace",
    });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const capturePath = path.join(root.dir, "fal-child.json");
    const script = [
      'const fs = require("node:fs");',
      `fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({`,
      "fal: process.env.FAL_KEY ?? null,",
      "openrouter: process.env.OPENROUTER_API_KEY ?? null,",
      "}));",
    ].join("");
    const jobId = insertJob({
      run_id: run.id,
      kind: "generate.video",
      command: {
        argv: ["-e", script],
        credential: { providerId: "fal", workspaceId: workspace.id },
      },
    });
    const executor = createJobExecutor(
      { ralphyBin: process.execPath, cwd: root.dir, log: () => {} },
      {
        spendGate: async () => ({ allowed: true, reason: null }),
        capturedCredentials: new Map([
          ["fal", "task-2b-worker-fal-secret"],
        ]),
      },
    );
    executors.push(executor);

    await executor.execute(claimSpecific(jobId));

    expect(JSON.parse(fs.readFileSync(capturePath, "utf8"))).toEqual({
      fal: "task-2b-worker-fal-secret",
      openrouter: null,
    });
    expect(getJob(jobId)).toMatchObject({ status: "completed" });
    expect(JSON.stringify(getJob(jobId))).not.toContain(
      "task-2b-worker-fal-secret",
    );
  });

  test("refuses a credential request whose scope does not match its linked Run", async () => {
    const requested = createWorkspace({
      slug: `requested-${crypto.randomUUID()}`,
      name: "Requested",
    });
    const actual = createWorkspace({
      slug: `actual-${crypto.randomUUID()}`,
      name: "Actual",
    });
    const run = startRun({ workspaceId: actual.id, kind: "generation" });
    const capturePath = path.join(root.dir, "cross-scope-child.txt");
    const jobId = insertJob({
      run_id: run.id,
      kind: "generate.image",
      command: {
        argv: [
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(capturePath)}, "spawned")`,
        ],
        credential: {
          providerId: "openrouter",
          workspaceId: requested.id,
        },
      },
    });
    const executor = createJobExecutor(
      { ralphyBin: process.execPath, cwd: root.dir, log: () => {} },
      {
        spendGate: async () => ({ allowed: true, reason: null }),
        capturedCredentials: new Map([
          ["openrouter", "task-2b-cross-scope-secret"],
        ]),
      },
    );
    executors.push(executor);

    await executor.execute(claimSpecific(jobId));

    expect(fs.existsSync(capturePath)).toBe(false);
    expect(getJob(jobId)).toMatchObject({ status: "failed" });
    expect(JSON.stringify(getJob(jobId))).not.toContain("task-2b-cross-scope-secret");
  });
});

function linkedJob(
  argv: string[],
  cwd?: string,
  dependsOn?: number[],
): { jobId: number; runId: string } {
  const workspace = createWorkspace({
    slug: `workspace-${crypto.randomUUID()}`,
    name: "Workspace",
  });
  const run = startRun({ workspaceId: workspace.id, kind: "generation" });
  return {
    runId: run.id,
    jobId: insertJob({
      run_id: run.id,
      kind: "shell",
      command: { argv, ...(cwd === undefined ? {} : { cwd }) },
      depends_on: dependsOn,
    }),
  };
}

function claimSpecific(jobId: number) {
  const job = claimNextPending();
  expect(job?.id).toBe(jobId);
  return job!;
}

function makeExecutor(
  spendGate: (
    job: Parameters<ReturnType<typeof createJobExecutor>["execute"]>[0],
  ) => Promise<{ allowed: boolean; reason: string | null }> = async () => ({
    allowed: true,
    reason: null,
  }),
): JobExecutor {
  const executor = createJobExecutor(
    {
      ralphyBin: "ralphy",
      cwd: root.dir,
      log: () => {},
    },
    { spendGate },
  );
  executors.push(executor);
  return executor;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for worker");
    await Bun.sleep(10);
  }
}

async function settleWithin(
  execution: Promise<void>,
): Promise<
  | { state: "resolved" }
  | { state: "rejected"; error: unknown }
  | { state: "pending" }
> {
  return Promise.race([
    execution.then(
      () => ({ state: "resolved" as const }),
      (error: unknown) => ({ state: "rejected" as const, error }),
    ),
    Bun.sleep(500).then(() => ({ state: "pending" as const })),
  ]);
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
