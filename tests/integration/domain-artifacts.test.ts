import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRelation,
  addArtifactRevision,
  addArtifactUsage,
  createArtifact,
  getArtifact,
  getArtifactRelation,
  getArtifactRevision,
  getArtifactUsage,
  listArtifactRelations,
  listArtifactRevisions,
  listArtifactUsages,
  listArtifacts,
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
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import { decodeCursor } from "../../cli/lib/store/pagination.js";
import type { QueryContext } from "../../cli/lib/store/scope-context.js";
import type { ProjectRow, WorkspaceRow } from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain Artifact store", () => {
  test("creates Workspace and Project identities and rejects invalid kinds or scopes", () => {
    const { workspace, project } = setupProject("identity");
    const context = { workspaceId: workspace.id };
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

    expect(getArtifact({ context, artifactId: shared.id })).toEqual(shared);
    expect(local).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      selectedRevisionId: null,
      rowVersion: 1,
    });
    expect(() =>
      getArtifact({ context, artifactId: "art_missing" }),
    ).toThrow(/Artifact not found/);
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
      scopedActivity({ workspaceId: workspace.id })
        .filter((event) => event.entityType === "artifact")
        .map((event) => event.action),
    ).toEqual(["artifact.created", "artifact.created"]);
  });

  test("reads only safe Artifact identity and revision fields inside the query scope", async () => {
    const { root, workspace, project } = setupProject("safe-read");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "safe-read-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const shared = createArtifact({
      workspaceId: workspace.id,
      slug: "shared",
      kind: "image",
    });
    const local = createArtifact({
      projectId: project.id,
      slug: "local",
      kind: "image",
    });
    const siblingArtifact = createArtifact({
      projectId: sibling.id,
      slug: "sibling",
      kind: "image",
    });
    const outsideArtifact = createArtifact({
      projectId: outsideProject.id,
      slug: "outside",
      kind: "image",
    });
    const object = await storeBytes(root, workspace, project, "private.bin");
    const revision = addArtifactRevision({
      artifactId: local.id,
      objectId: object.id,
      state: "working",
      metadata: {
        sourceLocator: "/private/poison.mov",
        providerResponse: "private response",
      },
    });
    const siblingObject = await storeBytes(
      root,
      workspace,
      sibling,
      "sibling-private.bin",
    );
    const siblingRevision = addArtifactRevision({
      artifactId: siblingArtifact.id,
      objectId: siblingObject.id,
      state: "working",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-reader",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-reader",
    });
    const endedSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "ended-reader",
    });
    endAgentSession(endedSession.id);

    const artifactKeys = [
      "createdAt",
      "id",
      "kind",
      "projectId",
      "rowVersion",
      "selectedRevisionId",
      "slug",
      "updatedAt",
      "workspaceId",
    ];
    const revisionKeys = [
      "artifactId",
      "authoredBySessionId",
      "createdAt",
      "id",
      "iterationId",
      "objectId",
      "parentRevisionId",
      "revisionNo",
      "state",
    ];
    const projectContext = {
      workspaceId: workspace.id,
      projectId: project.id,
    };
    expect(
      Object.keys(getArtifact({ context: projectContext, artifactId: local.id })).sort(),
    ).toEqual(artifactKeys);
    expect(Object.keys(revision).sort()).toEqual(revisionKeys);
    expect(
      Object.keys(
        getArtifactRevision({ context: projectContext, revisionId: revision.id }),
      ).sort(),
    ).toEqual(revisionKeys);
    expect(
      JSON.stringify(
        getArtifactRevision({ context: projectContext, revisionId: revision.id }),
      ),
    ).not.toMatch(/metadata|poison|private response|sourceLocator/);

    expect(
      getArtifact({
        context: { workspaceId: workspace.id },
        artifactId: shared.id,
      }).id,
    ).toBe(shared.id);
    expect(
      getArtifact({
        context: { sessionId: workspaceSession.id },
        artifactId: shared.id,
      }).id,
    ).toBe(shared.id);
    expect(
      getArtifact({
        context: { sessionId: projectSession.id },
        artifactId: shared.id,
      }).id,
    ).toBe(shared.id);
    expect(
      getArtifact({
        context: { sessionId: projectSession.id },
        artifactId: local.id,
      }).id,
    ).toBe(local.id);

    for (const context of [
      { workspaceId: workspace.id },
      { sessionId: workspaceSession.id },
    ] as const) {
      expect(() => getArtifact({ context, artifactId: local.id })).toThrow(
        `Artifact not found: ${local.id}`,
      );
      expect(() => getArtifact({ context, artifactId: "art_missing" })).toThrow(
        "Artifact not found: art_missing",
      );
      expect(() =>
        getArtifactRevision({ context, revisionId: revision.id }),
      ).toThrow(`Artifact Revision not found: ${revision.id}`);
      expect(() =>
        listArtifactRevisions({
          context,
          artifactId: local.id,
          limit: 10,
        }),
      ).toThrow(`Artifact not found: ${local.id}`);
    }
    for (const context of [
      projectContext,
      { sessionId: projectSession.id },
    ] as const) {
      expect(() =>
        getArtifact({ context, artifactId: siblingArtifact.id }),
      ).toThrow(`Artifact not found: ${siblingArtifact.id}`);
      expect(() =>
        getArtifactRevision({ context, revisionId: siblingRevision.id }),
      ).toThrow(`Artifact Revision not found: ${siblingRevision.id}`);
      expect(() =>
        listArtifactRevisions({
          context,
          artifactId: siblingArtifact.id,
          limit: 10,
        }),
      ).toThrow(`Artifact not found: ${siblingArtifact.id}`);
    }
    expect(() =>
      listArtifactRevisions({
        context: projectContext,
        artifactId: "art_missing",
        limit: 10,
      }),
    ).toThrow("Artifact not found: art_missing");
    expect(() =>
      getArtifact({ context: projectContext, artifactId: outsideArtifact.id }),
    ).toThrow(`Artifact not found: ${outsideArtifact.id}`);
    expect(() =>
      getArtifactRevision({
        context: projectContext,
        revisionId: "arev_missing",
      }),
    ).toThrow("Artifact Revision not found: arev_missing");
    expect(() =>
      getArtifact({
        context: { sessionId: endedSession.id },
        artifactId: local.id,
      }),
    ).toThrow(/ended/i);
  });

  test("pages visible Artifact identities and revision history with typed cursors", async () => {
    const { root, workspace, project } = setupProject("safe-pages");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "safe-pages-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const shared = createArtifact({
      workspaceId: workspace.id,
      slug: "shared",
      kind: "image",
    });
    const own = ["a", "b", "c"].map((slug) =>
      createArtifact({ projectId: project.id, slug, kind: "image" }),
    );
    const siblingArtifact = createArtifact({
      projectId: sibling.id,
      slug: "sibling",
      kind: "image",
    });
    createArtifact({
      projectId: outsideProject.id,
      slug: "outside",
      kind: "image",
    });
    openDomainDb()
      .prepare("UPDATE artifacts SET created_at = ? WHERE workspace_id = ?")
      .run(1234, workspace.id);

    const workspaceContext = { workspaceId: workspace.id };
    const projectContext = {
      workspaceId: workspace.id,
      projectId: project.id,
    };
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-list-reader",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-list-reader",
    });
    const expectedWorkspaceIds = [shared.id];
    const expectedProjectIds = [shared, ...own]
      .map((artifact) => artifact.id)
      .sort();
    expect(pageArtifactIds(workspaceContext)).toEqual(expectedWorkspaceIds);
    expect(pageArtifactIds({ sessionId: workspaceSession.id })).toEqual(
      expectedWorkspaceIds,
    );
    expect(pageArtifactIds(projectContext)).toEqual(expectedProjectIds);
    expect(pageArtifactIds({ sessionId: projectSession.id })).toEqual(
      expectedProjectIds,
    );

    const object = await storeBytes(root, workspace, project, "history.bin");
    const revisions = ["working", "candidate", "approved"].map((state) =>
      addArtifactRevision({
        artifactId: own[0]!.id,
        objectId: object.id,
        state: state as "working" | "candidate" | "approved",
        metadata: { sourceLocator: `/private/${state}.bin` },
      }),
    );
    const firstArtifacts = listArtifacts({ context: projectContext, limit: 1 });
    const firstRevisions = listArtifactRevisions({
      context: projectContext,
      artifactId: own[0]!.id,
      limit: 1,
    });
    expect(firstArtifacts.nextCursor).toStartWith("c1.");
    expect(firstRevisions.nextCursor).toStartWith("v1.");
    expect(() =>
      listArtifacts({
        context: projectContext,
        after: firstRevisions.nextCursor,
        limit: 1,
      }),
    ).toThrow(/family/i);
    expect(() =>
      listArtifactRevisions({
        context: projectContext,
        artifactId: own[0]!.id,
        after: firstArtifacts.nextCursor,
        limit: 1,
      }),
    ).toThrow(/family/i);

    const revisionIds: string[] = [];
    let after: string | null | undefined;
    do {
      const page = listArtifactRevisions({
        context: projectContext,
        artifactId: own[0]!.id,
        after,
        limit: 1,
      });
      revisionIds.push(...page.items.map((revision) => revision.id));
      expect(JSON.stringify(page.items)).not.toMatch(/metadata|private/);
      after = page.nextCursor;
    } while (after);
    expect(revisionIds).toEqual(revisions.map((revision) => revision.id));

    expect(() =>
      listArtifactRevisions({
        context: projectContext,
        artifactId: siblingArtifact.id,
        limit: 10,
      }),
    ).toThrow(`Artifact not found: ${siblingArtifact.id}`);
    expect(() => listArtifacts({ context: projectContext, limit: 0 })).toThrow(
      /1 through 100/,
    );
    expect(() => listArtifacts({ context: projectContext, limit: 101 })).toThrow(
      /1 through 100/,
    );
    expect(() =>
      listArtifactRevisions({
        context: projectContext,
        artifactId: own[0]!.id,
        limit: 0,
      }),
    ).toThrow(/1 through 100/);
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
    });
    expect(
      openDomainDb()
        .query<{ metadata: string | null }, [string]>(
          "SELECT metadata_json AS metadata FROM artifact_revisions WHERE id = ?",
        )
        .get(sharedRevision.id),
    ).toEqual({ metadata: '{"source":"shared"}' });
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
    expect(
      getArtifactRevision({
        context: { workspaceId: workspace.id, projectId: project.id },
        revisionId: firstRevision.id,
      }).state,
    ).toBe("working");
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
    const activityCount = scopedActivity({ projectId: project.id }).length;
    expect(() =>
      selectArtifactRevision({
        artifactId: artifact.id,
        revisionId: r1.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/conflict/i);
    expect(
      getArtifact({
        context: { workspaceId: workspace.id, projectId: project.id },
        artifactId: artifact.id,
      }).selectedRevisionId,
    ).toBe(r2.id);
    expect(scopedActivity({ projectId: project.id })).toHaveLength(activityCount);

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
    expect(
      getArtifact({
        context: { workspaceId: workspace.id, projectId: project.id },
        artifactId: artifact.id,
      }).selectedRevisionId,
    ).toBe(r2.id);
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
    });
    expect(
      openDomainDb()
        .query<{ metadata: string | null }, [string]>(
          "SELECT metadata_json AS metadata FROM artifact_revisions WHERE id = ?",
        )
        .get(r2.id),
    ).toEqual({ metadata: '{"keep":true}' });
    expect(
      getArtifactRevision({
        context: { workspaceId: workspace.id, projectId: project.id },
        revisionId: r1.id,
      }).state,
    ).toBe("working");
    expect(
      getArtifact({
        context: { workspaceId: workspace.id, projectId: project.id },
        artifactId: artifact.id,
      }).selectedRevisionId,
    ).toBe(r2.id);

    const r3 = setArtifactRevisionState({
      revisionId: r1.id,
      state: "rejected",
    });
    expect(r3).toMatchObject({
      revisionNo: 3,
      parentRevisionId: r1.id,
      state: "rejected",
    });
    expect(
      getArtifact({
        context: { workspaceId: workspace.id, projectId: project.id },
        artifactId: artifact.id,
      }).selectedRevisionId,
    ).toBe(r2.id);
    // Activity is a safe public projection: it names the Artifact, not the
    // revision transition detail, which the store getters above already prove.
    expect(
      scopedActivity({ projectId: project.id })
        .filter((event) => event.action === "artifact.state_changed")
        .map((event) => ({
          entityType: event.entityType,
          entityId: event.entityId,
        })),
    ).toEqual([
      { entityType: "artifact", entityId: artifact.id },
      { entityType: "artifact", entityId: artifact.id },
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
    const activityBeforeRejectedTransition = scopedActivity({
      workspaceId: workspace.id,
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
    expect(scopedActivity({ workspaceId: workspace.id,})).toHaveLength(
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
    });
    expect(Object.keys(relation).sort()).toEqual([
      "createdAt",
      "fromRevisionId",
      "id",
      "relation",
      "toRevisionId",
    ]);
    expect(
      openDomainDb()
        .query<{ metadata: string | null }, [string]>(
          "SELECT metadata_json AS metadata FROM artifact_relations WHERE id = ?",
        )
        .get(relation.id),
    ).toEqual({ metadata: '{"method":"fixture"}' });
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

  test("reads and pages relations only when both exact revisions are visible", async () => {
    const { root, workspace, project } = setupProject("relation-queries");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const shared = await revisionFixture(root, workspace, null, "shared");
    const own = await revisionFixture(root, workspace, project, "own");
    const siblingRevision = await revisionFixture(
      root,
      workspace,
      sibling,
      "sibling",
    );
    const sharedSelf = addArtifactRelation({
      fromRevisionId: shared.id,
      toRevisionId: shared.id,
      relation: "variant-of",
      metadata: { privateLocator: "/private/shared.png" },
    });
    const sharedToOwn = addArtifactRelation({
      fromRevisionId: shared.id,
      toRevisionId: own.id,
      relation: "source-for",
      metadata: { providerResponse: "private" },
    });
    const ownToShared = addArtifactRelation({
      fromRevisionId: own.id,
      toRevisionId: shared.id,
      relation: "derived-from",
    });
    const ownToSibling = addArtifactRelation({
      fromRevisionId: own.id,
      toRevisionId: siblingRevision.id,
      relation: "derived-from",
    });
    const siblingToOwn = addArtifactRelation({
      fromRevisionId: siblingRevision.id,
      toRevisionId: own.id,
      relation: "source-for",
    });
    const relationChronology = [sharedToOwn.id, ownToShared.id].sort().reverse();
    const updateRelationTime = openDomainDb().prepare(
      "UPDATE artifact_relations SET created_at = ? WHERE id = ?",
    );
    updateRelationTime.run(1000, relationChronology[0]!);
    updateRelationTime.run(2000, relationChronology[1]!);

    const workspaceContext = { workspaceId: workspace.id };
    const projectContext = {
      workspaceId: workspace.id,
      projectId: project.id,
    };
    const relationKeys = [
      "createdAt",
      "fromRevisionId",
      "id",
      "relation",
      "toRevisionId",
    ];
    expect(
      Object.keys(
        getArtifactRelation({
          context: projectContext,
          relationId: sharedToOwn.id,
        }),
      ).sort(),
    ).toEqual(relationKeys);
    expect(
      JSON.stringify(
        getArtifactRelation({
          context: projectContext,
          relationId: sharedToOwn.id,
        }),
      ),
    ).not.toMatch(/metadata|private|provider|locator/i);
    expect(
      getArtifactRelation({
        context: workspaceContext,
        relationId: sharedSelf.id,
      }).id,
    ).toBe(sharedSelf.id);
    for (const relationId of [sharedToOwn.id, ownToSibling.id, "rel_missing"]) {
      expect(() =>
        getArtifactRelation({ context: workspaceContext, relationId }),
      ).toThrow(`Artifact Relation not found: ${relationId}`);
    }
    for (const relationId of [ownToSibling.id, siblingToOwn.id]) {
      expect(() =>
        getArtifactRelation({ context: projectContext, relationId }),
      ).toThrow(`Artifact Relation not found: ${relationId}`);
    }

    const seen: string[] = [];
    const cursorOrdinals: number[] = [];
    let after: string | null | undefined;
    do {
      const page = listArtifactRelations({
        context: projectContext,
        revisionId: own.id,
        after,
        limit: 1,
      });
      expect(page.items.every((item) => Object.keys(item).sort().join() === relationKeys.join())).toBeTrue();
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor) {
        expect(page.nextCursor).toStartWith("c1.");
        cursorOrdinals.push(decodeCursor("c1", page.nextCursor).ordinal);
      }
      after = page.nextCursor;
    } while (after);
    expect(seen).toEqual(relationChronology);
    expect(cursorOrdinals).toEqual([1000]);
    expect(
      listArtifactRelations({
        context: workspaceContext,
        revisionId: shared.id,
        limit: 10,
      }).items.map((item) => item.id),
    ).toEqual([sharedSelf.id]);
    expect(() =>
      listArtifactRelations({
        context: workspaceContext,
        revisionId: own.id,
        limit: 10,
      }),
    ).toThrow(`Artifact Revision not found: ${own.id}`);
    expect(() =>
      listArtifactRelations({
        context: projectContext,
        revisionId: own.id,
        after: "v1.WzEsImFyZXYiXQ",
        limit: 1,
      }),
    ).toThrow(/family/i);
    expect(() =>
      listArtifactRelations({
        context: projectContext,
        revisionId: own.id,
        limit: 0,
      }),
    ).toThrow(/1 through 100/);
  });

  test("reads and pages usages only when both revision and target are visible", async () => {
    const { root, workspace, project } = setupProject("usage-queries");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const iteration = createIteration({ projectId: project.id, title: "Review" });
    const feedback = addFeedback({ iterationId: iteration.id, body: "Revise it." });
    const siblingIteration = createIteration({
      projectId: sibling.id,
      title: "Sibling review",
    });
    const siblingFeedback = addFeedback({
      iterationId: siblingIteration.id,
      body: "Sibling-only feedback.",
    });
    const shared = await revisionFixture(root, workspace, null, "shared");
    const own = await revisionFixture(root, workspace, project, "own");
    const workspaceUsage = addArtifactUsage({
      artifactRevisionId: shared.id,
      workspaceId: workspace.id,
      role: "reference",
      lifecycle: "working",
    });
    const projectUsage = addArtifactUsage({
      artifactRevisionId: shared.id,
      projectId: project.id,
      role: "composition-input",
    });
    const feedbackUsage = addArtifactUsage({
      artifactRevisionId: shared.id,
      feedbackId: feedback.id,
      role: "resolution",
    });
    const siblingUsage = addArtifactUsage({
      artifactRevisionId: shared.id,
      projectId: sibling.id,
      role: "sibling-input",
    });
    const siblingFeedbackUsage = addArtifactUsage({
      artifactRevisionId: shared.id,
      feedbackId: siblingFeedback.id,
      role: "sibling-resolution",
    });
    const ownWorkspaceUsage = addArtifactUsage({
      artifactRevisionId: own.id,
      workspaceId: workspace.id,
      role: "deliverable",
    });
    const ownSiblingUsage = addArtifactUsage({
      artifactRevisionId: own.id,
      projectId: sibling.id,
      role: "sibling-deliverable",
    });
    const usageChronology = [
      workspaceUsage.id,
      projectUsage.id,
      feedbackUsage.id,
    ].sort().reverse();
    const updateUsageTime = openDomainDb().prepare(
      "UPDATE artifact_usages SET created_at = ? WHERE id = ?",
    );
    usageChronology.forEach((id, index) =>
      updateUsageTime.run(2000 + index * 1000, id),
    );
    openDomainDb().exec(`
      INSERT INTO artifact_usages
        (id, artifact_revision_id, context_type, context_id, role, created_at)
      VALUES ('usage_internal', '${shared.id}', 'legacy', 'private', 'internal', 5000);
    `);

    const workspaceContext = { workspaceId: workspace.id };
    const projectContext = {
      workspaceId: workspace.id,
      projectId: project.id,
    };
    const usageKeys = [
      "artifactRevisionId",
      "createdAt",
      "feedbackId",
      "id",
      "lifecycle",
      "projectId",
      "role",
      "workspaceId",
    ];
    expect(Object.keys(workspaceUsage).sort()).toEqual(usageKeys);
    expect(
      Object.keys(
        getArtifactUsage({
          context: projectContext,
          usageId: projectUsage.id,
        }),
      ).sort(),
    ).toEqual(usageKeys);
    expect(
      listArtifactUsages({
        context: workspaceContext,
        revisionId: shared.id,
        limit: 10,
      }).items.map((item) => item.id),
    ).toEqual([workspaceUsage.id]);

    const seen: string[] = [];
    const cursorOrdinals: number[] = [];
    let after: string | null | undefined;
    do {
      const page = listArtifactUsages({
        context: projectContext,
        revisionId: shared.id,
        after,
        limit: 1,
      });
      for (const item of page.items) {
        expect(Object.keys(item).sort()).toEqual(usageKeys);
        expect(JSON.stringify(item)).not.toMatch(/context|internal|private/i);
      }
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor) {
        expect(page.nextCursor).toStartWith("c1.");
        cursorOrdinals.push(decodeCursor("c1", page.nextCursor).ordinal);
      }
      after = page.nextCursor;
    } while (after);
    expect(seen).toEqual(usageChronology);
    expect(cursorOrdinals).toEqual([2000, 3000]);
    expect(
      listArtifactUsages({
        context: projectContext,
        revisionId: own.id,
        limit: 10,
      }).items.map((item) => item.id),
    ).toEqual([ownWorkspaceUsage.id]);
    for (const usageId of [
      siblingUsage.id,
      siblingFeedbackUsage.id,
      ownSiblingUsage.id,
      "usage_internal",
      "usage_missing",
    ]) {
      expect(() =>
        getArtifactUsage({ context: projectContext, usageId }),
      ).toThrow(`Artifact Usage not found: ${usageId}`);
    }
    expect(() =>
      getArtifactUsage({
        context: workspaceContext,
        usageId: projectUsage.id,
      }),
    ).toThrow(`Artifact Usage not found: ${projectUsage.id}`);
    expect(() =>
      listArtifactUsages({
        context: workspaceContext,
        revisionId: own.id,
        limit: 10,
      }),
    ).toThrow(`Artifact Revision not found: ${own.id}`);
    expect(() =>
      listArtifactUsages({
        context: projectContext,
        revisionId: shared.id,
        after: "v1.WzEsImFyZXYiXQ",
        limit: 1,
      }),
    ).toThrow(/family/i);
    expect(() =>
      listArtifactUsages({
        context: projectContext,
        revisionId: shared.id,
        limit: 101,
      }),
    ).toThrow(/1 through 100/);
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

function pageArtifactIds(context: QueryContext): string[] {
  const ids: string[] = [];
  let after: string | null | undefined;
  do {
    const page = listArtifacts({ context, after, limit: 1 });
    ids.push(...page.items.map((artifact) => artifact.id));
    after = page.nextCursor;
  } while (after);
  return ids;
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
  project: ProjectRow | null,
  label: string,
) {
  const object = await storeBytes(root, workspace, project, `${label}.bin`);
  const artifact = createArtifact(
    project
      ? { projectId: project.id, slug: label, kind: "data" }
      : { workspaceId: workspace.id, slug: label, kind: "data" },
  );
  return addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "working",
  });
}
