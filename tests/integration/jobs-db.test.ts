// SQLite jobs store — integration tests against a real DB on disk in
// a tmp dir. Covers insert, claim, dependency gating, cancel, retry,
// cascade-block, log append/tail, counts.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import {
  openDb,
  closeDb,
  dbPath,
  insertJob,
  insertJobsAtomic,
  claimNextPending,
  finalizeJob,
  cancelJob,
  retryJob,
  retryJobsByFilter,
  appendLog,
  tailLogs,
  countByStatus,
  getJob,
  listJobs,
  listArtifacts,
  recordArtifact,
  resumeHeldJob,
  pendingKinds,
} from "../../cli/lib/jobs/db.js";
import {
  closeDomainDb,
  domainDbPath,
} from "../../cli/lib/store/db.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import fs from "node:fs";
import path from "node:path";
import { getRunAggregate as getRun } from "../helpers/run-aggregate.js";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-jobs");
  closeDb();
  closeDomainDb();
  openDb();
});

afterEach(() => {
  closeDb();
  closeDomainDb();
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
    expect(j?.run_id).toBeNull();
  });

  test("stores single and atomic-batch Run links in the sole domain database", () => {
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const firstRun = startRun({
      workspaceId: workspace.id,
      kind: "generation",
    });
    const secondRun = startRun({
      workspaceId: workspace.id,
      kind: "evaluation",
    });
    const thirdRun = startRun({
      workspaceId: workspace.id,
      kind: "render",
    });
    const single = insertJob({
      run_id: firstRun.id,
      kind: "shell",
      command: { argv: ["single"] },
      project_id: "legacy-project-slug",
    });
    const batch = insertJobsAtomic([
      {
        run_id: secondRun.id,
        kind: "shell",
        command: { argv: ["batch-a"] },
      },
      {
        run_id: thirdRun.id,
        kind: "shell",
        command: { argv: ["batch-b"] },
      },
    ]);

    expect(getJob(single)).toMatchObject({
      id: single,
      run_id: firstRun.id,
      project_id: "legacy-project-slug",
    });
    expect(batch.map((id) => getJob(id)?.run_id)).toEqual([
      secondRun.id,
      thirdRun.id,
    ]);
    expect(dbPath()).toBe(domainDbPath());
    expect(fs.existsSync(domainDbPath())).toBe(true);
    expect(fs.existsSync(path.join(tmp.dir, ".ralphy", "jobs.db"))).toBe(false);
  });

  test("rejects competing single and atomic-batch owners for one Run", () => {
    const workspace = createWorkspace({ slug: "owners", name: "Owners" });
    const ownedRun = startRun({ workspaceId: workspace.id, kind: "generation" });
    insertJob({
      run_id: ownedRun.id,
      kind: "shell",
      command: { argv: ["owner"] },
    });

    expect(() =>
      insertJob({
        run_id: ownedRun.id,
        kind: "shell",
        command: { argv: ["competitor"] },
      }),
    ).toThrow();

    const batchRun = startRun({ workspaceId: workspace.id, kind: "generation" });
    expect(() =>
      insertJobsAtomic([
        {
          run_id: batchRun.id,
          kind: "shell",
          command: { argv: ["batch-owner"] },
        },
        {
          run_id: batchRun.id,
          kind: "shell",
          command: { argv: ["batch-competitor"] },
        },
      ]),
    ).toThrow();
    expect(listJobs()).toHaveLength(1);
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

  test("pending linked cancellation terminalizes only an unstarted Run", () => {
    const workspace = createWorkspace({ slug: "linked", name: "Linked" });
    const pendingRun = startRun({
      workspaceId: workspace.id,
      kind: "generation",
    });
    const runningRun = startRun({
      workspaceId: workspace.id,
      kind: "generation",
    });
    const pendingJob = insertJob({
      run_id: pendingRun.id,
      kind: "shell",
      command: { argv: ["pending"] },
    });
    const runningJob = insertJob({
      run_id: runningRun.id,
      kind: "shell",
      command: { argv: ["running"] },
    });
    claimNextPending();
    expect(getJob(pendingJob)?.status).toBe("running");
    expect(cancelJob(pendingJob)).toBe(true);
    expect(getJob(pendingJob)?.ended_at).toBeNull();
    expect(getRun(pendingRun.id).state).toBe("pending");

    expect(cancelJob(runningJob)).toBe(true);
    expect(getJob(runningJob)?.ended_at).toBeNumber();
    expect(getRun(runningRun.id)).toMatchObject({
      state: "cancelled",
      startedAt: null,
    });
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

  test("preserves DB logs across retry and keeps the legacy artifact row shape", () => {
    const id = insertJob({ kind: "shell", command: { argv: ["x"] } });
    appendLog(id, "stdout", "attempt one");
    claimNextPending();
    finalizeJob(id, "failed", { exitCode: 1 });
    expect(retryJob(id)).toBe(true);
    appendLog(id, "stdout", "attempt two");
    recordArtifact(id, "render", "render/final.mp4", 42, "0".repeat(64));

    expect(tailLogs(id).map((row) => row.line)).toEqual([
      "attempt one",
      "attempt two",
    ]);
    const artifact = listArtifacts(id)[0];
    expect(artifact).toEqual({
      id: artifact?.id,
      job_id: id,
      kind: "render",
      path: "render/final.mp4",
      bytes: 42,
      sha256: "0".repeat(64),
    });
    expect(Object.keys(artifact ?? {}).sort()).toEqual([
      "bytes",
      "id",
      "job_id",
      "kind",
      "path",
      "sha256",
    ]);
  });

  test("keeps Job identity, logs, and artifacts append-only in raw SQL", () => {
    const workspace = createWorkspace({ slug: "history", name: "History" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const id = insertJob({
      run_id: run.id,
      kind: "shell",
      command: { argv: ["history"] },
      depends_on: [],
      priority: 7,
      tag: "history",
      project_id: "legacy-project",
    });
    const otherId = insertJob({
      kind: "shell",
      command: { argv: ["other"] },
    });
    appendLog(id, "stdout", "before");
    recordArtifact(id, "render", "render/before.mp4", 6, "a".repeat(64));
    const db = openDb();
    db.exec("PRAGMA recursive_triggers = OFF");

    for (const mutation of [
      "run_id = NULL",
      "kind = 'render'",
      `command = '{"argv":["changed"]}'`,
      "depends_on = '[1]'",
      "priority = 8",
      "created_at = created_at + 1",
      "tag = 'changed'",
      "project_id = 'changed-project'",
      `id = ${id + 10_000}`,
    ]) {
      expect(() =>
        db.prepare(`UPDATE jobs SET ${mutation} WHERE id = ?`).run(id),
      ).toThrow(/immutable/i);
    }
    expect(() => db.prepare("DELETE FROM jobs WHERE id = ?").run(id)).toThrow(
      /append-only|immutable/i,
    );
    expect(() =>
      db
        .prepare(
          `INSERT OR REPLACE INTO jobs
           (id, run_id, kind, status, command, depends_on, priority, created_at, retry_count)
           VALUES (?, NULL, 'shell', 'pending', '{"argv":["replacement"]}', '[]', 0, ?, 0)`,
        )
        .run(otherId, Date.now()),
    ).toThrow(/append-only|immutable/i);
    expect(() =>
      db
        .prepare(
          `INSERT OR REPLACE INTO jobs
           (id, run_id, kind, status, command, depends_on, priority, created_at, retry_count)
           VALUES (?, ?, 'shell', 'pending', '{"argv":["replacement"]}', '[]', 0, ?, 0)`,
        )
        .run(id + 20_000, run.id, Date.now()),
    ).toThrow(/append-only|immutable/i);

    const log = tailLogs(id)[0]!;
    const artifact = listArtifacts(id)[0]!;
    for (const statement of [
      ["UPDATE job_logs SET line = 'changed' WHERE id = ?", log.id],
      ["DELETE FROM job_logs WHERE id = ?", log.id],
      [
        "INSERT OR REPLACE INTO job_logs (id, job_id, ts, stream, line) VALUES (?, ?, 0, 'system', 'replacement')",
        log.id,
        id,
      ],
      ["UPDATE job_artifacts SET path = 'changed' WHERE id = ?", artifact.id],
      ["DELETE FROM job_artifacts WHERE id = ?", artifact.id],
      [
        "INSERT OR REPLACE INTO job_artifacts (id, job_id, kind, path) VALUES (?, ?, 'render', 'replacement')",
        artifact.id,
        id,
      ],
    ] as const) {
      const [sql, ...params] = statement;
      expect(() => db.prepare(sql).run(...params)).toThrow(/append-only/i);
    }

    expect(tailLogs(id).map((row) => row.line)).toEqual(["before"]);
    expect(listArtifacts(id).map((row) => row.path)).toEqual([
      "render/before.mp4",
    ]);
    expect(getJob(id)?.run_id).toBe(run.id);
    expect(getJob(otherId)?.command.argv).toEqual(["other"]);

    expect(claimNextPending()?.id).toBe(id);
    finalizeJob(id, "completed", { exitCode: 0 });
    appendLog(id, "system", "after");
    recordArtifact(id, "preview", "render/after.mp4");
    expect(tailLogs(id).map((row) => row.line)).toEqual(["before", "after"]);
    expect(listArtifacts(id).map((row) => row.path)).toEqual([
      "render/before.mp4",
      "render/after.mp4",
    ]);
  });
});

describe("jobs DB · bulk insert + list + counts", () => {
  test("migration-held jobs stay outside every claim and retry path until post-cutover release", () => {
    const migrationId = "mig_hold_test";
    openDb().prepare(
      "INSERT INTO migration_runs (id, phase, created_at, updated_at) VALUES (?, 'audited', ?, ?)",
    ).run(migrationId, Date.now(), Date.now());
    const [held, release, directRelease] = insertJobsAtomic([
      {
        kind: "generate.video",
        command: { argv: ["held"] },
        tag: "migration-held",
        migration_hold_run_id: migrationId,
      },
      {
        kind: "generate.image",
        command: { argv: ["release"] },
        migration_hold_run_id: migrationId,
      },
      {
        kind: "generate.image",
        command: { argv: ["direct-release"] },
        migration_hold_run_id: migrationId,
      },
    ]);
    openDb().prepare(
      "INSERT INTO migration_runs (id, phase, created_at, updated_at) VALUES ('mig_other', 'audited', ?, ?)",
    ).run(Date.now(), Date.now());
    expect(() =>
      openDb().prepare(
        "UPDATE jobs SET migration_hold_run_id = NULL WHERE id = ?",
      ).run(directRelease!),
    ).toThrow(/cutover|hold/i);
    expect(() =>
      openDb().prepare(
        "UPDATE jobs SET migration_hold_run_id = 'mig_other' WHERE id = ?",
      ).run(directRelease!),
    ).toThrow(/cutover|hold/i);
    const dependent = insertJob({
      kind: "render",
      command: { argv: ["dependent"] },
      depends_on: [held!],
    });
    expect(claimNextPending(["generate.video"])).toBeNull();
    expect(claimNextPending(["render"])).toBeNull();
    expect(pendingKinds()).not.toContain("generate.video");
    expect(resumeHeldJob(release!, migrationId)).toBe(false);

    expect(cancelJob(held!)).toBe(true);
    expect(getJob(held!)?.migration_hold_run_id).toBe(migrationId);
    expect(retryJob(held!)).toBe(false);
    expect(retryJobsByFilter({ tag: "migration-held" })).toEqual({
      retried: [],
      matchedButNotRetryable: 0,
    });
    expect(getJob(held!)?.status).toBe("cancelled");
    expect(getJob(dependent)?.status).toBe("pending");

    const now = Date.now();
    openDb().prepare(
      `UPDATE migration_runs
       SET phase = 'cutover', cutover_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, migrationId);
    openDb().prepare(
      "UPDATE jobs SET migration_hold_run_id = NULL WHERE id = ?",
    ).run(directRelease!);
    expect(getJob(directRelease!)?.migration_hold_run_id).toBeNull();
    expect(resumeHeldJob(release!, "wrong-run")).toBe(false);
    expect(resumeHeldJob(release!, migrationId)).toBe(true);
    expect(claimNextPending(["generate.image"])?.id).toBe(release!);
  });

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
