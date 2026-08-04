import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  addArtifactRevision,
  createArtifact,
  getArtifact,
  listArtifactRevisions,
} from "../../cli/lib/store/artifacts.js";
import {
  createDocument,
  getDocument,
  reviseDocument,
} from "../../cli/lib/store/documents.js";
import { getProjectDocumentBinding } from "../../cli/lib/store/document-content.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import {
  createProject,
  createIteration,
  createWorkspace,
  addFeedback,
  getFeedback,
  getProject,
} from "../../cli/lib/store/scopes.js";
import { setRoot } from "../../cli/lib/paths.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: unknown;
};

let fixtureRoot: string;
let dataRoot: string;

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-domain-cli-"));
  dataRoot = path.join(fixtureRoot, ".ralphy");
  fs.mkdirSync(dataRoot);
  setRoot(fixtureRoot);
  openDomainDb();
  closeDomainDb();
});

afterEach(() => {
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("entity-first CLI", () => {
  test("keeps the Workspace-to-Document journey ID-based, paginated, scoped, and independent of legacy files", async () => {
    const workspace = expectOk<{ id: string }>(
      await runCli(["workspace", "create", "Denti.AI", "--as", "denti-ai"]),
    );
    const project = expectOk<{ id: string }>(
      await runCli([
        "project",
        "create",
        "Perio pitch",
        "--as",
        "perio-pitch",
        "--workspace",
        workspace.id,
      ]),
    );
    const iteration = expectOk<{ id: string }>(
      await runCli([
        "project",
        "iterate",
        project.id,
        "--title",
        "Client corrections",
        "--reason",
        "feedback",
      ]),
    );
    const document = expectOk<{ id: string }>(
      await runCli([
        "document",
        "create",
        "--project",
        project.id,
        "--kind",
        "brief",
        "--slug",
        "brief",
        "--title",
        "Brief",
      ]),
    );
    const revision = expectOk<{ id: string }>(
      await runCli([
        "document",
        "revise",
        document.id,
        "--body",
        "Updated brief",
        "--expected",
        "none",
        "--iteration",
        iteration.id,
      ]),
    );
    expect(revision).not.toHaveProperty("body");

    const activity = expectOk<{
      items: Array<{ action: string; entityId: string }>;
      nextCursor: number | null;
    }>(
      await runCli([
        "activity",
        "list",
        "--project",
        project.id,
        "--since",
        "0",
        "--limit",
        "50",
      ]),
    );
    expect(activity.items.at(-1)).toMatchObject({
      action: "document.revised",
      entityId: document.id,
    });
    const shownDocument = expectOk<{ currentRevisionId: string }>(
      await runCli([
        "document",
        "show",
        document.id,
        "--project",
        project.id,
      ]),
    );
    expect(shownDocument.currentRevisionId).toBe(revision.id);

    const stale = await runCli([
      "document",
      "revise",
      document.id,
      "--body",
      "Stale overwrite",
      "--expected",
      "none",
    ]);
    expect(stale.exitCode).toBe(2);
    expect(errorCode(stale.stderr)).toBe("E_CONFLICT");

    const secondDocument = expectOk<{ id: string }>(
      await runCli([
        "document",
        "create",
        "--project",
        project.id,
        "--kind",
        "note",
        "--slug",
        "notes",
        "--title",
        "Notes",
      ]),
    );
    const firstPage = expectOk<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(
      await runCli([
        "document",
        "list",
        "--project",
        project.id,
        "--limit",
        "1",
      ]),
    );
    expect(Object.keys(firstPage).sort()).toEqual(["items", "nextCursor"]);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toStartWith("c1.");
    const secondPage = expectOk<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(
      await runCli([
        "document",
        "list",
        "--project",
        project.id,
        "--limit",
        "1",
        "--cursor",
        firstPage.nextCursor!,
      ]),
    );
    expect(secondPage.items.map((item) => item.id)).toEqual([secondDocument.id]);

    const otherProject = expectOk<{ id: string }>(
      await runCli([
        "project",
        "create",
        "Other project",
        "--as",
        "other-project",
        "--workspace",
        workspace.id,
      ]),
    );
    const foreignDocument = expectOk<{ id: string }>(
      await runCli([
        "document",
        "create",
        "--project",
        otherProject.id,
        "--kind",
        "brief",
        "--slug",
        "brief",
        "--title",
        "Foreign brief",
      ]),
    );
    const projectDocuments = expectOk<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(
      await runCli([
        "document",
        "list",
        "--project",
        project.id,
        "--limit",
        "50",
      ]),
    );
    expect(projectDocuments.items.map((item) => item.id)).toContain(document.id);
    expect(projectDocuments.items.map((item) => item.id)).not.toContain(
      foreignDocument.id,
    );

    const statusBefore = expectOk<Record<string, unknown>>(
      await runCli(["project", "status", project.id]),
    );
    const legacyProject = path.join(
      dataRoot,
      "workspaces",
      workspace.id,
      "projects",
      project.id,
    );
    fs.mkdirSync(path.join(legacyProject, "render"), { recursive: true });
    fs.writeFileSync(path.join(legacyProject, "scenario.json"), "{}");
    fs.writeFileSync(path.join(legacyProject, "asset-manifest.json"), "{}");
    fs.writeFileSync(path.join(legacyProject, "render", "final.mp4"), "legacy");
    const statusAfter = expectOk<Record<string, unknown>>(
      await runCli(["project", "status", project.id]),
    );
    expect(statusAfter).toEqual(statusBefore);
  });

  test("exposes safe account, Artifact, usage, and feedback DTOs", async () => {
    const workspace = expectOk<{ id: string }>(
      await runCli(["workspace", "create", "Studio", "--as", "studio"]),
    );
    const account = expectOk<{
      workspaceId: string;
      credentialConfigured: boolean;
    }>(
      await runCli([
        "workspace",
        "account",
        workspace.id,
        "--platform",
        "youtube",
        "--external-id",
        "channel-1",
        "--display-name",
        "Studio",
        "--username",
        "studio",
      ]),
    );
    expect(account).toMatchObject({
      workspaceId: workspace.id,
      credentialConfigured: false,
    });
    expect(JSON.stringify(account)).not.toContain("credentialRef");
    const accounts = expectOk<{ items: unknown[]; nextCursor: string | null }>(
      await runCli(["workspace", "account", workspace.id, "--limit", "50"]),
    );
    expect(Object.keys(accounts).sort()).toEqual(["items", "nextCursor"]);
    expect(accounts.items).toHaveLength(1);

    const project = expectOk<{ id: string }>(
      await runCli([
        "project",
        "create",
        "Launch",
        "--as",
        "launch",
        "--workspace",
        workspace.id,
      ]),
    );
    const iteration = expectOk<{ id: string }>(
      await runCli([
        "project",
        "iterate",
        project.id,
        "--title",
        "Review",
      ]),
    );
    const source = path.join(fixtureRoot, "hero.png");
    fs.writeFileSync(source, "fixture image bytes");
    setRoot(fixtureRoot);
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: source,
      originalName: "hero.png",
      mime: "image/png",
      storageClass: "durable",
      transfer: "move",
    });
    closeDomainDb();
    expect(object.storageClass).toBe("durable");

    const artifact = expectOk<{ id: string }>(
      await runCli([
        "artifact",
        "create",
        "--project",
        project.id,
        "--slug",
        "hero",
        "--kind",
        "image",
      ]),
    );
    const revision = expectOk<{ id: string; objectId: string }>(
      await runCli([
        "artifact",
        "revise",
        artifact.id,
        "--object",
        object.id,
        "--expected",
        "none",
        "--iteration",
        iteration.id,
      ]),
    );
    expect(revision.objectId).toBe(object.id);
    const selected = expectOk<{ selectedRevisionId: string }>(
      await runCli([
        "artifact",
        "promote",
        artifact.id,
        "--revision",
        revision.id,
        "--expected",
        "none",
      ]),
    );
    expect(selected.selectedRevisionId).toBe(revision.id);
    const usage = expectOk<{ artifactRevisionId: string; projectId: string }>(
      await runCli([
        "artifact",
        "usage",
        revision.id,
        "--project",
        project.id,
        "--role",
        "hero",
      ]),
    );
    expect(usage).toMatchObject({
      artifactRevisionId: revision.id,
      projectId: project.id,
    });

    const feedback = expectOk<{ id: string; status: string }>(
      await runCli([
        "feedback",
        "add",
        "--iteration",
        iteration.id,
        "--body",
        "Use the selected hero",
      ]),
    );
    expect(feedback.status).toBe("open");
    const feedbackPage = expectOk<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(
      await runCli([
        "feedback",
        "list",
        "--project",
        project.id,
        "--limit",
        "50",
      ]),
    );
    expect(Object.keys(feedbackPage).sort()).toEqual(["items", "nextCursor"]);
    expect(feedbackPage.items.map((item) => item.id)).toContain(feedback.id);
    const resolved = expectOk<{ status: string }>(
      await runCli(["feedback", "resolve", feedback.id, "--note", "Applied"]),
    );
    expect(resolved.status).toBe("resolved");
  });

  test("transfers and resumes a Project through the public CLI controller", async () => {
    const source = expectOk<{ id: string }>(
      await runCli(["workspace", "create", "Source", "--as", "source"]),
    );
    const destination = expectOk<{ id: string }>(
      await runCli([
        "workspace",
        "create",
        "Destination",
        "--as",
        "destination",
      ]),
    );
    const project = expectOk<{ id: string; rowVersion: number }>(
      await runCli([
        "project",
        "create",
        "Transfer me",
        "--as",
        "transfer-me",
        "--workspace",
        source.id,
      ]),
    );
    const transferred = expectOk<{
      id: string;
      state: string;
      destinationWorkspaceId: string;
    }>(
      await runCli([
        "project",
        "transfer",
        project.id,
        "--to",
        destination.id,
        "--expected",
        String(project.rowVersion),
      ]),
    );
    expect(transferred).toMatchObject({
      state: "completed",
      destinationWorkspaceId: destination.id,
    });
    expectOk(await runCli(["project", "transfer", "--resume", transferred.id]));
  });

  test("authorizes every stable-ID mutation against the immutable Session", async () => {
    const workspace = createWorkspace({ slug: "scope", name: "Scope" });
    const ownProject = createProject({
      workspaceId: workspace.id,
      slug: "own",
      name: "Own",
    });
    const foreignProject = createProject({
      workspaceId: workspace.id,
      slug: "foreign",
      name: "Foreign",
    });
    const foreignIteration = createIteration({
      projectId: foreignProject.id,
      title: "Foreign",
    });
    const foreignDocument = createDocument({
      projectId: foreignProject.id,
      kind: "brief",
      slug: "foreign-brief",
      title: "Foreign brief",
    });
    const foreignDocumentRevision = reviseDocument({
      documentId: foreignDocument.id,
      body: "foreign body",
      format: "text",
      expectedHeadId: null,
    });
    const foreignObjectInput = path.join(fixtureRoot, "foreign-object.txt");
    fs.writeFileSync(foreignObjectInput, "foreign object");
    const foreignObject = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: foreignProject.id },
      sourcePath: foreignObjectInput,
      originalName: "foreign-object.txt",
      mime: "text/plain",
      storageClass: "durable",
      transfer: "move",
    });
    const foreignArtifact = createArtifact({
      projectId: foreignProject.id,
      slug: "foreign-artifact",
      kind: "document",
    });
    const foreignArtifactRevision = addArtifactRevision({
      artifactId: foreignArtifact.id,
      objectId: foreignObject.id,
      parentRevisionId: null,
      state: "working",
    });
    const foreignFeedback = addFeedback({
      iterationId: foreignIteration.id,
      body: "foreign feedback",
    });
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: ownProject.id,
      agent: "scope-fixture",
    });
    closeDomainDb();

    const mutationNames = [
      "document revise",
      "document bind",
      "artifact promote",
      "artifact state",
      "feedback add",
      "feedback resolve",
    ];
    const rejected = await Promise.all([
      runCli([
        "--session",
        session.id,
        "document",
        "revise",
        foreignDocument.id,
        "--body",
        "scope bypass",
        "--expected",
        foreignDocumentRevision.id,
      ]),
      runCli([
        "--session",
        session.id,
        "document",
        "bind",
        foreignDocumentRevision.id,
        "--project",
        ownProject.id,
        "--role",
        "brief",
        "--expected",
        "none",
      ]),
      runCli([
        "--session",
        session.id,
        "artifact",
        "promote",
        foreignArtifact.id,
        "--revision",
        foreignArtifactRevision.id,
        "--expected",
        "none",
      ]),
      runCli([
        "--session",
        session.id,
        "artifact",
        "state",
        foreignArtifactRevision.id,
        "--state",
        "approved",
        "--expected",
        foreignArtifactRevision.id,
      ]),
      runCli([
        "--session",
        session.id,
        "feedback",
        "add",
        "--iteration",
        foreignIteration.id,
        "--body",
        "scope bypass",
      ]),
      runCli([
        "--session",
        session.id,
        "feedback",
        "resolve",
        foreignFeedback.id,
      ]),
    ]);
    expect(
      rejected.flatMap((result, index) =>
        result.exitCode === 0 ? [mutationNames[index]!] : [],
      ),
    ).toEqual([]);

    setRoot(fixtureRoot);
    expect(
      getDocument({
        context: { workspaceId: workspace.id, projectId: foreignProject.id },
        documentId: foreignDocument.id,
      }).currentRevisionId,
    ).toBe(foreignDocumentRevision.id);
    expect(
      getProjectDocumentBinding(
        { workspaceId: workspace.id, projectId: ownProject.id },
        { projectId: ownProject.id, role: "brief" },
      ),
    ).toBeNull();
    expect(
      getArtifact({
        context: { workspaceId: workspace.id, projectId: foreignProject.id },
        artifactId: foreignArtifact.id,
      }).selectedRevisionId,
    ).toBeNull();
    expect(
      listArtifactRevisions({
        context: { workspaceId: workspace.id, projectId: foreignProject.id },
        artifactId: foreignArtifact.id,
        limit: 50,
      }).items,
    ).toHaveLength(1);
    expect(
      getFeedback({
        context: { workspaceId: workspace.id, projectId: foreignProject.id },
        feedbackId: foreignFeedback.id,
      }).status,
    ).toBe("open");

  });

  test("scopes Activity to Workspace-shared and the immutable Session Project", async () => {
    const workspace = createWorkspace({ slug: "activity-scope", name: "Scope" });
    const ownProject = createProject({
      workspaceId: workspace.id,
      slug: "own-activity",
      name: "Own",
    });
    const foreignProject = createProject({
      workspaceId: workspace.id,
      slug: "foreign-activity",
      name: "Foreign",
    });
    createIteration({ projectId: ownProject.id, title: "Own" });
    createIteration({ projectId: foreignProject.id, title: "Foreign" });
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: ownProject.id,
      agent: "activity-fixture",
    });
    closeDomainDb();

    const activity = expectOk<{
      items: Array<{ projectId: string | null }>;
    }>(
      await runCli([
        "--session",
        session.id,
        "activity",
        "list",
        "--since",
        "0",
        "--limit",
        "100",
      ]),
    );
    expect(activity.items.some((event) => event.projectId === foreignProject.id)).toBe(
      false,
    );
    expect(activity.items.some((event) => event.projectId === ownProject.id)).toBe(
      true,
    );
  });

  test("rejects every sibling Project feedback target family under a Session", async () => {
    const workspace = createWorkspace({ slug: "target-scope", name: "Scope" });
    const ownProject = createProject({
      workspaceId: workspace.id,
      slug: "own-targets",
      name: "Own",
    });
    const foreignProject = createProject({
      workspaceId: workspace.id,
      slug: "foreign-targets",
      name: "Foreign",
    });
    const ownIteration = createIteration({ projectId: ownProject.id, title: "Own" });
    const foreignDocument = createDocument({
      projectId: foreignProject.id,
      kind: "brief",
      slug: "target-document",
      title: "Target",
    });
    const documentRevision = reviseDocument({
      documentId: foreignDocument.id,
      body: "target",
      format: "text",
      expectedHeadId: null,
    });
    const objectInput = path.join(fixtureRoot, "target-object.txt");
    fs.writeFileSync(objectInput, "target object");
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: foreignProject.id },
      sourcePath: objectInput,
      originalName: "target-object.txt",
      mime: "text/plain",
      storageClass: "durable",
      transfer: "move",
    });
    const artifact = createArtifact({
      projectId: foreignProject.id,
      slug: "target-artifact",
      kind: "document",
    });
    const artifactRevision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      parentRevisionId: null,
      state: "working",
    });
    const buildRun = startRun({
      workspaceId: workspace.id,
      projectId: foreignProject.id,
      kind: "build",
    });
    const db = openDomainDb();
    db.prepare(
      "INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at) VALUES ('foreign-composition', ?, 'target-composition', 'video', 1, 1)",
    ).run(foreignProject.id);
    db.prepare(
      `INSERT INTO composition_revisions
       (id, composition_id, revision_no, state, engine, manifest_sha256,
        created_at, sealed_at)
       VALUES ('foreign-composition-revision', 'foreign-composition', 1,
               'sealed', 'test', ?, 1, 1)`,
    ).run("a".repeat(64));
    db.prepare(
      `INSERT INTO builds
       (id, composition_revision_id, run_id, state, profile_json, created_at,
        started_at)
       VALUES ('foreign-build', 'foreign-composition-revision', ?, 'running',
               '{}', 1, 1)`,
    ).run(buildRun.id);
    db.prepare(
      `INSERT INTO units
       (id, workspace_id, project_id, slug, format, created_at, updated_at)
       VALUES ('foreign-unit', ?, ?, 'target-unit', 'video', 1, 1)`,
    ).run(workspace.id, foreignProject.id);
    db.prepare(
      `INSERT INTO unit_revisions
       (id, unit_id, revision_no, created_at)
       VALUES ('foreign-unit-revision', 'foreign-unit', 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO build_outputs
       (id, build_id, artifact_revision_id, position, created_at)
       VALUES ('foreign-build-output', 'foreign-build', ?, 0, 1)`,
    ).run(artifactRevision.id);
    db.prepare(
      `INSERT INTO unit_items
       (id, unit_revision_id, document_revision_id, role, position, created_at)
       VALUES ('foreign-unit-item', 'foreign-unit-revision', ?, 'body', 0, 1)`,
    ).run(documentRevision.id);
    db.exec(`
      INSERT INTO unit_presentations
        (id, unit_revision_id, platform, position, created_at)
        VALUES ('foreign-unit-presentation', 'foreign-unit-revision', 'tiktok', 0, 1);
    `);
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: ownProject.id,
      agent: "target-scope-fixture",
    });
    closeDomainDb();

    const targets = [
      ["document_revision", documentRevision.id],
      ["artifact_revision", artifactRevision.id],
      ["composition_revision", "foreign-composition-revision"],
      ["build", "foreign-build"],
      ["build_output", "foreign-build-output"],
      ["unit_item", "foreign-unit-item"],
      ["unit_presentation", "foreign-unit-presentation"],
    ] as const;
    const results = await Promise.all(
      targets.map(([type, id]) =>
        runCli([
          "--session",
          session.id,
          "feedback",
          "add",
          "--iteration",
          ownIteration.id,
          "--body",
          "scope bypass",
          "--target-type",
          type,
          "--target",
          id,
        ]),
      ),
    );
    expect(
      results.flatMap((result, index) =>
        result.exitCode === 0 ? [targets[index]![0]] : [],
      ),
    ).toEqual([]);
  });

  test("authorizes completed transfer resume against the immutable Session Project", async () => {
    const source = createWorkspace({ slug: "resume-source", name: "Source" });
    const destination = createWorkspace({
      slug: "resume-destination",
      name: "Destination",
    });
    const ownProject = createProject({
      workspaceId: source.id,
      slug: "own-resume",
      name: "Own",
    });
    const foreignProject = createProject({
      workspaceId: source.id,
      slug: "foreign-resume",
      name: "Foreign",
    });
    const session = startAgentSession({
      workspaceId: source.id,
      projectId: ownProject.id,
      agent: "resume-fixture",
    });
    const { transferProject } = await import("../../cli/lib/store/transfers.js");
    const transferred = await transferProject({
      context: { workspaceId: source.id },
      projectId: foreignProject.id,
      destinationWorkspaceId: destination.id,
      expectedRowVersion: foreignProject.rowVersion,
    });
    closeDomainDb();

    const resume = await runCli([
      "--session",
      session.id,
      "project",
      "transfer",
      "--resume",
      transferred.id,
    ]);
    expect(resume.exitCode).not.toBe(0);
  });
});

