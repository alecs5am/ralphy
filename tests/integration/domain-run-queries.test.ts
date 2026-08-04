import { afterEach, describe, expect, spyOn, test } from "bun:test";
import path from "node:path";
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
  getRun,
  getRunAttempt,
  listRunAttempts,
  listRuns,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
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
