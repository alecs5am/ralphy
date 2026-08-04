import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { listArtifactRevisions, listArtifacts } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  completeArtifactRun,
  getRun,
  listRunAttempts,
  listRunObjects,
  projectRunFailure,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

let fixtureRoot: string;

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-complete-artifact-run-"));
  setRoot(fixtureRoot);
  fs.mkdirSync(path.join(fixtureRoot, ".ralphy"), { recursive: true });
  openDomainDb();
});

afterEach(() => {
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("completeArtifactRun", () => {
  test("provider failure projection defaults to allowlisted facts for adversarial messages", () => {
    const forbidden = [
      '{"error":"TASK4_RAW_JSON"}',
      "ftp://example.test/TASK4_FTP",
      "custom+scheme://example.test/TASK4_CUSTOM",
      "file:///private/tmp/TASK4_FILE_URI",
      "/private/tmp/TASK4_UNIX_PATH",
      "./relative/TASK4_RELATIVE_PATH",
      "C:\\Users\\fixture\\TASK4_WINDOWS_PATH",
      "data:image/png;base64,TASK4_DATA_URI",
    ];
    const raw = Object.assign(new Error(forbidden.join(" | ")), {
      name: "TransientPayloadError",
      code: "ECONNRESET",
      status: 503,
      provider: "openrouter",
    });

    const projected = projectRunFailure(raw) as Error & {
      code?: string;
      status?: number;
      provider?: string;
    };

    expect(projected.name).toBe("TransientPayloadError");
    expect(projected.code).toBe("ECONNRESET");
    expect(projected.status).toBe(503);
    expect(projected.provider).toBe("openrouter");
    expect(projected.message).toBe("openrouter request failed (status 503; code ECONNRESET)");
    for (const sentinel of forbidden) expect(projected.message).not.toContain(sentinel);
  });
  test("atomically promotes Run temp bytes into one Artifact revision and succeeds its evidence", async () => {
    const { workspaceId, projectId } = seedProject();
    const run = startRun({ workspaceId, projectId, kind: "generate.image", label: "hero" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    const finishedPath = writeRunOutput(run.id, "hero.png", "fixture-image");

    const completed = await completeArtifactRun({
      runId: run.id,
      attemptId: attempt.id,
      finishedPath,
      originalName: "hero.png",
      mime: "image/png",
      artifact: { slug: "hero", kind: "image", state: "candidate" },
      costUsd: 0.01,
      response: { model: "fixture/image" },
    });

    expect(completed.artifact.slug).toBe("hero");
    expect(completed.revision.artifactId).toBe(completed.artifact.id);
    expect(completed.revision.revisionNo).toBe(1);
    expect(completed.run.state).toBe("succeeded");
    expect(completed.attempt.state).toBe("succeeded");
    expect(completed.runObject.objectId).toBe(completed.revision.objectId);
    expect(completed.runObject.bytes).toBe(Buffer.byteLength("fixture-image"));
    expect(fs.existsSync(finishedPath)).toBe(false);

    const context = { workspaceId, projectId };
    expect(listArtifacts({ context, limit: 10 }).items).toHaveLength(1);
    expect(listArtifactRevisions({ context, artifactId: completed.artifact.id, limit: 10 }).items).toHaveLength(1);
    expect(listRunAttempts({ context, runId: run.id, limit: 10 }).items[0]?.costUsd).toBe(0.01);
    expect(listRunObjects({ context, runId: run.id, limit: 10 }).items).toHaveLength(1);
  });

  test("rolls back domain output rows and leaves failed Run evidence when the completion commit is injected to fail", async () => {
    const { workspaceId, projectId } = seedProject();
    const run = startRun({ workspaceId, projectId, kind: "generate.image", label: "hero" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    const finishedPath = writeRunOutput(run.id, "hero.png", "fixture-image");
    openDomainDb().exec(`
      CREATE TEMP TRIGGER inject_artifact_revision_failure
      BEFORE INSERT ON artifact_revisions
      BEGIN
        SELECT RAISE(ABORT, 'injected artifact commit failure');
      END;
    `);

    await expect(
      completeArtifactRun({
        runId: run.id,
        attemptId: attempt.id,
        finishedPath,
        originalName: "hero.png",
        mime: "image/png",
        artifact: { slug: "hero", kind: "image", state: "candidate" },
      }),
    ).rejects.toThrow("Provider request failed");

    const context = { workspaceId, projectId };
    expect(listArtifacts({ context, limit: 10 }).items).toHaveLength(0);
    expect(openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM objects").get()?.count).toBe(0);
    expect(getRun({ context, runId: run.id }).state).toBe("failed");
    expect(listRunAttempts({ context, runId: run.id, limit: 10 }).items[0]?.state).toBe("failed");
    const evidence = listRunObjects({ context, runId: run.id, limit: 10 }).items;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.state).toBe("failed");
    expect(evidence[0]?.objectId).toBeNull();
    expect(fs.existsSync(finishedPath)).toBe(true);
  });

  test("keeps committed Object bytes and a succeeded Run when source cleanup sees a replacement", async () => {
    const { workspaceId, projectId } = seedProject();
    const run = startRun({ workspaceId, projectId, kind: "generate.image", label: "hero" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    const finishedPath = writeRunOutput(run.id, "hero.png", "committed-image");

    const completed = await completeArtifactRun({
      runId: run.id,
      attemptId: attempt.id,
      finishedPath,
      originalName: "hero.png",
      mime: "image/png",
      artifact: { slug: "hero", kind: "image", state: "candidate" },
      testHooks: {
        beforeSourceCleanup: () => {
          fs.rmSync(finishedPath);
          fs.writeFileSync(finishedPath, "replacement-image");
        },
      },
    });

    const object = openDomainDb()
      .query<{ bucket: string; key: string }, [string]>(
        "SELECT bucket, key FROM objects WHERE id = ?",
      )
      .get(completed.revision.objectId)!;
    const objectPath = path.join(fixtureRoot, ".ralphy", object.bucket, object.key);
    expect(fs.readFileSync(objectPath, "utf8")).toBe("committed-image");
    expect(fs.readFileSync(finishedPath, "utf8")).toBe("replacement-image");
    expect(completed.run.state).toBe("succeeded");
    expect(getRun({ context: { workspaceId, projectId }, runId: run.id }).state).toBe("succeeded");
  });

  test("missing provider output terminalizes the Attempt and Run without diagnostic evidence", async () => {
    const { workspaceId, projectId } = seedProject();
    const run = startRun({ workspaceId, projectId, kind: "generate.image", label: "missing" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    const finishedPath = path.join(fixtureRoot, ".ralphy", "tmp", run.id, "missing.png");

    await expect(completion(run.id, attempt.id, finishedPath, "missing"))
      .rejects.toThrow();

    expectFailedWithoutEvidence({ workspaceId, projectId, runId: run.id });
  });

  test("empty provider output terminalizes the Attempt and Run without diagnostic evidence", async () => {
    const { workspaceId, projectId } = seedProject();
    const run = startRun({ workspaceId, projectId, kind: "generate.image", label: "empty" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    const finishedPath = writeRunOutput(run.id, "empty.png", "");

    await expect(completion(run.id, attempt.id, finishedPath, "empty"))
      .rejects.toThrow("must not be empty");

    expectFailedWithoutEvidence({ workspaceId, projectId, runId: run.id });
  });

  test("symlink-swapped provider output terminalizes the Attempt and Run without diagnostic evidence", async () => {
    const { workspaceId, projectId } = seedProject();
    const run = startRun({ workspaceId, projectId, kind: "generate.image", label: "swapped" });
    const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/image" });
    const external = path.join(fixtureRoot, "external.png");
    fs.writeFileSync(external, "external-image");
    const finishedPath = path.join(fixtureRoot, ".ralphy", "tmp", run.id, "swapped.png");
    fs.mkdirSync(path.dirname(finishedPath), { recursive: true });
    fs.symlinkSync(external, finishedPath);

    await expect(completion(run.id, attempt.id, finishedPath, "swapped"))
      .rejects.toThrow("regular file");

    expectFailedWithoutEvidence({ workspaceId, projectId, runId: run.id });
    expect(fs.readFileSync(external, "utf8")).toBe("external-image");
  });
});

function seedProject(): { workspaceId: string; projectId: string } {
  const workspace = createWorkspace({ slug: "default", name: "Default" });
  const project = createProject({ workspaceId: workspace.id, slug: "fixture", name: "Fixture" });
  return { workspaceId: workspace.id, projectId: project.id };
}

function writeRunOutput(runId: string, name: string, contents: string): string {
  const output = path.join(fixtureRoot, ".ralphy", "tmp", runId, name);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, contents);
  return output;
}

function completion(runId: string, attemptId: string, finishedPath: string, slug: string) {
  return completeArtifactRun({
    runId,
    attemptId,
    finishedPath,
    originalName: `${slug}.png`,
    mime: "image/png",
    artifact: { slug, kind: "image", state: "candidate" },
  });
}

function expectFailedWithoutEvidence(input: {
  workspaceId: string;
  projectId: string;
  runId: string;
}): void {
  const context = { workspaceId: input.workspaceId, projectId: input.projectId };
  expect(getRun({ context, runId: input.runId }).state).toBe("failed");
  expect(listRunAttempts({ context, runId: input.runId, limit: 10 }).items[0]?.state).toBe("failed");
  expect(listRunObjects({ context, runId: input.runId, limit: 10 }).items).toHaveLength(0);
}