describe("journaled Project transfer controller", () => {
  test("conflicts before journaling while the Project has an active Session or Run", async () => {
    const source = createWorkspace({ slug: "source", name: "Source" });
    const destination = createWorkspace({ slug: "destination", name: "Destination" });
    const project = createProject({
      workspaceId: source.id,
      slug: "campaign",
      name: "Campaign",
    });
    startAgentSession({
      workspaceId: source.id,
      projectId: project.id,
      agent: "fixture",
    });
    const { transferProject } = await import("../../cli/lib/store/transfers.js");

    await expect(
      transferProject({
        context: { workspaceId: source.id },
        projectId: project.id,
        destinationWorkspaceId: destination.id,
        expectedRowVersion: project.rowVersion,
      }),
    ).rejects.toMatchObject({ name: "StoreConflictError" });
    expect(transferRowCount()).toBe(0);
    expect(getProject({ workspaceId: source.id, projectId: project.id }).id).toBe(
      project.id,
    );

    closeDomainDb();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    setRoot(fixtureRoot);
    openDomainDb();
    const source2 = createWorkspace({ slug: "source-2", name: "Source 2" });
    const destination2 = createWorkspace({
      slug: "destination-2",
      name: "Destination 2",
    });
    const project2 = createProject({
      workspaceId: source2.id,
      slug: "campaign-2",
      name: "Campaign 2",
    });
    startRun({
      workspaceId: source2.id,
      projectId: project2.id,
      kind: "generation",
    });

    await expect(
      transferProject({
        context: { workspaceId: source2.id },
        projectId: project2.id,
        destinationWorkspaceId: destination2.id,
        expectedRowVersion: project2.rowVersion,
      }),
    ).rejects.toMatchObject({ name: "StoreConflictError" });
    expect(transferRowCount()).toBe(0);
    expect(getProject({ workspaceId: source2.id, projectId: project2.id }).id).toBe(
      project2.id,
    );
  });

  test("does not switch ownership or leave destination bytes when verification fails", async () => {
    const fixture = await projectWithObject("verification-failure");
    fs.writeFileSync(fixture.objectPath, "tampered bytes");
    const { transferProject } = await import("../../cli/lib/store/transfers.js");

    await expect(
      transferProject({
        context: { workspaceId: fixture.source.id },
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
      }),
    ).rejects.toThrow();

    const row = objectLocation(fixture.object.id);
    expect(row.workspaceId).toBe(fixture.source.id);
    expect(row.bucket).toBe(fixture.sourceBucket);
    expect(fs.existsSync(path.join(dataRoot, fixture.destinationBucket, row.key))).toBe(
      false,
    );
    expect(
      getProject({
        workspaceId: fixture.source.id,
        projectId: fixture.project.id,
      }).id,
    ).toBe(fixture.project.id);
    expect(completedTransferRowCount()).toBe(0);
  });

  test("moves verified bytes once and resumes the completed journal idempotently", async () => {
    const fixture = await projectWithObject("resume");
    const { resumeProjectTransfer, transferProject } = await import(
      "../../cli/lib/store/transfers.js"
    );

    const completed = await transferProject({
      context: { workspaceId: fixture.source.id },
      projectId: fixture.project.id,
      destinationWorkspaceId: fixture.destination.id,
      expectedRowVersion: fixture.project.rowVersion,
    });
    const resumed = await resumeProjectTransfer(completed.id, {
      context: { workspaceId: fixture.destination.id },
    });

    expect(resumed).toEqual(completed);
    expect(transferRowCount()).toBe(1);
    expect(transferEntryCount(completed.id)).toBe(1);
    const row = objectLocation(fixture.object.id);
    expect(row.workspaceId).toBe(fixture.destination.id);
    expect(row.bucket).toBe(fixture.destinationBucket);
    expect(fs.existsSync(path.join(dataRoot, row.bucket, row.key))).toBe(true);
    expect(fs.existsSync(fixture.objectPath)).toBe(false);
    expect(
      getProject({
        workspaceId: fixture.destination.id,
        projectId: fixture.project.id,
      }).id,
    ).toBe(fixture.project.id);
  });

  for (const phase of [
    "afterJournalCreated",
    "afterDestinationCopied",
    "afterDestinationVerified",
    "afterMetadataCommit",
  ] as const) {
    test(`keeps one valid pointer/byte pair across an injected ${phase} crash and resume`, async () => {
      const fixture = await projectWithObject(`crash-${phase.toLowerCase()}`);
      const { resumeProjectTransfer, transferProject } = await import(
        "../../cli/lib/store/transfers.js"
      );
      const crash = new Error(`injected:${phase}`);

      await expect(
        transferProject({
          projectId: fixture.project.id,
          destinationWorkspaceId: fixture.destination.id,
          expectedRowVersion: fixture.project.rowVersion,
          context: { workspaceId: fixture.source.id },
          testHooks: { [phase]: () => { throw crash; } },
        } as any),
      ).rejects.toThrow(crash.message);

      const transferId = latestTransferId();
      const rowAfterCrash = objectLocation(fixture.object.id);
      const destinationPath = path.join(
        dataRoot,
        fixture.destinationBucket,
        rowAfterCrash.key,
      );
      if (phase === "afterMetadataCommit") {
        expect(rowAfterCrash.workspaceId).toBe(fixture.destination.id);
        expect(fs.readFileSync(destinationPath, "utf8")).toBe("verified object bytes");
        expect(fs.readFileSync(fixture.objectPath, "utf8")).toBe("verified object bytes");
      } else {
        expect(rowAfterCrash.workspaceId).toBe(fixture.source.id);
        expect(fs.readFileSync(fixture.objectPath, "utf8")).toBe("verified object bytes");
      }

      const resumed = await resumeProjectTransfer(transferId, {
        context: {
          workspaceId:
            phase === "afterMetadataCommit"
              ? fixture.destination.id
              : fixture.source.id,
        },
      } as any);
      expect(resumed.state).toBe("completed");
      expect(objectLocation(fixture.object.id).workspaceId).toBe(
        fixture.destination.id,
      );
      expect(fs.readFileSync(destinationPath, "utf8")).toBe("verified object bytes");
      expect(fs.existsSync(fixture.objectPath)).toBe(false);
    });
  }

  test("rejects Object identity/source drift and destination tampering before the bulk switch", async () => {
    const fixture = await projectWithObject("exact-entry-recheck");
    const { transferProject } = await import("../../cli/lib/store/transfers.js");
    const alternateKey = "alternate-source.txt";
    const alternatePath = path.join(dataRoot, fixture.sourceBucket, alternateKey);
    fs.copyFileSync(fixture.objectPath, alternatePath);

    await expect(
      transferProject({
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
        context: { workspaceId: fixture.source.id },
        testHooks: {
          beforeMetadataCommit: () => {
            openDomainDb()
              .prepare("UPDATE objects SET key = ? WHERE id = ?")
              .run(alternateKey, fixture.object.id);
          },
        },
      } as any),
    ).rejects.toMatchObject({ name: "StoreConflictError" });
    expect(
      getProject({
        workspaceId: fixture.source.id,
        projectId: fixture.project.id,
      }).id,
    ).toBe(fixture.project.id);
    expect(fs.readFileSync(alternatePath, "utf8")).toBe("verified object bytes");

    closeDomainDb();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    setRoot(fixtureRoot);
    openDomainDb();
    const tampered = await projectWithObject("destination-tamper");
    await expect(
      transferProject({
        projectId: tampered.project.id,
        destinationWorkspaceId: tampered.destination.id,
        expectedRowVersion: tampered.project.rowVersion,
        context: { workspaceId: tampered.source.id },
        testHooks: {
          beforeMetadataCommit: () => {
            const row = objectLocation(tampered.object.id);
            fs.writeFileSync(
              path.join(dataRoot, tampered.destinationBucket, row.key),
              "tampered destination",
            );
          },
        },
      } as any),
    ).rejects.toThrow();
    expect(
      getProject({
        workspaceId: tampered.source.id,
        projectId: tampered.project.id,
      }).id,
    ).toBe(tampered.project.id);
    expect(fs.readFileSync(tampered.objectPath, "utf8")).toBe(
      "verified object bytes",
    );
  });

  test("rejects a swapped source parent instead of following matching external bytes", async () => {
    const fixture = await projectWithObject("swapped-source-parent");
    const { transferProject } = await import("../../cli/lib/store/transfers.js");
    const sourceParent = path.join(dataRoot, fixture.sourceBucket);
    const pinnedOriginal = `${sourceParent}.original`;
    const external = path.join(fixtureRoot, "external-source");
    const row = objectLocation(fixture.object.id);
    fs.mkdirSync(path.dirname(path.join(external, row.key)), { recursive: true });
    fs.copyFileSync(fixture.objectPath, path.join(external, row.key));

    await expect(
      transferProject({
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
        context: { workspaceId: fixture.source.id },
        testHooks: {
          afterJournalCreated: () => {
            fs.renameSync(sourceParent, pinnedOriginal);
            fs.symlinkSync(external, sourceParent, "dir");
          },
        },
      } as any),
    ).rejects.toThrow();

    expect(fs.readFileSync(path.join(external, row.key), "utf8")).toBe(
      "verified object bytes",
    );
    fs.unlinkSync(sourceParent);
    fs.renameSync(pinnedOriginal, sourceParent);
    expect(fs.readFileSync(fixture.objectPath, "utf8")).toBe(
      "verified object bytes",
    );
    expect(
      getProject({
        workspaceId: fixture.source.id,
        projectId: fixture.project.id,
      }).id,
    ).toBe(fixture.project.id);
  });

  for (const lockBody of [
    JSON.stringify({ transferId: "orphan", pid: 99_999_999, nonce: "dead" }),
    '{"transferId":"partial","pid":99999999',
  ]) {
    test("recovers a safe regular dead-PID lock left before journal insertion", async () => {
      const fixture = await projectWithObject(
        lockBody.endsWith("}") ? "dead-lock" : "malformed-dead-lock",
      );
      const lockPath = path.join(dataRoot, ".maintenance.lock");
      fs.writeFileSync(lockPath, lockBody, { mode: 0o600 });
      const { transferProject } = await import("../../cli/lib/store/transfers.js");

      const transferred = await transferProject({
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
        context: { workspaceId: fixture.source.id },
      } as any);

      expect(transferred.state).toBe("completed");
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  }

  test("never removes a symlinked or live-PID maintenance lock", async () => {
    const fixture = await projectWithObject("unsafe-lock");
    const external = path.join(fixtureRoot, "external-lock");
    fs.writeFileSync(
      external,
      JSON.stringify({ transferId: "active", pid: process.pid, nonce: "active" }),
      { mode: 0o600 },
    );
    const lockPath = path.join(dataRoot, ".maintenance.lock");
    fs.symlinkSync(external, lockPath);
    const { transferProject } = await import("../../cli/lib/store/transfers.js");

    await expect(
      transferProject({
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
        context: { workspaceId: fixture.source.id },
      } as any),
    ).rejects.toMatchObject({ name: "StoreConflictError" });
    expect(fs.lstatSync(lockPath).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(external, "utf8")).toContain(`"pid":${process.pid}`);
  });

  test("does not publish a blocking lock when writing crashes before publication", async () => {
    const fixture = await projectWithObject("lock-publish-crash");
    const { transferProject } = await import("../../cli/lib/store/transfers.js");
    const crash = new Error("injected:beforeLockPublish");

    await expect(
      transferProject({
        context: { workspaceId: fixture.source.id },
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
        testHooks: { beforeLockPublish: () => { throw crash; } },
      } as any),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(dataRoot, ".maintenance.lock"))).toBe(false);
    expect(transferRowCount()).toBe(0);

    const completed = await transferProject({
      context: { workspaceId: fixture.source.id },
      projectId: fixture.project.id,
      destinationWorkspaceId: fixture.destination.id,
      expectedRowVersion: fixture.project.rowVersion,
    });
    expect(completed.state).toBe("completed");
  });

  test("does not switch ownership when destination directory fsync fails", async () => {
    const fixture = await projectWithObject("directory-fsync-failure");
    const { resumeProjectTransfer, transferProject } = await import(
      "../../cli/lib/store/transfers.js"
    );
    const crash = new Error("injected:destinationDirectorySync");

    await expect(
      transferProject({
        context: { workspaceId: fixture.source.id },
        projectId: fixture.project.id,
        destinationWorkspaceId: fixture.destination.id,
        expectedRowVersion: fixture.project.rowVersion,
        testHooks: {
          beforeDestinationDirectorySync: () => { throw crash; },
        },
      } as any),
    ).rejects.toThrow();
    expect(objectLocation(fixture.object.id).workspaceId).toBe(fixture.source.id);
    expect(
      getProject({
        workspaceId: fixture.source.id,
        projectId: fixture.project.id,
      }).id,
    ).toBe(fixture.project.id);

    let directorySyncs = 0;
    const completed = await resumeProjectTransfer(latestTransferId(), {
      context: { workspaceId: fixture.source.id },
      testHooks: {
        beforeDestinationDirectorySync: () => { directorySyncs += 1; },
      },
    } as any);
    expect(completed.state).toBe("completed");
    expect(directorySyncs).toBeGreaterThan(0);
  });
});

async function runCli(args: string[]): Promise<CliResult> {
  const child = Bun.spawn(
    ["bun", "run", CLI, "--json", "--cwd", fixtureRoot, ...args],
    {
      cwd: fixtureRoot,
      env: { ...process.env, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  let json: unknown = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    // Error cases intentionally have no stdout payload.
  }
  return { exitCode, stdout, stderr, json };
}

function expectOk<T>(result: CliResult): T {
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.json).not.toBeNull();
  return result.json as T;
}

function errorCode(stderr: string): string | null {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string } };
      if (parsed.error?.code) return parsed.error.code;
    } catch {
      // Diagnostics may precede the machine error payload.
    }
  }
  return null;
}

