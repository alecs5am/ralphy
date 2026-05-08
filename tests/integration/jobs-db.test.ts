// SQLite jobs store — integration tests against a real DB on disk in
// a tmp dir. Covers insert, claim, dependency gating, cancel, retry,
// cascade-block, log append/tail, counts.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import {
  openDb,
  closeDb,
  insertJob,
  insertJobsAtomic,
  claimNextPending,
  finalizeJob,
  cancelJob,
  retryJob,
  appendLog,
  tailLogs,
  countByStatus,
  getJob,
  listJobs,
} from "../../cli/lib/jobs/db.js";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-jobs");
  closeDb();
  openDb();
});

afterEach(() => {
  closeDb();
  tmp.cleanup();
});

describe("jobs DB · insert / claim / finalize", () => {
  test("inserts a job with default status pending", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["echo", "hi"] } });
    expect(id).toBeGreaterThan(0);
    const j = getJob(id);
    expect(j?.status).toBe("pending");
    expect(j?.command.argv).toEqual(["echo", "hi"]);
    expect(j?.depends_on).toEqual([]);
    expect(j?.priority).toBe(0);
  });

  test("claim moves first pending to running and skips dependent", () => {
    const idA = insertJob({ kind: "shell", command: { argv: ["echo", "A"] } });
    const idB = insertJob({
      kind: "shell",
      command: { argv: ["echo", "B"] },
      depends_on: [idA],
    });

    const c1 = claimNextPending();
    expect(c1?.id).toBe(idA);
    expect(c1?.status).toBe("running");

    // While A is running B's dep is unmet → no eligible job.
    const c2 = claimNextPending();
    expect(c2).toBeNull();

    // Finalize A; B becomes eligible.
    finalizeJob(idA, "completed", { exitCode: 0 });
    const c3 = claimNextPending();
    expect(c3?.id).toBe(idB);
  });

  test("claim respects priority order", () => {
    const lo = insertJob({ kind: "shell", command: { argv: ["lo"] }, priority: 0 });
    const hi = insertJob({ kind: "shell", command: { argv: ["hi"] }, priority: 10 });
    const c1 = claimNextPending();
    expect(c1?.id).toBe(hi);
    finalizeJob(hi, "completed", { exitCode: 0 });
    const c2 = claimNextPending();
    expect(c2?.id).toBe(lo);
  });

  test("claim is atomic — same job not picked twice", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    const c1 = claimNextPending();
    const c2 = claimNextPending();
    expect(c1?.id).toBe(id);
    expect(c2).toBeNull();
  });
});

describe("jobs DB · cascade-block", () => {
  test("dependent moves to blocked when dep fails", () => {
    const idA = insertJob({ kind: "shell", command: { argv: ["A"] } });
    const idB = insertJob({
      kind: "shell",
      command: { argv: ["B"] },
      depends_on: [idA],
    });
    claimNextPending(); // claim A
    finalizeJob(idA, "failed", { exitCode: 1 });
    // B is still pending — claim should now mark it blocked (not running).
    const c = claimNextPending();
    expect(c).toBeNull();
    expect(getJob(idB)?.status).toBe("blocked");
  });

  test("dependent moves to blocked when dep is cancelled", () => {
    const idA = insertJob({ kind: "shell", command: { argv: ["A"] } });
    const idB = insertJob({
      kind: "shell",
      command: { argv: ["B"] },
      depends_on: [idA],
    });
    cancelJob(idA);
    const c = claimNextPending();
    expect(c).toBeNull();
    expect(getJob(idB)?.status).toBe("blocked");
  });
});

describe("jobs DB · cancel + retry", () => {
  test("cancel pending → cancelled", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    expect(cancelJob(id)).toBe(true);
    expect(getJob(id)?.status).toBe("cancelled");
  });

  test("cancel completed → false (already terminal)", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    claimNextPending();
    finalizeJob(id, "completed", { exitCode: 0 });
    expect(cancelJob(id)).toBe(false);
    expect(getJob(id)?.status).toBe("completed");
  });

  test("retry failed → pending + retry_count++", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    claimNextPending();
    finalizeJob(id, "failed", { exitCode: 1 });
    expect(retryJob(id)).toBe(true);
    const j = getJob(id);
    expect(j?.status).toBe("pending");
    expect(j?.retry_count).toBe(1);
    expect(j?.exit_code).toBeNull();
  });

  test("retry on completed is rejected", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    claimNextPending();
    finalizeJob(id, "completed", { exitCode: 0 });
    expect(retryJob(id)).toBe(false);
  });
});

describe("jobs DB · logs", () => {
  test("append + tail returns rows in id order", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    appendLog(id, "stdout", "line 1");
    appendLog(id, "stderr", "warn 1");
    appendLog(id, "system", "[done]");
    const rows = tailLogs(id);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.line)).toEqual(["line 1", "warn 1", "[done]"]);
    expect(rows.map((r) => r.stream)).toEqual(["stdout", "stderr", "system"]);
  });

  test("tail with sinceId returns only newer rows", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    appendLog(id, "stdout", "a");
    appendLog(id, "stdout", "b");
    const all = tailLogs(id, 0);
    const after = tailLogs(id, all[0].id);
    expect(after.length).toBe(1);
    expect(after[0].line).toBe("b");
  });
});

describe("jobs DB · bulk insert + list + counts", () => {
  test("insertJobsAtomic inserts all-or-nothing", () => {
    const ids = insertJobsAtomic([
      { kind: "shell", command: { argv: ["a"] } },
      { kind: "shell", command: { argv: ["b"] } },
      { kind: "shell", command: { argv: ["c"] } },
    ]);
    expect(ids.length).toBe(3);
    expect(listJobs().length).toBe(3);
  });

  test("countByStatus returns zero-filled snapshot", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] } });
    const b = insertJob({ kind: "shell", command: { argv: ["b"] } });
    claimNextPending();
    finalizeJob(a, "completed", { exitCode: 0 });
    const counts = countByStatus();
    expect(counts.completed).toBe(1);
    expect(counts.pending).toBe(1);
    expect(counts.running).toBe(0);
    expect(counts.failed).toBe(0);
    expect(counts.cancelled).toBe(0);
    expect(counts.blocked).toBe(0);
    void b;
  });

  test("listJobs filters by status array", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] } });
    const b = insertJob({ kind: "shell", command: { argv: ["b"] } });
    claimNextPending();
    finalizeJob(a, "completed", { exitCode: 0 });
    const pending = listJobs({ status: "pending" });
    expect(pending.map((r) => r.id)).toEqual([b]);
    const both = listJobs({ status: ["pending", "completed"] });
    expect(both.length).toBe(2);
  });

  test("listJobs filters by tag and project", () => {
    insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "batch-1" });
    insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "batch-2" });
    insertJob({
      kind: "shell",
      command: { argv: ["c"] },
      project_id: "spring-001",
    });
    expect(listJobs({ tag: "batch-1" }).length).toBe(1);
    expect(listJobs({ projectId: "spring-001" }).length).toBe(1);
  });
});
