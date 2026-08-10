import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import { generationInput } from "../../cli/lib/generation-input.js";
import { requestDigest } from "../../cli/lib/store/canonical-json.js";
import { authenticateConsumer } from "../../cli/lib/store/consumer-auth.js";
import { startConsumerOperationRun } from "../../cli/lib/store/consumer-runs.js";
import {
  closeDomainDb,
  openDomainDb,
} from "../../cli/lib/store/db.js";
import {
  finishRun,
  finishRunAttempt,
  getMediaGenerationDetail,
  getRunObject,
  getRun,
  getRunAttempt,
  listRunObjects,
  listRunAttempts,
  listRuns,
  recordRunObject,
  recordRunResult,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { encodeCursor } from "../../cli/lib/store/pagination.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { withPoisonFarmReadTrap } from "../helpers/poison-farm.js";
import { installConsumer } from "../helpers/consumer-auth.js";

let root: TmpRoot | null = null;

async function addMediaRevision(input: {
  workspaceId: string;
  projectId: string;
  slug: string;
}) {
  const sourcePath = path.join(root!.dir, `${input.slug}.png`);
  fs.writeFileSync(sourcePath, input.slug);
  const object = await ingestObject({
    scope: { workspaceId: input.workspaceId, projectId: input.projectId },
    sourcePath,
    originalName: `${input.slug}.png`,
    mime: "image/png",
    storageClass: "durable",
  });
  const artifact = createArtifact({
    projectId: input.projectId,
    slug: input.slug,
    kind: "image",
  });
  const revision = addArtifactRevision({
    artifactId: artifact.id,
    objectId: object.id,
    state: "approved",
  });
  return { artifact, revision };
}

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = null;
});

