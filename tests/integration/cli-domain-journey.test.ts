import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { createComposition, reviseComposition } from "../../cli/lib/store/compositions.js";
import { finishRun, startRun } from "../../cli/lib/store/runs.js";
import { createIteration, createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import { createUnitWithRevision, getUnit } from "../../cli/lib/store/units.js";
import { createBridgeMethods } from "../../cli/lib/bridge/methods.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let tmp: TmpRoot;

beforeEach(() => { tmp = makeTmpRoot("ralphy-domain-journey"); });
afterEach(() => { closeDomainDb(); tmp.cleanup(); });

describe("standalone domain journey", () => {
  test("keeps IDs and safe DTOs stable from authoring through bridge reads", async () => {
    const workspace = createWorkspace({ slug: "journey", name: "Journey" });
    const project = createProject({ workspaceId: workspace.id, slug: "launch", name: "Launch" });
    const iteration = createIteration({ projectId: project.id, title: "First pass", reason: "contract" });
    const session = startAgentSession({ workspaceId: workspace.id, projectId: project.id, agent: "codex" });
    const document = createDocument({ projectId: project.id, kind: "brief", slug: "brief", title: "Brief" });
    const revision = reviseDocument({
      documentId: document.id,
      expectedHeadId: null,
      iterationId: iteration.id,
      format: "markdown",
      title: "Brief v1",
      body: "A bounded domain journey.",
      authoredBySessionId: session.id,
    });
    const unitRevision = createUnitWithRevision({
      projectId: project.id,
      slug: "launch-pack",
      format: "document",
      iterationId: iteration.id,
      authoredBySessionId: session.id,
      items: [{ documentRevisionId: revision.id, role: "body", position: 0 }],
      presentations: [{ platform: "web", position: 0 }],
    });
    const composition = createComposition({ projectId: project.id, slug: "main", kind: "document" });
    const compositionRevision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      iterationId: iteration.id,
      engine: "document",
      authoredBySessionId: session.id,
    });
    const failedRun = startRun({ workspaceId: workspace.id, projectId: project.id, agentSessionId: session.id, kind: "journey.check" });
    finishRun(failedRun.id, { state: "failed", error: new Error("fixture failure") });

    let authority: undefined = undefined;
    const methods = createBridgeMethods({ dataRoot: tmp.dir });
    const context = {
      consumerSessions: new Set<string>(),
      activitySubscriptions: new Map<string, { sequence: number; ready: boolean }>(),
      helloComplete: true,
      markHello: () => undefined,
      setAuthority: (_authority: never) => { authority = undefined; },
      get authority() { return authority; },
    };
    const workspaceDto = await methods.get("workspace.show")!.handle({ workspaceId: workspace.id, context: { workspaceId: workspace.id } }, context);
    const documentPage = await methods.get("document.content")!.handle({
      context: { workspaceId: workspace.id, projectId: project.id },
      revisionId: revision.id,
      afterByte: 0,
      limitBytes: 65_536,
    }, context);
    const unitDto = getUnit({ context: { workspaceId: workspace.id, projectId: project.id }, unitId: unitRevision.unitId });
    const runDto = await methods.get("run.show")!.handle({ context: { workspaceId: workspace.id, projectId: project.id }, runId: failedRun.id }, context);

    expect(workspaceDto).toMatchObject({ id: workspace.id, slug: "journey" });
    expect(documentPage).toMatchObject({ revisionId: revision.id, text: "A bounded domain journey." });
    expect(unitDto.latestRevisionId).toBe(unitRevision.id);
    expect(compositionRevision.compositionId).toBe(composition.id);
    expect(runDto).toMatchObject({ id: failedRun.id, state: "failed" });
    expect(JSON.stringify({ workspaceDto, documentPage, unitDto, runDto })).not.toContain("path");
  });
});