async function projectWithObject(name: string) {
  const source = createWorkspace({ slug: `${name}-source`, name: "Source" });
  const destination = createWorkspace({
    slug: `${name}-destination`,
    name: "Destination",
  });
  const project = createProject({
    workspaceId: source.id,
    slug: name,
    name,
  });
  const input = path.join(fixtureRoot, `${name}.txt`);
  fs.writeFileSync(input, "verified object bytes");
  const object = await ingestObject({
    scope: { workspaceId: source.id, projectId: project.id },
    sourcePath: input,
    originalName: `${name}.txt`,
    mime: "text/plain",
    storageClass: "durable",
    transfer: "move",
  });
  const location = objectLocation(object.id);
  const sourceBucket = `buckets/${source.id}/projects/${project.id}`;
  const destinationBucket = `buckets/${destination.id}/projects/${project.id}`;
  return {
    source,
    destination,
    project,
    object,
    objectPath: path.join(dataRoot, location.bucket, location.key),
    sourceBucket,
    destinationBucket,
  };
}

function objectLocation(id: string): {
  workspaceId: string;
  bucket: string;
  key: string;
} {
  return openDomainDb()
    .query<
      { workspaceId: string; bucket: string; key: string },
      [string]
    >("SELECT workspace_id AS workspaceId, bucket, key FROM objects WHERE id = ?")
    .get(id)!;
}

function transferRowCount(): number {
  return openDomainDb()
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM storage_transfers")
    .get()!.count;
}

function completedTransferRowCount(): number {
  return openDomainDb()
    .query<
      { count: number },
      []
    >("SELECT COUNT(*) AS count FROM storage_transfers WHERE state = 'completed'")
    .get()!.count;
}

function transferEntryCount(transferId: string): number {
  return openDomainDb()
    .query<
      { count: number },
      [string]
    >("SELECT COUNT(*) AS count FROM storage_transfer_entries WHERE transfer_id = ?")
    .get(transferId)!.count;
}

function latestTransferId(): string {
  return openDomainDb()
    .query<{ id: string }, []>(
      "SELECT id FROM storage_transfers ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get()!.id;
}
