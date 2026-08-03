import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  finishRun,
  finishRunInTransaction,
  finishRunAttempt,
  promoteRunObject,
  recordRunObject,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import { getRunAggregate as getRun } from "../helpers/run-aggregate.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";

let root: TmpRoot | null = null;

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = null;
});

describe("domain Run store", () => {
  test("keeps succeeded Runs final and preserves ordinary cancelled retries", () => {
    root = makeTmpRoot("ralphy-domain-runs-terminal-retry");
    const workspace = createWorkspace({ slug: "lifecycle", name: "Lifecycle" });
    const succeeded = startRun({
      workspaceId: workspace.id,
      kind: "generation",
    });
    const succeededAttempt = startRunAttempt({ runId: succeeded.id });
    finishRunAttempt(succeededAttempt.id, { state: "succeeded" });
    finishRun(succeeded.id, { state: "succeeded" });
    const activityCount = scopedActivity({ workspaceId: workspace.id }).length;

    expect(() => startRunAttempt({ runId: succeeded.id })).toThrow(
      StoreConflictError,
    );
    expect(getRun(succeeded.id)).toMatchObject({
      state: "succeeded",
      attempts: [{ id: succeededAttempt.id, attemptNo: 1 }],
    });
    expect(scopedActivity({ workspaceId: workspace.id })).toHaveLength(
      activityCount,
    );

    const cancelled = startRun({
      workspaceId: workspace.id,
      kind: "generation",
    });
    const firstAttempt = startRunAttempt({ runId: cancelled.id });
    finishRunAttempt(firstAttempt.id, { state: "cancelled" });
    finishRun(cancelled.id, { state: "cancelled" });
    const firstStartedAt = getRun(cancelled.id).startedAt;
    const retry = startRunAttempt({ runId: cancelled.id });
    expect(retry.attemptNo).toBe(2);
    expect(getRun(cancelled.id)).toMatchObject({
      state: "running",
      startedAt: firstStartedAt,
      endedAt: null,
      error: null,
    });
  });

  test("refuses public and in-transaction finish while an Attempt is running", () => {
    root = makeTmpRoot("ralphy-domain-runs-running-attempt");
    const workspace = createWorkspace({ slug: "running", name: "Running" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const attempt = startRunAttempt({ runId: run.id });
    const activityCount = scopedActivity({ workspaceId: workspace.id }).length;

    expect(() => finishRun(run.id, { state: "succeeded" })).toThrow(
      StoreConflictError,
    );
    expect(getRun(run.id)).toMatchObject({
      state: "running",
      endedAt: null,
      attempts: [{ id: attempt.id, state: "running", endedAt: null }],
    });
    expect(scopedActivity({ workspaceId: workspace.id })).toHaveLength(
      activityCount,
    );

    const transactionRun = startRun({
      workspaceId: workspace.id,
      kind: "publication",
    });
    const transactionAttempt = startRunAttempt({ runId: transactionRun.id });
    const transactionActivityCount = scopedActivity({
      workspaceId: workspace.id,
    }).length;
    expect(() =>
      finishRunInTransaction(openDomainDb(), transactionRun.id, {
        state: "failed",
      }),
    ).toThrow(StoreConflictError);
    expect(getRun(transactionRun.id)).toMatchObject({
      state: "running",
      endedAt: null,
      attempts: [{ id: transactionAttempt.id, state: "running" }],
    });
    expect(scopedActivity({ workspaceId: workspace.id })).toHaveLength(
      transactionActivityCount,
    );
  });

  test("guards Run lifecycle timestamps against direct SQL", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-timestamps");
    const workspace = createWorkspace({ slug: "sql-time", name: "SQL Time" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const db = openDomainDb();

    expect(() =>
      db.prepare("UPDATE runs SET state = 'running' WHERE id = ?").run(run.id),
    ).toThrow(/Run lifecycle/i);
    expect(getRun(run.id)).toMatchObject({
      state: "pending",
      startedAt: null,
      endedAt: null,
    });

    const startedAt = Date.now();
    db.prepare(
      "UPDATE runs SET state = 'running', started_at = ? WHERE id = ?",
    ).run(startedAt, run.id);
    db.prepare(
      "UPDATE runs SET state = 'cancelled', ended_at = ? WHERE id = ?",
    ).run(startedAt, run.id);
    expect(getRun(run.id)).toMatchObject({
      state: "cancelled",
      startedAt,
      endedAt: startedAt,
    });
  });

  test("keeps Run creation identity immutable across lifecycle updates", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-created-at");
    const workspace = createWorkspace({ slug: "sql-created", name: "SQL Created" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const db = openDomainDb();

    expect(() =>
      db
        .prepare(
          "UPDATE runs SET created_at = ?, state = 'running', started_at = ? WHERE id = ?",
        )
        .run(run.createdAt + 1_000, run.createdAt, run.id),
    ).toThrow(/Run (?:identity|lifecycle)/i);
    expect(
      db
        .query<
          { state: string; createdAt: number; startedAt: number | null },
          [string]
        >(
          "SELECT state, created_at AS createdAt, started_at AS startedAt FROM runs WHERE id = ?",
        )
        .get(run.id),
    ).toEqual({ state: "pending", createdAt: run.createdAt, startedAt: null });
  });

  test("rejects non-safe timestamps in every Run lifecycle transition", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-timestamp-shape");
    const workspace = createWorkspace({ slug: "sql-shape", name: "SQL Shape" });
    const db = openDomainDb();
    const invalidTimestamps = ["not-a-timestamp", -1, Number.MAX_SAFE_INTEGER + 1];

    for (const [index, timestamp] of invalidTimestamps.entries()) {
      const pending = startRun({
        workspaceId: workspace.id,
        kind: `pending-running-${index}`,
      });
      expect(() =>
        db
          .prepare(
            "UPDATE runs SET state = 'running', started_at = ? WHERE id = ?",
          )
          .run(timestamp, pending.id),
      ).toThrow(/Run lifecycle/i);
      expect(
        db.query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?").get(
          pending.id,
        ),
      ).toEqual({ state: "pending" });

      const pendingTerminal = startRun({
        workspaceId: workspace.id,
        kind: `pending-terminal-${index}`,
      });
      expect(() =>
        db
          .prepare(
            "UPDATE runs SET state = 'failed', ended_at = ? WHERE id = ?",
          )
          .run(timestamp, pendingTerminal.id),
      ).toThrow(/Run lifecycle/i);
      expect(
        db.query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?").get(
          pendingTerminal.id,
        ),
      ).toEqual({ state: "pending" });

      const running = startRun({
        workspaceId: workspace.id,
        kind: `running-terminal-${index}`,
      });
      const attempt = startRunAttempt({ runId: running.id });
      finishRunAttempt(attempt.id, { state: "failed" });
      expect(() =>
        db
          .prepare(
            "UPDATE runs SET state = 'failed', ended_at = ? WHERE id = ?",
          )
          .run(timestamp, running.id),
      ).toThrow(/Run lifecycle/i);
      expect(
        db.query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?").get(
          running.id,
        ),
      ).toEqual({ state: "running" });

      const retry = startRun({
        workspaceId: workspace.id,
        kind: `terminal-running-${index}`,
      });
      finishRun(retry.id, { state: "failed" });
      expect(() =>
        db
          .prepare(
            `UPDATE runs SET state = 'running', started_at = ?,
             ended_at = NULL, error = NULL WHERE id = ?`,
          )
          .run(timestamp, retry.id),
      ).toThrow(/Run lifecycle/i);
      expect(
        db.query<{ state: string }, [string]>("SELECT state FROM runs WHERE id = ?").get(
          retry.id,
        ),
      ).toEqual({ state: "failed" });
    }
  });

  test("rejects non-canonical Run lifecycle facts at insert", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-insert-lifecycle");
    const workspace = createWorkspace({ slug: "sql-new-run", name: "SQL New Run" });
    const db = openDomainDb();
    const now = Date.now();
    const invalidRows: Array<{
      id: string;
      state: "pending" | "running" | "succeeded";
      createdAt: string | number;
      startedAt: string | number | null;
      endedAt: string | number | null;
      error: string | null;
    }> = [
      {
        id: "run_created_text",
        state: "pending",
        createdAt: "not-a-timestamp",
        startedAt: null,
        endedAt: null,
        error: null,
      },
      {
        id: "run_created_fractional",
        state: "pending",
        createdAt: now + 0.5,
        startedAt: null,
        endedAt: null,
        error: null,
      },
      {
        id: "run_created_negative",
        state: "pending",
        createdAt: -1,
        startedAt: null,
        endedAt: null,
        error: null,
      },
      {
        id: "run_created_unsafe",
        state: "pending",
        createdAt: Number.MAX_SAFE_INTEGER + 1,
        startedAt: null,
        endedAt: null,
        error: null,
      },
      {
        id: "run_initial_running",
        state: "running",
        createdAt: now,
        startedAt: null,
        endedAt: null,
        error: null,
      },
      {
        id: "run_initial_terminal",
        state: "succeeded",
        createdAt: now,
        startedAt: null,
        endedAt: null,
        error: null,
      },
      {
        id: "run_initial_started",
        state: "pending",
        createdAt: now,
        startedAt: now,
        endedAt: null,
        error: null,
      },
      {
        id: "run_initial_ended",
        state: "pending",
        createdAt: now,
        startedAt: null,
        endedAt: now,
        error: null,
      },
      {
        id: "run_initial_error",
        state: "pending",
        createdAt: now,
        startedAt: null,
        endedAt: null,
        error: "not pending",
      },
    ];

    for (const row of invalidRows) {
      expect(() =>
        db
          .prepare(
            `INSERT INTO runs
             (id, workspace_id, kind, state, created_at, started_at, ended_at, error)
             VALUES (?, ?, 'fixture', ?, ?, ?, ?, ?)`,
          )
          .run(
            row.id,
            workspace.id,
            row.state,
            row.createdAt,
            row.startedAt,
            row.endedAt,
            row.error,
          ),
      ).toThrow(/Run lifecycle/i);
      expect(
        db.query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM runs WHERE id = ?",
        ).get(row.id),
      ).toEqual({ count: 0 });
    }
  });

  test("rejects UPDATE OR REPLACE rekeying over a terminal Run", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-update-replace");
    const workspace = createWorkspace({ slug: "sql-update", name: "SQL Update" });
    const terminal = startRun({ workspaceId: workspace.id, kind: "terminal" });
    finishRun(terminal.id, { state: "succeeded" });
    const pending = startRun({ workspaceId: workspace.id, kind: "pending" });
    const db = openDomainDb();

    expect(
      db
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM run_attempts WHERE run_id = ?",
        )
        .get(terminal.id),
    ).toEqual({ count: 0 });
    expect(() =>
      db
        .prepare(
          `UPDATE OR REPLACE runs SET id = ?, state = 'running', started_at = ?,
           ended_at = NULL, error = NULL WHERE id = ?`,
        )
        .run(terminal.id, Date.now(), pending.id),
    ).toThrow(/Run (?:identity|conflict|immutable)/i);
    expect(
      db
        .query<{ id: string; kind: string; state: string }, [string, string]>(
          "SELECT id, kind, state FROM runs WHERE id IN (?, ?) ORDER BY kind",
        )
        .all(pending.id, terminal.id),
    ).toEqual([
      { id: pending.id, kind: "pending", state: "pending" },
      { id: terminal.id, kind: "terminal", state: "succeeded" },
    ]);
  });

  test("rejects INSERT OR REPLACE over an existing terminal Run", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-insert-replace");
    const workspace = createWorkspace({ slug: "sql-insert", name: "SQL Insert" });
    const run = startRun({ workspaceId: workspace.id, kind: "original" });
    finishRun(run.id, { state: "succeeded" });
    const db = openDomainDb();

    expect(
      db.query<{ recursive_triggers: number }, []>("PRAGMA recursive_triggers").get(),
    ).toEqual({ recursive_triggers: 0 });
    expect(
      db
        .query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM run_attempts WHERE run_id = ?",
        )
        .get(run.id),
    ).toEqual({ count: 0 });
    expect(() =>
      db
        .prepare(
          `INSERT OR REPLACE INTO runs
           (id, workspace_id, kind, state, created_at)
           VALUES (?, ?, 'replacement', 'pending', ?)`,
        )
        .run(run.id, workspace.id, run.createdAt),
    ).toThrow(/Run (?:identity|conflict|immutable)/i);
    expect(
      db
        .query<{ kind: string; state: string; endedAt: number | null }, [string]>(
          "SELECT kind, state, ended_at AS endedAt FROM runs WHERE id = ?",
        )
        .get(run.id),
    ).toEqual({ kind: "original", state: "succeeded", endedAt: expect.any(Number) });
  });

  test("guards direct SQL terminalization while an Attempt is running", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-attempt");
    const workspace = createWorkspace({ slug: "sql-attempt", name: "SQL Attempt" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const attempt = startRunAttempt({ runId: run.id });

    expect(() =>
      openDomainDb()
        .prepare("UPDATE runs SET state = 'succeeded', ended_at = ? WHERE id = ?")
        .run(Date.now(), run.id),
    ).toThrow(/Run lifecycle/i);
    expect(getRun(run.id)).toMatchObject({
      state: "running",
      endedAt: null,
      attempts: [{ id: attempt.id, state: "running" }],
    });
  });

  test("guards succeeded Run state against direct SQL mutation", () => {
    root = makeTmpRoot("ralphy-domain-runs-sql-succeeded");
    const workspace = createWorkspace({ slug: "sql-done", name: "SQL Done" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const attempt = startRunAttempt({ runId: run.id });
    finishRunAttempt(attempt.id, { state: "succeeded" });
    finishRun(run.id, { state: "succeeded" });

    expect(() =>
      openDomainDb()
        .prepare("UPDATE runs SET state = 'failed', error = 'rewritten' WHERE id = ?")
        .run(run.id),
    ).toThrow(/Run lifecycle/i);
    expect(getRun(run.id)).toMatchObject({ state: "succeeded", error: null });
  });

  test("keeps failed execution evidence in one ordered Run aggregate", () => {
    root = makeTmpRoot("ralphy-domain-runs-red");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const run = startRun({
      projectId: project.id,
      kind: "generation",
      label: "scene-01",
    });
    const attempt = startRunAttempt({
      runId: run.id,
      provider: "fixture",
      model: "fixture/model",
    });
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/run/output.bin",
      purpose: "provider-response",
      state: "diagnostic",
      retention: "keep-on-failure",
      bytes: 4,
      sha256:
        "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
    });

    const failedAttempt = finishRunAttempt(attempt.id, {
      state: "failed",
      response: { z: 2, a: 1 },
      costUsd: 1.25,
      error: "fixture failure",
    });
    finishRun(run.id, { state: "failed", error: "fixture failure" });

    expect(failedAttempt).toMatchObject({
      costUsd: 1.25,
      state: "failed",
    });
    expect(failedAttempt).not.toHaveProperty("response");
    expect(failedAttempt).not.toHaveProperty("error");
    expect(getRun(run.id).attempts[0]).toMatchObject({
      response: { a: 1, z: 2 },
      error: "fixture failure",
    });
    const firstStartedAt = getRun(run.id).startedAt;
    const retry = startRunAttempt({
      runId: run.id,
      provider: "fixture",
      model: "fixture/retry",
      request: { prompt: "retry" },
    });
    expect(() =>
      startRunAttempt({ runId: run.id, provider: "fixture" }),
    ).toThrow(/already running/i);
    expect(getRun(run.id)).toMatchObject({
      state: "running",
      startedAt: firstStartedAt,
      endedAt: null,
      error: null,
    });
    finishRunAttempt(retry.id, { state: "succeeded", costUsd: 0 });
    finishRun(run.id, { state: "succeeded" });

    expect(getRun(run.id)).toMatchObject({
      id: run.id,
      state: "succeeded",
      attempts: [
        { id: attempt.id, attemptNo: 1, state: "failed" },
        { id: retry.id, attemptNo: 2, state: "succeeded" },
      ],
      objects: [{ id: runObject.id }],
    });
    expect(() =>
      finishRunAttempt(retry.id, { state: "failed" }),
    ).toThrow(StoreConflictError);
    expect(() => finishRun(run.id, { state: "failed" })).toThrow(
      StoreConflictError,
    );
    expect(
      scopedActivity({ projectId: project.id })
        .filter((event) => event.entityType.startsWith("run"))
        .map((event) => event.action),
    ).toEqual([
      "run.created",
      "run.attempt_started",
      "run.object_recorded",
      "run.attempt_finished",
      "run.finished",
      "run.attempt_started",
      "run.attempt_finished",
      "run.finished",
    ]);
  });

  test("enforces Run and active Agent Session ownership", () => {
    root = makeTmpRoot("ralphy-domain-runs-scope");
    const workspace = createWorkspace({ slug: "one", name: "One" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "one-project",
      name: "One Project",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outside = createWorkspace({ slug: "outside", name: "Outside" });
    const outsideProject = createProject({
      workspaceId: outside.id,
      slug: "outside-project",
      name: "Outside Project",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "codex",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "codex",
    });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "codex",
    });
    const outsideSession = startAgentSession({
      workspaceId: outside.id,
      projectId: outsideProject.id,
      agent: "codex",
    });

    const workspaceGeneration = startRun({
      projectId: project.id,
      agentSessionId: workspaceSession.id,
      kind: "generation",
    });
    expect(workspaceGeneration).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
    });
    expect(
      startRun({
        projectId: project.id,
        agentSessionId: projectSession.id,
        kind: "generation",
      }),
    ).toMatchObject({ workspaceId: workspace.id, projectId: project.id });
    const workspaceEvaluation = startRun({
      workspaceId: workspace.id,
      agentSessionId: workspaceSession.id,
      kind: "evaluation",
    });
    expect(workspaceEvaluation).toMatchObject({
      workspaceId: workspace.id,
      projectId: null,
    });
    expect(startRun({ kind: "migration" })).toMatchObject({
      workspaceId: null,
      projectId: null,
    });

    expect(() =>
      startRun({
        workspaceId: outside.id,
        projectId: project.id,
        kind: "generation",
      }),
    ).toThrow(/Workspace.*Project/i);
    expect(() => startRun({ kind: "generation" })).toThrow(/migration/i);
    expect(() =>
      startRun({
        workspaceId: workspace.id,
        agentSessionId: projectSession.id,
        kind: "evaluation",
      }),
    ).toThrow(/Session.*scope/i);
    for (const session of [siblingSession, outsideSession]) {
      expect(() =>
        startRun({
          projectId: project.id,
          agentSessionId: session.id,
          kind: "generation",
        }),
      ).toThrow(/Session.*scope/i);
    }
    expect(() =>
      startRun({
        kind: "migration",
        agentSessionId: workspaceSession.id,
      }),
    ).toThrow(/migration.*Session|Session.*scope/i);
    expect(() => endAgentSession(workspaceSession.id)).toThrow(/active Run/i);
    finishRun(workspaceGeneration.id, { state: "cancelled" });
    finishRun(workspaceEvaluation.id, { state: "cancelled" });
    endAgentSession(workspaceSession.id);
    expect(() =>
      startRun({
        workspaceId: workspace.id,
        agentSessionId: workspaceSession.id,
        kind: "evaluation",
      }),
    ).toThrow(/Session.*ended/i);
  });

  test("validates JSON and costs and rolls back when activity append fails", () => {
    root = makeTmpRoot("ralphy-domain-runs-validation");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });

    expect(() =>
      startRun({
        projectId: project.id,
        kind: "generation",
        metadata: { invalid: Number.NaN },
      }),
    ).toThrow(/metadata.*finite/i);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      startRun({
        projectId: project.id,
        kind: "generation",
        metadata: cyclic as never,
      }),
    ).toThrow(/metadata.*cycle/i);

    const run = startRun({ projectId: project.id, kind: "generation" });
    expect(() =>
      startRunAttempt({
        runId: run.id,
        request: { payload: "data:text/plain;base64,Zm9yYmlkZGVu" },
      }),
    ).toThrow(/request.*data URL/i);
    const attempt = startRunAttempt({ runId: run.id, provider: "local" });
    expect(() =>
      finishRunAttempt(attempt.id, { state: "failed", costUsd: -1 }),
    ).toThrow(/cost/i);
    expect(() =>
      finishRunAttempt(attempt.id, {
        state: "failed",
        response: { invalid: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(/response.*finite/i);

    openDomainDb().exec(`
      CREATE TRIGGER reject_attempt_finish_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'run.attempt_finished'
      BEGIN
        SELECT RAISE(ABORT, 'fixture activity rejection');
      END;
    `);
    expect(() =>
      finishRunAttempt(attempt.id, { state: "failed", error: "boom" }),
    ).toThrow(/fixture activity rejection/i);
    expect(getRun(run.id).attempts[0]).toMatchObject({
      state: "running",
      endedAt: null,
      error: null,
    });
  });

  test("records absent forensic paths but rejects unsafe RunObject facts", () => {
    root = makeTmpRoot("ralphy-domain-run-objects-validation");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const run = startRun({ workspaceId: workspace.id, kind: "evaluation" });
    const valid = {
      runId: run.id,
      path: "tmp/missing/evidence.json",
      purpose: "provider-response",
      state: "diagnostic",
      retention: "keep-on-failure",
    };

    expect(recordRunObject(valid)).toMatchObject({
      bytes: null,
      mime: null,
      objectId: null,
    });
    for (const locator of [
      "",
      "/tmp/output.bin",
      "C:/tmp/output.bin",
      "C:\\tmp\\output.bin",
      "tmp/../secret.bin",
      "data:text/plain;base64,eA==",
      "https://example.com/output.bin",
    ]) {
      expect(() => recordRunObject({ ...valid, path: locator })).toThrow(
        /path/i,
      );
    }
    for (const bytes of [-1, 1.5, Number.NaN]) {
      expect(() => recordRunObject({ ...valid, bytes })).toThrow(/bytes/i);
    }
    for (const sha256 of ["short", "A".repeat(64), "g".repeat(64)]) {
      expect(() => recordRunObject({ ...valid, sha256 })).toThrow(/SHA-256/i);
    }
  });

  test("promotes Project, shared, and explicitly scoped migration evidence by move", async () => {
    root = makeTmpRoot("ralphy-domain-run-objects-promotion");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const projectRun = startRun({ projectId: project.id, kind: "generation" });
    const workspaceRun = startRun({
      workspaceId: workspace.id,
      kind: "evaluation",
    });
    const migrationRun = startRun({ kind: "migration" });

    const projectPath = writeRunFile("project/output.bin", "project");
    const workspacePath = writeRunFile("workspace/output.bin", "workspace");
    const migrationPath = writeRunFile("migration/output.bin", "migration");
    const projectObject = recordRunObject({
      runId: projectRun.id,
      path: "tmp/project/output.bin",
      purpose: "output",
      state: "working",
      retention: "keep",
      bytes: 7,
      sha256: sha256("project"),
    });
    const workspaceObject = recordRunObject({
      runId: workspaceRun.id,
      path: "tmp/workspace/output.bin",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
    });
    const migrationObject = recordRunObject({
      runId: migrationRun.id,
      path: "tmp/migration/output.bin",
      purpose: "legacy-import",
      state: "working",
      retention: "keep",
    });

    const promotedProject = await promoteRunObject({
      runObjectId: projectObject.id,
      mime: "application/octet-stream",
      storageClass: "working",
    });
    const promotedWorkspace = await promoteRunObject({
      runObjectId: workspaceObject.id,
      mime: "application/octet-stream",
      storageClass: "diagnostic",
      originalName: "workspace.dat",
    });
    await expect(
      promoteRunObject({
        runObjectId: migrationObject.id,
        mime: "application/octet-stream",
        storageClass: "durable",
      }),
    ).rejects.toThrow(/destination scope/i);
    const promotedMigration = await promoteRunObject({
      runObjectId: migrationObject.id,
      mime: "application/octet-stream",
      storageClass: "durable",
      destinationScope: { workspaceId: workspace.id, projectId: project.id },
    });

    expect(fs.existsSync(projectPath)).toBe(false);
    expect(fs.existsSync(workspacePath)).toBe(false);
    expect(fs.existsSync(migrationPath)).toBe(false);
    expect(promotedProject.objectId).toMatch(/^obj_/);
    expect(promotedWorkspace.objectId).toMatch(/^obj_/);
    expect(promotedMigration.objectId).toMatch(/^obj_/);
    const rows = openDomainDb()
      .query<
        { id: string; workspaceId: string; projectId: string | null; bucket: string },
        []
      >(
        "SELECT id, workspace_id AS workspaceId, project_id AS projectId, bucket FROM objects ORDER BY created_at ASC, id ASC",
      )
      .all();
    expect(rows).toEqual([
      expect.objectContaining({
        id: promotedProject.objectId,
        workspaceId: workspace.id,
        projectId: project.id,
        bucket: `buckets/${workspace.id}/projects/${project.id}`,
      }),
      expect.objectContaining({
        id: promotedWorkspace.objectId,
        workspaceId: workspace.id,
        projectId: null,
        bucket: `buckets/${workspace.id}/shared`,
      }),
      expect.objectContaining({
        id: promotedMigration.objectId,
        workspaceId: workspace.id,
        projectId: project.id,
      }),
    ]);
  });

  test("rejects corrupt promotion evidence and leaves only orphan bytes after link failure", async () => {
    root = makeTmpRoot("ralphy-domain-run-objects-orphan");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const run = startRun({ workspaceId: workspace.id, kind: "evaluation" });
    const emptyPath = writeRunFile("invalid/empty.bin", "");
    const directoryPath = path.join(
      root.dir,
      ".ralphy",
      "tmp",
      "invalid",
      "directory",
    );
    fs.mkdirSync(directoryPath, { recursive: true });
    const missing = recordRunObject({
      runId: run.id,
      path: "tmp/invalid/missing.bin",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
    });
    const empty = recordRunObject({
      runId: run.id,
      path: "tmp/invalid/empty.bin",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
    });
    const directory = recordRunObject({
      runId: run.id,
      path: "tmp/invalid/directory",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
    });
    for (const item of [missing, empty, directory]) {
      await expect(
        promoteRunObject({
          runObjectId: item.id,
          mime: "application/octet-stream",
          storageClass: "diagnostic",
        }),
      ).rejects.toThrow(/missing|empty|regular file/i);
    }
    expect(fs.existsSync(emptyPath)).toBe(true);

    writeRunFile("mismatch/size.bin", "evidence");
    writeRunFile("mismatch/hash.bin", "evidence");
    const sizeMismatch = recordRunObject({
      runId: run.id,
      path: "tmp/mismatch/size.bin",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
      bytes: 99,
    });
    const hashMismatch = recordRunObject({
      runId: run.id,
      path: "tmp/mismatch/hash.bin",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
      sha256: "0".repeat(64),
    });
    for (const item of [sizeMismatch, hashMismatch]) {
      await expect(
        promoteRunObject({
          runObjectId: item.id,
          mime: "application/octet-stream",
          storageClass: "diagnostic",
        }),
      ).rejects.toThrow(/does not match/i);
      expect(getRun(run.id).objects.find((row) => row.id === item.id)?.objectId).toBeNull();
    }

    const orphanPath = writeRunFile("orphan/output.bin", "orphan");
    const orphan = recordRunObject({
      runId: run.id,
      path: "tmp/orphan/output.bin",
      purpose: "output",
      state: "diagnostic",
      retention: "keep",
    });
    openDomainDb().exec(`
      CREATE TRIGGER reject_run_object_link
      BEFORE UPDATE OF object_id ON run_objects
      WHEN NEW.id = '${orphan.id}'
      BEGIN
        SELECT RAISE(ABORT, 'fixture link rejection');
      END;
    `);
    await expect(
      promoteRunObject({
        runObjectId: orphan.id,
        mime: "application/octet-stream",
        storageClass: "diagnostic",
      }),
    ).rejects.toThrow(/fixture link rejection/i);
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(getRun(run.id).objects.find((row) => row.id === orphan.id)?.objectId).toBeNull();
    const stored = openDomainDb()
      .query<{ bucket: string; key: string }, []>(
        "SELECT bucket, key FROM objects ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .get();
    expect(stored).not.toBeNull();
    expect(
      fs.readFileSync(path.join(root.dir, ".ralphy", stored!.bucket, stored!.key), "utf8"),
    ).toBe("orphan");
  });

  test("does not link bytes that change between inspection and ingestion", async () => {
    root = makeTmpRoot("ralphy-domain-run-objects-race");
    const workspace = createWorkspace({ slug: "race", name: "Race" });
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    const sourcePath = writeRunFile("race/output.bin", "before");
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/race/output.bin",
      purpose: "output",
      state: "working",
      retention: "keep",
    });
    const copyFile = fs.promises.copyFile.bind(fs.promises);
    const copySpy = spyOn(fs.promises, "copyFile").mockImplementation(
      async (source, destination, mode) => {
        fs.writeFileSync(sourcePath, "after!");
        return copyFile(source, destination, mode);
      },
    );

    try {
      await expect(
        promoteRunObject({
          runObjectId: runObject.id,
          mime: "application/octet-stream",
          storageClass: "working",
        }),
      ).rejects.toThrow(/changed|match/i);
    } finally {
      copySpy.mockRestore();
    }

    expect(getRun(run.id).objects[0]?.objectId).toBeNull();
    expect(
      openDomainDb()
        .query<{ bytes: number; sha256: string }, []>(
          "SELECT bytes, sha256 FROM objects",
        )
        .get(),
    ).toEqual({ bytes: 6, sha256: sha256("after!") });
  });
});

function writeRunFile(relative: string, contents: string): string {
  if (!root) throw new Error("Fixture root is missing");
  const file = path.join(root.dir, ".ralphy", "tmp", relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

function sha256(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}
