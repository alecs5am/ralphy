import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  cancelJob,
  claimNextPending,
  closeDb,
  finalizeJob,
  getJob,
  insertJob,
  retryJob,
} from "../../cli/lib/jobs/db.js";
import {
  createJobExecutor,
  type JobExecutor,
} from "../../cli/lib/jobs/worker.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { getRun, startRun } from "../../cli/lib/store/runs.js";
import {
  createWorkspace,
  listActivity,
} from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

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
        listActivity()
          .filter(
            (event) =>
              event.entityType === "run_attempt" &&
              event.payload &&
              typeof event.payload === "object" &&
              !Array.isArray(event.payload) &&
              event.payload.runId === linked.runId &&
              event.action === "run.attempt_finished",
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
    expect(listActivity()).toEqual([]);
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
