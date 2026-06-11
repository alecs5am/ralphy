// Integration tests for issue #027 — bulk filter cancel/retry + daemon-idle
// detection. Uses a tmp jobs DB via makeTmpRoot() so we don't touch the real
// workspace.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import {
  openDb,
  closeDb,
  insertJob,
  claimNextPending,
  finalizeJob,
  getJob,
  listJobs,
  cancelJobsByFilter,
  retryJobsByFilter,
  countByStatus,
} from "../../cli/lib/jobs/db.js";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-queue-filter");
  closeDb();
  openDb();
});

afterEach(() => {
  closeDb();
  tmp.cleanup();
});

describe("cancelJobsByFilter · filter discipline", () => {
  test("requires at least one of tag / state — refuses empty filter", () => {
    insertJob({ kind: "shell", command: { argv: ["a"] } });
    expect(() => cancelJobsByFilter({})).toThrow(/at least one of/i);
  });

  test("cancels by tag — only matching tag is touched", () => {
    insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "batch-A" });
    insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "batch-A" });
    insertJob({ kind: "shell", command: { argv: ["c"] }, tag: "batch-B" });
    const r = cancelJobsByFilter({ tag: "batch-A" });
    expect(r.cancelled.length).toBe(2);
    expect(r.matchedButTerminal).toBe(0);
    expect(listJobs({ tag: "batch-A" }).every((j) => j.status === "cancelled")).toBe(true);
    expect(listJobs({ tag: "batch-B" }).every((j) => j.status === "pending")).toBe(true);
  });

  test("cancels by --state pending only — running / completed untouched", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "x" });
    const b = insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "x" });
    const c = insertJob({ kind: "shell", command: { argv: ["c"] }, tag: "x" });
    claimNextPending(); // a → running
    finalizeJob(a, "completed", { exitCode: 0 });
    // b → claim → leave running
    claimNextPending();
    // c stays pending
    const r = cancelJobsByFilter({ tag: "x", state: "pending" });
    expect(r.cancelled).toEqual([c]);
    expect(getJob(a)?.status).toBe("completed");
    expect(getJob(b)?.status).toBe("running");
    expect(getJob(c)?.status).toBe("cancelled");
  });

  test("append-only: cancelled rows are NOT deleted, just flipped", () => {
    insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "t" });
    insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "t" });
    const before = listJobs().length;
    cancelJobsByFilter({ tag: "t" });
    const after = listJobs().length;
    expect(after).toBe(before);
    expect(listJobs({ status: "cancelled" }).length).toBe(2);
  });

  test("matchedButTerminal counts completed rows skipped by cancel", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "t" });
    insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "t" });
    claimNextPending();
    finalizeJob(a, "completed", { exitCode: 0 });
    const r = cancelJobsByFilter({ tag: "t" });
    expect(r.cancelled.length).toBe(1);
    expect(r.matchedButTerminal).toBe(1);
  });
});

describe("retryJobsByFilter · filter discipline", () => {
  test("requires at least one of tag / state", () => {
    expect(() => retryJobsByFilter({})).toThrow(/at least one of/i);
  });

  test("retries only failed when --state failed", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "t" });
    const b = insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "t" });
    const c = insertJob({ kind: "shell", command: { argv: ["c"] }, tag: "t" });
    claimNextPending();
    finalizeJob(a, "failed", { exitCode: 1 });
    claimNextPending();
    finalizeJob(b, "completed", { exitCode: 0 });
    // c stays pending
    const r = retryJobsByFilter({ tag: "t", state: "failed" });
    expect(r.retried).toEqual([a]);
    const aRow = getJob(a);
    expect(aRow?.status).toBe("pending");
    expect(aRow?.retry_count).toBe(1);
    expect(getJob(b)?.status).toBe("completed");
    expect(getJob(c)?.status).toBe("pending");
  });

  test("combined --tag + --state filters AND together", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "A" });
    const b = insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "B" });
    claimNextPending();
    finalizeJob(a, "failed", { exitCode: 1 });
    claimNextPending();
    finalizeJob(b, "failed", { exitCode: 1 });
    const r = retryJobsByFilter({ tag: "A", state: "failed" });
    expect(r.retried).toEqual([a]);
    expect(getJob(b)?.status).toBe("failed");
  });

  test("matchedButNotRetryable for pending rows matching tag-only filter", () => {
    insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "t" });
    insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "t" });
    const r = retryJobsByFilter({ tag: "t" });
    expect(r.retried.length).toBe(0);
    expect(r.matchedButNotRetryable).toBe(2);
  });

  test("accepts state array (comma-OR semantics from CLI parser)", () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "t" });
    const b = insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "t" });
    claimNextPending();
    finalizeJob(a, "failed", { exitCode: 1 });
    claimNextPending();
    finalizeJob(b, "cancelled", { exitCode: null });
    const r = retryJobsByFilter({ tag: "t", state: ["failed", "cancelled"] });
    expect(r.retried.sort()).toEqual([a, b].sort());
  });
});

