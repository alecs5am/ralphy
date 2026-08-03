import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
  getArtifact,
  selectArtifactRevision,
} from "../../cli/lib/store/artifacts.js";
import {
  createComposition,
  putCompositionSource,
  reviseComposition,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { listEvaluations } from "../../cli/lib/store/evaluations.js";
import {
  OBJECT_REFERENCE_SOURCES,
  getMediaCards,
  listMedia,
  reviewMedia,
} from "../../cli/lib/store/media.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { recordRunObject, startRun } from "../../cli/lib/store/runs.js";
import {
  createIteration,
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import { endAgentSession, startAgentSession } from "../../cli/lib/store/sessions.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-media");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

async function ingest(root: TmpRoot, name: string, scope: {
  workspaceId: string;
  projectId?: string;
}) {
  const filePath = path.join(root.dir, name);
  fs.writeFileSync(filePath, name);
  return ingestObject({
    scope,
    sourcePath: filePath,
    originalName: name,
    mime: "image/png",
    storageClass: "durable",
  });
}

async function fixture(root: TmpRoot) {
  const workspace = createWorkspace({ slug: "media", name: "Media" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: "media",
    name: "Media",
  });
  const sibling = createProject({
    workspaceId: workspace.id,
    slug: "sibling",
    name: "Sibling",
  });
  const projectObject = await ingest(root, "project.png", {
    workspaceId: workspace.id,
    projectId: project.id,
  });
  const sharedObject = await ingest(root, "shared.png", {
    workspaceId: workspace.id,
  });
  const siblingObject = await ingest(root, "sibling.png", {
    workspaceId: workspace.id,
    projectId: sibling.id,
  });
  const artifact = createArtifact({
    projectId: project.id,
    slug: "hero",
    kind: "image",
  });
  const revision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: projectObject.id,
    state: "working",
  });
  selectArtifactRevision({
    artifactId: artifact.id,
    revisionId: revision.id,
    expectedRevisionId: null,
  });
  const run = startRun({ projectId: project.id, kind: "diagnostic" });
  fs.mkdirSync(path.join(root.dir, ".ralphy", "tmp"), { recursive: true });
  fs.writeFileSync(path.join(root.dir, ".ralphy", "tmp", "trace.bin"), "trace");
  const runObject = recordRunObject({
    runId: run.id,
    path: "tmp/trace.bin",
    purpose: "diagnostic",
    state: "diagnostic",
    retention: "keep-on-failure",
    bytes: 5,
    sha256: createHash("sha256").update("trace").digest("hex"),
  });
  const session = startAgentSession({
    workspaceId: workspace.id,
    projectId: project.id,
    agent: "reviewer",
  });
  return {
    workspace,
    project,
    sibling,
    projectObject,
    sharedObject,
    siblingObject,
    artifact,
    revision,
    run,
    runObject,
    session,
  };
}

