import { afterEach, describe, expect, test } from "bun:test";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { decodeCursor } from "../../cli/lib/store/pagination.js";
import {
  addFeedback,
  createIteration,
  createProject,
  createWorkspace,
  getFeedback,
  getFeedbackResolutionLink,
  getIteration,
  getProjectStage,
  listFeedback,
  listFeedbackResolutionLinks,
  listIterations,
  listProjectStages,
  resolveFeedback,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-scope-queries");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

function fixture() {
  makeRoot();
  const workspace = createWorkspace({ slug: "scope-query", name: "Scope query" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: "own",
    name: "Own",
  });
  const sibling = createProject({
    workspaceId: workspace.id,
    slug: "sibling",
    name: "Sibling",
  });
  const context = { workspaceId: workspace.id, projectId: project.id } as const;
  const siblingContext = {
    workspaceId: workspace.id,
    projectId: sibling.id,
  } as const;
  return { workspace, project, sibling, context, siblingContext };
}

function insertStage(input: {
  id: string;
  projectId: string;
  stage: string;
  updatedAt: number;
}): void {
  openDomainDb()
    .prepare(
      `INSERT INTO project_stages
       (id, project_id, stage, state, entity_type, entity_id, metadata_json,
        row_version, updated_at)
       VALUES (?, ?, ?, 'ready', 'build', 'build-safe', '{"private":"hidden"}', 2, ?)`,
    )
    .run(input.id, input.projectId, input.stage, input.updatedAt);
}

describe("bounded Project child queries", () => {
  test("returns explicit safe detail DTOs through direct and Session contexts", () => {
    const f = fixture();
    const iteration = createIteration({
      projectId: f.project.id,
      title: "Client corrections",
      reason: "feedback",
    });
    const feedback = addFeedback({
      iterationId: iteration.id,
      body: "Shorten the opening.",
      timecodeMs: 1250,
    });
    resolveFeedback(feedback.id, { note: "Opening shortened." });
    openDomainDb()
      .prepare(
        `INSERT INTO feedback_resolution_links
         (id, feedback_id, entity_type, entity_id, created_at)
         VALUES ('fblink-safe', ?, 'build', 'build-safe', 1000)`,
      )
      .run(feedback.id);
    insertStage({ id: "stage-safe", projectId: f.project.id, stage: "render", updatedAt: 1000 });
    const session = startAgentSession({
      workspaceId: f.workspace.id,
      projectId: f.project.id,
      agent: "scope-query-test",
    });

    const iterationDto = getIteration({ context: f.context, iterationId: iteration.id });
    expect(Object.keys(iterationDto).sort()).toEqual([
      "closedAt",
      "createdAt",
      "id",
      "number",
      "projectId",
      "reason",
      "state",
      "title",
    ]);
    expect(iterationDto).toMatchObject({
      id: iteration.id,
      projectId: f.project.id,
      title: "Client corrections",
      reason: "feedback",
    });

    const feedbackDto = getFeedback({
      context: { sessionId: session.id },
      feedbackId: feedback.id,
    });
    expect(Object.keys(feedbackDto).sort()).toEqual([
      "body",
      "createdAt",
      "id",
      "iterationId",
      "projectId",
      "resolutionNote",
      "resolvedAt",
      "status",
      "targetId",
      "targetType",
      "timecodeMs",
    ]);
    expect(feedbackDto).toMatchObject({
      projectId: f.project.id,
      iterationId: iteration.id,
      body: "Shorten the opening.",
      timecodeMs: 1250,
      status: "resolved",
      resolutionNote: "Opening shortened.",
    });

    expect(
      getFeedbackResolutionLink({
        context: f.context,
        linkId: "fblink-safe",
      }),
    ).toEqual({
      id: "fblink-safe",
      projectId: f.project.id,
      feedbackId: feedback.id,
      entityType: "build",
      entityId: "build-safe",
      createdAt: 1000,
    });
    expect(getProjectStage({ context: f.context, stageId: "stage-safe" })).toEqual({
      id: "stage-safe",
      projectId: f.project.id,
      stage: "render",
      state: "ready",
      entityType: "build",
      entityId: "build-safe",
      rowVersion: 2,
      updatedAt: 1000,
    });
  });

  test("lets a Workspace read its Project while sibling and ended Sessions stay bounded", () => {
    const f = fixture();
    const iteration = createIteration({ projectId: f.project.id, title: "Own" });
    const feedback = addFeedback({ iterationId: iteration.id, body: "Own feedback" });
    openDomainDb()
      .prepare(
        `INSERT INTO feedback_resolution_links
         (id, feedback_id, entity_type, entity_id, created_at)
         VALUES ('fblink-own', ?, 'build', 'build-own', 1)`,
      )
      .run(feedback.id);
    insertStage({ id: "stage-own", projectId: f.project.id, stage: "edit", updatedAt: 1 });
    const workspaceContext = { workspaceId: f.workspace.id } as const;
    const siblingSession = startAgentSession({
      workspaceId: f.workspace.id,
      projectId: f.sibling.id,
      agent: "sibling-scope-query-test",
    });
    const endedSession = startAgentSession({
      workspaceId: f.workspace.id,
      projectId: f.project.id,
      agent: "ended-scope-query-test",
    });
    endAgentSession(endedSession.id);

    expect(getIteration({ context: workspaceContext, iterationId: iteration.id }).id).toBe(
      iteration.id,
    );
    expect(getFeedback({ context: workspaceContext, feedbackId: feedback.id }).id).toBe(
      feedback.id,
    );
    expect(
      getFeedbackResolutionLink({ context: workspaceContext, linkId: "fblink-own" }).id,
    ).toBe("fblink-own");
    expect(getProjectStage({ context: workspaceContext, stageId: "stage-own" }).id).toBe(
      "stage-own",
    );
    expect(
      listIterations({ context: workspaceContext, projectId: f.project.id, limit: 10 }).items.map(
        (item) => item.id,
      ),
    ).toEqual([iteration.id]);
    expect(
      listFeedback({ context: workspaceContext, projectId: f.project.id, limit: 10 }).items.map(
        (item) => item.id,
      ),
    ).toEqual([feedback.id]);
    expect(
      listFeedbackResolutionLinks({
        context: workspaceContext,
        feedbackId: feedback.id,
        limit: 10,
      }).items.map((item) => item.id),
    ).toEqual(["fblink-own"]);
    expect(
      listProjectStages({ context: workspaceContext, projectId: f.project.id, limit: 10 }).items.map(
        (item) => item.id,
      ),
    ).toEqual(["stage-own"]);

    const reads = (context: { sessionId: string }) => [
      () => getIteration({ context, iterationId: iteration.id }),
      () => getFeedback({ context, feedbackId: feedback.id }),
      () => getFeedbackResolutionLink({ context, linkId: "fblink-own" }),
      () => getProjectStage({ context, stageId: "stage-own" }),
      () => listIterations({ context, projectId: f.project.id, limit: 10 }),
      () => listFeedback({ context, projectId: f.project.id, limit: 10 }),
      () => listFeedbackResolutionLinks({ context, feedbackId: feedback.id, limit: 10 }),
      () => listProjectStages({ context, projectId: f.project.id, limit: 10 }),
    ];
    for (const read of reads({ sessionId: siblingSession.id })) {
      expect(read).toThrow(/not found/i);
    }
    for (const read of reads({ sessionId: endedSession.id })) {
      expect(read).toThrow(/ended/i);
    }
  });

  test("pages every collection by its documented c1 order and tie-breaker", () => {
    const f = fixture();
    const iterations = ["one", "two", "three"].map((title) =>
      createIteration({ projectId: f.project.id, title }),
    );
    const db = openDomainDb();
    for (const iteration of iterations) {
      db.prepare("UPDATE project_iterations SET created_at = 1000 WHERE id = ?").run(iteration.id);
    }
    const sortedIterations = [...iterations].sort((a, b) => a.id.localeCompare(b.id));
    const firstIterations = listIterations({ context: f.context, projectId: f.project.id, limit: 2 });
    expect(firstIterations.items.map((item) => item.id)).toEqual(
      sortedIterations.slice(0, 2).map((item) => item.id),
    );
    expect(decodeCursor("c1", firstIterations.nextCursor!)).toEqual({
      ordinal: 1000,
      id: sortedIterations[1]!.id,
    });
    expect(() => decodeCursor("v1", firstIterations.nextCursor!)).toThrow(/cursor/i);
    expect(
      listIterations({
        context: f.context,
        projectId: f.project.id,
        after: firstIterations.nextCursor,
        limit: 2,
      }).items.map((item) => item.id),
    ).toEqual([sortedIterations[2]!.id]);

    const feedback = iterations.map((iteration) =>
      addFeedback({ iterationId: iteration.id, body: iteration.title }),
    );
    for (const item of feedback) {
      db.prepare("UPDATE feedback_items SET created_at = 2000 WHERE id = ?").run(item.id);
    }
    const sortedFeedback = [...feedback].sort((a, b) => a.id.localeCompare(b.id));
    const firstFeedback = listFeedback({ context: f.context, projectId: f.project.id, limit: 2 });
    expect(firstFeedback.items.map((item) => item.id)).toEqual(
      sortedFeedback.slice(0, 2).map((item) => item.id),
    );
    expect(decodeCursor("c1", firstFeedback.nextCursor!)).toEqual({
      ordinal: 2000,
      id: sortedFeedback[1]!.id,
    });

    for (const id of ["link-c", "link-a", "link-b"]) {
      db.prepare(
        `INSERT INTO feedback_resolution_links
         (id, feedback_id, entity_type, entity_id, created_at)
         VALUES (?, ?, 'build', ?, 3000)`,
      ).run(id, feedback[0]!.id, `build-${id}`);
    }
    const firstLinks = listFeedbackResolutionLinks({
      context: f.context,
      feedbackId: feedback[0]!.id,
      limit: 2,
    });
    expect(firstLinks.items.map((item) => item.id)).toEqual(["link-a", "link-b"]);
    expect(decodeCursor("c1", firstLinks.nextCursor!)).toEqual({
      ordinal: 3000,
      id: "link-b",
    });

    for (const id of ["stage-c", "stage-a", "stage-b"]) {
      insertStage({ id, projectId: f.project.id, stage: id, updatedAt: 4000 });
    }
    const firstStages = listProjectStages({
      context: f.context,
      projectId: f.project.id,
      limit: 2,
    });
    expect(firstStages.items.map((item) => item.id)).toEqual(["stage-a", "stage-b"]);
    expect(decodeCursor("c1", firstStages.nextCursor!)).toEqual({
      ordinal: 4000,
      id: "stage-b",
    });
  });

  test("enforces list limits and reports missing details through public APIs", () => {
    const f = fixture();
    const iteration = createIteration({ projectId: f.project.id, title: "Own" });
    const feedback = addFeedback({ iterationId: iteration.id, body: "Own feedback" });

    for (const limit of [0, 101, 1.5]) {
      expect(() =>
        listIterations({ context: f.context, projectId: f.project.id, limit }),
      ).toThrow(/limit/i);
      expect(() =>
        listFeedback({ context: f.context, projectId: f.project.id, limit }),
      ).toThrow(/limit/i);
      expect(() =>
        listFeedbackResolutionLinks({ context: f.context, feedbackId: feedback.id, limit }),
      ).toThrow(/limit/i);
      expect(() =>
        listProjectStages({ context: f.context, projectId: f.project.id, limit }),
      ).toThrow(/limit/i);
    }

    expect(() => getIteration({ context: f.context, iterationId: "iter-missing" })).toThrow(
      /not found/i,
    );
    expect(() => getFeedback({ context: f.context, feedbackId: "feedback-missing" })).toThrow(
      /not found/i,
    );
    expect(() =>
      getFeedbackResolutionLink({ context: f.context, linkId: "link-missing" }),
    ).toThrow(/not found/i);
    expect(() => getProjectStage({ context: f.context, stageId: "stage-missing" })).toThrow(
      /not found/i,
    );
  });
});
