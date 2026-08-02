import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRelation,
  addArtifactRevision,
  addArtifactUsage,
  createArtifact,
  getArtifact,
  getArtifactRevision,
  selectArtifactRevision,
  setArtifactRevisionState,
} from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  ingestObject,
  resolveObjectPath,
} from "../../cli/lib/store/objects.js";
import {
  addFeedback,
  createIteration,
  createProject,
  createWorkspace,
  listActivity,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import type { ProjectRow, WorkspaceRow } from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain Artifact store", () => {
  test("creates Workspace and Project identities and rejects invalid kinds or scopes", () => {
    const { workspace, project } = setupProject("identity");
    const shared = createArtifact({
      workspaceId: workspace.id,
      slug: "brand-logo",
      kind: "image",
    });
    const local = createArtifact({
      projectId: project.id,
      slug: "scene-01",
      kind: "video",
    });

    expect(getArtifact(shared.id)).toEqual(shared);
    expect(local).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      selectedRevisionId: null,
      rowVersion: 1,
    });
    expect(() => getArtifact("art_missing")).toThrow(/Artifact not found/);
    expect(() =>
      createArtifact({
        workspaceId: workspace.id,
        projectId: project.id,
        slug: "invalid-scope",
        kind: "image",
      } as never),
    ).toThrow(/exactly one/);
    expect(() =>
      createArtifact({ slug: "missing-scope", kind: "image" } as never),
    ).toThrow(/exactly one/);
    expect(() =>
      createArtifact({
        workspaceId: workspace.id,
        slug: "legacy-ref",
        kind: "ref" as never,
      }),
    ).toThrow(/ref/i);
    expect(() =>
      createArtifact({
        workspaceId: workspace.id,
        slug: "unknown",
        kind: "hologram" as never,
      }),
    ).toThrow(/kind/i);
    expect(() =>
      createArtifact({
        workspaceId: workspace.id,
        slug: "brand-logo",
        kind: "image",
      }),
    ).toThrow();
    expect(
      listActivity({ workspaceId: workspace.id })
        .filter((event) => event.entityType === "artifact")
        .map((event) => event.action),
    ).toEqual(["artifact.created", "artifact.created"]);
  });

  test("binds revisions only to visible, present Object bytes", async () => {
    const { root, workspace, project } = setupProject("objects");
    const secondProject = createProject({
      workspaceId: workspace.id,
      slug: "second",
      name: "Second",
    });
    const otherWorkspace = createWorkspace({
      slug: "outside",
      name: "Outside",
    });
    const otherProject = createProject({
      workspaceId: otherWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const sharedObject = await storeBytes(root, workspace, null, "shared.png");
    const localObject = await storeBytes(root, workspace, project, "local.png");
    const secondLocalObject = await storeBytes(
      root,
      workspace,
      secondProject,
      "second.png",
    );
    const outsideObject = await storeBytes(
      root,
      otherWorkspace,
      otherProject,
      "outside.png",
    );
    const projectArtifact = createArtifact({
      projectId: project.id,
      slug: "scene",
      kind: "image",
    });
    const workspaceArtifact = createArtifact({
      workspaceId: workspace.id,
      slug: "logo",
      kind: "image",
    });

    expect(() =>
      addArtifactRevision({
        artifactId: projectArtifact.id,
        objectId: sharedObject.id,
        state: "working",
        metadata: { preview: "prefix data:image/png;base64,dmFsaWQ= suffix" },
      }),
    ).toThrow(/data URL/i);
    expect(() =>
      addArtifactRevision({
        artifactId: projectArtifact.id,
        objectId: sharedObject.id,
        state: "working",
        metadata: { imageData: "dmFsaWQ=" },
      }),
    ).toThrow(/base64/i);
    expect(() =>
      addArtifactRevision({
        artifactId: projectArtifact.id,
        objectId: sharedObject.id,
        state: "working",
        metadata: { score: Number.POSITIVE_INFINITY } as never,
      }),
    ).toThrow(/non-finite/i);

    const sharedRevision = addArtifactRevision({
      artifactId: projectArtifact.id,
      objectId: sharedObject.id,
      state: "working",
      metadata: { source: "shared" },
    });
    const localRevision = addArtifactRevision({
      artifactId: projectArtifact.id,
      objectId: localObject.id,
      parentRevisionId: sharedRevision.id,
      state: "candidate",
    });
    expect(sharedRevision).toMatchObject({
      revisionNo: 1,
      metadata: { source: "shared" },
    });
    expect(localRevision).toMatchObject({
      revisionNo: 2,
      parentRevisionId: sharedRevision.id,
    });
    expect(
      addArtifactRevision({
        artifactId: workspaceArtifact.id,
        objectId: sharedObject.id,
        state: "approved",
      }).revisionNo,
    ).toBe(1);
    expect(() =>
      addArtifactRevision({
        artifactId: workspaceArtifact.id,
        objectId: localObject.id,
        state: "working",
      }),
    ).toThrow(/shared Object/i);
    for (const objectId of [secondLocalObject.id, outsideObject.id]) {
      expect(() =>
        addArtifactRevision({
          artifactId: projectArtifact.id,
          objectId,
          state: "working",
        }),
      ).toThrow(/Object.*scope/i);
    }

    fs.rmSync(resolveObjectPath(localObject));
    expect(() =>
      addArtifactRevision({
        artifactId: projectArtifact.id,
        objectId: localObject.id,
        state: "rejected",
      }),
    ).toThrow(/missing/i);
    expect(
      openDomainDb()
        .query(
          "SELECT COUNT(*) AS count FROM artifact_revisions WHERE artifact_id = ?",
        )
        .get(projectArtifact.id),
    ).toEqual({ count: 2 });
  });

  test("validates parent and Iteration ownership and keeps revisions immutable", async () => {
    const { root, workspace, project } = setupProject("revision-scope");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "iteration-outside",
      name: "Outside",
    });
    const outside = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const ownIteration = createIteration({
      projectId: project.id,
      title: "Own",
    });
    const siblingIteration = createIteration({
      projectId: sibling.id,
      title: "Sibling",
    });
    const outsideIteration = createIteration({
      projectId: outside.id,
      title: "Outside",
    });
    const sharedObject = await storeBytes(root, workspace, null, "shared.bin");
    const localObject = await storeBytes(root, workspace, project, "local.bin");
    const firstArtifact = createArtifact({
      projectId: project.id,
      slug: "first",
      kind: "data",
    });
    const otherArtifact = createArtifact({
      projectId: project.id,
      slug: "other",
      kind: "data",
    });
    const workspaceArtifact = createArtifact({
      workspaceId: workspace.id,
      slug: "shared",
      kind: "data",
    });
    const firstRevision = addArtifactRevision({
      artifactId: firstArtifact.id,
      objectId: localObject.id,
      iterationId: ownIteration.id,
      state: "working",
    });
    const otherRevision = addArtifactRevision({
      artifactId: otherArtifact.id,
      objectId: localObject.id,
      state: "working",
    });

    expect(() =>
      addArtifactRevision({
        artifactId: firstArtifact.id,
        objectId: localObject.id,
        parentRevisionId: otherRevision.id,
        state: "candidate",
      }),
    ).toThrow(/parent/i);
    for (const iterationId of [siblingIteration.id, outsideIteration.id]) {
      expect(() =>
        addArtifactRevision({
          artifactId: firstArtifact.id,
          objectId: localObject.id,
          iterationId,
          state: "candidate",
        }),
      ).toThrow(/Iteration/i);
    }
    expect(
      addArtifactRevision({
        artifactId: workspaceArtifact.id,
        objectId: sharedObject.id,
        iterationId: siblingIteration.id,
        state: "working",
      }).iterationId,
    ).toBe(siblingIteration.id);
    expect(() =>
      addArtifactRevision({
        artifactId: workspaceArtifact.id,
        objectId: sharedObject.id,
        iterationId: outsideIteration.id,
        state: "working",
      }),
    ).toThrow(/Iteration/i);

    expect(() =>
      openDomainDb()
        .prepare(
          "UPDATE artifact_revisions SET state = 'approved' WHERE id = ?",
        )
        .run(firstRevision.id),
    ).toThrow(/immutable/i);
    expect(() =>
      openDomainDb()
        .prepare("DELETE FROM artifact_revisions WHERE id = ?")
        .run(firstRevision.id),
    ).toThrow(/immutable/i);
    expect(getArtifactRevision(firstRevision.id)?.state).toBe("working");
  });

  test("selects with an exact expected revision and rolls back stale or aborted writes", async () => {
    const { root, workspace, project } = setupProject("selection");
    const objectOne = await storeBytes(root, workspace, project, "one.bin");
    const objectTwo = await storeBytes(root, workspace, project, "two.bin");
    const artifact = createArtifact({
      projectId: project.id,
      slug: "scene",
      kind: "data",
    });
    openDomainDb().exec(`
      CREATE TRIGGER fail_artifact_revision_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'artifact.revised'
      BEGIN
        SELECT RAISE(ABORT, 'forced revision activity failure');
      END;
    `);
    expect(() =>
      addArtifactRevision({
        artifactId: artifact.id,
        objectId: objectOne.id,
        state: "working",
      }),
    ).toThrow(/forced revision activity failure/);
    expect(
      openDomainDb()
        .query("SELECT id FROM artifact_revisions WHERE artifact_id = ?")
        .get(artifact.id),
    ).toBeNull();
    openDomainDb().exec("DROP TRIGGER fail_artifact_revision_activity");
    const r1 = addArtifactRevision({
      artifactId: artifact.id,
      objectId: objectOne.id,
      state: "working",
    });
    const r2 = addArtifactRevision({
      artifactId: artifact.id,
      objectId: objectTwo.id,
      state: "candidate",
    });

    expect(() =>
      selectArtifactRevision({
        artifactId: artifact.id,
        revisionId: "arev_missing",
        expectedRevisionId: null,
      }),
    ).toThrow(/Revision not found/);
    selectArtifactRevision({
      artifactId: artifact.id,
      revisionId: r2.id,
      expectedRevisionId: null,
    });
    const activityCount = listActivity({ projectId: project.id }).length;
    expect(() =>
      selectArtifactRevision({
        artifactId: artifact.id,
        revisionId: r1.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/conflict/i);
    expect(getArtifact(artifact.id).selectedRevisionId).toBe(r2.id);
    expect(listActivity({ projectId: project.id })).toHaveLength(activityCount);

    openDomainDb().exec(`
      CREATE TRIGGER fail_artifact_selection_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'artifact.selected'
      BEGIN
        SELECT RAISE(ABORT, 'forced selection activity failure');
      END;
    `);
    expect(() =>
      selectArtifactRevision({
        artifactId: artifact.id,
        revisionId: r1.id,
        expectedRevisionId: r2.id,
      }),
    ).toThrow(/forced selection activity failure/);
    expect(getArtifact(artifact.id).selectedRevisionId).toBe(r2.id);
  });

  test("represents state transitions as new revisions and advances selection only from the selected source", async () => {
    const { root, workspace, project } = setupProject("state");
    const object = await storeBytes(root, workspace, project, "state.bin");
    const artifact = createArtifact({
      projectId: project.id,
      slug: "stateful",
      kind: "data",
    });
    const r1 = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "working",
      metadata: { keep: true },
    });
    selectArtifactRevision({
      artifactId: artifact.id,
      revisionId: r1.id,
      expectedRevisionId: null,
    });

    const r2 = setArtifactRevisionState({
      revisionId: r1.id,
      state: "approved",
    });
    expect(r2).toMatchObject({
      artifactId: artifact.id,
      objectId: object.id,
      revisionNo: 2,
      parentRevisionId: r1.id,
      state: "approved",
      metadata: { keep: true },
    });
    expect(getArtifactRevision(r1.id)?.state).toBe("working");
    expect(getArtifact(artifact.id).selectedRevisionId).toBe(r2.id);

    const r3 = setArtifactRevisionState({
      revisionId: r1.id,
      state: "rejected",
    });
    expect(r3).toMatchObject({
      revisionNo: 3,
      parentRevisionId: r1.id,
      state: "rejected",
    });
    expect(getArtifact(artifact.id).selectedRevisionId).toBe(r2.id);
    expect(
      listActivity({ projectId: project.id })
        .filter((event) => event.action === "artifact.state_changed")
        .map((event) => event.payload),
    ).toEqual([
      expect.objectContaining({
        sourceRevisionId: r1.id,
        revisionId: r2.id,
        from: "working",
        to: "approved",
        selectionAdvanced: true,
      }),
      expect.objectContaining({
        sourceRevisionId: r1.id,
        revisionId: r3.id,
        from: "working",
        to: "rejected",
        selectionAdvanced: false,
      }),
    ]);
  });

  test("validates revision authorship against Workspace and Project session scope", async () => {
    const { root, workspace, project } = setupProject("authorship");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "author-outside",
      name: "Outside",
    });
    const sharedObject = await storeBytes(
      root,
      workspace,
      null,
      "shared-author.bin",
    );
    const localObject = await storeBytes(
      root,
      workspace,
      project,
      "local-author.bin",
    );
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-agent",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-agent",
    });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "sibling-agent",
    });
    const outsideSession = startAgentSession({
      workspaceId: outsideWorkspace.id,
      agent: "outside-agent",
    });
    const endedSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "ended-agent",
    });
    endAgentSession(endedSession.id);
    const projectArtifact = createArtifact({
      projectId: project.id,
      slug: "authored-project",
      kind: "data",
    });
    const workspaceArtifact = createArtifact({
      workspaceId: workspace.id,
      slug: "authored-workspace",
      kind: "data",
    });

    const projectRevision = addArtifactRevision({
      artifactId: projectArtifact.id,
      objectId: localObject.id,
      state: "working",
      authoredBySessionId: projectSession.id,
    });
    expect(projectRevision.authoredBySessionId).toBe(projectSession.id);
    expect(
      addArtifactRevision({
        artifactId: projectArtifact.id,
        objectId: sharedObject.id,
        state: "candidate",
        authoredBySessionId: workspaceSession.id,
      }).authoredBySessionId,
    ).toBe(workspaceSession.id);
    expect(
      addArtifactRevision({
        artifactId: workspaceArtifact.id,
        objectId: sharedObject.id,
        state: "working",
        authoredBySessionId: workspaceSession.id,
      }).authoredBySessionId,
    ).toBe(workspaceSession.id);

    for (const authoredBySessionId of [
      siblingSession.id,
      outsideSession.id,
      endedSession.id,
      "session_missing",
    ]) {
      expect(() =>
        addArtifactRevision({
          artifactId: projectArtifact.id,
          objectId: localObject.id,
          state: "working",
          authoredBySessionId,
        }),
      ).toThrow(/session/i);
    }
    expect(() =>
      addArtifactRevision({
        artifactId: workspaceArtifact.id,
        objectId: sharedObject.id,
        state: "working",
        authoredBySessionId: projectSession.id,
      }),
    ).toThrow(/session/i);

    selectArtifactRevision({
      artifactId: projectArtifact.id,
      revisionId: projectRevision.id,
      expectedRevisionId: null,
    });
    const transitioned = setArtifactRevisionState({
      revisionId: projectRevision.id,
      state: "approved",
      authoredBySessionId: workspaceSession.id,
    });
    expect(transitioned.authoredBySessionId).toBe(workspaceSession.id);
    expect(
      setArtifactRevisionState({
        revisionId: transitioned.id,
        state: "candidate",
      }).authoredBySessionId,
    ).toBeNull();
    const beforeRejectedTransition = openDomainDb()
      .query<
        { count: number },
        [string]
      >("SELECT COUNT(*) AS count FROM artifact_revisions WHERE artifact_id = ?")
      .get(projectArtifact.id)!.count;
    const activityBeforeRejectedTransition = listActivity({
      workspaceId: workspace.id,
      limit: 100,
    }).length;
    expect(() =>
      setArtifactRevisionState({
        revisionId: transitioned.id,
        state: "rejected",
        authoredBySessionId: siblingSession.id,
      }),
    ).toThrow(/session/i);
    expect(
      openDomainDb()
        .query<
          { count: number },
          [string]
        >("SELECT COUNT(*) AS count FROM artifact_revisions WHERE artifact_id = ?")
        .get(projectArtifact.id)!.count,
    ).toBe(beforeRejectedTransition);
    expect(listActivity({ workspaceId: workspace.id, limit: 100 })).toHaveLength(
      activityBeforeRejectedTransition,
    );
  });

  test("links exact revisions only inside one Workspace and rejects duplicate relations", async () => {
    const { root, workspace, project } = setupProject("relations");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "relation-outside",
      name: "Outside",
    });
    const outside = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const first = await revisionFixture(root, workspace, project, "first");
    const siblingRevision = await revisionFixture(
      root,
      workspace,
      sibling,
      "sibling",
    );
    const outsideRevision = await revisionFixture(
      root,
      outsideWorkspace,
      outside,
      "outside",
    );

    const relation = addArtifactRelation({
      fromRevisionId: first.id,
      toRevisionId: siblingRevision.id,
      relation: "derived-from",
      metadata: { method: "fixture" },
    });
    expect(relation).toMatchObject({
      fromRevisionId: first.id,
      toRevisionId: siblingRevision.id,
      relation: "derived-from",
      metadata: { method: "fixture" },
    });
    expect(() =>
      addArtifactRelation({
        fromRevisionId: first.id,
        toRevisionId: outsideRevision.id,
        relation: "derived-from",
      }),
    ).toThrow(/Workspace/i);
    expect(() =>
      addArtifactRelation({
        fromRevisionId: first.id,
        toRevisionId: siblingRevision.id,
        relation: " ",
      }),
    ).toThrow(/relation/i);
    expect(() =>
      addArtifactRelation({
        fromRevisionId: first.id,
        toRevisionId: siblingRevision.id,
        relation: "derived-from",
      }),
    ).toThrow(/already exists|unique/i);
  });

  test("assigns exact usages to one validated Workspace, Project, or feedback target", async () => {
    const { root, workspace, project } = setupProject("usages");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const iteration = createIteration({
      projectId: sibling.id,
      title: "Review",
    });
    const feedback = addFeedback({
      iterationId: iteration.id,
      body: "Use this reference.",
    });
    const outsideWorkspace = createWorkspace({
      slug: "usage-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const outsideIteration = createIteration({
      projectId: outsideProject.id,
      title: "Outside",
    });
    const outsideFeedback = addFeedback({
      iterationId: outsideIteration.id,
      body: "Outside",
    });
    const revision = await revisionFixture(root, workspace, project, "usage");

    const workspaceUsage = addArtifactUsage({
      artifactRevisionId: revision.id,
      workspaceId: workspace.id,
      role: "reference",
      lifecycle: "working",
    });
    const projectUsage = addArtifactUsage({
      artifactRevisionId: revision.id,
      projectId: sibling.id,
      role: "composition-input",
    });
    const feedbackUsage = addArtifactUsage({
      artifactRevisionId: revision.id,
      feedbackId: feedback.id,
      role: "resolution",
    });
    expect(workspaceUsage).toMatchObject({
      workspaceId: workspace.id,
      projectId: null,
      feedbackId: null,
    });
    expect(projectUsage).toMatchObject({
      workspaceId: null,
      projectId: sibling.id,
      feedbackId: null,
    });
    expect(feedbackUsage).toMatchObject({
      workspaceId: null,
      projectId: null,
      feedbackId: feedback.id,
    });
    for (const invalid of [
      { artifactRevisionId: revision.id, role: "none" },
      {
        artifactRevisionId: revision.id,
        workspaceId: workspace.id,
        projectId: project.id,
        role: "two",
      },
      {
        artifactRevisionId: revision.id,
        workspaceId: outsideWorkspace.id,
        role: "outside",
      },
      {
        artifactRevisionId: revision.id,
        projectId: outsideProject.id,
        role: "outside",
      },
      {
        artifactRevisionId: revision.id,
        feedbackId: outsideFeedback.id,
        role: "outside",
      },
    ]) {
      expect(() => addArtifactUsage(invalid as never)).toThrow(
        /exactly one|Workspace/i,
      );
    }
    expect(() =>
      addArtifactUsage({
        artifactRevisionId: revision.id,
        projectId: project.id,
        role: " ",
      }),
    ).toThrow(/role/i);
    expect(() =>
      addArtifactUsage({
        artifactRevisionId: revision.id,
        workspaceId: workspace.id,
        role: "reference",
        lifecycle: "working",
      }),
    ).toThrow(/already exists/i);

    openDomainDb().exec(`
      CREATE TRIGGER fail_artifact_usage_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'artifact.usage_added'
      BEGIN
        SELECT RAISE(ABORT, 'forced usage activity failure');
      END;
    `);
    expect(() =>
      addArtifactUsage({
        artifactRevisionId: revision.id,
        projectId: project.id,
        role: "deliverable",
      }),
    ).toThrow(/forced usage activity failure/);
    expect(
      openDomainDb()
        .query(
          "SELECT id FROM artifact_usages WHERE artifact_revision_id = ? AND project_id = ? AND role = 'deliverable'",
        )
        .get(revision.id, project.id),
    ).toBeNull();
  });
});

function setupProject(label: string) {
  const root = makeTmpRoot(`ralphy-domain-artifacts-${label}`);
  roots.push(root);
  const workspace = createWorkspace({
    slug: `${label}-workspace`,
    name: label,
  });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${label}-project`,
    name: label,
  });
  return { root, workspace, project };
}

async function storeBytes(
  root: TmpRoot,
  workspace: WorkspaceRow,
  project: ProjectRow | null,
  name: string,
) {
  const sourcePath = path.join(
    root.dir,
    `source-${crypto.randomUUID()}-${name}`,
  );
  fs.writeFileSync(sourcePath, `bytes:${name}`);
  return ingestObject({
    scope: project
      ? { workspaceId: workspace.id, projectId: project.id }
      : { workspaceId: workspace.id },
    sourcePath,
    originalName: name,
    mime: "application/octet-stream",
    storageClass: "working",
  });
}

async function revisionFixture(
  root: TmpRoot,
  workspace: WorkspaceRow,
  project: ProjectRow,
  label: string,
) {
  const object = await storeBytes(root, workspace, project, `${label}.bin`);
  const artifact = createArtifact({
    projectId: project.id,
    slug: label,
    kind: "data",
  });
  return addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "working",
  });
}