describe("media cards", () => {
  test("returns the mixed union in the caller's exact order", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const refs = [
      { type: "run-object", id: f.runObject.id },
      { type: "artifact", id: f.artifact.id },
      { type: "object", id: f.projectObject.id },
    ] as const;
    const cards = getMediaCards({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      refs: [...refs],
    });
    expect(cards.map((card) => card.ref)).toEqual([...refs].map((ref) => ({ ...ref })));

    expect(Object.keys(cards[1]!).sort()).toEqual([
      "bytes",
      "kind",
      "mime",
      "projectId",
      "ref",
      "revisionCount",
      "selectedAt",
      "selectedRevisionId",
      "selectedState",
      "slug",
      "workspaceId",
    ]);
    expect(cards[1]).toMatchObject({
      slug: "hero",
      kind: "image",
      selectedRevisionId: f.revision.id,
      selectedState: "working",
      mime: "image/png",
      revisionCount: 1,
    });
    expect(Object.keys(cards[0]!).sort()).toEqual([
      "bytes",
      "createdAt",
      "mime",
      "objectId",
      "projectId",
      "purpose",
      "ref",
      "retention",
      "runId",
      "state",
      "workspaceId",
    ]);
    // An unpromoted RunObject has no MIME anywhere in the database.
    expect(cards[0]).toMatchObject({ mime: null, objectId: null, bytes: 5 });
    expect(Object.keys(cards[2]!).sort()).toEqual([
      "bytes",
      "createdAt",
      "mime",
      "projectId",
      "ref",
      "referenceCount",
      "storageClass",
      "workspaceId",
    ]);
    expect(JSON.stringify(cards)).not.toMatch(
      /"(bucket|key|sha256|path|originalName|metadata)"/,
    );
  });

  test("rejects the whole batch atomically without naming the bad ref", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const context = { workspaceId: f.workspace.id, projectId: f.project.id };
    for (const refs of [
      [{ type: "artifact", id: f.artifact.id }, { type: "artifact", id: f.artifact.id }],
      [{ type: "object", id: f.siblingObject.id }],
      [{ type: "artifact", id: f.artifact.id }, { type: "object", id: "obj_missing" }],
    ] as const) {
      expect(() => getMediaCards({ context, refs: [...refs] })).toThrow();
      const message = (() => {
        try {
          getMediaCards({ context, refs: [...refs] });
          return "";
        } catch (error) {
          return (error as Error).message;
        }
      })();
      expect(message).not.toContain("obj_missing");
      expect(message).not.toContain(f.siblingObject.id);
    }
    expect(() => getMediaCards({ context, refs: [] })).toThrow(/1\.\.100/);
    expect(() =>
      getMediaCards({
        context,
        refs: Array.from({ length: 101 }, (_, index) => ({
          type: "object" as const,
          id: `obj_${index}`,
        })),
      }),
    ).toThrow(/1\.\.100/);
    expect(() =>
      getMediaCards({ context, refs: [{ type: "bogus" as never, id: "x" }] }),
    ).toThrow(/ref type/i);
  });

  test("scopes visibility to the Project plus Workspace-shared rows", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const projectView = listMedia({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      limit: 100,
    });
    const seen = projectView.items.map((card) => card.ref.id);
    expect(seen).toContain(f.projectObject.id);
    expect(seen).toContain(f.sharedObject.id);
    expect(seen).toContain(f.artifact.id);
    expect(seen).toContain(f.runObject.id);
    expect(seen).not.toContain(f.siblingObject.id);

    const workspaceView = listMedia({
      context: { workspaceId: f.workspace.id },
      limit: 100,
    });
    const workspaceIds = workspaceView.items.map((card) => card.ref.id);
    expect(workspaceIds).toEqual([f.sharedObject.id]);
  });

  test("filters by type and pages by the creation cursor", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const objectsOnly = listMedia({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      types: ["object"],
      limit: 100,
    });
    expect(objectsOnly.items.every((card) => card.ref.type === "object")).toBe(true);

    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page = listMedia({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        after,
        limit: 1,
      });
      seen.push(...page.items.map((card) => card.ref.id));
      if (page.nextCursor === null) break;
      expect(page.nextCursor.startsWith("c1.")).toBe(true);
      after = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(() =>
      listMedia({
        context: { workspaceId: f.workspace.id },
        after: "v1.W1sxLCJhIl0",
        limit: 5,
      }),
    ).toThrow(/cursor/i);
    expect(() =>
      listMedia({ context: { workspaceId: f.workspace.id }, types: [], limit: 5 }),
    ).toThrow(/at least one type/i);
  });

  test("counts every registered Object reference and detects registry drift", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const composition = createComposition({
      projectId: f.project.id,
      slug: "cut",
      kind: "video",
    });
    const revision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "remotion",
    });
    putCompositionSource({
      revisionId: revision.id,
      logicalPath: "project.png",
      objectId: f.projectObject.id,
    });
    const [card] = getMediaCards({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      refs: [{ type: "object", id: f.projectObject.id }],
    });
    // One artifact_revisions row plus one composition_revision_files row.
    expect(card).toMatchObject({ referenceCount: 2 });

    const db = openDomainDb();
    const actual = db
      .query<{ table: string; column: string }, []>(
        `SELECT m.name AS "table", fk."from" AS "column"
         FROM sqlite_master m
         JOIN pragma_foreign_key_list(m.name) fk
         WHERE m.type = 'table' AND fk."table" = 'objects'
         ORDER BY m.name, fk."from"`,
      )
      .all();
    expect(actual).toEqual(
      [...OBJECT_REFERENCE_SOURCES]
        .map((source) => ({ table: source.table, column: source.column }))
        .sort((left, right) =>
          left.table < right.table ? -1 : left.table > right.table ? 1 : 0,
        ),
    );
  });
});