describe("bounded Run queries", () => {
  test("returns only the safe Run identity fields", () => {
    root = makeTmpRoot("ralphy-run-query-detail");
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
      metadata: { path: "private/input.png" },
    });
    finishRun(run.id, { state: "failed", error: "private provider error" });

    const detail = getRun({
      context: { workspaceId: workspace.id, projectId: project.id },
      runId: run.id,
    });

    expect(Object.keys(detail).sort()).toEqual([
      "agentSessionId",
      "createdAt",
      "endedAt",
      "id",
      "kind",
      "label",
      "projectId",
      "startedAt",
      "state",
      "workspaceId",
    ]);
    expect(detail).toMatchObject({
      id: run.id,
      workspaceId: workspace.id,
      projectId: project.id,
      state: "failed",
    });
    expect(JSON.stringify(detail)).not.toContain("private");
  });

  test("pages Workspace and Project visibility by stable Run identity", () => {
    root = makeTmpRoot("ralphy-run-query-list");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const otherWorkspace = createWorkspace({ slug: "other", name: "Other" });
    const clock = spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const sharedRun = startRun({ workspaceId: workspace.id, kind: "shared" });
    const projectRun = startRun({ projectId: project.id, kind: "project" });
    const siblingRun = startRun({ projectId: sibling.id, kind: "sibling" });
    const otherRun = startRun({ workspaceId: otherWorkspace.id, kind: "other" });
    clock.mockRestore();

    const workspacePage = listRuns({
      context: { workspaceId: workspace.id },
      limit: 10,
    });
    expect(workspacePage.items.map((item) => item.id)).toEqual([sharedRun.id]);
    expect(workspacePage.items.map((item) => item.id)).not.toContain(projectRun.id);
    expect(workspacePage.items.map((item) => item.id)).not.toContain(siblingRun.id);
    expect(workspacePage.items.map((item) => item.id)).not.toContain(otherRun.id);

    const expected = [sharedRun.id, projectRun.id].sort();
    const first = listRuns({
      context: { workspaceId: workspace.id, projectId: project.id },
      limit: 1,
    });
    expect(first.items.map((item) => item.id)).toEqual(expected.slice(0, 1));
    expect(first.nextCursor).not.toBeNull();
    const second = listRuns({
      context: { workspaceId: workspace.id, projectId: project.id },
      after: first.nextCursor,
      limit: 1,
    });
    expect(second.items.map((item) => item.id)).toEqual(expected.slice(1));
    expect(second.nextCursor).toBeNull();
  });

  test("rejects invalid Run page limits and cursor families", () => {
    root = makeTmpRoot("ralphy-run-query-list-bounds");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const context = { workspaceId: workspace.id };

    expect(() => listRuns({ context, limit: 0 })).toThrow(
      "Limit must be an integer from 1 through 100",
    );
    expect(() => listRuns({ context, limit: 101 })).toThrow(
      "Limit must be an integer from 1 through 100",
    );
    expect(() => listRuns({ context, limit: 1.5 })).toThrow(
      "Limit must be an integer from 1 through 100",
    );
    expect(() =>
      listRuns({
        context,
        after: encodeCursor("v1", { ordinal: 0, id: "run_test" }),
        limit: 1,
      }),
    ).toThrow("Cursor family is invalid");
  });

  test("returns and pages only safe Run Attempt fields", () => {
    root = makeTmpRoot("ralphy-run-attempt-query");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const run = startRun({ projectId: project.id, kind: "generation" });
    const firstAttempt = startRunAttempt({
      runId: run.id,
      provider: "fixture",
      model: "fixture/private-model",
      request: { path: "private/request.png" },
    });
    finishRunAttempt(firstAttempt.id, {
      state: "failed",
      response: { body: "private response" },
      costUsd: 1.25,
      error: "private provider error",
    });
    finishRun(run.id, { state: "failed" });
    const secondAttempt = startRunAttempt({ runId: run.id, provider: "retry" });
    finishRunAttempt(secondAttempt.id, { state: "succeeded", costUsd: 0.5 });

    const context = { workspaceId: workspace.id, projectId: project.id };
    const detail = getRunAttempt({ context, attemptId: firstAttempt.id });
    expect(Object.keys(detail).sort()).toEqual([
      "attemptNo",
      "costUsd",
      "endedAt",
      "id",
      "model",
      "provider",
      "runId",
      "startedAt",
      "state",
    ]);
    expect(detail).toMatchObject({
      id: firstAttempt.id,
      runId: run.id,
      attemptNo: 1,
      provider: "fixture",
      state: "failed",
      costUsd: 1.25,
    });
    expect(JSON.stringify(detail)).not.toContain("private response");
    expect(JSON.stringify(detail)).not.toContain("private provider error");
    expect(JSON.stringify(detail)).not.toContain("private/request.png");

    const first = listRunAttempts({ context, runId: run.id, limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual([firstAttempt.id]);
    expect(first.nextCursor).not.toBeNull();
    const second = listRunAttempts({
      context,
      runId: run.id,
      after: first.nextCursor,
      limit: 1,
    });
    expect(second.items.map((item) => item.id)).toEqual([secondAttempt.id]);
    expect(second.nextCursor).toBeNull();
  });

  test("authorizes Run Attempts through their visible parent Run", () => {
    root = makeTmpRoot("ralphy-run-attempt-query-scope");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const run = startRun({ projectId: project.id, kind: "generation" });
    const attempt = startRunAttempt({ runId: run.id });
    const siblingContext = {
      workspaceId: workspace.id,
      projectId: sibling.id,
    };

    expect(() =>
      getRunAttempt({ context: siblingContext, attemptId: attempt.id }),
    ).toThrow(`Run Attempt not found: ${attempt.id}`);
    expect(() =>
      getRunAttempt({ context: siblingContext, attemptId: "attempt_missing" }),
    ).toThrow("Run Attempt not found: attempt_missing");
    expect(() =>
      listRunAttempts({ context: siblingContext, runId: run.id, limit: 1 }),
    ).toThrow(`Run not found: ${run.id}`);
    expect(() =>
      listRunAttempts({
        context: { workspaceId: workspace.id, projectId: project.id },
        runId: run.id,
        limit: 0,
      }),
    ).toThrow("Limit must be an integer from 1 through 100");
    expect(() =>
      listRunAttempts({
        context: { workspaceId: workspace.id, projectId: project.id },
        runId: run.id,
        after: encodeCursor("c1", { ordinal: 0, id: attempt.id }),
        limit: 1,
      }),
    ).toThrow("Cursor family is invalid");
  });

  test("returns safe RunObject locations with explicitly unknown attempt attribution", () => {
    root = makeTmpRoot("ralphy-run-object-query");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const run = startRun({ projectId: project.id, kind: "generation" });
    const firstAttempt = startRunAttempt({ runId: run.id, provider: "first" });
    finishRunAttempt(firstAttempt.id, { state: "failed" });
    finishRun(run.id, { state: "failed" });
    startRunAttempt({ runId: run.id, provider: "second" });
    const expected = [
      ["tmp/run/output.bin", "temp"],
      ["cache/run/output.bin", "cache"],
      ["buckets/workspace/output.bin", "bucket"],
      ["debug/run/output.bin", "other"],
    ] as const;
    const objects = expected.map(([logicalPath], index) => recordRunObject({
      runId: run.id,
      path: logicalPath,
      purpose: `evidence-${index}`,
      state: "working",
      retention: "keep",
    }));
    const context = { workspaceId: workspace.id, projectId: project.id };
    const page = listRunObjects({ context, runId: run.id, limit: 10 });
    for (const [index, object] of objects.entries()) {
      const detail = getRunObject({ context, runObjectId: object.id });
      const listed = page.items.find((item) => item.id === object.id)!;
      expect(detail).toEqual(listed);
      expect(detail).toMatchObject({
        logicalPath: expected[index]![0],
        locationClass: expected[index]![1],
        attemptId: null,
        attemptNo: null,
      });
      expect(Object.keys(detail).sort()).toEqual([
        "attemptId",
        "attemptNo",
        "bytes",
        "createdAt",
        "id",
        "locationClass",
        "logicalPath",
        "mime",
        "objectId",
        "projectId",
        "purpose",
        "retention",
        "runId",
        "state",
        "workspaceId",
      ]);
      expect(JSON.stringify(detail)).not.toMatch(
        /"(path|sha256|metadata|request|response|error)"/,
      );
    }
  });

  test("isolates external Runs by live consumer authority and exact scope", () => {
    root = makeTmpRoot("ralphy-run-query-consumer");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const consumer = installConsumer(root);
    const ownerSession = startConsumerSession(consumer.authority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const reconnectAuthority = authenticateConsumer(consumer.namespace, consumer.token);
    const reconnect = startConsumerSession(reconnectAuthority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const ownerWorkspaceSession = startConsumerSession(consumer.authority, {
      workspaceId: workspace.id,
    });
    const ordinarySession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "codex",
    });
    const ordinary = startRun({ projectId: project.id, kind: "ordinary" });
    const external = startConsumerOperationRun(consumer.authority, {
      sessionId: ownerSession.id,
      workspaceId: workspace.id,
      projectId: project.id,
      kind: "generation",
      external: {
        runId: "consumer-private-run",
        nodeId: "private-node",
        attempt: 1,
        operation: "private-operation",
        idempotencyKey: "private-key",
      },
      requestDigest: requestDigest({ path: "private/request.json" }),
    }).run;
    const attempt = startRunAttempt({
      runId: external.id,
      request: { path: "private/input.png" },
    });
    const ownerContext = {
      sessionId: reconnect.id,
      consumerAuthority: reconnectAuthority,
    };

    const detail = getRun({ context: ownerContext, runId: external.id });
    expect(detail.id).toBe(external.id);
    expect(JSON.stringify(detail)).not.toContain("consumer-private-run");
    expect(JSON.stringify(detail)).not.toContain("private-key");
    expect(listRuns({ context: ownerContext, limit: 10 }).items).toContainEqual(
      detail,
    );
    expect(
      getRunAttempt({ context: ownerContext, attemptId: attempt.id }).id,
    ).toBe(attempt.id);
    expect(() => getRun({ context: ownerContext, runId: ordinary.id })).toThrow(
      `Run not found: ${ordinary.id}`,
    );
    expect(listRuns({ context: ownerContext, limit: 10 }).items.map((item) => item.id)).not.toContain(
      ordinary.id,
    );
    for (const context of [
      { workspaceId: workspace.id, projectId: project.id },
      { sessionId: ordinarySession.id },
    ]) {
      expect(getRun({ context, runId: external.id }).id).toBe(external.id);
      expect(listRuns({ context, limit: 10 }).items.map((item) => item.id)).toContain(
        external.id,
      );
      expect(getRunAttempt({ context, attemptId: attempt.id }).id).toBe(attempt.id);
      expect(
        listRunAttempts({ context, runId: external.id, limit: 10 }).items.map(
          (item) => item.id,
        ),
      ).toEqual([attempt.id]);
    }

    for (const context of [
      { workspaceId: workspace.id },
      {
        sessionId: ownerWorkspaceSession.id,
        consumerAuthority: consumer.authority,
      },
    ]) {
      expect(() => getRun({ context, runId: external.id })).toThrow(
        `Run not found: ${external.id}`,
      );
      expect(listRuns({ context, limit: 10 }).items.map((item) => item.id)).not.toContain(
        external.id,
      );
      expect(() => getRunAttempt({ context, attemptId: attempt.id })).toThrow(
        `Run Attempt not found: ${attempt.id}`,
      );
    }

    for (const context of [
      { sessionId: ownerSession.id },
      {
        sessionId: ownerSession.id,
        consumerAuthority: reconnectAuthority,
      },
    ]) {
      expect(() => getRun({ context, runId: external.id })).toThrow(/authority|owned/i);
      expect(() => listRuns({ context, limit: 10 })).toThrow(/authority|owned/i);
      expect(() => getRunAttempt({ context, attemptId: attempt.id })).toThrow(
        /authority|owned/i,
      );
    }

    openDomainDb()
      .prepare("UPDATE consumer_principals SET disabled_at = ? WHERE id = ?")
      .run(Date.now(), consumer.id);
    for (const query of [
      () => getRun({ context: ownerContext, runId: ordinary.id }),
      () => listRuns({ context: ownerContext, limit: 10 }),
      () => getRunAttempt({ context: ownerContext, attemptId: attempt.id }),
      () =>
        listRunAttempts({ context: ownerContext, runId: external.id, limit: 10 }),
    ]) {
      expect(query).toThrow("Consumer authority is not live");
    }
  });

  test("uses active Session scope and never reads Farm bucket paths", () => {
    root = makeTmpRoot("ralphy-run-query-session-poison");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const sharedRun = startRun({ workspaceId: workspace.id, kind: "shared" });
    const projectRun = startRun({ projectId: project.id, kind: "project" });
    const siblingRun = startRun({ projectId: sibling.id, kind: "sibling" });
    const attempt = startRunAttempt({ runId: projectRun.id });
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "codex",
    });
    const context = { sessionId: session.id };
    expect(listRuns({ context, limit: 10 }).items.map((item) => item.id).sort()).toEqual(
      [sharedRun.id, projectRun.id].sort(),
    );
    expect(() => getRun({ context, runId: siblingRun.id })).toThrow(
      `Run not found: ${siblingRun.id}`,
    );

    const before = {
      run: getRun({ context, runId: projectRun.id }),
      runs: listRuns({ context, limit: 10 }),
      attempt: getRunAttempt({ context, attemptId: attempt.id }),
      attempts: listRunAttempts({ context, runId: projectRun.id, limit: 10 }),
    };
    const trapped = withPoisonFarmReadTrap(root.dir, () => ({
        run: getRun({ context, runId: projectRun.id }),
        runs: listRuns({ context, limit: 10 }),
        attempt: getRunAttempt({ context, attemptId: attempt.id }),
        attempts: listRunAttempts({ context, runId: projectRun.id, limit: 10 }),
      }));
    expect(trapped.touched).toEqual([]);
    expect(trapped.result).toEqual(before);

    endAgentSession(session.id);
    expect(() => listRuns({ context, limit: 10 })).toThrow(
      `Agent Session is ended: ${session.id}`,
    );
  });

  test("does not export an unbounded Run aggregate reader", async () => {
    const source = await Bun.file(
      path.join(import.meta.dir, "../../cli/lib/store/runs.ts"),
    ).text();
    expect(source).not.toContain("export function getRunAggregate");
  });
});