describe("queue CLI · cancel / retry filter mode (subprocess smoke)", () => {
  test("`queue cancel --tag X --state pending` bulk-cancels via CLI", async () => {
    insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "bulk-001" });
    insertJob({ kind: "shell", command: { argv: ["b"] }, tag: "bulk-001" });
    insertJob({ kind: "shell", command: { argv: ["c"] }, tag: "other" });
    closeDb();

    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        process.cwd() + "/cli/index.ts",
        "--cwd",
        tmp.dir,
        "--json",
        "queue",
        "cancel",
        "--tag",
        "bulk-001",
        "--state",
        "pending",
      ],
      cwd: tmp.dir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.cancelled_count).toBe(2);
    expect(parsed.filter.tag).toBe("bulk-001");
    expect(parsed.filter.state).toEqual(["pending"]);
  });

  test("`queue retry --tag X --state failed` re-enqueues via CLI", async () => {
    const a = insertJob({ kind: "shell", command: { argv: ["a"] }, tag: "rt-001" });
    claimNextPending();
    finalizeJob(a, "failed", { exitCode: 1 });
    closeDb();

    // Pre-write a dummy pidfile so ensureDaemonRunning thinks the daemon is
    // already up — we don't want the test to actually spawn one.
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.writeFileSync(path.join(tmp.dir, ".ralphy", "daemon.pid"), String(process.pid));

    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        process.cwd() + "/cli/index.ts",
        "--cwd",
        tmp.dir,
        "--json",
        "queue",
        "retry",
        "--tag",
        "rt-001",
        "--state",
        "failed",
      ],
      cwd: tmp.dir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(stdout);
    expect(parsed.retried_count).toBe(1);
    expect(parsed.filter.tag).toBe("rt-001");
  });

  test("`queue retry` with no <id> and no filters errors out", async () => {
    closeDb();
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        process.cwd() + "/cli/index.ts",
        "--cwd",
        tmp.dir,
        "queue",
        "retry",
      ],
      cwd: tmp.dir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    expect(proc.exitCode).not.toBe(0);
  });
});

describe("daemon status · idle-with-pending detection", () => {
  test("countByStatus reports pending > 0 / running === 0 (the trigger condition)", () => {
    insertJob({ kind: "shell", command: { argv: ["x"] } });
    insertJob({ kind: "shell", command: { argv: ["y"] } });
    const c = countByStatus();
    expect(c.pending).toBe(2);
    expect(c.running).toBe(0);
    // The CLI layer translates this combo into the exit-2 + stderr warning;
    // here we just verify the data shape that drives it.
  });

  test("`daemon status` CLI emits warning + exits 2 when pending && running===0", async () => {
    insertJob({ kind: "shell", command: { argv: ["x"] } });
    closeDb();
    const proc = Bun.spawn({
      cmd: [
        "bun",
        "run",
        process.cwd() + "/cli/index.ts",
        "--cwd",
        tmp.dir,
        "--json",
        "daemon",
        "status",
      ],
      cwd: tmp.dir,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;
    expect(proc.exitCode).toBe(2);
    expect(stderr).toMatch(/daemon idle/i);
    const parsed = JSON.parse(stdout);
    expect(parsed.idle).toBe(true);
    expect(parsed.warning).toMatch(/daemon idle/i);
  });
});