describe("media review", () => {
  test("creates the state revision, selection, Evaluation, and feedback atomically", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const iteration = createIteration({ projectId: f.project.id, title: "v1" });
    const result = reviewMedia({
      ref: { type: "artifact", id: f.artifact.id },
      expectedSelectedRevisionId: f.revision.id,
      verdict: "needs-work",
      authoredBySessionId: f.session.id,
      iterationId: iteration.id,
      feedback: "Tighten the first beat.",
      favorite: true,
      rating: 3,
      tags: ["hook"],
    });
    expect(result.revisionId).not.toBe(f.revision.id);
    expect(result.card.selectedRevisionId).toBe(result.revisionId);
    expect(result.card.selectedState).toBe("candidate");
    expect(getArtifact(f.artifact.id).selectedRevisionId).toBe(result.revisionId);
    expect(result.evaluation).toMatchObject({
      target: { type: "artifact_revision", id: result.revisionId },
      kind: "media-review",
      verdict: "needs-work",
      favorite: true,
      rating: 3,
      tags: ["hook"],
      projectId: f.project.id,
    });
    expect(result.feedbackId).not.toBeNull();
    const feedback = openDomainDb()
      .query<{ body: string; targetId: string; status: string }, [string]>(
        `SELECT body, target_id AS targetId, status FROM feedback_items WHERE id = ?`,
      )
      .get(result.feedbackId!);
    expect(feedback).toEqual({
      body: "Tighten the first beat.",
      targetId: result.revisionId,
      status: "open",
    });
    const report = verifyDomainStore();
    // The fixture deliberately ingests Workspace and sibling Objects that
    // nothing references yet, so assert the chains under test.
    expect(report.brokenRevisionChains).toEqual([]);
    expect(report.sessionProvenanceIssues).toEqual([]);
    expect(report.runObjectIssues).toEqual([]);
  });

  test("maps each verdict to its state and rolls back a stale selection", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const first = reviewMedia({
      ref: { type: "artifact", id: f.artifact.id },
      expectedSelectedRevisionId: f.revision.id,
      verdict: "shortlist",
      authoredBySessionId: f.session.id,
    });
    expect(first.card.selectedState).toBe("candidate");
    const second = reviewMedia({
      ref: { type: "artifact", id: f.artifact.id },
      expectedSelectedRevisionId: first.revisionId,
      verdict: "approved",
      authoredBySessionId: f.session.id,
    });
    expect(second.card.selectedState).toBe("approved");

    const before = listEvaluations({
      context: { workspaceId: f.workspace.id, projectId: f.project.id },
      limit: 100,
    }).items.length;
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "rejected",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(StoreConflictError);
    expect(
      listEvaluations({
        context: { workspaceId: f.workspace.id, projectId: f.project.id },
        limit: 100,
      }).items.length,
    ).toBe(before);
    expect(getArtifact(f.artifact.id).selectedRevisionId).toBe(second.revisionId);
    expect(verifyDomainStore().brokenRevisionChains).toEqual([]);
  });

  test("rolls back every row when the Iteration is invalid", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    const iteration = createIteration({ projectId: f.project.id, title: "v1" });
    // No public close verb yet, so close it the way the store stores it.
    openDomainDb()
      .prepare(
        "UPDATE project_iterations SET state = 'closed', closed_at = 1 WHERE id = ?",
      )
      .run(iteration.id);
    const siblingIteration = createIteration({
      projectId: f.sibling.id,
      title: "sibling",
    });
    const db = openDomainDb();
    const counts = () => ({
      revisions: db
        .query<{ total: number }, [string]>(
          "SELECT COUNT(*) AS total FROM artifact_revisions WHERE artifact_id = ?",
        )
        .get(f.artifact.id)!.total,
      evaluations: db
        .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM evaluations")
        .get()!.total,
      feedback: db
        .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM feedback_items")
        .get()!.total,
    });
    const before = counts();
    for (const iterationId of [iteration.id, siblingIteration.id, "iter_missing"]) {
      expect(() =>
        reviewMedia({
          ref: { type: "artifact", id: f.artifact.id },
          expectedSelectedRevisionId: f.revision.id,
          verdict: "needs-work",
          authoredBySessionId: f.session.id,
          iterationId,
          feedback: "note",
        }),
      ).toThrow();
    }
    expect(counts()).toEqual(before);
    expect(getArtifact(f.artifact.id).selectedRevisionId).toBe(f.revision.id);
  });

  test("requires an Iteration and feedback for needs-work on a Project Artifact", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "needs-work",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(/requires an Iteration and feedback/i);
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "shortlist",
        authoredBySessionId: f.session.id,
        feedback: "no iteration",
      }),
    ).toThrow(/requires an Iteration/i);
  });

  test("a Workspace Artifact review takes no Iteration or feedback", async () => {
    const root = makeRoot();
    const workspace = createWorkspace({ slug: "ws-media", name: "WS" });
    const object = await ingest(root, "ws.png", { workspaceId: workspace.id });
    const artifact = createArtifact({
      workspaceId: workspace.id,
      slug: "shared",
      kind: "image",
    });
    const revision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "working",
    });
    selectArtifactRevision({
      artifactId: artifact.id,
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    const session = startAgentSession({
      workspaceId: workspace.id,
      agent: "reviewer",
    });
    const result = reviewMedia({
      ref: { type: "artifact", id: artifact.id },
      expectedSelectedRevisionId: revision.id,
      verdict: "needs-work",
      authoredBySessionId: session.id,
    });
    expect(result.card.selectedState).toBe("candidate");
    expect(result.feedbackId).toBeNull();
    expect(result.evaluation.projectId).toBeNull();
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: artifact.id },
        expectedSelectedRevisionId: result.revisionId,
        verdict: "shortlist",
        authoredBySessionId: session.id,
        feedback: "not allowed",
      }),
    ).toThrow(/no Iteration or feedback/i);
    expect(verifyDomainStore().integrity).toBe("ok");
  });

  test("refuses a non-Artifact ref, an unselected Artifact, and a dead Session", async () => {
    const root = makeRoot();
    const f = await fixture(root);
    for (const ref of [
      { type: "object" as const, id: f.projectObject.id },
      { type: "run-object" as const, id: f.runObject.id },
    ]) {
      expect(() =>
        reviewMedia({
          ref,
          expectedSelectedRevisionId: f.revision.id,
          verdict: "approved",
          authoredBySessionId: f.session.id,
        }),
      ).toThrow(/only an Artifact ref is reviewable/i);
    }
    const unselected = createArtifact({
      projectId: f.project.id,
      slug: "unselected",
      kind: "image",
    });
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: unselected.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "approved",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(/must be selected/i);
    endAgentSession(f.session.id);
    expect(() =>
      reviewMedia({
        ref: { type: "artifact", id: f.artifact.id },
        expectedSelectedRevisionId: f.revision.id,
        verdict: "approved",
        authoredBySessionId: f.session.id,
      }),
    ).toThrow(/ended/i);
  });
});