describe("media generation detail", () => {
  test("resolves an Artifact Revision producer, pages retries, and totals every attempt", async () => {
    root = makeTmpRoot("ralphy-media-generation-artifact");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const { revision } = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "hero",
    });
    const run = startRun({ projectId: project.id, kind: "generate.image" });
    recordRunResult(openDomainDb(), {
      runId: run.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: revision.id,
    });
    const firstAttempt = startRunAttempt({
      runId: run.id,
      provider: "fixture",
      model: "fixture-image",
      request: generationInput(
        [{ role: "prompt", value: "A safe hand-authored prompt" }],
        [{ name: "aspectRatio", value: "9:16" }],
      ),
    });
    finishRunAttempt(firstAttempt.id, { state: "failed", costUsd: 1.25 });
    finishRun(run.id, { state: "failed" });
    const secondAttempt = startRunAttempt({
      runId: run.id,
      provider: "retry",
      request: { slot: "legacy-private-slot" },
    });
    finishRunAttempt(secondAttempt.id, { state: "succeeded" });
    finishRun(run.id, { state: "succeeded" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const target = { type: "artifact-revision" as const, id: revision.id };

    const first = getMediaGenerationDetail({ context, target, limit: 1 });
    expect(first.status).toBe("generation");
    if (first.status !== "generation") throw new Error("Expected generation detail");
    expect(first.target).toEqual(target);
    expect(first.run).toMatchObject({
      id: run.id,
      kind: "generate.image",
      state: "succeeded",
      workspaceId: workspace.id,
      projectId: project.id,
    });
    expect(Object.keys(first.attempts.items[0]!).sort()).toEqual([
      "attemptNo",
      "costUsd",
      "endedAt",
      "id",
      "input",
      "model",
      "provider",
      "runId",
      "startedAt",
      "state",
    ]);
    expect(first.attempts.items[0]).toMatchObject({
      id: firstAttempt.id,
      runId: run.id,
      attemptNo: 1,
      state: "failed",
      costUsd: 1.25,
      input: {
        version: 1,
        texts: [
          {
            role: "prompt",
            value: "A safe hand-authored prompt",
            truncated: false,
          },
        ],
        parameters: [{ name: "aspectRatio", value: "9:16" }],
      },
    });
    expect(first.attempts.nextCursor).toBe(
      encodeCursor("p1", { ordinal: 1, id: firstAttempt.id }),
    );
    expect(first.cost).toEqual({ knownUsd: 1.25, complete: false });

    const second = getMediaGenerationDetail({
      context,
      target,
      after: first.attempts.nextCursor,
      limit: 1,
    });
    expect(second.status).toBe("generation");
    if (second.status !== "generation") throw new Error("Expected generation detail");
    expect(second.attempts.items[0]).toMatchObject({
      id: secondAttempt.id,
      runId: run.id,
      attemptNo: 2,
      state: "succeeded",
      input: null,
    });
    expect(second.attempts.nextCursor).toBeNull();
    expect(second.cost).toEqual({ knownUsd: 1.25, complete: false });
  });

  test("resolves a RunObject directly and preserves complete zero cost", () => {
    root = makeTmpRoot("ralphy-media-generation-run-object");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const run = startRun({ projectId: project.id, kind: "generation" });
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/output.png",
      purpose: "result",
      state: "ready",
      retention: "working",
    });
    const attempt = startRunAttempt({ runId: run.id });
    finishRunAttempt(attempt.id, { state: "succeeded", costUsd: 0 });
    finishRun(run.id, { state: "succeeded" });
    const target = { type: "run-object" as const, id: runObject.id };

    const detail = getMediaGenerationDetail({
      context: { workspaceId: workspace.id, projectId: project.id },
      target,
      limit: 20,
    });

    expect(detail.status).toBe("generation");
    if (detail.status !== "generation") throw new Error("Expected generation detail");
    expect(detail.target).toEqual(target);
    expect(detail.run.id).toBe(run.id);
    expect(detail.attempts.items).toHaveLength(1);
    expect(detail.attempts.items[0]).toMatchObject({
      id: attempt.id,
      state: "succeeded",
      costUsd: 0,
      input: null,
    });
    expect(detail.cost).toEqual({ knownUsd: 0, complete: true });

    const unknownCostRun = startRun({ projectId: project.id, kind: "generation" });
    const unknownCostObject = recordRunObject({
      runId: unknownCostRun.id,
      path: "tmp/unknown-cost.png",
      purpose: "result",
      state: "ready",
      retention: "working",
    });
    const unknownCostAttempt = startRunAttempt({ runId: unknownCostRun.id });
    finishRunAttempt(unknownCostAttempt.id, { state: "succeeded" });
    const unknownCost = getMediaGenerationDetail({
      context: { workspaceId: workspace.id, projectId: project.id },
      target: { type: "run-object", id: unknownCostObject.id },
      limit: 20,
    });
    expect(unknownCost.status).toBe("generation");
    if (unknownCost.status !== "generation") throw new Error("Expected generation detail");
    expect(unknownCost.cost).toEqual({ knownUsd: null, complete: false });

    const noAttemptRun = startRun({ projectId: project.id, kind: "generation" });
    const noAttemptObject = recordRunObject({
      runId: noAttemptRun.id,
      path: "tmp/no-attempt.png",
      purpose: "result",
      state: "ready",
      retention: "working",
    });
    const noAttempt = getMediaGenerationDetail({
      context: { workspaceId: workspace.id, projectId: project.id },
      target: { type: "run-object", id: noAttemptObject.id },
      limit: 20,
    });
    expect(noAttempt.status).toBe("generation");
    if (noAttempt.status !== "generation") throw new Error("Expected generation detail");
    expect(noAttempt.attempts.items).toEqual([]);
    expect(noAttempt.cost).toEqual({ knownUsd: null, complete: false });
  });

  test("reports complete cost independently from the requested page", async () => {
    root = makeTmpRoot("ralphy-media-generation-complete-cost");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const { revision } = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "complete",
    });
    const run = startRun({ projectId: project.id, kind: "generate.video" });
    recordRunResult(openDomainDb(), {
      runId: run.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: revision.id,
    });
    const first = startRunAttempt({ runId: run.id });
    finishRunAttempt(first.id, { state: "failed", costUsd: 0.75 });
    finishRun(run.id, { state: "failed" });
    const second = startRunAttempt({ runId: run.id });
    finishRunAttempt(second.id, { state: "succeeded", costUsd: 1.25 });

    const detail = getMediaGenerationDetail({
      context: { workspaceId: workspace.id, projectId: project.id },
      target: { type: "artifact-revision", id: revision.id },
      limit: 1,
    });

    expect(detail.status).toBe("generation");
    if (detail.status !== "generation") throw new Error("Expected generation detail");
    expect(detail.attempts.items).toHaveLength(1);
    expect(detail.cost).toEqual({ knownUsd: 2, complete: true });
  });

  test("distinguishes absent, ambiguous, and proven non-generation producers", async () => {
    root = makeTmpRoot("ralphy-media-generation-status");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const absent = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "absent",
    });
    const nonGeneration = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "rendered",
    });
    const ambiguous = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "ambiguous",
    });
    const renderRun = startRun({ projectId: project.id, kind: "render" });
    recordRunResult(openDomainDb(), {
      runId: renderRun.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: nonGeneration.revision.id,
    });
    for (const kind of ["generation", "generate.image"]) {
      const run = startRun({ projectId: project.id, kind });
      recordRunResult(openDomainDb(), {
        runId: run.id,
        position: 0,
        entityType: "artifact_revision",
        entityId: ambiguous.revision.id,
      });
    }

    expect(getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: absent.revision.id },
      limit: 20,
    })).toEqual({
      status: "unknown",
      target: { type: "artifact-revision", id: absent.revision.id },
      reason: "not-recorded",
    });
    expect(getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: ambiguous.revision.id },
      limit: 20,
    })).toEqual({
      status: "unknown",
      target: { type: "artifact-revision", id: ambiguous.revision.id },
      reason: "ambiguous",
    });
    expect(getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: nonGeneration.revision.id },
      limit: 20,
    })).toEqual({
      status: "not-generation",
      target: { type: "artifact-revision", id: nonGeneration.revision.id },
      producer: renderRun,
    });

    const invalidCursors = [
      {
        after: encodeCursor("c1", { ordinal: 0, id: "attempt_test" }),
        message: "Cursor family is invalid",
      },
      { after: "p1.!", message: "Cursor is malformed" },
    ];
    for (const id of [
      absent.revision.id,
      ambiguous.revision.id,
      nonGeneration.revision.id,
    ]) {
      for (const invalid of invalidCursors) {
        expect(() => getMediaGenerationDetail({
          context,
          target: { type: "artifact-revision", id },
          after: invalid.after,
          limit: 20,
        })).toThrow(invalid.message);
      }
    }
  });

  test("counts Artifact Revision producers before consumer Run visibility", async () => {
    root = makeTmpRoot("ralphy-media-generation-consumer-ambiguity");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const ambiguous = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "ambiguous-consumer",
    });
    const soleInvisible = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "sole-invisible",
    });
    const consumerA = installConsumer(root, {
      id: "consumer_a",
      namespace: "consumer-a",
      tokenByte: 1,
    });
    const consumerB = installConsumer(root, {
      id: "consumer_b",
      namespace: "consumer-b",
      tokenByte: 2,
    });
    const sessionA = startConsumerSession(consumerA.authority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const sessionB = startConsumerSession(consumerB.authority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    const internal = startRun({ projectId: project.id, kind: "generation" });
    const external = startConsumerOperationRun(consumerA.authority, {
      sessionId: sessionA.id,
      workspaceId: workspace.id,
      projectId: project.id,
      kind: "generation",
      external: {
        runId: "consumer-a-generation",
        nodeId: "image-node",
        attempt: 1,
        operation: "generation",
        idempotencyKey: "fixture",
      },
      requestDigest: requestDigest({ prompt: "safe digest input" }),
    }).run;
    for (const runId of [internal.id, external.id]) {
      recordRunResult(openDomainDb(), {
        runId,
        position: 0,
        entityType: "artifact_revision",
        entityId: ambiguous.revision.id,
      });
    }
    recordRunResult(openDomainDb(), {
      runId: external.id,
      position: 1,
      entityType: "artifact_revision",
      entityId: soleInvisible.revision.id,
    });
    const target = {
      type: "artifact-revision" as const,
      id: ambiguous.revision.id,
    };

    for (const [sessionId, consumerAuthority] of [
      [sessionA.id, consumerA.authority],
      [sessionB.id, consumerB.authority],
    ] as const) {
      expect(getMediaGenerationDetail({
        context: { sessionId, consumerAuthority },
        target,
        limit: 20,
      })).toEqual({ status: "unknown", target, reason: "ambiguous" });
    }
    expect(getMediaGenerationDetail({
      context: {
        sessionId: sessionB.id,
        consumerAuthority: consumerB.authority,
      },
      target: {
        type: "artifact-revision",
        id: soleInvisible.revision.id,
      },
      limit: 20,
    })).toEqual({
      status: "unknown",
      target: {
        type: "artifact-revision",
        id: soleInvisible.revision.id,
      },
      reason: "not-recorded",
    });
  });

  test("does not enumerate missing, sibling, or foreign immutable targets", async () => {
    root = makeTmpRoot("ralphy-media-generation-scope");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const foreignWorkspace = createWorkspace({ slug: "foreign", name: "Foreign" });
    const foreignProject = createProject({
      workspaceId: foreignWorkspace.id,
      slug: "foreign",
      name: "Foreign",
    });
    const siblingRevision = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: sibling.id,
      slug: "sibling",
    });
    const foreignRevision = await addMediaRevision({
      workspaceId: foreignWorkspace.id,
      projectId: foreignProject.id,
      slug: "foreign",
    });
    const siblingRun = startRun({ projectId: sibling.id, kind: "generation" });
    const siblingObject = recordRunObject({
      runId: siblingRun.id,
      path: "tmp/sibling.png",
      purpose: "result",
      state: "ready",
      retention: "working",
    });
    const foreignRun = startRun({ projectId: foreignProject.id, kind: "generation" });
    const foreignObject = recordRunObject({
      runId: foreignRun.id,
      path: "tmp/foreign.png",
      purpose: "result",
      state: "ready",
      retention: "working",
    });
    const context = { workspaceId: workspace.id, projectId: project.id };

    for (const id of [
      "arev_missing",
      siblingRevision.revision.id,
      foreignRevision.revision.id,
    ]) {
      expect(() => getMediaGenerationDetail({
        context,
        target: { type: "artifact-revision", id },
        limit: 20,
      })).toThrow(`Artifact Revision not found: ${id}`);
    }
    for (const id of ["runobj_missing", siblingObject.id, foreignObject.id]) {
      expect(() => getMediaGenerationDetail({
        context,
        target: { type: "run-object", id },
        limit: 20,
      })).toThrow(`RunObject not found: ${id}`);
    }
    expect(() => getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: siblingRevision.revision.id },
      after: encodeCursor("c1", { ordinal: 0, id: "attempt_test" }),
      limit: 20,
    })).toThrow(`Artifact Revision not found: ${siblingRevision.revision.id}`);
  });

  test("rejects malformed bounds, cursors, target kinds, and mismatched IDs", async () => {
    root = makeTmpRoot("ralphy-media-generation-invalid");
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const { revision } = await addMediaRevision({
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "hero",
    });
    const run = startRun({ projectId: project.id, kind: "generation" });
    recordRunResult(openDomainDb(), {
      runId: run.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: revision.id,
    });
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/output.png",
      purpose: "result",
      state: "ready",
      retention: "working",
    });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const target = { type: "artifact-revision" as const, id: revision.id };

    for (const limit of [0, 101]) {
      expect(() => getMediaGenerationDetail({ context, target, limit })).toThrow(
        "Limit must be an integer from 1 through 100",
      );
    }
    expect(() => getMediaGenerationDetail({
      context,
      target,
      after: encodeCursor("c1", { ordinal: 0, id: "attempt_test" }),
      limit: 20,
    })).toThrow("Cursor family is invalid");
    expect(() => getMediaGenerationDetail({
      context,
      target: { type: "object", id: "obj_private" } as never,
      limit: 20,
    })).toThrow("Media generation target is invalid");
    expect(() => getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: "" },
      limit: 20,
    })).toThrow("Media generation target is invalid");
    expect(() => getMediaGenerationDetail({
      context,
      target: { type: "artifact-revision", id: runObject.id },
      limit: 20,
    })).toThrow(`Artifact Revision not found: ${runObject.id}`);
    expect(() => getMediaGenerationDetail({
      context,
      target: { type: "run-object", id: revision.id },
      limit: 20,
    })).toThrow(`RunObject not found: ${revision.id}`);
  });
});
