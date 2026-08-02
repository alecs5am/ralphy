import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  finishRun,
  finishRunAttempt,
  getRun,
  promoteRunObject,
  recordRunObject,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
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
      response: { a: 1, z: 2 },
      costUsd: 1.25,
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

    expect(
      startRun({
        projectId: project.id,
        agentSessionId: workspaceSession.id,
        kind: "generation",
      }),
    ).toMatchObject({ workspaceId: workspace.id, projectId: project.id });
    expect(
      startRun({
        projectId: project.id,
        agentSessionId: projectSession.id,
        kind: "generation",
      }),
    ).toMatchObject({ workspaceId: workspace.id, projectId: project.id });
    expect(
      startRun({
        workspaceId: workspace.id,
        agentSessionId: workspaceSession.id,
        kind: "evaluation",
      }),
    ).toMatchObject({ workspaceId: workspace.id, projectId: null });
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
      path: valid.path,
      bytes: null,
      sha256: null,
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
